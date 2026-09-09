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
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/chakkrit/eatrai/internal/cache"
	"github.com/chakkrit/eatrai/internal/grid"
	"github.com/chakkrit/eatrai/internal/iplimit"
	"github.com/chakkrit/eatrai/internal/places"
	"github.com/chakkrit/eatrai/internal/quota"
	"github.com/chakkrit/eatrai/internal/ratelimit"
)

type Server struct {
	Places         *places.Client
	Cache          *cache.TTL
	Limiter        *ratelimit.Limiter
	Quota          *quota.Meter     // nil = unlimited (tests, or FREE_CAP_*=0)
	IPLimit        *iplimit.Limiter // nil = unlimited (tests)
	Mock           bool
	AllowedOrigins []string // CORS + origin gate; ["*"] disables the gate
	RequireOrigin  bool
	Log            *slog.Logger
}

// openNowTTL keeps "open now" results fresh — a place that just closed shouldn't
// linger in the cache for the full default TTL. (Legacy Search path only.)
const openNowTTL = 3 * time.Minute

// nearbyTTL is the long in-memory lifetime for a /nearby cell result — the
// filtering that used to make results go stale now happens client-side, so the
// raw cell list is good for a long time. Cloudflare's edge caches it for the
// same window. See docs/COST_AND_MONETIZATION_PLAN.md Part 6.
const nearbyTTL = 14 * 24 * time.Hour

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.AllowedOrigins,
		AllowedMethods:   []string{http.MethodGet, http.MethodOptions},
		AllowedHeaders:   []string{"*", "X-EatRai-Client"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// NB: not /healthz or /statusz — Google Cloud Run's frontend reserves the
	// "*z" health/status paths and never routes them to the container.
	health := func(w http.ResponseWriter, r *http.Request) {
		counts, month := s.Quota.Snapshot()
		ipKeys, ipDegrades := s.IPLimit.Stats()
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       true,
			"mock":     s.Mock,
			"cache":    map[string]any{"entries": s.Cache.Len()},
			"quota":    map[string]any{"counts": counts, "month": month},
			"iplimit":  map[string]any{"trackedKeys": ipKeys, "degradeHits": ipDegrades},
			"degraded": s.Quota.Exceeded("search") || s.Quota.Exceeded("details") || s.Quota.Exceeded("photo"),
		})
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
		r.Get("/suggest", s.handleSuggest)
		r.Get("/reverse", s.handleReverse)
	})

	// /photo is loaded via <img src>, which browsers send without an Origin
	// header — checkOrigin would block it, so it can't sit in the group above.
	// It still costs a paid Places Photo API call per hit, so it needs the rate
	// limiter on its own (it was previously registered with neither, i.e.
	// completely unprotected).
	r.Group(func(r chi.Router) {
		r.Use(s.rateLimit)
		r.Get("/photo", s.handlePhoto)
	})
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
	// Cloud Run's frontend APPENDS the real client IP to any X-Forwarded-For the
	// client already sent — it never removes what the client supplied. So the
	// LAST entry is the one Google's infra vouches for; anything earlier in the
	// list (including the first, which older code here used to trust) is
	// attacker-controlled and trivially spoofable to dodge the rate limiter.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.LastIndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[i+1:])
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

