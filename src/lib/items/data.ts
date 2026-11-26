/**
 * The item data (src/data/items.json, written by the private export: one entry per item name, the game's versions of
 * that name inside) and the stubs of what items point at (src/data/entities.json). Pure TypeScript: the registry's
 * entities and relations are made here, so tests can build them without Astro.
 */
import { LANGS, type Lang, type Localized } from "../i18n.ts";
import { ui } from "../../i18n/index.ts";

/** Which languages of a text are the English, standing in where the game has no translation (the export marks them). */
export interface Fallback {
  _fb?: Lang[];
}

/** The language a text really is in, for its `lang` attribute: English where it stands in for `lang`, else `lang`. */
/** A text per language, from a function of the language. */
export function perLang(f: (lang: Lang) => string): Localized {
  return Object.fromEntries(LANGS.map((l) => [l, f(l)])) as Localized;
}

export function textLang(text: Fallback | null | undefined, lang: Lang): Lang {
  return text?._fb?.includes(lang) ? "en" : lang;
}
import type { Entity, EntityRef, Relation } from "../entities/types.ts";
import type { TierKey } from "../entities/tiers.ts";

export const STAT_KEYS = ["damage", "defense", "armor", "attackSpeed", "range", "magic", "skill", "health", "mana", "hpRegen", "mpRegen", "moveSpeed"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Partial<Record<StatKey, number>>;
export const CLASS_KEYS = ["knight", "mage", "rogue", "squire"] as const;
export type ClassKey = (typeof CLASS_KEYS)[number];
export const CATEGORIES = ["weapon", "shield", "armour", "jewellery", "ammo", "container", "light", "food", "drink", "potion", "spellbook", "book", "rune", "gem", "material", "tool", "quest", "house", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const SOURCE_KINDS = ["drop", "shop", "quest", "craft", "map", "conjure", "leftover"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface OneIn {
  oneIn: number;
  approx: boolean;
}

export interface Quality {
  rarity: number;
  stats: Stats;
  weight: number;
  lifetime?: number;
  classes?: Partial<Record<ClassKey, Stats>>;
}

export interface Version {
  type: number;
  text: Localized & Fallback;
  stats: Stats;
  weight: number;
  stack: number;
  icon?: string;
  iconSize?: [number, number];
  classes?: Partial<Record<ClassKey, Stats>>;
  qualities?: Quality[];
  lifetime?: number;
  food?: { seconds: number; buff: Stats };
  potion?: { min: number; max: number; stat: "health" | "mana"; seconds: number };
  drinkSeconds?: number;
  resist?: { type: number; amount: number };
  resistSeconds?: number;
  slots?: number;
  light?: boolean;
  spell?: EntityRef;
  becomesWhenEquipped?: number;
}

export interface Place {
  town: Localized & Fallback;
  near: (Localized & Fallback) | null;
  underground: boolean;
}
export interface Where {
  place: Place;
  link: string;
}

export interface Recipe {
  method: "join" | "cook" | "cut";
  result: string;
  /** An ingredient is an item, or a map object (a well) with some of the spots that hold one: no item, no link. */
  ingredients: { item?: string; object?: "well"; where?: Where[]; n: number; tool: boolean }[];
}

export interface ItemData {
  id: string;
  types: number[];
  primary: number;
  name: Localized & Fallback;
  slug: Localized;
  category: Category;
  /** The game's item type: its key and its name per language (`_fb`: the languages showing the English). */
  subtype: { key: string } & Localized & Fallback;
  slots: string[];
  icon?: string;
  armourClass?: "heavy" | "light";
  twoHanded?: boolean;
  forgeable?: boolean;
  ingotFor?: number[];
  rune?: { fits: ({ key: string } & Localized & Fallback)[]; subtypes: number[]; fitsItems: string[] };
  value: { npcPays: number | null; npcSells: number | null };
  versions: Version[];
  sources: {
    drops: { monster: EntityRef; tier: TierKey; amount: [number, number]; quality: boolean }[];
    /** `spoiler`: the NPC appears (or trades) only after a quest; `afterQuests` names it where it is known. */
    shops: { npc: EntityRef; price: number; stock: { kind: "unlimited" | "limited" | "blackMarket"; n?: number }; spoiler: boolean; afterQuests: EntityRef[]; where: Where | null }[];
    buyers: { npc: EntityRef; price: number; spoiler: boolean; afterQuests: EntityRef[]; where: Where | null }[];
    quests: { quest: EntityRef; amount: number }[];
    map: { x: number; y: number; z: number; place: Place; link: string }[];
    recipes: Recipe[];
    conjured: { spell: EntityRef; seconds: number }[];
    /** Left in the bag after drinking these potions (item ids). */
    leftover: { item: string }[];
  };
  /** `leavesEmpty`: what drinking it leaves in the bag (item ids). */
  uses: { recipes: Recipe[]; questsRequire: { quest: EntityRef }[]; leavesEmpty: { item: string }[] };
}

export interface ForgingStep {
  from: number;
  ingot: string;
  count: number;
  upgrade: OneIn | null;
  bothBreak: OneIn | null;
}

export interface ItemsFile {
  items: ItemData[];
  forging: ForgingStep[];
  dropQuality: ({ rarity: number } & OneIn)[];
}

export interface StubEntity {
  ref: EntityRef;
  name: Localized & Fallback;
  slug: Localized;
  icon?: string;
  iconSize?: [number, number];
  /** A few numbers for its hover card, labelled by key from the site's dictionary (`facts`): no UI words in the data. */
  facts?: { key: "health" | "exp"; value: string }[];
  boss?: boolean;
  /** One or two sentences for its hover card (a lever's place). */
  summary?: Localized;
  /** How a monster that doesn't come from an ordinary spawn point appears (no field: an ordinary spawn). */
  appears?: MonsterAppears;
}

/** A monster's way into the world, when it isn't an ordinary spawn point. */
export type MonsterAppears =
  | { how: "timed" }
  | { how: "placed"; where: Where }
  | { how: "lever"; place: EntityRef; where: Where }
  | { how: "travel"; via: EntityRef };

export function itemRef(id: string): EntityRef {
  return `item:${id}`;
}

/** The version a page leads with: the one with the most stats (the export picked it as `primary`). */
export function primaryVersion(item: ItemData): Version {
  return item.versions.find((v) => v.type === item.primary) ?? item.versions[0]!;
}

/** Where an item comes from, as filter values. */
export function sourceKinds(item: ItemData): SourceKind[] {
  const s = item.sources;
  const out: SourceKind[] = [];
  if (s.drops.length) out.push("drop");
  if (s.shops.length) out.push("shop");
  if (s.quests.length) out.push("quest");
  if (s.recipes.length) out.push("craft");
  if (s.map.length) out.push("map");
  if (s.conjured.length) out.push("conjure");
  if (s.leftover.length) out.push("leftover");
  return out;
}

/** Gold an NPC pays per ounce (for hunters who sell what they carry), or null. */
export function goldPerOz(item: ItemData): number | null {
  const w = primaryVersion(item).weight;
  return item.value.npcPays && w > 0 ? Math.round((item.value.npcPays / w) * 10) / 10 : null;
}

const STAT_LABEL: Record<StatKey, Localized> = {
  damage: { pt: "Dano", en: "Damage", es: "Daño" }, defense: { pt: "Defesa", en: "Defense", es: "Defensa" }, armor: { pt: "Armadura", en: "Armor", es: "Armadura" },
  attackSpeed: { pt: "Vel. de ataque", en: "Attack speed", es: "Vel. de ataque" }, range: { pt: "Alcance", en: "Range", es: "Alcance" },
  magic: { pt: "Magia", en: "Magic", es: "Magia" }, skill: { pt: "Habilidade", en: "Ability", es: "Habilidad" },
  health: { pt: "Vida", en: "Health", es: "Vida" }, mana: { pt: "Mana", en: "Mana", es: "Maná" },
  hpRegen: { pt: "Regen. de vida", en: "Health regen", es: "Regen. de vida" }, mpRegen: { pt: "Regen. de mana", en: "Mana regen", es: "Regen. de maná" },
  moveSpeed: { pt: "Velocidade", en: "Speed", es: "Velocidad" },
};
export function statLabel(k: StatKey): Localized {
  return STAT_LABEL[k];
}

/** A signed number as the game shows a stat ("+5", "-100"). */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`.replace("-", "−");
}

/**
 * The registry's entities from the item data and the stubs: one entity per item (icon, game text as summary, a few
 * stats as facts) and one per stub, with the relations the data holds written on the side that owns them (a monster
 * drops, an NPC sells and buys, a quest rewards or requires, a recipe's result is made from its ingredients, a spell
 * conjures, a spellbook teaches, a potion leaves its empty). The reverse index turns them around for the item pages.
 */
/** The stubs' facts (a monster's health and exp) and the game icon each one shows with. */
const STUB_FACT_ICON: Record<string, string> = { health: "stat-health", exp: "xp" };

export function entitiesFromData(file: ItemsFile, stubs: readonly StubEntity[]): Entity[] {
  const rel = new Map<EntityRef, Relation[]>();
  const add = (from: EntityRef, r: Relation) => (rel.get(from) ?? rel.set(from, []).get(from)!).push(r);
  for (const item of file.items) {
    const me = itemRef(item.id);
    for (const d of item.sources.drops) add(d.monster, { type: "drops", to: me, tier: d.tier, amount: d.amount });
    for (const s of item.sources.shops) add(s.npc, { type: "sells", to: me, price: s.price });
    for (const b of item.sources.buyers) add(b.npc, { type: "buys", to: me, price: b.price });
    for (const q of item.sources.quests) add(q.quest, { type: "rewards", to: me, amount: [q.amount, q.amount] });
    for (const q of item.uses.questsRequire) add(q.quest, { type: "requires", to: me });
    for (const c of item.sources.conjured) add(c.spell, { type: "conjures", to: me });
    for (const r of item.sources.recipes) for (const ing of r.ingredients) if (ing.item) add(me, { type: "madeFrom", to: itemRef(ing.item) });
    for (const l of item.uses.leavesEmpty) add(me, { type: "leaves", to: itemRef(l.item) });
    for (const v of item.versions) if (v.spell) add(me, { type: "teaches", to: v.spell });
  }
  const dedupe = (rs: Relation[]) => [...new Map(rs.map((r) => [`${r.type}|${r.to}|${r.tier ?? ""}`, r])).values()];
  const out: Entity[] = file.items.map((item) => {
    const v = primaryVersion(item);
    const stats = Object.entries(v.stats).slice(0, 3) as [StatKey, number][];
    const icon = v.icon && v.iconSize ? { src: v.icon, width: v.iconSize[0], height: v.iconSize[1], pixel: true } : undefined;
    const me = itemRef(item.id);
    return {
      ref: me,
      name: item.name,
      slug: item.slug,
      ...(icon ? { icon } : {}),
      summary: perLang((l) => v.text[l] || item.subtype[l]),
      facts: [{ label: perLang((l) => ui(l).item.colType), value: perLang((l) => item.subtype[l]), icon: `cat-${item.category}` },
        ...stats.map(([k, n]) => ({ label: statLabel(k), value: signed(n), icon: `stat-${k}` }))],
      relations: dedupe(rel.get(me) ?? []),
    };
  });
  for (const s of stubs) {
    out.push({
      ref: s.ref,
      name: s.name,
      slug: s.slug,
      ...(s.icon && s.iconSize ? { icon: { src: s.icon, width: s.iconSize[0], height: s.iconSize[1] } } : {}),
      ...(s.summary ? { summary: s.summary } : {}),
      ...(s.facts ? { facts: s.facts.map((f) => ({ label: perLang((l) => ui(l).facts[f.key]), value: f.value, icon: STUB_FACT_ICON[f.key] })) } : {}),
      relations: dedupe(rel.get(s.ref) ?? []),
    });
  }
  return out;
}
