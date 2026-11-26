# Opengea Wiki

The community wiki for Opengea, at https://wiki.opengea.tech, in Portuguese (`/pt/`) and English (`/en/`).

It is built with [Astro](https://astro.build) as a static site, with [Pagefind](https://pagefind.app) for search. Every
push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Working on it

Requires Node 22.18 or newer: the tests run TypeScript directly.

```sh
npm ci
npm run dev        # http://localhost:4321
npm run kit        # the same, with the component gallery at /pt/kit/
npm test           # entity registry and route tests
npm run verify     # everything CI runs: tests, types, both builds, site checks
```

`npm run build` writes `dist/` and indexes it for search. `npm run check:site` then checks the build:
- every page has a title, a description and a canonical;
- hreflang pairs point at each other;
- internal links resolve;
- the sitemap is complete;
- ids are unique.

## Where things are

| Path | What |
|---|---|
| `src/styles/tokens.css` | the design: colours, fonts, spacing, shapes ([docs/theming.md](docs/theming.md)) |
| `src/components/` | the building blocks, which read only tokens |
| `src/lib/routes.ts` | every URL, and which sections are open (`SHIPPED_KINDS`) |
| `src/lib/entities/` | entities, links and reverse references ([docs/entities.md](docs/entities.md)) |
| `src/i18n/` | interface words, one file per language |
| `src/content/guides/<lang>/` | guides, one MDX file per language |
| `src/pages/` | routes |
| `tests/` | tests and made-up fixture data |

## Fonts

Pixelify Sans and Rubik, under the SIL Open Font License 1.1 (`public/fonts/*-OFL.txt`).
