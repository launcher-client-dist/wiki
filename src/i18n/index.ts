import type { Lang } from "../lib/i18n.ts";
import { en } from "./en.ts";
import { pt, type UiStrings } from "./pt.ts";

const UI: Record<Lang, UiStrings> = { pt, en };

/** The interface strings of a language. */
export function ui(lang: Lang): UiStrings {
  return UI[lang];
}

/** Fill "{name}" placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}

export type { UiStrings };
