import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRegistry } from "../src/lib/entities/registry.ts";
import { appearsIn, refsInMdx } from "../src/lib/entities/appears.ts";
import { groupReverse } from "../src/lib/entities/reverse.ts";
import type { Entity } from "../src/lib/entities/types.ts";
import { entitiesFromData, goldPerOz, signed, sourceKinds, type ItemData, type ItemsFile, type StubEntity } from "../src/lib/items/data.ts";

/** A made-up item file: two items, one recipe, a dropping monster, a selling NPC, a rewarding quest. */
function fixture(): { file: ItemsFile; stubs: StubEntity[] } {
  const base = (id: string, name: string): ItemData => ({
    id, types: [1], primary: 1, name: { pt: name, en: name }, slug: { pt: id, en: id }, category: "material",
    subtype: { key: "Gems", pt: "Gemas", en: "Gems" }, slots: [], value: { npcPays: 30, npcSells: null },
    versions: [{ type: 1, text: { pt: "", en: "" }, stats: {}, weight: 3, stack: 10 }],
    sources: { drops: [], shops: [], buyers: [], quests: [], map: [], recipes: [], conjured: [], leftover: [] },
    uses: { recipes: [], questsRequire: [], leavesEmpty: [] },
  });
  const ore = base("test-ore", "Test Ore");
  ore.sources.drops.push({ monster: "monster:m1", tier: "raro", amount: [1, 2], quality: false });
  ore.sources.shops.push({ npc: "npc:n1", price: 50, stock: { kind: "unlimited" }, spoiler: false, afterQuests: [], where: null });
  const bar = base("test-bar", "Test Bar");
  bar.sources.recipes.push({ method: "join", result: "test-bar", ingredients: [{ item: "test-ore", n: 1, tool: false }] });
  bar.sources.quests.push({ quest: "quest:q1", amount: 1 });
  const stubs: StubEntity[] = [
    { ref: "monster:m1", name: { pt: "Bicho", en: "Critter" }, slug: { pt: "bicho", en: "critter" } },
    { ref: "npc:n1", name: { pt: "Vendedor", en: "Vendor" }, slug: { pt: "vendedor", en: "vendor" } },
    { ref: "quest:q1", name: { pt: "Missão", en: "Quest" }, slug: { pt: "missao", en: "quest" } },
  ];
  return { file: { items: [ore, bar], forging: [], dropQuality: [] }, stubs };
}

describe("item data -> registry", () => {
  test("relations land on the side that owns them, and turn around for the item", () => {
    const { file, stubs } = fixture();
    const reg = createRegistry(entitiesFromData(file, stubs), { shippedKinds: ["item"] });
    const ore = groupReverse(reg.reverse("item:test-ore"));
    assert.deepEqual(ore.droppedBy?.map((r) => [r.from, r.tier]), [["monster:m1", "raro"]]);
    assert.deepEqual(ore.soldBy?.map((r) => [r.from, r.price]), [["npc:n1", 50]]);
    assert.deepEqual(ore.usedIn?.map((r) => r.from), ["item:test-bar"]);
    assert.deepEqual(groupReverse(reg.reverse("item:test-bar")).rewardOf?.map((r) => r.from), ["quest:q1"]);
    assert.equal(reg.url("item:test-ore", "pt"), "/pt/itens/test-ore/");
    assert.equal(reg.url("monster:m1", "pt"), null, "monsters have no pages yet");
  });

  test("a potion and its empty link both ways; a map object in a recipe makes no item relation", () => {
    const { file, stubs } = fixture();
    const potion = { ...file.items[0]!, id: "test-potion", slug: { pt: "pocao", en: "potion" }, name: { pt: "Poção", en: "Potion" },
      sources: { ...file.items[0]!.sources, drops: [], shops: [] }, uses: { recipes: [], questsRequire: [], leavesEmpty: [{ item: "test-empty" }] } };
    const empty = { ...file.items[0]!, id: "test-empty", slug: { pt: "vazio", en: "empty" }, name: { pt: "Vazio", en: "Empty" },
      sources: { ...file.items[0]!.sources, drops: [], shops: [], leftover: [{ item: "test-potion" }] } };
    const filled = { ...file.items[1]!, id: "test-filled", slug: { pt: "cheio", en: "filled" }, name: { pt: "Cheio", en: "Filled" },
      sources: { ...file.items[1]!.sources, quests: [], recipes: [{ method: "join" as const, result: "test-filled",
        ingredients: [{ item: "test-empty", n: 1, tool: false }, { object: "well" as const, where: [], n: 1, tool: true }] }] } };
    const reg = createRegistry(entitiesFromData({ ...file, items: [...file.items, potion, empty, filled] }, stubs), { shippedKinds: ["item"] });
    assert.deepEqual(groupReverse(reg.reverse("item:test-empty")).leftBy?.map((r) => r.from), ["item:test-potion"]);
    assert.deepEqual(sourceKinds(empty), ["leftover"]);
    assert.deepEqual(reg.require("item:test-filled").relations?.map((r) => [r.type, r.to]), [["madeFrom", "item:test-empty"]]);
  });

  test("helpers: where it comes from, gold per ounce, signed stats", () => {
    const { file } = fixture();
    assert.deepEqual(sourceKinds(file.items[0]!), ["drop", "shop"]);
    assert.deepEqual(sourceKinds(file.items[1]!), ["quest", "craft"]);
    assert.equal(goldPerOz(file.items[0]!), 10);
    assert.equal(signed(5), "+5");
    assert.equal(signed(-100), "−100");
  });
});

