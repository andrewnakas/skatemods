/**
 * Where each scene talks. Discord invites must be public and permanent; member counts are
 * fetched from Discord's public invite API at build time, so every deploy refreshes them.
 */
export interface Hub {
  name: string;
  game: string; // games collection id
  scene?: string; // communities collection id, for the history link
  what: string;
  invite?: string; // Discord invite code
  url?: string; // non-Discord home (forum, mod portal)
  kind: 'discord' | 'mods' | 'forum';
}

export const hubs: Hub[] = [
  { name: 'ReSkate', game: 'skate-2025', scene: 'reskate', kind: 'discord', invite: 'Tkd5D2Y6EX', what: 'The ReSkate platform for skate. (2025): releases, help, bug reports and new mods.' },
  { name: 'Dumbads & SunJays Skate3 Modding', game: 'skate-3', scene: 'skate-3', kind: 'discord', invite: 'AgDEQFR2Jj', what: 'Where Skate 3\'s world format became writable. Custom maps, arena tools and the PS3 → recomp importer.' },
  { name: 'EA Skate Modding', game: 'skate-3', scene: 'skate-3', kind: 'discord', invite: 'aQxCHpdH2M', what: 'The biggest skate modding server, open since 2020. Skate 3 on every platform, emulators and the recomp.' },
  { name: 'Illusory', game: 'session', scene: 'session', kind: 'discord', invite: 'Mt3qzgN', what: 'Home of the Unreal Mod Unlocker that Session Mod Manager uses, and a large Unreal modding community.' },
  { name: 'Session (crea-ture Studios)', game: 'session', scene: 'session', kind: 'discord', invite: 'session', what: 'The official Session: Skate Sim server, with channels for maps and mods.' },
  { name: 'THPSPro', game: 'thps-1-2', scene: 'thps-pro', kind: 'discord', invite: 'G9A8xWq9Hw', what: 'Mods for the THPS 1+2 and 3+4 remakes, and the THPSPro project.' },
  { name: '10K Rising', game: 'tony-hawk-classic', scene: 'rethawed', kind: 'discord', invite: 'rethawed', what: 'Home of reTHAWed, the THAW total conversion: releases, mods, online sessions and help.' },
  { name: 'THUG Pro community', game: 'tony-hawk-classic', scene: 'thug-pro', kind: 'discord', invite: 'KateaQP', what: 'The Discord linked from thugpro.com: online sessions, custom levels and help.' },
  { name: 'ReSkate Thunderstore', game: 'skate-2025', kind: 'mods', url: 'https://thunderstore.io/c/reskate/', what: 'Every ReSkate mod, browsable here on skate. mods or in the ReSkate launcher.' },
  { name: 'Skater XL on mod.io', game: 'skater-xl', scene: 'skater-xl', kind: 'mods', url: 'https://mod.io/g/skaterxl', what: 'Maps and gear for Skater XL, also available in the game\'s own Mod Browser.' },
  { name: 'reTHAWed mod depository', game: 'tony-hawk-classic', scene: 'rethawed', kind: 'mods', url: 'https://thpsgoat.com/mods', what: 'Custom skaters, decks, Create-a-Skater items and levels for reTHAWed, hosted by thpsGoat.' },
  { name: 'THPSX forums', game: 'tony-hawk-classic', scene: 'thug-pro', kind: 'forum', url: 'https://thpsx.com/', what: 'The long-running Tony Hawk\'s community site, with forums, the THPSX podcast and THUG Pro history.' },
];

export interface HubStats { members?: number; online?: number; icon?: string }

/** Member and online counts plus the server icon, or nothing if Discord can't be reached. */
export async function hubStats(invite: string): Promise<HubStats> {
  try {
    const res = await fetch(`https://discord.com/api/v9/invites/${invite}?with_counts=true`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return {};
    const d = await res.json();
    const g = d.guild ?? {};
    return {
      members: d.approximate_member_count,
      online: d.approximate_presence_count,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96` : undefined,
    };
  } catch {
    return {};
  }
}
