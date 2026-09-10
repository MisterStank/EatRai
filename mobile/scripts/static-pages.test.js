const fs = require("node:fs");
const path = require("node:path");

const pub = (p) => fs.readFileSync(path.join(__dirname, "..", "public", p), "utf8");
const read = (page) => pub(path.join(page, "index.html"));

describe("hand-maintained static pages", () => {
  test.each([
    ["privacy", "https://eatrai.help/privacy"],
    ["terms", "https://eatrai.help/terms"],
    ["support", "https://eatrai.help/support"],
  ])("%s: canonical, crawlable lang, and a language toggle", (page, canonical) => {
    const html = read(page);
    expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
    expect(html).toMatch(/<html lang="en">/);
    // real lang markers on the Thai content (a11y + crawlers)
    expect(html).toMatch(/lang="th"/);
    // EN/ไทย toggle wired to the shared script
    expect(html).toMatch(/data-lang-btn="en"/);
    expect(html).toMatch(/data-lang-btn="th"/);
    expect(html).toContain('src="/lang-toggle.js"');
    // synchronous <head> language set (no flash of both languages)
    expect(html).toContain('document.documentElement.setAttribute("data-lang"');
    // both languages are actually present, hidden via CSS not deleted
    expect(html).toMatch(/html\[data-lang="en"\] \.lang-th\{display:none\}/);
  });

  test("support page: live PromptPay QR with amount picker + static fallback", () => {
    const html = read("support");
    expect(html).toContain('src="/support/qr.js"');
    expect(html).toContain('src="/support/promptpay.js"');
    // amount chips + custom field
    expect(html).toMatch(/data-amt="20"/);
    expect(html).toMatch(/data-amt="100"/);
    expect(html).toMatch(/id="custom"/);
    // JS-off / render-failure fallback still points at the committed image
    expect(html).toContain('src="/support/promptpay.jpg"');
    expect(html).toMatch(/<noscript>/);
    // obsolete bits are gone
    expect(html).not.toContain("[YOUR-PROMPTPAY-ID]");
    expect(html).not.toContain('id="soon"');
  });

  test("support page: 'who you're supporting' block", () => {
    const html = read("support");
    expect(html).toContain("Chakkrit Jongkraijak");
    expect(html).toContain("chakkritjk-portfolio.vercel.app");
    expect(html).toContain("github.com/MisterStank");
    expect(html).toContain("linkedin.com/in/chakkrit-jongkraijak");
  });

  test("recipient PromptPay number is never a literal string (unsearchable)", () => {
    for (const f of [
      "support/index.html",
      "support/promptpay.js",
      "privacy/index.html",
      "terms/index.html",
      "lang-toggle.js",
    ]) {
      expect(pub(f)).not.toContain("0909537358");
      expect(pub(f)).not.toContain("909537358");
    }
  });

  test("no dead TipMe references, no leaked bank-account digits", () => {
    for (const p of ["privacy", "terms", "support"]) {
      expect(read(p).toLowerCase()).not.toContain("tipme");
      expect(read(p)).not.toMatch(/0805/);
    }
  });
});
