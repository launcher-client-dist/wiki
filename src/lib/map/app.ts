/**
 * The wiki map in the browser (view only). The page (src/pages/[lang]/[map]/index.astro) renders the panels and text;
 * this fills in the map: Leaflet 1.9.4 on CRS.Simple with the map editor's projection (cell x, z -> zoom-0 pixel
 * x + 0.5, -z + 0.5; 256 cells a tile at zoom 0), the wiki's own tile copy, the layers (loaded per layer), the floors,
 * search, "Ir para", the cards, the deep links and the phone drawer.
 */
import L from "leaflet";
import { parsePlace, placeFloors, search, level } from "./goto.ts";
import { readDeepLink, type Spot } from "./links.ts";
import { nextWindow, windowSeconds } from "../monsters/window.ts";
import type { Entry, Fact, LayerFile, LayerKey } from "./layers.ts";

interface TileMeta { version: string; bounds: [[number, number], [number, number]]; floors: string[]; tiles: Record<string, Record<string, string[]>> }
interface Strings {
  surface: string; floorN: string; up: string; down: string; searchEmpty: string; gotoBad: string; openPage: string; noPage: string;
  spotsN: string; spotsHere: string; otherFloors: string; pin: string; zoomIn: string; zoomOut: string; layer: Record<LayerKey, string>;
  next: string; now: string; clock: string; close: string;
  spot1: string; floor1: string; floorsF: string; spotsIn: string; highlighted: string; clearHighlight: string; hereTitle: string; zoomToSee: string; pays: string;
}
interface Config { lang: string; layers: LayerKey[]; defaultOn: LayerKey[]; floors: string[]; meta: TileMeta; icons: Record<string, [number, number]>; s: Strings }

const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const CRS = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1, 0.5, -1, 0.5) });
const ll = (x: number, z: number) => L.latLng(z, x);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Loaded { file: LayerFile; layer: LayerKey | "spoiler" }
interface Mark { layer: LayerKey; entry: Entry; x: number; z: number; f: string; n: number; hours?: [number, number]; invasion?: boolean; cells?: number[] }

