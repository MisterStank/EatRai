import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { DeckScreen } from "./DeckScreen";
import { useSession, DEFAULT_RADIUS_M } from "../store/session";
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

beforeEach(() => {
  mockGetNearby.mockReset();
});

function renderScreen() {
  // Full reset, not a partial one — the store is a module-level singleton
  // shared across every test in this file, so a prior test's filter/lang/
  // liked-list changes would otherwise leak into the next test.
  useSession.setState({
    lang: "en",
    categories: [],
    radiusM: DEFAULT_RADIUS_M,
    openNow: false,
    minRating: 0,
    priceLevels: [],
    sort: "near",
    liked: [],
    recentAreas: [],
    hintSeen: true, // skip the swipe hint so it doesn't cover the deck
    guideSeen: true, // skip the first-run guide prompt, same reason
    hydrated: true,
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

  // Regression: switching the display language re-ran `load()` (lang was in
  // its dependency array), refetching and resetting the user's position in
  // the deck. The fix drops lang from that dependency list — card labels lag
  // behind the UI language until the next real reload, but the deck itself
  // (and swipe progress) is untouched.
  test("switching display language doesn't refetch or reset the deck", async () => {
    mockGetNearby.mockResolvedValue([card("a"), card("b")]);
    const { getByLabelText } = renderScreen();

    await waitFor(() => expect(getByLabelText("Pass").props.accessibilityState?.disabled).toBeFalsy());
    expect(mockGetNearby).toHaveBeenCalledTimes(1);

    act(() => {
      useSession.getState().setLang("th");
    });

    // Give an (incorrect) reload a moment to fire before asserting it didn't.
    await new Promise((r) => setTimeout(r, 200));
    expect(mockGetNearby).toHaveBeenCalledTimes(1);
  }, 30000);

  // Regression: a liked card could reappear in the swipeable deck after any
  // reload that isn't a widen (filter change, new location) — `excluded`
  // (the widen-search seen-set) is either empty or gets cleared by those
  // reloads, and liked cards weren't otherwise protected. The fix always
  // filters the freshly-fetched deck against the current liked list too.
  test("a liked card never reappears in the deck after a filter-driven reload", async () => {
    mockGetNearby.mockResolvedValueOnce([card("a"), card("b")]);
    const { getByLabelText, queryByText } = renderScreen();

    await waitFor(() => expect(getByLabelText("Pass").props.accessibilityState?.disabled).toBeFalsy());
    fireEvent.press(getByLabelText("Like")); // like "a"; current becomes "b"

    // The new filtered search still turns up "a" (e.g. it's still in range) —
    // `excluded` never contained it, so only the liked-list filter can catch this.
    mockGetNearby.mockResolvedValueOnce([card("a"), card("c")]).mockResolvedValue([card("a"), card("c")]);
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

    await waitFor(() => expect(queryByText("Place c")).toBeTruthy());
    expect(queryByText("Place a")).toBeNull();
  }, 30000);
});
