import { getCollection } from 'astro:content';
import { getMods, indexable, type Mod } from '../lib/thunderstore';
import { inCategory, modCategories } from '../data/reskate-categories';
import { getReleases } from '../lib/reskate-releases';

// Public pages only: account, upload and admin screens are left out.
// <lastmod> is the date the page's content last changed, taken from the content itself. Pages with
// no such date (home, games, tools and the other hand-written pages) get no <lastmod>, rather than
// the build date: the site rebuilds every 6 hours, and a lastmod that always says "today" teaches
// search engines to ignore it. scripts/indexnow.mjs submits the URLs whose <lastmod> changed.
const undated = ['/', '/games/', '/maps/', '/history/people/', '/community/', '/tools/', '/recomp/', '/convert/', '/about/', '/policy/', '/face/'];
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const newest = (dates: (Date | string)[]) => (dates.length ? day(dates.map((d) => new Date(d).getTime()).reduce((a, b) => Math.max(a, b))) : undefined);
const modDate = (list: Mod[]) => newest(list.map((m) => m.updated));

export async function GET() {
  const [games, guides, faq, communities, blog, mods, releases] = await Promise.all([
    getCollection('games'), getCollection('guides'), getCollection('faq'), getCollection('communities'), getCollection('blog'), getMods(), getReleases(),
  ]);
  // Pages showing the current ReSkate release change whenever ReSkate ships one.
  const fresh = (updated: Date, tracks: boolean) => day(tracks && releases[0] && new Date(releases[0].date) > updated ? releases[0].date : updated);
  const guideDates = guides.map((g) => fresh(g.data.updated, g.data.latestReskate));
  const faqDates = faq.map((f) => fresh(f.data.updated, f.data.latestReskate));
  const blogDates = blog.map((b) => b.data.updated ?? b.data.date);
  const urls: [string, string | undefined][] = [
    ...undated.map((u): [string, undefined] => [u, undefined]),
    // Mod lists change when a mod is added or updated.
    ['/reskate/', modDate(mods)],
    ['/reskate/best/', modDate(mods)],
    ['/reskate/changelog/', newest(releases.map((r) => r.date))],
    ...modCategories.map((c): [string, string | undefined] => [`/reskate/${c.slug}/`, modDate(mods.filter((m) => inCategory(m, c)))]),
    ['/guides/', newest(guideDates)],
    ['/faq/', newest(faqDates)],
    ['/history/', newest(communities.map((c) => c.data.updated))],
    ['/blog/', newest(blogDates)],
    ...games.map((g): [string, undefined] => [`/games/${g.id}/`, undefined]),
    ...guides.map((g, i): [string, string] => [`/guides/${g.id}/`, guideDates[i]]),
    ...faq.map((f, i): [string, string] => [`/faq/${f.id}/`, faqDates[i]]),
    ...communities.map((c): [string, string] => [`/history/${c.id}/`, day(c.data.updated)]),
    ...blog.map((b, i): [string, string] => [`/blog/${b.id}/`, day(blogDates[i])]),
    ...releases.filter((r) => r.changes.length > 0 || r.notes).map((r): [string, string] => [`/reskate/changelog/${r.tag}/`, day(r.date)]),
    ...mods.filter(indexable).map((m): [string, string] => [m.path, day(m.updated)]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>https://skatemods.com${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
