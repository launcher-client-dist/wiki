/** Pixel icons for the made-up fixtures: the site's own pixel helper, as an icon with a size. */
import { pixelDataUrl, pixelSize } from "../../src/lib/pixel.ts";

export function pixelIcon(rows: readonly string[], palette: Record<string, string>): { src: string; width: number; height: number; pixel: true } {
  const art = { rows, palette };
  return { src: pixelDataUrl(art), ...pixelSize(art), pixel: true };
}
