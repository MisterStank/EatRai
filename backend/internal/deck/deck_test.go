package deck

import (
	"testing"

	"github.com/google/uuid"

	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/taste"
)

func feat(pairs map[string]float32) taste.Vec {
	var v taste.Vec
	for k, val := range pairs {
		if i := taste.Index(k); i >= 0 {
			v[i] = val
		}
	}
	return v.Normalized()
}

func cand(name string, f taste.Vec, dist float64) db.Candidate {
	return db.Candidate{
		Restaurant: db.Restaurant{ID: uuid.New(), Name: name, Rating: 4.3, PhotoURLs: []string{"x"}},
		DistanceM:  dist,
		Feature:    f,
	}
}

func TestRankSoloPutsBestMatchNearTop(t *testing.T) {
	core := feat(map[string]float32{"japanese_ramen": 1, "spicy": 0.5})
	in := SoloInput{
		Core: core, Blended: core, HasProfile: true, SwipeCount: 40,
		Candidates: []db.Candidate{
			cand("Pasta Place", feat(map[string]float32{"italian_pasta": 1}), 300),
			cand("Ramen Bar", feat(map[string]float32{"japanese_ramen": 1, "spicy": 0.4}), 900),
			cand("Steakhouse", feat(map[string]float32{"steakhouse": 1}), 200),
		},
	}
	cards := RankSolo(in)
	if cards[0].Name != "Ramen Bar" {
		t.Fatalf("expected Ramen Bar first, got %q", cards[0].Name)
	}
	if len(cards[0].Reasons) == 0 {
		t.Fatal("expected a 'because you love' reason on the top card")
	}
}

func TestRankSoloInjectsOneStretch(t *testing.T) {
	core := feat(map[string]float32{"japanese_ramen": 1})
	in := SoloInput{
		Core: core, Blended: core, HasProfile: true, SwipeCount: 40, WantStretch: true,
		Candidates: []db.Candidate{
			cand("Ramen A", feat(map[string]float32{"japanese_ramen": 1}), 100),
			cand("Ramen B", feat(map[string]float32{"japanese_ramen": 0.9, "spicy": 0.3}), 150),
			cand("Ethiopian", feat(map[string]float32{"ethiopian": 1, "japanese_ramen": 0.15}), 400),
		},
	}
	cards := RankSolo(in)
	n := 0
	for _, c := range cards {
		if c.IsStretch {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("expected exactly one stretch card, got %d", n)
	}
}
