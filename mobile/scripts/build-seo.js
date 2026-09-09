// Programmatic SEO page generator — docs/COST_AND_MONETIZATION_PLAN.md Part 15.
//
// Reads scripts/seo-areas.json, hits the EatRai API for each area's restaurant
// list (server-cached, so this adds ~zero Places cost), and writes a static
// HTML page per area into mobile/public/near/… and mobile/public/th/near/….
// `npx expo export` then copies public/ into dist/. Run: `npm run build:seo`.
//
// CommonJS so jest (via babel-jest) can require the pure helpers directly.
// Never throws — a failed fetch just skips that page so the SPA build is safe.

const { readFile, writeFile, mkdir, rm } = require("node:fs/promises");
const path = require("node:path");

const PUBLIC = path.resolve(__dirname, "..", "public");

const SITE = "https://eatrai.help";
const API =
  process.env.SEO_API_BASE ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://eatrai-223664935213.asia-southeast1.run.app";
const ADSENSE_CLIENT = process.env.EXPO_PUBLIC_ADSENSE_CLIENT || "";
const ADSENSE_SLOT = process.env.EXPO_PUBLIC_ADSENSE_SLOT_SEO || "";
const TIPME_URL = process.env.EXPO_PUBLIC_TIPME_URL || "";

// ---------------------------------------------------------------- pure helpers

const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const shouldGenerate = (cards, min) =>
  Array.isArray(cards) && cards.filter((c) => c && c.id).length >= min;

// Rank a "best of" list: rating weighted by how many reviews back it, so a
// 5.0-from-12-reviews doesn't outrank a 4.7-from-3000.
const rankScore = (c) => (c.rating || 0) * Math.log10((c.ratingCount || 0) + 10);

// English is canonical at /near/<slug>, Thai at /th/near/<slug>.
const areaPath = (slug, lang) => (lang === "th" ? `/th/near/${slug}` : `/near/${slug}`);

const priceText = (card) => {
  const pr = card.priceRange;
  if (pr && (pr.start || pr.end)) {
    const s = pr.currency === "THB" ? "฿" : pr.currency ? pr.currency + " " : "";
    if (pr.start && pr.end) return `${s}${pr.start}–${pr.end}`;
    if (pr.start) return `${s}${pr.start}+`;
    return `${s}${pr.end}`;
  }
  return "฿".repeat(Math.max(0, Math.min(4, card.priceLevel || 0)));
};

