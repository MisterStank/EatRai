// Package grid snaps a coordinate to a fixed geographic grid so that many
// slightly-different nearby requests collapse onto a single cache key (and a
// single Google call). The pitch and the snap/bucket functions are mirrored in
// mobile/src/lib/grid.ts — keep them identical; both sides are parity-tested
// against mobile/src/lib/grid-cases.json. See docs/COST_AND_MONETIZATION_PLAN.md
// Part 2.
package grid

import "math"

// Deg is the grid pitch in degrees (~330 m at Bangkok's latitude), applied on
// both the lat and lng axes.
const Deg = 0.003

// Snap rounds a latitude or longitude to the nearest grid line. The result is
// rounded to 6 decimal places (~0.1 m) so floating-point noise never leaks into
// a cache key or a URL query string.
func Snap(v float64) float64 {
	cell := math.Round(v / Deg)
	return math.Round(cell*Deg*1e6) / 1e6
}

// RadiusBucket collapses an arbitrary requested radius (metres) to one of a few
// fixed values, so that widening a search doesn't multiply the number of cache
// keys / Google calls.
func RadiusBucket(r float64) int {
	switch {
	case r <= 5000:
		return 5000
	case r <= 10000:
		return 10000
	case r <= 20000:
		return 20000
	default:
		return 50000
	}
}
