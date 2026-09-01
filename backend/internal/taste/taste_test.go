package taste

import "testing"

func vec(pairs map[string]float32) Vec {
	var v Vec
	for k, val := range pairs {
		if i := Index(k); i >= 0 {
			v[i] = val
		}
	}
	return v.Normalized()
}

func TestUpdateCoreMovesTowardLikes(t *testing.T) {
	thai := vec(map[string]float32{"thai_isaan": 1, "spicy": 0.6})
	var u Vec
	for i := 0; i < 6; i++ {
		u = UpdateCore(u, i, thai, 1)
	}
	if Cosine(u, thai) < 0.9 {
		t.Fatalf("core vector should align with liked cuisine, got %f", Cosine(u, thai))
	}
}

func TestUpdateRecentForgetsFasterThanCore(t *testing.T) {
	ramen := vec(map[string]float32{"japanese_ramen": 1})
	pizza := vec(map[string]float32{"neapolitan_pizza": 1})
	var core, recent Vec
	for i := 0; i < 20; i++ { // long ramen phase
		core = UpdateCore(core, i, ramen, 1)
		recent = UpdateRecent(recent, ramen, 1)
	}
	for i := 20; i < 30; i++ { // recent pizza binge
		core = UpdateCore(core, i, pizza, 1)
		recent = UpdateRecent(recent, pizza, 1)
	}
	if Cosine(recent, pizza) <= Cosine(core, pizza) {
		t.Fatalf("recent should track the pizza binge harder than core")
	}
}

func TestCompatibilityUsesAgreementWhenOverlapIsHigh(t *testing.T) {
	a := vec(map[string]float32{"thai_isaan": 1})
	b := vec(map[string]float32{"japanese_sushi": 1})
	low := Compatibility(a, b, 0, 0)
	high := Compatibility(a, b, 40, 38)
	if high <= low {
		t.Fatalf("observed agreement should lift score: low=%f high=%f", low, high)
	}
}

func TestConsensusProtectsTheOutlier(t *testing.T) {
	spicy := vec(map[string]float32{"thai_isaan": 1, "spicy": 1})
	// the outlier actively dislikes spice
	mild := vec(map[string]float32{"italian_pasta": 1, "spicy": -0.9})
	verySpicyPlace := vec(map[string]float32{"thai_isaan": 1, "spicy": 1})
	neutralPlace := vec(map[string]float32{"japanese_ramen": 0.5, "italian_pasta": 0.5})

	members := []Vec{spicy, mild}
	if ConsensusScore(members, neutralPlace, 0, 0) <= 0 {
		t.Fatal("neutral place should score for a mixed group")
	}
	if ConsensusScore(members, verySpicyPlace, 0, 0) >= ConsensusScore(members, neutralPlace, 0, 0) {
		t.Fatal("a place one member would hate must not win the group deck")
	}
	if ConsensusScore(members, neutralPlace, 0, 1) != 0 {
		t.Fatal("a place any member already passed must be dead")
	}
}

func TestExplainNamesSharedStrengths(t *testing.T) {
	u := vec(map[string]float32{"thai_isaan": 1, "spicy": 0.8, "cheap_eats": 0.5})
	feat := vec(map[string]float32{"thai_isaan": 1, "spicy": 0.7})
	got := Explain(u, feat, 3)
	if len(got) == 0 || got[0] != Label(Index("thai_isaan")) {
		t.Fatalf("expected isaan first, got %v", got)
	}
}
