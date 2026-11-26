/**
 * Names as the game shows them. An item's, spell's or monster's title is its in-game name (English today, in every
 * language: the client doesn't translate them) and the page language's translation is a reading aid beside it, never
 * the name. Quests, NPCs, books and places are translated in the game, so their title is the page language's name.
 * Which language the game uses, per kind and page language, is one table: src/lib/in-game.json.
 */
import table from "./in-game.json" with { type: "json" };
import { LANGS, altLang, type Lang, type Localized } from "./i18n.ts";
import type { EntityKind } from "./entities/types.ts";

/** A name per language; `_fb` lists the languages where the English stands in for a missing translation. */
export type Named = Localized & { _fb?: Lang[] };

const TABLE = table as unknown as Partial<Record<EntityKind, Partial<Record<Lang, Lang>>>>;

/** The language the game shows this kind's names in, on a page in `lang`. */
export function inGameLang(kind: EntityKind, lang: Lang): Lang {
  return TABLE[kind]?.[lang] ?? lang;
}

/** The language a name's text really is in: English where it stands in for a missing translation. */
function textIn(n: Named, lang: Lang): Lang {
  return n._fb?.includes(lang) ? "en" : lang;
}

export interface DisplayName {
  /** The title: what the game shows. */
  name: string;
  /** The language `name` is written in (for its `lang` attribute). */
  nameLang: Lang;
  /** A reading aid beside it (a subtitle, a second line), or null when it would repeat the name. */
  aid: string | null;
  aidLang: Lang | null;
}

/**
 * An entity's name on a page in `lang`. Where the game shows another language (an item on a pt page), the title is the
 * in-game name and the aid is the page language's translation (only a real one, never the English standing in). Where
 * the game shows the page language (a quest), the title is that and the aid the other language's name, as before; an
 * item on an English page is its English name alone (no Portuguese beside it).
 */
export function displayName(n: Named, kind: EntityKind, lang: Lang): DisplayName {
  const game = inGameLang(kind, lang);
  const name = n[game];
  if (game !== lang) {
    const tr = n[lang];
    const aid = tr && tr !== name && textIn(n, lang) === lang ? tr : null;
    return { name, nameLang: textIn(n, game), aid, aidLang: aid ? lang : null };
  }
  // a kind the game shows in one language (items, spells, monsters), on a page in that language: the name alone
  if (TABLE[kind]) return { name, nameLang: textIn(n, lang), aid: null, aidLang: null };
  const other = altLang(lang);
  const alt = n[other];
  const aid = alt && alt !== name ? alt : null;
  return { name, nameLang: textIn(n, lang), aid, aidLang: aid ? textIn(n, other) : null };
}

/** "Twisted Wand (Varinha Retorcida)": the in-game name with its aid, for a page's <title> and meta description. */
export function nameWithAid(d: DisplayName): string {
  return d.aid ? `${d.name} (${d.aid})` : d.name;
}

/** Every name it has, each once (search finds an entity by any of them). */
export function allNames(n: Named): string[] {
  return [...new Set(LANGS.map((l) => n[l]).filter(Boolean))];
}
