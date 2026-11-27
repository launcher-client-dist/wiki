/**
 * The place data (src/data/places.json, written by the private export): the game's own map names (the names players
 * see on their in-game map) and one page per temple town. A place holds what stands in its area (the private
 * export's area rule: the nearest map name, within reach, height counting): NPCs, services, monsters and bosses,
 * entrances (ropes, ladders, holes, portals, manholes) and the items on the ground. Pure TypeScript: the pages and the
 * tests read it the same way.
 *
 * Never a rate, never a route: a place links the wiki's map, nothing more.
 */
import type { Localized } from "../i18n.ts";
import type { EntityRef } from "../entities/types.ts";
import type { Fallback } from "../items/data.ts";

export type ServiceKind = "temple" | "depot" | "forge" | "runeTable" | "well" | "cook" | "dock";
export type EntranceKind = "rope" | "ladder" | "portal" | "hole" | "manhole";

export interface PlaceNpc {
  ref: EntityRef;
  /** The NPC's shift that stands here (its page's #turno-N). */
  shift: number;
  /** Behind a quest (a later shift, or a quest-only NPC). */
  spoiler?: boolean;
}

export interface PlaceMonster {
  ref: EntityRef;
  /** Spawn points in this place. */
  count: number;
  link: string;
}

export interface PlaceBoss {
  ref: EntityRef;
  /** [from, to) game hours. */
  hours: [number, number];
  link: string;
  /** One of several spots the boss picks each window. */
  oneOf?: boolean;
  invasion?: boolean;
}

export interface PlaceItem {
  ref: EntityRef;
  /** Spots on the ground here. */
  n: number;
  spoiler?: boolean;
}

export interface PlaceEntrance {
  kind: EntranceKind;
  /** out: from here to the other place; in: from the other place to here. */
  dir: "out" | "in";
  /** The place at the other end (none: the open world, past every map name's reach). */
  other?: EntityRef;
  n: number;
  /** This end on the wiki's map. */
  link: string;
  /** Something opens the way first (the game's own gate; which one is never said). */
  gated?: boolean;
  oneWay?: boolean;
}

export interface PlaceService {
  kind: ServiceKind;
  n: number;
}

export interface PlaceData {
  id: string;
  ref: EntityRef;
  kind: "town" | "place";
  name: Localized & Fallback;
  /** A town's own names on the game's map ("Nordha Town Center"). */
  mapNames?: (Localized & Fallback)[];
  /** The town page of a place's region. */
  town?: EntityRef;
  link: string;
  /** The map floors it spans, top first ("s" the surface). */
  floors: string[];
  underground: boolean;
  npcs: PlaceNpc[];
  services: PlaceService[];
  monsters: PlaceMonster[];
  bosses: PlaceBoss[];
  items: PlaceItem[];
  entrances: PlaceEntrance[];
  /** Ropes, ladders… with both ends inside, per kind. */
  inner?: Partial<Record<EntranceKind, number>>;
  /** A suggestion from its monsters (their bands, by spawn count). */
  level?: { min: number; max: number };
  near: EntityRef[];
  /** A town: its region's places, nearest first. */
  places?: EntityRef[];
  /** A town: the places of the town itself (their NPCs and services gather on the town's page). */
  core?: EntityRef[];
  render?: { src: string; size: [number, number] };
}

export interface PlacesFile {
  places: PlaceData[];
}

export const SERVICE_ORDER: readonly ServiceKind[] = ["temple", "depot", "forge", "runeTable", "well", "cook", "dock"];
export const ENTRANCE_ORDER: readonly EntranceKind[] = ["rope", "ladder", "portal", "hole", "manhole"];

/** A town's NPCs and services: its own and its core places' (a town page shows the town as one place). */
export function gathered(p: PlaceData, all: readonly PlaceData[]): { npcs: PlaceNpc[]; services: PlaceService[] } {
  if (p.kind !== "town") return { npcs: p.npcs, services: p.services };
  const byRef = new Map(all.map((x) => [x.ref, x]));
  const parts = [p, ...(p.core ?? []).map((r) => byRef.get(r)).filter((x): x is PlaceData => !!x)];
  const npcs: PlaceNpc[] = [];
  for (const part of parts) for (const n of part.npcs) if (!npcs.some((m) => m.ref === n.ref)) npcs.push(n);
  const count = new Map<ServiceKind, number>();
  for (const part of parts) for (const s of part.services) count.set(s.kind, (count.get(s.kind) ?? 0) + s.n);
  const services = SERVICE_ORDER.filter((k) => count.has(k)).map((k) => ({ kind: k, n: count.get(k)! }));
  return { npcs, services };
}

/** A floor's label key: the surface, an upper floor or a floor below. */
export function floorWord(f: string): { kind: "surface" | "up" | "down"; n: number } {
  if (f === "s") return { kind: "surface", n: 0 };
  const n = Number(f);
  return n > 0 ? { kind: "up", n } : { kind: "down", n: Math.abs(n) };
}

/** What a place is, for its icon and the list's filters. */
export function hasHunting(p: PlaceData): boolean {
  return p.monsters.length > 0 || p.bosses.length > 0;
}
