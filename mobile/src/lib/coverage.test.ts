import { AREAS, areaName, inCoverage } from "./coverage";

describe("inCoverage", () => {
  test("a point at a metro centre resolves to that metro", () => {
    expect(inCoverage(13.75, 100.52)?.key).toBe("bangkok");
    expect(inCoverage(18.79, 98.99)?.key).toBe("chiangmai");
    expect(inCoverage(7.95, 98.34)?.key).toBe("phuket");
  });

  test("Bangkok's radius reaches its satellite provinces", () => {
    expect(inCoverage(13.86, 100.51)?.key).toBe("bangkok"); // Nonthaburi
    expect(inCoverage(13.6, 100.6)?.key).toBe("bangkok"); // Samut Prakan
  });

  test("Nimman (Chiang Mai) and Thonglor (Bangkok) are in coverage", () => {
    expect(inCoverage(18.8, 98.967)?.key).toBe("chiangmai");
    expect(inCoverage(13.73, 100.58)?.key).toBe("bangkok");
  });

  test("points between covered metros are out of coverage", () => {
    expect(inCoverage(19.91, 99.83)).toBeNull(); // Chiang Rai
    expect(inCoverage(15.7, 100.1)).toBeNull(); // Nakhon Sawan gap
    expect(inCoverage(9.0, 101.0)).toBeNull(); // Gulf of Thailand
  });

  test("the null-island default is out of coverage", () => {
    expect(inCoverage(0, 0)).toBeNull();
  });

  test("resolves Pattaya to chonburi, not Bangkok", () => {
    expect(inCoverage(12.93, 100.88)?.key).toBe("chonburi");
  });
});

test("every area has both language names", () => {
  for (const a of AREAS) {
    expect(areaName(a, "en")).toBeTruthy();
    expect(areaName(a, "th")).toBeTruthy();
  }
});