const sitemapXml = (paths) => {
  const now = new Date().toISOString().slice(0, 10);
  const url = (loc, priority) =>
    `  <url>\n    <loc>${SITE}${loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    url("/", "1.0") +
    "\n" +
    paths.map((p) => url(p, "0.7")).join("\n") +
    `\n</urlset>\n`
  );
};

function jsonLd(area, lang, cards) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: lang === "th" ? `ร้านอาหารแนะนำใน${area.th || area.en}` : `Where to eat in ${area.en}`,
    itemListElement: cards.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Restaurant",
        name: c.name,
        ...(c.address ? { address: c.address } : {}),
        ...(c.rating > 0
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: c.rating,
                reviewCount: c.ratingCount || 1,
              },
            }
          : {}),
        ...(c.mapsUri ? { hasMap: c.mapsUri } : {}),
      },
    })),
  });
}

function pageHtml({ area, lang, cards, siblings }) {
  const isTh = lang === "th";
  const name = (isTh && area.th) || area.en;
  const canonical = SITE + areaPath(area.slug, lang);
  const enUrl = SITE + areaPath(area.slug, "en");
  const thUrl = SITE + areaPath(area.slug, "th");

  const title = isTh ? `ร้านอาหารแนะนำใน${name} — EatRai` : `Best restaurants in ${name} — EatRai`;
  const desc = isTh
    ? `รวมร้านอาหารน่ากินใน${name} เรียงตามคะแนนรีวิว พร้อมราคา ระยะทาง และแผนที่ — เปิดใน EatRai เพื่อปัดเลือกต่อ`
    : `A ranked list of the best-rated places to eat in ${name}, with prices and maps. Open in EatRai to swipe through more.`;

  const adScript =
    ADSENSE_CLIENT && ADSENSE_SLOT
      ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ADSENSE_CLIENT)}" crossorigin="anonymous"></script>`
      : "";
  const ad =
    ADSENSE_CLIENT && ADSENSE_SLOT
      ? `<div class="ad"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ADSENSE_CLIENT)}" data-ad-slot="${esc(ADSENSE_SLOT)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`
      : "";

  const appLink = `${SITE}/?lat=${area.lat}&lng=${area.lng}&area=${encodeURIComponent(name)}`;

  const listing = (c, i) => `
      <li class="card">
        ${
          c.photoUrls && c.photoUrls[0]
            ? `<img class="thumb" src="${esc(c.photoUrls[0].replace(/([?&])w=\d+/, "$1w=400"))}" alt="${esc(c.name)}" loading="lazy" width="400" height="300">`
            : `<div class="thumb noimg"></div>`
        }
        <div class="meta">
          <h2>${i + 1}. ${esc(c.name)}</h2>
          <p class="sub">${[
            c.rating > 0
              ? `★ ${Number(c.rating).toFixed(1)}${c.ratingCount ? ` (${Number(c.ratingCount).toLocaleString(isTh ? "th-TH" : "en-US")})` : ""}`
              : "",
            priceText(c),
            (c.cuisines || []).slice(0, 3).join(" · "),
          ]
            .filter(Boolean)
            .map(esc)
            .join("  ·  ")}</p>
          ${c.address ? `<p class="addr">${esc(c.address)}</p>` : ""}
          ${c.mapsUri ? `<a class="maps" href="${esc(c.mapsUri)}" target="_blank" rel="noopener">${isTh ? "ดูใน Google Maps" : "View on Google Maps"} →</a>` : ""}
        </div>
      </li>`;

  const siblingLinks = siblings
    .filter((s) => s.slug !== area.slug)
    .map((s) => `<a href="${areaPath(s.slug, lang)}">${esc((isTh && s.th) || s.en)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="${isTh ? "th" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${enUrl}">
<link rel="alternate" hreflang="th" href="${thUrl}">
<link rel="alternate" hreflang="x-default" href="${enUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">${jsonLd(area, lang, cards)}</script>
${adScript}
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif;background:#FBF7F0;color:#17140F}
a{color:#BE4127}
header,main,footer{max-width:720px;margin:0 auto;padding:0 20px}
header{padding-top:32px}
h1{font-size:26px;line-height:1.25;margin:0 0 8px}
.lede{color:#5b5346;margin:0 0 20px}
.cta{display:inline-block;background:#FF5A1F;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;margin:4px 0 24px}
.ad{margin:24px 0;min-height:100px}
ul{list-style:none;padding:0;margin:0}
.card{display:flex;gap:14px;background:#fff;border:1px solid #ece5d8;border-radius:14px;padding:12px;margin:12px 0}
.thumb{width:120px;height:90px;object-fit:cover;border-radius:10px;flex:none;background:#efe7d8}
.thumb.noimg{background:linear-gradient(135deg,#F4AE63,#BE4127)}
.meta{min-width:0}
h2{font-size:17px;margin:2px 0 4px}
.sub{margin:0 0 4px;color:#5b5346;font-size:14px}
.addr{margin:0 0 6px;color:#8a8172;font-size:13px}
.maps{font-size:13px;font-weight:600;text-decoration:none}
.siblings{margin:28px 0 8px;line-height:2}
.siblings a{display:inline-block;margin-right:10px;font-size:14px}
footer{padding:24px 20px 48px;color:#8a8172;font-size:13px;border-top:1px solid #ece5d8;margin-top:32px}
footer a{color:#8a8172;margin-right:14px}
@media(max-width:480px){.thumb{width:92px;height:78px}}
</style>
</head>
<body>
<header>
<h1>${esc(isTh ? `ร้านอาหารแนะนำใน${name}` : `Where to eat in ${name}`)}</h1>
<p class="lede">${esc(
    isTh
      ? `${cards.length} ร้านที่รีวิวดีที่สุดใน${name} เรียงตามคะแนน อัปเดตทุกสัปดาห์`
      : `The ${cards.length} best-reviewed places to eat in ${name}, ranked by rating. Updated weekly.`,
  )}</p>
<a class="cta" href="${appLink}">${isTh ? "เปิดใน EatRai — ปัดเลือกเลย" : "Open in EatRai — start swiping"}</a>
</header>
<main>
${ad}
<ul>${cards.map(listing).join("")}</ul>
<nav class="siblings">${isTh ? "พื้นที่ใกล้เคียง: " : "Nearby areas: "}${siblingLinks}</nav>
</main>
<footer>
<a href="${areaPath(area.slug, isTh ? "en" : "th")}">${isTh ? "English" : "ภาษาไทย"}</a>
<a href="${SITE}/">EatRai</a>
<a href="${SITE}/privacy">${isTh ? "ความเป็นส่วนตัว" : "Privacy"}</a>
<a href="${SITE}/terms">${isTh ? "เงื่อนไข" : "Terms"}</a>
${TIPME_URL ? `<a href="${esc(TIPME_URL)}" target="_blank" rel="noopener">${isTh ? "สนับสนุนผู้พัฒนา" : "Support the developer"}</a>` : ""}
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------- I/O

async function fetchCards(lat, lng, lang) {
  const u = `${API}/nearby?lat=${lat}&lng=${lng}&radius=4000${lang === "th" ? "&lang=th" : ""}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(u, { signal: ctrl.signal, headers: { Referer: SITE } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.cards) ? data.cards : [];
  } catch (e) {
    console.warn(`  ! ${u} — ${e.message}`);
    return [];
  }
}

async function main() {
  const cfg = JSON.parse(await readFile(path.join(__dirname, "seo-areas.json"), "utf8"));
  const min = cfg.minRestaurants == null ? 8 : cfg.minRestaurants;
  const take = cfg.listingCount == null ? 14 : cfg.listingCount;
  const all = [
    ...cfg.metros.map((m) => ({ ...m, kind: "metro" })),
    ...cfg.areas.map((a) => ({ ...a, kind: "area" })),
  ];
  const subAreasOf = (slug) => all.filter((a) => a.kind === "area" && a.metro === slug);

  for (const d of ["near", "th/near"]) {
    await rm(path.join(PUBLIC, d), { recursive: true, force: true });
  }

  const written = [];
  let skipped = 0;

  for (const area of all) {
    const siblings =
      area.kind === "metro"
        ? subAreasOf(area.slug)
        : [...subAreasOf(area.metro), ...cfg.metros.filter((m) => m.slug === area.metro)];

    for (const lang of ["en", "th"]) {
      let cards = await fetchCards(area.lat, area.lng, lang);
      cards = cards
        .filter((c) => c && c.id && c.name)
        .sort((a, b) => rankScore(b) - rankScore(a))
        .slice(0, take);

      if (!shouldGenerate(cards, min)) {
        skipped++;
        console.log(`  skip  ${areaPath(area.slug, lang)} (${cards.length} < ${min})`);
        continue;
      }

      const dir = path.join(PUBLIC, areaPath(area.slug, lang).slice(1));
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.html"), pageHtml({ area, lang, cards, siblings }));
      written.push(areaPath(area.slug, lang));
      console.log(`  write ${areaPath(area.slug, lang)} (${cards.length})`);
    }
  }

  await writeFile(path.join(PUBLIC, "sitemap.xml"), sitemapXml(written));
  console.log(`\nSEO: ${written.length} pages, ${skipped} skipped. API=${API}`);
}

module.exports = { esc, shouldGenerate, rankScore, areaPath, priceText, sitemapXml, pageHtml };

if (require.main === module) {
  main().catch((e) => {
    console.error("SEO build failed (continuing so the SPA still deploys):", e.message);
    process.exit(0);
  });
}
