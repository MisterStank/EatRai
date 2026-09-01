package api

import (
	"net/http"

	"github.com/chakkrit/eatrai/internal/auth"
)

type exchangeReq struct {
	Provider string `json:"provider"` // "google" | "apple"
	IDToken  string `json:"idToken"`
	Nonce    string `json:"nonce,omitempty"` // raw nonce; required for Apple
	// Apple only returns the user's name on the *first* authorization, so the
	// client forwards it here when it has it.
	FullName string `json:"fullName,omitempty"`
}

func (s *Server) authExchange(w http.ResponseWriter, r *http.Request) {
	var req exchangeReq
	if err := decode(r, &req); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	ident, err := s.Verifier.Verify(r.Context(), req.Provider, req.IDToken, auth.VerifyOpts{RawNonce: req.Nonce})
	if err != nil {
		s.Log.Warn("token verify failed", "provider", req.Provider, "err", err)
		httpErr(w, http.StatusUnauthorized, "invalid identity token")
		return
	}
	name := ident.Name
	if name == "" {
		name = req.FullName
	}
	u, err := s.DB.UpsertByAuth(r.Context(), ident.Provider, ident.Subject, ident.Email, name)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	tok, err := s.Issuer.Issue(u.ID.String())
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tokens": tok,
		"user": map[string]any{
			"id": u.ID, "handle": u.Handle, "displayName": u.DisplayName,
		},
	})
}

// authDev is only mounted when DEV_LOGIN=true. It fabricates an identity so you
// can test without wiring Apple/Google. Never enable in production.
func (s *Server) authDev(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Handle string `json:"handle"`
	}
	_ = decode(r, &req)
	if req.Handle == "" {
		req.Handle = "tester"
	}
	u, err := s.DB.UpsertByAuth(r.Context(), "dev", "dev|"+req.Handle, req.Handle+"@dev.local", req.Handle)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	tok, err := s.Issuer.Issue(u.ID.String())
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tokens": tok,
		"user":   map[string]any{"id": u.ID, "handle": u.Handle, "displayName": u.DisplayName},
	})
}

func (s *Server) authRefresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := decode(r, &req); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	sub, typ, err := s.Issuer.Parse(req.RefreshToken)
	if err != nil || typ != "refresh" {
		httpErr(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	tok, err := s.Issuer.Issue(sub)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": tok})
}
