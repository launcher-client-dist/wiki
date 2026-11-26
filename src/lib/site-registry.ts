/**
 * The site's entity registry, built once per build from the content collections (today: guides). Each page type
 * that ships adds its data collection here. With WIKI_KIT=1 the made-up fixtures join too, for the component gallery.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { FIXTURE_ENTITIES } from "../../tests/fixtures/entities.ts";
import { isLang, LANGS, type Lang } from "./i18n.ts";
import { createRegistry, EntityError, type Registry } from "./entities/registry.ts";
import type { Entity, EntityRef } from "./entities/types.ts";
import { SHIPPED_KINDS } from "./routes.ts";

export const KIT_ENABLED = process.env.WIKI_KIT === "1";

export interface GuidePage {
  ref: EntityRef;
  lang: Lang;
  slug: string;
  entry: CollectionEntry<"guides">;
  /** The same guide's entry in each language. */
  twins: Record<Lang, CollectionEntry<"guides">>;
}

/** "pt/como-usar-a-wiki" -> ["pt", "como-usar-a-wiki"] */
function splitId(id: string): [Lang, string] {
  const [lang, ...rest] = id.split("/");
  if (!isLang(lang) || rest.length !== 1) throw new EntityError(`guide file "${id}" must live in src/content/guides/<pt|en>/<slug>.mdx`);
  return [lang, rest[0]!];
}

let cache: Promise<{ registry: Registry; guides: GuidePage[] }> | undefined;

async function build() {
  const entries = await getCollection("guides");
  const byKey = new Map<string, Partial<Record<Lang, CollectionEntry<"guides">>>>();
  for (const entry of entries) {
    const [lang] = splitId(entry.id);
    const twins = byKey.get(entry.data.key) ?? {};
    if (twins[lang]) throw new EntityError(`two ${lang} guides share the key "${entry.data.key}"`);
    twins[lang] = entry;
    byKey.set(entry.data.key, twins);
  }
  const entities: Entity[] = [];
  const guides: GuidePage[] = [];
  for (const [key, partial] of byKey) {
    const missing = LANGS.filter((l) => !partial[l]);
    if (missing.length) throw new EntityError(`guide "${key}" has no ${missing.join(", ")} version: every page needs its twin`);
    const twins = partial as Record<Lang, CollectionEntry<"guides">>;
    const ref = `guide:${key}` as EntityRef;
    const slug = { pt: splitId(twins.pt.id)[1], en: splitId(twins.en.id)[1] };
    entities.push({
      ref,
      name: { pt: twins.pt.data.title, en: twins.en.data.title },
      slug,
      summary: { pt: twins.pt.data.description, en: twins.en.data.description },
    });
    for (const lang of LANGS) guides.push({ ref, lang, slug: slug[lang], entry: twins[lang], twins });
  }
  if (KIT_ENABLED) entities.push(...FIXTURE_ENTITIES);
  const registry = createRegistry(entities, { shippedKinds: SHIPPED_KINDS });
  for (const g of guides) for (const r of g.entry.data.related) registry.require(r);
  guides.sort((a, b) => a.entry.data.order - b.entry.data.order || a.slug.localeCompare(b.slug));
  return { registry, guides };
}

/** The registry and the guide pages (cached: built once per build). */
export function siteData() {
  cache ??= build();
  return cache;
}

export async function getRegistry(): Promise<Registry> {
  return (await siteData()).registry;
}
