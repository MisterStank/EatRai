import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { DeckScreen } from "./DeckScreen";
import { useSession } from "../store/session";
import type { Card } from "../api/client";

function card(id: string): Card {
  return {
    id,
    name: `Place ${id}`,
    address: "",
    priceLevel: 0,
    priceRange: null,
    rating: 4.5,
    ratingCount: 10,
    photoUrls: [],
    cuisines: [],
    distanceM: 300,
    openNow: true,
    openKnown: true,
    mapsUri: "",
  };
}

const mockGetNearby = jest.fn();
jest.mock("../api/client", () => ({
  ...jest.requireActual("../api/client"),
  getNearby: (...args: any[]) => mockGetNearby(...args),
  reverseGeocode: () => Promise.resolve({ label: "" }),
}));

function renderScreen() {
  useSession.setState({
    hydrated: true,
    guideSeen: true, // skip the first-run guide prompt so it doesn't cover the deck
    hintSeen: true,
    liked: [],
    categories: [],
  });
  return render(
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <DeckScreen />
    </SafeAreaProvider>,
  );
}

describe("DeckScreen", () => {
  // Regression: exhausting the deck with zero likes used to be a dead end
  // once the radius couldn't widen further any more — no button at all. The
  // fix always offers a "Change location" fallback in that state.
  test("deck-exhausted state always offers a way out, even with zero likes", async () => {
    mockGetNearby.mockResolvedValue([card("a")]);
    const { getByLabelText, getByText } = renderScreen();

    await waitFor(() => expect(getByLabelText("Pass").props.accessibilityState?.disabled).toBeFalsy());
    fireEvent.press(getByLabelText("Pass")); // only card -> deck exhausted, 0 likes

    await waitFor(() => expect(getByText("Change location")).toBeTruthy());
  }, 30000);

  // Regression: swipe history is positional ("undo" = go back one index). A
  // filter change reloads the deck, and if the previously-current card still
  // happened to exist in the new deck (at a different index), stale history
  // entries survived the reload — so Undo could restore/reveal the wrong
  // card. The fix clears history on every reload, not just when the current
  // card isn't found in the new deck.
  test("swipe history is cleared on a filter-driven reload, not left stale", async () => {
    mockGetNearby.mockResolvedValueOnce([card("a"), card("b")]);
    const { getByLabelText } = renderScreen();

    await waitFor(() => expect(getByLabelText("Pass").props.accessibilityState?.disabled).toBeFalsy());
    fireEvent.press(getByLabelText("Pass")); // swipe away "a" -> current is "b", Undo enabled
    await waitFor(() => expect(getByLabelText("Undo").props.accessibilityState?.disabled).toBeFalsy());

    // Second deck still contains "b" (now at a different index) — this is
    // exactly the case that used to leave stale history behind. A fallback
    // beyond that covers any incidental extra reload the effect graph fires.
    mockGetNearby.mockResolvedValueOnce([card("b"), card("c")]).mockResolvedValue([card("b"), card("c")]);
    act(() => {
      useSession.getState().setFilters({
        categories: ["thai"],
        radiusM: 1000,
        openNow: false,
        minRating: 0,
        priceLevels: [],
        sort: "near",
      });
    });

    await waitFor(() => expect(getByLabelText("Undo").props.accessibilityState?.disabled).toBeTruthy());
  }, 30000);
});
