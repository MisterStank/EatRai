// Package deck turns a pool of nearby candidates into an ordered swipe deck.
//
// Solo deck ranking = taste match + a light popularity prior + early-stage
// exploration + cuisine diversity (so you don't get five ramen shops in a
// row) + one optional "stretch" card that deliberately sits outside your
// comfort zone.
package deck

import (
	"math"
	"math/rand"
	"sort"

	"github.com/google/uuid"

	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/taste"
)

type Card struct {
	db.Restaurant
	DistanceM    float64  `json:"distanceM"`
	MatchScore   float64  `json:"matchScore"`          // 0..100 vs. the requester
	Reasons      []string `json:"reasons,omitempty"`   // "Because you love ..."
	IsStretch    bool     `json:"isStretch,omitempty"` // out-of-comfort pick
	FriendsLiked []string `json:"friendsLiked,omitempty"`
}

type SoloInput struct {
	UserID       uuid.UUID
	Core         taste.Vec
	HasProfile   bool
	Blended      taste.Vec // core+recent
	SwipeCount   int
	Candidates   []db.Candidate
	FriendsLiked map[uuid.UUID][]string
	WantStretch  bool // caller decides based on last_stretch_at / deck position
}

// RankSolo returns the ordered deck.
func RankSolo(in SoloInput) []Card {
	explore := explorationTemp(in.SwipeCount)

	type scored struct {
		c    db.Candidate
		s    float64
		base float64
	}
	pool := make([]scored, 0, len(in.Candidates))
	for _, c := range in.Candidates {
		var fit float64
		if in.HasProfile {
			fit = (taste.Cosine(in.Blended, c.Feature) + 1) / 2
		} else {
			fit = 0.5
		}
		pop := clamp01(float64(c.Rating) / 5)
		near := 1 - clamp01(c.DistanceM/6000)
		base := 0.68*fit + 0.17*pop + 0.15*near
		s := base + explore*rand.Float64()
		pool = append(pool, scored{c, s, base})
	}
	sort.Slice(pool, func(a, b int) bool { return pool[a].s > pool[b].s })

	// cuisine diversity: demote a card sharing its top cuisine with the last two
	ordered := diversify(len(pool), func(i int) db.Candidate { return pool[i].c })

	cards := make([]Card, 0, len(ordered))
	for _, idx := range ordered {
		c := pool[idx].c
		card := Card{
			Restaurant: c.Restaurant,
			DistanceM:  c.DistanceM,
			MatchScore: round1(pool[idx].base * 100),
		}
		if in.HasProfile {
			card.Reasons = taste.Explain(in.Core, c.Feature, 3)
		}
		if names := in.FriendsLiked[c.ID]; len(names) > 0 {
			card.FriendsLiked = names
		}
		cards = append(cards, card)
	}

	if in.WantStretch && in.HasProfile {
		if si := pickStretch(in.Core, in.Candidates); si != nil {
			// drop it from its natural position so it appears once, as the stretch
			for i, c := range cards {
				if c.ID == si.ID {
					cards = append(cards[:i], cards[i+1:]...)
					break
				}
			}
			stretch := Card{
				Restaurant: si.Restaurant,
				DistanceM:  si.DistanceM,
				MatchScore: round1((taste.Cosine(in.Core, si.Feature) + 1) / 2 * 100),
				IsStretch:  true,
				Reasons:    []string{"Outside your usual — swipe to grow your palate"},
			}
			cards = insertAt(cards, stretch, minInt(4, len(cards)))
		}
	}
	return cards
}

// --- consensus deck --------------------------------------------------

type ConsensusInput struct {
	Members    map[uuid.UUID]taste.Vec
	Candidates []db.Candidate
	LikedBy    map[uuid.UUID]int // restaurant id -> members who already liked
	PassedBy   map[uuid.UUID]int
}

type ConsensusCard struct {
	db.Restaurant
	DistanceM  float64 `json:"distanceM"`
	GroupScore float64 `json:"groupScore"` // 0..100, maximin
	LikedBy    int     `json:"likedBy"`
}

func RankConsensus(in ConsensusInput) []ConsensusCard {
	mv := make([]taste.Vec, 0, len(in.Members))
	for _, v := range in.Members {
		mv = append(mv, v)
	}
	type sc struct {
		c db.Candidate
		s float64
	}
	var pool []sc
	for _, c := range in.Candidates {
		s := taste.ConsensusScore(mv, c.Feature, in.LikedBy[c.ID], in.PassedBy[c.ID])
		if s <= 0 {
			continue
		}
		pool = append(pool, sc{c, s})
	}
	sort.Slice(pool, func(a, b int) bool { return pool[a].s > pool[b].s })
	out := make([]ConsensusCard, 0, len(pool))
	for _, p := range pool {
		out = append(out, ConsensusCard{
			Restaurant: p.c.Restaurant,
			DistanceM:  p.c.DistanceM,
			GroupScore: round1(p.s * 100),
			LikedBy:    in.LikedBy[p.c.ID],
		})
	}
	return out
}

// --- helpers -------------------------------------------------------

// explorationTemp is high for new users (diversify hard) and decays toward 0.
func explorationTemp(swipes int) float64 {
	return 0.35 * math.Exp(-float64(swipes)/25)
}

func diversify(n int, get func(int) db.Candidate) []int {
	used := make([]bool, n)
	order := make([]int, 0, n)
	var recent []string
	for len(order) < n {
		best, bestPenalty := -1, math.Inf(1)
		for i := 0; i < n; i++ {
			if used[i] {
				continue
			}
			pen := float64(i) // original rank
			if top := topCuisine(get(i)); top != "" && contains(recent, top) {
				pen += 6
			}
			if pen < bestPenalty {
				best, bestPenalty = i, pen
			}
		}
		used[best] = true
		order = append(order, best)
		if top := topCuisine(get(best)); top != "" {
			recent = append(recent, top)
			if len(recent) > 2 {
				recent = recent[1:]
			}
		}
	}
	return order
}

func topCuisine(c db.Candidate) string {
	best, bestV := "", float32(0)
	for i := 0; i < 44; i++ { // cuisine dims
		if c.Feature[i] > bestV {
			bestV, best = c.Feature[i], taste.Dimensions[i].Key
		}
	}
	return best
}

func pickStretch(core taste.Vec, cands []db.Candidate) *db.Candidate {
	best, bestS := (*db.Candidate)(nil), 0.0
	for i := range cands {
		if s := taste.StretchScore(core, cands[i].Feature); s > bestS {
			bestS, best = s, &cands[i]
		}
	}
	if bestS < 0.15 {
		return nil
	}
	return best
}

func insertAt(cards []Card, c Card, i int) []Card {
	if i >= len(cards) {
		return append(cards, c)
	}
	out := append(cards[:i:i], c)
	return append(out, cards[i:]...)
}

func clamp01(x float64) float64 {
	if x < 0 {
		return 0
	}
	if x > 1 {
		return 1
	}
	return x
}
func round1(f float64) float64 { return math.Round(f*10) / 10 }
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
