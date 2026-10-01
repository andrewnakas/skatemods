/**
 * Skate 3 modding history. Every entry needs a source; dates are as precise as
 * the source allows ("2014" when only the year is known).
 */
export type Era = 'retail' | 'console' | 'emulator' | 'native' | 'convert';

export interface Event {
  date: string; // ISO-ish: YYYY, YYYY-MM or YYYY-MM-DD
  era: Era;
  title: string;
  body: string;
  who?: string;
  source: string;
}

export const eras: Record<Era, { label: string; blurb: string }> = {
  retail: { label: 'Retail years', blurb: 'The game, its DLC and the servers.' },
  console: { label: 'Modded consoles', blurb: 'RGH/JTAG Xbox 360s and jailbroken PS3s: RTE tools, SPRX menus, the first custom parks.' },
  emulator: { label: 'Emulators', blurb: 'RPCS3 and Xenia make Skate 3 modding possible without modding a console.' },
  native: { label: 'Native ports', blurb: 'Static recompilation turns the Xbox 360 game into native PC, phone and web builds.' },
  convert: { label: 'Open tools and conversion', blurb: 'The world format, documented and writable: maps move between every platform.' },
};

export const timeline: Event[] = [
  {
    date: '2010-05-11', era: 'retail',
    title: 'Skate 3 launches',
    body: 'EA Black Box releases Skate 3 on PS3 and Xbox 360 (May 13 in Europe and Australia). It includes Port Carverton, the Skate.Park editor, online team modes and Hall of Meat.',
    source: 'https://en.wikipedia.org/wiki/Skate_3',
  },
  {
    date: '2010', era: 'retail',
    title: 'Seven DLC packs',
    body: 'Time Is Money, Maloof Money Cup, After Dark, San Van Party Pack, Skate.Create, Black Box Distribution Skate Park and Danny Way\'s Hawaiian Dream. The DLC slots later become the way community maps get into the game.',
    source: 'https://gist.github.com/hashtagskate4/15f2c8b5cb72ff034d2807291e733bb8',
  },
  {
    date: '2013', era: 'retail',
    title: 'EA Black Box closes',
    body: 'The studio behind skate, skate 2 and Skate 3 shuts down. The series goes dormant for over a decade.',
    source: 'https://en.wikipedia.org/wiki/Skate_(series)',
  },
  {
    date: '2014', era: 'retail',
    title: 'The YouTube resurgence',
    body: 'Let\'s Play channels turn the game\'s ragdoll physics and glitches into a meme. Demand is high enough that EA reprints discs.',
    source: 'https://en.wikipedia.org/wiki/Skate_3',
  },
  {
    date: '2015', era: 'retail',
    title: 'Servers go dark',
    body: 'Online play stops working with no announcement from EA.',
    source: 'https://www.kitguru.net/gaming/ryan-burgess/skate-3-servers-are-back-up-years-after-they-unofficially-shut-down/',
  },
  {
    date: '2016-11', era: 'retail',
    title: 'Xbox One backward compatibility',
    body: 'After a big fan campaign, Skate 3 becomes playable on Xbox One.',
    source: 'https://en.wikipedia.org/wiki/Skate_3',
  },
  {
    date: '2018-06', era: 'retail',
    title: 'Servers quietly return',
    body: 'Just before E3 2018, Skate 3 online comes back, again without an announcement.',
    source: 'https://www.kitguru.net/gaming/ryan-burgess/skate-3-servers-are-back-up-years-after-they-unofficially-shut-down/',
  },
  {
    date: '2010s', era: 'console',
    title: 'RTE tools and trainers on RGH/JTAG',
    body: 'Xbox 360 modders write real-time-editing tools and trainers that connect over JRPC/XDRPC. One "Skate mod tool" covers skate 1, 2 and 3.',
    source: 'https://www.se7ensins.com/forums/threads/skate-mod-tool-jrpc-xdrpc.1531417/',
  },
  {
    date: '2010s', era: 'console',
    title: 'SPRX menus on jailbroken PS3s',
    body: 'On CFW and HEN consoles, SPRX plugins add in-game mod menus (L3 + Left), and auto-installers patch Game Update 1.05 with unused backpacks, car models and freeplay skaters.',
    source: 'https://www.psx-place.com/threads/skate-3-all-in-one-modding-tool.38689/',
  },
  {
    date: '2010s', era: 'console',
    title: 'The first custom parks',
    body: 'PS3 modders build custom maps by taking over DLC park slots. EA\'s Stream File Tool writes only the stream files, so almost every community map reuses the Black Box park\'s manifests and shares its tile grid. Most custom maps are PS3-only for years.',
    source: 'https://github.com/andrewnakas/d2s3-studio',
  },
  {
    date: '2021-02', era: 'emulator',
    title: 'Skate 3 Texture Tools',
    body: 'A command-line pipeline for texture mods on RPCS3 and Xenia: character creation, Park Creator objects, menus, skies and ground. It builds on GHFear\'s tutorials, with hex help from dustpancake.',
    who: 'Shellywell123',
    source: 'https://github.com/Shellywell123/Skate-3-Texture-Tools',
  },
  {
    date: '2022-07', era: 'console',
    title: 'Skate3RTE goes open source',
    body: 'An open-source real-time-editing tool for Skate 3 on RGH/JTAG Xbox 360s.',
    who: 'Jack06WS',
    source: 'https://github.com/Jack06WS/Skate3RTE',
  },
  {
    date: '2026-02', era: 'emulator',
    title: 'A custom Blaze server',
    body: 'An emulated EA Blaze server brings back matchmaking, friend invites and Skate.Park uploads and downloads for RPCS3 players, with relay servers replacing peer-to-peer.',
    who: 'skate6743',
    source: 'https://github.com/skate6743/Skate3BlazeServer',
  },
  {
    date: '2026-05', era: 'convert',
    title: 'ArenaBuilder and DlcBuilder',
    body: 'Tools that read and write Skate 3\'s RenderWare arenas (meshes, textures, collision, Xenos tiling) and turn a world plus spawns and challenges into a complete DLC tree. Their June 17 commit adds the Xbox 360 target that later conversions depend on.',
    who: 'Dumbads (Ethanw05)',
    source: 'https://github.com/andrewnakas/skate3-ps3-map-importer',
  },
  {
    date: '2026-05-27', era: 'native',
    title: 'First recomp bring-up',
    body: 'A custom ReXGlue build starts bringing up Skate 3 as a static recompilation.',
    who: 'portingpete',
    source: 'https://github.com/portingpete/skate3-recomp',
  },
  {
    date: '2026-06-04', era: 'native',
    title: 'skate3recomp v1.0',
    body: 'A native recompilation of the Xbox 360 game for Windows, Linux and macOS, built on the rexglue SDK. All DLC works. It gets 1,400+ stars within months.',
    who: 'Alex McHugh (mchughalex)',
    source: 'https://github.com/mchughalex/skate3recomp',
  },
  {
    date: '2026-06-17', era: 'native',
    title: 'Skate 3 on Android',
    body: 'An ARM64 recompilation with Vulkan rendering: one APK, your own ISO.',
    who: 'Buku313',
    source: 'https://github.com/Buku313/Skate3-Mobile',
  },
  {
    date: '2026-07-24', era: 'native',
    title: 'Native renderer (v2.0)',
    body: 'skate3recomp replaces GPU emulation with a native Direct3D 12 and Vulkan renderer: over twice the frame rate at about a quarter of the GPU power, and close to 10× on Apple Silicon.',
    who: 'Alex McHugh',
    source: 'https://github.com/mchughalex/skate3recomp',
  },
  {
    date: '2026-08-17', era: 'convert',
    title: 'Skate 3 Level Loader',
    body: 'A launcher that owns map selection: import any number of DLC packs, click a map and boot straight into it. It ships a catalog of 43 known packs and 134 maps, each tested for whether it loads or hangs.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/skate3-level-loader',
  },
  {
    date: '2026-08-18', era: 'convert',
    title: 'PS3 → Xbox 360 transcoder',
    body: 'Rebuilds PS3 streams in Xbox 360 form, verified against EA\'s own builds of University: 5,000+ meshes byte-identical. Custom maps that only ran on modded PS3s can now run on the PC port.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/skate3-ps3-to-x360',
  },
  {
    date: '2026-08-22', era: 'convert',
    title: 'Descenders maps in Skate 3',
    body: 'Converts Unity scenes into Skate 3 worlds, and documents how to synthesize the stream manifests EA\'s tool never wrote.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/d2s3-studio',
  },
  {
    date: '2026-08-24', era: 'native',
    title: 'Skate 3 on iOS',
    body: 'Build the recompilation for iPhone and iPad from your own disc image.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/skate3-ios-setup',
  },
  {
    date: '2026-08-25', era: 'convert',
    title: 'The GUI map importer',
    body: 'A drag-and-drop Windows importer around the converter. Through v1.16 it adds nested-archive discovery, Location groups, a DLC manager and lightmap repair.',
    who: 'randyadr',
    source: 'https://github.com/andrewnakas/skate3-ps3-map-importer',
  },
  {
    date: '2026-09-08', era: 'native',
    title: 'Skate 3 Rust engine',
    body: 'A Rust and Bevy reimplementation built from reverse-engineering research. It has its own portable .skate map format, Lua mods, vehicles and a multiplayer SDK.',
    who: 'SK8-ENGINE',
    source: 'https://github.com/SK8-ENGINE/skate-3-rust-engine',
  },
  {
    date: '2026-09-11', era: 'convert',
    title: 'RenderWare Audio documented',
    body: 'Decompilation tooling and container docs for Skate 3\'s audio, with sample-exact conversion.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/skate3-audio',
  },
  {
    date: '2026-09-15', era: 'convert',
    title: 'skate. (2025) maps → Skate 3',
    body: 'A pipeline that brings map geometry from the new Frostbite game into Skate 3, starting with the Isle of Grom.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/skate4mapsconversionpipeline',
  },
  {
    date: '2026-09-27', era: 'convert',
    title: 'New San Van converts whole',
    body: 'Importer v1.17 converts the full skate 2 city mod: 41,893 arenas, none refused, with all 45 original freeskate spots as Locations.',
    who: 'Nakas & randyadr',
    source: 'https://github.com/andrewnakas/skate3-ps3-map-importer',
  },
  {
    date: '2026-09-28', era: 'native',
    title: 'Clean-room web build',
    body: 'The Rust engine compiled to WebAssembly and WebGPU, with every texture regenerated so no retail pixels ship. You can play it in a browser tab.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/skate3-cleanroom',
  },
  {
    date: '2026-10-01', era: 'convert',
    title: 'skatemods.com: conversion in the cloud',
    body: 'An open-source hub where uploaded maps convert automatically to every Skate 3 platform: PS3 → recomp → .skate, on free CI runners with no game data.',
    source: 'https://github.com/andrewnakas/skatemods',
  },
];

export function formatDate(d: string): string {
  if (/^\d{4}s$/.test(d)) return d;
  const [y, m, day] = d.split('-').map(Number);
  if (!m) return String(y);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return day ? `${month} ${day}, ${y}` : `${month} ${y}`;
}
