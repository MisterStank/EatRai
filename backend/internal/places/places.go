// Package places is a thin, stateless client for Google Places (New): a nearby
// search normalised into swipe cards, plus a photo passthrough that keeps the
// API key on the server. No persistence — the caller caches.
package places

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	searchURL  = "https://places.googleapis.com/v1/places:searchNearby"
	photoMedia = "https://places.googleapis.com/v1/%s/media"
	searchMask = "places.id,places.displayName,places.formattedAddress,places.location," +
		"places.priceLevel,places.rating,places.userRatingCount,places.types," +
		"places.primaryTypeDisplayName,places.photos,places.currentOpeningHours.openNow," +
		"places.googleMapsUri"
)

// Card is what the app renders. Stable JSON shape shared with the mobile client.
type Card struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Address     string   `json:"address"`
	PriceLevel  int      `json:"priceLevel"` // 0..4, 0 = unknown
	Rating      float64  `json:"rating"`
	RatingCount int      `json:"ratingCount"`
	PhotoURLs   []string `json:"photoUrls"`
	Cuisines    []string `json:"cuisines"`
	DistanceM   int      `json:"distanceM"`
	OpenNow     bool     `json:"openNow"`
	OpenKnown   bool     `json:"openKnown"`
	MapsURI     string   `json:"mapsUri"`
}

type Client struct {
	APIKey string
	HTTP   *http.Client
}

func NewClient(key string) *Client {
	return &Client{APIKey: key, HTTP: &http.Client{Timeout: 12 * time.Second}}
}

// Query is one nearby request.
type Query struct {
	Lat, Lng   float64
	RadiusM    float64
	Categories []string // friendly keys; see categoryTypes
	OpenNow    bool
	// PhotoBase is the public base URL of this service (e.g. https://api.example
	// or http://localhost:8080) used to build proxied photo links.
	PhotoBase string
}

