import React from "react";
import { render, waitFor, fireEvent, act } from "@testing-library/react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import type { Card } from "../api/client";

// Same forced-ad-sentinel trick as DeckScreen.ads.test.tsx, but deliberately
// leaves deckAdsEnabled() at its real (unconfigured-in-tests) value of false —
// this is the "house-content filler, no real ad yet" state, Part 11.1f.
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

describe("DeckScreen — ad slot before AdSense is configured", () => {
  test("the Skip button has no countdown lock — it's ready immediately", async () => {
    mockGetNearby.mockResolvedValue([card("a"), card("b")]);
    const { getByLabelText } = renderScreen();

    await waitFor(
      () => expect(getByLabelText("Like").props.accessibilityState?.disabled).toBeFalsy(),
      { timeout: 30000 },
    );

    await act(async () => {
      fireEvent.press(getByLabelText("Like"));
    });

    // no dwell lock on house-content filler — ready right away, no countdown label
    await waitFor(() => expect(getByLabelText("Skip ad")).toBeTruthy(), { timeout: 30000 });
    expect(getByLabelText("Skip ad").props.accessibilityState?.disabled).toBeFalsy();
  }, 60000);
});
