import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { RestaurantSheet } from "./RestaurantSheet";
import type { Card } from "../api/client";

jest.mock("../api/client", () => ({
  ...jest.requireActual("../api/client"),
  getPlace: jest.fn(() => Promise.reject(new Error("no network in tests"))),
}));

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

// Regression: RestaurantSheet used to render nothing for the hours chip when
// openKnown was false, same gap as SwipeCard.
describe("RestaurantSheet hours state", () => {
  test("shows Hours unknown when hours aren't known", async () => {
    const { getByText, queryByText } = render(
      <RestaurantSheet visible card={card({ openKnown: false })} onClose={() => {}} />,
    );
    await waitFor(() => expect(getByText("Hours unknown")).toBeTruthy());
    expect(queryByText("Open now")).toBeNull();
    expect(queryByText("Closed")).toBeNull();
  });

  test("shows Closed when hours are known and closed", async () => {
    const { getByText } = render(
      <RestaurantSheet visible card={card({ openKnown: true, openNow: false })} onClose={() => {}} />,
    );
    await waitFor(() => expect(getByText("Closed")).toBeTruthy());
  });
});
