import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { level, parsePlace, placeFloors, search } from "../src/lib/map/goto.ts";
import { mapHref, readDeepLink } from "../src/lib/map/links.ts";
import { nextWindow, windowSeconds } from "../src/lib/monsters/window.ts";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8")) as T;
const LINKS = read<Record<string, [number, number, string]>>("map/links.json");
const POINTS = read<{ floors: string[]; layers: Record<string, { x: number; z: number; f: string; ref?: string; n?: number; spoiler?: boolean }[]> }>("map/points.json");

/** Every map link the data files hold (the same walk as the private map tool). */
function dataLinks(): Set<string> {
  const out = new Set<string>();
  const items = read<{ items: any[] }>("items.json").items;
  for (const i of items) {
    for (const k of ["shops", "buyers"]) for (const s of i.sources[k]) if (s.where) out.add(s.where.link);
    for (const m of i.sources.map) out.add(m.link);
    for (const r of [...i.sources.recipes, ...i.uses.recipes]) for (const g of r.ingredients) for (const w of g.where ?? []) out.add(w.link);
  }
  for (const m of read<{ monsters: any[] }>("monsters.json").monsters) for (const p of [...m.places, ...m.windows, ...m.windows.flatMap((w: any) => w.spots ?? [])]) out.add(p.link);
  for (const e of read<{ entities: any[] }>("entities.json").entities) if (e.appears?.where) out.add(e.appears.where.link);
  for (const n of read<{ npcs: any[] }>("npcs.json").npcs) for (const sh of n.shifts) {
    out.add(sh.link);
    if (sh.services?.travel?.link) out.add(sh.services.travel.link);
  }
  for (const p of read<{ places: any[] }>("places.json").places) for (const l of [p.link, ...[...p.entrances, ...p.monsters, ...p.bosses].map((r: any) => r.link)]) out.add(l);
  return out;
}

describe("the map's data", () => {
  test("the link index knows every map link of the data, and nothing else (stale: run the map tool after the export)", () => {
    const want = dataLinks();
    assert.deepEqual([...want].filter((l) => !LINKS[l]).length, 0);
    assert.deepEqual(Object.keys(LINKS).filter((l) => !want.has(l)).length, 0);
  });

  test("a boss that picks one of N spots: one window on its page, a marker on each spot saying one of N, odds only when they differ", () => {
    const monsters = read<{ monsters: { id: string; windows: { hours: [number, number]; place: unknown; link: string; spots?: { place: unknown; link: string; picks?: [number, number] }[] }[] }[] }>("monsters.json").monsters;
    const bosses = POINTS.layers.bosses as unknown as { ref: string; x: number; z: number; f: string; hours?: [number, number]; oneOf?: number; picks?: [number, number] }[];
    let seen = 0;
    for (const m of monsters) for (const w of m.windows) {
      if (!w.spots) continue;
      seen++;
      assert.ok(w.spots.length > 1, `${m.id}: a one-spot window carries no spots`);
      assert.deepEqual([w.spots[0]!.place, w.spots[0]!.link], [w.place, w.link], `${m.id}: the window's place is its first (likeliest) spot`);
      assert.equal(new Set(w.spots.map((s) => s.link)).size, w.spots.length, `${m.id}: a spot twice`);
      const odds = w.spots.map((s) => s.picks);
      if (odds.some(Boolean)) {
        assert.ok(odds.every(Boolean), `${m.id}: odds on some spots only`);
        assert.ok(Math.abs(odds.reduce((a, c) => a + c![0] / c![1], 0) - 1) < 1e-9, `${m.id}: the odds don't add up to one`);
        for (let i = 1; i < odds.length; i++) assert.ok(odds[i - 1]![0] / odds[i - 1]![1] >= odds[i]![0] / odds[i]![1], `${m.id}: the likeliest spot first`);
      }
      for (const s of w.spots) {
        const [x, z, f] = LINKS[s.link]!;
        const mk = bosses.filter((r) => r.ref === `monster:${m.id}` && r.x === x && r.z === z && r.f === f && r.hours?.join() === w.hours.join());
        assert.equal(mk.length, 1, `${m.id}: one marker per spot`);
        assert.equal(mk[0]!.oneOf, w.spots.length, `${m.id}: the marker says one of ${w.spots.length}`);
        assert.deepEqual(mk[0]!.picks, s.picks, `${m.id}: the marker's odds`);
      }
    }
    assert.ok(seen > 0, "no boss picks one of several spots: the export lost them");
    for (const r of bosses) if (!r.oneOf) assert.equal(r.picks, undefined, "odds on a one-spot boss");
  });

  test("every point names a floor the map has, and a monster's spots add up to its pages' spawn points", () => {
    const meta = JSON.parse(readFileSync(new URL("../public/map/tiles/meta.json", import.meta.url), "utf8")) as { floors: string[] };
    for (const rows of Object.values(POINTS.layers)) for (const r of rows) assert.ok(meta.floors.includes(r.f), `floor ${r.f}`);
    const monsters = read<{ monsters: { id: string; places: { count: number }[] }[] }>("monsters.json").monsters;
    const spots = new Map<string, number>();
    for (const r of POINTS.layers.monsters!) spots.set(r.ref!, (spots.get(r.ref!) ?? 0) + (r.n ?? 1));
    for (const m of monsters) assert.equal(spots.get(`monster:${m.id}`) ?? 0, m.places.reduce((n, p) => n + p.count, 0), m.id);
  });

  test("a monster group's creatures: one cell each, near the group, or none (it stays one marker)", () => {
    const rows = POINTS.layers.monsters as unknown as { n?: number; cells?: [number, number][] }[];
    for (const r of rows) {
      if (!r.cells) continue;
      assert.equal(r.cells.length, r.n ?? 1);
      for (const [dx, dz] of r.cells) assert.ok(Math.abs(dx) <= 200 && Math.abs(dz) <= 200);
    }
    assert.ok(rows.filter((r) => r.cells).length > rows.length * 0.9);
  });

  test("every sprite the map names is in public/sprites, at both heights, a strip and a still, named by slug", () => {
    const sprites = read<Record<string, { f: string; n: number; ms: number; w32: number; w64: number }>>("map/sprites.json");
    assert.ok(Object.keys(sprites).length > 100);
    for (const [ref, sp] of Object.entries(sprites)) {
      assert.match(sp.f, /^(monsters|npcs)\/[a-z0-9-]+$/, ref);
      for (const h of [32, 64]) for (const ext of ["webp", "png"]) assert.ok(existsSync(new URL(`../public/sprites/${sp.f}-${h}.${ext}`, import.meta.url)), `${sp.f}-${h}.${ext}`);
      assert.ok(sp.n >= 1 && sp.ms > 0 && sp.w32 > 0 && sp.w64 > 0, ref);
    }
  });

  test("no map link and no point leaves the wiki for the editor", () => {
    const text = readFileSync(new URL("../src/data/map/points.json", import.meta.url), "utf8");
    assert.ok(!/opengea\.tech/.test(text));
  });
});

