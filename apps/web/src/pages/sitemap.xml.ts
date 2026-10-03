import { getCollection } from 'astro:content';

// Public pages only: account, upload and admin screens are left out.
const pages = ['/', '/games/', '/maps/', '/reskate/', '/guides/', '/faq/', '/history/', '/history/people/', '/blog/', '/community/', '/tools/', '/recomp/', '/play/', '/convert/', '/about/', '/policy/'];

export async function GET() {
  const [games, guides, faq, communities, blog] = await Promise.all([
    getCollection('games'), getCollection('guides'), getCollection('faq'), getCollection('communities'), getCollection('blog'),
  ]);
  const urls = [
    ...pages,
    ...games.map((g) => `/games/${g.id}/`),
    ...guides.map((g) => `/guides/${g.id}/`),
    ...faq.map((f) => `/faq/${f.id}/`),
    ...communities.map((c) => `/history/${c.id}/`),
    ...blog.map((b) => `/blog/${b.id}/`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>https://skatemods.com${u}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
