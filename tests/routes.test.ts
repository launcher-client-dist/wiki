import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS } from "../src/lib/i18n.ts";
import { ENTITY_KINDS } from "../src/lib/entities/types.ts";
import { absoluteUrl, entityPath, homePath, kindForSegment, SECTIONS, sectionPath, SHIPPED_KINDS } from "../src/lib/routes.ts";

test("every kind has a URL segment in every language, unique per language", () => {
  for (const lang of LANGS) {
    const segs = ENTITY_KINDS.map((k) => SECTIONS[k].slug[lang]);
    assert.equal(new Set(segs).size, segs.length, `duplicate segment in ${lang}`);
    for (const s of segs) assert.match(s, /^[a-z0-9-]+$/);
  }
});

test("paths are directory-style with a trailing slash", () => {
  assert.equal(homePath("pt"), "/pt/");
  assert.equal(sectionPath("guide", "en"), "/en/guides/");
  assert.equal(entityPath("quest", "x", "pt"), "/pt/missoes/x/");
  assert.equal(absoluteUrl("/en/guides/"), "https://wiki.opengea.tech/en/guides/");
});

test("segments map back to their kind", () => {
  assert.equal(kindForSegment("guias", "pt"), "guide");
  assert.equal(kindForSegment("guides", "pt"), undefined);
});

test("shipped kinds are real kinds", () => {
  for (const k of SHIPPED_KINDS) assert.ok((ENTITY_KINDS as readonly string[]).includes(k));
});
