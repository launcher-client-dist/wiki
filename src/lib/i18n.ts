/**
 * The site's languages, all from one table: src/lib/languages.json. Adding a language is a row there, its UI
 * dictionary (src/i18n/<lang>.ts), its section slugs (routes.ts SECTIONS) and its content files; the type checker
 * asks for each of them (Lang comes from the table's keys). The default language lives at /<default>/ and is
 * x-default.
 *
 * Each row: hreflang (<html lang>, hreflang, Pagefind's language), og (og:locale), locale (numbers and dates,
 * Intl), alt (the language whose name a page shows beside its own: the game's English for most).
 */
import table from "./languages.json" with { type: "json" };

export type Lang = keyof typeof table.languages;
export const LANGS = Object.keys(table.languages) as Lang[];
export const DEFAULT_LANG = table.default as Lang;

const row = (lang: Lang) => table.languages[lang] as { hreflang: string; og: string; locale: string; alt: string };

/** The value for <html lang>, hreflang and the like. */
export const HREFLANG = Object.fromEntries(LANGS.map((l) => [l, row(l).hreflang])) as Record<Lang, string>;
export const OG_LOCALE = Object.fromEntries(LANGS.map((l) => [l, row(l).og])) as Record<Lang, string>;
/** The Intl locale for numbers and dates. */
export const LOCALE = Object.fromEntries(LANGS.map((l) => [l, row(l).locale])) as Record<Lang, string>;

/** A text in every language. */
export type Localized<T = string> = Record<Lang, T>;

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** The language whose name shows beside a page's own (an item's English name on a pt page, pt on an en page). */
export function altLang(lang: Lang): Lang {
  return row(lang).alt as Lang;
}

/** Every language but this one. */
export function otherLangs(lang: Lang): Lang[] {
  return LANGS.filter((l) => l !== lang);
}

/** A number in the language's own format ("1.500" in pt, "1,500" in en). */
export function formatNumber(n: number, lang: Lang): string {
  return n.toLocaleString(LOCALE[lang]);
}
