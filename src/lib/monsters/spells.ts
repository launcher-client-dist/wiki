/**
 * A monster's spell, named by what it does (the wiki's own words, src/i18n monster.spellName): a monster's spells have
 * no name in the game, and the engine's labels never show. A spell players also learn keeps the game's name instead
 * (the page links it). One function, so the dictionary in the report and the pages agree.
 */
import type { Lang } from "../i18n.ts";
import { ui, fill } from "../../i18n/index.ts";
import type { MonsterSpell } from "./data.ts";

/** The element's word, lowercase inside a phrase in pt/es ("Golpe de veneno"), capitalised in en ("Poison strike"). */
function element(sp: MonsterSpell, lang: Lang): string {
  const words = ui(lang).monster.element;
  return words[sp.element] ?? words[0]!;
}

export function spellWords(sp: MonsterSpell, lang: Lang): string {
  const n = ui(lang).monster.spellName;
  const physical = sp.element === 0;
  switch (sp.kind) {
    case "at":
      return physical ? (sp.ranged ? n.atPhysicalRanged : n.atPhysical) : fill(sp.ranged ? n.atRanged : n.at, { el: element(sp, lang) });
    case "around":
      return physical ? n.aroundPhysical : fill(n.around, { el: element(sp, lang) });
    default:
      return n[sp.kind];
  }
}

/** Every name the dictionary can give (for the report and the tests): kind x element x ranged. */
export function allSpellWords(lang: Lang): string[] {
  const out = new Set<string>();
  for (const kind of ["at", "around", "leap", "heal", "summon", "buff"] as const) {
    for (let el = 0; el < 11; el++) {
      for (const ranged of [false, true]) out.add(spellWords({ key: 0, kind, cooldown: 0, oneIn: { oneIn: 1, approx: false }, element: el, ranged }, lang));
    }
  }
  return [...out];
}
