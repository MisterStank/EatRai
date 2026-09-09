const { esc, shouldGenerate, areaPath, sitemapXml, priceText, pageHtml } = require("./build-seo.js");

const area = { slug: "thonglor", en: "Thong Lo", th: "ทองหล่อ", lat: 13.7295, lng: 100.5817, metro: "bangkok" };
const card = (over = {}) => ({
  id: "x" + Math.random(),
  name: "Test Kitchen",
  address: "123 Sukhumvit",
  rating: 4.4,
  ratingCount: 210,
  priceLevel: 2,
  priceRange: { start: 150, end: 400, currency: "THB" },
  cuisines: ["Thai", "Noodles"],
  photoUrls: ["https://api.example/photo?name=places/a/photos/b&w=1000"],
  mapsUri: "https://maps.google.com/?q=x",
  ...over,
});

describe("build-seo pure helpers", () => {
  test("esc neutralises HTML", () => {
    expect(esc(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
  });

  test("shouldGenerate needs >= min cards with ids", () => {
    expect(shouldGenerate(Array.from({ length: 8 }, () => card()), 8)).toBe(true);
    expect(shouldGenerate(Array.from({ length: 7 }, () => card()), 8)).toBe(false);
    expect(shouldGenerate([card(), { name: "no id" }], 2)).toBe(false);
    expect(shouldGenerate(null, 8)).toBe(false);
  });

  test("areaPath: en canonical, th under /th", () => {
    expect(areaPath("thonglor", "en")).toBe("/near/thonglor");
    expect(areaPath("thonglor", "th")).toBe("/th/near/thonglor");
  });

  test("priceText prefers the range, falls back to ฿ level", () => {
    expect(priceText(card())).toBe("฿150–400");
    expect(priceText(card({ priceRange: null, priceLevel: 3 }))).toBe("฿฿฿");
  });

  test("sitemapXml lists the homepage plus every path", () => {
    const xml = sitemapXml(["/near/thonglor", "/th/near/thonglor"]);
    expect(xml).toContain("<loc>https://eatrai.help/</loc>");
    expect(xml).toContain("<loc>https://eatrai.help/near/thonglor</loc>");
    expect(xml).toContain("<loc>https://eatrai.help/th/near/thonglor</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });

  describe("pageHtml", () => {
    const cards = Array.from({ length: 10 }, (_, i) => card({ name: `Place ${i}` }));
    const html = pageHtml({ area, lang: "en", cards, siblings: [{ slug: "ari", en: "Ari", th: "อารีย์" }] });
    const th = pageHtml({ area, lang: "th", cards, siblings: [] });

    test("canonical + both hreflang + x-default", () => {
      expect(html).toContain('<link rel="canonical" href="https://eatrai.help/near/thonglor">');
      expect(html).toContain('hreflang="en" href="https://eatrai.help/near/thonglor"');
      expect(html).toContain('hreflang="th" href="https://eatrai.help/th/near/thonglor"');
      expect(html).toContain('hreflang="x-default"');
    });
    test("Thai page: lang=th + Thai <h1>", () => {
      expect(th).toContain('<html lang="th">');
      expect(th).toContain("ร้านอาหารแนะนำในทองหล่อ");
    });
    test("deep-link CTA into the app at the area coords", () => {
      expect(html).toContain("https://eatrai.help/?lat=13.7295&lng=100.5817&area=Thong%20Lo");
    });
    test("JSON-LD ItemList, one entry per card", () => {
      const m = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
      const ld = JSON.parse(m[1]);
      expect(ld["@type"]).toBe("ItemList");
      expect(ld.itemListElement).toHaveLength(10);
      expect(ld.itemListElement[0].item["@type"]).toBe("Restaurant");
    });
    test("no AdSense markup when the env isn't set", () => {
      expect(html).not.toContain("adsbygoogle");
    });
    test("footer links to privacy + terms", () => {
      expect(html).toContain('href="https://eatrai.help/privacy"');
      expect(html).toContain('href="https://eatrai.help/terms"');
    });
    test("photo width trimmed to 400", () => {
      expect(html).toContain("w=400");
      expect(html).not.toContain("w=1000");
    });
    test("sibling area cross-links", () => {
      expect(html).toContain('href="/near/ari"');
    });
  });
});
