import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** How alive a game's modding scene is, as a reader would judge it. */
const scene = z.enum(['thriving', 'active', 'niche', 'locked']);

const games = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/games' }),
  schema: z.object({
    title: z.string(),
    short: z.string(),
    year: z.number(),
    developer: z.string(),
    engine: z.string(),
    platforms: z.array(z.string()),
    series: z.enum(['skate', 'tony-hawk', 'sim', 'indie']),
    scene,
    featured: z.boolean().default(false),
    order: z.number(),
    howToMod: z.array(z.string()).default([]),
    links: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    game: z.string(),
    level: z.enum(['beginner', 'intermediate', 'advanced']),
    order: z.number(),
    updated: z.coerce.date(),
  }),
});

export const collections = { games, guides };