// SearchNearby calls Places and returns normalised cards, nearest first.
func (c *Client) SearchNearby(ctx context.Context, q Query) ([]Card, error) {
	reqBody, _ := json.Marshal(map[string]any{
		"includedTypes":  includedTypes(q.Categories),
		"maxResultCount": 20,
		"locationRestriction": map[string]any{
			"circle": map[string]any{
				"center": map[string]float64{"latitude": q.Lat, "longitude": q.Lng},
				"radius": clampRadius(q.RadiusM),
			},
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, searchURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.APIKey)
	req.Header.Set("X-Goog-FieldMask", searchMask)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error struct{ Message string } `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&e)
		return nil, fmt.Errorf("places %d: %s", resp.StatusCode, e.Error.Message)
	}

	var out struct {
		Places []apiPlace `json:"places"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	cards := make([]Card, 0, len(out.Places))
	for _, p := range out.Places {
		card := p.toCard(q.Lat, q.Lng, q.PhotoBase)
		if q.OpenNow && card.OpenKnown && !card.OpenNow {
			continue
		}
		cards = append(cards, card)
	}
	sort.SliceStable(cards, func(i, j int) bool { return cards[i].DistanceM < cards[j].DistanceM })
	return cards, nil
}

// FetchPhoto streams the bytes for a Places photo resource name
// ("places/X/photos/Y"). Keeps the API key server-side.
func (c *Client) FetchPhoto(ctx context.Context, name string, maxWidth int) (io.ReadCloser, string, error) {
	if maxWidth <= 0 || maxWidth > 1600 {
		maxWidth = 900
	}
	u := fmt.Sprintf(photoMedia, name) + fmt.Sprintf("?maxWidthPx=%d&key=%s", maxWidth, url.QueryEscape(c.APIKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, "", fmt.Errorf("photo %d", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "image/jpeg"
	}
	return resp.Body, ct, nil
}

// --- Places (New) response shapes -------------------------------------------

type apiPlace struct {
	ID               string                                `json:"id"`
	DisplayName      struct{ Text string }                 `json:"displayName"`
	FormattedAddress string                                `json:"formattedAddress"`
	Location         struct{ Latitude, Longitude float64 } `json:"location"`
	PriceLevel       string                                `json:"priceLevel"`
	Rating           float64                               `json:"rating"`
	UserRatingCount  int                                   `json:"userRatingCount"`
	Types            []string                              `json:"types"`
	PrimaryTypeDisp  struct{ Text string }                 `json:"primaryTypeDisplayName"`
	Photos           []struct {
		Name string `json:"name"`
	} `json:"photos"`
	CurrentOpeningHours struct {
		OpenNow *bool `json:"openNow"`
	} `json:"currentOpeningHours"`
	GoogleMapsURI string `json:"googleMapsUri"`
}

func (p apiPlace) toCard(lat, lng float64, photoBase string) Card {
	c := Card{
		ID:          p.ID,
		Name:        p.DisplayName.Text,
		Address:     p.FormattedAddress,
		PriceLevel:  priceLevel(p.PriceLevel),
		Rating:      p.Rating,
		RatingCount: p.UserRatingCount,
		Cuisines:    cuisines(p.Types, p.PrimaryTypeDisp.Text),
		DistanceM:   int(math.Round(haversineM(lat, lng, p.Location.Latitude, p.Location.Longitude))),
		MapsURI:     p.GoogleMapsURI,
	}
	if p.CurrentOpeningHours.OpenNow != nil {
		c.OpenKnown = true
		c.OpenNow = *p.CurrentOpeningHours.OpenNow
	}
	if c.MapsURI == "" {
		c.MapsURI = "https://www.google.com/maps/search/?api=1&query=" +
			url.QueryEscape(p.DisplayName.Text) + "&query_place_id=" + url.QueryEscape(p.ID)
	}
	for i, ph := range p.Photos {
		if i == 3 {
			break
		}
		c.PhotoURLs = append(c.PhotoURLs, photoBase+"/photo?name="+url.QueryEscape(ph.Name)+"&w=900")
	}
	return c
}

// --- mapping ---------------------------------------------------------------

// categoryTypes maps the app's friendly filter keys to Places (New) primary
// types. Unknown keys fall back to a plain "restaurant" search.
var categoryTypes = map[string][]string{
	"thai":       {"thai_restaurant"},
	"isaan":      {"thai_restaurant"},
	"noodles":    {"ramen_restaurant", "vietnamese_restaurant"},
	"street":     {"fast_food_restaurant"},
	"seafood":    {"seafood_restaurant"},
	"japanese":   {"japanese_restaurant", "sushi_restaurant", "ramen_restaurant"},
	"cafe":       {"cafe", "coffee_shop"},
	"bar":        {"bar"},
	"bbq":        {"barbecue_restaurant"},
	"dessert":    {"dessert_restaurant", "ice_cream_shop", "bakery"},
	"vegetarian": {"vegetarian_restaurant", "vegan_restaurant"},
	"chinese":    {"chinese_restaurant"},
	"korean":     {"korean_restaurant"},
	"indian":     {"indian_restaurant"},
	"italian":    {"italian_restaurant"},
	"pizza":      {"pizza_restaurant"},
	"burgers":    {"hamburger_restaurant"},
}

func includedTypes(categories []string) []string {
	if len(categories) == 0 {
		return []string{"restaurant"}
	}
	seen := map[string]bool{}
	var out []string
	for _, k := range categories {
		ts, ok := categoryTypes[strings.ToLower(strings.TrimSpace(k))]
		if !ok {
			ts = []string{"restaurant"}
		}
		for _, t := range ts {
			if !seen[t] {
				seen[t] = true
				out = append(out, t)
			}
		}
	}
	if len(out) == 0 {
		out = []string{"restaurant"}
	}
	if len(out) > 50 {
		out = out[:50]
	}
	return out
}

var typeLabel = map[string]string{
	"thai_restaurant": "Thai", "japanese_restaurant": "Japanese", "chinese_restaurant": "Chinese",
	"korean_restaurant": "Korean", "vietnamese_restaurant": "Vietnamese", "indian_restaurant": "Indian",
	"italian_restaurant": "Italian", "mexican_restaurant": "Mexican", "french_restaurant": "French",
	"american_restaurant": "American", "seafood_restaurant": "Seafood", "sushi_restaurant": "Sushi",
	"ramen_restaurant": "Ramen", "pizza_restaurant": "Pizza", "hamburger_restaurant": "Burgers",
	"barbecue_restaurant": "BBQ", "vegetarian_restaurant": "Vegetarian", "vegan_restaurant": "Vegan",
	"breakfast_restaurant": "Breakfast", "brunch_restaurant": "Brunch", "cafe": "Café",
	"coffee_shop": "Coffee", "bakery": "Bakery", "bar": "Bar", "fast_food_restaurant": "Fast food",
	"fine_dining_restaurant": "Fine dining", "steak_house": "Steakhouse", "ice_cream_shop": "Ice cream",
	"dessert_restaurant": "Dessert", "dessert_shop": "Dessert",
}

func cuisines(types []string, primary string) []string {
	seen := map[string]bool{}
	var out []string
	for _, t := range types {
		if l, ok := typeLabel[t]; ok && !seen[l] {
			seen[l] = true
			out = append(out, l)
		}
	}
	if len(out) == 0 && primary != "" {
		out = append(out, primary)
	}
	if len(out) == 0 {
		out = append(out, "Restaurant")
	}
	if len(out) > 3 {
		out = out[:3]
	}
	return out
}

func priceLevel(s string) int {
	switch s {
	case "PRICE_LEVEL_INEXPENSIVE":
		return 1
	case "PRICE_LEVEL_MODERATE":
		return 2
	case "PRICE_LEVEL_EXPENSIVE":
		return 3
	case "PRICE_LEVEL_VERY_EXPENSIVE":
		return 4
	default:
		return 0
	}
}

func clampRadius(m float64) float64 {
	if m < 200 {
		return 200
	}
	if m > 50000 {
		return 50000
	}
	return m
}

func haversineM(lat1, lon1, lat2, lon2 float64) float64 {
	const r = 6371000.0
	p := math.Pi / 180
	a := 0.5 - math.Cos((lat2-lat1)*p)/2 +
		math.Cos(lat1*p)*math.Cos(lat2*p)*(1-math.Cos((lon2-lon1)*p))/2
	return 2 * r * math.Asin(math.Sqrt(a))
}
