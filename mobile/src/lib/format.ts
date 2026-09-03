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

export const fmtCuisines = (c: string[]): string => c.slice(0, 3).join(" · ");

export const fmtRating = (r: number): string => (r > 0 ? r.toFixed(1) : "");

export const fmtCount = (n: number, lang: Lang = "en"): string =>
  lang === "th" ? `${n.toLocaleString("th-TH")}` : n.toLocaleString("en-US");
