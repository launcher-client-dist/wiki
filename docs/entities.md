# Entities and links

Everything the wiki can link to is an **entity**. Each entity has:
- a **kind**: `item`, `monster`, `npc`, `place`, `spell`, `trait`, `quest`, `guide`, `build` or `class`;
- an **id**: lowercase letters, digits and dashes;
- a **ref** joining the two: `item:example-blade`;
- a name and a URL slug in each language;
- optionally an icon, a summary, a few facts and relations.

## Linking

```mdx
<EntityLink to="item:example-blade" />           the name, with icon and hover card
<EntityLink to="guide:glossary" label="here" />  other text
<EntityLink to="monster:x" icon={false} />       no icon
```

How a link renders:
- **The kind has shipped** (it's listed in `SHIPPED_KINDS`, `src/lib/routes.ts`): a real link to the entity's page.
- **Not yet:** the same icon, name and hover card, as a button. A tap or Enter opens the card, so there are no dead
  links. Adding the kind to `SHIPPED_KINDS` turns every one of these into a link at once.
- **An unknown ref:** the build fails and names it.

## Reverse references

Write a relation once, on one side. The `relations` of the monster below produce the "Dropado por" line on the item:

```ts
{ ref: "monster:x", ..., relations: [{ type: "drops", to: "item:y", tier: "raro", amount: [1, 2] }] }
```

`<ReverseRefs of="item:y" />` lists every group:

| Relation | Reverse group |
|---|---|
| drops | Dropado por |
| sells | Vendido por |
| buys | Comprado por |
| rewards | Recompensa de |
| madeFrom | Usado em |
| teaches | Ensinado por |
| opens | Aberto por |
| requires | Pedido por |
| conjures | Conjurado por |
| mentions | Citado em |
| related | Relacionado |

The registry exposes the same data with `registry.reverse(ref)`, and `groupReverse()` groups it.

Drop rarity is always a **tier**: sempre, comum, incomum, raro or muito-raro. A rate becomes a tier through
`tierForRate()` when the data is prepared, so no percentage ever reaches a page.

## The API (`src/lib/entities/`)

| Call | Returns |
|---|---|
| `createRegistry(entities, { shippedKinds })` | the registry. It validates every entity first: unique refs, a name and a slug in both languages, unique slugs per kind and language, and every relation pointing at a known entity. It lists all the problems at once. |
| `registry.get(ref)` | the entity, or undefined |
| `registry.require(ref)` | the entity, or throws |
| `registry.all(kind?)` | every entity, or every entity of one kind |
| `registry.hasPage(ref)` | whether the entity has a page |
| `registry.url(ref, lang)` | the page path, or null while the kind hasn't shipped |
| `registry.link(ref, lang)` | `{ name, altName, href, icon, summary, facts, kind, id }`: everything a link and its card need |
| `registry.reverse(ref)` | the other side of every relation pointing here |
| `parseRef(ref)`, `isEntityRef(x)` | splits and checks refs |

`src/lib/site-registry.ts` fills the registry for the site: the exported game data (`src/data/items.json` and the
monster, NPC, quest and spell stubs in `src/data/entities.json`) and every content collection in `CONTENT_KINDS`. An
entity with `noPage: true` never gets a URL, even when its kind has shipped. `npm test` runs the registry's tests
against the made-up entities in `tests/fixtures/`.

## Adding a page type (for example, items)

1. Add a data collection (schema in `src/content.config.ts`) and turn its entries into entities in `site-registry.ts`.
2. Add the routes, `src/pages/[lang]/[items]/...`, using `SECTIONS.item.slug` for the URL segment.
3. Add `"item"` to `SHIPPED_KINDS`. The nav, home card, search shortcuts, sitemap and every existing link light up.
4. Mark the pages `searchable={{ kind: "item" }}` so search groups them.

## Where an item appears: any kind of page, by itself

Item pages (and every entity page after them) end with "Onde aparece": every entity that points at this one, grouped
by the referrer's kind ("Em guias", "Usado em builds", "Nas classes", "Em lugares"...), each group shown only when it
isn't empty (`appearsIn()`, `src/lib/entities/appears.ts`). It reads the reverse index only, so:

- the game data writes its relations on the owning side (a monster `drops`, an NPC `sells` and `buys`, a quest
  `rewards` and `requires`, a recipe's result `madeFrom` its ingredients, a spell `conjures`, a spellbook `teaches`:
  `entitiesFromData()` in `src/lib/items/data.ts`); the item page draws these richly in its own sections;
- every content collection named in `CONTENT_KINDS` (`src/lib/site-registry.ts`: guides, builds, classes, places,
  spells) registers its entries as entities of that kind, with a `mentions` relation to every entity its MDX links to
  (`<EntityLink to="...">`, found by `refsInMdx()`) or lists in `related`.

So a new `builds` collection (same convention: `key`, `title`, `description`, `related`, `<lang>/<slug>.mdx`) that
links to items makes a "Usado em builds" section on each of those items' pages with no item-page change. Tested twice:
`tests/items.test.ts` (a made-up build entity) and, with `WIKI_KIT=1`, a made-up `builds` collection in
`tests/fixtures/content/builds/` that links to the Iron Ingot, whose page `check-site` requires to show the section.
