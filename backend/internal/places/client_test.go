package places

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// roundTripFunc lets a plain function satisfy http.RoundTripper, so tests can
// intercept every outbound call the Client makes without touching a real
// network — no server, no URL injection into production code.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func jsonResp(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(bytes.NewBufferString(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

// testClient builds a Client whose HTTP transport is fully faked: handler is
// called once per outbound request and its return value becomes the response.
func testClient(t *testing.T, handler func(*http.Request) *http.Response) *Client {
	t.Helper()
	c := NewClient("test-key")
	c.HTTP = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			resp := handler(r)
			resp.Request = r
			return resp, nil
		}),
	}
	return c
}

const apiPlaceJSON = `{
	"id": "place1",
	"displayName": {"text": "Test Restaurant"},
	"formattedAddress": "123 Test St",
	"location": {"latitude": 13.75, "longitude": 100.5},
	"priceLevel": "PRICE_LEVEL_MODERATE",
	"rating": 4.5,
	"userRatingCount": 100,
	"types": ["thai_restaurant"],
	"photos": [{"name": "places/place1/photos/photo1"}],
	"currentOpeningHours": {"openNow": true},
	"googleMapsUri": "https://maps.google.com/?q=place1",
	"internationalPhoneNumber": "+66 2 000 0000",
	"websiteUri": "https://example.com",
	"editorialSummary": {"text": "A nice place."}
}`

func TestSearch(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		if !strings.HasSuffix(r.URL.String(), "places:searchText") {
			t.Fatalf("unexpected URL: %s", r.URL)
		}
		return jsonResp(200, `{"places":[`+apiPlaceJSON+`]}`)
	})

	cards, err := c.Search(context.Background(), Query{Lat: 13.75, Lng: 100.5, RadiusM: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if len(cards) != 1 || cards[0].Name != "Test Restaurant" {
		t.Fatalf("cards = %+v", cards)
	}
}

func TestSearchPropagatesErrorForSingleCall(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		return jsonResp(500, `{"error":{"message":"boom"}}`)
	})
	// No categories -> exactly one call -> its error must surface, not be swallowed.
	_, err := c.Search(context.Background(), Query{Lat: 13.75, Lng: 100.5, RadiusM: 1000})
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestSearchOneBadCategoryDoesntSinkTheWholeSearch(t *testing.T) {
	calls := 0
	c := testClient(t, func(r *http.Request) *http.Response {
		calls++
		if calls == 1 {
			return jsonResp(500, `{"error":{"message":"boom"}}`)
		}
		return jsonResp(200, `{"places":[`+apiPlaceJSON+`]}`)
	})
	cards, err := c.Search(context.Background(), Query{
		Lat: 13.75, Lng: 100.5, RadiusM: 1000, Categories: []string{"thai", "cafe"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(cards) != 1 {
		t.Fatalf("expected the one successful category's card to survive, got %d", len(cards))
	}
}

func TestGetPlace(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		if !strings.Contains(r.URL.String(), "/v1/places/place1") {
			t.Fatalf("unexpected URL: %s", r.URL)
		}
		return jsonResp(200, apiPlaceJSON)
	})
	p, err := c.GetPlace(context.Background(), "place1", "en", "https://api.example", 13.75, 100.5)
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "Test Restaurant" || p.Phone != "+66 2 000 0000" || p.Website != "https://example.com" {
		t.Fatalf("place = %+v", p)
	}
}

func TestGetPlaceErrorStatus(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		return jsonResp(404, `{"error":{"message":"not found"}}`)
	})
	_, err := c.GetPlace(context.Background(), "nope", "en", "https://api.example", 0, 0)
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestGetPlaceLite(t *testing.T) {
	var gotMask string
	c := testClient(t, func(r *http.Request) *http.Response {
		gotMask = r.Header.Get("X-Goog-FieldMask")
		return jsonResp(200, apiPlaceJSON)
	})
	card, err := c.GetPlaceLite(context.Background(), "place1", "en", "https://api.example")
	if err != nil {
		t.Fatal(err)
	}
	if card.Name != "Test Restaurant" {
		t.Fatalf("card = %+v", card)
	}
	if gotMask != liteDetailMask {
		t.Fatalf("expected the lite field mask, not the full detail one — got %q", gotMask)
	}
}

func TestFetchPhoto(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		if !strings.Contains(r.URL.String(), "places/place1/photos/photo1/media") {
			t.Fatalf("unexpected URL: %s", r.URL)
		}
		if !strings.Contains(r.URL.String(), "maxWidthPx=") {
			t.Fatal("expected a maxWidthPx query param")
		}
		if r.Header.Get("X-Goog-Api-Key") == "" {
			t.Fatal("expected the API key on the header, not the URL")
		}
		resp := jsonResp(200, "")
		resp.Body = io.NopCloser(bytes.NewBufferString("fake-jpeg-bytes"))
		resp.Header.Set("Content-Type", "image/jpeg")
		return resp
	})
	body, ct, err := c.FetchPhoto(context.Background(), "places/place1/photos/photo1", 800)
	if err != nil {
		t.Fatal(err)
	}
	defer body.Close()
	if ct != "image/jpeg" {
		t.Fatalf("content-type = %q", ct)
	}
	data, _ := io.ReadAll(body)
	if string(data) != "fake-jpeg-bytes" {
		t.Fatalf("body = %q", data)
	}
}

