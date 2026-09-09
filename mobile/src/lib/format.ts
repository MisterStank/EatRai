import type { Lang, PriceRange } from "../api/client";

export const fmtDistance = (m: number, lang: Lang = "en"): string => {
  const km = lang === "th" ? "กม." : "km";
  const meter = lang === "th" ? "ม." : "m";
  return m < 950
    ? `${Math.max(10, Math.round(m / 10) * 10)} ${meter}`
    : `${(m / 1000).toFixed(1)} ${km}`;
};

const CURRENCY_SYMBOL: Record<string, string> = {
  THB: "฿", USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", KRW: "₩",
  VND: "₫", SGD: "S$", MYR: "RM", IDR: "Rp", PHP: "₱", INR: "₹",
  AUD: "A$", NZD: "NZ$", HKD: "HK$", TWD: "NT$", CHF: "CHF ", CAD: "C$",
};

// fmtPriceRange renders Google's per-person spend band: "฿100–300", "฿100+".
// Empty string when there is no range — the app shows nothing rather than the
// old ฿-dot approximation.
export const fmtPriceRange = (pr?: PriceRange | null): string => {
  if (!pr) return "";
  const sym = CURRENCY_SYMBOL[pr.currency] ?? (pr.currency ? `${pr.currency} ` : "");
  const n = (v: number) => v.toLocaleString("en-US");
  if (pr.start && pr.end) return `${sym}${n(pr.start)}–${n(pr.end)}`;
  if (pr.start) return `${sym}${n(pr.start)}+`;
  if (pr.end) return `${sym}${n(pr.end)}`;
  return "";
};

// fmtPriceBand labels a Google price level (1–4) as an approximate per-person
// THB band, for the filter chips. The filter itself still selects by level —
// these are just friendlier names than ฿ / ฿฿ / ฿฿฿ / ฿฿฿฿.
export const fmtPriceBand = (level: number): string => {
  switch (level) {
    case 1:
      return "฿1–100";
    case 2:
      return "฿100–250";
    case 3:
      return "฿250–500";
    case 4:
      return "฿500+";
    default:
      return "฿".repeat(Math.max(1, level));
  }
};

// haversineM is the great-circle distance in metres between two coordinates.
// Returns 0 when the origin is the null-island default so a missing user
// location never renders an 11,000 km distance.
export const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  if (lat1 === 0 && lng1 === 0) return 0;
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    0.5 -
    Math.cos((lat2 - lat1) * p) / 2 +
    (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lng2 - lng1) * p))) / 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
};

export const fmtCuisines = (c: string[]): string => c.slice(0, 3).join(" · ");

export const fmtRating = (r: number): string => (r > 0 ? r.toFixed(1) : "");

export const fmtCount = (n: number, lang: Lang = "en"): string =>
  lang === "th" ? `${n.toLocaleString("th-TH")}` : n.toLocaleString("en-US");
