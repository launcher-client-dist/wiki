/**
 * The map's layer files: /map-data/<lang>/<layer>.json (src/lib/map/layers.ts says what they hold). Built once per
 * language; the map page loads a layer when it is first shown.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { LANGS, type Lang } from "../../../lib/i18n.ts";
import { LAYERS, buildLayers } from "../../../lib/map/layers.ts";
import { siteData } from "../../../lib/site-registry.ts";

export const getStaticPaths: GetStaticPaths = () =>
  LANGS.flatMap((lang) => [...LAYERS, "spoiler"].map((layer) => ({ params: { lang, layer } })));

const cache = new Map<Lang, ReturnType<typeof buildLayers>>();

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  if (!cache.has(lang)) {
    const { registry, monsters } = await siteData();
    cache.set(lang, buildLayers(lang, registry, monsters));
  }
  const file = cache.get(lang)![params.layer as keyof ReturnType<typeof buildLayers>];
  return new Response(JSON.stringify(file), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
