import { getCollection } from 'astro:content';
import { getMods, indexable } from '../lib/thunderstore';
import { modCategories } from '../data/reskate-categories';
import { getReleases } from '../lib/reskate-releases';

// Public pages only: account, upload and admin screens are left out.
const pages = ['/', '/games/', '/maps/', '/reskate/', '/reskate/best/', '/reskate/changelog/', ...modCategories.map((c) => `/reskate/${c.slug}/`), '/guides/', '/faq/', '/history/', '/history/people/', '/blog/', '/community/', '/tools/', '/recomp/', '/convert/', '/about/', '/policy/', '/face/'];
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export async function GET() {
  const [games, guides, faq, communities, blog, mods, releases] = await Promise.all([
    getCollection('games'), getCollection('guides'), getCollection('faq'), getCollection('communities'), getCollection('blog'), getMods(), getReleases(),
  ]);
  // Pages showing the current ReSkate release change whenever ReSkate ships one.
  const fresh = (updated: Date, tracks: boolean) => day(tracks && releases[0] && new Date(releases[0].date) > updated ? releases[0].date : updated);
  const today = day(new Date());
  const urls: [string, string][] = [
    ...pages.map((u): [string, string] => [u, today]),
    ...games.map((g): [string, string] => [`/games/${g.id}/`, today]),
    ...guides.map((g): [string, string] => [`/guides/${g.id}/`, fresh(g.data.updated, g.data.latestReskate)]),
    ...faq.map((f): [string, string] => [`/faq/${f.id}/`, fresh(f.data.updated, f.data.latestReskate)]),
    ...communities.map((c): [string, string] => [`/history/${c.id}/`, day(c.data.updated)]),
    ...blog.map((b): [string, string] => [`/blog/${b.id}/`, day(b.data.updated ?? b.data.date)]),
    ...releases.filter((r) => r.changes.length > 0 || r.notes).map((r): [string, string] => [`/reskate/changelog/${r.tag}/`, day(r.date)]),
    ...mods.filter(indexable).map((m): [string, string] => [m.path, day(m.updated)]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>https://skatemods.com${u}</loc><lastmod>${d}</lastmod></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
