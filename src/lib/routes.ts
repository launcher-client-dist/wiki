/**
 * The route table: the one place every URL of the site comes from (nav, breadcrumbs, twins, hreflang, sitemap,
 * entity links). URLs are directory-style and always end in "/" (astro.config: trailingSlash "always").
 */
import type { Lang } from "./i18n.ts";
import type { EntityKind } from "./entities/types.ts";

export const SITE_URL = "https://wiki.opengea.tech";

/** Each entity kind's section: its URL segment per language, and whether it shows in the main navigation. */
export const SECTIONS: Record<EntityKind, { slug: Record<Lang, string>; nav: boolean }> = {
  monster: { slug: { pt: "monstros", en: "monsters" }, nav: true },
  item: { slug: { pt: "itens", en: "items" }, nav: true },
  npc: { slug: { pt: "npcs", en: "npcs" }, nav: true },
  place: { slug: { pt: "lugares", en: "places" }, nav: true },
  quest: { slug: { pt: "missoes", en: "quests" }, nav: true },
  guide: { slug: { pt: "guias", en: "guides" }, nav: true },
  spell: { slug: { pt: "magias", en: "spells" }, nav: false },
  trait: { slug: { pt: "talentos", en: "traits" }, nav: false },
};

/**
 * The kinds whose pages exist. A kind joins this list when its page type ships; from then on every link to an
 * entity of that kind becomes a real link (before that it renders as text with its icon and hover card).
 */
export const SHIPPED_KINDS: readonly EntityKind[] = ["guide"];

/** The kinds in the main navigation, in order. */
export const NAV_KINDS: readonly EntityKind[] = (Object.keys(SECTIONS) as EntityKind[]).filter((k) => SECTIONS[k].nav);

export function homePath(lang: Lang): string {
  return `/${lang}/`;
}

export function sectionPath(kind: EntityKind, lang: Lang): string {
  return `/${lang}/${SECTIONS[kind].slug[lang]}/`;
}

export function entityPath(kind: EntityKind, slug: string, lang: Lang): string {
  return `${sectionPath(kind, lang)}${slug}/`;
}

/** An absolute URL on the site, for canonical, hreflang, Open Graph and the sitemap. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

/** The section kind whose URL segment is `segment` in `lang` (for [section] routes), or undefined. */
export function kindForSegment(segment: string, lang: Lang): EntityKind | undefined {
  return (Object.keys(SECTIONS) as EntityKind[]).find((k) => SECTIONS[k].slug[lang] === segment);
}

/** A page's addresses in both languages: what hreflang, the language switch and the sitemap use. */
export type Alternates = Record<Lang, string>;

export function homeAlternates(): Alternates {
  return { pt: homePath("pt"), en: homePath("en") };
}

export function sectionAlternates(kind: EntityKind): Alternates {
  return { pt: sectionPath(kind, "pt"), en: sectionPath(kind, "en") };
}
