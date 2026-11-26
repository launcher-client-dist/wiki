import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS } from "../src/lib/i18n.ts";
import type { ItemsFile, StubEntity } from "../src/lib/items/data.ts";
import { MONSTER_STAT_KEYS, expPerHealth, monsterRank, realOffset, respawnText, similarMonsters, type MonsterData, type MonstersFile } from "../src/lib/monsters/data.ts";
import { allSpellWords, spellWords } from "../src/lib/monsters/spells.ts";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8")) as T;
const MONSTERS = read<MonstersFile>("monsters.json").monsters;
const ITEMS = read<ItemsFile>("items.json").items;
const STUBS = read<{ entities: StubEntity[] }>("entities.json").entities;

describe("the monster data", () => {
  test("every monster has a stub (name, slug, icon) and every monster stub has a monster page", () => {
    const stubs = new Set<string>(STUBS.filter((s) => s.ref.startsWith("monster:")).map((s) => s.ref));
    const pages = new Set<string>(MONSTERS.map((m) => `monster:${m.id}`));
    assert.deepEqual([...pages].filter((r) => !stubs.has(r)), []);
    assert.deepEqual([...stubs].filter((r) => !pages.has(r)), []);
    for (const s of STUBS.filter((x) => pages.has(x.ref))) assert.ok(s.icon, `${s.ref} has no icon`);
  });

  test("a monster's drops and the items' 'dropped by' agree, both ways, with the same tier", () => {
    const fromMonsters = new Set(MONSTERS.flatMap((m) => m.drops.map((d) => `${m.id}>${d.item}>${d.tier}`)));
    const fromItems = new Set(ITEMS.flatMap((i) => i.sources.drops.map((d) => `${d.monster.slice("monster:".length)}>${i.id}>${d.tier}`)));
    // a summoned creature drops nothing, so it never shows on an item either
    assert.deepEqual([...fromMonsters].filter((k) => !fromItems.has(k)), []);
    assert.deepEqual([...fromItems].filter((k) => !fromMonsters.has(k)), []);
  });

  test("no rate anywhere: no key that reads like a chance, a rate or a percentage", () => {
    const text = readFileSync(new URL("../src/data/monsters.json", import.meta.url), "utf8");
    assert.deepEqual(text.match(/"\w*(chance|rate|percent|pct|odds|probability)\w*":/gi) ?? [], []);
  });

  test("the loot value is rounded to two significant digits (never enough to read a rate back)", () => {
    for (const m of MONSTERS) {
      if (m.loot === null) continue;
      const digits = String(m.loot).replace(/^0\.0*|\./g, "").replace(/0+$/, "");
      assert.ok(digits.length <= 2, `${m.id} loot ${m.loot}`);
    }
  });

  test("variants link both ways; a summoner's creature has a page", () => {
    const ids = new Set(MONSTERS.map((m) => m.id));
    for (const m of MONSTERS) {
      for (const v of m.variants) assert.ok(MONSTERS.find((o) => o.id === v)?.variants.includes(m.id), `${m.id} <-> ${v}`);
      for (const s of m.behaviour.summons ?? []) assert.ok(ids.has(s.monster), `${m.id} summons ${s.monster}`);
      if (m.behaviour.onDeath) assert.ok(ids.has(m.behaviour.onDeath));
    }
  });

  test("every monster has its render and a level band when it gives experience", () => {
    for (const m of MONSTERS) {
      assert.ok(m.render?.src.endsWith(".webp"), `${m.id} has no render`);
      if (m.stats.exp > 0) assert.ok(m.level && m.level.min <= m.level.max, `${m.id} level`);
    }
  });
});

describe("the monster pages' numbers and words", () => {
  const fake = (id: string, health: number, extra: Partial<MonsterData> = {}): MonsterData => {
    const stats = { ...Object.fromEntries(MONSTER_STAT_KEYS.map((k) => [k, 0])), health, exp: health } as MonsterData["stats"];
    return {
      id, how: "spawn", boss: false, respawn: [60], spells: [], behaviour: { jumpsFloors: false, flees: false, seesInvisible: false, spellsOnly: false },
      level: { min: 10, max: 12 }, drops: [], loot: null, places: [], windows: [], family: null, variants: [], ...extra, stats,
    };
  };

  test("a rank: biggest first, ties share the better rank, a zero has none", () => {
    const all = [fake("a", 100), fake("b", 300), fake("c", 300), fake("d", 0)];
    assert.deepEqual(monsterRank(all, all[1]!, "health"), { rank: 1, of: 3, share: 1 });
    assert.equal(monsterRank(all, all[0]!, "health")!.rank, 3);
    assert.equal(monsterRank(all, all[3]!, "health"), null);
    assert.equal(expPerHealth(all[0]!), 1);
  });

  test("game hour H starts at real minute H x 2.5", () => {
    assert.equal(realOffset(0), "00:00");
    assert.equal(realOffset(1), "02:30");
    assert.equal(realOffset(6), "15:00");
    assert.equal(realOffset(24), "00:00");
  });

  test("respawn in seconds below two minutes, else minutes", () => {
    assert.equal(respawnText([60], "pt"), "60 s");
    assert.equal(respawnText([450], "pt"), "7,5 min");
    assert.equal(respawnText([120, 240], "en"), "2–4 min");
  });

  test("similar monsters: a boss beside bosses, the nearest band first, never itself or its variant", () => {
    const m = fake("m", 100, { variants: ["v"] });
    const all = [m, fake("v", 100, { level: { min: 10, max: 12 } }), fake("near", 100, { level: { min: 11, max: 13 } }), fake("far", 100, { level: { min: 40, max: 50 } }),
      fake("boss", 100, { boss: true, level: { min: 10, max: 12 } })];
    const out = similarMonsters(all, m, 2).map((o) => o.id);
    assert.deepEqual(out, ["near", "far"]);
  });

  test("every spell gets a name in every language; the dictionary never repeats the engine's labels", () => {
    for (const lang of LANGS) {
      const words = allSpellWords(lang);
      assert.ok(words.every((w) => w && !w.includes("{") && !/monster|spell \d/i.test(w)), `${lang}: ${words.join(", ")}`);
    }
    for (const m of MONSTERS) for (const sp of m.spells) if (!sp.spell) for (const lang of LANGS) assert.ok(spellWords(sp, lang).length > 2);
  });
});
