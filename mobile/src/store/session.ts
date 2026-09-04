import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Card, Lang, SortMode } from "../api/client";

// Session + on-device state. Persisted to this device only (AsyncStorage on
// native, localStorage on web) — no account, nothing leaves the phone, lost if
// the app is deleted or the list is cleared.

export const DEFAULT_RADIUS_M = 1000;

export type RecentArea = { lat: number; lng: number; label: string };
const MAX_RECENT = 5;

export type FilterValue = {
  categories: string[];
  radiusM: number;
  openNow: boolean;
  minRating: number; // 0 = any
  priceLevels: number[]; // 1..4
  sort: SortMode;
};

type SessionState = FilterValue & {
  lang: Lang;
  liked: Card[];
  recentAreas: RecentArea[];
  hintSeen: boolean;
  guideSeen: boolean;
  hydrated: boolean;

  setLang: (lang: Lang) => void;
  setFilters: (f: FilterValue) => void;
  addLiked: (c: Card) => void;
  removeLiked: (id: string) => void;
  clearLiked: () => void;
  addRecentArea: (a: RecentArea) => void;
  markHintSeen: () => void;
  markGuideSeen: () => void;
  markHydrated: () => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      lang: "en",
      categories: [],
      radiusM: DEFAULT_RADIUS_M,
      openNow: false,
      minRating: 0,
      priceLevels: [],
      sort: "near",
      liked: [],
      recentAreas: [],
      hintSeen: false,
      guideSeen: false,
      hydrated: false,

      setLang: (lang) => set({ lang }),
      setFilters: ({ categories, radiusM, openNow, minRating, priceLevels, sort }) =>
        set({ categories, radiusM, openNow, minRating, priceLevels, sort }),
      addLiked: (c) =>
        set((s) => (s.liked.some((x) => x.id === c.id) ? s : { liked: [...s.liked, c] })),
      removeLiked: (id) => set((s) => ({ liked: s.liked.filter((x) => x.id !== id) })),
      clearLiked: () => set({ liked: [] }),
      addRecentArea: (a) =>
        set((s) => {
          const label = a.label.trim();
          if (!label) return s;
          const rest = s.recentAreas.filter((x) => x.label !== label);
          return { recentAreas: [{ ...a, label }, ...rest].slice(0, MAX_RECENT) };
        }),
      markHintSeen: () => set({ hintSeen: true }),
      markGuideSeen: () => set({ guideSeen: true }),
      markHydrated: () => set((s) => (s.hydrated ? s : { hydrated: true })),
    }),
    {
      name: "eatrai-session-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        lang: s.lang,
        categories: s.categories,
        radiusM: s.radiusM,
        openNow: s.openNow,
        minRating: s.minRating,
        priceLevels: s.priceLevels,
        sort: s.sort,
        liked: s.liked,
        recentAreas: s.recentAreas,
        hintSeen: s.hintSeen,
        guideSeen: s.guideSeen,
      }),
      onRehydrateStorage: () => () => {
        useSession.getState().markHydrated();
      },
    },
  ),
);

// Don't let a stuck or blocked storage layer (private mode, disabled storage)
// trap the app on the loading screen — proceed with defaults after a moment.
setTimeout(() => useSession.getState().markHydrated(), 2500);

export const filterCount = (
  s: Pick<SessionState, "categories" | "openNow" | "radiusM" | "minRating" | "priceLevels" | "sort">,
): number =>
  s.categories.length +
  (s.openNow ? 1 : 0) +
  (s.radiusM !== DEFAULT_RADIUS_M ? 1 : 0) +
  (s.minRating > 0 ? 1 : 0) +
  (s.priceLevels.length > 0 ? 1 : 0) +
  (s.sort !== "near" ? 1 : 0);
