/**
 * Each monster's social card (1200x630): the item base card with the monster's render on the right, on a soft glow.
 * Built with sharp (Astro's own image dependency); without it, the base card is copied.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { APIRoute, GetStaticPaths } from "astro";
import { MONSTERS, STUB_BY_REF } from "../../../lib/site-registry.ts";

const PUBLIC = new URL("public/", pathToFileURL(`${process.cwd()}/`));

export const getStaticPaths: GetStaticPaths = () =>
  MONSTERS.map((m) => ({ params: { slug: STUB_BY_REF.get(`monster:${m.id}`)!.slug.en }, props: { render: m.render?.src } }));

export const GET: APIRoute = async ({ props }) => {
  const base = await readFile(new URL("og/item-base.png", PUBLIC));
  const { render } = props as { render?: string };
  let png: Buffer = base;
  try {
    const sharp = (await import("sharp")).default;
    if (render) {
      const BOX = 420;
      const pic = await sharp(await readFile(new URL(render.slice(1), PUBLIC))).resize(BOX, BOX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      const glow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${BOX + 80}" height="${BOX + 80}"><defs><radialGradient id="g">
        <stop offset="0" stop-color="#4cc38a" stop-opacity="0.28"/><stop offset="1" stop-color="#4cc38a" stop-opacity="0"/></radialGradient></defs>
        <circle cx="${(BOX + 80) / 2}" cy="${(BOX + 80) / 2}" r="${(BOX + 80) / 2}" fill="url(#g)"/></svg>`);
      const left = 740, top = 105;
      png = await sharp(base).composite([{ input: glow, left: left - 40, top: top - 40 }, { input: pic, left, top }]).png().toBuffer();
    }
  } catch {
    png = base;
  }
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
