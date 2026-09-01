import * as SecureStore from "expo-secure-store";

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

// --- types -----------------------------------------------------------

export type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };
export type Me = {
  user: { id: string; handle: string; displayName: string; avatarUrl: string };
  swipeCount: number;
  profileReady: boolean;
  palate: { key: string; label: string; kind: string; weight: number }[];
  mood: { more: string[]; less: string[] } | null;
  adventureStreak: number;
};

export type Card = {
  id: string;
  name: string;
  address: string;
  priceLevel: number;
  rating: number;
  ratingCount: number;
  photoUrls: string[];
  cuisines: string[];
  distanceM: number;
  matchScore: number;
  reasons?: string[];
  isStretch?: boolean;
  friendsLiked?: string[];
};

export type ConsensusCard = Omit<Card, "matchScore" | "reasons"> & {
  groupScore: number;
  likedBy: number;
};

export type Friend = {
  id: string;
  handle: string;
  displayName: string;
  status: "pending" | "accepted";
  incoming: boolean;
  compatibility: number;
  compatBasis: string;
};

export type Compatibility = {
  score: number;
  overlap: number;
  agreed: number;
  basis: string;
  bothLove: string[];
  neitherLikes: string[];
};

export type Direction = 1 | -1 | 2; // like | pass | superlike

// --- token plumbing ------------------------------------------------

let memAccess: string | null = null;

export async function loadTokens() {
  memAccess = await SecureStore.getItemAsync("accessToken");
}
async function setTokens(t: Tokens) {
  memAccess = t.accessToken;
  await SecureStore.setItemAsync("accessToken", t.accessToken);
  await SecureStore.setItemAsync("refreshToken", t.refreshToken);
}
export async function clearTokens() {
  memAccess = null;
  await SecureStore.deleteItemAsync("accessToken");
  await SecureStore.deleteItemAsync("refreshToken");
}

async function refresh(): Promise<boolean> {
  const rt = await SecureStore.getItemAsync("refreshToken");
  if (!rt) return false;
  const res = await fetch(`${BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) return false;
  const { tokens } = await res.json();
  await setTokens(tokens);
  return true;
}

async function req<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(memAccess ? { Authorization: `Bearer ${memAccess}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && retry && (await refresh())) {
    return req<T>(path, init, false);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${init.method ?? "GET"} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- endpoints ----------------------------------------------------

export async function signIn(
  provider: "google" | "apple",
  idToken: string,
  opts: { nonce?: string; fullName?: string } = {},
) {
  const res = await fetch(`${BASE}/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, idToken, ...opts }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error ?? "sign-in failed");
  }
  const data = (await res.json()) as { tokens: Tokens; user: Me["user"] };
  await setTokens(data.tokens);
  return data.user;
}

// dev-only: pairs with backend DEV_LOGIN=true
export async function devSignIn(handle: string) {
  const res = await fetch(`${BASE}/v1/auth/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  if (!res.ok) throw new Error("dev sign-in failed (is DEV_LOGIN=true?)");
  const data = (await res.json()) as { tokens: Tokens; user: Me["user"] };
  await setTokens(data.tokens);
  return data.user;
}

export const getMe = () => req<Me>("/v1/me");

export const getDeck = (lat: number, lng: number, radiusM = 2500) =>
  req<{ cards: Card[] }>(`/v1/deck?lat=${lat}&lng=${lng}&radiusM=${radiusM}`).then((r) => r.cards);

export const swipe = (
  restaurantId: string,
  direction: Direction,
  opts: { sessionId?: string; wasStretch?: boolean } = {},
) =>
  req<{ ok: true; adventureStreak?: number; match?: Card }>("/v1/swipes", {
    method: "POST",
    body: JSON.stringify({ restaurantId, direction, ...opts }),
  });

export const getLikes = () =>
  req<{ restaurants: Card[] }>("/v1/likes").then((r) => r.restaurants);

export const listFriends = () =>
  req<{ friends: Friend[] }>("/v1/friends").then((r) => r.friends);

export const addFriend = (handle: string) =>
  req<{ ok: true; sentTo: string }>("/v1/friends/requests", {
    method: "POST",
    body: JSON.stringify({ handle }),
  });

export const acceptFriend = (id: string) =>
  req<{ ok: true }>(`/v1/friends/${id}/accept`, { method: "POST" });

export const getCompatibility = (id: string) =>
  req<Compatibility>(`/v1/friends/${id}/compatibility`);

export const consensusDeck = (friendIds: string[], lat: number, lng: number, radiusM = 2500) =>
  req<{ cards: ConsensusCard[]; members: number }>("/v1/consensus", {
    method: "POST",
    body: JSON.stringify({ friendIds, lat, lng, radiusM }),
  });

export const createSession = (
  body: { mode: "live" | "async"; lat: number; lng: number; radiusM?: number; quorum?: number },
) => req<{ id: string; code: string; mode: string }>("/v1/sessions", {
  method: "POST",
  body: JSON.stringify(body),
});

export const joinSession = (code: string) =>
  req<{ id: string; code: string; mode: string }>(`/v1/sessions/${code}/join`, { method: "POST" });

export const sessionDeck = (id: string) =>
  req<{ cards: ConsensusCard[] }>(`/v1/sessions/${id}/deck`).then((r) => r.cards);

export const sessionState = (id: string) =>
  req<{ members: number; match?: Card }>(`/v1/sessions/${id}/state`);
