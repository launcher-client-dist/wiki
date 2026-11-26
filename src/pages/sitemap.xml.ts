/**
 * sitemap.xml: every indexable page with its twin in the other language (xhtml:link alternates), so the pairs hold
 * even where the two languages' slugs differ. Built from the route table and the registry, like the pages.
 */
import type { APIRoute } from "astro";
import { HREFLANG, LANGS, type Lang } from "../lib/i18n.ts";
import { absoluteUrl, homeAlternates, sectionAlternates, SHIPPED_KINDS, type Alternates } from "../lib/routes.ts";
import { siteData } from "../lib/site-registry.ts";

export const GET: APIRoute = async () => {
  const { registry, guides } = await siteData();
  const pages: { alternates: Alternates; lastmod?: string }[] = [{ alternates: homeAlternates() }];
  for (const kind of SHIPPED_KINDS) pages.push({ alternates: sectionAlternates(kind) });
  const seen = new Set<string>();
  for (const g of guides) {
    if (seen.has(g.ref)) continue;
    seen.add(g.ref);
    const alternates = Object.fromEntries(LANGS.map((l) => [l, registry.url(g.ref, l)!])) as Record<Lang, string>;
    const updated = LANGS.map((l) => g.twins[l].data.updated.getTime()).reduce((a, b) => Math.max(a, b));
    pages.push({ alternates, lastmod: new Date(updated).toISOString().slice(0, 10) });
  }
  const urls = pages.flatMap((p) => LANGS.map((lang) => {
    const links = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${absoluteUrl(p.alternates[l])}"/>`).join("\n");
    const xdefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(p.alternates.pt)}"/>`;
    const lastmod = p.lastmod ? `\n    <lastmod>${p.lastmod}</lastmod>` : "";
    return `  <url>\n    <loc>${absoluteUrl(p.alternates[lang])}</loc>${lastmod}\n${links}\n${xdefault}\n  </url>`;
  }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