export function startMap(root: HTMLElement): void {
  const cfg = JSON.parse(root.dataset.config!) as Config;
  const s = cfg.s;
  const canvas = root.querySelector<HTMLElement>("[data-map-canvas]")!;
  const panel = root.querySelector<HTMLElement>("[data-panel]")!;
  const meta = cfg.meta;
  const allFloors = meta.floors;
  const floorName = (f: string) => (f === "s" ? s.surface : s.floorN.replace("{n}", f));
  const bounds = L.latLngBounds(meta.bounds as L.LatLngBoundsLiteral);

  // ---- the map
  const map = L.map(canvas, {
    crs: CRS, minZoom: -2, maxZoom: 4, zoomSnap: 1, attributionControl: false, zoomControl: false, boxZoom: false,
    maxBounds: bounds.pad(0.3), maxBoundsViscosity: 0.8, keyboard: true,
  });
  L.control.zoom({ position: "bottomright", zoomInTitle: s.zoomIn, zoomOutTitle: s.zoomOut }).addTo(map);
  // Leaflet focuses the map on a click; its focus ring is for the keyboard only
  canvas.addEventListener("pointerdown", () => canvas.classList.add("by-pointer"));
  canvas.addEventListener("keydown", () => canvas.classList.remove("by-pointer"));
  const TileLayer = L.TileLayer.extend({
    getTileUrl(this: L.TileLayer & { options: { floor: string } }, c: L.Coords) {
      const have = meta.tiles[this.options.floor];
      if (!have || !(have[String(c.z)] || []).includes(`${c.x}_${c.y}`)) return BLANK;
      return `/map/tiles/${meta.version}/${this.options.floor}/${c.z}/${c.x}_${c.y}.webp`;
    },
  });
  const tiles = (floor: string, opacity = 1) => new (TileLayer as unknown as new (u: string, o: object) => L.TileLayer)("", {
    floor, opacity, tileSize: 256, minZoom: -2, maxZoom: 4, minNativeZoom: -2, maxNativeZoom: 0, noWrap: true, bounds, keepBuffer: 2, className: "px",
  });
  let floor = "s";
  let base: L.TileLayer | null = null, under: L.TileLayer | null = null;
  const marks = L.layerGroup().addTo(map);
  const pinLayer = L.layerGroup().addTo(map);

  // ---- data: one file per layer, loaded when first needed
  const loaded = new Map<string, Promise<Loaded>>();
  const load = (layer: LayerKey | "spoiler") => {
    if (!loaded.has(layer)) loaded.set(layer, fetch(`/map-data/${cfg.lang}/${layer}.json`).then((r) => r.json() as Promise<LayerFile>).then((file) => ({ file, layer })));
    return loaded.get(layer)!;
  };
  const on = new Set<LayerKey>(cfg.defaultOn);
  let spoilers = false;
  let highlight: string | null = null;
  let pin: Spot | null = null;
  const marksOf = async (layers: (LayerKey | "spoiler")[]): Promise<Mark[]> => {
    const out: Mark[] = [];
    for (const l of await Promise.all(layers.map(load))) {
      for (const p of l.file.p) {
        const layer = (l.layer === "spoiler" ? cfg.layers[p[p.length - 1] as number] : l.layer) as LayerKey;
        const m: Mark = { layer, entry: l.file.e[p[3] as number]!, x: p[0] as number, z: p[1] as number, f: String(p[2]), n: (p[4] as number) || 1 };
        if (layer === "bosses" && (p[5] as number) >= 0) { m.hours = [p[5] as number, p[6] as number]; m.invasion = p[7] === 1; }
        if (layer === "monsters" && typeof p[5] === "string" && p[5]) m.cells = p[5].split(",").map(Number);
        out.push(m);
      }
    }
    return out;
  };

  // ---- markers. Monsters, bosses and NPCs are their own walking sprite, bare on the map (no box, no border): a soft
  // dark ellipse under the feet, a small count pill under it. Places and map items are their game icon, bare too, with a dark
  // outline. Markers are gathered on the screen so none covers another: a spot closer than a marker's reach to one
  // already drawn joins it, and the group shows its first member (bosses, NPCs, monsters, places, items, in that
  // order) with the count of what it holds. Up close (zoom 3 and in) a monster group spreads out: each creature stands
  // on its own spawn cell (a seeded half-cell off it), on its own animation phase.
  // The sprites move with CSS: each sprite is one strip of its frames (public/sprites/<f>-<h>.webp), stepped by
  // steps(); the same animated WebP in many <img> plays in lockstep, a strip lets every creature take its own phase.
  // prefers-reduced-motion, or more sprites in view than STILL_PAST: the first frame (<f>-<h>.png) instead.
  const ORDER: Record<LayerKey, number> = { bosses: 0, npcs: 1, monsters: 2, places: 3, items: 4 };
  const STILL_PAST = 300;   // measured: 291 animated at a 1440 desktop zoom 1 (the busiest real view) cost 21% main thread, 28 MB of layers
  const SPREAD_FROM = 3;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const imgHtml = (i: Entry["i"], box: number) => {
    if (!i) return "";
    // a pixel icon at its largest whole scale that fits the well; a render scaled to fit (sizes inline: Leaflet's
    // stylesheet sets marker images to width: auto)
    const k = i.px ? Math.max(1, Math.floor(box / Math.max(i.w, i.h))) : 0;
    const [w, h] = i.px ? [i.w * k, i.h * k] : i.w >= i.h ? [box, Math.round((box * i.h) / i.w)] : [Math.round((box * i.w) / i.h), box];
    return `<img src="${esc(i.s)}" width="${w}" height="${h}" style="width:${w}px;height:${h}px" alt=""${i.px ? ' class="px"' : ""}>`;
  };
  /** A stable number in [0, 1) from a few integers: a creature's spot and phase never change between visits. */
  const seed = (...v: number[]) => {
    let h = 2166136261;
    for (const n of v) { h ^= Math.round(n * 997) | 0; h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10007) / 10007;
  };
  const spriteHtml = (e: Entry, h: 32 | 64, phase: number, still: boolean) => {
    const sp = e.sp!;
    const w = h === 32 ? sp.w32 : sp.w64;
    const base = `/sprites/${sp.f}-${h}`;
    if (still || reduce.matches || sp.n <= 1) return `<img class="spr" src="${base}.png" width="${w}" height="${h}" style="width:${w}px;height:${h}px" alt="" decoding="async">`;
    const dur = sp.n * sp.ms;
    // the strip slides under a one-frame window by transform (the compositor's work: no repaint per frame)
    return `<span class="spr anim" style="width:${w}px;height:${h}px;--sn:${sp.n}"><i style="width:${w * sp.n}px;height:${h}px;background-image:url(${base}.webp);animation-duration:${dur}ms;animation-timing-function:steps(${sp.n});animation-delay:${-Math.round(phase * dur)}ms"></i></span>`;
  };
  interface Group { m: Mark; all: Mark[]; refs: Set<string>; n: number; p: L.Point }
  const countOf = (m: Mark) => (m.layer === "places" ? 1 : m.n);
  let current: Mark[] = [];
  let paintId = 0;
  const tipOf = (g: Group) => {
    if (g.refs.size === 1) return esc(g.m.entry.n) + (g.n > 1 ? ` · ${esc(spotsText(g.n))}` : "");
    const names = [...new Map(g.all.map((m) => [m.entry.r + m.entry.n, m.entry.n])).values()];
    return `${names.slice(0, 4).map(esc).join(" · ")}${names.length > 4 ? ` · +${names.length - 4}` : ""}`;
  };
  /** Gathers spots on the screen: a spot closer than `reach` px to a group already made joins it (the highlighted
   *  entity's spots only among themselves; a dimmed spot under a highlighted one is left out). */
  const gather = (list: Mark[], reach: number): Group[] => {
    const groups: Group[] = [];
    const grid = new Map<string, Group[]>();
    const around = function* (p: L.Point) {
      const cx = Math.floor(p.x / reach), cy = Math.floor(p.y / reach);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) yield* grid.get(`${cx + dx}|${cy + dy}`) ?? [];
    };
    const sorted = [...list].sort((a, b) => Number(highlight === b.entry.r) - Number(highlight === a.entry.r) || ORDER[a.layer] - ORDER[b.layer] || countOf(b) - countOf(a));
    for (const m of sorted) {
      const p = map.latLngToLayerPoint(ll(m.x, m.z));
      const hit = highlight === m.entry.r;
      let join: Group | null = null, under = false;
      for (const g of around(p)) {
        if (g.p.distanceTo(p) >= reach) continue;
        const gHit = highlight === g.m.entry.r;
        if (gHit === hit) { join = g; break; }
        if (gHit) under = true;
      }
      if (join) { join.all.push(m); join.refs.add(m.entry.r + "|" + m.entry.n); join.n += countOf(m); continue; }
      if (under) continue;
      const ng: Group = { m, all: [m], refs: new Set([m.entry.r + "|" + m.entry.n]), n: countOf(m), p };
      groups.push(ng);
      const k = `${Math.floor(p.x / reach)}|${Math.floor(p.y / reach)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(ng);
    }
    return groups;
  };
  const zoomInto = (g: Group) => {
    const b = L.latLngBounds(g.all.map((m) => ll(m.x, m.z)));
    const z = map.getZoom();
    map.flyTo(b.getCenter(), Math.min(map.getMaxZoom(), Math.max(z + 2, map.getBoundsZoom(b.pad(0.5)))), { duration: 0.4 });
  };
  const pickMark = (m: Mark, mk: L.Marker) => {
    // a monster, boss or NPC (or a map item): only it, on every floor; the rest fades. The card as before.
    if (/^(monster|npc|item):/.test(m.entry.r) && highlight !== m.entry.r) select(m.entry.r, { floor, fit: false }).then(() => showCard(m, mk));
    else showCard(m, mk);
  };
  /** One marker: a sprite (or a bare icon) with its pill. */
  const marker = (at: L.LatLng, m: Mark, opts: { n: number; many: boolean; h: 32 | 64; phase: number; still: boolean; tip: string; onClick: (mk: L.Marker) => void }) => {
    const hit = highlight === m.entry.r;
    const state = `${opts.many ? " many" : ""}${hit ? " hit" : ""}${highlight && !hit ? " dim" : ""}`;
    const pill = m.layer === "bosses"
      ? `<b class="cnt boss"><img src="/ui/boss.png" width="18" height="18" alt="">${opts.n > 1 ? opts.n : ""}</b>`
      : opts.n > 1 ? `<b class="cnt">${opts.n}</b>` : "";
    let html: string, w: number, h: number, ax: number, ay: number;
    if (m.entry.sp) {
      h = opts.h;
      w = h === 32 ? m.entry.sp.w32 : m.entry.sp.w64;
      html = `<span class="sm${state}" style="width:${w}px;height:${h}px">${spriteHtml(m.entry, opts.h, opts.phase, opts.still)}${pill}</span>`;
      ax = w / 2; ay = h - 3;   // the feet on the spot
    } else {
      const box = opts.h === 32 ? 22 : 28;
      w = h = box;
      html = `<span class="im im--${m.layer}${state}">${imgHtml(m.entry.i, box)}${pill}</span>`;
      ax = ay = box / 2;
    }
    const mk = L.marker(at, {
      icon: L.divIcon({ html, className: "mkwrap", iconSize: [w, h], iconAnchor: [ax, ay] }),
      keyboard: false, riseOnHover: true, zIndexOffset: hit ? 1000 : m.layer === "bosses" ? 500 : 0,
    });
    mk.bindTooltip(opts.tip, { direction: "top", offset: [0, -ay], className: "mtip" });
    mk.on("click", () => opts.onClick(mk));
    return mk;
  };
  const draw = () => {
    marks.clearLayers();
    const z = map.getZoom();
    const view = map.getBounds().pad(0.15);
    const here = current.filter((m) => m.f === floor);
    const spread = z >= SPREAD_FROM;
    const h: 32 | 64 = z >= 4 ? 64 : 32;
    // up close, monster groups with their cells spread out; everything else is gathered
    const creatures = spread ? here.filter((m) => m.layer === "monsters" && m.cells && m.cells.length) : [];
    const rest = spread ? here.filter((m) => !(m.layer === "monsters" && m.cells && m.cells.length)) : here;
    const groups = gather(rest, h === 64 ? 52 : 36);
    const out: { at: L.LatLng; sprite: boolean; make: (still: boolean) => L.Marker }[] = [];
    for (const g of groups) {
      const at = map.layerPointToLatLng(g.p);
      if (!view.contains(at)) continue;
      const many = g.refs.size > 1;
      out.push({ at, sprite: !!g.m.entry.sp, make: (still) => marker(at, g.m, {
        n: g.n, many, h, phase: seed(g.m.x, g.m.z), still,
        tip: tipOf(g) + (many && z < map.getMaxZoom() ? ` <i>${esc(s.zoomToSee)}</i>` : ""),
        onClick: (mk) => (!many ? pickMark(g.m, mk) : z < map.getMaxZoom() ? zoomInto(g) : showGroup(g, mk)),
      }) });
    }
    for (const m of creatures) {
      const c = m.cells!;
      for (let i = 0; i < c.length; i += 2) {
        const x = m.x + c[i]! + (seed(m.x, m.z, i, 1) - 0.5) * 0.9, zz = m.z + c[i + 1]! + (seed(m.x, m.z, i, 2) - 0.5) * 0.9;
        const at = ll(x, zz);
        if (!view.contains(at)) continue;
        out.push({ at, sprite: !!m.entry.sp, make: (still) => marker(at, m, { n: 1, many: false, h, phase: seed(m.x, m.z, i, 3), still, tip: esc(m.entry.n), onClick: (mk) => pickMark(m, mk) }) });
      }
    }
    // many sprites in view: the first frames (they still read; the page stays light)
    const sprites = out.filter((o) => o.sprite).length;   // icons (places, items) don't count: they never move
    const still = sprites > STILL_PAST;
    root.dataset.sprites = String(sprites);
    root.dataset.animated = String(still || reduce.matches ? 0 : sprites);
    for (const o of out) marks.addLayer(o.make(still));
  };
  reduce.addEventListener?.("change", () => draw());
  map.on("moveend zoomend", draw);
  const paint = async () => {
    const id = ++paintId;
    const layers: (LayerKey | "spoiler")[] = [...on];
    if (spoilers) layers.push("spoiler");
    let all = await marksOf(layers);
    if (highlight && !all.some((m) => m.entry.r === highlight)) {
      // a deep link to something whose layer is off (or a quest thing with the switch off): its spots still show
      const extra = await marksOf([...cfg.layers, "spoiler"]);
      all = all.concat(extra.filter((m) => m.entry.r === highlight));
    }
    if (id !== paintId) return;
    current = all;
    draw();
    paintFloors();
    paintCounts();
  };

  // ---- the card: icon, name, translation, its facts (each with its game icon, drawn by the site's Tag and Value),
  // a boss's next window, how many spots on how many floors, the page link. Docked beside the panel; when it would
  // cover the marker it describes, the map slides that marker clear of it.
  const card = root.querySelector<HTMLElement>("[data-card]")!;
  const tpl = (name: string) => root.querySelector<HTMLTemplateElement>(`template[data-tpl="${name}"]`)!.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const tagOf = (f: Fact, tone = "tag"): HTMLElement => {
    if (f[0] === "$gold") {
      const v = tpl("gold");
      v.querySelector("b")!.textContent = (f[1] as number).toLocaleString(document.documentElement.lang || undefined);
      const wrap = document.createElement("span");
      wrap.className = "cgold";
      const label = document.createElement("span");
      label.textContent = s.pays;
      wrap.append(label, v);
      return wrap;
    }
    const t = tpl(tone);
    const img = t.querySelector("img")!;
    img.src = `/ui/${f[0]}.png`;
    img.width = f[2] as number;
    img.height = f[3] as number;
    for (const n of [...t.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove();
    t.append(document.createTextNode(f[1] as string));
    return t;
  };
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", n.toLocaleString(document.documentElement.lang || undefined)));
  const spotsText = (n: number) => plural(n, s.spot1, s.spotsN);
  const spread = (ref: string) => {
    const spots = current.filter((o) => o.entry.r === ref);
    const n = spots.reduce((a, o) => a + countOf(o), 0);
    const floors = new Set(spots.map((o) => o.f)).size;
    return { n, floors, text: s.spotsIn.replace("{spots}", spotsText(n)).replace("{floors}", plural(floors, s.floor1, s.floorsF)) };
  };
  const headHtml = (e: Entry, big = 40) => `${e.i ? `<span class="cicon">${imgHtml(e.i, big)}</span>` : ""}<span class="ctext"><span class="cname">${esc(e.n)}</span>${e.a ? `<span class="calt">${esc(e.a)}</span>` : ""}</span>`;
  const keepClear = (mk?: L.Marker) => {
    if (!mk) return;
    requestAnimationFrame(() => {
      if (card.hidden) return;
      const st = canvas.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const pt = map.latLngToContainerPoint(mk.getLatLng());
      const x = pt.x + st.left, y = pt.y + st.top, pad = 28;
      if (x > cr.left - pad && x < cr.right + pad && y > cr.top - pad && y < cr.bottom + pad) map.panBy([0, y - (cr.top - pad - 24)], { animate: true, duration: 0.3 });
    });
  };
  const showCard = (m: Mark, mk?: L.Marker) => {
    const facts = document.createElement("div");
    facts.className = "cfacts";
    for (const f of m.entry.x ?? []) facts.append(tagOf(f));
    if (m.hours) {
      const w = nextWindow(windowSeconds(m.hours), Date.now() / 1000);
      const fmt = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { hour: "2-digit", minute: "2-digit" });
      facts.append(tagOf(["time", `${(w.open ? s.now : s.next).replace("{t}", fmt.format((w.open ? w.until : w.at) * 1000))} (${s.clock})`, ...cfg.icons.time!], "tag-sun"));
    }
    const sp = spread(m.entry.r);
    if (m.layer !== "places" && sp.n > 0) facts.append(tagOf(["src-map", sp.text, ...cfg.icons["src-map"]!]));
    card.innerHTML = `
      <button type="button" class="cclose" aria-label="${esc(s.close)}">×</button>
      <div class="chead">${headHtml(m.entry)}</div>
      ${m.entry.u ? `<a class="copen" href="${esc(m.entry.u)}">${esc(s.openPage)} →</a>` : m.layer === "places" ? "" : `<span class="csoon">${esc(s.noPage)}</span>`}`;
    if (facts.childNodes.length) card.querySelector(".chead")!.after(facts);
    card.hidden = false;
    card.querySelector<HTMLButtonElement>(".cclose")!.onclick = () => { card.hidden = true; };
    keepClear(mk);
  };
  /** Several things on one spot at the closest zoom: their list, each opening its own card. */
  const showGroup = (g: Group, mk: L.Marker) => {
    const seen = new Map<string, Mark>();
    for (const m of g.all) if (!seen.has(m.entry.r + m.entry.n)) seen.set(m.entry.r + m.entry.n, m);
    const list = [...seen.values()];
    card.innerHTML = `<button type="button" class="cclose" aria-label="${esc(s.close)}">×</button><p class="ctitle">${esc(s.hereTitle)}</p>
      <ul class="clist">${list.map((m, i) => `<li><button type="button" data-pick="${i}">${headHtml(m.entry, 28)}</button></li>`).join("")}</ul>`;
    card.hidden = false;
    card.querySelector<HTMLButtonElement>(".cclose")!.onclick = () => { card.hidden = true; };
    card.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => (b.onclick = () => showCard(list[+b.dataset.pick!]!, mk)));
    keepClear(mk);
  };
  map.on("click", () => { card.hidden = true; });

  // ---- floors: the selector (▲ ▼ by height) and the list of the floors with something to see
  const floorBtns = root.querySelectorAll<HTMLButtonElement>("[data-floor]");
  const floorLabel = root.querySelector<HTMLElement>("[data-floor-label]")!;
  const upBtn = root.querySelector<HTMLButtonElement>("[data-floor-up]")!, downBtn = root.querySelector<HTMLButtonElement>("[data-floor-down]")!;
  const steps = [...cfg.floors].sort((a, b) => level(b) - level(a));
  const stepTo = (dir: -1 | 1) => {
    const i = steps.indexOf(floor) + dir;
    if (i >= 0 && i < steps.length) setFloor(steps[i]!);
  };
  upBtn.onclick = () => stepTo(-1);
  downBtn.onclick = () => stepTo(1);
  const paintFloors = () => {
    floorLabel.textContent = floorName(floor);
    const i = steps.indexOf(floor);
    upBtn.disabled = i <= 0;
    downBtn.disabled = i < 0 || i >= steps.length - 1;
    upBtn.title = i > 0 ? `${s.up}: ${floorName(steps[i - 1]!)}` : s.up;
    downBtn.title = i >= 0 && i < steps.length - 1 ? `${s.down}: ${floorName(steps[i + 1]!)}` : s.down;
    const counts = new Map<string, number>();
    for (const m of current) if (!highlight || m.entry.r === highlight) counts.set(m.f, (counts.get(m.f) ?? 0) + 1);
    for (const b of floorBtns) {
      const f = b.dataset.floor!;
      b.setAttribute("aria-pressed", f === floor ? "true" : "false");
      if (f === floor) showFloorRow(b);
      const c = b.querySelector<HTMLElement>(".n");
      if (c) c.textContent = counts.get(f) ? String(counts.get(f)) : "";
      b.classList.toggle("has", !!counts.get(f));
    }
    // the highlighted entity: what it is, how many spots on how many floors, its page; then its other floors
    const box = root.querySelector<HTMLElement>("[data-highlight]")!;
    const other = root.querySelector<HTMLElement>("[data-other-floors]")!;
    const hm = highlight ? current.find((m) => m.entry.r === highlight) : undefined;
    if (hm) {
      const sp = spread(hm.entry.r);
      const head = root.querySelector<HTMLElement>("[data-hl-head]")!;
      head.innerHTML = `<span class="hlk">${esc(s.highlighted)}</span>
        <button type="button" class="hlx" aria-label="${esc(s.clearHighlight)}" title="${esc(s.clearHighlight)}">×</button>
        <div class="hlmain">${hm.entry.i ? `<span class="cicon">${imgHtml(hm.entry.i, 32)}</span>` : ""}<span class="ctext"><span class="cname">${esc(hm.entry.n)}</span>
          <span class="hlrow"><span class="hlfacts"></span>${hm.entry.u ? `<a class="copen" href="${esc(hm.entry.u)}">${esc(s.openPage)} →</a>` : ""}</span></span></div>`;
      head.querySelector(".hlfacts")!.append(tagOf(["src-map", sp.text, ...cfg.icons["src-map"]!]));
      head.querySelector<HTMLButtonElement>(".hlx")!.onclick = () => clearHighlight();
      const list = [...counts.entries()].filter(([f]) => f !== floor).sort((a, b) => level(b[0]) - level(a[0]));
      other.hidden = !list.length;
      other.innerHTML = list.length ? `<span class="ok">${esc(s.otherFloors)}</span>${list.map(([f, n]) => `<button type="button" data-go-floor="${esc(f)}">${esc(floorName(f))} <b>${n}</b></button>`).join("")}` : "";
      other.querySelectorAll<HTMLButtonElement>("[data-go-floor]").forEach((b) => (b.onclick = () => { setFloor(b.dataset.goFloor!); fitHighlight(); }));
      box.hidden = false;
    } else box.hidden = true;
  };
  /** The current floor's row in view, in the floor list's own scroll (a phone: the drawer's), never the page's. */
  function showFloorRow(b: HTMLElement) {
    const list = b.closest<HTMLElement>(".floors")!;
    const box = list.scrollHeight > list.clientHeight + 1 ? list : panel;
    const lr = box.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (lr.height && (br.top < lr.top || br.bottom > lr.bottom)) box.scrollTop += br.top - lr.top - lr.height / 2;
  }
  for (const b of floorBtns) b.onclick = () => { setFloor(b.dataset.floor!); closeDrawer(); };
  function setFloor(f: string) {
    if (!allFloors.includes(f)) return;
    floor = f;
    base?.remove();
    under?.remove();
    under = f === "s" ? null : tiles("s", 0.14).addTo(map);
    base = tiles(f).addTo(map);
    pinLayer.clearLayers();
    if (pin && pin.f === f) addPin(pin);
    paint();
    canvas.setAttribute("aria-label", `${canvas.dataset.label}, ${floorName(f)}`);
  }
  const addPin = (p: Spot) => {
    pinLayer.addLayer(L.marker(ll(p.x, p.z), { icon: L.divIcon({ html: '<span class="pin"></span>', className: "pinwrap", iconSize: [28, 38], iconAnchor: [14, 36] }), title: s.pin, zIndexOffset: 2000 }));
  };

  // ---- layers panel: switches with counts on this floor
  const layerBoxes = root.querySelectorAll<HTMLInputElement>("[data-layer]");
  for (const box of layerBoxes) {
    box.checked = on.has(box.dataset.layer as LayerKey);
    box.onchange = () => { if (box.checked) on.add(box.dataset.layer as LayerKey); else on.delete(box.dataset.layer as LayerKey); paint(); };
  }
  const spoilerBox = root.querySelector<HTMLInputElement>("[data-spoilers]")!;
  spoilerBox.checked = false;
  spoilerBox.onchange = () => { spoilers = spoilerBox.checked; paint(); };
  const paintCounts = () => {
    for (const box of layerBoxes) {
      const n = current.filter((m) => m.layer === box.dataset.layer && m.f === floor).length;
      const c = box.closest("label")?.querySelector<HTMLElement>("[data-count]");
      if (c) c.textContent = on.has(box.dataset.layer as LayerKey) ? s.spotsHere.replace("{n}", String(n)) : "";
    }
  };

  // ---- highlight an entity: every spot of it, on the floor that has most of them unless one is given
  /** The map's part no overlay covers (the panel on a desktop, the highlight box, the drawer button): [top-left, bottom-right] padding. */
  const freeArea = (): [L.Point, L.Point] => {
    const st = canvas.getBoundingClientRect();
    let left = 16, top = 16, right = 16, bottom = 16;
    const pr = panel.getBoundingClientRect();
    if (pr.width && pr.right < st.left + st.width / 2 && pr.bottom > st.top) left = pr.right - st.left + 16;
    const hb = root.querySelector<HTMLElement>("[data-highlight]")!;
    if (!hb.hidden) {
      const r = hb.getBoundingClientRect();
      if (r.width > st.width * 0.6) top = r.bottom - st.top + 16;   // a phone: the box spans the map's width
      else right = st.right - r.left + 16;
    }
    const db = root.querySelector<HTMLElement>("[data-drawer]")!.getBoundingClientRect();
    if (db.height) bottom = st.bottom - db.top + 16;
    return [L.point(left, top), L.point(right, bottom)];
  };
  const fitHighlight = () => {
    const here = current.filter((m) => m.entry.r === highlight && m.f === floor);
    if (!here.length) return;
    const [tl, br] = freeArea();
    const b = L.latLngBounds(here.map((m) => ll(m.x, m.z)));
    map.fitBounds(here.length === 1 ? b.pad(0.02) : b.pad(0.1), { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 2, animate: false });
  };
  const clearHighlight = () => {
    highlight = null;
    const q = new URLSearchParams(location.search);
    q.delete("e");
    const qs = q.toString().replace(/%3A/gi, ":");
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}`);
    paint();
  };
  const select = async (ref: string, opts: { floor?: string; fit?: boolean } = {}) => {
    highlight = ref;
    await paint();
    const spots = current.filter((m) => m.entry.r === ref);
    if (!spots.length) return;
    let f = opts.floor;
    if (!f || !spots.some((m) => m.f === f)) {
      const by = new Map<string, number>();
      for (const m of spots) by.set(m.f, (by.get(m.f) ?? 0) + m.n);
      f = spots.some((m) => m.f === floor) ? floor : [...by.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    }
    if (f !== floor) setFloor(f);
    await paint();
    if (opts.fit !== false) fitHighlight();
    const q = new URLSearchParams(location.search);
    q.set("e", ref);
    q.set("f", floor);
    history.replaceState(null, "", `${location.pathname}?${q.toString().replace(/%3A/gi, ":")}`);
  };

  // ---- search: every entry of every layer (the spoilers only with the switch on)
  const searchBox = root.querySelector<HTMLInputElement>("[data-search]")!;
  const results = root.querySelector<HTMLElement>("[data-results]")!;
  let pool: { entry: Entry; layer: LayerKey; n: number }[] = [];
  const buildPool = async () => {
    const all = await marksOf([...cfg.layers, ...(spoilers ? ["spoiler" as const] : [])]);
    const by = new Map<string, { entry: Entry; layer: LayerKey; n: number }>();
    for (const m of all) {
      const key = m.entry.r + "|" + m.entry.k;
      const cur = by.get(key) ?? by.set(key, { entry: m.entry, layer: m.layer, n: 0 }).get(key)!;
      cur.n += m.n;
    }
    pool = [...by.values()];
  };
  let active = -1;
  const showResults = async () => {
    const q = searchBox.value.trim();
    if (!q) { results.hidden = true; return; }
    if (!pool.length) await buildPool();
    const hits = search(pool, q, (h) => `${h.entry.n} ${h.entry.a ?? ""} ${h.entry.k ?? ""} ${s.layer[h.layer]}`);
    active = -1;
    results.hidden = false;
    results.innerHTML = hits.length ? hits.map((h, i) => {
      const ic = h.entry.i;
      return `<li role="option" id="mres-${i}"><button type="button" data-hit="${i}">${ic ? `<span class="ricon"><img src="${esc(ic.s)}" width="${ic.px ? ic.w * 2 : 28}" height="${ic.px ? ic.h * 2 : 28}" alt=""${ic.px ? ' class="px"' : ""}></span>` : ""}<span class="rtext"><span class="rname">${esc(h.entry.n)}</span><span class="rsub">${esc([h.entry.k && h.layer === "places" ? h.entry.k : s.layer[h.layer], spotsText(h.n)].join(" · "))}</span></span></button></li>`;
    }).join("") : `<li class="rempty">${esc(s.searchEmpty.replace("{q}", q))}</li>`;
    results.querySelectorAll<HTMLButtonElement>("[data-hit]").forEach((b) => (b.onclick = () => pick(hits[+b.dataset.hit!]!)));
    (results as HTMLElement & { _hits?: typeof hits })._hits = hits;
  };
  const pick = (h: { entry: Entry; layer: LayerKey }) => {
    results.hidden = true;
    searchBox.value = h.entry.n;
    select(h.entry.r);   // a layer switched off still shows the picked entity's spots (the highlight)
    closeDrawer();
  };
  searchBox.addEventListener("input", () => { showResults(); });
  searchBox.addEventListener("keydown", (ev) => {
    const hits = (results as HTMLElement & { _hits?: { entry: Entry; layer: LayerKey }[] })._hits ?? [];
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!hits.length) return;
      active = (active + (ev.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      results.querySelectorAll("li").forEach((li, i) => li.classList.toggle("on", i === active));
      searchBox.setAttribute("aria-activedescendant", `mres-${active}`);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const h = hits[active >= 0 ? active : 0];
      if (h) pick(h);
    } else if (ev.key === "Escape") results.hidden = true;
  });

  // ---- "Ir para": the game's /pos line, or x, z
  const gotoForm = root.querySelector<HTMLFormElement>("[data-goto]")!;
  const gotoBox = gotoForm.querySelector<HTMLInputElement>("input")!;
  const gotoMsg = root.querySelector<HTMLElement>("[data-goto-msg]")!;
  const hasMap = (f: string, x: number, z: number) => {
    const px = Math.floor(x + 0.5), py = Math.floor(-z + 0.5);
    return (meta.tiles[f]?.["0"] ?? []).includes(`${Math.floor(px / 256)}_${Math.floor(py / 256)}`);
  };
  gotoForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const p = parsePlace(gotoBox.value);
    if (!p) { gotoMsg.textContent = s.gotoBad; gotoMsg.hidden = false; return; }
    gotoMsg.hidden = true;
    const fs = placeFloors(p, allFloors, hasMap);
    const f = fs ? fs[0]! : floor;
    pin = { x: p.x, z: p.z, f };
    setFloor(f);
    map.setView(ll(p.x, p.z), 2);
    closeDrawer();
  });

  // ---- the phone drawer (layers and floors)
  const drawerBtn = root.querySelector<HTMLButtonElement>("[data-drawer]")!;
  function closeDrawer() { root.classList.remove("drawer-open"); drawerBtn.setAttribute("aria-expanded", "false"); }
  drawerBtn.onclick = () => {
    const open = !root.classList.contains("drawer-open");
    root.classList.toggle("drawer-open", open);
    drawerBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      panel.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
      const cur = root.querySelector<HTMLElement>(`[data-floor="${CSS.escape(floor)}"]`);
      if (cur) setTimeout(() => showFloorRow(cur), 50);
    }
  };

  // ---- open: the deep link (a spot, an entity, a floor), else the surface's middle
  const link = readDeepLink(location.search, allFloors);
  const start = link.spot ?? (link.floor ? { x: -10, z: -10, f: link.floor } : null);
  setFloor(start?.f ?? "s");
  // the pin marks a bare spot; with an entity, its ringed marker marks the spot (a pin there would cover it)
  if (link.spot && !link.entity) { pin = link.spot; pinLayer.clearLayers(); addPin(pin); }
  map.setView(start ? ll(start.x, start.z) : ll(-40, 40), start ? 2 : 0);
  // the panel covers the map's left on a desktop: the opening view's middle sits right of it
  if (getComputedStyle(panel).position === "absolute" && panel.getBoundingClientRect().width > 0 && innerWidth >= 760) map.panBy([-150, 0], { animate: false });
  if (link.entity) select(link.entity, { floor: link.spot?.f ?? link.floor ?? undefined, fit: !link.spot });
  root.classList.add("ready");
}
