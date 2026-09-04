import React from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { LikedSheet } from "./LikedSheet";
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

function renderSheet(liked: Card[]) {
  return render(
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <LikedSheet visible liked={liked} onRemove={() => {}} onClear={() => {}} onClose={() => {}} />
    </SafeAreaProvider>,
  );
}

// Regression: the row's meta line used to render nothing at all (not even the
// row) when there was no rating and hours weren't known.
describe("LikedSheet hours state", () => {
  test("shows Hours unknown for a card with unknown hours and no rating", () => {
    const { getByText } = renderSheet([card({ openKnown: false, rating: 0 })]);
    expect(getByText("Hours unknown")).toBeTruthy();
  });

  test("shows Closed for a card with known, closed hours", () => {
    const { getByText } = renderSheet([card({ openKnown: true, openNow: false })]);
    expect(getByText(/Closed/)).toBeTruthy();
  });
});
