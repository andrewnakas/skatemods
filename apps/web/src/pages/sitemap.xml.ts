import { getCollection } from 'astro:content';
import { getMods, indexable } from '../lib/thunderstore';
import { modCategories } from '../data/reskate-categories';

// Public pages only: account, upload and admin screens are left out.
const pages = ['/', '/games/', '/maps/', '/reskate/', '/reskate/best/', '/reskate/changelog/', ...modCategories.map((c) => `/reskate/${c.slug}/`), '/guides/', '/faq/', '/history/', '/history/people/', '/blog/', '/community/', '/tools/', '/recomp/', '/skate-3-online/', '/convert/', '/about/', '/policy/', '/face/'];
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export async function GET() {
  const [games, guides, faq, communities, blog, mods] = await Promise.all([
    getCollection('games'), getCollection('guides'), getCollection('faq'), getCollection('communities'), getCollection('blog'), getMods(),
  ]);
  const today = day(new Date());
  const urls: [string, string][] = [
    ...pages.map((u): [string, string] => [u, today]),
    ...games.map((g): [string, string] => [`/games/${g.id}/`, today]),
    ...guides.map((g): [string, string] => [`/guides/${g.id}/`, day(g.data.updated)]),
    ...faq.map((f): [string, string] => [`/faq/${f.id}/`, day(f.data.updated)]),
    ...communities.map((c): [string, string] => [`/history/${c.id}/`, day(c.data.updated)]),
    ...blog.map((b): [string, string] => [`/blog/${b.id}/`, day(b.data.updated ?? b.data.date)]),
    ...mods.filter(indexable).map((m): [string, string] => [m.path, day(m.updated)]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>https://skatemods.com${u}</loc><lastmod>${d}</lastmod></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
