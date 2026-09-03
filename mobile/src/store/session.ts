import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Card, Lang } from "../api/client";

// Session + on-device state. Persisted to this device only (AsyncStorage on
// native, localStorage on web) — no account, nothing leaves the phone, lost if
// the app is deleted or the list is cleared.

export const DEFAULT_RADIUS_M = 1000;

type SessionState = {
  lang: Lang;
  categories: string[];
  radiusM: number;
  openNow: boolean;
  liked: Card[];
  hintSeen: boolean;
  hydrated: boolean;

  setLang: (lang: Lang) => void;
  setFilters: (f: { categories: string[]; radiusM: number; openNow: boolean }) => void;
  addLiked: (c: Card) => void;
  removeLiked: (id: string) => void;
  clearLiked: () => void;
  markHintSeen: () => void;
  markHydrated: () => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      lang: "en",
      categories: [],
      radiusM: DEFAULT_RADIUS_M,
      openNow: false,
      liked: [],
      hintSeen: false,
      hydrated: false,

      setLang: (lang) => set({ lang }),
      setFilters: ({ categories, radiusM, openNow }) => set({ categories, radiusM, openNow }),
      addLiked: (c) =>
        set((s) => (s.liked.some((x) => x.id === c.id) ? s : { liked: [...s.liked, c] })),
      removeLiked: (id) => set((s) => ({ liked: s.liked.filter((x) => x.id !== id) })),
      clearLiked: () => set({ liked: [] }),
      markHintSeen: () => set({ hintSeen: true }),
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
        liked: s.liked,
        hintSeen: s.hintSeen,
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
  s: Pick<SessionState, "categories" | "openNow" | "radiusM">,
): number =>
  s.categories.length + (s.openNow ? 1 : 0) + (s.radiusM !== DEFAULT_RADIUS_M ? 1 : 0);
