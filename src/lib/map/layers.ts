/**
 * The map's layers in one language, from src/data/map/points.json (the private map tool: every point's game x, z and
 * page floor, by the wiki's refs) and the registry (names, links, icons). Pure: the data endpoints, the page and the
 * tests share it.
 *
 * One file per layer and language (/map-data/<lang>/<layer>.json), loaded when the layer is first shown:
 *   e  the layer's entries: {r ref, n name, a translation, u page URL or null, i icon {s, w, h, px}, k key fact}
 *   p  its points: [x, z, floor, entry index, count] (bosses add the window's game hours [h0, h1], 1 for an invasion, and
 *      for a boss that picks one of N spots: N and that spot's picks k in n (0, 0 when even), else 0, 0, 0;
 *      monster groups add their creatures' cells, "dx,dz,dx,dz..." from the group's spot, or "" to stay one marker)
 * The quest things (spoilers: items and NPCs that only appear in a quest) are left out of the layers and kept in their
 * own file, `spoiler`, loaded only when the reader turns the switch on, or for a deep link to one of them.
 */
import type { Lang } from "../i18n.ts";
import { LOCALE } from "../i18n.ts";
import { ui, fill } from "../../i18n/index.ts";
import type { Registry } from "../entities/registry.ts";
import { displayName } from "../names.ts";
import pointsJson from "../../data/map/points.json";
import spritesJson from "../../data/map/sprites.json";
import uiSizes from "../../data/ui-icons.json";
import type { MonsterData } from "../monsters/data.ts";

