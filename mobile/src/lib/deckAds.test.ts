import { AD_EVERY, spliceAds } from "./deckAds";
import type { Card } from "../api/client";

const card = (id: string): Card => ({
  id,
  name: id,
  address: "",
  priceLevel: 0,
  priceRange: null,
  rating: 4,
  ratingCount: 1,
  photoUrls: [],
  cuisines: [],
  distanceM: 100,
  openNow: true,
  openKnown: true,
  mapsUri: "",
});

const deck = (n: number) => Array.from({ length: n }, (_, i) => card(`r${i}`));

describe("spliceAds", () => {
  test("no-op when disabled", () => {
    const d = deck(12);
    expect(spliceAds(d, false)).toBe(d);
  });

  test("inserts one ad after every AD_EVERY real cards", () => {
    const out = spliceAds(deck(12), true);
    // positions 0-4 real, 5 ad, 6-10 real, 11 ad, 12-13 real
    expect(out.map((x) => ("isAd" in x ? "AD" : x.id))).toEqual([
      "r0", "r1", "r2", "r3", "r4", "AD",
      "r5", "r6", "r7", "r8", "r9", "AD",
      "r10", "r11",
    ]);
    expect(AD_EVERY).toBe(5);
  });

  test("never trails with an ad", () => {
    const out = spliceAds(deck(10), true); // exactly 2 groups of 5
    expect("isAd" in out[out.length - 1]).toBe(false);
    expect(out.filter((x) => "isAd" in x)).toHaveLength(1); // only the mid one
  });

  test("ad ids are unique", () => {
    const out = spliceAds(deck(23), true);
    const adIds = out.filter((x) => "isAd" in x).map((x) => x.id);
    expect(new Set(adIds).size).toBe(adIds.length);
  });

  test("fewer than AD_EVERY cards → no ads", () => {
    expect(spliceAds(deck(3), true).some((x) => "isAd" in x)).toBe(false);
  });
});
