// Check the built site (dist/): run after `npm run build`. Exits 1 and lists every problem it finds.
//   - every page: unique ids (a heading's id can't clash with the search dialog's); every indexable page: <title>,
//     meta description, canonical = its own URL, one <h1>, <html lang>,
//     hreflang pt-BR / en / x-default, and its twin pointing back (reciprocal pairs)
//   - noindex pages (404, "/", the component gallery) are exempt from canonical and hreflang, and kept out of the sitemap
//   - every internal link and asset resolves to a file in dist/, and page links end in "/"
//   - sitemap.xml lists exactly the indexable pages, each with both alternates; robots.txt points at it
//   - the social image exists and is referenced by an absolute URL
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
// the languages, from the same table the site uses
const LANG_TABLE = JSON.parse(readFileSync(new URL("../src/lib/languages.json", import.meta.url), "utf8"));
const LANG_CODES = Object.keys(LANG_TABLE.languages);
const HREF = Object.fromEntries(LANG_CODES.map((l) => [l, LANG_TABLE.languages[l].hreflang]));
const DEFAULT_HREF = HREF[LANG_TABLE.default];
const HREFS = LANG_CODES.map((l) => HREF[l]);
// each language's item URLs, from the route table (Node strips the types)
const { SECTIONS } = await import("../src/lib/routes.ts");
const { ui } = await import("../src/i18n/index.ts");
const htmlText = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ITEM_DIR = Object.fromEntries(LANG_CODES.map((l) => [l, `/${l}/${SECTIONS.item.slug[l]}/`]));
const itemUrls = (i) => LANG_CODES.map((l) => `${ITEM_DIR[l]}${i.slug[l]}/`);

const SITE = "https://wiki.opengea.tech";
const DIST = new URL("../dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

if (!existsSync(DIST)) {
  console.error("dist/ not found: run `npm run build` first");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith(".html") && !f.includes(`${sep}pagefind${sep}`));
const urlOf = (file) => {
  const rel = "/" + relative(DIST, file).split(sep).join("/");
  return rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel;
};
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1];
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const pages = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const url = urlOf(file);
  const head = html.slice(0, html.indexOf("</head>") + 1 || undefined);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const robots = metas.find((m) => attr(m, "name") === "robots");
  const alternates = Object.fromEntries(
    links.filter((l) => attr(l, "rel") === "alternate" && attr(l, "hreflang")).map((l) => [attr(l, "hreflang"), attr(l, "href")]),
  );
  // the body without <template> and <script> contents (hover-card templates repeat names, not structure)
  const body = html.slice(html.indexOf("<body")).replace(/<template[\s\S]*?<\/template>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  pages.set(url, {
    file, url, html, body,
    title: decode(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim(),
    description: attr(metas.find((m) => attr(m, "name") === "description") ?? "", "content"),
    canonical: attr(links.find((l) => attr(l, "rel") === "canonical") ?? "", "href"),
    lang: html.match(/<html\b[^>]*\blang="([^"]+)"/i)?.[1],
    noindex: !!robots && /noindex/i.test(attr(robots, "content") ?? ""),
    alternates,
    ogImage: attr(metas.find((m) => attr(m, "property") === "og:image") ?? "", "content"),
  });
}

const indexable = [...pages.values()].filter((p) => !p.noindex);
for (const p of pages.values()) {
  if (!p.title) fail(p.url, "no <title>");
  if (!p.description || p.description.length < 50) fail(p.url, `meta description missing or short (${p.description?.length ?? 0} chars)`);
  if (p.description && p.description.length > 170) fail(p.url, `meta description too long (${p.description.length} chars)`);
  if (!p.lang) fail(p.url, "no <html lang>");
  const ids = [...p.body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) fail(p.url, `duplicate id(s): ${dup.join(", ")}`);
  const h1 = (p.body.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) fail(p.url, `${h1} <h1> elements (want exactly 1)`);
  if (p.noindex) continue;
  if (p.canonical !== SITE + p.url) fail(p.url, `canonical is ${p.canonical ?? "missing"}, want ${SITE + p.url}`);
  for (const lang of [...HREFS, "x-default"]) if (!p.alternates[lang]) fail(p.url, `no hreflang ${lang}`);
  const self = HREFS.includes(p.lang) ? p.lang : DEFAULT_HREF;
  if (p.alternates[self] && p.alternates[self] !== SITE + p.url) fail(p.url, `hreflang ${self} is ${p.alternates[self]}, not this page`);
  if (p.alternates["x-default"] && p.alternates["x-default"] !== p.alternates[DEFAULT_HREF]) fail(p.url, `x-default is not the ${DEFAULT_HREF} page`);
  for (const lang of HREFS) {
    const href = p.alternates[lang];
    if (!href?.startsWith(SITE)) continue;
    const twin = pages.get(href.slice(SITE.length));
    if (!twin) fail(p.url, `hreflang ${lang} -> ${href}: no such page`);
    else if (twin.noindex) fail(p.url, `hreflang ${lang} -> ${href}: a noindex page`);
    else if (twin.alternates[self] !== SITE + p.url) fail(p.url, `hreflang ${lang} -> ${href}, which doesn't point back (it says ${twin.alternates[self]})`);
  }
  if (!p.ogImage?.startsWith(`${SITE}/`)) fail(p.url, `og:image not absolute: ${p.ogImage}`);
}

