/**
 * @jest-environment jsdom
 */
const fs = require("node:fs");
const path = require("node:path");

const pub = (p) => fs.readFileSync(path.join(__dirname, "..", "public", p), "utf8");

// Minimal EMVCo CRC16-CCITT (0x1021, init 0xFFFF) for an independent check.
function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return ("000" + crc.toString(16).toUpperCase()).slice(-4);
}

function setup(lang) {
  const body = pub("support/index.html")
    .replace(/[\s\S]*?<body>/, "")
    .replace(/<\/body>[\s\S]*/, "")
    .replace(/<script[\s\S]*?<\/script>/g, ""); // scripts are eval'd manually below
  document.body.innerHTML = body;
  if (lang) document.documentElement.setAttribute("data-lang", lang);
  // load the three page scripts into this window, in order
  window.eval(pub("support/qr.js"));
  window.eval(pub("lang-toggle.js"));
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  window.eval(pub("support/promptpay.js"));
}

describe("support page PromptPay pipeline", () => {
  test("renders a QR data URL on load and updates when an amount is picked", () => {
    setup("en");
    const qrimg = document.getElementById("qrimg");
    expect(qrimg.hidden).toBe(false);
    expect(qrimg.src.startsWith("data:image/gif;base64,")).toBe(true);
    const before = qrimg.src;

    document.querySelector('[data-amt="50"]').click();
    expect(qrimg.src).not.toBe(before);
    expect(document.getElementById("give").textContent).toContain("50");
  });

  test("save button appears and triggers a download of the current QR", () => {
    setup("en");
    const btn = document.getElementById("saveqr");
    expect(btn.hidden).toBe(false);

    let downloaded = null;
    const orig = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {
      downloaded = { href: this.href, name: this.getAttribute("download") };
    };
    try {
      document.querySelector('[data-amt="50"]').click();
      btn.click();
    } finally {
      window.HTMLAnchorElement.prototype.click = orig;
    }
    expect(downloaded).not.toBeNull();
    expect(downloaded.name).toBe("eatrai-promptpay-50baht.png");
  });

  describe("save QR on iOS-style share sheet", () => {
    const proto = window.HTMLCanvasElement.prototype;
    let origGet, origBlob, origClick;
    beforeEach(() => {
      origGet = proto.getContext;
      origBlob = proto.toBlob;
      origClick = window.HTMLAnchorElement.prototype.click;
      proto.getContext = () => ({ fillRect() {}, set fillStyle(v) {} });
      proto.toBlob = function (cb) { cb(new window.Blob(["x"], { type: "image/png" })); };
      window.URL.createObjectURL = () => "blob:mock";
      window.URL.revokeObjectURL = () => {};
    });
    afterEach(() => {
      proto.getContext = origGet;
      proto.toBlob = origBlob;
      window.HTMLAnchorElement.prototype.click = origClick;
      delete window.navigator.canShare;
      delete window.navigator.share;
    });

    test("uses navigator.share with a PNG file instead of a download link", () => {
      setup("en");
      const shared = [];
      window.navigator.canShare = () => true;
      window.navigator.share = (d) => { shared.push(d); return Promise.resolve(); };
      let clicked = false;
      window.HTMLAnchorElement.prototype.click = () => { clicked = true; };
      document.querySelector('[data-amt="50"]').click();
      document.getElementById("saveqr").click();
      expect(shared).toHaveLength(1);
      expect(shared[0].files[0].name).toBe("eatrai-promptpay-50baht.png");
      expect(shared[0].files[0].type).toBe("image/png");
      expect(clicked).toBe(false);
    });

    test("falls back to a download when files cannot be shared", () => {
      setup("en");
      window.navigator.canShare = () => false;
      window.navigator.share = () => { throw new Error("should not be called"); };
      let name = null;
      window.HTMLAnchorElement.prototype.click = function () { name = this.getAttribute("download"); };
      document.getElementById("saveqr").click();
      expect(name).toBe("eatrai-promptpay.png");
    });

    test("a cancelled share sheet does not trigger a download", async () => {
      setup("en");
      window.navigator.canShare = () => true;
      window.navigator.share = () => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" }));
      let clicked = false;
      window.HTMLAnchorElement.prototype.click = () => { clicked = true; };
      document.getElementById("saveqr").click();
      await Promise.resolve();
      await Promise.resolve();
      expect(clicked).toBe(false);
    });
  });

  test("custom amount out of range falls back to an amountless QR", () => {
    setup("en");
    const input = document.getElementById("custom");
    input.value = "999999";
    input.dispatchEvent(new window.Event("input"));
    expect(document.getElementById("give").textContent).toMatch(/enter any amount/i);
  });

  test("language toggle switches the helper copy", () => {
    setup("en");
    document.querySelector('[data-amt="20"]').click();
    expect(document.getElementById("give").textContent).toMatch(/Scan to give/);
    document.querySelector('[data-lang-btn="th"]').click();
    expect(document.documentElement.getAttribute("data-lang")).toBe("th");
    expect(document.getElementById("give").textContent).toMatch(/สแกน/);
  });

  test("payload builder matches the documented PromptPay test vector", () => {
    // Reconstruct the builder with a stand-in number, mirroring promptpay.js.
    const src = pub("support/promptpay.js");
    expect(src).toMatch(/tlv\("00", AID\) \+ tlv\("01", TARGET\)/);
    const tlv = (id, v) => id + ("0" + String(v).length).slice(-2) + v;
    const target = "00" + "66" + "899999999"; // documented example: 0899999999
    const merchant = tlv("00", "A000000677010111") + tlv("01", target);
    let s =
      tlv("00", "01") +
      tlv("01", "11") +
      tlv("29", merchant) +
      tlv("58", "TH") +
      tlv("53", "764") +
      "6304";
    s += crc16(s);
    expect(s).toBe(
      "00020101021129370016A000000677010111011300668999999995802TH53037646304FE29",
    );
  });
});
