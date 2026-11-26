/**
 * "Where it appears": every entity that points at this one, grouped by the referrer's kind, for the generic area of
 * an entity page. It reads the reverse index only, so a new kind of page (builds, classes, places...) that links to
 * an item shows up on that item's page by itself: no item-page change.
 *
 * The data relations that a page draws richly on its own (an item's "dropped by", "sold by", recipes...) are left out
 * with `except`; everything else (content mentions, and any relation type a later page type adds) lands here.
 */
import type { Registry } from "./registry.ts";
import type { InverseType, ReverseRef } from "./reverse.ts";
import { ENTITY_KINDS, type EntityKind, type EntityRef } from "./types.ts";

/** The order of the sections; a kind added to ENTITY_KINDS later falls in at the end, in its own order. */
export const APPEARS_ORDER: readonly EntityKind[] = ["guide", "build", "class", "spell", "place", "quest", "npc", "monster", "item", "trait"];

export interface AppearsSection {
  kind: EntityKind;
  refs: EntityRef[];
}

export function appearsIn(registry: Registry, ref: string, except: readonly InverseType[] = []): AppearsSection[] {
  const skip = new Set(except);
  const byKind = new Map<EntityKind, Set<EntityRef>>();
  for (const r of registry.reverse(ref) as readonly ReverseRef[]) {
    if (skip.has(r.type)) continue;
    const kind = r.from.slice(0, r.from.indexOf(":")) as EntityKind;
    (byKind.get(kind) ?? byKind.set(kind, new Set()).get(kind)!).add(r.from);
  }
  const order = [...APPEARS_ORDER, ...ENTITY_KINDS.filter((k) => !APPEARS_ORDER.includes(k))];
  return order
    .filter((k) => byKind.get(k)?.size)
    .map((kind) => ({ kind, refs: [...byKind.get(kind)!].sort((a, b) => registry.require(a).name.en.localeCompare(registry.require(b).name.en)) }));
}

/** Every entity ref an MDX body links to (`<EntityLink to="...">`), in order, without repeats. */
export function refsInMdx(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/<EntityLink\b[^>]*?\bto\s*=\s*["']([^"']+)["']/g)) found.add(m[1]!);
  return [...found];
}
