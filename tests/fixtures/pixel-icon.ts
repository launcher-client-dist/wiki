/**
 * Tiny pixel-art icons for the made-up fixture entities: each row is a string, each character a palette key
 * ("." = transparent). Returns a data: URL of a crisp SVG, so fixtures need no image files.
 */
export function pixelIcon(rows: readonly string[], palette: Record<string, string>): { src: string; width: number; height: number; pixel: true } {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let rects = "";
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch];
      if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: w * 2, height: h * 2, pixel: true };
}
