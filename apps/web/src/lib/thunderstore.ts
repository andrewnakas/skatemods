/**
 * Build-time access to the ReSkate Thunderstore. One fetch of the package list per build,
 * shared by /reskate/, the per-mod pages, the home page and the sitemap.
 */
import { Marked } from 'marked';

const LIST = 'https://thunderstore.io/c/reskate/api/v1/package/';

export interface Mod {
  owner: string;
  slug: string; // package name as Thunderstore spells it (underscores)
  name: string; // display name
  fullName: string; // owner-slug
  path: string; // our page
  thunderstore: string;
  icon: string;
  description: string;
  downloads: number;
  created: string;
  updated: string;
  version: string;
  versions: number;
  size: number;
  downloadUrl: string;
  website: string;
  categories: string[];
  dependencies: string[]; // full names without version, e.g. "zeex64-Full_Skate_3_Map"
}

let cache: Promise<Mod[]> | undefined;

/** Every current, non-NSFW mod. Empty if Thunderstore can't be reached (the build still succeeds). */
export function getMods(): Promise<Mod[]> {
  cache ??= fetch(LIST, { signal: AbortSignal.timeout(20000) })
    .then((r) => r.json())
    .then((packages: any[]) => packages.filter((p) => !p.is_deprecated && !p.has_nsfw_content && p.versions?.length).map(toMod))
    .catch(() => []);
  return cache;
}

function toMod(p: any): Mod {
  const v = p.versions[0];
  return {
    owner: p.owner,
    slug: p.name,
    name: p.name.replace(/_/g, ' '),
    fullName: p.full_name,
    path: `/reskate/${p.owner}/${p.name}/`,
    thunderstore: p.package_url,
    icon: v.icon,
    description: v.description,
    downloads: p.versions.reduce((n: number, x: any) => n + x.downloads, 0),
    created: p.date_created,
    updated: p.date_updated,
    version: v.version_number,
    versions: p.versions.length,
    size: v.file_size,
    downloadUrl: v.download_url,
    website: v.website_url ?? '',
    categories: p.categories ?? [],
    dependencies: (v.dependencies ?? []).map((d: string) => d.replace(/-[\d.]+$/, '')),
  };
}

/** The mod's README as Markdown, or '' if it can't be fetched. */
export async function getReadme(m: Mod): Promise<string> {
  const url = `https://thunderstore.io/api/experimental/package/${m.owner}/${m.slug}/${m.version}/readme/`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.status === 404) return '';
      if (r.ok) return ((await r.json()).markdown as string) ?? '';
    } catch {}
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return '';
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeUrl = (u: string) => (/^(https?:|\/|#|mailto:)/i.test(u.trim()) ? u : '#');

// READMEs are third-party: raw HTML is shown as text, links and images must be http(s),
// and headings drop a level so the page keeps one h1.
const md = new Marked({
  gfm: true,
  renderer: {
    html({ text }) { return escape(text); },
    heading({ tokens, depth }) {
      const level = Math.min(6, depth + 1);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    link({ href, title, tokens }) {
      const t = title ? ` title="${escape(title)}"` : '';
      return `<a href="${escape(safeUrl(href))}"${t} rel="nofollow ugc noopener">${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, text }) {
      if (!/^https:/i.test(href)) return '';
      return `<img src="${escape(href)}" alt="${escape(text)}" loading="lazy" decoding="async" />`;
    },
  },
});

export function renderReadme(markdown: string): string {
  return md.parse(markdown, { async: false }) as string;
}

/** A readme whose first heading just repeats the mod name adds nothing; drop it. */
export function stripTitle(markdown: string, m: Mod): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return markdown.replace(/^\s*#{1,3}\s+(.+?)\s*(\n|$)/, (line, h) => (norm(h) === norm(m.name) || norm(h) === norm(m.slug) ? '' : line));
}

/** True when a README has real content beyond headings and whitespace. */
export function hasBody(markdown: string): boolean {
  return markdown.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().length >= 40;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
