/** What the item pages compute from the data: similar items, the meta description, odds as words. */
import { LOCALE, type Lang } from "../i18n.ts";
import { ui, fill } from "../../i18n/index.ts";
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
  const m = ui(lang).item.meta;
  const name = item.name[lang];
  const type = item.subtype[lang].toLowerCase();
  const stats = topStats(item, lang);
  const s = item.sources;
  const where: string[] = [];
  if (s.drops.length) where.push(s.drops.length > 1 ? fill(m.droppedN, { n: s.drops.length }) : m.dropped1);
  if (s.shops.length) where.push(s.shops.length > 1 ? fill(m.soldN, { n: s.shops.length }) : m.sold1);
  if (s.recipes.length) where.push(m.recipe);
  if (s.map.length) where.push(m.map);
  if (s.quests.length && !where.length) where.push(m.quest);
  let text = fill(m.lead, { name, type });
  if (stats) text += `, ${stats}`;
  text += ".";
  if (where.length) text += ` ${where.join(", ").replace(/^./, (c) => c.toUpperCase())}.`;
  if (text.length < 110) text += m.tail;
  if (text.length > 160) text = `${text.slice(0, 157).replace(/[ ,.]+\S*$/, "")}…`;
  if (text.length < 50) text += m.pad;
  return text;
}

/** "1 em 4", "cerca de 1 em 7", "nunca". */
export function oneInText(o: OneIn | null, t: { oneIn: string; aboutOneIn: string; never: string }, lang: Lang): string {
  if (!o) return t.never;
  const n = o.oneIn.toLocaleString(LOCALE[lang]);
  return (o.approx ? t.aboutOneIn : t.oneIn).replace("{n}", n);
}

/** A weight in ounces as the page shows it ("4,7 oz"). */
export function oz(w: number, lang: Lang): string {
  return `${(Math.round(w * 100) / 100).toLocaleString(LOCALE[lang])} oz`;
}

export function num(n: number, lang: Lang): string {
  return n.toLocaleString(LOCALE[lang]);
}