// internal links and assets
const fileExists = (path) => {
  const clean = decodeURIComponent(path.split(/[?#]/)[0]);
  const target = join(DIST, ...clean.split("/").filter(Boolean));
  if (clean.endsWith("/")) return existsSync(join(target, "index.html"));
  return existsSync(target) && statSync(target).isFile();
};
for (const p of pages.values()) {
  const refs = [...p.body.matchAll(/\b(?:href|src)\s*=\s*"([^"]+)"/gi), ...p.html.slice(0, p.html.indexOf("<body")).matchAll(/<link\b[^>]*\bhref\s*=\s*"([^"]+)"/gi)].map((m) => decode(m[1]));
  for (const ref of new Set(refs)) {
    let path = null;
    if (ref.startsWith(SITE)) path = ref.slice(SITE.length) || "/";
    else if (ref.startsWith("/") && !ref.startsWith("//")) path = ref;
    else if (/^(https?:|mailto:|data:|#|javascript:)/.test(ref)) continue;
    else { fail(p.url, `relative link "${ref}" (use absolute paths)`); continue; }
    const bare = path.split(/[?#]/)[0];
    if (!bare.split("/").pop().includes(".") && !bare.endsWith("/")) fail(p.url, `link without trailing slash: ${ref}`);
    if (!fileExists(path)) fail(p.url, `broken link: ${ref}`);
  }
  // same-page anchors
  for (const m of p.body.matchAll(/\bhref="#([^"]+)"/g)) {
    const id = decodeURIComponent(m[1]);
    if (!p.body.includes(`id="${id}"`)) fail(p.url, `anchor #${id} has no target`);
  }
}

// sitemap and robots
const sitemapFile = join(DIST, "sitemap.xml");
if (!existsSync(sitemapFile)) fail("sitemap.xml", "missing");
else {
  const xml = readFileSync(sitemapFile, "utf8");
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const locs = new Set();
  for (const b of blocks) {
    const loc = b.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) { fail("sitemap.xml", "a <url> without <loc>"); continue; }
    locs.add(loc);
    const page = pages.get(loc.slice(SITE.length));
    if (!page) fail("sitemap.xml", `${loc}: no such page`);
    else if (page.noindex) fail("sitemap.xml", `${loc}: a noindex page`);
    for (const lang of [...HREFS, "x-default"]) {
      const alt = b.match(new RegExp(`hreflang="${lang}" href="([^"]+)"`))?.[1];
      if (!alt) fail("sitemap.xml", `${loc}: no ${lang} alternate`);
      else if (page && !page.noindex && alt !== page.alternates[lang]) fail("sitemap.xml", `${loc}: ${lang} alternate ${alt} differs from the page's ${page.alternates[lang]}`);
    }
  }
  for (const p of indexable) if (!locs.has(SITE + p.url)) fail("sitemap.xml", `missing ${SITE + p.url}`);
}
const robots = existsSync(join(DIST, "robots.txt")) ? readFileSync(join(DIST, "robots.txt"), "utf8") : "";
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail("robots.txt", "missing or without the sitemap line");
if (!existsSync(join(DIST, "og", "default.png"))) fail("og/default.png", "missing");
if (readFileSync(join(DIST, "CNAME"), "utf8").trim() !== "wiki.opengea.tech") fail("CNAME", "not wiki.opengea.tech");
if (!pages.has("/404.html")) fail("404.html", "missing");
else if (!pages.get("/404.html").noindex) fail("404.html", "should be noindex");
else if (!pages.get("/404.html").html.includes('"/404/"')) fail("404.html", "lost its swap to the other languages' 404s");
for (const l of LANG_CODES.filter((c) => c !== LANG_TABLE.default)) if (!pages.get(`/${l}/404/`)?.noindex) fail(`/${l}/404/`, "missing or not noindex");

// ---------------------------------------------------------------------------------------------- item pages
// No drop rate on any item page: no "<digits>%" anywhere in an item page (body, meta, JSON-LD) outside the game's own
// item texts (a rune's text says "+3% physical"). And with the component gallery built (WIKI_KIT=1), the made-up
// "builds" collection that links to the Iron Ingot must show on that item's page by itself (the generic reverse index).
{
  const itemsFile = JSON.parse(readFileSync(new URL("../src/data/items.json", import.meta.url), "utf8"));
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const gameTexts = [...new Set(itemsFile.items.flatMap((i) => i.versions.flatMap((v) => LANG_CODES.map((l) => v.text[l]))).filter((t) => t && t.includes("%")))]
    .flatMap((t) => [t, esc(t), JSON.stringify(t).slice(1, -1)]);
  // one page per game item, plus a split name's list page at its old address (a spellbook colour, the chess pieces)
  const groupUrls = new Set((itemsFile.groups ?? []).flatMap((g) => LANG_CODES.map((l) => `${ITEM_DIR[l]}${g.slug[l]}/`)));
  const itemPages = [...pages.values()].filter((p) => !groupUrls.has(p.url) && Object.values(ITEM_DIR).some((d) => p.url.startsWith(d) && /^[^/]+\/$/.test(p.url.slice(d.length))));
  if (itemPages.length !== itemsFile.items.length * LANG_CODES.length) fail("items", `${itemPages.length} item pages for ${itemsFile.items.length} items (want ${LANG_CODES.length} each)`);
  for (const u of groupUrls) if (!pages.has(u)) fail(u, "a split name's old address answers no list page");
  // never two game items on one page again: only an item's two states (an equip pair) share one
  for (const i of itemsFile.items) if (i.versions.length > 1 && !i.states) fail(itemUrls(i)[0], `${i.versions.length} game items on one page (not an equip pair)`);
  for (const i of itemsFile.items.filter((x) => x.states)) for (const url of itemUrls(i)) if (!pages.get(url)?.html.includes('data-section="states"')) fail(url, "an equip pair without its states block");
  for (const p of itemPages) {
    // the page's text, meta and JSON-LD: CSS (style blocks and attributes) left out
    let html = p.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/\sstyle="[^"]*"/gi, "");
    for (const t of gameTexts) html = html.split(t).join("");
    const hit = html.match(/.{0,40}\d\s?%.{0,20}/);
    if (hit) fail(p.url, `a percentage outside the game's own text: "${hit[0]}"`);
    // a class switch always carries its "no trait effects" line
    if (p.html.includes("data-vswitch") && !p.html.includes('data-section="traits-note"')) fail(p.url, "a class switch without the traits line");
  }
  // an NPC that appears after a quest shows behind its spoiler, on both languages' pages
  for (const i of itemsFile.items) {
    for (const [list, section] of [[i.sources.shops, "shops-after-quest"], [i.sources.buyers, "buyers-after-quest"]]) {
      if (!list.some((s) => s.spoiler)) continue;
      const alsoTitle = list.some((s) => !s.spoiler);   // "Também ..." only under an open list it adds to
      itemUrls(i).forEach((url, k) => {
        const html = pages.get(url)?.html ?? "";
        if (!html.includes(`data-section="${section}"`)) fail(url, `a quest-opened NPC but no ${section} spoiler`);
        const words = ui(LANG_CODES[k]).item;   // the page's own "also" title, from its language's dictionary
        const also = htmlText(section === "shops-after-quest" ? words.spoilerShop : words.spoilerBuyer);
        if (html.includes(also) !== alsoTitle) fail(url, `${section}: the "also" title ${alsoTitle ? "is missing" : "shows with no open list above it"}`);
      });
    }
  }
  // a potion and its empty link both ways; a map object (a well) in a recipe shows as plain text, never an item link
  for (const i of itemsFile.items) {
    const hasObject = [...i.sources.recipes, ...i.uses.recipes].some((r) => r.ingredients.some((g) => g.object));
    for (const url of itemUrls(i)) {
      const html = pages.get(url)?.html ?? "";
      if (i.sources.leftover.length && !html.includes('data-section="leftover"')) fail(url, "left after drinking a potion, but no \"leftover\" panel");
      if (i.uses.leavesEmpty.length && !html.includes('data-section="leaves"')) fail(url, "leaves an empty when drunk, but no \"leaves\" panel");
      if (hasObject && !html.includes('data-object="well"')) fail(url, "a recipe with a well, but the well isn't shown");
      if (/href="\/(pt\/itens|en\/items)\/(poco|well)\/"/.test(html)) fail(url, "links to a well item page: the well is a map object");
    }
  }
  // the stats box shows every stat with its game icon; every UI icon a page uses exists
  const uiMissing = new Set();
  for (const p of itemPages) {
    for (const m of p.html.matchAll(/src="\/ui\/([\w-]+\.png)"/g)) if (!existsSync(join(DIST, "ui", m[1]))) uiMissing.add(m[1]);
  }
  if (uiMissing.size) fail("ui icons", `missing in the build: ${[...uiMissing].join(", ")}`);
  for (const i of itemsFile.items) {
    const v = i.versions.find((x) => x.type === i.primary) ?? i.versions[0];
    if (!Object.values(v.stats).some(Boolean)) continue;
    for (const url of itemUrls(i)) {
      const html = pages.get(url)?.html ?? "";
      if (!html.includes('data-section="statlist"') || !html.includes('src="/ui/stat-')) fail(url, "has stats but no stat list with the game's icons");
    }
  }
  // a monster that isn't an ordinary spawn (a lever boss, a timed boss, a placed or travel-called one) says how it appears
  const stubs = new Map(JSON.parse(readFileSync(new URL("../src/data/entities.json", import.meta.url), "utf8")).entities.map((e) => [e.ref, e]));
  for (const i of itemsFile.items) {
    const hows = new Set(i.sources.drops.map((d) => stubs.get(d.monster)?.appears?.how).filter(Boolean));
    for (const how of hows) for (const url of itemUrls(i)) {
      if (!pages.get(url)?.html.includes(`data-appears="${how}"`)) fail(url, `a drop from a "${how}" monster without its how-it-appears line`);
    }
  }
  // the list's class filter carries the traits line too (below); first: no tag, badge or chip is plain text anywhere.
  // Each one carries an icon (<svg> or <img>) before its closing tag, or says why not (data-plain), and those are listed.
  const plainOk = new Map();
  let tagsSeen = 0;
  for (const p of pages.values()) {
    for (const m of p.html.matchAll(/<(span|button|a)\b([^>]*\bclass="(?:tag|badge|chip)(?:\s[^"]*)?"[^>]*)>/g)) {
      tagsSeen++;
      const attrs = m[2];
      const plain = attrs.match(/data-plain="([^"]*)"/);
      if (plain) { plainOk.set(plain[1], (plainOk.get(plain[1]) ?? 0) + 1); continue; }
      const rest = p.html.slice(m.index + m[0].length, m.index + m[0].length + 2000);
      const end = rest.indexOf(`</${m[1]}>`);
      const inside = end >= 0 ? rest.slice(0, end) : rest;
      if (!/<svg|<img/.test(inside)) fail(p.url, `a plain-text ${m[1]}.${attrs.match(/class="([^ "]+)/)?.[1]}: "${inside.replace(/<[^>]+>/g, "").trim().slice(0, 40)}"`);
    }
  }
  console.log(`checked ${tagsSeen} tags, badges and chips for an icon${plainOk.size ? `; plain on purpose: ${[...plainOk].map(([why, n]) => `${n}× ${why}`).join("; ")}` : ""}`);
  for (const url of Object.values(ITEM_DIR)) {
    if (!/class="vnote"[^>]*>[^<]{6,}</.test(pages.get(url)?.html ?? "")) fail(url, "the class filter without the traits line");
  }
  const kitHome = `/${LANG_TABLE.default}/kit/`;
  if (pages.has(kitHome)) {
    const ingot = itemsFile.items.find((i) => i.id === "iron-ingot");
    const page = ingot && pages.get(itemUrls(ingot)[LANG_CODES.indexOf(LANG_TABLE.default)]);
    if (!page) fail("kit", "the Iron Ingot page is missing");
    else if (!page.html.includes('data-section="appears-build"')) fail(page.url, "the made-up builds collection links here but no \"Usado em builds\" section shows");
  }
  console.log(`checked ${itemPages.length} item pages for percentages${pages.has(kitHome) ? " and the builds wiring" : ""}`);
}

// -------------------------------------------------------------------------------------------- monster pages
// Every monster has its page in each language; no percentage anywhere on it (drops are tiers, odds "1 in N"); its stats
// box shows each stat with the game's icon; each drop links to the item's page, and that item's "dropped by" links back.
{
  const monsters = JSON.parse(readFileSync(new URL("../src/data/monsters.json", import.meta.url), "utf8")).monsters;
  const slugs = JSON.parse(readFileSync(new URL("../src/data/slugs.json", import.meta.url), "utf8"));
  const itemsById = new Map(JSON.parse(readFileSync(new URL("../src/data/items.json", import.meta.url), "utf8")).items.map((i) => [i.id, i]));
  // a drop's hover card carries the item's own game text (a rune's "+5% magic"): the game's words, not a rate
  const escT = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const itemTexts = [...new Set([...itemsById.values()].flatMap((i) => i.versions.flatMap((v) => LANG_CODES.map((l) => v.text[l]))).filter((t) => t && t.includes("%")))]
    .flatMap((t) => [t, escT(t), JSON.stringify(t).slice(1, -1)]);
  const MON_DIR = Object.fromEntries(LANG_CODES.map((l) => [l, `/${l}/${SECTIONS.monster.slug[l]}/`]));
  const monUrls = (m) => LANG_CODES.map((l) => `${MON_DIR[l]}${slugs[`monster:${m.id}`][l]}/`);
  const monPages = [...pages.values()].filter((p) => Object.values(MON_DIR).some((d) => p.url.startsWith(d) && /^[^/]+\/$/.test(p.url.slice(d.length))));
  if (monPages.length !== monsters.length * LANG_CODES.length) fail("monsters", `${monPages.length} monster pages for ${monsters.length} monsters (want ${LANG_CODES.length} each)`);
  for (const p of [...monPages, ...Object.values(MON_DIR).map((u) => pages.get(u)).filter(Boolean)]) {
    let html = p.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/\sstyle="[^"]*"/gi, "");
    for (const t of itemTexts) html = html.split(t).join("");
    const hit = html.match(/.{0,40}\d\s?%.{0,20}/);
    if (hit) fail(p.url, `a percentage on a monster page: "${hit[0]}"`);
  }
  for (const m of monsters) {
    monUrls(m).forEach((url, k) => {
      const html = pages.get(url)?.html;
      if (!html) return fail(url, "missing monster page");
      if (!html.includes('data-section="statlist"') || !html.includes('src="/ui/stat-health.png"')) fail(url, "no stat list with the game's icons");
      for (const d of m.drops) {
        const item = itemsById.get(d.item);
        const itemUrl = item && itemUrls(item)[k];
        if (!itemUrl || !html.includes(`href="${itemUrl}"`)) fail(url, `drop ${d.item} without a link to its page`);
        else if (!pages.get(itemUrl)?.html.includes(`href="${url}"`)) fail(itemUrl, `"dropped by" doesn't link back to ${url}`);
      }
      if (m.windows.length && !html.includes("data-win-start")) fail(url, "a timed monster without its schedule");
    });
  }
  console.log(`checked ${monPages.length} monster pages: percentages, stats, drops linked both ways`);
}

// --------------------------------------------------------------------------------------------------- the map
// The wiki has its own map: no page links to the editor (map.opengea.tech) any more, every "ver no mapa" opens the
// wiki's map, and the map pages answer in every language.
{
  let maplinks = 0;
  for (const p of pages.values()) {
    if (/map\.opengea\.tech/i.test(p.html)) fail(p.url, "links to map.opengea.tech (the editor): use the wiki's own map");
    maplinks += (p.html.match(/data-maplink/g) ?? []).length;
  }
  const MAP = { pt: "/pt/mapa/", en: "/en/map/", es: "/es/mapa/" };
  for (const [l, u] of Object.entries(MAP)) if (LANG_CODES.includes(l) && !pages.get(u)?.html.includes("data-mapapp")) fail(u, "the map page is missing");
  console.log(`checked ${maplinks} "ver no mapa" links: none to the editor`);
}

console.log(`checked ${pages.size} pages (${indexable.length} indexable), sitemap, robots.txt, CNAME`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("site check passed");
