import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EntityError, isEntityRef, parseRef } from "../src/lib/entities/registry.ts";
import { buildReverseIndex, groupReverse } from "../src/lib/entities/reverse.ts";
import { TIERS, TIER_PIPS, tierForRate, tierRank } from "../src/lib/entities/tiers.ts";
import type { Entity } from "../src/lib/entities/types.ts";
import { FIXTURE_ENTITIES } from "./fixtures/entities.ts";

const shipNone = { shippedKinds: [] };

describe("refs", () => {
  test("parse kind and id", () => {
    assert.deepEqual(parseRef("item:example-blade"), { kind: "item", id: "example-blade" });
    assert.ok(isEntityRef("monster:test-slime"));
  });
  test("reject bad refs", () => {
    for (const bad of ["", "item", "item:", ":x", "weapon:x", "item:Upper", "item:with space", "item:a--b", 42]) {
      assert.equal(isEntityRef(bad), false, String(bad));
    }
    assert.throws(() => parseRef("weapon:x"), EntityError);
  });
});

describe("registry", () => {
  const reg = createRegistry(FIXTURE_ENTITIES, shipNone);

  test("looks entities up", () => {
    assert.equal(reg.get("item:sample-ore")?.name.en, "Sample Ore");
    assert.equal(reg.get("item:nope"), undefined);
    assert.equal(reg.all("monster").length, 2);
    assert.deepEqual(reg.all().map((e) => e.ref), [...reg.all().map((e) => e.ref)].sort());
  });

  test("an unknown ref fails loudly, naming the ref", () => {
    assert.throws(() => reg.require("item:does-not-exist"), /unknown entity "item:does-not-exist"/);
    assert.throws(() => reg.link("item:does-not-exist", "pt"), EntityError);
    assert.throws(() => reg.url("bad ref", "pt"), /unknown entity "bad ref" \(bad entity ref/);
  });

  test("an unshipped kind renders as text: no URL, but name, icon and card", () => {
    assert.equal(reg.hasPage("item:example-blade"), false);
    assert.equal(reg.url("item:example-blade", "pt"), null);
    const info = reg.link("item:example-blade", "pt");
    assert.equal(info.href, null);
    assert.equal(info.name, "Lâmina de Exemplo");
    assert.equal(info.altName, "Example Blade");
    assert.ok(info.icon?.src.startsWith("data:image/svg+xml"));
    assert.deepEqual(info.facts[0], { label: "Dano", value: "12" });
  });

  test("shipping a kind turns its links on, in both languages", () => {
    const shipped = createRegistry(FIXTURE_ENTITIES, { shippedKinds: ["item"] });
    assert.equal(shipped.hasPage("item:example-blade"), true);
    assert.equal(shipped.url("item:example-blade", "pt"), "/pt/itens/lamina-de-exemplo/");
    assert.equal(shipped.url("item:example-blade", "en"), "/en/items/example-blade/");
    assert.equal(shipped.link("item:sample-ore", "en").href, "/en/items/sample-ore/");
    assert.equal(shipped.url("monster:test-slime", "pt"), null, "other kinds stay off");
    const noPage = createRegistry(FIXTURE_ENTITIES.map((e) => ({ ...e, noPage: true })), { shippedKinds: ["item"] });
    assert.equal(noPage.url("item:example-blade", "pt"), null, "an entity marked noPage never links");
  });

  test("altName is null when both languages share the name", () => {
    const one: Entity[] = [{ ref: "place:same", name: { pt: "Vale", en: "Vale", es: "Vale" }, slug: { pt: "vale", en: "vale", es: "vale" } }];
    assert.equal(createRegistry(one, shipNone).link("place:same", "en").altName, null);
  });

  test("rejects bad data, listing every problem", () => {
    const bad: Entity[] = [
      { ref: "item:a", name: { pt: "A", en: "A", es: "A" }, slug: { pt: "a", en: "a", es: "a" }, relations: [{ type: "madeFrom", to: "item:ghost" }] },
      { ref: "item:a", name: { pt: "A2", en: "A2", es: "A2" }, slug: { pt: "a2", en: "a2", es: "a2" } },
      { ref: "item:b", name: { pt: "B", en: "", es: "" }, slug: { pt: "a", en: "B B", es: "B B" } },
    ];
    assert.throws(() => createRegistry(bad, shipNone), (err: Error) => {
      assert.ok(err instanceof EntityError);
      for (const part of ['duplicate ref "item:a"', "item:b: no en name", 'item:b: bad en slug "B B"', 'share the pt slug "a"', 'unknown entity "item:ghost"']) {
        assert.ok(err.message.includes(part), `missing: ${part}\n${err.message}`);
      }
      return true;
    });
  });
});

describe("reverse index", () => {
  const reg = createRegistry(FIXTURE_ENTITIES, shipNone);

  test("drops become 'dropped by', with the tier and amount, commonest first", () => {
    const ore = groupReverse(reg.reverse("item:sample-ore"));
    assert.deepEqual(ore.droppedBy?.map((r) => [r.from, r.tier]), [["monster:practice-golem", "sempre"], ["monster:test-slime", "comum"]]);
    assert.deepEqual(ore.droppedBy?.[1]?.amount, [1, 3]);
  });

  test("sells, buys and recipes have their other side", () => {
    assert.deepEqual(groupReverse(reg.reverse("item:sample-potion")).soldBy?.map((r) => [r.from, r.price]), [["npc:sample-merchant", 25]]);
    const ore = groupReverse(reg.reverse("item:sample-ore"));
    assert.deepEqual(ore.boughtBy?.map((r) => r.from), ["npc:sample-merchant"]);
    assert.deepEqual(ore.usedIn?.map((r) => r.from), ["item:example-blade"]);
  });

  test("an entity nobody points at has no reverse refs", () => {
    assert.deepEqual(reg.reverse("place:sample-valley"), []);
  });

  test("is built from the data alone, in a stable order", () => {
    const a = buildReverseIndex(FIXTURE_ENTITIES);
    const b = buildReverseIndex([...FIXTURE_ENTITIES].reverse());
    assert.deepEqual([...a.get("item:sample-ore")!], [...b.get("item:sample-ore")!]);
  });
});

describe("tiers", () => {
  test("rates map to tiers at the band edges", () => {
    const cases: [number, string][] = [[100, "sempre"], [99, "sempre"], [98.9, "comum"], [20, "comum"], [19.9, "incomum"], [5, "incomum"], [4.99, "raro"], [1, "raro"], [0.99, "muito-raro"], [0, "muito-raro"]];
    for (const [rate, tier] of cases) assert.equal(tierForRate(rate), tier, `rate ${rate}`);
    assert.throws(() => tierForRate(-1), RangeError);
    assert.throws(() => tierForRate(Number.NaN), RangeError);
  });
  test("ranks and pips run from common to rare", () => {
    assert.deepEqual(TIERS.map(tierRank), [0, 1, 2, 3, 4]);
    assert.deepEqual(TIERS.map((t) => TIER_PIPS[t]), [5, 4, 3, 2, 1]);
  });
});
