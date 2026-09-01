import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { clearTokens, devSignIn, getMe, loadTokens, signIn, type Me } from "../api/client";

type AuthState = {
  status: "loading" | "signedOut" | "signedIn";
  me: Me | null;
  bootstrap: () => Promise<void>;
  signInWith: (
    provider: "google" | "apple",
    idToken: string,
    opts?: { nonce?: string; fullName?: string },
  ) => Promise<void>;
  devSignIn: (handle: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  me: null,

  bootstrap: async () => {
    await loadTokens();
    const hasRefresh = await SecureStore.getItemAsync("refreshToken");
    if (!hasRefresh) return set({ status: "signedOut" });
    try {
      const me = await getMe();
      set({ status: "signedIn", me });
    } catch {
      set({ status: "signedOut" });
    }
  },

  signInWith: async (provider, idToken, opts) => {
    await signIn(provider, idToken, opts);
    const me = await getMe();
    set({ status: "signedIn", me });
  },

  devSignIn: async (handle: string) => {
    await devSignIn(handle);
    set({ status: "signedIn", me: await getMe() });
  },

  refreshMe: async () => {
    try {
      set({ me: await getMe() });
    } catch {
      /* keep last known */
    }
  },

  signOut: async () => {
    await clearTokens();
    set({ status: "signedOut", me: null });
  },
}));
