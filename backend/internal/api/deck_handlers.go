package api

import (
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/deck"
	"github.com/chakkrit/eatrai/internal/taste"
)

func (s *Server) getMe(w http.ResponseWriter, r *http.Request) {
	u, err := s.DB.GetUser(r.Context(), userID(r.Context()))
	if err != nil {
		httpErr(w, http.StatusNotFound, "user not found")
		return
	}
	palate := []map[string]any{}
	for _, i := range taste.TopDims(u.Core, 6) {
		palate = append(palate, map[string]any{
			"key": taste.Dimensions[i].Key, "label": taste.Dimensions[i].Label,
			"kind": taste.Dimensions[i].Kind, "weight": round2(float64(u.Core[i])),
		})
	}
	var mood any
	if u.HasRecent && u.HasCore {
		mood = taste.Shift(u.Core, u.Recent)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{
			"id": u.ID, "handle": u.Handle, "displayName": u.DisplayName,
			"avatarUrl": u.AvatarURL,
		},
		"swipeCount":      u.SwipeCount,
		"profileReady":    u.HasCore && u.SwipeCount >= 12,
		"palate":          palate,
		"mood":            mood,
		"adventureStreak": u.AdventureStreak,
	})
}

func (s *Server) getDeck(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userID(ctx)
	lat, lng := qFloat(r, "lat"), qFloat(r, "lng")
	if lat == 0 || lng == 0 {
		httpErr(w, http.StatusBadRequest, "lat and lng required")
		return
	}
	radius := qInt(r, "radiusM", 2500)

	u, err := s.DB.GetUser(ctx, uid)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	cands, err := s.DB.NearbyCandidates(ctx, []uuid.UUID{uid}, lng, lat, radius, 120)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ids := make([]uuid.UUID, len(cands))
	for i, c := range cands {
		ids[i] = c.ID
	}
	friendsLiked, _ := s.DB.FriendsWhoLiked(ctx, uid, ids)

	blended := u.Core
	if u.HasRecent {
		blended = taste.Blend(u.Core, u.Recent, 0.25)
	}
	cards := deck.RankSolo(deck.SoloInput{
		UserID:       uid,
		Core:         u.Core,
		HasProfile:   u.HasCore,
		Blended:      blended,
		SwipeCount:   u.SwipeCount,
		Candidates:   cands,
		FriendsLiked: friendsLiked,
		WantStretch:  u.HasCore && u.SwipeCount >= 15,
	})

	for _, c := range cards {
		if c.IsStretch {
			_ = s.DB.RecordStretchShown(ctx, uid, c.ID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

type swipeReq struct {
	RestaurantID uuid.UUID  `json:"restaurantId"`
	Direction    int        `json:"direction"` // 1 like, -1 pass, 2 superlike
	SessionID    *uuid.UUID `json:"sessionId,omitempty"`
	WasStretch   bool       `json:"wasStretch,omitempty"`
}

func (s *Server) postSwipe(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := userID(ctx)
	var req swipeReq
	if err := decode(r, &req); err != nil || req.Direction == 0 {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}

	feat, err := s.DB.RecordSwipe(ctx, uid, req.RestaurantID, req.Direction, req.SessionID)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	u, err := s.DB.GetUser(ctx, uid)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	newCore := taste.UpdateCore(u.Core, u.SwipeCount, feat, req.Direction)
	newRecent := taste.UpdateRecent(u.Recent, feat, req.Direction)
	if err := s.DB.SaveVectors(ctx, uid, newCore, newRecent); err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := map[string]any{"ok": true}

	if req.WasStretch {
		accepted := req.Direction > 0
		_ = s.DB.MarkStretchResolved(ctx, uid, req.RestaurantID, accepted)
		_ = s.DB.BumpAdventureStreak(ctx, uid, accepted)
		if u2, err := s.DB.GetUser(ctx, uid); err == nil {
			resp["adventureStreak"] = u2.AdventureStreak
		}
	}

	if req.SessionID != nil {
		if rid, ok, err := s.DB.CheckMatch(ctx, *req.SessionID); err == nil && ok {
			rest, _, _ := s.DB.GetRestaurant(ctx, rid)
			resp["match"] = rest
		}
	}

	// keep cached compatibility with friends fresh (cheap; async in prod)
	go s.refreshCompatibility(uid)

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) getRestaurant(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chiParam(r, "id"))
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	rest, _, err := s.DB.GetRestaurant(r.Context(), id)
	if errors.Is(err, db.ErrNotFound) {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rest)
}

func (s *Server) getLikes(w http.ResponseWriter, r *http.Request) {
	rests, err := s.DB.LikedRestaurants(r.Context(), userID(r.Context()), 100)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"restaurants": rests})
}
