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

export async function getNearby(lat: number, lng: number, opts: NearbyOpts = {}): Promise<Card[]> {
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (opts.radiusM) p.set("radius", String(opts.radiusM));
  if (opts.categories && opts.categories.length) p.set("categories", opts.categories.join(","));
  if (opts.openNow) p.set("openNow", "true");
  if (opts.lang && opts.lang !== "en") p.set("lang", opts.lang);

  const res = await fetch(`${BASE}/nearby?${p.toString()}`, { signal: opts.signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Couldn't load restaurants (${res.status})`);
  }
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Couldn't load that place (${res.status})`);
  }
  return (await res.json()) as Place;
}
