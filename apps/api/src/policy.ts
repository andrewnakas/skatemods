/**
 * What may be uploaded. The uploader declares rights; the runner checks the
 * content (converter/policy.py); a moderator approves before anything is public.
 */
import { fail } from './util';

export const LICENSES = {
  'cc-by-4.0': 'CC BY 4.0: share and adapt with credit',
  'cc-by-nc-4.0': 'CC BY-NC 4.0: share and adapt with credit, non-commercial',
  'cc-by-nd-4.0': 'CC BY-ND 4.0: share with credit, no modified versions',
  'cc0': 'CC0: public domain',
  'share-with-credit': 'Free to share unmodified with credit; all other rights reserved',
} as const;
export type License = keyof typeof LICENSES;

export const PLATFORMS = ['ps3', 'x360', 'skate', 'unknown'] as const;
export const REPORT_REASONS = ['copyright', 'stolen', 'retail_assets', 'malware', 'broken', 'other'] as const;

export const ACCEPTED_EXTENSIONS = ['.zip', '.7z', '.rar', '.big', '.edat', '.skate'];

export interface NewMap {
  title: string;
  description: string;
  authorCredit: string;
  rights: 'author' | 'permission';
  permissionNote: string;
  license: License;
  sourcePlatform: (typeof PLATFORMS)[number];
  fileName: string;
  fileBytes: number;
  attest: { rights: boolean; noRetail: boolean; terms: boolean };
}

const str = (v: unknown, field: string, min: number, max: number): string => {
  if (typeof v !== 'string') fail(400, `${field} is required`);
  const s = v.trim();
  if (s.length < min) fail(400, min > 1 ? `${field} must be at least ${min} characters` : `${field} is required`);
  if (s.length > max) fail(400, `${field} must be at most ${max} characters`);
  return s;
};

export function parseNewMap(body: any, maxBytes: number): NewMap {
  if (!body || typeof body !== 'object') fail(400, 'expected a JSON body');
  const attest = body.attest ?? {};
  if (attest.rights !== true) fail(400, 'You must confirm you made this map or have the author\'s permission');
  if (attest.noRetail !== true) fail(400, 'You must confirm the map does not redistribute retail game content');
  if (attest.terms !== true) fail(400, 'You must accept the upload policy');

  const rights = body.rights;
  if (rights !== 'author' && rights !== 'permission') fail(400, 'rights must be "author" or "permission"');
  const permissionNote = rights === 'permission'
    ? str(body.permissionNote, 'Permission details', 20, 1000)
    : '';

  const license = body.license as License;
  if (!(license in LICENSES)) fail(400, 'pick a license');
  const sourcePlatform = PLATFORMS.includes(body.sourcePlatform) ? body.sourcePlatform : 'unknown';

  const fileName = str(body.fileName, 'File name', 1, 200);
  const lower = fileName.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((e) => lower.endsWith(e))) {
    fail(400, `Upload a ${ACCEPTED_EXTENSIONS.join(', ')} file`);
  }
  const fileBytes = Number(body.fileBytes);
  if (!Number.isInteger(fileBytes) || fileBytes <= 0) fail(400, 'fileBytes must be a positive integer');
  if (fileBytes > maxBytes) fail(413, `Maps are limited to ${Math.round(maxBytes / 2 ** 30)} GB`);

  return {
    title: str(body.title, 'Title', 3, 80),
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '',
    authorCredit: str(body.authorCredit, 'Original author', 2, 120),
    rights,
    permissionNote,
    license,
    sourcePlatform,
    fileName,
    fileBytes,
    attest,
  };
}
