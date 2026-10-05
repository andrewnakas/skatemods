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
    /** What the reader needs to get, shown as a box at the top of the guide. */
    downloads: z.array(z.object({ label: z.string(), url: z.string(), note: z.string().optional() })).default([]),
  }),
});

const source = z.string().url();

const faq = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/faq' }),
  schema: z.object({
    question: z.string(),
    /** One or two sentences; shown on the index and as the page lede. */
    answer: z.string(),
    category: z.enum(['basics', 'skate-3', 'legal', 'other-games']),
    games: z.array(z.string()).default([]),
    /** Ids of guides or other FAQ entries, e.g. 'guides/convert-ps3-maps' or 'faq/map-formats'. */
    related: z.array(z.string()).default([]),
    order: z.number(),
    updated: z.coerce.date(),
  }),
});

const communities = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/communities' }),
  schema: z.object({
    title: z.string(),
    short: z.string(),
    games: z.array(z.string()),
    years: z.string(),
    scene,
    order: z.number(),
    updated: z.coerce.date(),
    people: z.array(z.object({
      name: z.string(),
      role: z.string(),
      url: z.string().url().optional(),
      source,
    })).default([]),
    milestones: z.array(z.object({
      // YAML reads 2013-08-10 as a Date; keep it as the string the timeline expects.
      date: z.preprocess((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v), z.string().regex(/^\d{4}(s|-\d{2}(-\d{2})?)?$/)),
      title: z.string(),
      body: z.string(),
      who: z.string().optional(),
      source,
    })).default([]),
    links: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    /** One or two sentences; shown on the index, the home page and as the page lede. */
    description: z.string(),
    date: z.coerce.date(),
    author: z.string().default('skatemods'),
    /** Lead the home page with this post (and its ReSkate fact list). */
    featured: z.boolean().default(false),
    games: z.array(z.string()).default([]),
    /** Same refs as FAQ entries: 'guides/<id>', 'faq/<id>' or 'history/<id>'. */
    related: z.array(z.string()).default([]),
  }),
});

export const collections = { games, guides, faq, communities, blog };
