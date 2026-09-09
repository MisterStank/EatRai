import cases from "./grid-cases.json";
import { DEG, radiusBucket, snap } from "./grid";

// grid-cases.json is the canonical parity table — backend/internal/grid/grid_test.go
// reads the exact same file, so the Go and TS implementations cannot drift.

describe("grid parity table", () => {
  test("DEG matches the shared table", () => {
    expect(DEG).toBe(cases.deg);
  });

  test.each(cases.snap)("snap($in) -> $out", ({ in: input, out }) => {
    expect(snap(input)).toBeCloseTo(out, 6);
  });

  test.each(cases.radiusBucket)("radiusBucket($in) -> $out", ({ in: input, out }) => {
    expect(radiusBucket(input)).toBe(out);
  });
});
