import type { Mod } from '../lib/thunderstore';

/** ReSkate Thunderstore categories that get a landing page at /reskate/<slug>/. */
export interface ModCategory {
  slug: string;
  categories: string[]; // Thunderstore category names
  /** Also catch mods their authors left untagged (many maps are only tagged "Mods"). */
  untagged?: (m: Mod) => boolean;
  title: string; // page title and H1
  short: string; // link label
  description: string;
  lede: string;
}

export const modCategories: ModCategory[] = [
  {
    slug: 'maps',
    categories: ['Maps'],
    untagged: (m) =>
      !m.categories.some((c) => ['Cosmetics', 'Audio', 'Skateboards', 'Emotes', 'Camera Mods', 'Libraries'].includes(c)) &&
      /\b(map|skatepark|park|plaza|streets|level)\b/i.test(`${m.name} ${m.description}`) &&
      !/teleport|minimap|hud|overview|marker|radio|playlist|deck/i.test(`${m.name} ${m.description}`),
    title: 'ReSkate custom maps',
    short: 'Maps',
    description: 'Every custom map for skate. (Skate 4) on ReSkate: the full Skate 3 city, skate 2’s New San Vanelona, Skater XL ports and original parks, with install steps.',
    lede: 'Custom maps for skate. through ReSkate, most downloaded first: ports of Port Carverton and New San Vanelona, Skater XL spots and original parks. Install them from the launcher’s MODS page, then pick the map from the level list in the ReSkate menu (Insert).',
  },
  {
    slug: 'boards',
    categories: ['Skateboards'],
    title: 'ReSkate board graphics',
    short: 'Boards',
    description: 'Custom skateboard decks, griptape and wheels for skate. (Skate 4) on ReSkate, most downloaded first, with install steps.',
    lede: 'Custom decks, grip and wheels for skate. through ReSkate, most downloaded first. Install them from the launcher’s MODS page and they show up with the game’s own boards.',
  },
  {
    slug: 'cosmetics',
    categories: ['Cosmetics'],
    title: 'ReSkate cosmetics and clothing',
    short: 'Cosmetics',
    description: 'Custom shoes, clothing and skater cosmetics for skate. (Skate 4) on ReSkate, most downloaded first, with install steps.',
    lede: 'Shoes, clothing and other skater cosmetics for skate. through ReSkate, most downloaded first. These are community-made. Mods that unlock EA’s paid items are against ReSkate’s rules.',
  },
  {
    slug: 'music',
    categories: ['Audio'],
    title: 'ReSkate music and soundtracks',
    short: 'Music',
    description: 'Soundtrack and audio mods for skate. (Skate 4) on ReSkate, including the Skate 3 soundtrack as a radio station, most downloaded first.',
    lede: 'Soundtracks and other audio mods for skate. through ReSkate, most downloaded first. Song mods show up in the game’s music screen next to the licensed stations, with their own playlists.',
  },
  {
    slug: 'modpacks',
    categories: ['Modpacks'],
    title: 'ReSkate modpacks',
    short: 'Modpacks',
    description: 'Modpacks for skate. (Skate 4) on ReSkate: bundles of maps, boards and tweaks you install in one go, most downloaded first.',
    lede: 'Bundles of maps, boards and tweaks for skate. through ReSkate, most downloaded first. Installing a pack from the launcher pulls in everything it lists.',
  },
];

export const inCategory = (m: Mod, c: ModCategory) => m.categories.some((x) => c.categories.includes(x)) || !!c.untagged?.(m);
