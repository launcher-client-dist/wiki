/**
 * The NPC data (src/data/npcs.json, written by the private export: one entry per character, the name players see).
 * A character has one or more shifts: each actor the game places under that name, with its place, its hours, its own
 * shop and services (Benedict keeps the pub by day and the square at night: one person, two shifts). Pure
 * TypeScript: the pages and the tests read it the same way.
 *
 * Never a rate. A shop's stock is a count or "unlimited"; a restock is a game hour (a game day is one real hour).
 */
import type { Localized } from "../i18n.ts";
import type { EntityRef } from "../entities/types.ts";
import type { Fallback, Place } from "../items/data.ts";

export type Stock = { kind: "limited"; n: number } | { kind: "unlimited" } | { kind: "blackMarket"; n: number };

export interface NpcSell {
  item: string;
  price: number;
  stock: Stock;
}

export interface NpcBuy {
  item: string;
  price: number;
}

export interface NpcTravel {
  /** The NPC at the far end (a boat to Rasobar) or a fixed spot. */
  npc?: EntityRef;
  place: Place;
  link: string;
  fare?: number;
}

export interface NpcServices {
  travel?: NpcTravel;
  trainer?: { class: string; price: number };
  heal?: boolean;
}

export type LineKind = "greet" | "job" | "trade" | "help" | "farewell" | "quest" | "direction" | "heal" | "skill" | "options"
  | "lore" | "reputation" | "rumors" | "apogea" | "topic";

export interface NpcLine {
  kind: LineKind;
  /** The words a player types (the game's keywords, translated where the client has them). */
  keys: (Localized & Fallback)[];
  text: Localized & Fallback;
  /** A quest hint or a secret: behind a spoiler. */
  spoiler: boolean;
}

export interface NpcShift {
  place: Place;
  /** The map link of the spot (the wiki's map opens there, the marker picked). */
  link: string;
  /** [out, back) in game hours; null: always there. */
  hours: [number, number] | null;
  /** The game hour the shop refills (once a real hour). */
  restock?: number;
  sells?: NpcSell[];
  buys?: NpcBuy[];
  services?: NpcServices;
  /** The client hides this shift until a quest. */
  spoiler: boolean;
  afterQuests: EntityRef[];
  /** This shift says other things than the character's main lines. */
  conversation?: NpcLine[];
}

export interface NpcData {
  id: string;
  ref: EntityRef;
  /** The game's own description ("Benedict, the merchant."). */
  title: Localized & Fallback;
  /** Its own Job line ("I'm a noble trader..."). */
  job?: Localized & Fallback;
  shifts: NpcShift[];
  conversation: NpcLine[];
  quests: EntityRef[];
  near: EntityRef[];
  /** Matters only inside a quest: the page's body is a spoiler. */
  spoiler: boolean;
  render?: { src: string; size: [number, number] };
  grid?: string;
}

export interface NpcsFile {
  npcs: NpcData[];
}

export function npcRef(id: string): EntityRef {
  return `npc:${id}` as EntityRef;
}

/** A shift's anchor on its page ("#turno-2"): the map's marker for that actor opens there. */
export function shiftAnchor(i: number): string {
  return `turno-${i + 1}`;
}

/** The order of the Conversa: greeting, job, trade, help, the topics, the farewell. */
export const LINE_ORDER: LineKind[] = ["greet", "job", "trade", "help", "skill", "reputation", "rumors", "direction", "lore",
  "apogea", "options", "heal", "topic", "quest", "farewell"];

/** The item kinds an NPC trades (for the list's icons and filters): the items' categories, most first. */
export function tradeKinds(n: NpcData, categoryOf: (item: string) => string | undefined, which: "sells" | "buys"): string[] {
  const c = new Map<string, number>();
  for (const sh of n.shifts) for (const r of sh[which] ?? []) {
    const k = categoryOf(r.item);
    if (k) c.set(k, (c.get(k) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** The services an NPC offers, by key, over all its shifts. */
export function serviceKeys(n: NpcData): ("travel" | "trainer" | "heal")[] {
  const out = new Set<"travel" | "trainer" | "heal">();
  for (const sh of n.shifts) for (const k of Object.keys(sh.services ?? {}) as ("travel" | "trainer" | "heal")[]) out.add(k);
  return [...out];
}

export function hasHours(n: NpcData): boolean {
  return n.shifts.some((s) => s.hours !== null);
}
