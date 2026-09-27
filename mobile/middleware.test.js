const middleware = require("./middleware.js").default;

// A minimal stand-in for the Request the Vercel Edge runtime actually passes
// in — middleware.js only reads .headers.get("user-agent") and .url.
const req = (ua, url = "https://eatrai.help/") => ({
  url,
  headers: { get: (name) => (name.toLowerCase() === "user-agent" ? ua : null) },
});

describe("middleware — bot-only rewrite of '/'", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.BOT_SNAPSHOT_DISABLED;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  test.each([
    "Mediapartners-Google",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "AdsBot-Google (+http://www.google.com/adsbot.html)",
  ])("rewrites %s to the static bot snapshot", (ua) => {
    const res = middleware(req(ua));
    expect(res).toBeDefined();
    expect(res.headers.get("x-middleware-rewrite")).toContain("/_bot/home.html");
  });

  test("a real browser UA passes through untouched", () => {
    const res = middleware(
      req(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)",
      ),
    );
    expect(res).toBeUndefined();
  });

  test("no user-agent header passes through untouched", () => {
    const res = middleware(req(null));
    expect(res).toBeUndefined();
  });

  test("BOT_SNAPSHOT_DISABLED=1 is a hard kill-switch, even for a real bot UA", () => {
    process.env.BOT_SNAPSHOT_DISABLED = "1";
    const res = middleware(req("Mediapartners-Google"));
    expect(res).toBeUndefined();
  });
});
