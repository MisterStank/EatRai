package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/deck"
	"github.com/chakkrit/eatrai/internal/taste"
)

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Mode    string  `json:"mode"` // "live" | "async"
		Lat     float64 `json:"lat"`
		Lng     float64 `json:"lng"`
		RadiusM int     `json:"radiusM"`
		Quorum  int     `json:"quorum"`
	}
	if err := decode(r, &req); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	lng := req.Lng
	if req.Mode != "async" {
		req.Mode = "live"
	}
	if req.RadiusM == 0 {
		req.RadiusM = 2500
	}
	if req.Quorum < 2 {
		req.Quorum = 2
	}
	var ttl time.Duration
	if req.Mode == "async" {
		ttl = 24 * time.Hour
	}
	sess, err := s.DB.CreateSession(r.Context(), userID(r.Context()), req.Mode, lng, req.Lat, req.RadiusM, req.Quorum, ttl)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, sess)
}

func (s *Server) joinSession(w http.ResponseWriter, r *http.Request) {
	sess, err := s.DB.JoinSession(r.Context(), chiParam(r, "code"), userID(r.Context()))
	if errors.Is(err, db.ErrNotFound) {
		httpErr(w, http.StatusNotFound, "no session with that code")
		return
	}
	if err != nil {
		httpErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

// sessionDeck returns the shared deck for a group, ordered by the group's
// blended taste so early cards already skew toward a match.
func (s *Server) sessionDeck(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sid, err := uuid.Parse(chiParam(r, "id"))
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	sess, err := s.DB.GetSession(ctx, sid)
	if errors.Is(err, db.ErrNotFound) {
		httpErr(w, http.StatusNotFound, "session not found")
		return
	}
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	members, err := s.DB.SessionMembers(ctx, sid)
	if err != nil || len(members) == 0 {
		httpErr(w, http.StatusNotFound, "session not found")
		return
	}

	memberVecs := map[uuid.UUID]taste.Vec{}
	for _, m := range members {
		if u, err := s.DB.GetUser(ctx, m); err == nil {
			memberVecs[m] = blendedOf(u)
		}
	}
	cands, err := s.DB.NearbyCandidates(ctx, members, sess.Lng, sess.Lat, sess.RadiusM, 150)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	cards := deck.RankConsensus(deck.ConsensusInput{
		Members:    memberVecs,
		Candidates: cands,
		LikedBy:    map[uuid.UUID]int{},
		PassedBy:   map[uuid.UUID]int{},
	})
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func (s *Server) sessionState(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sid, err := uuid.Parse(chiParam(r, "id"))
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	members, err := s.DB.SessionMembers(ctx, sid)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	resp := map[string]any{"members": len(members)}
	if rid, ok, err := s.DB.CheckMatch(ctx, sid); err == nil && ok {
		rest, _, _ := s.DB.GetRestaurant(ctx, rid)
		resp["match"] = rest
	}
	writeJSON(w, http.StatusOK, resp)
}
