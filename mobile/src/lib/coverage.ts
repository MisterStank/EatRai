import { haversineM } from "./format";

// EatRai only has real restaurant data in these metros (docs/COST_AND_MONETIZATION_PLAN.md
// Part 13.5 / 14). This list is the single source of truth for both the in-app
// out-of-coverage notice and the "Where EatRai works" list. Radii are deliberately
// generous — a false "in range" is harmless, a false "out of range" scares off a real user.

export type Area = {
  key: string;
  en: string;
  th: string;
  lat: number;
  lng: number;
  radiusKm: number;
};

export const AREAS: Area[] = [
  { key: "bangkok", en: "Bangkok", th: "กรุงเทพฯ", lat: 13.75, lng: 100.52, radiusKm: 55 }, // + Nonthaburi / Samut Prakan / Pathum Thani
  { key: "chiangmai", en: "Chiang Mai", th: "เชียงใหม่", lat: 18.79, lng: 98.99, radiusKm: 20 },
  { key: "chonburi", en: "Pattaya / Chonburi", th: "พัทยา / ชลบุรี", lat: 13.15, lng: 100.92, radiusKm: 35 },
  { key: "korat", en: "Nakhon Ratchasima", th: "นครราชสีมา", lat: 14.97, lng: 102.1, radiusKm: 18 },
  { key: "khonkaen", en: "Khon Kaen", th: "ขอนแก่น", lat: 16.44, lng: 102.83, radiusKm: 16 },
  { key: "udon", en: "Udon Thani", th: "อุดรธานี", lat: 17.41, lng: 102.79, radiusKm: 16 },
  { key: "songkhla", en: "Songkhla / Hat Yai", th: "สงขลา / หาดใหญ่", lat: 7.01, lng: 100.47, radiusKm: 30 }, // whole province
  { key: "phuket", en: "Phuket", th: "ภูเก็ต", lat: 7.95, lng: 98.34, radiusKm: 25 }, // whole island
  { key: "surat", en: "Surat Thani", th: "สุราษฎร์ธานี", lat: 9.14, lng: 99.33, radiusKm: 16 },
  { key: "nakhonsi", en: "Nakhon Si Thammarat", th: "นครศรีธรรมราช", lat: 8.43, lng: 99.96, radiusKm: 16 },
];

// inCoverage returns the nearest area whose radius contains (lat, lng), or null.
export function inCoverage(lat: number, lng: number): Area | null {
  if (lat === 0 && lng === 0) return null;
  let best: Area | null = null;
  let bestD = Infinity;
  for (const a of AREAS) {
    const d = haversineM(a.lat, a.lng, lat, lng);
    if (d <= a.radiusKm * 1000 && d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

// areaName renders an area in the given language.
export const areaName = (a: Area, lang: "en" | "th"): string => (lang === "th" ? a.th : a.en);

// coverageHeadline is the short list shown in the out-of-coverage banner.
export const coverageHeadline = (lang: "en" | "th"): string =>
  ["bangkok", "chiangmai", "phuket"]
    .map((k) => areaName(AREAS.find((a) => a.key === k) as Area, lang))
    .join(", ");
