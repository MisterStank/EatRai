// Vercel serverless function for /list — the shared-list route.
//
// The app is a static SPA, so a bare /list link unfurls as just "EatRai" with
// no preview. This function serves the same index.html but injects Open Graph
// tags naming the places in the list, so links pasted into LINE / Messenger /
// Slack show something useful. Humans still get the full app (the real bundle
// script tag is preserved from index.html).

const API = process.env.EXPO_PUBLIC_API_URL;

function esc(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const base = `${proto}://${req.headers.host}`;

  let html;
  try {
    html = await fetch(`${base}/index.html`).then((r) => r.text());
  } catch {
    res.statusCode = 302;
    res.setHeader("location", "/");
    return res.end();
  }

  const ids = String(new URL(req.url, base).searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);

  const title = "A shortlist of places to eat — EatRai";
  let desc = ids.length
    ? `${ids.length} place${ids.length === 1 ? "" : "s"} someone picked for you.`
    : "Swipe to pick where to eat.";

  try {
    if (API && ids.length) {
      const r = await fetch(`${API}/list?ids=${encodeURIComponent(ids.join(","))}`, {
        headers: { origin: base },
      });
      if (r.ok) {
        const names = ((await r.json()).places || []).map((p) => p.name).filter(Boolean);
        if (names.length) {
          desc =
            names.slice(0, 5).join(" · ") +
            (names.length > 5 ? ` and ${names.length - 5} more` : "");
        }
      }
    }
  } catch {
    /* keep the generic description */
  }

  const tags = `
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="EatRai" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
  `;
  html = html.replace("</head>", `${tags}</head>`);

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=300, s-maxage=3600");
  res.end(html);
}
