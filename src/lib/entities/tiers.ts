/**
 * Drop rarity tiers. The wiki never shows a drop rate: a rate becomes a tier here, at data time, and only the tier
 * reaches pages, hover cards, metadata and search.
 */
export const TIERS = ["sempre", "comum", "incomum", "raro", "muito-raro"] as const;
export type TierKey = (typeof TIERS)[number];

/** How many of the badge's 5 pips are lit: the shape that carries the tier besides its colour and label. */
export const TIER_PIPS: Record<TierKey, number> = { sempre: 5, comum: 4, incomum: 3, raro: 2, "muito-raro": 1 };

/** Lower bound (in %) of each tier. */
const BANDS: readonly [number, TierKey][] = [[99, "sempre"], [20, "comum"], [5, "incomum"], [1, "raro"]];

/** The tier of a drop rate given in percent (0-100). */
export function tierForRate(ratePercent: number): TierKey {
  if (!Number.isFinite(ratePercent) || ratePercent < 0) throw new RangeError(`bad drop rate: ${ratePercent}`);
  for (const [lo, tier] of BANDS) if (ratePercent >= lo) return tier;
  return "muito-raro";
}

/** For sorting: 0 = most common. */
export function tierRank(tier: TierKey): number {
  return TIERS.indexOf(tier);
}

export function isTier(value: unknown): value is TierKey {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}
