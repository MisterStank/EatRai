import { filterCount, DEFAULT_RADIUS_M } from "./session";

const base = {
  categories: [] as string[],
  openNow: false,
  radiusM: DEFAULT_RADIUS_M,
  minRating: 0,
  priceLevels: [] as number[],
  sort: "near" as const,
};

describe("filterCount", () => {
  test("all defaults -> 0", () => {
    expect(filterCount(base)).toBe(0);
  });

  test("counts each active filter once", () => {
    expect(filterCount({ ...base, categories: ["thai", "cafe"] })).toBe(2);
    expect(filterCount({ ...base, openNow: true })).toBe(1);
    expect(filterCount({ ...base, radiusM: 2000 })).toBe(1);
    expect(filterCount({ ...base, minRating: 4 })).toBe(1);
    expect(filterCount({ ...base, priceLevels: [1, 2] })).toBe(1);
  });

  // Regression: filterCount previously ignored `sort`, so switching to
  // "Best match" left the filter badge showing 0 active filters.
  test("counts a non-default sort", () => {
    expect(filterCount({ ...base, sort: "match" })).toBe(1);
  });

  test("stacks multiple active filters", () => {
    expect(
      filterCount({
        categories: ["thai"],
        openNow: true,
        radiusM: 5000,
        minRating: 4,
        priceLevels: [1],
        sort: "match",
      }),
    ).toBe(6);
  });
});
