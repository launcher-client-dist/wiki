/**
 * The map's layers in one language, from src/data/map/points.json (the private map tool: every point's game x, z and
 * page floor, by the wiki's refs) and the registry (names, links, icons). Pure: the data endpoints, the page and the
 * tests share it.
 *
 * One file per layer and language (/map-data/<lang>/<layer>.json), loaded when the layer is first shown:
 *   e  the layer's entries: {r ref, n name, a translation, u page URL or null, i icon {s, w, h, px}, k key fact}
 *   p  its points: [x, z, floor, entry index, count] (bosses add the window's game hours [h0, h1] and 1 for an invasion)
 * The quest things (spoilers: items and NPCs that only appear in a quest) are left out of the layers and kept in their
 * own file, `spoiler`, loaded only when the reader turns the switch on, or for a deep link to one of them.
 */
import type { Lang } from "../i18n.ts";
import { LOCALE } from "../i18n.ts";
import { ui, fill } from "../../i18n/index.ts";
import type { Registry } from "../entities/registry.ts";
import { displayName } from "../names.ts";
import pointsJson from "../../data/map/points.json";
import uiSizes from "../../data/ui-icons.json";
import type { MonsterData } from "../monsters/data.ts";

export const LAYERS = ["monsters", "bosses", "npcs", "places", "items"] as const;
export type LayerKey = (typeof LAYERS)[number];
/** Shown when the map opens (the user, 2026-11-26). */
export const DEFAULT_ON: readonly LayerKey[] = ["places", "npcs", "monsters"];
export const PLACE_KINDS = ["temple", "depot", "well", "forge", "runeTable", "cook", "dock"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
/** Each layer's and place kind's game icon (src/data/ui-icons.json). */
export const LAYER_ICON: Record<LayerKey, string> = { monsters: "src-drop", bosses: "boss", npcs: "src-shop", places: "house", items: "stack" };
export const PLACE_ICON: Record<PlaceKind, string> = { temple: "house", depot: "stack", well: "cat-drink", forge: "anvil", runeTable: "rune", cook: "src-cook", dock: "src-map" };

interface RawPoint { x: number; z: number; f: string; ref?: string; n?: number; kind?: PlaceKind; town?: string; hours?: [number, number]; invasion?: boolean; sells?: number; buys?: number; spoiler?: boolean; npc?: string }
export interface PointsFile { floors: string[]; layers: Record<LayerKey, RawPoint[]> }
export const POINTS = pointsJson as unknown as PointsFile;

export interface Icon { s: string; w: number; h: number; px?: boolean }
export interface Entry { r: string; n: string; a?: string; u: string | null; i?: Icon; k?: string }
export type Point = (number | string)[];
export interface LayerFile { e: Entry[]; p: Point[] }

const UI = uiSizes as Record<string, number[]>;
const uiIcon = (name: string): Icon => ({ s: `/ui/${name}.png`, w: UI[name]![0]!, h: UI[name]![1]!, px: true });

/** The nearest temple's town of a point (a place's fact: "Poço · Basile"). */
function townOf(x: number, z: number): string {
  let best = "", d = Infinity;
  for (const t of POINTS.layers.places) {
    if (t.kind !== "temple" || !t.town) continue;
    const dd = (t.x - x) ** 2 + (t.z - z) ** 2;
    if (dd < d) { d = dd; best = t.town; }
  }
  return best;
}

/** Every layer and the spoiler file in one language. */
export function buildLayers(lang: Lang, registry: Registry, monsters: readonly MonsterData[]): Record<LayerKey | "spoiler", LayerFile> {
  const t = ui(lang);
  const tm = t.map;
  const num = (n: number) => n.toLocaleString(LOCALE[lang]);
  const byId = new Map(monsters.map((m) => [m.id, m]));
  const out = {} as Record<LayerKey | "spoiler", LayerFile>;
  const spoiler: LayerFile = { e: [], p: [] };
  const spoilerIdx = new Map<string, number>();
  for (const layer of LAYERS) {
    const file: LayerFile = { e: [], p: [] };
    const idx = new Map<string, number>();
    const entryOf = (key: string, make: () => Entry, target: LayerFile, map: Map<string, number>) => {
      let i = map.get(key);
      if (i === undefined) { i = target.e.length; target.e.push(make()); map.set(key, i); }
      return i;
    };
    const entity = (ref: string, fact: string | undefined): Entry => {
      const e = registry.require(ref);
      const kind = ref.slice(0, ref.indexOf(":")) as "monster";
      const dn = displayName(e.name, kind, lang);
      return { r: ref, n: dn.name, ...(dn.aid ? { a: dn.aid } : {}), u: registry.url(ref, lang), ...(e.icon ? { i: { s: e.icon.src, w: e.icon.width, h: e.icon.height, ...(e.icon.pixel ? { px: true } : {}) } } : {}), ...(fact ? { k: fact } : {}) };
    };
    for (const p of POINTS.layers[layer]) {
      if (layer === "places") {
        const kind = p.kind!;
        const town = p.town ?? townOf(p.x, p.z);
        const i = entryOf(`${kind}|${town}`, () => ({ r: `place:${kind}`, n: tm.place[kind], u: null, i: uiIcon(PLACE_ICON[kind]), k: town }), file, idx);
        file.p.push([p.x, p.z, p.f, i, p.n ?? 1]);
        continue;
      }
      const ref = p.ref!;
      let fact: string | undefined;
      if (layer === "monsters" || layer === "bosses") {
        const m = byId.get(ref.slice("monster:".length));
        fact = m?.level ? fill(tm.levelShort, m.level) : undefined;
      } else if (layer === "npcs") {
        fact = [p.sells ? fill(tm.sells, { n: num(p.sells) }) : "", p.buys ? fill(tm.buys, { n: num(p.buys) }) : ""].filter(Boolean).join(" · ") || undefined;
      } else if (layer === "items") {
        const it = registry.require(ref);
        fact = it.facts?.[0] ? (typeof it.facts[0].value === "string" ? it.facts[0].value : it.facts[0].value[lang]) : undefined;
      }
      const target = p.spoiler ? spoiler : file;
      const map = p.spoiler ? spoilerIdx : idx;
      const i = entryOf(ref, () => entity(ref, fact), target, map);
      const row: Point = [p.x, p.z, p.f, i, p.n ?? 1];
      if (layer === "bosses") row.push(p.hours?.[0] ?? -1, p.hours?.[1] ?? -1, p.invasion ? 1 : 0);
      if (p.spoiler) row.push(LAYERS.indexOf(layer));
      target.p.push(row);
    }
    out[layer] = file;
  }
  out.spoiler = spoiler;
  return out;
}

/** How many markers each layer shows (the page's no-JS text and its layer list). */
export function layerCounts(): Record<LayerKey, number> {
  return Object.fromEntries(LAYERS.map((l) => [l, POINTS.layers[l].filter((p) => !p.spoiler).length])) as Record<LayerKey, number>;
}
