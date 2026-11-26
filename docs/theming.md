# Changing the look

The design lives in two places. Pages and content never carry styles of their own.

1. **`src/styles/tokens.css`: the whole palette and feel.** Colours for dark (the default) and light, fonts, type
   scale, spacing, radii, the outline width (`--bw`), the soft shadows (`--shadow-1..3`, `--hard`), the sky and grass
   of the banners, the five item-quality colours and motion. Change a value here and every component follows. (Drop
   tiers have no colour of their own: a word and pips, so they never look like a quality.)
2. **The components' own `<style>` blocks: the shapes.** `src/components/ui/` (Tag, Chip, Badge, TierBadge, Callout,
   Spoiler, Tabs, Card, InfoBox, StatGrid, Figure, MapLink, IconSlot, RenderSlot, PixelArt, Icon, GameIcon (the game's
   own UI icons, `public/ui/`, by meaning), TipTag (a tag that explains itself), StatChips, StatValue, VariantSwitch),
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

## Layout rules

Lighthouse and axe don't see these; `npm run check:layout` does (part of `npm run verify`). It serves the build in a
headless Chrome and measures every page kind (home, the list, an item of every kind, a guide, the 404) at 1440, 1024
and 390 px, in Portuguese and Spanish. Chrome comes from `CHROME_PATH` or the usual install paths.

- **One icon rule per component.** An icon column has one size and one x; labels align on one edge, values on the
  other. Never an icon on the left in one row and on the right in the next. In the stats box every row (a stat, the
  weight, the price) is one grid: a 44 px icon well, the label, the value. *Checked (icon-column).*
- **Tables.** A header label aligns like its cells (numbers right, text left); a column's icon lives in the header only,
  inline before the word; no header wraps at 1024 px and up; every row has the same height (a cell that could wrap gets
  a fixed shape: one line with "…", source icons in one row with "+N"). The sort arrow sits in a fixed box, in the side
  padding of a number column. *Checked (header, row-height).*
- **One spacing rhythm.** 56 px between sections, 16 px from a section title to its content, 32 px between the groups
  of a section, 12 px from a group's title to its rows. Counts are readable pills.
- **No orphans.** A wrapping group of 3 or more items never leaves one alone on its last line: choose the columns by
  the room (quality cards 5 / 3 / 2 with the last across, drop odds 4 / 2 / 1, similar items by count), lay chips
  inline with `text-wrap: balance` (filter chips, stat chips, a rune's types: seven wrap 4+3, never 6+1), stack them all
  as an even column (the hero's tags on a phone, each as wide as the widest), or make the last one take the whole line.
  A list that reads like text (a rune's 19 linked items) opts out with `data-flow`; the check lists those.
  *Checked (orphan).*
- **No duplicate content.** A fact is told once: a potion's effect in the stats box, not again in "Efeito"; a rune's
  effect is its hero text.
- **The hero.** The icon sized to the hero, no dead area (the tags run under icon and text), the description at its own
  width up to a readable measure. On a wide screen the stats box sits beside the hero from the top.
- **Dense rows.** One right-side group with consistent spacing (a drop row: quality mark, amount, tier in fixed
  slots). On a wide row the text wraps and the group stays at the right edge; on a narrow one the group always takes its
  own line.
- **No overflow.** No horizontal page scroll; nothing clipped. A row that scrolls sideways on purpose (the filter chips
  on a phone) is listed by the check, not failed. *Checked (overflow).*

`node scripts/check-layout.mjs --sweep` runs the orphan and overflow rules at every 40 px from 360 to 1440 px;
`--only list,item-rune` limits the pages, `--dist DIR` measures another build.

## Seeing every component

`npm run kit` starts the dev server with the component gallery at `/pt/kit/` and `/en/kit/`. Every block is on it,
filled with the made-up data in `tests/fixtures/`. The gallery is never built into the deployed site.
