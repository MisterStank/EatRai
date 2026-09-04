package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// These cover the five /place, /list, /geocode, /suggest, /reverse handlers in
// mock mode — previously untested (0% coverage), unlike /nearby and /photo.

func TestHandlePlace(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	t.Run("success", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/place?id=abc123&lang=en")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["id"] != "abc123" {
			t.Fatalf("id = %v, want abc123", body["id"])
		}
	})

	t.Run("missing id", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/place")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", resp.StatusCode)
		}
	})
}

func TestHandleList(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	t.Run("success", func(t *testing.T) {
		// Mock place ids come from the curated mock dataset — grab two real
		// ones from /nearby rather than guessing at the id format.
		nearby, err := http.Get(ts.URL + "/nearby?lat=13.75&lng=100.5")
		if err != nil {
			t.Fatal(err)
		}
		var nb struct {
			Cards []struct {
				ID string `json:"id"`
			} `json:"cards"`
		}
		if err := json.NewDecoder(nearby.Body).Decode(&nb); err != nil {
			t.Fatal(err)
		}
		nearby.Body.Close()
		if len(nb.Cards) < 2 {
			t.Fatalf("expected at least 2 mock cards to test /list against, got %d", len(nb.Cards))
		}
		a, b := nb.Cards[0].ID, nb.Cards[1].ID

		resp, err := http.Get(ts.URL + "/list?ids=" + a + "," + b + "," + a + ",,unknown_id")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		var body struct {
			Places []map[string]any `json:"places"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		// a deduped, empty dropped, "unknown_id" resolves to nothing -> a, b = 2
		if len(body.Places) != 2 {
			t.Fatalf("len(places) = %d, want 2 (dedup + drop empty/unresolved)", len(body.Places))
		}
	})

	t.Run("missing ids", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/list")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", resp.StatusCode)
		}
	})
}

func TestHandleGeocode(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	t.Run("free text query", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/geocode?q=Thonglor")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		var body map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["label"] == "" || body["label"] == nil {
			t.Fatalf("expected a non-empty label, got %v", body["label"])
		}
	})

	t.Run("placeId query", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/geocode?placeId=xyz&token=tok")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
	})

	t.Run("missing both q and placeId", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/geocode")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", resp.StatusCode)
		}
	})

	t.Run("q too short is treated as missing", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/geocode?q=a")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", resp.StatusCode)
		}
	})
}

func TestHandleSuggest(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	t.Run("success", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/suggest?q=thong&token=tok")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		var body struct {
			Suggestions []map[string]any `json:"suggestions"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("query too short returns empty list, not an error", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/suggest?q=a")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
		var body struct {
			Suggestions []map[string]any `json:"suggestions"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if len(body.Suggestions) != 0 {
			t.Fatalf("expected empty suggestions for a too-short query, got %d", len(body.Suggestions))
		}
	})
}

func TestHandleReverse(t *testing.T) {
	srv := newTestServer(t, 0, []string{"*"}, false)
	ts := httptest.NewServer(srv.Router())
	defer ts.Close()

	t.Run("success", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/reverse?lat=13.75&lng=100.5")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
	})

	t.Run("invalid coords", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/reverse?lat=999&lng=100.5")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", resp.StatusCode)
		}
	})
}
