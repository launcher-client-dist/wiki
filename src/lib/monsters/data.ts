/**
 * The monster data (src/data/monsters.json, written by the private export: one entry per monster name, every way the
 * game brings it out). Pure TypeScript: the pages and the tests read it the same way.
 *
 * Never a rate: drops carry a tier, odds are "1 in N", the loot value is rounded to two significant digits.
 */
import { LOCALE, type Lang, type Localized } from "../i18n.ts";
import type { EntityRef } from "../entities/types.ts";
import type { TierKey } from "../entities/tiers.ts";
import type { Fallback, OneIn, Place } from "../items/data.ts";

export const MONSTER_STAT_KEYS = ["health", "exp", "damage", "armor", "defense", "magic", "attackSpeed", "moveSpeed", "range"] as const;
export type MonsterStatKey = (typeof MONSTER_STAT_KEYS)[number];
export type MonsterStats = Record<MonsterStatKey, number>;

export const SPELL_KINDS = ["at", "around", "leap", "heal", "summon", "buff"] as const;
export type SpellKind = (typeof SPELL_KINDS)[number];

export interface MonsterSpell {
  key: number;
  kind: SpellKind;
  /** Seconds between tries. */
  cooldown: number;
  /** Each try: 1 in N. */
  oneIn: OneIn;
  /** A spell players learn too: the game's name and its page. */
  spell?: EntityRef;
  damage?: number;
  heal?: number;
  icon?: string;
  element: number;
  ranged?: boolean;
  debuff?: { stat: "moveSpeed" | "attackSpeed" | "armor"; value: number; seconds: number };
  buff?: { stat: string; value: number; seconds: number };
  push?: number;
}

export interface MonsterSummon {
  monster: string;
  kind: "boss" | "waves" | "copies";
  perCast?: number;
  cap?: number;
  every?: number;
}

export interface MonsterBehaviour {
  jumpsFloors: boolean;
  flees: boolean;
  seesInvisible: boolean;
  spellsOnly: boolean;
  leaps?: { every: number; oneIn?: OneIn };
  summons?: MonsterSummon[];
  onDeath?: string;
}

export interface MonsterVersion {
  stats: MonsterStats;
  respawn: number[];
  spells: MonsterSpell[];
  behaviour: MonsterBehaviour;
}

export interface MonsterDrop {
  item: string;
  tier: TierKey;
  amount: [number, number];
  quality: boolean;
  unique: boolean;
}

export interface MonsterPlace {
  place: Place;
  count: number;
  link: string;
}

export interface MonsterWindow {
  /** [start, end) game hours. */
  hours: [number, number];
  place: Place;
  link: string;
  invasion?: boolean;
  oneNightIn?: number;
  /** The boss comes out at ONE of these each window (the first is `place`), with `picks` [k, n] (k times in n) when they differ. */
  spots?: MonsterSpot[];
}

export interface MonsterSpot {
  place: Place;
  link: string;
  picks?: [number, number];
}

export type MonsterHow = "spawn" | "timed" | "placed" | "lever" | "travel" | "summon";

export interface MonsterData extends MonsterVersion {
  id: string;
  how: MonsterHow;
  boss: boolean;
  level: { min: number; max: number } | null;
  drops: MonsterDrop[];
  loot: number | null;
  places: MonsterPlace[];
  windows: MonsterWindow[];
  family: string | null;
  versions?: MonsterVersion[];
  variants: string[];
  summonedBy?: string[];
  render?: { src: string; size: [number, number] };
  grid?: string;
}

export interface MonstersFile {
  monsters: MonsterData[];
}

export function monsterRef(id: string): EntityRef {
  return `monster:${id}`;
}

/** Where a stat stands among every monster that has it, biggest first (ties share the better rank). */
export interface MonsterRank {
  rank: number;
  of: number;
  /** 0..1 along the bar: the value against the biggest, on a square-root scale (health runs 10 to 30,000). */
  share: number;
}

export function monsterRank(all: readonly MonsterData[], m: MonsterData, key: MonsterStatKey): MonsterRank | null {
  const mine = m.stats[key];
  if (!mine) return null;
  const values = all.map((o) => o.stats[key]).filter((n) => n > 0);
  const rank = 1 + values.filter((n) => n > mine).length;
  const max = Math.max(...values);
  return { rank, of: values.length, share: Math.sqrt(mine / max) };
}

