/** What the monster pages compute for text: the meta description. */
import { LOCALE, type Lang } from "../i18n.ts";
import { ui, fill } from "../../i18n/index.ts";
import type { MonsterData } from "./data.ts";

/** The meta description: the name, its level band, health, experience and drops in counts (never a rate). 50-160. */
export function monsterMeta(m: MonsterData, name: string, lang: Lang): string {
  const t = ui(lang).monster.meta;
  const n = (x: number) => x.toLocaleString(LOCALE[lang]);
  const parts = [m.level ? fill(t.level, { min: m.level.min, max: m.level.max }) : null, fill(t.health, { n: n(m.stats.health) }),
    m.stats.exp ? fill(t.exp, { n: n(m.stats.exp) }) : null, m.drops.length ? fill(t.drops, { n: m.drops.length }) : null].filter(Boolean);
  let text = `${fill(t.lead, { name })}: ${parts.join(", ")}.`;
  if (text.length < 120) text += t.tail;
  if (text.length > 160) text = `${text.slice(0, 157).replace(/[ ,.]+\S*$/, "")}…`;
  if (text.length < 50) text += t.pad;
  return text;
}
