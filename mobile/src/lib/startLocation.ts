// A web deep-link entry point: the Part 15 SEO pages
// (docs/COST_AND_MONETIZATION_PLAN.md) link to
// `https://eatrai.help/?lat=<>&lng=<>&area=<name>`. When present, the deck
// opens at that area instead of asking for GPS. Read once, on mount.

export type StartLocation = { lat: number; lng: number; label?: string };

export function readStartLocation(): StartLocation | null {
  try {
    const search = typeof window !== "undefined" ? window.location?.search : "";
    if (!search) return null;
    const p = new URLSearchParams(search);
    const lat = parseFloat(p.get("lat") ?? "");
    const lng = parseFloat(p.get("lng") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const area = p.get("area");
    return { lat, lng, label: area ? area.trim() || undefined : undefined };
  } catch {
    return null;
  }
}
