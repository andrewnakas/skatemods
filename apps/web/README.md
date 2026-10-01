# skatemods.com (web)

Static Astro site. Content is Markdown in `src/content/` (games, guides) and TypeScript data in `src/data/` (Skate 3 timeline, tools, map catalog).

```sh
npm install
npm run dev              # http://localhost:4321
npm run build            # → dist/
npm run sync:catalog     # refresh src/data/catalog.json from skate3-level-loader
```

## Contributing content

- **A game:** add `src/content/games/<id>.md`. The schema is in `src/content.config.ts`.
- **A guide:** add `src/content/guides/<id>.md`.
- **A tool:** add an entry to `src/data/tools.ts`.
- **History:** add an event to `src/data/skate3-timeline.ts`. Every event needs a `source` URL.
