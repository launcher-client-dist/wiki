/**
 * Ids unique within one page and the same on every build: a base id (from the content, say) and, when the same base
 * comes again on the page, "-2", "-3"... Scoped by the page's render (Astro.request), so two pages never share counts.
 */
const seen = new WeakMap<object, Map<string, number>>();

export function stableId(page: object, base: string): string {
  let counts = seen.get(page);
  if (!counts) seen.set(page, (counts = new Map()));
  const n = (counts.get(base) ?? 0) + 1;
  counts.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}
