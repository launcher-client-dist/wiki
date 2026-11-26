/**
 * Pixel art from text: each row is a string, each character a palette key ("." or a missing key = transparent).
 * Used for the kind emblems, the logo and the made-up fixture icons, so none of them needs an image file.
 */
export interface PixelArt {
  rows: readonly string[];
  palette: Record<string, string>;
}

export function pixelSvg({ rows, palette }: PixelArt, attrs = ""): string {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let rects = "";
  rows.forEach((row, y) => {
    // merge horizontal runs of one colour: fewer rects, smaller HTML
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = palette[ch];
      if (fill) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`;
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" ${attrs}>${rects}</svg>`;
}

export function pixelDataUrl(art: PixelArt): string {
  return `data:image/svg+xml,${encodeURIComponent(pixelSvg(art))}`;
}

export function pixelSize(art: PixelArt): { width: number; height: number } {
  return { width: Math.max(...art.rows.map((r) => r.length)), height: art.rows.length };
}
