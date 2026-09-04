package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/chakkrit/eatrai/internal/cache"
	"github.com/chakkrit/eatrai/internal/places"
	"github.com/chakkrit/eatrai/internal/ratelimit"
)

// newTestServer builds a Server in mock mode (no real Places API calls) with a
// fresh cache and rate limiter, so tests don't share state with each other.
func newTestServer(t *testing.T, maxRPM int, allowedOrigins []string, requireOrigin bool) *Server {
	t.Helper()
	return &Server{
		Places:         places.NewClient(""),
		Cache:          cache.New(time.Minute),
		Limiter:        ratelimit.New(maxRPM, time.Minute),
		Mock:           true,
		AllowedOrigins: allowedOrigins,
		RequireOrigin:  requireOrigin,
		Log:            slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
}

// --- origin gate -----------------------------------------------------------

func TestOriginGate(t *testing.T) {
	cases := []struct {
		name          string
		allowed       []string
		requireOrigin bool
		origin        string
		referer       string
		wantStatus    int
	}{
		{"allowed origin passes", []string{"https://eatrai.help"}, true, "https://eatrai.help", "", http.StatusOK},
		{"disallowed origin blocked", []string{"https://eatrai.help"}, true, "https://evil.example.com", "", http.StatusForbidden},
		{"no origin, no referer passes (native app / curl)", []string{"https://eatrai.help"}, true, "", "", http.StatusOK},
		{"referer used when origin absent, allowed", []string{"https://eatrai.help"}, true, "", "https://eatrai.help/page", http.StatusOK},
		{"referer used when origin absent, blocked", []string{"https://eatrai.help"}, true, "", "https://evil.example.com/page", http.StatusForbidden},
		{"wildcard origin always passes", []string{"*"}, true, "https://evil.example.com", "", http.StatusOK},
		{"requireOrigin off: disallowed origin still passes", []string{"https://eatrai.help"}, false, "https://evil.example.com", "", http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := newTestServer(t, 0, tc.allowed, tc.requireOrigin) // 0 -> ratelimit.New default (60/min), plenty for one request
			ts := httptest.NewServer(srv.Router())
			defer ts.Close()

			req, _ := http.NewRequest(http.MethodGet, ts.URL+"/nearby?lat=13.7&lng=100.5", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if tc.referer != "" {
				req.Header.Set("Referer", tc.referer)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.wantStatus {
				t.Fatalf("status = %d, want %d", resp.StatusCode, tc.wantStatus)
			}
		})
	}
}

// --- rate limiter / X-Forwarded-For spoofing regression --------------------

// TestRateLimitKeyedOnTrustedIP is a regression test for a bug where clientIP()
// trusted the FIRST entry in X-Forwarded-For — which is fully client-supplied —
// instead of the LAST entry, which is the one Cloud Run's frontend appends and
// the client cannot forge. That let a caller dodge the per-IP rate limit by
// sending a different fake first entry on every request.
func TestRateLimitKeyedOnTrustedIP(t *testing.T) {
	srv := newTestServer(t, 1, []string{"*"}, false) // requireOrigin off: isolate rate-limit behavior
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	get := func(xff string) int {
		req, _ := http.NewRequest(http.MethodGet, ts.URL+"/nearby?lat=13.7&lng=100.5", nil)
		if xff != "" {
			req.Header.Set("X-Forwarded-For", xff)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		return resp.StatusCode
	}

	// Same trusted (trailing) IP, different attacker-supplied prefixes each
	// time — mirrors what Cloud Run's frontend actually produces: it appends
	// the real client IP after whatever the client already sent.
	if got := get("10.0.0.1, 5.5.5.5"); got != http.StatusOK {
		t.Fatalf("first request: status = %d, want 200", got)
	}
	if got := get("10.0.0.2, 5.5.5.5"); got != http.StatusTooManyRequests {
		t.Fatalf("second request (spoofed prefix, same trailing IP): status = %d, want 429 — rate limit was bypassed by X-Forwarded-For spoofing", got)
	}

	// A genuinely different trusted IP gets its own, independent bucket.
	if got := get("10.0.0.3, 6.6.6.6"); got != http.StatusOK {
		t.Fatalf("different trailing IP: status = %d, want 200", got)
	}
}

// --- /photo: route wiring + name validation ---------------------------------

// TestPhotoIsRateLimited is a regression test for a bug where /photo was
// registered outside the rate-limited route group entirely, so it had zero
// abuse protection despite proxying a paid Places Photo API call per hit.
func TestPhotoIsRateLimited(t *testing.T) {
	srv := newTestServer(t, 1, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	url := ts.URL + "/photo?name=places%2Fabc%2Fphotos%2Fxyz"
	resp1, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	resp1.Body.Close()
	// Mock mode short-circuits with 404 for a validly-shaped name — that's
	// fine, it proves the request reached the handler at all.
	if resp1.StatusCode != http.StatusNotFound {
		t.Fatalf("first request: status = %d, want 404 (mock mode, no real photos)", resp1.StatusCode)
	}

	resp2, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("second request: status = %d, want 429 — /photo is not rate-limited", resp2.StatusCode)
	}
}

func TestPhotoNameValidation(t *testing.T) {
	cases := []struct {
		name       string
		photoName  string
		wantStatus int
	}{
		{"valid shape", "places/abc123/photos/XYZ_-9", http.StatusNotFound}, // reaches handler, mock mode has no photos
		{"missing prefix", "abc123/photos/XYZ", http.StatusBadRequest},
		{"missing photos segment", "places/abc123", http.StatusBadRequest},
		{"path traversal", "places/abc/photos/xyz/../../../secret", http.StatusBadRequest},
		{"extra path segment", "places/abc/photos/xyz/extra", http.StatusBadRequest},
		{"query injection", "places/abc/photos/xyz?evil=1", http.StatusBadRequest},
		{"empty", "", http.StatusBadRequest},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := newTestServer(t, 0, []string{"*"}, false)
			ts := httptest.NewServer(srv.Router())
			defer ts.Close()

			resp, err := http.Get(ts.URL + "/photo?name=" + url.QueryEscape(tc.photoName))
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.wantStatus {
				t.Fatalf("status = %d, want %d", resp.StatusCode, tc.wantStatus)
			}
		})
	}
}
