// Package taste implements EatRai's taste model.
//
// Taste lives in a fixed 64-dimension space (see dimensions.go). The first 44
// dimensions are cuisines, the last 20 are attributes. Both restaurants and
// users are points in this space:
//
//   - A restaurant's feature vector is built once at sync time from its
//     cuisines / price level / Places signals (see features.go).
//   - A user has TWO vectors:
//     core   — an online weighted centroid of everything they've reacted to,
//     the slow-moving "who you are" profile.
//     recent — the same update rule but time-decayed, the fast-moving
//     "what you've been into lately" mood.
//     Recommendations blend them (Blend); the gap between them powers the
//     "you've been more adventurous lately" copy (MoodShift).
//
// Nothing here needs a training job or a model server: every function is a few
// dot products and runs inside the request that handled the swipe.
package taste

import (
	"math"
	"sort"
)

const Dim = 64

// Learning rates.
const (
	likeRate       = 1.0
	passRate       = 0.35
	recentHalfLife = 25.0 // swipes; recent vector forgets at this rate
)

// Vec is a dense taste vector.
type Vec [Dim]float32

// Add / scale helpers -----------------------------------------------------

func (v Vec) norm() float64 {
	var s float64
	for _, x := range v {
		s += float64(x) * float64(x)
	}
	return math.Sqrt(s)
}

// Normalized returns the L2-normalized vector (zero vector unchanged).
func (v Vec) Normalized() Vec {
	n := v.norm()
	if n == 0 {
		return v
	}
	var out Vec
	for i := range v {
		out[i] = float32(float64(v[i]) / n)
	}
	return out
}

