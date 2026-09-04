import { weightedPick } from "./decide";
import type { Card } from "../api/client";

function card(id: string, rating: number, distanceM: number): Card {
  return {
    id,
    name: id,
    address: "",
    priceLevel: 0,
    priceRange: null,
    rating,
    ratingCount: 0,
    photoUrls: [],
    cuisines: [],
    distanceM,
    openNow: false,
    openKnown: false,
    mapsUri: "",
  };
}

describe("weightedPick", () => {
  test("returns null for an empty list", () => {
    expect(weightedPick([])).toBeNull();
  });

  test("returns the only candidate for a single-item list", () => {
    const c = card("a", 4.5, 300);
    expect(weightedPick([c])?.id).toBe("a");
  });

  test("never returns the avoided id when an alternative exists", () => {
    const cards = [card("a", 4.5, 300), card("b", 4.0, 500)];
    const seen = new Set<string>();
    // Math.random is uniform; run enough times that a bug (ignoring `avoid`)
    // would show up as "a" appearing despite being excluded.
    for (let i = 0; i < 50; i++) {
      const pick = weightedPick(cards, "a");
      seen.add(pick!.id);
    }
    expect(seen.has("a")).toBe(false);
    expect(seen.has("b")).toBe(true);
  });

  test("falls back to the full list when avoid excludes everyone", () => {
    const c = card("only", 4.0, 200);
    expect(weightedPick([c], "only")?.id).toBe("only");
  });

  test("is deterministic for a given Math.random value", () => {
    const cards = [card("low", 3.2, 4000), card("high", 5.0, 100)];
    const spy = jest.spyOn(Math, "random").mockReturnValue(0); // x=0 -> first candidate whose cumulative weight crosses it
    expect(weightedPick(cards)?.id).toBe("low");
    spy.mockRestore();
  });
});