describe("deep links", () => {
  test("a spot and an entity, short and readable", () => {
    assert.equal(mapHref("pt", { x: -196, z: 154, f: "-4" }, "monster:swamp-troll"), "/pt/mapa/?f=-4&x=-196&z=154&e=monster:swamp-troll");
    assert.equal(mapHref("en"), "/en/map/");
    assert.equal(mapHref("es", null, "npc:a72"), "/es/mapa/?e=npc:a72");
  });

  test("read leniently: anything malformed is dropped, the map still opens", () => {
    const floors = ["s", "1", "-4"];
    assert.deepEqual(readDeepLink("?f=-4&x=-196&z=154&e=monster:swamp-troll", floors), { spot: { x: -196, z: 154, f: "-4" }, floor: "-4", entity: "monster:swamp-troll" });
    assert.deepEqual(readDeepLink("?f=99&x=abc&e=<script>", floors), { spot: null, floor: null, entity: null });
    assert.deepEqual(readDeepLink("?x=10&z=20", floors).spot, { x: 10, z: 20, f: "s" });
  });
});

describe("Ir para (the editor's own parsing)", () => {
  test("the game's /pos line, x z, x y z; words are a search", () => {
    assert.deepEqual(parsePlace("[pos] x -271.0, y -1.2, z 283.0 (floor -2)"), { x: -271, z: 283, y: -1.2, tag: "-2" });
    assert.deepEqual(parsePlace("[pos] x 12.0, z -40.0 (surface)"), { x: 12, z: -40, y: null, tag: "s" });
    assert.deepEqual(parsePlace("-196, 154"), { x: -196, z: 154, y: null, tag: null });
    assert.deepEqual(parsePlace("10, -3, 20"), { x: 10, z: 20, y: -3, tag: null });
    assert.equal(parsePlace("swamp troll"), null);
  });

  test("a floor tag is tried first where the map has that floor at the spot, else the surface", () => {
    const place = parsePlace("[pos] x 1, y 2, z 3 (floor -2)")!;
    assert.deepEqual(placeFloors(place, ["s", "-2"], () => true), ["-2", "s"]);
    assert.deepEqual(placeFloors(place, ["s", "-2"], () => false), ["s", "-2"]);
    assert.deepEqual(placeFloors(place, ["s"]), ["s"]);
  });

  test("the floor list and the ▲▼ selector read by height: upper floors on top, the surface, then the caves", () => {
    const floors = ["s", "0", "-1", "-16", "1", "2"];
    assert.deepEqual([...floors].sort((a, b) => level(b) - level(a)), ["2", "1", "s", "0", "-1", "-16"]);
  });

  test("search: every word, accents folded, the start of a name first", () => {
    const names = ["Swamp Troll", "Cave Troll", "Poço · Basile", "Trolley"];
    assert.deepEqual(search(names, "troll", (s) => s), ["Trolley", "Cave Troll", "Swamp Troll"]);
    assert.deepEqual(search(names, "poco", (s) => s), ["Poço · Basile"]);
  });
});

describe("a boss's window in the reader's clock", () => {
  test("game hour H starts at real second H x 150 of every hour; a window past midnight runs into the next hour", () => {
    assert.deepEqual(windowSeconds([1, 4]), { start: 150, end: 600 });
    assert.deepEqual(windowSeconds([22, 2]), { start: 3300, end: 3900 });
    const hour = 1_800_000_000 - (1_800_000_000 % 3600);
    assert.deepEqual(nextWindow({ start: 150, end: 600 }, hour + 100), { open: false, at: hour + 150 });
    assert.deepEqual(nextWindow({ start: 150, end: 600 }, hour + 300), { open: true, until: hour + 600 });
    assert.deepEqual(nextWindow({ start: 150, end: 600 }, hour + 700), { open: false, at: hour + 3600 + 150 });
  });
});
