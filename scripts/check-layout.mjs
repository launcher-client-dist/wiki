// Layout check: what Lighthouse and axe don't see. Builds nothing: it serves an existing build (dist/ by default) and
// measures pages in a headless Chrome with getBoundingClientRect. The rules (docs/theming.md, "Layout rules"):
//   header      a table header label is one line, its column icon sits inline (same line as the label), and its edge
//               matches its column's cells (numbers right, text left)
//   row-height  every row of a table has the same height
//   icon-column in a box or list with an icon column, every row has one leading icon box, all at one x and one size
//   orphan      a wrapping group of 3 or more items (flex, grid, or chips laid inline) never leaves one item alone on its
//               last line; a list that reads like text opts out with data-flow (listed, not failed)
//   overflow    no horizontal page overflow; no element clips its content (hidden/clip with content wider than it)
//   expect      every page answers its status and has the parts the rules measure (a rule that matches nothing fails)
//
//   node scripts/check-layout.mjs [--dist DIR] [--only home,list,item-rune] [--langs pt,es,en] [--sweep]
// Chrome: CHROME_PATH, else the usual install paths (Windows, macOS, Linux).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SECTIONS } from "../src/lib/routes.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const DIST = path.resolve(arg("--dist") ?? path.join(ROOT, "dist"));
const ONLY = arg("--only")?.split(",");
const SWEEP = process.argv.includes("--sweep");
const LANGS = (arg("--langs") ?? "pt,es,en").split(",");
const VIEWPORTS = [{ name: "1440", width: 1440, height: 900 }, { name: "1024", width: 1024, height: 800 }, { name: "390", width: 390, height: 844, mobile: true }];

// ---- the page set: home, list, a guide, 404 and one item of every kind (picked from the data, the fullest page)
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/items.json"), "utf8"));
const richness = (i) => Object.values(i.sources).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0) + i.versions.length + (i.forgeable ? 3 : 0);
const pick = (fn) => [...data.items].filter(fn).sort((a, b) => richness(b) - richness(a) || a.id.localeCompare(b.id))[0];
const KINDS = {
  weapon: (i) => i.category === "weapon", armour: (i) => i.category === "armour", jewel: (i) => i.category === "jewellery",
  food: (i) => i.category === "food", potion: (i) => i.category === "potion", material: (i) => i.category === "material",
  rune: (i) => i.category === "rune" && i.rune?.fits?.length > 0, versions: (i) => i.versions.length > 1, spellbook: (i) => i.category === "spellbook", container: (i) => i.category === "container",
  leftover: (i) => i.sources.leftover?.length > 0,
};
const guideSlug = (lang) => {
  const dir = path.join(DIST, lang, SECTIONS.guide.slug[lang]);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "index.html"))).sort()[0] : undefined;
};
const PAGES = [];
for (const lang of LANGS) {
  PAGES.push({ id: "home", lang, url: `/${lang}/`, type: "home" });
  PAGES.push({ id: "list", lang, url: `/${lang}/${SECTIONS.item.slug[lang]}/`, type: "list" });
  const g = guideSlug(lang);
  if (g) PAGES.push({ id: "guide", lang, url: `/${lang}/${SECTIONS.guide.slug[lang]}/${g}/`, type: "guide" });
  else PAGES.push({ id: "guide", lang, url: null, type: "guide" });
  PAGES.push({ id: "404", lang, url: `/${lang}/no-such-page-xyz/`, type: "404", status: 404 });
  for (const [kind, fn] of Object.entries(KINDS)) {
    const it = pick(fn);
    PAGES.push({ id: `item-${kind}`, lang, url: it ? `/${lang}/${SECTIONS.item.slug[lang]}/${it.slug[lang]}/` : null, type: "item" });
  }
}

// ---- a GitHub-Pages-like static server over the build
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(DIST, p);
  if (p.endsWith("/")) file = path.join(file, "index.html");
  else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { res.writeHead(301, { Location: p + "/" }); return res.end(); }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { "Content-Type": TYPES[".html"] }); return res.end(fs.readFileSync(path.join(DIST, "404.html"))); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const chromePath = () => {
  const c = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return c.find((p) => p && fs.existsSync(p));
};

