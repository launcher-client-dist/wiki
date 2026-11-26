/**
 * Where one item's stat stands among its peers: the items of the same game subtype (a wand against wands, never
 * against swords) that have that stat at all, best first (a bigger number is better; for a stat that takes away, the
 * one that takes least). A rank, never a percentage. Peers are compared by their leading version's base numbers.
 */
import { primaryVersion, type ItemData, type StatKey } from "./data.ts";

export interface StatRank {
  /** 1 is the best. Ties share the better rank. */
  rank: number;
  /** How many peers have the stat (this item included). */
  of: number;
  /** 0..1: how far along the bar (1 = the best of them). */
  share: number;
}

/** The fewest peers worth ranking against: below this a rank says nothing. */
export const MIN_PEERS = 4;

export function statRank(items: readonly ItemData[], item: ItemData, key: StatKey): StatRank | null {
  const mine = primaryVersion(item).stats[key];
  if (!mine) return null;
  const values = items
    .filter((o) => o.subtype.key === item.subtype.key)
    .map((o) => primaryVersion(o).stats[key])
    .filter((n): n is number => typeof n === "number" && n !== 0);
  if (values.length < MIN_PEERS) return null;
  const rank = 1 + values.filter((n) => n > mine).length;
  const share = values.length === 1 ? 1 : (values.length - rank) / (values.length - 1);
  return { rank, of: values.length, share };
}
