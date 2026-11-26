/**
 * The reverse index: every relation written on one entity, seen from the other side. A monster's "drops: item:x"
 * becomes item x's "droppedBy: monster:y". Built once from the whole data set.
 */
import type { Entity, EntityRef, Relation, RelationType } from "./types.ts";
import { tierRank, type TierKey } from "./tiers.ts";

export const INVERSE = {
  drops: "droppedBy",
  sells: "soldBy",
  buys: "boughtBy",
  rewards: "rewardOf",
  requires: "requiredBy",
  madeFrom: "usedIn",
  teaches: "taughtBy",
  conjures: "conjuredBy",
  leaves: "leftBy",
  opens: "openedBy",
  mentions: "mentionedIn",
  related: "related",
} as const satisfies Record<RelationType, string>;
export type InverseType = (typeof INVERSE)[RelationType];

export interface ReverseRef {
  type: InverseType;
  from: EntityRef;
  tier?: TierKey;
  amount?: readonly [number, number];
  price?: number;
}

export type ReverseIndex = ReadonlyMap<EntityRef, readonly ReverseRef[]>;

export function buildReverseIndex(entities: readonly Entity[]): ReverseIndex {
  const index = new Map<EntityRef, ReverseRef[]>();
  for (const e of entities) {
    for (const r of e.relations ?? []) {
      const list = index.get(r.to) ?? [];
      list.push(toReverse(e.ref, r));
      index.set(r.to, list);
    }
  }
  for (const list of index.values()) list.sort(compare);
  return index;
}

function toReverse(from: EntityRef, r: Relation): ReverseRef {
  const out: ReverseRef = { type: INVERSE[r.type], from };
  if (r.tier) out.tier = r.tier;
  if (r.amount) out.amount = r.amount;
  if (r.price !== undefined) out.price = r.price;
  return out;
}

/** By relation type, then the commonest tier first, then by ref (stable output for stable pages). */
function compare(a: ReverseRef, b: ReverseRef): number {
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  const ta = a.tier ? tierRank(a.tier) : 99;
  const tb = b.tier ? tierRank(b.tier) : 99;
  if (ta !== tb) return ta - tb;
  return a.from < b.from ? -1 : a.from > b.from ? 1 : 0;
}

/** One entity's reverse refs grouped by type ("droppedBy" -> [...]), in a stable order. */
export function groupReverse(refs: readonly ReverseRef[]): Partial<Record<InverseType, ReverseRef[]>> {
  const out: Partial<Record<InverseType, ReverseRef[]>> = {};
  for (const r of refs) (out[r.type] ??= []).push(r);
  return out;
}
