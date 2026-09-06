import { CATEGORIES, CAT_SECTIONS } from "./categories";

describe("CATEGORIES", () => {
  test("every entry sits in a known section", () => {
    for (const c of CATEGORIES) {
      expect(CAT_SECTIONS).toContain(c.section);
    }
  });

  test("every section has at least one category", () => {
    for (const s of CAT_SECTIONS) {
      expect(CATEGORIES.some((c) => c.section === s)).toBe(true);
    }
  });

  test("keys are unique", () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("every category has both language labels", () => {
    for (const c of CATEGORIES) {
      expect(c.en.length).toBeGreaterThan(0);
      expect(c.th.length).toBeGreaterThan(0);
    }
  });
});
