// Snaps a coordinate to a fixed geographic grid so many slightly-different
// nearby requests collapse onto one server cache key / edge-cache entry / Google
// call. Mirrored in backend/internal/grid/grid.go — keep identical; both sides
// are parity-tested against ./grid-cases.json. See
// docs/COST_AND_MONETIZATION_PLAN.md Part 2.

// Grid pitch in degrees (~330 m at Bangkok's latitude), on both axes.
export const DEG = 0.003;

// snap rounds a lat or lng to the nearest grid line, cleaned to 6 decimal places
// (~0.1 m) so floating-point noise never reaches a URL query string.
export function snap(v: number): number {
  const cell = Math.round(v / DEG);
  return Math.round(cell * DEG * 1e6) / 1e6;
}

// radiusBucket collapses an arbitrary radius (metres) to one of a few fixed
// values so widening a search doesn't multiply cache keys.
export function radiusBucket(r: number): number {
  if (r <= 5000) return 5000;
  if (r <= 10000) return 10000;
  if (r <= 20000) return 20000;
  return 50000;
}
