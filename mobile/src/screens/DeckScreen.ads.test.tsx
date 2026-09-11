import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import type { Card } from "../api/client";

// Force one ad sentinel after the first real card, regardless of build config /
// Platform — isolates the DeckScreen ad wiring from the env-gating that
// deckAds.test.ts and AdCard.test.tsx already cover.
jest.mock("../lib/deckAds", () => ({
  ...jest.requireActual("../lib/deckAds"),
  spliceAds: (deck: Card[]) => {
    const out: unknown[] = [];
    deck.forEach((c, i) => {
      out.push(c);
      if (i === 0) out.push({ id: "__ad_x", isAd: true });
    });
    return out;
  },
}));

const mockOpenExternal = jest.fn();
jest.mock("../lib/linking", () => ({ openExternal: (...a: unknown[]) => mockOpenExternal(...a) }));

const mockGetNearby = jest.fn();
jest.mock("../api/client", () => ({
  ...jest.requireActual("../api/client"),
  getNearby: (...args: unknown[]) => mockGetNearby(...args),
  reverseGeocode: () => Promise.resolve({ label: "" }),
}));

import { DeckScreen } from "./DeckScreen";
import { useSession, DEFAULT_RADIUS_M } from "../store/session";

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

beforeEach(() => {
  mockGetNearby.mockReset();
  mockOpenExternal.mockReset();
});

function renderScreen() {
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
    hintSeen: true,
    guideSeen: true,
    hydrated: true,
  });
  return render(
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <DeckScreen />
    </SafeAreaProvider>,
  );
}

describe("DeckScreen — ads", () => {
  test("an ad card sits in the deck but is not a restaurant / not likeable", async () => {
    mockGetNearby.mockResolvedValue([card("a"), card("b")]);
    const { getByLabelText, queryByLabelText, getAllByLabelText } = renderScreen();

    await waitFor(
      () => expect(getByLabelText("Like").props.accessibilityState?.disabled).toBeFalsy(),
      { timeout: 30000 },
    );

    // like "a" → deck advances to the ad sentinel
    await act(async () => {
      fireEvent.press(getByLabelText("Like"));
    });

    // action bar stays visible, but relabelled: ✕/♡ both just skip the ad
    await waitFor(() => expect(queryByLabelText("Like")).toBeNull(), { timeout: 30000 });
    expect(getAllByLabelText("Skip ad")).toHaveLength(2);
    expect(getByLabelText("Support the developer")).toBeTruthy();

    // tapping skip advances past the ad without touching liked state
    await act(async () => {
      fireEvent.press(getAllByLabelText("Skip ad")[0]);
    });
    await waitFor(() => expect(getByLabelText("Like")).toBeTruthy(), { timeout: 30000 });

    // the ad swipe was not recorded as a like
    expect(useSession.getState().liked.map((l) => l.id)).toEqual(["a"]);
  }, 60000);

  test("the ad card's 4th button opens /support, not directions", async () => {
    mockGetNearby.mockResolvedValue([card("a"), card("b")]);
    const { getByLabelText } = renderScreen();

    await waitFor(
      () => expect(getByLabelText("Like").props.accessibilityState?.disabled).toBeFalsy(),
      { timeout: 30000 },
    );
    await act(async () => {
      fireEvent.press(getByLabelText("Like"));
    });
    await waitFor(() => expect(getByLabelText("Support the developer")).toBeTruthy(), {
      timeout: 30000,
    });

    fireEvent.press(getByLabelText("Support the developer"));
    expect(mockOpenExternal).toHaveBeenCalledWith("https://eatrai.help/support");
  }, 60000);

  test('the "Support the developer" menu row opens the /support page', async () => {
    mockGetNearby.mockResolvedValue([card("a")]);
    const { getByLabelText, getByText } = renderScreen();
    await waitFor(
      () => expect(getByLabelText("Like").props.accessibilityState?.disabled).toBeFalsy(),
      { timeout: 30000 },
    );

    act(() => {
      fireEvent.press(getByLabelText("Menu"));
    });
    fireEvent.press(getByText("Support the developer"));

    expect(mockOpenExternal).toHaveBeenCalledWith("https://eatrai.help/support");
  }, 60000);
});
