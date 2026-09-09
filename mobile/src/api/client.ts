import { radiusBucket, snap } from "../lib/grid";
import { haversineM } from "../lib/format";
import { clientId } from "../lib/clientId";

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
  location?: { lat: number; lng: number }; // present from /nearby & /place; absent on older persisted cards
  distanceM: number; // 0 from /nearby (client fills it from location + true position)
  openNow: boolean;
  openKnown: boolean;
  mapsUri: string;
};

const NEARBY_BUCKET_DEFAULT_M = 5000;

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
  // Called once with response metadata — `degraded` is the X-EatRai-Degraded
  // header ("stale" | "mock") when the server is serving cached/synthetic data.
  onMeta?: (meta: { degraded: string | null }) => void;
};

async function readError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}) as any);
  if (res.status === 429) return new Error("TOO_MANY");
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

const matchScore = (c: Card): number => c.rating * Math.log10(c.ratingCount + 10);

// getNearby: the server call is now keyed only on (grid cell, cuisine, radius
// bucket, lang). Everything else — multi-cuisine merge, radius/rating/price/
// open-now filtering, sort, and the exact distance — happens here on the client.
// See docs/COST_AND_MONETIZATION_PLAN.md Part 3.
export async function getNearby(lat: number, lng: number, opts: NearbyOpts = {}): Promise<Card[]> {
  const cell = { lat: snap(lat), lng: snap(lng) };
  const radiusM = opts.radiusM && opts.radiusM > 0 ? opts.radiusM : NEARBY_BUCKET_DEFAULT_M;
  const bucket = radiusBucket(radiusM);
  // One request per selected cuisine (each independently edge-cached); no
  // cuisine selected → a single generic search.
  const cuisines: (string | undefined)[] =
    opts.categories && opts.categories.length ? opts.categories : [undefined];

  const results = await Promise.all(
    cuisines.map((cuisine) => {
      const p = new URLSearchParams({ lat: String(cell.lat), lng: String(cell.lng) });
      if (cuisine) p.set("cuisine", cuisine);
      if (bucket !== NEARBY_BUCKET_DEFAULT_M) p.set("radius", String(bucket));
      if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
      return fetchCards(`${BASE}/nearby?${p.toString()}`, opts.signal);
    }),
  );

  if (opts.onMeta) {
    const degraded = results.map((r) => r.degraded).find((d): d is string => !!d) ?? null;
    opts.onMeta({ degraded });
  }

  // merge + de-dupe by id
  const byId = new Map<string, Card>();
  for (const r of results) {
    for (const c of r.cards) if (!byId.has(c.id)) byId.set(c.id, c);
  }

  const cards: Card[] = [];
  for (const c of byId.values()) {
    // Server left distance for us (0) and gave us the place location →
    // compute it from the user's *true* position, not the snapped cell.
    const distanceM =
      c.distanceM === 0 && c.location && (c.location.lat !== 0 || c.location.lng !== 0)
        ? haversineM(lat, lng, c.location.lat, c.location.lng)
        : c.distanceM;
    const card = { ...c, distanceM };

    if (distanceM > radiusM) continue; // 0 (unknown) always passes
    if (opts.minRating && card.rating < opts.minRating) continue;
    if (
      opts.priceLevels &&
      opts.priceLevels.length &&
      card.priceLevel !== 0 && // unknown price passes, never excluded
      !opts.priceLevels.includes(card.priceLevel)
    ) {
      continue;
    }
    if (opts.openNow && card.openKnown && !card.openNow) continue;
    cards.push(card);
  }

  cards.sort(
    opts.sort === "match"
      ? (a, b) => matchScore(b) - matchScore(a)
      : (a, b) => a.distanceM - b.distanceM,
  );
  return cards;
}

async function fetchCards(
  url: string,
  signal?: AbortSignal,
): Promise<{ cards: Card[]; degraded: string | null }> {
  const res = await fetch(url, { signal, headers: { "X-EatRai-Client": clientId() } });
  if (!res.ok) throw await readError(res, "Couldn't load restaurants");
  const data = (await res.json()) as { cards: Card[] };
  let degraded: string | null = null;
  try {
    degraded = (res.headers as { get?: (k: string) => string | null } | undefined)?.get?.("X-EatRai-Degraded") ?? null;
  } catch {
    // test doubles / odd runtimes may not expose headers
  }
  return { cards: data.cards ?? [], degraded };
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
  opts: { lang?: Lang; lat?: number; lng?: number; signal?: AbortSignal } = {},
): Promise<Card[]> {
  if (!ids.length) return [];
  const p = new URLSearchParams({ ids: ids.slice(0, 25).join(",") });
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
  if (opts.lat != null && opts.lng != null) {
    p.set("lat", String(opts.lat));
    p.set("lng", String(opts.lng));
  }
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