// Cosine similarity in [-1, 1]. Zero vectors yield 0.
func Cosine(a, b Vec) float64 {
	var dot, na, nb float64
	for i := 0; i < Dim; i++ {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

// Blend mixes core and recent taste. moodWeight in [0,1]; 0.25 is a good
// default — mostly you, with a nudge toward your current mood.
func Blend(core, recent Vec, moodWeight float64) Vec {
	var out Vec
	for i := 0; i < Dim; i++ {
		out[i] = float32((1-moodWeight)*float64(core[i]) + moodWeight*float64(recent[i]))
	}
	return out
}

// UpdateCore folds one swipe into the slow centroid.
//
//	cur  current core vector (zero Vec if none)
//	n    likes contributed so far
//	feat restaurant feature vector (assumed normalized)
//	dir  +1 like / -1 pass / +2 superlike
func UpdateCore(cur Vec, n int, feat Vec, dir int) Vec {
	w := passWeight(dir)
	denom := float64(n) + math.Abs(w)
	if denom == 0 {
		return cur
	}
	var out Vec
	for i := 0; i < Dim; i++ {
		out[i] = float32((float64(cur[i])*float64(n) + float64(feat[i])*w) / denom)
	}
	return out
}

// UpdateRecent folds one swipe into the time-decayed mood vector. It is an
// exponential moving average: recent' = (1-a)·recent + a·(feat·sign).
func UpdateRecent(cur Vec, feat Vec, dir int) Vec {
	a := 1 - math.Exp(-math.Ln2/recentHalfLife)
	w := passWeight(dir)
	var out Vec
	for i := 0; i < Dim; i++ {
		out[i] = float32((1-a)*float64(cur[i]) + a*float64(feat[i])*sign(w))
	}
	return out
}

func passWeight(dir int) float64 {
	if dir > 0 {
		return likeRate * float64(dir) // superlike counts double
	}
	return -passRate
}
func sign(x float64) float64 {
	if x < 0 {
		return -1
	}
	return 1
}

// --- explanations ------------------------------------------------------

// TopDims returns the indexes of the n dimensions with the largest positive
// values in v, strongest first.
func TopDims(v Vec, n int) []int {
	idx := make([]int, 0, Dim)
	for i := 0; i < Dim; i++ {
		if v[i] > 0 {
			idx = append(idx, i)
		}
	}
	sort.Slice(idx, func(a, b int) bool { return v[idx[a]] > v[idx[b]] })
	if len(idx) > n {
		idx = idx[:n]
	}
	return idx
}

// Explain returns up to n human labels for why this restaurant is a good match:
// dimensions where BOTH the user's taste and the restaurant's features are
// high. Empty when the user has no profile yet.
func Explain(userVec, feat Vec, n int) []string {
	if userVec.norm() == 0 {
		return nil
	}
	type sc struct {
		i int
		v float64
	}
	var scored []sc
	for i := 0; i < Dim; i++ {
		if userVec[i] > 0.05 && feat[i] > 0.05 {
			scored = append(scored, sc{i, float64(userVec[i]) * float64(feat[i])})
		}
	}
	sort.Slice(scored, func(a, b int) bool { return scored[a].v > scored[b].v })
	out := make([]string, 0, n)
	for _, s := range scored {
		if len(out) == n {
			break
		}
		out = append(out, Label(s.i))
	}
	return out
}

// MoodShift describes how the recent vector diverges from core: dimensions the
// user has been leaning into ("more") or away from ("less") lately.
type MoodShift struct {
	More []string `json:"more"`
	Less []string `json:"less"`
}

func Shift(core, recent Vec) MoodShift {
	type sc struct {
		i int
		d float64
	}
	var deltas []sc
	for i := 0; i < Dim; i++ {
		deltas = append(deltas, sc{i, float64(recent[i]) - float64(core[i])})
	}
	sort.Slice(deltas, func(a, b int) bool { return deltas[a].d > deltas[b].d })
	var m MoodShift
	for _, s := range deltas {
		if s.d > 0.06 && len(m.More) < 2 {
			m.More = append(m.More, Label(s.i))
		}
	}
	for i := len(deltas) - 1; i >= 0; i-- {
		if deltas[i].d < -0.06 && len(m.Less) < 2 {
			m.Less = append(m.Less, Label(deltas[i].i))
		}
	}
	return m
}

// --- compatibility ---------------------------------------------------

// Compatibility blends taste-vector similarity with observed swipe agreement,
// weighted by how much shared history the pair has. Returns 0..100.
func Compatibility(a, b Vec, overlapN, agreeN int) float64 {
	vecPart := (Cosine(a, b) + 1) / 2
	if overlapN == 0 {
		return clamp01(vecPart) * 100
	}
	agreeRate := float64(agreeN) / float64(overlapN)
	conf := math.Min(0.85, math.Sqrt(float64(overlapN))/8)
	return clamp01(conf*agreeRate+(1-conf)*vecPart) * 100
}

// Agreements returns dims where two users' tastes align and clash — for the
// "you both love X, neither of you can do Y" copy.
func Agreements(a, b Vec) (both, clash []string) {
	for i := 0; i < Dim; i++ {
		switch {
		case a[i] > 0.08 && b[i] > 0.08:
			both = append(both, Label(i))
		case (a[i] > 0.1 && b[i] < -0.05) || (b[i] > 0.1 && a[i] < -0.05):
			clash = append(clash, Label(i))
		}
	}
	return trim(both, 3), trim(clash, 2)
}

// --- consensus (async group decks) ---------------------------------

// ConsensusScore ranks a restaurant for a group using a maximin (Rawlsian)
// rule: the group's score is driven by its WORST-matched member, so the deck
// surfaces places nobody dislikes rather than places that average well but
// leave someone out. Prior likes lift it, any prior pass tanks it.
//
//	members  each member's blended taste vector
//	feat     restaurant feature vector
//	likedBy  how many members already swiped right on it
//	passedBy how many members already swiped left on it
//
// Returns 0..1.
func ConsensusScore(members []Vec, feat Vec, likedBy, passedBy int) float64 {
	if len(members) == 0 {
		return 0
	}
	if passedBy > 0 {
		return 0 // someone already rejected it — dead
	}
	worst := math.Inf(1)
	var sum float64
	for _, m := range members {
		s := (Cosine(m, feat) + 1) / 2
		if s < worst {
			worst = s
		}
		sum += s
	}
	avg := sum / float64(len(members))
	// 70% worst-case, 30% average — protects the outlier without ignoring fit
	score := 0.7*worst + 0.3*avg
	// small bump per member who already liked it
	score += 0.05 * float64(likedBy)
	return clamp01(score)
}

// --- stretch (deliberate exploration) -----------------------------

// StretchScore rates a restaurant as a "get out of your comfort zone" pick:
// strong in dimensions the user is currently weak/negative on, but not totally
// alien (needs a thread of overlap so it's a stretch, not a random dart).
func StretchScore(userVec, feat Vec) float64 {
	var novelty, anchor float64
	for i := 0; i < Dim; i++ {
		if feat[i] > 0.05 {
			if userVec[i] <= 0.02 {
				novelty += float64(feat[i])
			} else {
				anchor += float64(feat[i]) * float64(userVec[i])
			}
		}
	}
	if anchor < 0.02 {
		return 0
	}
	return clamp01(novelty) * clamp01(anchor*4)
}

// --- small helpers -------------------------------------------------

func clamp01(x float64) float64 {
	if x < 0 {
		return 0
	}
	if x > 1 {
		return 1
	}
	return x
}
func trim(s []string, n int) []string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
