const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export type Lang = "en" | "th";

export type Card = {
  id: string;
  name: string;
  address: string;
  priceLevel: number; // 0..4
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

export type NearbyOpts = {
  radiusM?: number;
  categories?: string[];
  openNow?: boolean;
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

// geocode resolves a free-text area ("Thonglor", "Siam Paragon") to a point.
export async function geocode(
  q: string,
  opts: { lang?: Lang; signal?: AbortSignal } = {},
): Promise<GeoResult> {
  const p = new URLSearchParams({ q });
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);
  const res = await fetch(`${BASE}/geocode?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) throw await readError(res, "Couldn't find that place");
  return (await res.json()) as GeoResult;
}
