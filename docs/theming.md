# Changing the look

The design lives in two places. Pages and content never carry styles of their own.

1. **`src/styles/tokens.css`: the whole palette and feel.** Colours for dark (the default) and light, fonts, type
   scale, spacing, radii, the 2 px outline (`--bw`), the block shadows (`--shadow-1..3`, `--hard`), the sky and grass
   of the banners, the five item-quality colours and motion. Change a value here and every component follows. (Drop
   tiers have no colour of their own: a word and pips, so they never look like a quality.)
2. **The components' own `<style>` blocks: the shapes.** `src/components/ui/` (Tag, Chip, Badge, TierBadge, Callout,
   Spoiler, Tabs, Card, InfoBox, StatGrid, Figure, MapLink, IconSlot, RenderSlot, PixelArt, Icon),
   `src/components/layout/` (PageShell, Header, Footer, Breadcrumbs, SearchOverlay, HoverCard, Toc),
   `src/components/entity/` (EntityLink, ReverseRefs) and `src/components/data/` (DataTable, DataRow, DataCell).
   They read only tokens, so a new direction rarely needs more than the outline, radius and shadow rules there.

`src/styles/global.css` holds the reset, the base typography and the `.prose` rules for guides.

## Common changes

| To change | Edit |
|---|---|
| A colour, in one theme or both | `tokens.css`, the `:root` block (dark) and/or `:root[data-theme="light"]` |
| The fonts | the files in `public/fonts/`, `src/styles/fonts.css`, `--font-display` / `--font-body` in `tokens.css` |
| Blockiness (outlines, hard shadows, square corners) | `--bw`, `--r-*`, `--shadow-*`, `--hard` in `tokens.css` |
| The pixel emblems and the logo | `src/lib/kind-art.ts` (rows of characters, one per pixel); then `node scripts/make-favicon.ts` |
| The social image | `design/og-image.html`, then a 1200×630 screenshot over `public/og/default.png` (see the file's header) |
| Interface words | `src/i18n/pt.ts` and `src/i18n/en.ts` (same keys; the type check refuses a missing one) |

Notes:
- **Display font weight:** Pixelify Sans stays at weight 400 (`--display-weight`). From 500 up, its "C" closes and
  reads as an "O".
- **Small text:** headings below h3, labels and numbers use the body font, because the pixel face only reads well
  large.

## Seeing every component

`npm run kit` starts the dev server with the component gallery at `/pt/kit/` and `/en/kit/`. Every block is on it,
filled with the made-up data in `tests/fixtures/`. The gallery is never built into the deployed site.
