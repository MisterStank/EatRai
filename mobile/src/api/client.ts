const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export type Lang = "en" | "th";

export type PriceRange = { start?: number; end?: number; currency: string };

export type Card = {
  id: string;
  name: string;
  address: string;
  priceLevel: number; // 0..4 — kept for the price filter, not displayed
  priceRange?: PriceRange | null;
  rating: number;
  ratingCount: number;
  photoUrls: string[];
  cuisines: string[];
  distanceM: number;
  openNow: boolean;
  openKnown: boolean;
  mapsUri: string;
};

// Place is the detail view — a superset of Card, from /place (Google Place Details).
export type Place = Card & {
  phone: string;
  website: string;
  summary: string;
  weekdayHours: string[]; // e.g. ["Monday: 9 AM – 10 PM", ...]
};

export type SortMode = "near" | "match";

export type NearbyOpts = {
  radiusM?: number;
  categories?: string[];
  openNow?: boolean;
  minRating?: number;
  priceLevels?: number[];
  sort?: SortMode;
  lang?: Lang;
  signal?: AbortSignal;
};

async function readError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}) as any);
  if (res.status === 429) return new Error("TOO_MANY");
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function getNearby(lat: number, lng: number, opts: NearbyOpts = {}): Promise<Card[]> {
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (opts.radiusM) p.set("radius", String(opts.radiusM));
  if (opts.categories && opts.categories.length) p.set("categories", opts.categories.join(","));
  if (opts.openNow) p.set("openNow", "true");
  if (opts.minRating) p.set("minRating", String(opts.minRating));
  if (opts.priceLevels && opts.priceLevels.length) p.set("priceLevels", opts.priceLevels.join(","));
  if (opts.sort === "match") p.set("sort", "match");
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);

  const res = await fetch(`${BASE}/nearby?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) throw await readError(res, "Couldn't load restaurants");
  const data = (await res.json()) as { cards: Card[] };
  return data.cards ?? [];
}

export async function getPlace(
  id: string,
  opts: { lang?: Lang; lat?: number; lng?: number; signal?: AbortSignal } = {},
): Promise<Place> {
  const p = new URLSearchParams({ id });
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
  if (opts.lat != null && opts.lng != null) {
    p.set("lat", String(opts.lat));
    p.set("lng", String(opts.lng));
  }
  const res = await fetch(`${BASE}/place?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) throw await readError(res, "Couldn't load that place");
  return (await res.json()) as Place;
}

// getList resolves a shared list of place IDs in one request (server-side
// batched, cheaper field mask). Returns Cards, not full Places.
export async function getList(
  ids: string[],
  opts: { lang?: Lang; signal?: AbortSignal } = {},
): Promise<Card[]> {
  if (!ids.length) return [];
  const p = new URLSearchParams({ ids: ids.slice(0, 25).join(",") });
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
  const res = await fetch(`${BASE}/list?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) throw await readError(res, "Couldn't load that list");
  const data = (await res.json()) as { places: Card[] };
  return data.places ?? [];
}

export type GeoResult = { lat: number; lng: number; label: string };

export type Suggestion = { placeId: string; primaryText: string; secondaryText: string };

// suggest returns type-ahead predictions, biased to (lat,lng). `token` is a
// per-search session UUID — pass the same one to geocode() when the user picks.
export async function suggest(
  q: string,
  opts: { token: string; lat?: number; lng?: number; lang?: Lang; signal?: AbortSignal },
): Promise<Suggestion[]> {
  if (q.trim().length < 2) return [];
  const p = new URLSearchParams({ q, token: opts.token });
  if (opts.lat != null && opts.lng != null) {
    p.set("lat", String(opts.lat));
    p.set("lng", String(opts.lng));
  }
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
  const res = await fetch(`${BASE}/suggest?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) return [];
  return ((await res.json()) as { suggestions: Suggestion[] }).suggestions ?? [];
}

// geocode resolves either a free-text area ("Thonglor") or an autocomplete
// placeId (with its session token) to a point + label.
export async function geocode(
  q: string,
  opts: { placeId?: string; token?: string; lang?: Lang; signal?: AbortSignal } = {},
): Promise<GeoResult> {
  const p = new URLSearchParams();
  if (opts.placeId) {
    p.set("placeId", opts.placeId);
    if (opts.token) p.set("token", opts.token);
  } else {
    p.set("q", q);
  }
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
  const res = await fetch(`${BASE}/geocode?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) throw await readError(res, "Couldn't find that place");
  return (await res.json()) as GeoResult;
}

// reverseGeocode turns a map-pin coordinate into a short area label. Soft-fails
// to an empty label — the pin still works without one.
export async function reverseGeocode(
  lat: number,
  lng: number,
  opts: { lang?: Lang; signal?: AbortSignal } = {},
): Promise<{ label: string }> {
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
  const res = await fetch(`${BASE}/reverse?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) return { label: "" };
  return (await res.json()) as { label: string };
}
