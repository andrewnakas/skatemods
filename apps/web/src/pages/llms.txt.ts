import { getCollection } from 'astro:content';
import { getMods } from '../lib/thunderstore';

// llms.txt (https://llmstxt.org): a plain map of the site for AI assistants and answer engines.
export async function GET() {
  const [guides, faq, games, communities, blog, mods] = await Promise.all([
    getCollection('guides'), getCollection('faq'), getCollection('games'), getCollection('communities'), getCollection('blog'), getMods(),
  ]);
  const u = (p: string) => `https://skatemods.com${p}`;
  const line = (title: string, path: string, note: string) => `- [${title}](${u(path)}): ${note.replace(/\s+/g, ' ').trim()}`;
  const top = [...mods].sort((a, b) => b.downloads - a.downloads).slice(0, 25);

  const text = `# skatemods

> An open-source, player-run reference for modding every skate game: EA's skate. (2025, called "Skate 4" by fans) through ReSkate, Skate 3 (native PC recompilation, custom maps, PS3 to Xbox 360 map conversion), skate 2, the Tony Hawk's games (THUG Pro, PARTYMOD, THPS remakes), Skater XL and Session. Every guide links its sources. No game files are hosted.

Key facts:
- Skate 3 Online (${u('/skate-3-online/')}) plays Skate 3 free in the browser (Chrome or Edge 113+, WebGPU): a fan-made Rust engine rewrite with a clean-room asset pack, multiplayer rooms for up to 10 players and every community map with a .skate conversion. No download or disc. Not affiliated with EA.
- ReSkate (https://github.com/Dingo-Shenanigans/ReSkate) is the open-source (GPL-3.0) modding platform for skate. (2025). It runs one pinned Steam build offline with a community runtime: custom maps, mods from the ReSkate Thunderstore, a park editor, a trainer, Steam lobbies and dedicated servers (Windows and Linux). Released October 2, 2026.
- skate3recomp (https://github.com/mchughalex/skate3recomp) is a native recompilation of the Xbox 360 Skate 3 for Windows, Linux and macOS. You supply your own disc image.
- Every ReSkate mod has a page here with install steps: ${u('/reskate/')}

## Guides
${guides.sort((a, b) => a.data.order - b.data.order).map((g) => line(g.data.title, `/guides/${g.id}/`, g.data.description)).join('\n')}

## FAQ
${faq.sort((a, b) => a.data.order - b.data.order).map((f) => line(f.data.question, `/faq/${f.id}/`, f.data.answer)).join('\n')}

## Games
${games.sort((a, b) => a.data.order - b.data.order).map((g) => line(g.data.title, `/games/${g.id}/`, g.data.short)).join('\n')}

## Scene histories
${communities.sort((a, b) => a.data.order - b.data.order).map((c) => line(c.data.title, `/history/${c.id}/`, c.data.short)).join('\n')}

## Most downloaded skate. (ReSkate) mods
${top.map((m) => line(`${m.name} by ${m.owner}`, m.path, `${m.downloads.toLocaleString('en-US')} downloads. ${m.description}`)).join('\n')}

## Blog
${blog.sort((a, b) => b.data.date.getTime() - a.data.date.getTime()).map((p) => line(p.data.title, `/blog/${p.id}/`, p.data.description)).join('\n')}

## Optional
- [Skate 3 Online](${u('/skate-3-online/')}): play Skate 3 in your browser, solo or with up to 10 players
- [All skate. mods](${u('/reskate/')}): every ReSkate mod, refreshed from Thunderstore
- [Skate 3 maps](${u('/maps/')}): community Skate 3 maps converted for PS3, the PC recomp and the Rust engine
- [Tools](${u('/tools/')}): every modding tool by game
- [The people](${u('/history/people/')}): credits for everyone who built these scenes
- [Sitemap](${u('/sitemap.xml')})
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
