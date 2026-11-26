/** What the item pages compute from the data: similar items, the meta description, odds as words. */
import type { Lang } from "../i18n.ts";
import { primaryVersion, statLabel, signed, STAT_KEYS, type ItemData, type OneIn, type StatKey } from "./data.ts";

/** A rough size of an item: its positive stats added up, plus its value (only to rank neighbours). */
function power(item: ItemData): number {
  const s = primaryVersion(item).stats;
  return STAT_KEYS.reduce((sum, k) => sum + Math.max(0, s[k] ?? 0), 0) + (item.value.npcPays ?? 0) / 50;
}

/**
 * Similar items: the same category and (for gear) a shared slot, nearest by the size above, then by name.
 * The data has no item level, so "close level" is read as "close in stats and value".
 */
export function similarItems(all: readonly ItemData[], item: ItemData, n = 6): ItemData[] {
  const p = power(item);
  return all
    .filter((o) => o.id !== item.id && o.category === item.category && (!item.slots.length || o.slots.some((s) => item.slots.includes(s))))
    .map((o) => ({ o, d: Math.abs(power(o) - p) }))
    .sort((a, b) => a.d - b.d || a.o.name.en.localeCompare(b.o.name.en))
    .slice(0, n)
    .map((x) => x.o);
}

/** The strongest few stats, in the game's order, as "Dano +35, Alcance +65". */
export function topStats(item: ItemData, lang: Lang, n = 3): string {
  const s = primaryVersion(item).stats;
  return (Object.entries(s) as [StatKey, number][])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n)
    .map(([k, v]) => `${statLabel(k)[lang]} ${signed(v)}`)
    .join(", ");
}

/**
 * The meta description: what it is, its main numbers, where it comes from in counts (never a quest's name: those
 * are spoilers; never a rate). 50-160 characters.
 */
export function metaDescription(item: ItemData, lang: Lang): string {
  const pt = lang === "pt";
  const name = item.name[lang];
  const type = item.subtype[lang].toLowerCase();
  const stats = topStats(item, lang);
  const s = item.sources;
  const where: string[] = [];
  if (s.drops.length) where.push(pt ? `dropado por ${s.drops.length} monstro${s.drops.length > 1 ? "s" : ""}` : `dropped by ${s.drops.length} monster${s.drops.length > 1 ? "s" : ""}`);
  if (s.shops.length) where.push(pt ? `vendido por ${s.shops.length} NPC${s.shops.length > 1 ? "s" : ""}` : `sold by ${s.shops.length} NPC${s.shops.length > 1 ? "s" : ""}`);
  if (s.recipes.length) where.push(pt ? "feito por receita" : "made by a recipe");
  if (s.map.length) where.push(pt ? "encontrado no mapa" : "found on the map");
  if (s.quests.length && !where.length) where.push(pt ? "recompensa de missão" : "a quest reward");
  let text = pt ? `${name} em Opengea: ${type}` : `${name} in Opengea: ${type}`;
  if (stats) text += `, ${stats}`;
  text += ".";
  if (where.length) text += ` ${where.join(", ").replace(/^./, (c) => c.toUpperCase())}.`;
  const tail = pt ? " Atributos, de onde vem e quanto vale." : " Stats, where it comes from and its value.";
  if (text.length < 110) text += tail;
  if (text.length > 160) text = `${text.slice(0, 157).replace(/[ ,.]+\S*$/, "")}…`;
  if (text.length < 50) text += pt ? " Na wiki de Opengea." : " On the Opengea wiki.";
  return text;
}

/** "1 em 4", "cerca de 1 em 7", "nunca". */
export function oneInText(o: OneIn | null, t: { oneIn: string; aboutOneIn: string; never: string }, lang: Lang): string {
  if (!o) return t.never;
  const n = o.oneIn.toLocaleString(lang === "pt" ? "pt-BR" : "en");
  return (o.approx ? t.aboutOneIn : t.oneIn).replace("{n}", n);
}

/** A weight in ounces as the page shows it ("4,7 oz"). */
export function oz(w: number, lang: Lang): string {
  return `${(Math.round(w * 100) / 100).toLocaleString(lang === "pt" ? "pt-BR" : "en")} oz`;
}

export function num(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "pt" ? "pt-BR" : "en");
}
