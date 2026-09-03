// Package httpapi is the whole service: a handful of GET routes over a Places
// client with an in-memory cache, an IP rate limiter, and an origin gate on the
// endpoints that cost money.
package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/chakkrit/eatrai/internal/cache"
	"github.com/chakkrit/eatrai/internal/places"
	"github.com/chakkrit/eatrai/internal/ratelimit"
)

type Server struct {
	Places         *places.Client
	Cache          *cache.TTL
	Limiter        *ratelimit.Limiter
	Mock           bool
	AllowedOrigins []string // CORS + origin gate; ["*"] disables the gate
	RequireOrigin  bool
	Log            *slog.Logger
}

// openNowTTL keeps "open now" results fresh — a place that just closed shouldn't
// linger in the cache for the full default TTL.
const openNowTTL = 3 * time.Minute

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.AllowedOrigins,
		AllowedMethods:   []string{http.MethodGet, http.MethodOptions},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// NB: not /healthz or /statusz — Google Cloud Run's frontend reserves the
	// "*z" health/status paths and never routes them to the container.
	health := func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "mock": s.Mock})
	}
	r.Get("/status", health)
	r.Get("/healthcheck", health)

	// The paid endpoints sit behind the rate limiter and the origin gate.
	r.Group(func(r chi.Router) {
		r.Use(s.rateLimit)
		r.Use(s.checkOrigin)
		r.Get("/nearby", s.handleNearby)
		r.Get("/place", s.handlePlace)
		r.Get("/list", s.handleList)
		r.Get("/geocode", s.handleGeocode)
		r.Get("/reverse", s.handleReverse)
	})

	r.Get("/photo", s.handlePhoto)
	return r
}

// --- middleware ----------------------------------------------------------

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Limiter != nil && !s.Limiter.Allow(clientIP(r)) {
			w.Header().Set("Retry-After", "60")
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "slow down — too many requests"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) checkOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.originAllowed(r) {
			next.ServeHTTP(w, r)
			return
		}
		s.Log.Warn("blocked cross-origin request", "origin", r.Header.Get("Origin"), "referer", r.Header.Get("Referer"), "ip", clientIP(r))
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not allowed from this origin"})
	})
}

func (s *Server) originAllowed(r *http.Request) bool {
	if !s.RequireOrigin {
		return true
	}
	for _, o := range s.AllowedOrigins {
		if o == "*" {
			return true
		}
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		if ref := r.Header.Get("Referer"); ref != "" {
			if u, err := url.Parse(ref); err == nil {
				origin = u.Scheme + "://" + u.Host
			}
		}
	}
	// No Origin and no Referer: a non-browser client (native app, monitor,
	// curl). The rate limiter is the backstop for those — don't hard-block.
	if origin == "" {
		return true
	}
	for _, o := range s.AllowedOrigins {
		if strings.EqualFold(o, origin) {
			return true
		}
	}
	return false
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// --- handlers ----------------------------------------------------------

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
	lang := normLang(q.Get("lang"))
	minRating := parseRating(q.Get("minRating"))
	priceLevels := parsePriceLevels(q.Get("priceLevels"))
	sortMode := "near"
	if q.Get("sort") == "match" {
		sortMode = "match"
	}

	query := places.Query{
		Lat: lat, Lng: lng, RadiusM: radius,
		Categories: categories, OpenNow: openNow,
		MinRating: minRating, PriceLevels: priceLevels, Sort: sortMode,
		Lang: lang, PhotoBase: publicBase(r),
	}

	key := cacheKey(lat, lng, radius, categories, openNow) +
		fmt.Sprintf("|r%.1f|p%v|s%s|%s", minRating, priceLevels, sortMode, lang)
	if cached, ok := s.Cache.Get(key); ok {
		w.Header().Set("Cache-Control", "public, max-age=120")
		writeJSON(w, http.StatusOK, map[string]any{"cards": cached, "cached": true})
		return
	}

	var cards []places.Card
	if s.Mock {
		cards = places.MockNearby(query)
	} else {
		var err error
		cards, err = s.Places.Search(r.Context(), query)
		if err != nil {
			s.Log.Error("places search", "err", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not reach the restaurant service"})
			return
		}
	}

	if cards == nil {
		cards = []places.Card{}
	}
	ttl := time.Duration(0)
	if openNow {
		ttl = openNowTTL
	}
	s.Cache.SetTTL(key, cards, ttl)
	w.Header().Set("Cache-Control", "public, max-age=120")
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func (s *Server) handlePlace(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := strings.TrimSpace(q.Get("id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id is required"})
		return
	}
	lang := normLang(q.Get("lang"))
	lat, _ := strconv.ParseFloat(q.Get("lat"), 64)
	lng, _ := strconv.ParseFloat(q.Get("lng"), 64)

	key := "place|" + id + "|" + lang
	if cached, ok := s.Cache.Get(key); ok {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	var (
		place places.Place
		err   error
	)
	if s.Mock {
		place = places.MockPlace(id, lang, lat, lng)
	} else {
		place, err = s.Places.GetPlace(r.Context(), id, lang, publicBase(r), lat, lng)
		if err != nil {
			s.Log.Error("places detail", "err", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not load that place"})
			return
		}
	}

	s.Cache.Set(key, place)
	writeJSON(w, http.StatusOK, place)
}

// handleList resolves a shared list (?ids=a,b,c) in one round trip, on the
// cheaper Place Details field-mask tier, with a per-id cache so re-opening a
// link is free. Bounded concurrency keeps a big list from fanning out wide.
func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("ids"))
	if raw == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "ids is required"})
		return
	}
	lang := normLang(r.URL.Query().Get("lang"))

	var ids []string
	seen := map[string]bool{}
	for _, id := range strings.Split(raw, ",") {
		if id = strings.TrimSpace(id); id != "" && !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
		if len(ids) == 25 {
			break
		}
	}

	if s.Mock {
		writeJSON(w, http.StatusOK, map[string]any{"places": places.MockList(ids, lang)})
		return
	}

	base := publicBase(r)
	out := make([]places.Card, len(ids))
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	for i, id := range ids {
		key := "lite|" + id + "|" + lang
		if cached, ok := s.Cache.Get(key); ok {
			if c, ok := cached.(places.Card); ok {
				out[i] = c
				continue
			}
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, id, key string) {
			defer wg.Done()
			defer func() { <-sem }()
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			c, err := s.Places.GetPlaceLite(ctx, id, lang, base)
			if err != nil {
				s.Log.Warn("list resolve", "id", id, "err", err)
				return
			}
			s.Cache.SetTTL(key, c, time.Hour)
			out[i] = c
		}(i, id, key)
	}
	wg.Wait()

	cards := make([]places.Card, 0, len(out))
	for _, c := range out {
		if c.ID != "" {
			cards = append(cards, c)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"places": cards})
}

