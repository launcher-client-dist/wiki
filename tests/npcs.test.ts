import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8")) as T;
type Loc = { en: string; _fb?: string[] } & Record<string, unknown>;
interface Shift { place: unknown; link: string; hours: [number, number] | null; sells?: { item: string; price: number }[]; buys?: { item: string; price: number }[]; spoiler: boolean; conversation?: { text: Loc }[] }
interface Npc { id: string; ref: string; title: Loc; shifts: Shift[]; conversation: { kind: string; text: Loc; keys: Loc[]; spoiler: boolean }[]; quests: string[]; near: string[]; spoiler: boolean }
const NPCS = read<{ npcs: Npc[] }>("npcs.json").npcs;
const ITEMS = read<{ items: { id: string; sources: { shops: { npc: string; price: number }[]; buyers: { npc: string; price: number }[] } }[] }>("items.json").items;
const SLUGS = read<Record<string, Record<string, string>>>("slugs.json");
const LINKS = read<Record<string, unknown>>("map/links.json");

describe("the NPC pages' data", () => {
  test("a page's shop and the item pages' 'sold by' / 'bought by' agree, both ways", () => {
    const fromNpcs = new Set<string>(), fromItems = new Set<string>();
    for (const n of NPCS) for (const s of n.shifts) {
      for (const r of s.sells ?? []) fromNpcs.add(`sells ${n.ref} ${r.item} ${r.price}`);
      for (const r of s.buys ?? []) fromNpcs.add(`buys ${n.ref} ${r.item} ${r.price}`);
    }
    for (const i of ITEMS) {
      for (const r of i.sources.shops) fromItems.add(`sells ${r.npc} ${i.id} ${r.price}`);
      for (const r of i.sources.buyers) fromItems.add(`buys ${r.npc} ${i.id} ${r.price}`);
    }
    assert.deepEqual([...fromNpcs].filter((x) => !fromItems.has(x)), []);
    assert.deepEqual([...fromItems].filter((x) => !fromNpcs.has(x)), []);
  });

  test("no actor number in an NPC's ref or slug (one page per character, never per actor)", () => {
    for (const n of NPCS) {
      assert.doesNotMatch(n.ref, /:a\d+$/, n.ref);
      for (const s of Object.values(SLUGS[n.ref] ?? {})) assert.doesNotMatch(s, /-a\d+$/, `${n.ref} slug ${s}`);
    }
  });

  test("every shift opens on the wiki's map (its link is in the link index)", () => {
    for (const n of NPCS) for (const s of n.shifts) assert.ok(LINKS[s.link], `${n.id}: a shift's link not in the index`);
  });

  test("no line shows a percent sign, and no quest-only NPC leaks into another page's 'nearby'", () => {
    const questOnly = new Set(NPCS.filter((n) => n.spoiler).map((n) => n.ref));
    for (const n of NPCS) {
      for (const l of [...n.conversation, ...n.shifts.flatMap((s) => s.conversation ?? [])]) {
        for (const [k, v] of Object.entries(l.text)) if (typeof v === "string") assert.ok(!v.includes("%"), `${n.id} ${k}: ${v}`);
      }
      if (!n.spoiler) for (const r of n.near) assert.ok(!questOnly.has(r), `${n.id} names the quest-only ${r} nearby`);
    }
  });

  test("hours are game hours, a shop's restock is one", () => {
    for (const n of NPCS) for (const s of n.shifts) {
      if (s.hours) for (const h of s.hours) assert.ok(h >= 0 && h <= 24, `${n.id} hours ${s.hours}`);
    }
  });
});