// ---- the measurements, run in the page
function measure() {
  const out = [];
  const fail = (rule, detail) => out.push({ rule, detail });
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const name = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = [...el.classList].filter((c) => !c.startsWith("astro-")).slice(0, 2).map((c) => `.${c}`).join("");
    const sec = el.closest("[data-section]")?.getAttribute("data-section");
    return `${el.tagName.toLowerCase()}${id}${cls}${sec ? ` in [${sec}]` : ""}`;
  };
  const skipText = (n) => n.parentElement?.closest(".sr-only, .arrow, [aria-hidden='true']");
  const textRects = (el) => {
    const rects = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim() || skipText(n)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const x of r.getClientRects()) if (x.width > 0) rects.push(x);
    }
    return rects;
  };
  const lines = (rects) => { const tops = []; for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < 4)) tops.push(r.top); return tops.length; };
  const contentBox = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const seen = { tables: 0, iconBoxes: 0 };

  // header + row-height: the item list and the item page's tables
  for (const table of document.querySelectorAll(".dt table, table.qtable")) {
    const head = [...table.querySelectorAll("thead th")].filter(vis);
    if (!head.length) continue; // phone cards: no header row on screen
    seen.tables++;
    const rows = [...table.querySelectorAll("tbody tr")].filter((tr) => !tr.hidden && vis(tr));
    const cols = head.length;
    head.forEach((th, i) => {
      const label = textRects(th);
      if (!label.length) return;
      const n = lines(label);
      const words = th.textContent.replace(/[▲▼↕]/g, "").trim();
      if (n > 1 && innerWidth >= 1024) fail("header", `"${words}" wraps to ${n} lines (${name(table)})`);
      const icon = th.querySelector("img, svg:not(.arrow svg)");
      const lTop = Math.min(...label.map((r) => r.top)), lBottom = Math.max(...label.map((r) => r.bottom));
      if (icon && vis(icon)) {
        const ir = icon.getBoundingClientRect(), ic = (ir.top + ir.bottom) / 2;
        if (ic < lTop || ic > lBottom) fail("header", `"${words}": its icon sits above or below the label, not inline (${name(table)})`);
      }
      // the label's edge against its cells' content edge (right for numbers, left for text)
      const cells = rows.map((tr) => [...tr.children].filter((c) => vis(c))[i]).filter(Boolean);
      // the column's side comes from its cells (numbers right, text left)
      const end = cells.length > 0 && ["right", "end"].includes(getComputedStyle(cells[0]).textAlign);
      if (!cells.length || [...rows[0]?.children ?? []].filter(vis).length !== cols) return;
      const edges = cells.map((c) => { const b = contentBox(c); return end ? b.right : b.left; }).filter((x) => Number.isFinite(x) && x !== 0);
      if (!edges.length) return;
      const cellEdge = median(edges);
      const iconLeft = icon && vis(icon) ? icon.getBoundingClientRect().left : Infinity;
      const lEdge = end ? Math.max(...label.map((r) => r.right)) : Math.min(iconLeft, ...label.map((r) => r.left));
      if (Math.abs(lEdge - cellEdge) > 2) fail("header", `"${words}": label ${end ? "right" : "left"} edge ${Math.round(lEdge)} vs its cells' ${Math.round(cellEdge)} (${Math.round(lEdge - cellEdge)} px, ${name(table)})`);
    });
    const hs = rows.map((tr) => Math.round(tr.getBoundingClientRect().height));
    const mode = median(hs);
    const off = hs.filter((h) => Math.abs(h - mode) > 1);
    if (off.length) fail("row-height", `${off.length} of ${hs.length} rows differ from ${mode} px (${[...new Set(off)].slice(0, 6).join(", ")} px; ${name(table)})`);
  }

  // icon-column: the stats box (every row: one leading icon box, one x, one size); list panels; quality cards
  const iconGroups = [];
  for (const box of document.querySelectorAll(".infobox")) {
    const rows = [...box.querySelectorAll(".statlist > li, .facts > li, .nostats")].filter(vis);
    if (rows.length) iconGroups.push({ where: "stats box", rows, lead: (li) => li.firstElementChild });
  }
  for (const card of document.querySelectorAll(".qstats")) {
    const rows = [...card.children].filter(vis);
    if (rows.length) iconGroups.push({ where: "quality card", rows, lead: (li) => li.querySelector("img, svg"), sizeOnly: true });
  }
  for (const g of iconGroups) {
    seen.iconBoxes++;
    const boxes = g.rows.map((r) => ({ r, el: g.lead(r) }));
    const missing = boxes.filter((b) => !b.el || !vis(b.el));
    if (missing.length) fail("icon-column", `${g.where}: ${missing.length} row(s) without a leading icon ("${missing[0].r.textContent.trim().replace(/\s+/g, " ").slice(0, 30)}")`);
    const ok = boxes.filter((b) => b.el && vis(b.el)).map((b) => ({ ...b, rect: b.el.getBoundingClientRect() }));
    if (ok.length < 2) continue;
    const xs = ok.map((b) => b.rect.left), ws = ok.map((b) => b.rect.width);
    if (!g.sizeOnly && Math.max(...xs) - Math.min(...xs) > 1) fail("icon-column", `${g.where}: row icons at ${[...new Set(xs.map(Math.round))].join(" / ")} px x (one x expected)`);
    if (Math.max(...ws) - Math.min(...ws) > 1) fail("icon-column", `${g.where}: row icons ${[...new Set(ws.map(Math.round))].join(" / ")} px wide (one size expected)`);
  }

  // orphan: any wrapping group of 3 or more items with one item alone on its last line: a flex row that wraps, a grid
  // of columns, or a block of atomic inline items (chips laid inline, balanced with text-wrap)
  const flows = [];
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);
    const flexWrap = s.display.includes("flex") && s.flexWrap === "wrap" && s.flexDirection.startsWith("row");
    const grid = s.display.includes("grid") && s.gridTemplateColumns.split(" ").length > 1 && s.gridTemplateAreas === "none";
    const elKids = [...el.children].filter((c) => getComputedStyle(c).display !== "none" && c.tagName !== "SCRIPT" && c.tagName !== "TEMPLATE");
    const inlineBlock = s.display === "block" && elKids.length >= 3 && elKids.every((c) => /^inline-(flex|block|grid)$/.test(getComputedStyle(c).display))
      && ![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!flexWrap && !grid && !inlineBlock) continue;
    if (!vis(el) || el.closest(".sr-only, [hidden]")) continue;
    if (el.closest("[data-flow]")) { flows.push(name(el)); continue; }
    const kids = [...el.children].filter((c) => vis(c) && getComputedStyle(c).position !== "absolute" && getComputedStyle(c).position !== "fixed");
    if (kids.length < 3) continue;
    const rows = [];
    for (const k of kids) { const t = k.getBoundingClientRect().top; const row = rows.find((r) => Math.abs(r.top - t) < 6); if (row) row.n.push(k); else rows.push({ top: t, n: [k] }); }
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.top - b.top);
    const last = rows[rows.length - 1].n;
    if (last.length !== 1 || Math.max(...rows.map((r) => r.n.length)) < 2) continue;
    const cw = el.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    if (last[0].getBoundingClientRect().width >= cw * 0.9) continue; // spans the line on purpose
    fail("orphan", `${name(el)}: ${rows.map((r) => r.n.length).join("+")} (${kids.length} items, one alone on the last line)`);
  }

  // overflow and clipping
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) fail("overflow", `the page is ${de.scrollWidth} px wide in a ${de.clientWidth} px viewport`);
  const scrollers = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el) || el.closest(".sr-only")) continue;
    const s = getComputedStyle(el);
    if (!["hidden", "clip", "auto", "scroll"].includes(s.overflowX)) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (s.textOverflow === "ellipsis") continue; // a long name cut with "…" on purpose
    if (el.clientWidth <= 1) continue; // visually hidden text (the sr-only pattern)
    if (s.overflowX === "auto" || s.overflowX === "scroll") { scrollers.push(name(el)); continue; }
    const box = el.getBoundingClientRect();
    const past = [...el.querySelectorAll("*")].find((d) => {
      if (!vis(d) || d.closest(".sr-only")) return false;
      for (let a = d; a && a !== el; a = a.parentElement) { const ps = getComputedStyle(a).position; if (ps === "absolute" || ps === "fixed") return false; }
      const r = d.getBoundingClientRect();
      return r.right > box.right + 1 || r.left < box.left - 1;
    });
    if (past) fail("overflow", `${name(el)} clips ${name(past)} (${Math.round(past.getBoundingClientRect().right - box.right)} px past its edge)`);
  }
  return { out, seen, scrollers, flows };
}

