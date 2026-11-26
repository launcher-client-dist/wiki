/**
 * The map's "Ir para" box and search: what a typed or pasted text means. No DOM: the page and the tests share it.
 * The place parsing is the map editor's (goto.js), so a /pos line means the same on both.
 *
 * A place: the game's /pos line ("[pos] x -271.0, y -1.2, z 283.0 (floor -2)"), "x, z" or "x, y, z". The game prints
 * "(floor N)" with N = round(y - 0.8) on the surface too (a hill at y 3.3 says "floor 2"), so a floor tag or a y names a
 * slice that may or may not be where the player stood: the map offers that slice when it has map at the spot, else
 * the surface.
 */
export interface Place {
  x: number;
  z: number;
  y: number | null;
  tag: string | null;
}

const NUM = "(-?\\d+(?:[.,]\\d+)?)";
const num = (s: string) => +String(s).replace(",", ".");

/** {x, z, y (or null), tag ("s", a floor id, or null)}, or null when the text is not a place. */
export function parsePlace(text: string | null | undefined): Place | null {
  let s = String(text ?? "").toLowerCase().trim();
  if (!s) return null;
  let tag: string | null = null;
  const surf = s.match(/\(\s*surface\s*\)/), fl = s.match(/\(\s*floor\s*(-?\d+)\s*\)/);
  if (surf) tag = "s";
  else if (fl) tag = String(+fl[1]!);
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[pos\]/g, " ");
  const named = (k: string) => s.match(new RegExp(`(?:^|[^a-z])${k}\\s*[:=]?\\s*${NUM}`));
  const nx = named("x"), nz = named("z"), ny = named("y");
  let x: number, z: number, y: number | null = null;
  if (nx && nz) {
    x = num(nx[1]!);
    z = num(nz[1]!);
    if (ny) y = num(ny[1]!);
  } else {
    if (/[a-z]/.test(s.replace(/\b[xyz]\b/g, ""))) return null; // words: a search, not a place
    const ns = [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
    if (ns.length === 2) [x, z] = ns as [number, number];
    else if (ns.length === 3) [x, y, z] = ns as [number, number, number];
    else return null;
  }
  if (![x, z].every(Number.isFinite)) return null;
  return { x: Math.round(x) || 0, z: Math.round(z) || 0, y: y == null || !Number.isFinite(y) ? null : y, tag };
}

/** The floors a place may be on, the likeliest first; null: keep the floor shown now. */
export function placeFloors(place: Place, floors: readonly string[], hasMap: (f: string, x: number, z: number) => boolean = () => true): string[] | null {
  if (place.tag === "s") return ["s"];
  const n = place.tag ?? (place.y != null ? String(Math.round(place.y - 0.8)) : null);
  if (n == null) return null;
  const slice = String(+n);
  if (!floors.includes(slice)) return ["s"];
  return hasMap(slice, place.x, place.z) ? [slice, "s"] : ["s", slice];
}

/** Lower case, no accents: "Superfície" ~ "superficie". */
export function fold(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Entries whose text holds every word of the query, the best first (a word at the start, then the shortest). */
export function search<T>(entries: readonly T[], query: string, textOf: (e: T) => string, max = 8): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: [number, number, T][] = [];
  for (const e of entries) {
    const t = fold(textOf(e));
    if (!t || !words.every((w) => t.includes(w))) continue;
    hits.push([t.startsWith(words[0]!) || t.includes(` ${words[0]}`) ? 0 : 1, t.length, e]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, max).map((h) => h[2]);
}

/** How high a floor is: the surface between floor 0 and floor 1. */
export const level = (f: string) => (f === "s" ? 0.5 : +f);