describe("where an item appears: any kind of page, by itself", () => {
  test("a page of a new kind (a build) that links to an item makes a section on that item, with no item-page change", () => {
    const { file, stubs } = fixture();
    const build: Entity = {
      ref: "build:example", name: { pt: "Build", en: "Build" }, slug: { pt: "build", en: "build" },
      relations: [{ type: "mentions", to: "item:test-ore" }],
    };
    const guide: Entity = {
      ref: "guide:g", name: { pt: "Guia", en: "Guide" }, slug: { pt: "guia", en: "guide" },
      relations: [{ type: "mentions", to: "item:test-ore" }],
    };
    const before = createRegistry(entitiesFromData(file, stubs), { shippedKinds: ["item"] });
    assert.deepEqual(appearsIn(before, "item:test-ore", ["droppedBy", "soldBy", "usedIn"]), [], "nothing beyond the data yet");
    const after = createRegistry([...entitiesFromData(file, stubs), build, guide], { shippedKinds: ["item"] });
    const sections = appearsIn(after, "item:test-ore", ["droppedBy", "soldBy", "usedIn"]);
    assert.deepEqual(sections.map((s) => s.kind), ["guide", "build"], "guides first, then builds");
    assert.deepEqual(sections[1]!.refs, ["build:example"]);
  });

  test("MDX links are found, once each", () => {
    const body = `Use <EntityLink to="item:a" /> and <EntityLink label="x" to='item:b'/> and again <EntityLink to="item:a" />.`;
    assert.deepEqual(refsInMdx(body), ["item:a", "item:b"]);
  });
});

describe("the exported data never carries a drop rate", () => {
  const text = readFileSync(new URL("../src/data/items.json", import.meta.url), "utf8")
    + readFileSync(new URL("../src/data/entities.json", import.meta.url), "utf8");
  test("no rate-like key and no percent sign outside the game's own texts", () => {
    assert.deepEqual(text.match(/"\w*(chance|rate|percent|pct|odds)\w*"\s*:/gi) ?? [], []);
    const data = JSON.parse(readFileSync(new URL("../src/data/items.json", import.meta.url), "utf8")) as ItemsFile;
    const gameTexts = new Set(data.items.flatMap((i) => i.versions.flatMap((v) => [v.text.pt, v.text.en])));
    const stray: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") { if (v.includes("%") && !gameTexts.has(v)) stray.push(`${path}: ${v}`); }
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(data, "items");
    assert.deepEqual(stray, []);
  });
  test("drops carry a tier, never a number of their own", () => {
    const data = JSON.parse(readFileSync(new URL("../src/data/items.json", import.meta.url), "utf8")) as ItemsFile;
    for (const i of data.items) for (const d of i.sources.drops) {
      assert.deepEqual(Object.keys(d).sort(), ["amount", "monster", "quality", "tier"], `${i.id}: ${JSON.stringify(d)}`);
    }
  });
});

describe("NPCs that appear after a quest", () => {
  test("only a spoilered shop or buyer names quests, and every one it names is a known quest", () => {
    const data = JSON.parse(readFileSync(new URL("../src/data/items.json", import.meta.url), "utf8")) as ItemsFile;
    const known = new Set((JSON.parse(readFileSync(new URL("../src/data/entities.json", import.meta.url), "utf8")) as { entities: { ref: string }[] }).entities.map((e) => e.ref));
    let gated = 0;
    for (const i of data.items) for (const s of [...i.sources.shops, ...i.sources.buyers]) {
      assert.ok(Array.isArray(s.afterQuests), `${i.id}: ${s.npc} has no afterQuests`);
      if (!s.spoiler) assert.deepEqual(s.afterQuests, [], `${i.id}: ${s.npc} names a quest but isn't behind a spoiler`);
      for (const q of s.afterQuests) assert.ok(q.startsWith("quest:") && known.has(q), `${i.id}: ${q}`);
      if (s.spoiler) gated++;
    }
    assert.ok(gated > 0, "no quest-opened NPC at all: the export lost them");
  });
});