export const LAYERS = ["monsters", "bosses", "npcs", "places", "items"] as const;
export type LayerKey = (typeof LAYERS)[number];
/** Shown when the map opens (the user, 2026-11-26; the bosses too, 2026-11-27). */
export const DEFAULT_ON: readonly LayerKey[] = ["places", "npcs", "monsters", "bosses"];
export const PLACE_KINDS = ["temple", "depot", "well", "forge", "runeTable", "cook", "dock"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
/** Each layer's and place kind's game icon (src/data/ui-icons.json). */
export const LAYER_ICON: Record<LayerKey, string> = { monsters: "src-drop", bosses: "boss", npcs: "src-shop", places: "house", items: "stack" };
export const PLACE_ICON: Record<PlaceKind, string> = { temple: "house", depot: "stack", well: "cat-drink", forge: "anvil", runeTable: "rune", cook: "src-cook", dock: "src-map" };

interface RawPoint { x: number; z: number; f: string; ref?: string; n?: number; cells?: [number, number][]; kind?: PlaceKind; town?: string; hours?: [number, number]; invasion?: boolean; oneOf?: number; picks?: [number, number]; sells?: number; buys?: number; spoiler?: boolean; npc?: string; shift?: number }
export interface PointsFile { floors: string[]; layers: Record<LayerKey, RawPoint[]> }
export const POINTS = pointsJson as unknown as PointsFile;

export interface Icon { s: string; w: number; h: number; px?: boolean }
/** A card fact, never bare text: a game icon (at its largest whole scale within 20 px: w, h) and its words, or a gold value. */
export type Fact = [icon: string, text: string, w: number, h: number] | ["$gold", number];
/** A walking sprite (public/sprites/<f>-<h>.webp: its frames side by side; <f>-<h>.png: the first frame): n frames of
 *  ms each, w32 / w64 px wide at 32 / 64 px tall. */
export interface Sprite { f: string; n: number; ms: number; w32: number; w64: number; p?: number }
export const SPRITES = spritesJson as unknown as Record<string, Sprite>;
export interface Entry { r: string; n: string; a?: string; u: string | null; i?: Icon; k?: string; x?: Fact[]; sp?: Sprite }
export type Point = (number | string)[];
export interface LayerFile { e: Entry[]; p: Point[] }

const UI = uiSizes as Record<string, number[]>;
const uiIcon = (name: string): Icon => ({ s: `/ui/${name}.png`, w: UI[name]![0]!, h: UI[name]![1]!, px: true });
/** A fact with its game icon at the largest whole scale that fits 20 px (GameIcon's `fit` rule: the pixels stay sharp). */
export function fact(icon: string, text: string): Fact {
  const [w, h] = UI[icon] as [number, number];
  if (!w) throw new Error(`map fact: no game icon "${icon}"`);
  const k = Math.max(1, Math.floor(20 / Math.max(w, h)));
  return [icon, text, w * k, h * k];
}

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
export function buildLayers(lang: Lang, registry: Registry, monsters: readonly MonsterData[], items: readonly { id: string; value: { npcPays: number | null } }[] = []): Record<LayerKey | "spoiler", LayerFile> {
  const t = ui(lang);
  const tm = t.map;
  const num = (n: number) => n.toLocaleString(LOCALE[lang]);
  const byId = new Map(monsters.map((m) => [m.id, m]));
  const pays = new Map(items.map((i) => [i.id, i.value.npcPays]));
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
    const entity = (ref: string, facts: Fact[]): Entry => {
      const e = registry.require(ref);
      const kind = ref.slice(0, ref.indexOf(":")) as "monster";
      const dn = displayName(e.name, kind, lang);
      // k: the facts' words, for the search and the result's second line
      const words = facts.filter((f): f is [string, string, number, number] => f[0] !== "$gold").map((f) => f[1]).join(" · ");
      return { r: ref, n: dn.name, ...(dn.aid ? { a: dn.aid } : {}), u: registry.url(ref, lang), ...(e.icon ? { i: { s: e.icon.src, w: e.icon.width, h: e.icon.height, ...(e.icon.pixel ? { px: true } : {}) } } : {}),
        ...(words ? { k: words } : {}), ...(facts.length ? { x: facts } : {}), ...(SPRITES[ref] ? { sp: SPRITES[ref] } : {}) };
    };
    for (const p of POINTS.layers[layer]) {
      if (layer === "places") {
        const kind = p.kind!;
        const town = p.town ?? townOf(p.x, p.z);
        const i = entryOf(`${kind}|${town}`, () => ({ r: `place:${kind}`, n: tm.place[kind], u: null, i: uiIcon(PLACE_ICON[kind]), k: town, x: town ? [fact("house", town)] : [] }), file, idx);
        file.p.push([p.x, p.z, p.f, i, p.n ?? 1]);
        continue;
      }
      const ref = p.ref!;
      const facts: Fact[] = [];
      if (layer === "monsters" || layer === "bosses") {
        const m = byId.get(ref.slice("monster:".length));
        if (m?.level) facts.push(fact("xp", fill(tm.levelShort, m.level)));
      } else if (layer === "npcs") {
        if (p.sells) facts.push(fact("src-shop", fill(tm.sells, { n: num(p.sells) })));
        if (p.buys) facts.push(fact("gold", fill(tm.buys, { n: num(p.buys) })));
      } else if (layer === "items") {
        const it = registry.require(ref);
        const f0 = it.facts?.[0];
        if (f0) facts.push(fact(f0.icon ?? "stack", typeof f0.value === "string" ? f0.value : f0.value[lang]));
        const gold = pays.get(ref.slice("item:".length));
        if (gold) facts.push(["$gold", gold]);
      }
      const target = p.spoiler ? spoiler : file;
      const map = p.spoiler ? spoilerIdx : idx;
      // an NPC's entry is per shift: each marker's card shows that shift's own shop (Benedict at the pub, at the square)
      const i = entryOf(layer === "npcs" ? `${ref}#${p.shift ?? 0}` : ref, () => entity(ref, facts), target, map);
      const row: Point = [p.x, p.z, p.f, i, p.n ?? 1];
      if (layer === "bosses") row.push(p.hours?.[0] ?? -1, p.hours?.[1] ?? -1, p.invasion ? 1 : 0, p.oneOf ?? 0, p.picks?.[0] ?? 0, p.picks?.[1] ?? 0);
      // a monster group's creatures, each on its own spawn cell (offsets from the group's spot, flat: dx, dz, ...); none
      // where the group must stay one marker
      if (layer === "monsters") row.push(p.cells ? p.cells.flat().join(",") : "");
      // an NPC's marker is one of its shifts (an actor): its card opens the page at that shift (#turno-N)
      if (layer === "npcs") row.push(p.shift ?? 0);
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
