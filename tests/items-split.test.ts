import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS } from "../src/lib/i18n.ts";
import { entitiesFromData, type ItemsFile, type StubEntity } from "../src/lib/items/data.ts";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8")) as T;
const FILE = read<ItemsFile>("items.json");
const STUBS = read<{ entities: StubEntity[] }>("entities.json").entities;
const SLUGS = read<Record<string, Record<string, string>>>("slugs.json");

describe("one page per game item", () => {
  test("a page holds one game item, or one item's two states (stored and equipped)", () => {
    for (const i of FILE.items) {
      if (i.versions.length === 1) continue;
      assert.ok(i.states, `${i.id} joins ${i.versions.length} game items`);
      assert.deepEqual(i.versions.map((v) => v.type).sort(), [i.states!.stored, i.states!.equipped].sort());
    }
  });

  test("an equip pair leads with its equipped state: the stats and the clock are there", () => {
    for (const i of FILE.items.filter((x) => x.states)) {
      const eq = i.versions.find((v) => v.type === i.states!.equipped)!;
      const st = i.versions.find((v) => v.type === i.states!.stored)!;
      assert.ok(eq.lifetime && eq.lifetime > 0, `${i.id}: the equipped state lasts a while`);
      assert.ok(!st.lifetime, `${i.id}: the stored state has no clock`);
    }
  });

  test("every spellbook is one book with one spell, titled '<book>: <spell>' in English", () => {
    const books = FILE.items.filter((i) => i.group && FILE.groups.find((g) => g.id === i.group)?.kind === "spellbook");
    assert.equal(books.length, 44);
    for (const b of books) {
      assert.equal(b.versions.length, 1, b.id);
      assert.ok(b.versions[0]!.spell, `${b.id} teaches no spell`);
      assert.match(b.name.en, /^\w+ Spellbook: .+$/);
      for (const lang of LANGS) assert.ok(b.name[lang]?.includes(":"), `${b.id}: no ${lang} title`);
    }
  });

  test("the twelve chess pieces: one page each, their own map spots, a correct name in every language", () => {
    const pieces = FILE.items.filter((i) => i.group === "chess-piece");
    assert.equal(pieces.length, 12);
    assert.equal(pieces.reduce((n, p) => n + p.sources.map.length, 0), 32);
    assert.equal(new Set(pieces.map((p) => p.name.pt)).size, 12);
    assert.equal(new Set(pieces.map((p) => p.name.es)).size, 12);
    // the client's pt/es text names one piece for all twelve: each page's text names its own piece
    for (const p of pieces) for (const lang of ["pt", "es"] as const) {
      const piece = p.name[lang].split(": ")[1]!.toLowerCase();
      assert.ok(p.versions[0]!.text[lang].includes(piece), `${p.id} ${lang}: "${p.versions[0]!.text[lang]}"`);
    }
  });

  test("a split name keeps its old address, now the list of its items, and is an item entity with no relations", () => {
    const ents = new Map(entitiesFromData(FILE, STUBS).map((e) => [e.ref, e]));
    for (const g of FILE.groups) {
      assert.deepEqual(g.slug, SLUGS[`item:${g.id}`], `${g.id} moved`);
      for (const m of g.members) assert.ok(FILE.items.some((i) => i.id === m && i.group === g.id), `${g.id}: ${m}`);
      assert.ok(ents.get(`item:${g.id}`), `${g.id} has no entity`);
      assert.equal(ents.get(`item:${g.id}`)!.relations?.length, 0);
    }
  });
});
