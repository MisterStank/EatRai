// Programmatic SEO page generator — docs/COST_AND_MONETIZATION_PLAN.md Part 15.
//
// Reads scripts/seo-areas.json, hits the EatRai API for each area's restaurant
// list, and writes a static HTML page per area into mobile/public/near/… and
// mobile/public/th/near/…. `npx expo export` then copies public/ into dist/.
// Run: `npm run build:seo`.
//
// COST NOTE: the backend's cache is in-process memory and resets on every
// backend redeploy / cold start (see backend/internal/cache/cache.go) — there
// is no CDN/edge layer in front of it yet (plan Part 5, not done). So this
// script is NOT "server-cached, ~zero cost" the way it once assumed: every run
// is up to (areas × languages) REAL Google Places calls. Vercel builds a
// preview deployment for every git push, and this script used to run on every
// one of them — that alone burned real budget. It now only runs on Vercel's
// production deployments (see shouldRunOnThisDeploy); other builds skip
// straight to a no-op so `/near/*` and sitemap.xml just aren't produced for
// previews. Regenerate on demand with `npm run build:seo` locally if needed.
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

// ---------------------------------------------------------------- pure helpers

// Only fetch-and-regenerate on a real Vercel *production* deploy. `VERCEL` is
// unset for local runs / CI (npm run build:seo) — those always run, same as
// before. On Vercel, `VERCEL_ENV` is "production", "preview", or
// "development" — skip the two that hit the live API for no reader-facing
// reason (a preview URL nobody indexes). `FORCE_SEO_BUILD=1` overrides, for a
// deliberate one-off preview check.
function shouldRunOnThisDeploy(env) {
  if (env.FORCE_SEO_BUILD === "1") return true;
  if (env.VERCEL !== "1") return true; // local / CI
  return env.VERCEL_ENV === "production";
}

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

