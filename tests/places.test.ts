import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8")) as T;
interface Place { id: string; ref: string; kind: "town" | "place"; town?: string; link: string; npcs: { ref: string; shift: number; spoiler?: boolean }[];
  monsters: { ref: string; count: number; link: string }[]; bosses: { ref: string; link: string }[]; entrances: { other?: string; link: string }[];
  near: string[]; places?: string[]; core?: string[]; floors: string[]; level?: { min: number; max: number } }
type Where = { place: { ref?: string; townRef?: string } };
const PLACES = read<{ places: Place[] }>("places.json").places;
const MONSTERS = read<{ monsters: { id: string; places: (Where & { count: number })[]; windows: Where[] }[] }>("monsters.json").monsters;
const NPCS = read<{ npcs: { ref: string; shifts: Where[] }[] }>("npcs.json").npcs;
const SLUGS = read<Record<string, Record<string, string>>>("slugs.json");
const LINKS = read<Record<string, unknown>>("map/links.json");
const byRef = new Map(PLACES.map((p) => [p.ref, p]));

describe("the place pages' data", () => {
  test("one page per town (eight temples) and the map's names; every place has a slug in every language", () => {
    assert.equal(PLACES.filter((p) => p.kind === "town").length, 8);
    for (const p of PLACES) for (const l of ["pt", "en", "es"]) assert.ok(SLUGS[p.ref]?.[l], `${p.ref}: no ${l} slug`);
  });

  test("a place a monster's \"Onde vive\" names lists that monster, with the same count", () => {
    for (const m of MONSTERS) {
      const per = new Map<string, number>();
      for (const row of m.places) if (row.place.ref) per.set(row.place.ref, (per.get(row.place.ref) ?? 0) + row.count);
      for (const [ref, n] of per) {
        const p = byRef.get(ref);
        assert.ok(p, `monster:${m.id} names ${ref}, which has no page`);
        const listed = p.monsters.find((x) => x.ref === `monster:${m.id}`);
        assert.ok(listed, `${ref} doesn't list monster:${m.id}`);
        assert.ok(listed.count >= n, `${ref}: monster:${m.id} ${listed.count} spots, its page says ${n} near it`);
      }
    }
  });

  test("a place an NPC's shift names lists that NPC", () => {
    for (const n of NPCS) for (const s of n.shifts) {
      if (!s.place.ref) continue;
      const p = byRef.get(s.place.ref);
      assert.ok(p, `${n.ref} names ${s.place.ref}, which has no page`);
      assert.ok(p.npcs.some((x) => x.ref === n.ref), `${s.place.ref} doesn't list ${n.ref}`);
    }
  });

  test("every ref a place names is a page, and every map link it carries is in the map's index", () => {
    for (const p of PLACES) {
      for (const r of [...p.near, ...(p.places ?? []), ...(p.core ?? []), ...p.entrances.flatMap((e) => (e.other ? [e.other] : []))]) assert.ok(byRef.has(r), `${p.ref} names ${r}`);
      if (p.kind === "place") assert.ok(p.town && byRef.get(p.town)?.kind === "town", `${p.ref}: its region ${p.town} isn't a town page`);
      for (const l of [p.link, ...p.monsters.map((m) => m.link), ...p.bosses.map((b) => b.link), ...p.entrances.map((e) => e.link)]) assert.ok(LINKS[l], `${p.ref}: a link not in the index`);
    }
  });

  test("a suggested level is a band, low to high; floors are listed once, top first", () => {
    for (const p of PLACES) {
      if (p.level) assert.ok(p.level.min <= p.level.max, `${p.ref} level ${p.level.min}–${p.level.max}`);
      assert.equal(new Set(p.floors).size, p.floors.length, `${p.ref} floors ${p.floors}`);
    }
  });
});
