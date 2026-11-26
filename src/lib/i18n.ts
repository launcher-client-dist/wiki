/** The site's languages. pt-BR is the default; every page exists in both, at /pt/... and /en/... */
export const LANGS = ["pt", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "pt";

/** The value for <html lang>, hreflang and the like. */
export const HREFLANG: Record<Lang, string> = { pt: "pt-BR", en: "en" };
export const OG_LOCALE: Record<Lang, string> = { pt: "pt_BR", en: "en_US" };

/** A text in every language. */
export type Localized<T = string> = Record<Lang, T>;

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

export function otherLang(lang: Lang): Lang {
  return lang === "pt" ? "en" : "pt";
}
