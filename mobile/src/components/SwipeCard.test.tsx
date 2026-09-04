import React from "react";
import { render } from "@testing-library/react-native";
import { SwipeCard } from "./SwipeCard";
import type { Card } from "../api/client";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "1",
    name: "Test Place",
    address: "123 St",
    priceLevel: 2,
    priceRange: null,
    rating: 4.5,
    ratingCount: 10,
    photoUrls: [],
    cuisines: ["Thai"],
    distanceM: 500,
    openNow: true,
    openKnown: true,
    mapsUri: "https://maps.google.com",
    ...overrides,
  };
}

// Regression: SwipeCard used to render nothing at all for the open/closed
// chip when hours weren't known, silently hiding the ambiguity instead of
// surfacing it.
describe("SwipeCard hours state", () => {
  test("shows Open when openKnown and openNow", () => {
    const { getByText } = render(
      <SwipeCard card={card({ openKnown: true, openNow: true })} depth={0} onResolve={() => {}} onDetail={() => {}} />,
    );
    expect(getByText("Open now")).toBeTruthy();
  });

  test("shows Closed when openKnown and not openNow", () => {
    const { getByText } = render(
      <SwipeCard card={card({ openKnown: true, openNow: false })} depth={0} onResolve={() => {}} onDetail={() => {}} />,
    );
    expect(getByText("Closed")).toBeTruthy();
  });

  test("shows Hours unknown when hours aren't known, instead of nothing", () => {
    const { getByText, queryByText } = render(
      <SwipeCard card={card({ openKnown: false })} depth={0} onResolve={() => {}} onDetail={() => {}} />,
    );
    expect(getByText("Hours unknown")).toBeTruthy();
    expect(queryByText("Open now")).toBeNull();
    expect(queryByText("Closed")).toBeNull();
  });
});
