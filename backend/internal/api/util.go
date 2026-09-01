package api

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func chiParam(r *http.Request, key string) string { return chi.URLParam(r, key) }

func round1(f float64) float64 { return math.Round(f*10) / 10 }
func round2(f float64) float64 { return math.Round(f*100) / 100 }

type ctxKey int

const userIDKey ctxKey = 0

func userID(ctx context.Context) uuid.UUID { v, _ := ctx.Value(userIDKey).(uuid.UUID); return v }

// requireUser validates an EatRai access token and injects the user id.
func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		sub, typ, err := s.Issuer.Parse(raw)
		if err != nil || typ != "access" {
			httpErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		id, err := uuid.Parse(sub)
		if err != nil {
			httpErr(w, http.StatusUnauthorized, "bad subject")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey, id)))
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func decode(r *http.Request, v any) error { return json.NewDecoder(r.Body).Decode(v) }

func qFloat(r *http.Request, key string) float64 {
	f, _ := strconv.ParseFloat(r.URL.Query().Get(key), 64)
	return f
}

func qInt(r *http.Request, key string, def int) int {
	if n, err := strconv.Atoi(r.URL.Query().Get(key)); err == nil {
		return n
	}
	return def
}
