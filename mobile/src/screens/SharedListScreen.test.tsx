import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { SharedListScreen } from "./SharedListScreen";
import { useSession } from "../store/session";
import type { Card } from "../api/client";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "1",
    name: "Test Place",
    address: "123 St",
    priceLevel: 2,
    priceRange: null,
    rating: 0,
    ratingCount: 0,
    photoUrls: [],
    cuisines: ["Thai"],
    distanceM: 500,
    openNow: true,
    openKnown: true,
    mapsUri: "https://maps.google.com",
    ...overrides,
  };
}

const mockGetList = jest.fn();
jest.mock("../api/client", () => ({
  ...jest.requireActual("../api/client"),
  getList: (...args: any[]) => mockGetList(...args),
}));

function renderScreen(ids: string[]) {
  // The screen gates its first fetch on the session store's `hydrated` flag,
  // which normally flips once AsyncStorage rehydration completes (or a 2.5s
  // fallback fires). Set it directly so the test exercises the row-rendering
  // logic we actually care about, not the store's storage-rehydration timing.
  useSession.getState().markHydrated();
  return render(
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SharedListScreen ids={ids} />
    </SafeAreaProvider>,
  );
}

// Regression: the shared-list row used to render nothing at all (not even the
// row) for a place with no rating and unknown hours — same gap as LikedSheet.
describe("SharedListScreen hours state", () => {
  test(
    "shows Hours unknown for a place with unknown hours and no rating",
    async () => {
      mockGetList.mockResolvedValue([card({ openKnown: false, rating: 0 })]);
      const { getByText } = renderScreen(["1"]);
      await waitFor(() => expect(getByText("Hours unknown")).toBeTruthy(), { timeout: 20000 });
    },
    30000, // this environment's cold jest-expo transform + WSL disk I/O makes
    // component tests slow in general (see SwipeCard/RestaurantSheet timings) —
    // this one adds an async fetch + effect chain on top of that baseline.
  );
});
