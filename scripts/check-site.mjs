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
  for (const lang of ["pt-BR", "en", "x-default"]) if (!p.alternates[lang]) fail(p.url, `no hreflang ${lang}`);
  const self = p.lang === "pt-BR" ? "pt-BR" : "en";
  if (p.alternates[self] && p.alternates[self] !== SITE + p.url) fail(p.url, `hreflang ${self} is ${p.alternates[self]}, not this page`);
  if (p.alternates["x-default"] && p.alternates["x-default"] !== p.alternates["pt-BR"]) fail(p.url, "x-default is not the pt-BR page");
  for (const lang of ["pt-BR", "en"]) {
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
    for (const lang of ["pt-BR", "en", "x-default"]) {
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

console.log(`checked ${pages.size} pages (${indexable.length} indexable), sitemap, robots.txt, CNAME`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("site check passed");
