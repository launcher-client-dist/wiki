import { describe, test } from "node:test";
import assert from "node:assert/strict";
import table from "../src/lib/languages.json" with { type: "json" };
import { DEFAULT_LANG, HREFLANG, LANGS, LOCALE, altLang, formatNumber, otherLangs, type Lang } from "../src/lib/i18n.ts";
import { ui } from "../src/i18n/index.ts";
import { SECTIONS, alternatesBy, homeAlternates, kindForSegment, sectionPath } from "../src/lib/routes.ts";
import type { EntityKind } from "../src/lib/entities/types.ts";

/** Every string leaf of a dictionary, by its dotted path. */
function leaves(o: unknown, path = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof o === "string") out.set(path, o);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) leaves(v, path ? `${path}.${k}` : k, out);
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("the languages come from one table", () => {
  test("the list, the default and each language's codes come from languages.json", () => {
    assert.deepEqual(LANGS, Object.keys(table.languages));
    assert.ok(LANGS.includes(DEFAULT_LANG), "the default is one of the languages");
    assert.equal(new Set(Object.values(HREFLANG)).size, LANGS.length, "hreflang codes are unique");
    for (const l of LANGS) {
      assert.ok(LANGS.includes(altLang(l)) && altLang(l) !== l, `${l}: its alt language is another of the list`);
      assert.deepEqual(otherLangs(l), LANGS.filter((x) => x !== l));
      assert.ok(LOCALE[l], `${l}: a locale for numbers and dates`);
    }
  });

  test("every language has the whole dictionary, with the same placeholders as the default's", () => {
    const base = leaves(ui(DEFAULT_LANG));
    for (const l of LANGS) {
      const mine = leaves(ui(l));
      assert.deepEqual([...mine.keys()].sort(), [...base.keys()].sort(), `${l}: the same keys as ${DEFAULT_LANG}`);
      for (const [k, v] of base) {
        assert.equal(placeholders(mine.get(k) ?? ""), placeholders(v), `${l}.${k}: the same {placeholders}`);
        assert.ok((mine.get(k) ?? "").length > 0 || v.length === 0, `${l}.${k}: not empty`);
      }
    }
  });

  test("every section has a URL segment in every language, unique within the language, that maps back", () => {
    for (const l of LANGS) {
      const segs = (Object.keys(SECTIONS) as EntityKind[]).map((k) => SECTIONS[k].slug[l]);
      assert.equal(new Set(segs).size, segs.length, `${l}: section segments are unique`);
      for (const k of Object.keys(SECTIONS) as EntityKind[]) {
        assert.match(SECTIONS[k].slug[l], /^[a-z0-9-]+$/, `${l}/${k}: a plain URL segment`);
        assert.equal(kindForSegment(SECTIONS[k].slug[l], l), k);
        assert.equal(sectionPath(k, l), `/${l}/${SECTIONS[k].slug[l]}/`);
      }
    }
  });

  test("alternates cover every language", () => {
    assert.deepEqual(Object.keys(homeAlternates()).sort(), [...LANGS].sort());
    const alt = alternatesBy((l: Lang) => `/${l}/x/`);
    for (const l of LANGS) assert.equal(alt[l], `/${l}/x/`);
  });

  test("numbers follow the language's own format", () => {
    for (const l of LANGS) assert.equal(formatNumber(1500, l), (1500).toLocaleString(LOCALE[l]));
  });
});
