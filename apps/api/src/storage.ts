/**
 * Chunked uploads straight into R2 through the Worker binding: no S3 keys, no
 * presigned URLs. Each part is one request (Workers cap bodies at 100 MB).
 */
import type { Env } from './env';
import { fail, newId, now } from './util';

/** All parts but the last must be this size (R2 multipart rule: equal, >= 5 MiB). */
export const PART_SIZE = 50 * 1024 * 1024;

export interface FileRow {
  id: string;
  map_id: string;
  kind: 'original' | 'recomp' | 'skate' | 'log';
  name: string;
  r2_key: string;
  bytes: number;
  upload_id: string | null;
  complete: number;
}

export async function beginFile(env: Env, mapId: string, kind: FileRow['kind'], name: string, bytes: number) {
  const id = newId();
  const key = `maps/${mapId}/${kind}/${id}/${name}`;
  const upload = await env.MAPS.createMultipartUpload(key, {
    httpMetadata: { contentDisposition: `attachment; filename="${name}"` },
    customMetadata: { mapId, kind },
  });
  await env.DB.prepare(
    `INSERT INTO files (id, map_id, kind, name, r2_key, bytes, upload_id, complete, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).bind(id, mapId, kind, name, key, bytes, upload.uploadId, now()).run();
  return { fileId: id, partSize: PART_SIZE, parts: Math.max(1, Math.ceil(bytes / PART_SIZE)) };
}

export async function putPart(env: Env, file: FileRow, part: number, body: ReadableStream | null, length: number) {
  if (file.complete || !file.upload_id) fail(409, 'This file is already complete');
  const parts = Math.max(1, Math.ceil(file.bytes / PART_SIZE));
  if (!Number.isInteger(part) || part < 1 || part > parts) fail(400, `part must be 1..${parts}`);
  const expected = part < parts ? PART_SIZE : file.bytes - PART_SIZE * (parts - 1);
  if (length !== expected) fail(400, `part ${part} must be exactly ${expected} bytes`);
  if (!body) fail(400, 'empty body');

  const upload = env.MAPS.resumeMultipartUpload(file.r2_key, file.upload_id);
  // FixedLengthStream gives R2 the exact length up front, as it requires.
  const fixed = new FixedLengthStream(length);
  body.pipeTo(fixed.writable).catch(() => {});
  const uploaded = await upload.uploadPart(part, fixed.readable);
  await env.DB.prepare(
    `INSERT INTO file_parts (file_id, part, etag, bytes) VALUES (?, ?, ?, ?)
     ON CONFLICT(file_id, part) DO UPDATE SET etag = excluded.etag, bytes = excluded.bytes`,
  ).bind(file.id, part, uploaded.etag, length).run();
  return { part, etag: uploaded.etag };
}

export async function completeFile(env: Env, file: FileRow) {
  if (file.complete) return;
  if (!file.upload_id) fail(409, 'No upload in progress');
  const { results } = await env.DB.prepare('SELECT part, etag, bytes FROM file_parts WHERE file_id = ? ORDER BY part')
    .bind(file.id).all<{ part: number; etag: string; bytes: number }>();
  const parts = Math.max(1, Math.ceil(file.bytes / PART_SIZE));
  const total = results.reduce((n, p) => n + p.bytes, 0);
  if (results.length !== parts || total !== file.bytes) {
    fail(409, `Upload incomplete: ${results.length}/${parts} parts, ${total}/${file.bytes} bytes`);
  }
  const upload = env.MAPS.resumeMultipartUpload(file.r2_key, file.upload_id);
  await upload.complete(results.map((p) => ({ partNumber: p.part, etag: p.etag })));
  await env.DB.batch([
    env.DB.prepare('UPDATE files SET complete = 1, upload_id = NULL WHERE id = ?').bind(file.id),
    env.DB.prepare('DELETE FROM file_parts WHERE file_id = ?').bind(file.id),
  ]);
}

/** Small files (logs) in one request. */
export async function putSmallFile(env: Env, mapId: string, kind: FileRow['kind'], name: string, data: string) {
  const id = newId();
  const key = `maps/${mapId}/${kind}/${id}/${name}`;
  await env.MAPS.put(key, data, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  await env.DB.prepare(
    `INSERT INTO files (id, map_id, kind, name, r2_key, bytes, upload_id, complete, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?)`,
  ).bind(id, mapId, kind, name, key, new TextEncoder().encode(data).length, now()).run();
}

export async function deleteMapObjects(env: Env, mapId: string) {
  const { results } = await env.DB.prepare('SELECT r2_key, upload_id FROM files WHERE map_id = ?')
    .bind(mapId).all<{ r2_key: string; upload_id: string | null }>();
  for (const f of results) {
    if (f.upload_id) await env.MAPS.resumeMultipartUpload(f.r2_key, f.upload_id).abort().catch(() => {});
  }
  const keys = results.map((f) => f.r2_key);
  for (let i = 0; i < keys.length; i += 1000) await env.MAPS.delete(keys.slice(i, i + 1000));
}
