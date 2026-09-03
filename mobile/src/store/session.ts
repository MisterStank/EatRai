import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Card, Lang } from "../api/client";

// Session + on-device state. Persisted to this device only (AsyncStorage on
// native, localStorage on web) — no account, nothing leaves the phone, lost if
// the app is deleted or the list is cleared.

type SessionState = {
  lang: Lang;
  categories: string[];
  radiusM: number;
  openNow: boolean;
  liked: Card[];
  hydrated: boolean;

  setLang: (lang: Lang) => void;
  setFilters: (f: { categories: string[]; radiusM: number; openNow: boolean }) => void;
  addLiked: (c: Card) => void;
  removeLiked: (id: string) => void;
  clearLiked: () => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      lang: "en",
      categories: [],
      radiusM: 1000,
      openNow: false,
      liked: [],
      hydrated: false,

      setLang: (lang) => set({ lang }),
      setFilters: ({ categories, radiusM, openNow }) => set({ categories, radiusM, openNow }),
      addLiked: (c) =>
        set((s) => (s.liked.some((x) => x.id === c.id) ? s : { liked: [...s.liked, c] })),
      removeLiked: (id) => set((s) => ({ liked: s.liked.filter((x) => x.id !== id) })),
      clearLiked: () => set({ liked: [] }),
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
      }),
      onRehydrateStorage: () => () => {
        useSession.setState({ hydrated: true });
      },
    },
  ),
);

export const filterCount = (s: Pick<SessionState, "categories" | "openNow">): number =>
  s.categories.length + (s.openNow ? 1 : 0);