func (s *Server) handleGeocode(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "q is required"})
		return
	}
	lang := normLang(r.URL.Query().Get("lang"))

	key := "geo|" + strings.ToLower(q) + "|" + lang
	if cached, ok := s.Cache.Get(key); ok {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	var (
		lat, lng float64
		label    string
	)
	if s.Mock {
		lat, lng, label = places.MockGeocode(q)
	} else {
		var err error
		lat, lng, label, err = s.Places.Geocode(r.Context(), q, lang)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "couldn't find that place"})
			return
		}
	}
	res := map[string]any{"lat": lat, "lng": lng, "label": label}
	s.Cache.SetTTL(key, res, time.Hour)
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleReverse(w http.ResponseWriter, r *http.Request) {
	lat, err1 := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, err2 := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if err1 != nil || err2 != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "lat and lng are required"})
		return
	}
	lang := normLang(r.URL.Query().Get("lang"))

	key := fmt.Sprintf("rev|%.3f,%.3f|%s", round3(lat), round3(lng), lang)
	if cached, ok := s.Cache.Get(key); ok {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	var label string
	if s.Mock {
		label = places.MockReverse(lat, lng)
	} else {
		var err error
		label, err = s.Places.Reverse(r.Context(), lat, lng, lang)
		if err != nil {
			s.Log.Warn("reverse geocode", "err", err)
			writeJSON(w, http.StatusOK, map[string]string{"label": ""}) // soft-fail: the pin still works
			return
		}
	}
	res := map[string]string{"label": label}
	s.Cache.SetTTL(key, res, time.Hour)
	writeJSON(w, http.StatusOK, res)
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

// parseRating clamps a min-rating query value to [0, 5] in 0.5 steps (what
// Google's Text Search accepts). 0 = no filter.
func parseRating(s string) float64 {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v <= 0 {
		return 0
	}
	if v > 5 {
		v = 5
	}
	return float64(int(v*2+0.5)) / 2
}

func parsePriceLevels(s string) []int {
	seen := map[int]bool{}
	var out []int
	for _, p := range strings.Split(s, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err == nil && n >= 1 && n <= 4 && !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	sort.Ints(out)
	return out
}

func normLang(s string) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(s)), "th") {
		return "th"
	}
	return ""
}