// ---- run
const browserPath = chromePath();
if (!browserPath) { console.error("check-layout: no Chrome found (set CHROME_PATH)"); process.exit(2); }
if (!fs.existsSync(path.join(DIST, "index.html")) && !fs.existsSync(path.join(DIST, "404.html"))) { console.error(`check-layout: no build in ${DIST} (npm run build first)`); process.exit(2); }
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: browserPath });
const failures = [];
const scrollRows = new Map();
const flowRows = new Map();
const pages = PAGES.filter((p) => !ONLY || ONLY.includes(p.id));
const viewports = SWEEP ? Array.from({ length: 28 }, (_, i) => ({ name: String(360 + i * 40), width: 360 + i * 40, height: 900, mobile: 360 + i * 40 < 520 })) : VIEWPORTS;
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, colorScheme: "dark" });
  const page = await ctx.newPage();
  for (const p of pages) {
    const where = `${p.lang} ${p.id} @${vp.name}`;
    if (!p.url) { failures.push({ rule: "expect", where, detail: "no page of this kind in the build" }); continue; }
    const resp = await page.goto(base + p.url, { waitUntil: "load" });
    const want = p.status ?? 200;
    if (resp.status() !== want) { failures.push({ rule: "expect", where, detail: `${p.url} answered ${resp.status()}, expected ${want}` }); continue; }
    await page.evaluate(() => document.fonts.ready);
    const { out, seen, scrollers, flows } = await page.evaluate(measure);
    for (const f of flows) flowRows.set(f, (flowRows.get(f) ?? 0) + 1);
    for (const f of out) if (!SWEEP || f.rule === "orphan" || f.rule === "overflow") failures.push({ ...f, where });
    for (const s of scrollers) scrollRows.set(s, (scrollRows.get(s) ?? 0) + 1);
    if (!SWEEP) {
      if (p.type === "list" && vp.name !== "390" && !seen.tables) failures.push({ rule: "expect", where, detail: "the item table's header was not found" });
      if (p.type === "item" && !seen.iconBoxes) failures.push({ rule: "expect", where, detail: "the stats box was not found" });
    }
  }
  await ctx.close();
}
await browser.close();
server.close();

const byRule = {};
for (const f of failures) (byRule[f.rule] ??= []).push(f);
for (const [rule, fs_] of Object.entries(byRule)) {
  console.log(`\n${rule}: ${fs_.length}`);
  const grouped = new Map();
  for (const f of fs_) { const k = f.detail; if (!grouped.has(k)) grouped.set(k, []); grouped.get(k).push(f.where); }
  for (const [detail, wheres] of grouped) console.log(`  ${detail}\n      at ${wheres.slice(0, 4).join("; ")}${wheres.length > 4 ? `; +${wheres.length - 4} more` : ""}`);
}
if (flowRows.size) console.log(`
lists that read like text, wrapping freely (data-flow, not failures): ${[...flowRows.keys()].join(", ")}`);
if (scrollRows.size) console.log(`\nside-scrolling rows on purpose (not failures): ${[...scrollRows.keys()].join(", ")}`);
console.log(`\ncheck-layout: ${pages.length} pages × ${viewports.length} widths, ${failures.length} failure(s)`);
process.exit(failures.length ? 1 : 0);
