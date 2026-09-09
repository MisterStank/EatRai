import type { AdSlot } from "../components/AdCard";

// All the AdSense / TipMe build-time config in one place, so tests can
// `jest.mock("../lib/adsConfig", ...)` — `babel-preset-expo` inlines
// `process.env.EXPO_PUBLIC_*` at transform time, so setting it at test runtime
// wouldn't take. See docs/COST_AND_MONETIZATION_PLAN.md Part 11.

export const ADSENSE_CLIENT: string | undefined = process.env.EXPO_PUBLIC_ADSENSE_CLIENT;

const SLOT: Record<AdSlot, string | undefined> = {
  deck: process.env.EXPO_PUBLIC_ADSENSE_SLOT_DECK,
  detail: process.env.EXPO_PUBLIC_ADSENSE_SLOT_DETAIL,
  done: process.env.EXPO_PUBLIC_ADSENSE_SLOT_DONE,
  seo: process.env.EXPO_PUBLIC_ADSENSE_SLOT_SEO,
};

export const adSlotId = (slot: AdSlot): string | undefined => SLOT[slot];

// The in-deck ad only mounts when both the client and the deck slot are set.
export const deckAdsEnabled = (): boolean => !!ADSENSE_CLIENT && !!SLOT.deck;

export const TIPME_URL: string | undefined = process.env.EXPO_PUBLIC_TIPME_URL;
