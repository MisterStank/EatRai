import { fmtPriceBand } from "./format";

describe("fmtPriceBand", () => {
  test("labels the four Google price levels as THB bands", () => {
    expect(fmtPriceBand(1)).toBe("฿1–100");
    expect(fmtPriceBand(2)).toBe("฿100–250");
    expect(fmtPriceBand(3)).toBe("฿250–500");
    expect(fmtPriceBand(4)).toBe("฿500+");
  });

  test("falls back to ฿ dots for an unexpected level", () => {
    expect(fmtPriceBand(0)).toBe("฿");
    expect(fmtPriceBand(5)).toBe("฿฿฿฿฿");
  });
});
