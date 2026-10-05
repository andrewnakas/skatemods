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
    date: '2016-06-29', era: 'console',
    title: 'Skate mod tool for RGH/JTAG',
    body: 'A real-time-editing tool that talks to a modded Xbox 360 over JRPC/XDRPC, later updated to cover skate 1, 2 and 3. Its se7ensins thread passes 100,000 views.',
    who: 'NDx',
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
    body: 'An ARM64 recompilation with Vulkan rendering, shipped as one APK that uses your own ISO.',
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
    who: 'chasmlol & Dumbads (SK8-ENGINE)',
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
  {
    date: '2019-01-14', era: 'emulator',
    title: 'Skate 3 textures, cracked open',
    body: 'After months of researching EA\'s texture and model formats, GHFear publishes a walkthrough for extracting and modding Skate 3 textures on PS3 and RPCS3. Later texture tools build on it.',
    who: 'GHFear',
    source: 'https://www.youtube.com/watch?v=JG-TRIlTzpQ',
  },
  {
    date: '2020-05-31', era: 'emulator',
    title: 'Custom park swapper for RPCS3',
    body: 'A tool for managing several custom skatepark save sets on RPCS3, so players can trade parks as save files.',
    who: 'Shellywell123',
    source: 'https://github.com/Shellywell123/RPCS3_Skate3_Custom_Parks_Swapper',
  },
  {
    date: '2020-08-09', era: 'emulator',
    title: 'CH3AT, a trainer for RPCS3',
    body: 'A Skate 3 trainer that runs alongside RPCS3, tested on both the US (BLUS30464) and European (BLES00760) releases.',
    who: 'ckosmic',
    source: 'https://github.com/ckosmic/CH3AT',
  },
  {
    date: '2020-10', era: 'emulator',
    title: 'The first open custom server attempt',
    body: 'Skateboard3Server sets out to build a custom server compatible with Skate 3. It gets as far as authentication, and the groundwork is public.',
    who: 'hallofmeat',
    source: 'https://github.com/hallofmeat/Skateboard3Server',
  },
  {
    date: '2022-07', era: 'emulator',
    title: 'Skate 3 Graphics Editor',
    body: 'S3GE injects custom board graphics into a running RPCS3 game.',
    who: 'devHazz',
    source: 'https://github.com/devHazz/s3ge',
  },
  {
    date: '2022-11-17', era: 'console',
    title: 'All In One Modding Tool',
    body: 'A PS3 app that installs and uninstalls the EA SKATE MODDING team\'s SPRX menu in one step. It comes bundled with wispp\'s unused backpack and car model mods.',
    who: 'Grim Doe, EA SKATE MODDING, wispp',
    source: 'http://web.archive.org/web/20251229022405/https://www.psx-place.com/threads/skate-3-all-in-one-modding-tool.38689/',
  },
  {
    date: '2023-12-22', era: 'emulator',
    title: 'RW4ArchiveTool',
    body: 'Parses, unpacks and repacks EA\'s RenderWare 4 archives across the skate games, including PS3 stream files, PS3 .psg arenas and Xbox 360 .rx2 arenas.',
    who: 'GHFear',
    source: 'https://github.com/GHFear/RW4ArchiveTool',
  },
  {
    date: '2026-04-21', era: 'convert',
    title: 'GLB 2 ARENA',
    body: 'Any GLB or glTF model becomes a game-ready Skate 3 mesh for PS3 or Xbox 360, so custom objects become a drag-and-drop job.',
    who: 'SunJay',
    source: 'https://github.com/SunJaycy/sk83.GLB2ARENA',
  },
  {
    date: '2026-05-29', era: 'convert',
    title: 'Custom challenges',
    body: 'ChallengeEditor can now author Game of S.K.A.T.E. and race challenges, so maps can ship with their own goals.',
    who: 'Dumbads (Ethanw05)',
    source: 'https://github.com/Ethanw05/DumbadsSkate3ModdingTools',
  },
  {
    date: '2026-07-21', era: 'emulator',
    title: 'skate and skate 2 back online',
    body: 'A fork of the Arcadia server adapted for the first two games, with dedicated lobby servers. It ships with a server-IP changer for HEN and CFW PS3s.',
    who: 'skate6743 (wispp)',
    source: 'https://github.com/skate6743/arcadia-skate',
  },
  {
    date: '2026-08-18', era: 'native',
    title: 'SK8 Engine preview',
    body: 'A world, rendering, physics and Blender map-authoring layer built on top of skate3recomp.',
    who: 'chasmlol',
    source: 'https://github.com/SK8-ENGINE/SK8-Engine',
  },
  {
    date: '2026-08-25', era: 'convert',
    title: 'An in-game custom maps browser',
    body: 'A self-hostable, read-only catalog server for browsing and downloading .skate maps from inside the game.',
    who: 'chasmlol',
    source: 'https://github.com/chasmlol/skate3-custom-maps-backend',
  },
  {
    date: '2026-09-15', era: 'native',
    title: 'Skate3-Mobile 2.1',
    body: 'The Android build merges runtime, audio, rendering and lifecycle fixes from Nakas and other contributors. AlanConstantino integrates them and tests on a Retroid Pocket 6.',
    who: 'Buku313, AlanConstantino, Nakas',
    source: 'https://github.com/Buku313/Skate3-Mobile',
  },
  {
    date: '2026-09-29', era: 'native',
    title: 'Skate 3 on a jailbroken PS4',
    body: 'The Xbox 360 game, statically recompiled, runs natively on a jailbroken PS4 as a homebrew package.',
    who: 'OnlyMoisties',
    source: 'https://github.com/OnlyMoisties/skate3-ps4',
  },
  {
    date: '2026-09-29', era: 'native',
    title: 'SK8TRAINER',
    body: 'A trainer built into the recomp, inspired by CH3AT for RPCS3.',
    who: 'Nakas',
    source: 'https://github.com/andrewnakas/sk8trainer',
  },
  {
    date: '2015-08-09', era: 'console',
    title: 'An RTM tool for PS3',
    body: 'A real-time-modding tool for DEX and CEX PS3s, shared alongside a 100% save, is one of the earliest dated Skate 3 PS3 mods on YouTube.',
    who: 'Activistic',
    source: 'https://www.youtube.com/watch?v=JDh49wh312w',
  },
  {
    date: '2017-03-19', era: 'console',
    title: 'An on-console trainer',
    body: 'A trainer that loads as a plugin on modded Xbox 360s and opens with D-pad up and Start, so you don\'t need a PC while you play.',
    who: 'NDx',
    source: 'https://www.se7ensins.com/forums/threads/skate-3-trainer.1629961/',
  },
  {
    date: '2017-09-21', era: 'console',
    title: 'Skate 3 offsets go public',
    body: 'Memory offsets for effects like slow motion, big entities and HUD colors are posted publicly, so any tool author can use them, with a request for credit.',
    who: 'Cult Crew, Skyline xL',
    source: 'https://www.se7ensins.com/forums/threads/new-skate-3-offset-release.1673056/',
  },
  {
    date: '2020-06-25', era: 'emulator',
    title: 'The EA Skate Modding Discord',
    body: 'The server that becomes the scene\'s main hub for RPCS3 mods, menus and map ports ("Best place to be for Skate 3 mods!"). By October 2026 it has over 86,000 members. The date comes from the server\'s ID.',
    source: 'https://discord.com/invite/aQxCHpdH2M',
  },
  {
    date: '2021-05-07', era: 'emulator',
    title: 'S3M, a mod menu for RPCS3',
    body: 'A customizable fly mode and other mods in a menu built for the emulator, released as a beta through the EA Skate Modding Discord after a showcase in April.',
    who: 'wispp (skate6743)',
    source: 'https://www.youtube.com/watch?v=2JMoR7x5XDE',
  },
  {
    date: '2021-10-10', era: 'console',
    title: 'An SPRX menu for HEN and CFW',
    body: 'wispp releases a Skate 3 SPRX mod menu for jailbroken PS3s. The latest versions are shared on the modding Discord.',
    who: 'wispp (skate6743)',
    source: 'https://www.youtube.com/watch?v=DVKPCZG0K-0',
  },
  {
    date: '2022-03-02', era: 'emulator',
    title: 'The Native Menu',
    body: 'A mod menu drawn by the game itself, so it works in fullscreen. As the Skate 3 Native Menu, it becomes a popular way to load mods on RPCS3.',
    who: 'wispp (skate6743)',
    source: 'https://www.youtube.com/watch?v=EuQUM_Ez2cw',
  },
  {
    date: '2022-07-28', era: 'emulator',
    title: 'The realistic ragdoll mod',
    body: 'A ragdoll tweak found by The Mad Man and exposed in S3M\'s adjustables tab. The showcase passes 179,000 views.',
    who: 'The Mad Man, wispp',
    source: 'https://www.youtube.com/watch?v=ewxUfeiz2NY',
  },
  {
    date: '2023-03-22', era: 'emulator',
    title: 'San Vanelona comes to Skate 3',
    body: 'Skate 2\'s city, ported into Skate 3. The credits include tuukkas, Pinetri, GHFear, wispp, TallyMark and others, and the rebuild keeps growing through 2023.',
    who: 'tuukkas, GHFear, wispp and others',
    source: 'https://www.youtube.com/watch?v=9-s0DX1-RKo',
  },
  {
    date: '2023-09-14', era: 'emulator',
    title: 'Skate 2 DLC maps',
    body: 'The Skate 2 DLC maps follow the base city into Skate 3.',
    source: 'https://www.youtube.com/watch?v=UmwXW0vIoTU',
  },
  {
    date: '2023-11-26', era: 'convert',
    title: 'The skate file formats, documented',
    body: 'The Skate Modding Team GitHub org starts documenting the arena format and later hosts a decompilation project and Fauxware4, a C# recreation of skate\'s RenderWare 4 tooling.',
    who: 'zombiedestroyer29',
    source: 'https://github.com/Skate-Modding-Team',
  },
  {
    date: '2024-09-26', era: 'convert',
    title: 'ArenaTest',
    body: 'Arena and texture code written by tuukkas in 2023–24 goes public. It underpins later map tools.',
    who: 'tuukkas',
    source: 'https://github.com/Skate-Modding-Team/ArenaTest',
  },
  {
    date: '2025-06-12', era: 'emulator',
    title: 'Skate 3 online on RPCS3',
    body: 'A proxy application gets RPCS3 players online together for the first time. A Skate RPCS3 Online Discord forms around it and passes 10,000 members.',
    who: 'wispp (skate6743)',
    source: 'https://www.youtube.com/watch?v=yxnVyy8E8zc',
  },
  {
    date: '2025-09-13', era: 'convert',
    title: 'The Dumbads & SunJays Discord',
    body: 'A server for the world-format and map-making work ("We mod Skate Games"), where ArenaBuilder, DlcBuilder and the PS3 importer are developed. The date comes from the server\'s ID.',
    who: 'Dumbads, SunJay',
    source: 'https://discord.com/invite/AgDEQFR2Jj',
  },
  {
    date: '2025-10-30', era: 'convert',
    title: 'Custom maps arrive',
    body: 'Fully custom maps, not ports, start appearing for Skate 3.',
    source: 'https://www.youtube.com/watch?v=3sKy9HIgvSs',
  },
  {
    date: '2026-05-02', era: 'convert',
    title: 'The skate 1 map in Skate 3',
    body: 'San Vanelona from the first game becomes playable in Skate 3 on RPCS3, shared through SunJay\'s modding Discord.',
    source: 'https://www.youtube.com/watch?v=4CYYmfZAuSk',
  },
  {
    date: '2026-09-27', era: 'native',
    title: 'Skate 3 inside MW2',
    body: 'A Rust rewrite mashup lets you drop onto a board with Skate 3\'s physics on any Modern Warfare 2 map. It goes viral within days.',
    who: 'chasmlol',
    source: 'https://github.com/chasmlol/2010-rust-rewrite-mashup',
  },
  {
    date: '2026-10-02', era: 'convert',
    title: 'Port Carverton in the new skate.',
    body: 'On ReSkate\'s launch day, the whole Skate 3 city goes up on Thunderstore as a map for EA\'s 2025 skate., and becomes the platform\'s most downloaded mod.',
    who: 'zeex64',
    source: 'https://thunderstore.io/c/reskate/p/zeex64/Full_Skate_3_Map/',
  },
];

export function formatDate(d: string): string {
  if (/^\d{4}s$/.test(d)) return d;
  const [y, m, day] = d.split('-').map(Number);
  if (!m) return String(y);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return day ? `${month} ${day}, ${y}` : `${month} ${y}`;
}
