package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/chakkrit/eatrai/internal/iplimit"
	"github.com/chakkrit/eatrai/internal/places"
	"github.com/chakkrit/eatrai/internal/quota"
)

func getNearbyJSON(t *testing.T, base, qs string) map[string]any {
	t.Helper()
	resp, err := http.Get(base + "/nearby?" + qs)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /nearby?%s: status %d", qs, resp.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	return body
}

// TestNearbyCacheKeyCollapses: the /nearby cache key is (cell, cuisine, bucket,
// lang) only. Jittered coords in the same 0.003° cell, and different
// openNow/minRating/sort/radius, must all hit the same entry.
func TestNearbyCacheKeyCollapses(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	first := getNearbyJSON(t, ts.URL,
		"lat=13.7461&lng=100.5341&cuisine=noodles&openNow=true&minRating=4&sort=match&radius=1500")
	if first["cached"] == true {
		t.Fatal("first request should be a cache miss")
	}

	second := getNearbyJSON(t, ts.URL,
		"lat=13.7449&lng=100.5329&cuisine=noodles&openNow=false&minRating=2&sort=near&radius=3000")
	if second["cached"] != true {
		t.Fatalf("second request (same cell, different filter params) should hit the cache: %v", second)
	}
}

// TestNearbyCategoriesCompatShim: a legacy `categories=a,b` CSV is treated as
// `cuisine=a` — same cache key as an explicit `cuisine=a`.
func TestNearbyCategoriesCompatShim(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	if b := getNearbyJSON(t, ts.URL, "lat=13.75&lng=100.5&cuisine=noodles"); b["cached"] == true {
		t.Fatal("first request should be a cache miss")
	}
	b := getNearbyJSON(t, ts.URL, "lat=13.75&lng=100.5&categories=noodles,japanese")
	if b["cached"] != true {
		t.Fatalf("categories=noodles,... should reuse the cuisine=noodles cache entry: %v", b)
	}
}

// TestNearbyServesStaleWhenQuotaExceeded: with the search quota spent, an
// expired cache entry is still served (200) with X-EatRai-Degraded: stale
// instead of calling Google.
func TestNearbyServesStaleWhenQuotaExceeded(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	srv.Quota = quota.New(map[string]int{"search": 1})
	srv.Quota.Count("search") // 1/1 -> Exceeded

	// lat=13.75 -> Snap 13.749; lng=100.5 -> Snap 100.5; no cuisine; bucket 5000.
	const key = "n|13.749,100.500||r5000|"
	srv.Cache.SetTTL(key, []places.Card{{ID: "stale1", Name: "Old Noodle"}}, time.Nanosecond)
	time.Sleep(2 * time.Millisecond)

	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/nearby?lat=13.75&lng=100.5")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (serve stale, never error the app)", resp.StatusCode)
	}
	if got := resp.Header.Get("X-EatRai-Degraded"); got != "stale" {
		t.Fatalf("X-EatRai-Degraded = %q, want %q", got, "stale")
	}
	var body struct {
		Cards  []places.Card `json:"cards"`
		Stale  bool          `json:"stale"`
		Cached bool          `json:"cached"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Cards) != 1 || body.Cards[0].ID != "stale1" || !body.Stale {
		t.Fatalf("expected the stale card back, got %+v", body)
	}
}

// TestNearbyPerClientLimitDegrades: a client over its per-(ip|token) budget gets
// stale data + X-EatRai-Degraded, keyed on X-EatRai-Client + the trusted IP,
// never a 429.
func TestNearbyPerClientLimitDegrades(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	srv.IPLimit = iplimit.New(1, 100, 100, 1000)
	srv.IPLimit.Allow("9.9.9.9", "tokX") // consume the client's single hourly slot

	const key = "n|13.749,100.500||r5000|"
	srv.Cache.SetTTL(key, []places.Card{{ID: "stale1", Name: "Old"}}, time.Nanosecond)
	time.Sleep(2 * time.Millisecond)

	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/nearby?lat=13.75&lng=100.5", nil)
	req.Header.Set("X-Forwarded-For", "9.9.9.9")
	req.Header.Set("X-EatRai-Client", "tokX")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 (never 429 for the app)", resp.StatusCode)
	}
	if got := resp.Header.Get("X-EatRai-Degraded"); got != "stale" {
		t.Fatalf("X-EatRai-Degraded = %q, want stale", got)
	}

	// a different token on the same IP still gets a fresh fetch (its own budget)
	req2, _ := http.NewRequest(http.MethodGet, ts.URL+"/nearby?lat=13.75&lng=100.5", nil)
	req2.Header.Set("X-Forwarded-For", "9.9.9.9")
	req2.Header.Set("X-EatRai-Client", "tokFRESH")
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.Header.Get("X-EatRai-Degraded") != "" {
		t.Fatal("a fresh token on the same IP should not be degraded")
	}
}

// TestNearbyCardsCarryLocation: mock cards expose a Location for the client-side
// distance computation.
func TestNearbyCardsCarryLocation(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/nearby?lat=13.75&lng=100.5")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Cards []places.Card `json:"cards"`
	}
	json.NewDecoder(resp.Body).Decode(&body)
	if len(body.Cards) == 0 {
		t.Fatal("no cards")
	}
	if body.Cards[0].Location.Lat == 0 || body.Cards[0].Location.Lng == 0 {
		t.Fatalf("card is missing Location: %+v", body.Cards[0])
	}
}
