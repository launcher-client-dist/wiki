/**
 * The entity registry: every entity the site knows, looked up by ref. It validates the data when built (unique refs
 * and slugs, every relation pointing at a known entity) and answers what a link needs: the name, the icon, the hover
 * card and the URL, which is null until the entity's page type ships (routes.ts SHIPPED_KINDS).
 *
 * Pure TypeScript (no astro:content), so it runs under `node --test`. src/lib/site-registry.ts fills it for the site.
 */
import { LANGS, otherLang, type Lang } from "../i18n.ts";
import { entityPath } from "../routes.ts";
import { buildReverseIndex, type ReverseIndex, type ReverseRef } from "./reverse.ts";
import { ENTITY_KINDS, type Entity, type EntityKind, type EntityLinkInfo, type EntityRef } from "./types.ts";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class EntityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityError";
  }
}

export function isEntityRef(value: unknown): value is EntityRef {
  if (typeof value !== "string") return false;
  const i = value.indexOf(":");
  return i > 0 && (ENTITY_KINDS as readonly string[]).includes(value.slice(0, i)) && ID_RE.test(value.slice(i + 1));
}

export function parseRef(ref: string): { kind: EntityKind; id: string } {
  if (!isEntityRef(ref)) {
    throw new EntityError(`bad entity ref "${ref}": expected "kind:id" with kind one of ${ENTITY_KINDS.join(", ")} and an id of lowercase letters, digits and dashes`);
  }
  const i = ref.indexOf(":");
  return { kind: ref.slice(0, i) as EntityKind, id: ref.slice(i + 1) };
}

export interface RegistryOptions {
  /** Kinds whose pages exist: their entities get real links. */
  shippedKinds: Iterable<EntityKind>;
}

export interface Registry {
  /** The entity, or undefined. */
  get(ref: string): Entity | undefined;
  /** The entity, or an EntityError naming the ref (a link to an unknown entity fails the build). */
  require(ref: string): Entity;
  has(ref: string): boolean;
  /** Every entity, or every entity of one kind, sorted by ref. */
  all(kind?: EntityKind): Entity[];
  /** Whether the entity has a page (its kind shipped). Throws for an unknown ref. */
  hasPage(ref: string): boolean;
  /** The entity's page path in `lang`, or null while its kind hasn't shipped. Throws for an unknown ref. */
  url(ref: string, lang: Lang): string | null;
  /** Everything a link and its hover card need, in `lang`. Throws for an unknown ref. */
  link(ref: string, lang: Lang): EntityLinkInfo;
  /** The relations other entities hold to this one ("dropped by", "sold by"...). */
  reverse(ref: string): readonly ReverseRef[];
}

export function createRegistry(entities: readonly Entity[], options: RegistryOptions): Registry {
  const shipped = new Set(options.shippedKinds);
  const byRef = new Map<EntityRef, Entity>();
  const problems: string[] = [];

  const valid: Entity[] = [];
  for (const e of entities) {
    if (!isEntityRef(e.ref)) {
      problems.push(`bad ref "${e.ref}"`);
      continue;
    }
    if (byRef.has(e.ref)) problems.push(`duplicate ref "${e.ref}"`);
    else byRef.set(e.ref, e);
    for (const lang of LANGS) {
      if (!e.name?.[lang]?.trim()) problems.push(`${e.ref}: no ${lang} name`);
      if (!SLUG_RE.test(e.slug?.[lang] ?? "")) problems.push(`${e.ref}: bad ${lang} slug "${e.slug?.[lang] ?? ""}"`);
    }
    valid.push(e);
  }
  // slugs are unique within a kind and language (they share one URL folder)
  const seen = new Map<string, Entity>();
  for (const e of valid) {
    const { kind } = parseRef(e.ref);
    for (const lang of LANGS) {
      const key = `${kind}/${lang}/${e.slug?.[lang]}`;
      const other = seen.get(key);
      if (other && other !== e) problems.push(`${e.ref} and ${other.ref} share the ${lang} slug "${e.slug[lang]}"`);
      else seen.set(key, e);
    }
  }
  for (const e of valid) {
    for (const r of e.relations ?? []) {
      if (!byRef.has(r.to)) problems.push(`${e.ref} ${r.type} unknown entity "${r.to}"`);
    }
  }
  if (problems.length) throw new EntityError(`entity data has ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);

  const reverseIndex: ReverseIndex = buildReverseIndex([...byRef.values()]);
  const sorted = [...byRef.values()].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));

  function require(ref: string): Entity {
    const e = byRef.get(ref as EntityRef);
    if (!e) {
      const hint = isEntityRef(ref) ? "" : ` (${parseErrorHint(ref)})`;
      throw new EntityError(`unknown entity "${ref}"${hint}`);
    }
    return e;
  }

  function hasPage(ref: string): boolean {
    const e = require(ref);
    return shipped.has(parseRef(ref).kind) && !e.noPage;
  }

  function url(ref: string, lang: Lang): string | null {
    const e = require(ref);
    const { kind } = parseRef(e.ref);
    return shipped.has(kind) && !e.noPage ? entityPath(kind, e.slug[lang], lang) : null;
  }

  return {
    get: (ref) => byRef.get(ref as EntityRef),
    require,
    has: (ref) => byRef.has(ref as EntityRef),
    all: (kind) => (kind ? sorted.filter((e) => e.ref.startsWith(`${kind}:`)) : [...sorted]),
    hasPage,
    url,
    link(ref, lang) {
      const e = require(ref);
      const { kind, id } = parseRef(e.ref);
      const alt = e.name[otherLang(lang)];
      return {
        ref: e.ref,
        kind,
        id,
        name: e.name[lang],
        altName: alt && alt !== e.name[lang] ? alt : null,
        href: url(ref, lang),
        icon: e.icon ?? null,
        summary: e.summary?.[lang] ?? null,
        facts: (e.facts ?? []).map((f) => ({ label: f.label[lang], value: typeof f.value === "string" ? f.value : f.value[lang], ...(f.icon ? { icon: f.icon } : {}) })),
        lang,
      };
    },
    reverse: (ref) => reverseIndex.get(ref as EntityRef) ?? [],
  };
}

function parseErrorHint(ref: string): string {
  try {
    parseRef(ref);
    return "";
  } catch (err) {
    return (err as Error).message;
  }
}
