import AsyncStorage from "@react-native-async-storage/async-storage";
import { filterCount, useSession, DEFAULT_RADIUS_M } from "./session";
import type { Card } from "../api/client";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "1",
    name: "Test Place",
    address: "",
    priceLevel: 0,
    priceRange: null,
    rating: 0,
    ratingCount: 0,
    photoUrls: [],
    cuisines: [],
    distanceM: 0,
    openNow: false,
    openKnown: false,
    mapsUri: "",
    ...overrides,
  };
}

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

describe("useSession liked-list actions", () => {
  beforeEach(() => {
    useSession.setState({ liked: [] });
  });

  test("addLiked appends a new card", () => {
    useSession.getState().addLiked(card({ id: "a" }));
    expect(useSession.getState().liked.map((c) => c.id)).toEqual(["a"]);
  });

  test("addLiked is a no-op for a card already liked (dedup by id)", () => {
    useSession.getState().addLiked(card({ id: "a", name: "First" }));
    useSession.getState().addLiked(card({ id: "a", name: "Second" }));
    const liked = useSession.getState().liked;
    expect(liked).toHaveLength(1);
    expect(liked[0].name).toBe("First"); // first write wins, not overwritten
  });

  test("removeLiked drops only the matching id", () => {
    useSession.setState({ liked: [card({ id: "a" }), card({ id: "b" })] });
    useSession.getState().removeLiked("a");
    expect(useSession.getState().liked.map((c) => c.id)).toEqual(["b"]);
  });

  test("removeLiked is a no-op for an id that isn't liked", () => {
    useSession.setState({ liked: [card({ id: "a" })] });
    useSession.getState().removeLiked("nope");
    expect(useSession.getState().liked.map((c) => c.id)).toEqual(["a"]);
  });

  test("clearLiked empties the list", () => {
    useSession.setState({ liked: [card({ id: "a" }), card({ id: "b" })] });
    useSession.getState().clearLiked();
    expect(useSession.getState().liked).toEqual([]);
  });
});

describe("useSession persistence", () => {
  test("addLiked is written through to AsyncStorage under the session key", async () => {
    useSession.setState({ liked: [] });
    useSession.getState().addLiked(card({ id: "persisted-1" }));

    // The persist middleware writes asynchronously — give it a tick.
    await new Promise((r) => setTimeout(r, 0));

    const raw = await AsyncStorage.getItem("eatrai-session-v1");
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw as string);
    expect(saved.state.liked.map((c: Card) => c.id)).toContain("persisted-1");
  });

  test("hydrated is never part of the persisted payload (partialize excludes it)", async () => {
    useSession.getState().markHydrated();
    await new Promise((r) => setTimeout(r, 0));

    const raw = await AsyncStorage.getItem("eatrai-session-v1");
    const saved = JSON.parse(raw as string);
    expect(saved.state).not.toHaveProperty("hydrated");
  });
});
