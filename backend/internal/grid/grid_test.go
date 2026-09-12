package grid

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

// casesPath points at the canonical table that mobile/src/lib/grid.test.ts also
// reads, so the two implementations cannot drift.
const casesPath = "../../../mobile/src/lib/grid-cases.json"

type gridCases struct {
	Deg          float64                     `json:"deg"`
	Snap         []struct{ In, Out float64 } `json:"snap"`
	RadiusBucket []struct{ In, Out float64 } `json:"radiusBucket"`
}

func loadCases(t *testing.T) gridCases {
	t.Helper()
	b, err := os.ReadFile(casesPath)
	if err != nil {
		t.Fatalf("read shared parity table %s: %v", casesPath, err)
	}
	var c gridCases
	if err := json.Unmarshal(b, &c); err != nil {
		t.Fatalf("parse %s: %v", casesPath, err)
	}
	return c
}

func TestDegMatchesTable(t *testing.T) {
	if c := loadCases(t); c.Deg != Deg {
		t.Fatalf("Deg = %v, shared table says %v", Deg, c.Deg)
	}
}

func TestSnap(t *testing.T) {
	for _, tc := range loadCases(t).Snap {
		if got := Snap(tc.In); math.Abs(got-tc.Out) > 1e-6 {
			t.Errorf("Snap(%v) = %v, want %v", tc.In, got, tc.Out)
		}
	}
}

func TestRadiusBucket(t *testing.T) {
	for _, tc := range loadCases(t).RadiusBucket {
		if got := RadiusBucket(tc.In); got != int(tc.Out) {
			t.Errorf("RadiusBucket(%v) = %v, want %v", tc.In, got, int(tc.Out))
		}
	}
}