/** Experience per point of health (what a kill pays for the work), two decimals. */
export function expPerHealth(m: MonsterData): number | null {
  return m.stats.health > 0 && m.stats.exp > 0 ? Math.round((m.stats.exp / m.stats.health) * 100) / 100 : null;
}

/** A window's places: every spot of a boss that picks one, else its one place. */
export const windowPlaces = (w: MonsterWindow): Place[] => (w.spots ? w.spots.map((s) => s.place) : [w.place]);

/** The town names a monster lives in (its spawn places, else its windows' places). */
export function towns(m: MonsterData): string[] {
  return [...new Set([...m.places.map((p) => p.place.town.en), ...m.windows.flatMap(windowPlaces).map((p) => p.town.en)])];
}

/** Behaviour flags, as filter values. */
export const BEHAVIOUR_KEYS = ["jumpsFloors", "leaps", "flees", "seesInvisible", "summons", "spellsOnly", "onDeath"] as const;
export type BehaviourKey = (typeof BEHAVIOUR_KEYS)[number];
export function behaviourKeys(m: MonsterData): BehaviourKey[] {
  const b = m.behaviour;
  return BEHAVIOUR_KEYS.filter((k) => (k === "leaps" ? !!b.leaps : k === "summons" ? !!b.summons?.length : k === "onDeath" ? !!b.onDeath : !!b[k]));
}

/** The middle of a level band (a summoned creature with no band: by its exp alone, through the same curve). */
function mid(m: MonsterData): number {
  return m.level ? (m.level.min + m.level.max) / 2 : 0;
}

/**
 * Similar monsters: the nearest level band first; a shared family, then a shared town, break near ties (within three
 * levels). Never the monster itself, its variants (they have their own line), nor a summoned-only creature.
 */
export function similarMonsters(all: readonly MonsterData[], m: MonsterData, n = 6): MonsterData[] {
  if (!m.level) return [];
  const mine = new Set(towns(m));
  const score = (o: MonsterData) => {
    const d = Math.abs(mid(o) - mid(m));
    const fam = m.family && o.family === m.family ? 1 : 0;
    const town = towns(o).some((t) => mine.has(t)) ? 1 : 0;
    return Math.floor(d / 3) * 10 - fam * 2 - town;
  };
  // a boss beside bosses, a common monster beside common ones (a boss of the same band is no "similar" hunt)
  const pool = all.filter((o) => o.id !== m.id && o.level && !m.variants.includes(o.id));
  const same = pool.filter((o) => o.boss === m.boss);
  return (same.length >= n ? same : pool)
    .map((o) => ({ o, s: score(o), d: Math.abs(mid(o) - mid(m)) }))
    .sort((a, b) => a.s - b.s || a.d - b.d || a.o.id.localeCompare(b.o.id))
    .slice(0, n)
    .map((x) => x.o);
}

/** A respawn as the page shows it: "60 s", "7,5 min", "2–4 min" (minutes from two minutes up). */
export function respawnText(r: readonly number[], lang: Lang): string {
  const mins = r.every((s) => s >= 120);
  const fmt = (s: number) => (mins ? Math.round((s / 60) * 10) / 10 : s).toLocaleString(LOCALE[lang]);
  const parts = r.length > 1 && r[0] !== r[1] ? `${fmt(r[0]!)}–${fmt(r[1]!)}` : fmt(r[0]!);
  return `${parts} ${mins ? "min" : "s"}`;
}

/** Game hour H starts at real second H × 150 of every hour (a game day is one real hour): "15:00", "22:30". */
export function realOffset(hour: number): string {
  const s = (hour % 24) * 150;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function gameHour(h: number): string {
  return `${String(h % 24).padStart(2, "0")}:00`;
}

/** The town and the spot near it, as one line ("Dorosam · perto de ..."). */
export function placeLine(p: Place, lang: Lang, near: string, underground: string): string {
  return `${p.town[lang]}${p.near ? ` · ${near} ${p.near[lang]}` : ""}${p.underground ? ` · ${underground}` : ""}`;
}

export type { Fallback, Localized };
