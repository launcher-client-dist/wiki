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
import type { Entry, LayerFile, LayerKey } from "./layers.ts";

interface TileMeta { version: string; bounds: [[number, number], [number, number]]; floors: string[]; tiles: Record<string, Record<string, string[]>> }
interface Strings {
  surface: string; floorN: string; up: string; down: string; searchEmpty: string; gotoBad: string; openPage: string; noPage: string;
  spotsN: string; spotsHere: string; otherFloors: string; pin: string; zoomIn: string; zoomOut: string; layer: Record<LayerKey, string>;
  next: string; now: string; clock: string; close: string;
}
interface Config { lang: string; layers: LayerKey[]; defaultOn: LayerKey[]; floors: string[]; meta: TileMeta; s: Strings }

const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const CRS = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1, 0.5, -1, 0.5) });
const ll = (x: number, z: number) => L.latLng(z, x);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Loaded { file: LayerFile; layer: LayerKey | "spoiler" }
interface Mark { layer: LayerKey; entry: Entry; x: number; z: number; f: string; n: number; hours?: [number, number]; invasion?: boolean }

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
        out.push(m);
      }
    }
    return out;
  };

  // ---- markers: the game icon in a small well; a count badge; the highlighted entity's spots ringed
  const iconHtml = (m: Mark) => {
    const i = m.entry.i;
    // sizes inline: Leaflet's stylesheet sets marker images to width: auto
    const box = m.layer === "items" ? 18 : 26;
    const [w, h] = i?.px ? [i.w * 2, i.h * 2] : [box, box];
    const img = i ? `<img src="${esc(i.s)}" width="${w}" height="${h}" style="width:${w}px;height:${h}px" alt=""${i.px ? ' class="px"' : ""}>` : "";
    const badge = m.n > 1 && m.layer !== "places" ? `<b>${m.n}</b>` : "";
    return `<span class="mk mk--${m.layer}${highlight === m.entry.r ? " hit" : ""}${highlight && highlight !== m.entry.r ? " dim" : ""}">${img}${badge}</span>`;
  };
  let current: Mark[] = [];
  let paintId = 0;
  // zoomed out (zoom 0 and less): a dot per spot, drawn on one canvas (thousands stay light); the bosses and the
  // picked entity keep their icons. Zoomed in: the icons, only those in view (redrawn as the map moves).
  const dots = L.canvas({ padding: 0.3 });
  const DOT: Record<LayerKey, string> = { monsters: "#ff8a6b", bosses: "#ff4d4d", npcs: "#8fd3ff", places: "#9be86d", items: "#ffd34e" };
  const draw = () => {
    marks.clearLayers();
    const far = map.getZoom() <= 0;
    const view = map.getBounds().pad(0.25);
    for (const m of current) {
      if (m.f !== floor) continue;
      const hit = highlight === m.entry.r;
      if (far && !hit && m.layer !== "bosses") {
        const c = L.circleMarker(ll(m.x, m.z), { renderer: dots, radius: m.layer === "items" ? 2.5 : 3.5, weight: 1, color: "rgba(10,11,13,0.9)", fillColor: DOT[m.layer], fillOpacity: highlight ? 0.35 : 0.95 });
        c.bindTooltip(esc(m.entry.n), { direction: "top", className: "mtip" });
        c.on("click", () => showCard(m));
        marks.addLayer(c);
        continue;
      }
      if (!view.contains(ll(m.x, m.z))) continue;
      const size = m.layer === "items" ? 22 : 30;
      const mk = L.marker(ll(m.x, m.z), {
        icon: L.divIcon({ html: iconHtml(m), className: "mkwrap", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        keyboard: false, riseOnHover: true, zIndexOffset: hit ? 1000 : m.layer === "bosses" ? 500 : 0,
      });
      mk.bindTooltip(esc(m.entry.n) + (m.n > 1 && m.layer !== "places" ? ` · ${esc(s.spotsN.replace("{n}", String(m.n)))}` : ""), { direction: "top", offset: [0, -size / 2], className: "mtip" });
      mk.on("click", () => showCard(m));
      marks.addLayer(mk);
    }
  };
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

  // ---- the card: icon, name, translation, the key fact (a boss: its next window), the page link
  const card = root.querySelector<HTMLElement>("[data-card]")!;
  const showCard = (m: Mark) => {
    const i = m.entry.i;
    let fact = m.entry.k ?? "";
    if (m.hours) {
      const w = nextWindow(windowSeconds(m.hours), Date.now() / 1000);
      const fmt = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { hour: "2-digit", minute: "2-digit" });
      fact = `${fact ? `${fact} · ` : ""}${(w.open ? s.now : s.next).replace("{t}", fmt.format((w.open ? w.until : w.at) * 1000))} (${s.clock})`;
    }
    const spots = current.filter((o) => o.entry.r === m.entry.r);
    const total = spots.reduce((n, o) => n + o.n, 0);
    card.innerHTML = `
      <button type="button" class="cclose" aria-label="${esc(s.close)}">×</button>
      <div class="chead">${i ? `<span class="cicon"><img src="${esc(i.s)}" width="${i.px ? i.w * 3 : 40}" height="${i.px ? i.h * 3 : 40}" alt=""${i.px ? ' class="px"' : ""}></span>` : ""}
        <span class="ctext"><span class="cname">${esc(m.entry.n)}</span>${m.entry.a ? `<span class="calt">${esc(m.entry.a)}</span>` : ""}</span></div>
      ${fact ? `<p class="cfact">${esc(fact)}</p>` : ""}
      ${total > 1 ? `<p class="cspots">${esc(s.spotsN.replace("{n}", String(total)))}</p>` : ""}
      ${m.entry.u ? `<a class="copen" href="${esc(m.entry.u)}">${esc(s.openPage)} →</a>` : m.layer === "places" ? "" : `<span class="csoon">${esc(s.noPage)}</span>`}`;
    card.hidden = false;
    card.querySelector<HTMLButtonElement>(".cclose")!.onclick = () => { card.hidden = true; };
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
      if (f === floor) {   // the current floor in view in the floor list's own scroll (never the page's)
        const list = b.closest<HTMLElement>(".floors")!;
        const lr = list.getBoundingClientRect(), br = b.getBoundingClientRect();
        if (br.top < lr.top || br.bottom > lr.bottom) list.scrollTop += br.top - lr.top - lr.height / 2;
      }
      const c = b.querySelector<HTMLElement>(".n");
      if (c) c.textContent = counts.get(f) ? String(counts.get(f)) : "";
      b.classList.toggle("has", !!counts.get(f));
    }
    const other = root.querySelector<HTMLElement>("[data-other-floors]")!;
    if (highlight) {
      const list = [...counts.entries()].filter(([f]) => f !== floor).sort((a, b) => level(b[0]) - level(a[0]));
      other.hidden = !list.length;
      other.innerHTML = list.length ? `<span>${esc(s.otherFloors)}:</span>${list.map(([f, n]) => `<button type="button" data-go-floor="${esc(f)}">${esc(floorName(f))} <b>${n}</b></button>`).join("")}` : "";
      other.querySelectorAll<HTMLButtonElement>("[data-go-floor]").forEach((b) => (b.onclick = () => { setFloor(b.dataset.goFloor!); fitHighlight(); }));
    } else other.hidden = true;
  };
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
  const fitHighlight = () => {
    const here = current.filter((m) => m.entry.r === highlight && m.f === floor);
    if (here.length === 1) map.setView(ll(here[0]!.x, here[0]!.z), Math.max(map.getZoom(), 2));
    else if (here.length) map.fitBounds(L.latLngBounds(here.map((m) => ll(m.x, m.z))).pad(0.25), { maxZoom: 2 });
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
      return `<li role="option" id="mres-${i}"><button type="button" data-hit="${i}">${ic ? `<span class="ricon"><img src="${esc(ic.s)}" width="${ic.px ? ic.w * 2 : 28}" height="${ic.px ? ic.h * 2 : 28}" alt=""${ic.px ? ' class="px"' : ""}></span>` : ""}<span class="rtext"><span class="rname">${esc(h.entry.n)}</span><span class="rsub">${esc([h.entry.k && h.layer === "places" ? h.entry.k : s.layer[h.layer], s.spotsN.replace("{n}", String(h.n))].join(" · "))}</span></span></button></li>`;
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
    if (open) panel.querySelector<HTMLElement>("input, button")?.focus();
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