// A single restaurant card, shared by the per-area pages and the bot-facing
// home snapshot (see homeSnapshotHtml) so both render listings identically.
function cardListItem(c, i, isTh) {
  return `
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

  const adSenseMeta = ADSENSE_CLIENT
    ? `<meta name="google-adsense-account" content="${esc(ADSENSE_CLIENT)}">`
    : "";
  const adScript =
    ADSENSE_CLIENT && ADSENSE_SLOT
      ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ADSENSE_CLIENT)}" crossorigin="anonymous"></script>`
      : "";
  const ad =
    ADSENSE_CLIENT && ADSENSE_SLOT
      ? `<div class="ad"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ADSENSE_CLIENT)}" data-ad-slot="${esc(ADSENSE_SLOT)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`
      : "";

  const appLink = `${SITE}/?lat=${area.lat}&lng=${area.lng}&area=${encodeURIComponent(name)}`;

  const listing = (c, i) => cardListItem(c, i, isTh);

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
${adSenseMeta}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=Kanit:wght@600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${jsonLd(area, lang, cards)}</script>
${adScript}
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 "Anuphan",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#FBF7F0;color:#17140F}
h1,h2,.cta{font-family:"Kanit",sans-serif}
a{color:#FF5A1F}
header,main,footer{max-width:720px;margin:0 auto;padding:0 20px}
header{padding-top:32px}
h1{font-size:26px;line-height:1.25;margin:0 0 8px;font-weight:700}
.lede{color:#6B6358;margin:0 0 20px}
.cta{display:inline-block;background:#FF5A1F;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;margin:4px 0 24px}
.ad{margin:24px 0;min-height:100px}
ul{list-style:none;padding:0;margin:0}
.card{display:flex;gap:14px;background:#fff;border:1px solid #E8E0D3;border-radius:14px;padding:12px;margin:12px 0}
.thumb{width:120px;height:90px;object-fit:cover;border-radius:10px;flex:none;background:#E8E0D3}
.thumb.noimg{background:linear-gradient(135deg,#FFC24B,#FF5A1F)}
.meta{min-width:0}
h2{font-size:17px;margin:2px 0 4px}
.sub{margin:0 0 4px;color:#6B6358;font-size:14px}
.addr{margin:0 0 6px;color:#9A9084;font-size:13px}
.maps{font-size:13px;font-weight:600;text-decoration:none}
.siblings{margin:28px 0 8px;line-height:2}
.siblings a{display:inline-block;margin-right:10px;font-size:14px}
footer{padding:24px 20px 48px;color:#9A9084;font-size:13px;border-top:1px solid #E8E0D3;margin-top:32px}
footer a{color:#9A9084;margin-right:14px}
@media(max-width:480px){.thumb{width:92px;height:78px}}
</style>
<script defer src="/_vercel/insights/script.js"></script>
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
<a href="${SITE}/about">${isTh ? "เกี่ยวกับเรา" : "About"}</a>
<a href="${SITE}/privacy">${isTh ? "ความเป็นส่วนตัว" : "Privacy"}</a>
<a href="${SITE}/terms">${isTh ? "เงื่อนไข" : "Terms"}</a>
<a href="${SITE}/support">${isTh ? "สนับสนุนผู้พัฒนา" : "Support the developer"}</a>
<a href="${SITE}/contact">${isTh ? "ติดต่อเรา" : "Contact"}</a>
</footer>
</body>
</html>
`;
}

// ------------------------------------------------------------- bot snapshot
//
// eatrai.help/ itself is a plain client-rendered app (no SSR, no
// expo-router) — its initial HTML is just `<div id="root">`, empty until JS
// mounts. AdSense's own crawler (Mediapartners-Google) doesn't reliably
// render client JS, and reportedly neither always does Googlebot/AdsBot on
// the first pass, so a bot fetching "/" can see nothing. Real users always
// get the actual swipe app unchanged — see mobile/middleware.js, which
// rewrites just those three bot user agents on path "/" to this file.
// Bangkok is the representative example: it already has the deepest,
// most-reviewed dataset of any covered city.
const BOT_HOME_PATH = "_bot/home.html";

function homeSnapshotHtml({ cards, metros }) {
  const canonical = `${SITE}/`;
  const titleTh = "EatRai — ปัดเลือกร้านอาหารใกล้คุณ";
  const descEn =
    "Real nearby restaurants, one swipe at a time — rating, price, distance, hours, and photos pulled live from Google Places. No accounts, no app to install.";
  const descTh =
    "ปัดเลือกร้านอาหารใกล้คุณ ดูคะแนน ราคา ระยะทาง เวลาเปิด และรูปภาพแบบเรียลไทม์จาก Google Places ไม่ต้องสมัครสมาชิก ไม่ต้องติดตั้งแอป";

  const adSenseMeta = ADSENSE_CLIENT
    ? `<meta name="google-adsense-account" content="${esc(ADSENSE_CLIENT)}">`
    : "";

  const otherCities = metros
    .filter((m) => m.slug !== "bangkok")
    .map((m) => `<a href="${areaPath(m.slug, "en")}">${esc(m.en)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titleTh)}</title>
<meta name="description" content="${esc(descTh)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titleTh)}">
<meta property="og:description" content="${esc(descTh)}">
<meta property="og:url" content="${canonical}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${adSenseMeta}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=Kanit:wght@600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${jsonLd({ slug: "bangkok", en: "Bangkok", th: "กรุงเทพฯ" }, "th", cards)}</script>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 "Anuphan",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#FBF7F0;color:#17140F}
h1,h2,.cta{font-family:"Kanit",sans-serif}
a{color:#FF5A1F}
header,main,footer{max-width:720px;margin:0 auto;padding:0 20px}
header{padding-top:32px}
h1{font-size:26px;line-height:1.25;margin:0 0 8px;font-weight:700}
.lede{color:#6B6358;margin:0 0 20px}
.cta{display:inline-block;background:#FF5A1F;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;margin:4px 0 24px}
ul{list-style:none;padding:0;margin:0}
.card{display:flex;gap:14px;background:#fff;border:1px solid #E8E0D3;border-radius:14px;padding:12px;margin:12px 0}
.thumb{width:120px;height:90px;object-fit:cover;border-radius:10px;flex:none;background:#E8E0D3}
.thumb.noimg{background:linear-gradient(135deg,#FFC24B,#FF5A1F)}
.meta{min-width:0}
h2{font-size:17px;margin:2px 0 4px}
.sub{margin:0 0 4px;color:#6B6358;font-size:14px}
.addr{margin:0 0 6px;color:#9A9084;font-size:13px}
.maps{font-size:13px;font-weight:600;text-decoration:none}
.cities{margin:28px 0 8px;line-height:2}
.cities a{display:inline-block;margin-right:10px;font-size:14px}
footer{padding:24px 20px 48px;color:#9A9084;font-size:13px;border-top:1px solid #E8E0D3;margin-top:32px}
footer a{color:#9A9084;margin-right:14px}
@media(max-width:480px){.thumb{width:92px;height:78px}}
</style>
</head>
<body>
<header>
<h1>${esc(titleTh)}</h1>
<p class="lede">${esc(descTh)}</p>
<p class="lede">${esc(descEn)}</p>
</header>
<main>
<h2>${esc(`ตัวอย่างจริงจากกรุงเทพฯ วันนี้ (Live example from Bangkok today)`)}</h2>
<ul>${cards.map((c, i) => cardListItem(c, i, true)).join("")}</ul>
<nav class="cities">${esc("เมืองอื่นที่ EatRai ใช้งานได้ (also available in): ")}${otherCities}</nav>
</main>
<footer>
<a href="${SITE}/about">About / เกี่ยวกับเรา</a>
<a href="${SITE}/support">Support / สนับสนุนผู้พัฒนา</a>
<a href="${SITE}/privacy">Privacy / ความเป็นส่วนตัว</a>
<a href="${SITE}/terms">Terms / เงื่อนไข</a>
<a href="${SITE}/contact">Contact / ติดต่อเรา</a>
</footer>
</body>
</html>
`;
}

// Hardcoded, dependency-free fallback for when the Bangkok fetch fails or
// comes back too thin (see main()) — bots must never see an empty shell,
// even on a Places API hiccup. No listings, just the same real description
// used site-wide (mirrors public/about/index.html).
const FALLBACK_BOT_HOME_HTML = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EatRai — ปัดเลือกร้านอาหารใกล้คุณ</title>
<meta name="description" content="ปัดเลือกร้านอาหารใกล้คุณ ตัดสินใจไวว่าจะกินไรดี ไม่ต้องเถียงกันอีกต่อไป">
<link rel="canonical" href="${SITE}/">
${ADSENSE_CLIENT ? `<meta name="google-adsense-account" content="${esc(ADSENSE_CLIENT)}">` : ""}
<style>
body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#FBF7F0;color:#17140F}
main{max-width:680px;margin:0 auto;padding:32px 22px 64px}
h1{font-size:24px;margin:0 0 12px}
a{color:#FF5A1F}
</style>
</head>
<body>
<main>
<h1>EatRai — ปัดเลือกร้านอาหารใกล้คุณ / swipe your way to dinner</h1>
<p>เวลาชวนกันไปกินข้าวแล้วตกลงกันไม่ได้ว่าจะไปร้านไหน มักใช้เวลานานกว่ามื้ออาหารจริงเสียอีก EatRai แสดงร้านอาหารใกล้ตัวจริงให้ทีละร้าน พร้อมคะแนน ราคา ระยะทาง เวลาเปิด และรูปภาพ ดึงข้อมูลสดจาก Google Places ไม่มีระบบสมัครสมาชิก ไม่ต้องติดตั้งแอป</p>
<p>Deciding where to eat with other people usually takes longer than the meal itself. EatRai shows real nearby restaurants one at a time — rating, price, distance, hours, and photos pulled live from Google Places. No accounts, no app to install.</p>
<p><a href="${SITE}/about">About</a> · <a href="${SITE}/support">Support</a> · <a href="${SITE}/privacy">Privacy</a> · <a href="${SITE}/terms">Terms</a> · <a href="${SITE}/contact">Contact</a></p>
</main>
</body>
</html>
`;

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

// Writes the bot-facing "/" snapshot middleware.js rewrites to (see
// BOT_HOME_PATH). Called unconditionally, before the preview-build early
// return below, so the file exists on every deploy — a bot hitting a preview
// URL still gets the (possibly stale, always non-empty) fallback rather than
// a 404.
async function writeBotHome(html) {
  await mkdir(path.join(PUBLIC, "_bot"), { recursive: true });
  await writeFile(path.join(PUBLIC, BOT_HOME_PATH), html);
}

async function main() {
  await writeBotHome(FALLBACK_BOT_HOME_HTML);

  if (!shouldRunOnThisDeploy(process.env)) {
    console.log(
      `SEO: skipping (VERCEL_ENV=${process.env.VERCEL_ENV || "-"}) — only runs on production deploys, local, or FORCE_SEO_BUILD=1. This avoids spending real Google Places calls on every preview build.`,
    );
    return;
  }

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
  let bangkokThCards = null; // reused for the bot home snapshot below — no extra API call

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

      if (area.slug === "bangkok" && lang === "th") bangkokThCards = cards;

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

  if (bangkokThCards && shouldGenerate(bangkokThCards, min)) {
    await writeBotHome(homeSnapshotHtml({ cards: bangkokThCards, metros: cfg.metros }));
    console.log(`  write ${BOT_HOME_PATH} (${bangkokThCards.length} Bangkok cards)`);
  } else {
    console.log(`  keep  ${BOT_HOME_PATH} fallback (Bangkok fetch too thin or failed)`);
  }

  const staticPages = ["/about", "/privacy", "/terms", "/support", "/contact"];
  await writeFile(path.join(PUBLIC, "sitemap.xml"), sitemapXml([...staticPages, ...written]));
  console.log(`\nSEO: ${written.length} pages, ${skipped} skipped. API=${API}`);
}

module.exports = {
  esc,
  shouldGenerate,
  rankScore,
  areaPath,
  priceText,
  sitemapXml,
  pageHtml,
  shouldRunOnThisDeploy,
  homeSnapshotHtml,
  FALLBACK_BOT_HOME_HTML,
  BOT_HOME_PATH,
};

if (require.main === module) {
  main().catch((e) => {
    console.error("SEO build failed (continuing so the SPA still deploys):", e.message);
    process.exit(0);
  });
}