// handleNearby is the cost-collapsed contract (Part 1): the Google call is a
// function of (grid cell, cuisine, radius bucket, lang) ONLY. Radius / price /
// rating / open-now / sort / multi-cuisine merge are all client-side now.
func (s *Server) handleNearby(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	lat, err1 := strconv.ParseFloat(q.Get("lat"), 64)
	lng, err2 := strconv.ParseFloat(q.Get("lng"), 64)
	if err1 != nil || err2 != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "lat and lng are required"})
		return
	}
	cellLat, cellLng := grid.Snap(lat), grid.Snap(lng)

	// Prefer the new single `cuisine`; fall back to the first key of a legacy
	// `categories` CSV — a 1-release compat shim for apps that haven't updated.
	cuisine := strings.ToLower(strings.TrimSpace(q.Get("cuisine")))
	if cuisine == "" {
		if raw := strings.TrimSpace(q.Get("categories")); raw != "" {
			cuisine = strings.ToLower(strings.TrimSpace(strings.SplitN(raw, ",", 2)[0]))
		}
	}

	radius := 5000.0
	if v, err := strconv.ParseFloat(q.Get("radius"), 64); err == nil && v > 0 {
		radius = v
	}
	bucket := grid.RadiusBucket(radius)
	lang := normLang(q.Get("lang"))

	key := fmt.Sprintf("n|%.3f,%.3f|%s|r%d|%s", cellLat, cellLng, cuisine, bucket, lang)
	base := publicBase(r)

	val, fresh, ok := s.Cache.GetStale(key)
	quotaOK := !s.Quota.Exceeded("search")
	// clientMayFetch also *records* the fetch against the per-client budget, so
	// only call it when we're actually about to (or would like to) hit Google.
	// A nil IPLimit (tests) always allows.
	clientMayFetch := func() bool {
		return s.IPLimit.Allow(clientIP(r), strings.TrimSpace(r.Header.Get("X-EatRai-Client")))
	}

	switch {
	case ok && fresh:
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, map[string]any{"cards": val, "cached": true})
		return

	case ok && !fresh && (!quotaOK || !clientMayFetch()):
		// stale, but we can't/shouldn't refresh (global quota spent, or this
		// client is over its budget): serve stale as-is.
		w.Header().Set("X-EatRai-Degraded", "stale")
		writeJSON(w, http.StatusOK, map[string]any{"cards": val, "cached": true, "stale": true})
		return

	case ok && !fresh:
		// stale + allowed: serve stale now, refresh in the background (live only).
		if !s.Mock {
			go s.refreshNearby(context.Background(), key, cellLat, cellLng, cuisine, bucket, lang, base)
		}
		w.Header().Set("Cache-Control", "public, max-age=300")
		writeJSON(w, http.StatusOK, map[string]any{"cards": val, "cached": true, "stale": true})
		return

	case !ok && (!quotaOK || !clientMayFetch()) && !s.Mock:
		// miss + can't fetch (global quota spent, or client over budget):
		// degrade to mock rather than call Google.
		cards := places.MockNearby(nearbyQuery(cellLat, cellLng, cuisine, bucket, lang))
		w.Header().Set("X-EatRai-Degraded", "mock")
		writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
		return
	}

	// miss + allowed: fetch.
	cards, err := s.fetchNearby(r.Context(), cellLat, cellLng, cuisine, bucket, lang, base)
	if err != nil {
		s.Log.Error("places search", "err", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not reach the restaurant service"})
		return
	}
	if cards == nil {
		cards = []places.Card{}
	}
	s.Cache.SetTTL(key, cards, nearbyTTL)
	w.Header().Set("Cache-Control", "public, max-age=300")
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func nearbyQuery(cellLat, cellLng float64, cuisine string, bucket int, lang string) places.Query {
	var cats []string
	if cuisine != "" {
		cats = []string{cuisine}
	}
	return places.Query{Lat: cellLat, Lng: cellLng, RadiusM: float64(bucket), Categories: cats, Lang: lang}
}

func (s *Server) fetchNearby(ctx context.Context, cellLat, cellLng float64, cuisine string, bucket int, lang, base string) ([]places.Card, error) {
	if s.Mock {
		return places.MockNearby(nearbyQuery(cellLat, cellLng, cuisine, bucket, lang)), nil
	}
	s.Quota.Count("search")
	return s.Places.SearchCuisine(ctx, cellLat, cellLng, cuisine, bucket, lang, base)
}

// refreshNearby re-fetches a cell in the background after a stale hit. Best
// effort — a failure just leaves the stale entry in place for the next request.
func (s *Server) refreshNearby(ctx context.Context, key string, cellLat, cellLng float64, cuisine string, bucket int, lang, base string) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cards, err := s.fetchNearby(ctx, cellLat, cellLng, cuisine, bucket, lang, base)
	if err != nil {
		s.Log.Warn("nearby background refresh", "err", err)
		return
	}
	if cards == nil {
		cards = []places.Card{}
	}
	s.Cache.SetTTL(key, cards, nearbyTTL)
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
	val, fresh, ok := s.Cache.GetStale(key)
	if ok && fresh {
		writeJSON(w, http.StatusOK, val)
		return
	}

	// Out of Place Details quota: serve a stale copy if we have one rather than
	// spend a call. (Details barely change, so stale is fine.)
	if !s.Mock && s.Quota.Exceeded("details") {
		if ok {
			w.Header().Set("X-EatRai-Degraded", "stale")
			writeJSON(w, http.StatusOK, val)
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "place details are temporarily unavailable"})
		return
	}

	var (
		place places.Place
		err   error
	)
	if s.Mock {
		place = places.MockPlace(id, lang, lat, lng)
	} else {
		s.Quota.Count("details")
		place, err = s.Places.GetPlace(r.Context(), id, lang, publicBase(r), lat, lng)
		if err != nil {
			s.Log.Error("places detail", "err", err)
			if ok {
				w.Header().Set("X-EatRai-Degraded", "stale")
				writeJSON(w, http.StatusOK, val)
				return
			}
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not load that place"})
			return
		}
	}

	s.Cache.SetTTL(key, place, 24*time.Hour)
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
	lat, _ := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, _ := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		lat, lng = 0, 0
	}

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
		key := fmt.Sprintf("lite|%s|%s|%.3f,%.3f", id, lang, round3(lat), round3(lng))
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
			c, err := s.Places.GetPlaceLite(ctx, id, lang, base, lat, lng)
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
	placeID := strings.TrimSpace(r.URL.Query().Get("placeId"))
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	lang := normLang(r.URL.Query().Get("lang"))
	if placeID == "" && len(q) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "q or placeId is required"})
		return
	}

	// A placeId comes from an autocomplete pick — resolve it (and close the
	// session), don't cache (it's a one-shot). Free-text queries are cached.
	if placeID != "" {
		var (
			lat, lng float64
			label    string
			err      error
		)
		if s.Mock {
			lat, lng, label = places.MockGeocode(placeID)
		} else {
			lat, lng, label, err = s.Places.PlaceLocation(r.Context(), placeID, token, lang)
		}
		if err != nil {
			s.Log.Warn("place location", "err", err)
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "couldn't find that place"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"lat": lat, "lng": lng, "label": label})
		return
	}

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

