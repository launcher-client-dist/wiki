/**
 * Each item's social card (1200x630): the item base card (design/og-item-base.html) with the icon in a framed slot,
 * scaled pixel-perfect. Built with sharp (Astro's own image dependency); without it, the default card is copied.
 */
import { readFile } from "node:fs/promises";
import type { APIRoute, GetStaticPaths } from "astro";
import { ITEMS } from "../../../lib/site-registry.ts";
import { primaryVersion } from "../../../lib/items/data.ts";

import { pathToFileURL } from "node:url";

// the project's public/ folder (the build runs from the project root; import.meta.url points into the bundle)
const PUBLIC = new URL("public/", pathToFileURL(`${process.cwd()}/`));

export const getStaticPaths: GetStaticPaths = () =>
  ITEMS.items.map((item) => ({ params: { slug: item.slug.en }, props: { icon: primaryVersion(item).icon, size: primaryVersion(item).iconSize } }));

export const GET: APIRoute = async ({ props }) => {
  const base = await readFile(new URL("og/item-base.png", PUBLIC));
  const { icon, size } = props as { icon?: string; size?: [number, number] };
  let png: Buffer = base;
  try {
    const sharp = (await import("sharp")).default;
    if (icon && size) {
      const SLOT = 300;
      const scale = Math.max(1, Math.floor((SLOT * 0.78) / Math.max(size[0], size[1])));
      const sprite = await sharp(await readFile(new URL(icon.slice(1), PUBLIC)))
        .resize(size[0] * scale, size[1] * scale, { kernel: "nearest" }).png().toBuffer();
      const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SLOT + 16}" height="${SLOT + 22}">
        <rect x="0" y="10" width="${SLOT + 16}" height="${SLOT + 12}" rx="10" fill="#0b0f1c"/>
        <rect x="0" y="0" width="${SLOT + 16}" height="${SLOT + 12}" rx="10" fill="#0b0f1c"/>
        <rect x="8" y="8" width="${SLOT}" height="${SLOT - 4}" rx="6" fill="#0f1430"/>
        <rect x="8" y="${SLOT - 14}" width="${SLOT}" height="10" fill="#000" fill-opacity="0.25"/></svg>`);
      const left = 820, top = 150;
      png = await sharp(base).composite([
        { input: frame, left, top },
        { input: sprite, left: left + 8 + Math.round((SLOT - size[0] * scale) / 2), top: top + 8 + Math.round((SLOT - 4 - size[1] * scale) / 2) },
      ]).png().toBuffer();
    }
  } catch {
    png = base;
  }
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
