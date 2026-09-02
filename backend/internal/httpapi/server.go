// Package httpapi is the whole service: three GET routes over a Places client
// with an in-memory cache.
package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/chakkrit/eatrai/internal/cache"
	"github.com/chakkrit/eatrai/internal/places"
)

type Server struct {
	Places     *places.Client
	Cache      *cache.TTL
	Mock       bool
	CORSOrigin string
	Log        *slog.Logger
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{s.CORSOrigin},
		AllowedMethods:   []string{http.MethodGet, http.MethodOptions},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "mock": s.Mock})
	})
	r.Get("/nearby", s.handleNearby)
	r.Get("/photo", s.handlePhoto)
	return r
}

func (s *Server) handleNearby(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	lat, err1 := strconv.ParseFloat(q.Get("lat"), 64)
	lng, err2 := strconv.ParseFloat(q.Get("lng"), 64)
	if err1 != nil || err2 != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "lat and lng are required"})
		return
	}

	radius := 1500.0
	if v, err := strconv.ParseFloat(q.Get("radius"), 64); err == nil && v > 0 {
		radius = v
	}

	var categories []string
	if raw := strings.TrimSpace(q.Get("categories")); raw != "" {
		for _, c := range strings.Split(raw, ",") {
			if c = strings.ToLower(strings.TrimSpace(c)); c != "" {
				categories = append(categories, c)
			}
		}
		sort.Strings(categories)
	}
	openNow := q.Get("openNow") == "true" || q.Get("openNow") == "1"

	query := places.Query{
		Lat: lat, Lng: lng, RadiusM: radius,
		Categories: categories, OpenNow: openNow,
		PhotoBase: publicBase(r),
	}

	key := cacheKey(lat, lng, radius, categories, openNow)
	if cached, ok := s.Cache.Get(key); ok {
		writeJSON(w, http.StatusOK, map[string]any{"cards": cached, "cached": true})
		return
	}

	var cards []places.Card
	if s.Mock {
		cards = places.MockNearby(query)
	} else {
		cards, err1 = s.Places.SearchNearby(r.Context(), query)
		if err1 != nil {
			s.Log.Error("places search", "err", err1)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not reach the restaurant service"})
			return
		}
	}

	s.Cache.Set(key, cards)
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func (s *Server) handlePhoto(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if !strings.HasPrefix(name, "places/") || !strings.Contains(name, "/photos/") {
		http.Error(w, "bad photo name", http.StatusBadRequest)
		return
	}
	if s.Mock {
		http.Error(w, "no photos in mock mode", http.StatusNotFound)
		return
	}
	width, _ := strconv.Atoi(r.URL.Query().Get("w"))

	body, ct, err := s.Places.FetchPhoto(r.Context(), name, width)
	if err != nil {
		s.Log.Error("places photo", "err", err)
		http.Error(w, "photo unavailable", http.StatusBadGateway)
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.Copy(w, body)
}

// --- helpers --------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func publicBase(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if p := r.Header.Get("X-Forwarded-Proto"); p != "" {
		scheme = p
	}
	return scheme + "://" + r.Host
}

func cacheKey(lat, lng, radius float64, categories []string, openNow bool) string {
	var b strings.Builder
	b.WriteString(strconv.FormatFloat(round3(lat), 'f', 3, 64))
	b.WriteByte(',')
	b.WriteString(strconv.FormatFloat(round3(lng), 'f', 3, 64))
	b.WriteByte('|')
	b.WriteString(strconv.Itoa(int(radius)))
	b.WriteByte('|')
	b.WriteString(strings.Join(categories, ","))
	b.WriteByte('|')
	if openNow {
		b.WriteByte('o')
	}
	return b.String()
}

func round3(f float64) float64 {
	return float64(int(f*1000+0.5)) / 1000
}
