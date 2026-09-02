export const fmtDistance = (m: number): string =>
  m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;

export const fmtPrice = (level: number): string => (level > 0 ? "฿".repeat(level) : "");

export const fmtCuisines = (c: string[]): string => c.slice(0, 3).join(" · ");

export const fmtRating = (r: number): string => (r > 0 ? r.toFixed(1) : "");