func TestFetchPhotoErrorStatus(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		return jsonResp(404, "")
	})
	_, _, err := c.FetchPhoto(context.Background(), "places/x/photos/y", 800)
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestGeocode(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		if !strings.HasSuffix(r.URL.String(), "places:searchText") {
			t.Fatalf("unexpected URL: %s", r.URL)
		}
		return jsonResp(200, `{"places":[{"displayName":{"text":"Thong Lo"},"formattedAddress":"Thong Lo, Bangkok","location":{"latitude":13.74,"longitude":100.58}}]}`)
	})
	lat, lng, label, err := c.Geocode(context.Background(), "Thonglor", "en")
	if err != nil {
		t.Fatal(err)
	}
	if label != "Thong Lo" || lat != 13.74 || lng != 100.58 {
		t.Fatalf("lat=%v lng=%v label=%q", lat, lng, label)
	}
}

func TestGeocodeNoMatch(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		return jsonResp(200, `{"places":[]}`)
	})
	_, _, _, err := c.Geocode(context.Background(), "nowhere", "en")
	if err == nil {
		t.Fatal("expected an error for zero matches")
	}
}

func TestPlaceLocation(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		if !strings.Contains(r.URL.String(), "sessionToken=tok123") {
			t.Fatalf("expected the session token on the query string: %s", r.URL)
		}
		return jsonResp(200, `{"location":{"latitude":13.74,"longitude":100.58},"displayName":{"text":"Thong Lo"}}`)
	})
	lat, lng, label, err := c.PlaceLocation(context.Background(), "place1", "tok123", "en")
	if err != nil {
		t.Fatal(err)
	}
	if label != "Thong Lo" || lat != 13.74 || lng != 100.58 {
		t.Fatalf("lat=%v lng=%v label=%q", lat, lng, label)
	}
}

func TestAutocomplete(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if body["input"] != "thong" {
			t.Fatalf("body = %+v", body)
		}
		return jsonResp(200, `{"suggestions":[{"placePrediction":{"placeId":"p1","structuredFormat":{"mainText":{"text":"Thong Lo"},"secondaryText":{"text":"Bangkok"}}}}]}`)
	})
	sugs, err := c.Autocomplete(context.Background(), "thong", "tok", "en", 13.75, 100.5)
	if err != nil {
		t.Fatal(err)
	}
	if len(sugs) != 1 || sugs[0].PlaceID != "p1" || sugs[0].Primary != "Thong Lo" {
		t.Fatalf("sugs = %+v", sugs)
	}
}

func TestAutocompleteSkipsEntriesWithoutPlaceID(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		return jsonResp(200, `{"suggestions":[{"placePrediction":{"placeId":""}},{"placePrediction":{"placeId":"p2","text":{"text":"Fallback text"}}}]}`)
	})
	sugs, err := c.Autocomplete(context.Background(), "x", "", "en", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(sugs) != 1 || sugs[0].PlaceID != "p2" || sugs[0].Primary != "Fallback text" {
		t.Fatalf("sugs = %+v", sugs)
	}
}

func TestReverseFromCommonVenue(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		return jsonResp(200, `{"places":[
			{"displayName":{"text":"After You (Siam Paragon)"}},
			{"displayName":{"text":"U.S. POLO ASSN. - SIAM PARAGON"}},
			{"displayName":{"text":"Mothercare Thailand - Siam Paragon"}}
		]}`)
	})
	label, err := c.Reverse(context.Background(), 13.75, 100.5, "en")
	if err != nil {
		t.Fatal(err)
	}
	if label != "Siam Paragon" {
		t.Fatalf("label = %q", label)
	}
}

func TestReverseFallsBackToStationWhenNoCommonVenue(t *testing.T) {
	calls := 0
	c := testClient(t, func(r *http.Request) *http.Response {
		calls++
		if calls == 1 {
			// First call (venue search): nothing in common.
			return jsonResp(200, `{"places":[{"displayName":{"text":"Oak's Diner"}},{"displayName":{"text":"Paris Mikki"}}]}`)
		}
		// Second call (station search).
		return jsonResp(200, `{"places":[{"displayName":{"text":"Phrom Phong BTS Station"}}]}`)
	})
	label, err := c.Reverse(context.Background(), 13.75, 100.5, "en")
	if err != nil {
		t.Fatal(err)
	}
	if label != "Phrom Phong" {
		t.Fatalf("label = %q", label)
	}
}

func TestReverseEmptyWhenNothingFound(t *testing.T) {
	c := testClient(t, func(r *http.Request) *http.Response {
		return jsonResp(200, `{"places":[]}`)
	})
	label, err := c.Reverse(context.Background(), 13.75, 100.5, "en")
	if err != nil {
		t.Fatal(err)
	}
	if label != "" {
		t.Fatalf("label = %q, want empty", label)
	}
}
