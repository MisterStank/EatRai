// Vercel Edge Middleware.
//
// eatrai.help/ is a plain client-rendered app (no SSR, no expo-router) — its
// initial HTML is just `<div id="root">`, empty until JS mounts. This is a
// likely reason AdSense rejected the site ("insufficient content"):
// Mediapartners-Google (AdSense's crawler) doesn't reliably execute client
// JS, and the same is true of Googlebot/AdsBot-Google on a first pass, so a
// bot fetching "/" can see nothing.
//
// Real users always get the actual swipe app, completely unchanged — this
// only rewrites requests from the three bot user agents below, and only for
// the bare "/" path, to a build-time static snapshot with real content (see
// scripts/build-seo.js's homeSnapshotHtml / FALLBACK_BOT_HOME_HTML, written
// to public/_bot/home.html on every build). This is "dynamic rendering",
// Google's own sanctioned pattern for JS-heavy sites — the bot sees a real,
// substantively-equivalent snapshot of the same app, not fabricated content.
//
// BOT_SNAPSHOT_DISABLED=1 turns this off without touching the matcher logic:
// set it in the Vercel dashboard and redeploy if a real client ever gets
// misidentified as a bot. There's no lower-effort "flip it without a
// redeploy" option here on purpose — this is a solo-maintained project and a
// ~1-2 minute redeploy is an acceptable cost for something this rarely
// needs touching (see docs/... AdSense rejection fix notes).
import { rewrite } from "@vercel/edge";

export const config = { matcher: "/" };

const BOT_UA = /Mediapartners-Google|Googlebot|AdsBot-Google/i;

export default function middleware(request) {
  if (process.env.BOT_SNAPSHOT_DISABLED === "1") return;

  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) return;

  return rewrite(new URL("/_bot/home.html", request.url));
}