func (s *Server) handleSuggest(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeJSON(w, http.StatusOK, map[string]any{"suggestions": []any{}})
		return
	}
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	lang := normLang(r.URL.Query().Get("lang"))
	lat, _ := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, _ := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)

	var (
		sugs []places.Suggestion
		err  error
	)
	if s.Mock {
		sugs = places.MockAutocomplete(q)
	} else {
		sugs, err = s.Places.Autocomplete(r.Context(), q, token, lang, lat, lng)
		if err != nil {
			s.Log.Warn("autocomplete", "err", err)
			writeJSON(w, http.StatusOK, map[string]any{"suggestions": []any{}})
			return
		}
	}
	if sugs == nil {
		sugs = []places.Suggestion{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"suggestions": sugs})
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

// photoNameRe matches exactly Google's photo resource name shape
// ("places/<id>/photos/<id>") — no extra segments, no "..", "?", "#", or other
// characters that could redirect the outbound request to a different path once
// concatenated into the Places Photo URL.
var photoNameRe = regexp.MustCompile(`^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$`)

func (s *Server) handlePhoto(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if !photoNameRe.MatchString(name) {
		http.Error(w, "bad photo name", http.StatusBadRequest)
		return
	}
	if s.Mock {
		http.Error(w, "no photos in mock mode", http.StatusNotFound)
		return
	}
	if s.Quota.Exceeded("photo") {
		// Out of Photo quota — let the client fall back to its placeholder.
		http.Error(w, "photo temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	width, _ := strconv.Atoi(r.URL.Query().Get("w"))

	s.Quota.Count("photo")
	body, ct, err := s.Places.FetchPhoto(r.Context(), name, width)
	if err != nil {
		s.Log.Error("places photo", "err", err)
		http.Error(w, "photo unavailable", http.StatusBadGateway)
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", ct)
	// Immutable: a Places photo resource name never changes its bytes, so the
	// edge / browser can keep it for a year. See Part 5 / Part 9.
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
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
