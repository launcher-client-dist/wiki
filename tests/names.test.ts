import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { allNames, displayName, inGameLang, nameWithAid } from "../src/lib/names.ts";

const wand = { pt: "Varinha Retorcida", en: "Twisted Wand", es: "Varita Retorcida" };

describe("names: what the game shows", () => {
  test("items, spells and monsters: the in-game (English) name is the title, the page language's translation the aid", () => {
    for (const kind of ["item", "spell", "monster"] as const) assert.equal(inGameLang(kind, "pt"), "en");
    assert.deepEqual(displayName(wand, "item", "pt"), { name: "Twisted Wand", nameLang: "en", aid: "Varinha Retorcida", aidLang: "pt" });
    assert.deepEqual(displayName(wand, "item", "es"), { name: "Twisted Wand", nameLang: "en", aid: "Varita Retorcida", aidLang: "es" });
    assert.equal(nameWithAid(displayName(wand, "item", "pt")), "Twisted Wand (Varinha Retorcida)");
    assert.deepEqual(displayName(wand, "item", "en"), { name: "Twisted Wand", nameLang: "en", aid: null, aidLang: null }, "on an English page, the in-game name alone");
  });

  test("quests, NPCs and places keep the page language's name as the title", () => {
    const quest = { pt: "A Caravana", en: "The Caravan", es: "La Caravana" };
    assert.equal(inGameLang("quest", "pt"), "pt");
    assert.deepEqual(displayName(quest, "quest", "pt"), { name: "A Caravana", nameLang: "pt", aid: "The Caravan", aidLang: "en" });
    assert.equal(displayName(quest, "npc", "es").name, "La Caravana");
  });

  test("an English name standing in for a missing translation is never shown as the aid", () => {
    const rune = { pt: "Amber Rune Raido", en: "Amber Rune Raido", es: "Amber Rune Raido", _fb: ["pt", "es"] as ("pt" | "es")[] };
    assert.deepEqual(displayName(rune, "item", "pt"), { name: "Amber Rune Raido", nameLang: "en", aid: null, aidLang: null });
    assert.equal(nameWithAid(displayName(rune, "item", "pt")), "Amber Rune Raido");
  });

  test("search finds an entity by every name, each once", () => {
    assert.deepEqual(allNames(wand), ["Varinha Retorcida", "Twisted Wand", "Varita Retorcida"]);
  });
});
