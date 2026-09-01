package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/deck"
	"github.com/chakkrit/eatrai/internal/taste"
)

func (s *Server) requestFriend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Handle string `json:"handle"`
	}
	if err := decode(r, &req); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	target, err := s.DB.FindByHandle(r.Context(), req.Handle)
	if errors.Is(err, db.ErrNotFound) {
		httpErr(w, http.StatusNotFound, "no user with that handle")
		return
	}
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	me := userID(r.Context())
	if target.ID == me {
		httpErr(w, http.StatusBadRequest, "cannot friend yourself")
		return
	}
	if err := s.DB.RequestFriend(r.Context(), me, target.ID); err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "sentTo": target.Handle})
}

func (s *Server) acceptFriend(w http.ResponseWriter, r *http.Request) {
	other, err := uuid.Parse(chiParam(r, "id"))
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	if err := s.DB.AcceptFriend(r.Context(), userID(r.Context()), other); err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	go s.refreshCompatibility(userID(r.Context()))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) listFriends(w http.ResponseWriter, r *http.Request) {
	friends, err := s.DB.ListFriends(r.Context(), userID(r.Context()))
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(friends))
	for _, f := range friends {
		out = append(out, map[string]any{
			"id": f.ID, "handle": f.Handle, "displayName": f.DisplayName,
			"status": f.Status, "incoming": f.Incoming,
			"compatibility": round1(f.Compatibility), "compatBasis": f.CompatBasis,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"friends": out})
}

func (s *Server) getCompatibility(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	me := userID(ctx)
	other, err := uuid.Parse(chiParam(r, "id"))
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	score, overlapN, agreeN, err := s.computeCompatibility(ctx, me, other)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	mine, _ := s.DB.GetUser(ctx, me)
	theirs, _ := s.DB.GetUser(ctx, other)
	both, clash := taste.Agreements(mine.Core, theirs.Core)
	writeJSON(w, http.StatusOK, map[string]any{
		"score": round1(score), "overlap": overlapN, "agreed": agreeN,
		"basis": basisFor(overlapN), "bothLove": both, "neitherLikes": clash,
	})
}

// postConsensus builds an async group deck for the caller + chosen friends,
// ranked so the worst-matched member's regret is minimised (maximin).
func (s *Server) postConsensus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	me := userID(ctx)
	var req struct {
		FriendIDs []uuid.UUID `json:"friendIds"`
		Lat       float64     `json:"lat"`
		Lng       float64     `json:"lng"`
		RadiusM   int         `json:"radiusM"`
	}
	if err := decode(r, &req); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	lng := req.Lng
	if req.Lat == 0 || lng == 0 || len(req.FriendIDs) == 0 {
		httpErr(w, http.StatusBadRequest, "lat, lng and at least one friendId required")
		return
	}
	radius := req.RadiusM
	if radius == 0 {
		radius = 2500
	}

	friendVecs, err := s.DB.AcceptedFriendVectors(ctx, me, req.FriendIDs)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	mine, _ := s.DB.GetUser(ctx, me)
	members := map[uuid.UUID]taste.Vec{me: blendedOf(mine)}
	for id, v := range friendVecs {
		members[id] = v
	}

	seenBy := append([]uuid.UUID{me}, req.FriendIDs...)
	cands, err := s.DB.NearbyCandidates(ctx, seenBy, lng, req.Lat, radius, 150)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	cards := deck.RankConsensus(deck.ConsensusInput{
		Members:    members,
		Candidates: cands,
		LikedBy:    map[uuid.UUID]int{},
		PassedBy:   map[uuid.UUID]int{},
	})
	if len(cards) > 30 {
		cards = cards[:30]
	}
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards, "members": len(members)})
}

// --- compatibility helpers ------------------------------------------

func (s *Server) computeCompatibility(ctx context.Context, a, b uuid.UUID) (score float64, overlapN, agreeN int, err error) {
	overlapN, agreeN, err = s.DB.PairStats(ctx, a, b)
	if err != nil {
		return
	}
	ua, err := s.DB.GetUser(ctx, a)
	if err != nil {
		return
	}
	ub, err := s.DB.GetUser(ctx, b)
	if err != nil {
		return
	}
	score = taste.Compatibility(ua.Core, ub.Core, overlapN, agreeN)
	_ = s.DB.SaveCompatibility(ctx, a, b, score, overlapN, agreeN)
	return
}

func (s *Server) refreshCompatibility(me uuid.UUID) {
	ctx := context.Background()
	friends, err := s.DB.ListFriends(ctx, me)
	if err != nil {
		return
	}
	for _, f := range friends {
		if f.Status == "accepted" {
			_, _, _, _ = s.computeCompatibility(ctx, me, f.ID)
		}
	}
}

func blendedOf(u db.User) taste.Vec {
	if u.HasRecent {
		return taste.Blend(u.Core, u.Recent, 0.25)
	}
	return u.Core
}

func basisFor(overlap int) string {
	switch {
	case overlap < 5:
		return "taste-profile"
	case overlap < 20:
		return "blended"
	default:
		return "shared-history"
	}
}
