export type ToolKind = 'port' | 'maps' | 'textures' | 'online' | 'cheats' | 'patch' | 'manager' | 'research';

export interface Tool {
  name: string;
  by: string;
  game: string; // games collection id
  kind: ToolKind;
  what: string;
  url: string;
  open: boolean; // source available
}

export const kinds: Record<ToolKind, string> = {
  port: 'Ports and engines',
  maps: 'Maps and conversion',
  textures: 'Textures and assets',
  online: 'Online',
  cheats: 'Trainers and RTE',
  patch: 'Patches and fixes',
  manager: 'Mod managers',
  research: 'Research and formats',
};

export const tools: Tool[] = [
  // Skate 3: ports
  { name: 'skate3recomp', by: 'mchughalex', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/mchughalex/skate3recomp', what: 'Native recompilation for Windows, Linux and macOS, with a D3D12/Vulkan renderer since v2.0.' },
  { name: 'SK8-Engine', by: 'Nakas', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/andrewnakas/SK8-Engine', what: 'The recompilation, extended toward an all-in-one cross-platform, multiplayer build.' },
  { name: 'Skate3-Mobile', by: 'Buku313', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/Buku313/Skate3-Mobile', what: 'ARM64 Android build with Vulkan rendering, shipped as one APK that uses your own ISO.' },
  { name: 'skate3-android', by: 'Nakas', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/andrewnakas/skate3-android', what: 'Android shell for the recomp: setup, map packs and GPU driver management.' },
  { name: 'skate3-ios-setup', by: 'Nakas', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/andrewnakas/skate3-ios-setup', what: 'Build the recompilation for iOS from your own disc image.' },
  { name: 'Skate 3 Rust engine', by: 'SK8-ENGINE', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/SK8-ENGINE/skate-3-rust-engine', what: 'Rust and Bevy reimplementation with .skate maps, a Lua mod SDK, vehicles and multiplayer mods.' },
  { name: 'Skate 3 clean room (web)', by: 'Nakas', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/andrewnakas/skate3-cleanroom', what: 'The Rust engine on WebGPU with a regenerated asset pack, playable in a browser.' },
  { name: 'skate3-quest-ar', by: 'Nakas', game: 'skate-3', kind: 'port', open: true, url: 'https://github.com/andrewnakas/skate3-quest-ar', what: 'The Rust engine on Meta Quest 3 in passthrough AR: a miniature skater in your room.' },
  // Skate 3: maps
  { name: 'Skate 3 Level Loader', by: 'Nakas', game: 'skate-3', kind: 'maps', open: true, url: 'https://github.com/andrewnakas/skate3-level-loader', what: 'Map library and launcher for the recomp. Import packs, then pick a map to boot into it.' },
  { name: 'PS3 → X360 transcoder', by: 'Nakas', game: 'skate-3', kind: 'maps', open: true, url: 'https://github.com/andrewnakas/skate3-ps3-to-x360', what: 'Rebuilds PS3 map streams in Xbox 360 form and packages standalone DLC.' },
  { name: 'PS3 Map Importer', by: 'randyadr, Nakas, Dumbads', game: 'skate-3', kind: 'maps', open: true, url: 'https://github.com/andrewnakas/skate3-ps3-map-importer', what: 'Windows GUI: drop a PS3 map archive, get an installable recomp .big.' },
  { name: 'DumbadsSkate3ModdingTools', by: 'Dumbads (Ethanw05)', game: 'skate-3', kind: 'maps', open: true, url: 'https://github.com/Ethanw05/DumbadsSkate3ModdingTools', what: 'ArenaBuilder, DlcBuilder and ChallengeEditor: read and write arenas, build DLC.' },
  { name: 'd2s3 studio', by: 'Nakas', game: 'skate-3', kind: 'maps', open: true, url: 'https://github.com/andrewnakas/d2s3-studio', what: 'Convert Descenders (Unity) maps into Skate 3 packs.' },
  { name: 'skatemods converter', by: 'skatemods', game: 'skate-3', kind: 'maps', open: true, url: 'https://github.com/andrewnakas/skatemods/tree/main/converter', what: 'Headless PS3 → recomp → .skate pipeline that powers this site\'s conversions.' },
  // Skate 3: other
  { name: 'Skate 3 Texture Tools', by: 'Shellywell123', game: 'skate-3', kind: 'textures', open: true, url: 'https://github.com/Shellywell123/Skate-3-Texture-Tools', what: 'Extract, convert and install texture mods on RPCS3 and Xenia.' },
  { name: 'Skate 3 RPCS3 File Manager', by: 'Shellywell123', game: 'skate-3', kind: 'manager', open: true, url: 'https://github.com/Shellywell123/Skate-3_RPCS3_File_Manager', what: 'Manage Skate 3 mod files in an RPCS3 install.' },
  { name: 'Skate 3 Blaze Server', by: 'skate6743', game: 'skate-3', kind: 'online', open: true, url: 'https://github.com/skate6743/Skate3BlazeServer', what: 'Emulated EA Blaze server for RPCS3: matchmaking, invites, Skate.Park sharing.' },
  { name: 'sk8trainer', by: 'Nakas', game: 'skate-3', kind: 'cheats', open: true, url: 'https://github.com/andrewnakas/sk8trainer', what: 'In-game trainer for the recomp: physics sliders, slow-mo, marker slots, auto-return on bail.' },
  { name: 'Skate3RTE', by: 'Jack06WS', game: 'skate-3', kind: 'cheats', open: true, url: 'https://github.com/Jack06WS/Skate3RTE', what: 'Real-time-editing tool for Skate 3 on RGH/JTAG Xbox 360.' },
  { name: 'skate3-audio', by: 'Nakas', game: 'skate-3', kind: 'research', open: true, url: 'https://github.com/andrewnakas/skate3-audio', what: 'RenderWare Audio decompilation tooling and container format docs.' },
  // Tony Hawk's
  { name: 'THUG Pro', by: 'Morten Larson, Quazz, %.Gone, Chase', game: 'tony-hawk-classic', kind: 'port', open: false, url: 'https://thpsx.com/thugpro-info/', what: 'THUG2 total conversion with levels from every Neversoft game, online play and custom levels.' },
  { name: 'PARTYMOD', by: 'PARTYMANX', game: 'tony-hawk-classic', kind: 'patch', open: true, url: 'https://partymod.newnet.city/', what: 'Fixes, SDL2 controllers, widescreen and OpenSpy online for THPS2 through THAW.' },
  { name: 'THPSPro (1+2)', by: 'THPSPro team', game: 'thps-1-2', kind: 'maps', open: false, url: 'https://www.nexusmods.com/tonyhawksproskater1and2/mods/121', what: 'Levels from THPS3 to Project 8 in the remake, plus a free-roam camera and unlocked cheats.' },
  { name: 'THPSPro (3+4)', by: 'THPSPro team', game: 'thps-3-4', kind: 'patch', open: false, url: 'https://www.nexusmods.com/tonyhawksproskater34/mods/1', what: 'Classic skaters, a free-roam camera and hidden cheats for the 2025 remake.' },
  // Sims
  { name: 'Session Mod Manager', by: 'rodriada000', game: 'session', kind: 'manager', open: true, url: 'https://github.com/rodriada000/SessionMapSwitcher', what: 'Install maps and textures, patch with the Illusory unlocker, switch maps in-game.' },
  // skate. (2025)
  { name: 'ReSkate', by: 'Dingo Shenanigans (zeex64)', game: 'skate-2025', kind: 'manager', open: true, url: 'https://github.com/Dingo-Shenanigans/ReSkate', what: 'Launcher, runtime and dedicated server (Windows and Linux): offline play on a pinned build, mods, a park editor, a trainer, Steam lobbies.' },
  { name: 'ReSkate Trainer', by: 'Nakas', game: 'skate-2025', kind: 'cheats', open: true, url: 'https://github.com/Dingo-Shenanigans/ReSkate/tree/main/Extension/Trainer', what: 'Built into ReSkate since 1.0.9: live physics tuning, presets as dials, practice markers, slow-mo and a jump read-out.' },
  { name: 'ReSkate Manager', by: 'xThrasherrr', game: 'skate-2025', kind: 'online', open: true, url: 'https://github.com/xThrasherrr/reskate-manager', what: 'Runs ReSkate dedicated servers and gives you a web panel to manage them.' },
  { name: 'docker-reskate-server', by: 'dudedankdave', game: 'skate-2025', kind: 'online', open: true, url: 'https://github.com/dudedankdave/docker-reskate-server', what: 'Docker image for the ReSkate dedicated server, configured with environment variables.' },
  { name: 'ReSkate Linux Setup', by: 'vitorioaugusto', game: 'skate-2025', kind: 'patch', open: true, url: 'https://github.com/vitorioaugusto/ReSkate-Linux-Setup', what: 'Sets up skate. and ReSkate on Linux in a Wine prefix with VKD3D-Proton and DXVK.' },
  { name: 'ReSkate Thunderstore', by: 'ReSkate community', game: 'skate-2025', kind: 'maps', open: false, url: 'https://thunderstore.io/c/reskate/', what: 'Custom maps, cosmetics and scripts for ReSkate. The launcher browses it directly.' },
  { name: 'Unity Mod Manager', by: 'newman55', game: 'skater-xl', kind: 'manager', open: true, url: 'https://www.nexusmods.com/site/mods/21', what: 'The loader behind Skater XL script mods. Use the latest version.' },
  { name: 'XLMultiplayer (archived)', by: 'silentbaws', game: 'skater-xl', kind: 'online', open: true, url: 'https://github.com/silentbaws/XLMultiplayer', what: 'Community multiplayer before the official version. Retired May 2021.' },
  { name: 'Skater XL mapping wiki', by: 'SkaterXLModding', game: 'skater-xl', kind: 'research', open: true, url: 'https://github.com/SkaterXLModding/skater-xl-mapping-wiki/wiki/Map-Scripting', what: 'How to build and script Skater XL maps in Unity.' },
];
