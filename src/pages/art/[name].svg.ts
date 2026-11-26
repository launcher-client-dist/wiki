/** The pixel emblems and the logo as cacheable SVG files (/art/<kind>.svg, /art/logo.svg), from src/lib/kind-art.ts. */
import type { APIRoute, GetStaticPaths } from "astro";
import { KIND_ART, LOGO_ART } from "../../lib/kind-art.ts";
import { pixelSvg } from "../../lib/pixel.ts";

const ART = { ...KIND_ART, logo: LOGO_ART };

export const getStaticPaths: GetStaticPaths = () => Object.keys(ART).map((name) => ({ params: { name } }));

export const GET: APIRoute = ({ params }) =>
  new Response(pixelSvg(ART[params.name as keyof typeof ART]), { headers: { "Content-Type": "image/svg+xml" } });
