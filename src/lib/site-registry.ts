/**
 * The site's entity registry, built once per build from:
 *   - the game data (src/data/items.json and the stubs in src/data/entities.json: monsters, NPCs, quests, spells);
 *   - every content collection (content.config.ts): each entry is an entity of its collection's kind (guides ->
 *     guide, builds -> build, classes -> class ...) and "mentions" every entity its MDX links to (<EntityLink to>)
 *     or lists in `related`. So a new collection that links to items shows on those items' pages by itself.
 * With WIKI_KIT=1 the made-up fixtures join too (the component gallery and the wiring tests).
 */
import { getCollection, type CollectionEntry, type CollectionKey } from "astro:content";
import { collections } from "../content.config.ts";
import itemsJson from "../data/items.json";
import entitiesJson from "../data/entities.json";
import { FIXTURE_ENTITIES } from "../../tests/fixtures/entities.ts";
import { isLang, LANGS, type Lang } from "./i18n.ts";
import { createRegistry, EntityError, type Registry } from "./entities/registry.ts";
import { refsInMdx } from "./entities/appears.ts";
import type { Entity, EntityKind, EntityRef, Relation } from "./entities/types.ts";
import { entitiesFromData, type ItemData, type ItemsFile, type StubEntity } from "./items/data.ts";
import { SHIPPED_KINDS } from "./routes.ts";

export const KIT_ENABLED = process.env.WIKI_KIT === "1";

/** A content collection's entity kind, by the collection's name. A collection not named here is not an entity. */
export const CONTENT_KINDS: Record<string, EntityKind> = { guides: "guide", builds: "build", classes: "class", places: "place", spells: "spell" };

export const ITEMS = itemsJson as unknown as ItemsFile;
const STUBS = (entitiesJson as unknown as { entities: StubEntity[] }).entities;
/** A stub by its ref (a monster's `appears`, a lever place): for what the item pages show beside a link. */
export const STUB_BY_REF: ReadonlyMap<string, StubEntity> = new Map(STUBS.map((e) => [e.ref, e]));

type ContentEntry = { id: string; body?: string; data: { key: string; title: string; description: string; related?: string[] } };

export interface ContentPage<E = ContentEntry> {
  ref: EntityRef;
  lang: Lang;
  slug: string;
  entry: E;
  /** The same entry in each language. */
  twins: Record<Lang, E>;
}
export type GuidePage = ContentPage<CollectionEntry<"guides">>;

/** "pt/como-usar-a-wiki" -> ["pt", "como-usar-a-wiki"] */
function splitId(collection: string, id: string): [Lang, string] {
  const [lang, ...rest] = id.split("/");
  if (!isLang(lang) || rest.length !== 1) throw new EntityError(`${collection} file "${id}" must live in <collection folder>/<${LANGS.join("|")}>/<slug>.mdx`);
  return [lang, rest[0]!];
}

/** One content collection's pages and entities (any collection following the key + <lang>/<slug>.mdx convention). */
async function contentOf(name: string, kind: EntityKind) {
  const entries = (await getCollection(name as CollectionKey)) as unknown as ContentEntry[];
  const byKey = new Map<string, Partial<Record<Lang, ContentEntry>>>();
  for (const entry of entries) {
    const [lang] = splitId(name, entry.id);
    const twins = byKey.get(entry.data.key) ?? {};
    if (twins[lang]) throw new EntityError(`two ${lang} ${name} share the key "${entry.data.key}"`);
    twins[lang] = entry;
    byKey.set(entry.data.key, twins);
  }
  const entities: Entity[] = [];
  const pages: ContentPage[] = [];
  for (const [key, partial] of byKey) {
    const missing = LANGS.filter((l) => !partial[l]);
    if (missing.length) throw new EntityError(`${name} "${key}" has no ${missing.join(", ")} version: every page needs its twin`);
    const twins = partial as Record<Lang, ContentEntry>;
    const ref = `${kind}:${key}` as EntityRef;
    const per = <T,>(f: (e: ContentEntry) => T) => Object.fromEntries(LANGS.map((l) => [l, f(twins[l])])) as Record<Lang, T>;
    const slug = per((e) => splitId(name, e.id)[1]);
    // what the page points at, in either language: its links and its `related`
    const mentioned = new Set<string>();
    for (const lang of LANGS) {
      for (const r of refsInMdx(twins[lang].body ?? "")) mentioned.add(r);
      for (const r of twins[lang].data.related ?? []) mentioned.add(r);
    }
    mentioned.delete(ref);
    const relations: Relation[] = [...mentioned].sort().map((to) => ({ type: "mentions", to: to as EntityRef }));
    entities.push({ ref, name: per((e) => e.data.title), slug, summary: per((e) => e.data.description), relations });
    for (const lang of LANGS) pages.push({ ref, lang, slug: slug[lang], entry: twins[lang], twins });
  }
  return { entities, pages };
}

let cache: Promise<{ registry: Registry; guides: GuidePage[]; items: ItemData[] }> | undefined;

async function build() {
  const entities: Entity[] = entitiesFromData(ITEMS, STUBS);
  let guides: GuidePage[] = [];
  for (const name of Object.keys(collections).sort()) {
    const kind = CONTENT_KINDS[name];
    if (!kind) continue;
    const { entities: es, pages } = await contentOf(name, kind);
    entities.push(...es);
    if (name === "guides") guides = pages as unknown as GuidePage[];
  }
  if (KIT_ENABLED) entities.push(...FIXTURE_ENTITIES.map((e) => ({ ...e, noPage: true })));
  const registry = createRegistry(entities, { shippedKinds: SHIPPED_KINDS });
  guides.sort((a, b) => a.entry.data.order - b.entry.data.order || a.slug.localeCompare(b.slug));
  return { registry, guides, items: ITEMS.items };
}

/** The registry, the guide pages and the items (cached: built once per build). */
export function siteData() {
  cache ??= build();
  return cache;
}

export async function getRegistry(): Promise<Registry> {
  return (await siteData()).registry;
}
