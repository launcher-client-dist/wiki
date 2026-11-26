/**
 * The wiki's own map: its address per language and its deep links.
 *
 * A deep link opens a spot on its floor with a marker and, when it names an entity, every spot of that entity:
 *   /pt/mapa/?f=-4&x=-196&z=154&e=monster:swamp-troll
 *   f  the floor ("s" the surface, else the slice: 10 ... -16)   x, z  the game's cell (as /pos prints it)
 *   e  an entity ref (monster:..., npc:..., item:...): its spots light up, on every floor
 * Every part is optional; a bad one is ignored (the map still opens). The page's canonical URL is the bare address, so
 * search engines see one map page per language. Later Place pages link to it the same way.
 *
 * The data files hold the export's links (the editor's format); `links.json` (written by the private map tool from the
 * same data) turns each into its cell and floor, so every "ver no mapa" opens here. A link missing from it fails the
 * build: the index is stale (run the map tool after the export).
 */
import type { Lang } from "../i18n.ts";
import linksJson from "../../data/map/links.json" with { type: "json" };

export const MAP_SLUG: Record<Lang, string> = { pt: "mapa", en: "map", es: "mapa" };

export function mapPath(lang: Lang): string {
  return `/${lang}/${MAP_SLUG[lang]}/`;
}

export interface Spot {
  x: number;
  z: number;
  f: string;
}

const LINKS = linksJson as unknown as Record<string, [number, number, string]>;

/** A data file's map link as its spot. Throws (the build fails) for a link the index doesn't know. */
export function spotOf(link: string): Spot {
  const v = LINKS[link];
  if (!v) throw new Error(`map link not in src/data/map/links.json (run the map tool after the export): ${link.slice(0, 80)}`);
  return { x: v[0], z: v[1], f: v[2] };
}

/** The map's deep link: a spot, an entity, both, or neither (the map's home). */
export function mapHref(lang: Lang, spot?: Spot | null, entity?: string | null): string {
  const q = new URLSearchParams();
  if (spot) {
    q.set("f", spot.f);
    q.set("x", String(spot.x));
    q.set("z", String(spot.z));
  }
  if (entity) q.set("e", entity);
  const s = q.toString().replace(/%3A/gi, ":");
  return `${mapPath(lang)}${s ? `?${s}` : ""}`;
}

/** A deep link's parts, read leniently: anything malformed is dropped. */
export function readDeepLink(search: string, floors: readonly string[]): { spot: Spot | null; floor: string | null; entity: string | null } {
  const q = new URLSearchParams(search);
  const f = q.get("f");
  const floor = f && floors.includes(f) ? f : null;
  const x = Number(q.get("x")), z = Number(q.get("z"));
  const ok = q.has("x") && q.has("z") && Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) < 5000 && Math.abs(z) < 5000;
  const e = q.get("e");
  const entity = e && /^(monster|npc|item|place|quest|spell):[a-z0-9-]+$/.test(e) ? e : null;
  return { spot: ok ? { x: Math.round(x), z: Math.round(z), f: floor ?? "s" } : null, floor, entity };
}
