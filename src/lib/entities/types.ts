/**
 * Entities: everything the wiki can link to. Each one has a kind and an id, written together as a ref
 * ("item:arbalest"), a name and a URL slug per language, and optional icon, summary, facts and relations.
 */
import type { Lang, Localized } from "../i18n.ts";
import type { TierKey } from "./tiers.ts";

export const ENTITY_KINDS = ["item", "monster", "npc", "place", "spell", "trait", "quest", "guide", "build", "class"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** "kind:id", e.g. "item:arbalest". The id is lowercase, digits and dashes. */
export type EntityRef = `${EntityKind}:${string}`;

export interface EntityIcon {
  src: string;
  width: number;
  height: number;
  /** Game sprites are pixel art: scale them with nearest-neighbour, never blurred. */
  pixel?: boolean;
}

export interface EntityFact {
  label: Localized;
  value: string | Localized;
  /** One of the game's UI icons (a GameIcon name) shown beside it. */
  icon?: string;
}

/**
 * A relation from this entity to another. Only one side is written in the data; the other side ("dropped by",
 * "sold by", "used in") comes from the reverse index (reverse.ts).
 */
/** mentions: a content page (guide, build, class...) links to the entity: its EntityLinks and frontmatter. */
export const RELATION_TYPES = ["drops", "sells", "buys", "rewards", "requires", "madeFrom", "teaches", "conjures", "leaves", "opens", "mentions", "related"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface Relation {
  type: RelationType;
  to: EntityRef;
  /** Drop rarity as a tier, never a rate. */
  tier?: TierKey;
  /** [min, max] amount (a drop's stack, a recipe's count). */
  amount?: readonly [number, number];
  /** A price in gold (sells, buys). */
  price?: number;
}

export interface Entity {
  ref: EntityRef;
  name: Localized;
  slug: Localized;
  icon?: EntityIcon;
  /** One or two sentences: the hover card and search excerpt. */
  summary?: Localized;
  /** A few key numbers for the hover card ("Vida 300"). */
  facts?: readonly EntityFact[];
  relations?: readonly Relation[];
  /** Never has a page, even when its kind ships (the made-up fixtures of the component gallery). */
  noPage?: boolean;
}

/** What a link to an entity needs, in one language. `href` is null while the entity's page type hasn't shipped. */
export interface EntityLinkInfo {
  ref: EntityRef;
  kind: EntityKind;
  id: string;
  name: string;
  /** The name in the other language, when it differs. */
  altName: string | null;
  href: string | null;
  icon: EntityIcon | null;
  summary: string | null;
  facts: { label: string; value: string; icon?: string }[];
  lang: Lang;
}
