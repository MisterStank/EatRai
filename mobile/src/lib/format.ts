import type { Lang } from "../api/client";

export const fmtDistance = (m: number, lang: Lang = "en"): string => {
  const km = lang === "th" ? "กม." : "km";
  const meter = lang === "th" ? "ม." : "m";
  return m < 950
    ? `${Math.max(10, Math.round(m / 10) * 10)} ${meter}`
    : `${(m / 1000).toFixed(1)} ${km}`;
};

export const fmtPrice = (level: number): string => (level > 0 ? "฿".repeat(level) : "");

export const fmtCuisines = (c: string[]): string => c.slice(0, 3).join(" · ");

export const fmtRating = (r: number): string => (r > 0 ? r.toFixed(1) : "");

export const fmtCount = (n: number, lang: Lang = "en"): string =>
  lang === "th" ? `${n.toLocaleString("th-TH")}` : n.toLocaleString("en-US");
