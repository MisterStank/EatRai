const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", "public", p, "index.html"), "utf8");

describe("hand-maintained static pages", () => {
  test.each([
    ["privacy", "https://eatrai.help/privacy"],
    ["terms", "https://eatrai.help/terms"],
    ["support", "https://eatrai.help/support"],
  ])("%s: canonical + both languages", (page, canonical) => {
    const html = read(page);
    expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
    expect(html).toMatch(/lang="th"/);
    expect(html).toMatch(/<html lang="en">/);
  });

  test("support page: QR image self-heals to a 'coming soon' block", () => {
    const html = read("support");
    // the <img> hides itself and reveals #soon on error
    expect(html).toMatch(/src="\/support\/promptpay\.png"[^>]*onerror=[^>]*getElementById\('soon'\)\.hidden=false/);
    // #soon is hidden until then
    expect(html).toMatch(/<div class="soon" id="soon" hidden>/);
    // a fill-me PromptPay id placeholder
    expect(html).toContain("[YOUR-PROMPTPAY-ID]");
  });

  test("no dead TipMe references", () => {
    for (const p of ["privacy", "terms", "support"]) {
      expect(read(p).toLowerCase()).not.toContain("tipme");
    }
  });
});
