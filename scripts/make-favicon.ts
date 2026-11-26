// Write public/favicon.svg from the pixel logo (src/lib/kind-art.ts): node scripts/make-favicon.ts
import { writeFileSync } from "node:fs";
import { LOGO_ART } from "../src/lib/kind-art.ts";
import { pixelSvg } from "../src/lib/pixel.ts";

writeFileSync(new URL("../public/favicon.svg", import.meta.url), pixelSvg(LOGO_ART) + "\n");
