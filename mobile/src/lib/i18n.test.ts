import { translate } from "./i18n";

describe("translate", () => {
  test("resolves a key in each language", () => {
    expect(translate("en", "open")).toBe("Open now");
    expect(translate("th", "open")).toBe("เปิดอยู่");
  });

  test("hoursUnknown has a real translation in both languages", () => {
    expect(translate("en", "hoursUnknown")).toBe("Hours unknown");
    expect(translate("th", "hoursUnknown")).toBe("ไม่มีข้อมูลเวลาทำการ");
  });

  test("substitutes {vars} into the template", () => {
    expect(translate("en", "seeYourN", { n: 3 })).toBe("See your 3");
    expect(translate("th", "seeYourN", { n: 3 })).toBe("ดู 3 ร้านที่ชอบ");
  });
});
