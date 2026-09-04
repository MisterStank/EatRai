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
	"strconv"
	"strings"
	"time"
)

const (
	searchTextURL   = "https://places.googleapis.com/v1/places:searchText"
	autocompleteURL = "https://places.googleapis.com/v1/places:autocomplete"
	geocodeAPIURL   = "https://maps.googleapis.com/maps/api/geocode/json"
	detailURL       = "https://places.googleapis.com/v1/places/"
	photoMedia      = "https://places.googleapis.com/v1/%s/media"
	searchMask      = "places.id,places.displayName,places.formattedAddress,places.location," +
		"places.priceLevel,places.priceRange,places.rating,places.userRatingCount,places.types," +
		"places.primaryTypeDisplayName,places.photos,places.currentOpeningHours.openNow," +
		"places.googleMapsUri"
	detailMask = "id,displayName,formattedAddress,location,priceLevel,priceRange,rating," +
		"userRatingCount,types,primaryTypeDisplayName,photos,googleMapsUri," +
		"currentOpeningHours.openNow,currentOpeningHours.weekdayDescriptions," +
		"regularOpeningHours.weekdayDescriptions,internationalPhoneNumber," +
		"nationalPhoneNumber,websiteUri,editorialSummary"
	// liteDetailMask is the Pro-tier subset used to resolve a shared list — no
	// phone/website/summary (which push Place Details into the pricier tier).
	liteDetailMask = "id,displayName,formattedAddress,location,priceLevel,priceRange,rating," +
		"userRatingCount,types,primaryTypeDisplayName,photos,googleMapsUri," +
		"currentOpeningHours.openNow"

	nearbyPhotos = 5
	detailPhotos = 10
)

// PriceRange is a per-person spend band from Google (e.g. ฿200–400). Nil when
// Google has no range for the place.
type PriceRange struct {
	Start    int    `json:"start,omitempty"` // 0 = no lower bound given
	End      int    `json:"end,omitempty"`   // 0 = no upper bound given
	Currency string `json:"currency"`        // ISO 4217, e.g. "THB"
}

// Card is what the app renders. Stable JSON shape shared with the mobile client.
type Card struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Address     string      `json:"address"`
	PriceLevel  int         `json:"priceLevel"` // 0..4, 0 = unknown (kept for the price filter)
	PriceRange  *PriceRange `json:"priceRange,omitempty"`
	Rating      float64     `json:"rating"`
	RatingCount int         `json:"ratingCount"`
	PhotoURLs   []string    `json:"photoUrls"`
	Cuisines    []string    `json:"cuisines"`
	DistanceM   int         `json:"distanceM"`
	OpenNow     bool        `json:"openNow"`
	OpenKnown   bool        `json:"openKnown"`
	MapsURI     string      `json:"mapsUri"`
}

// Place is the detail payload from /place — a Card plus contact / hours info.
type Place struct {
	Card
	Phone        string   `json:"phone"`
	Website      string   `json:"website"`
	Summary      string   `json:"summary"`
	WeekdayHours []string `json:"weekdayHours"`
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
	Lat, Lng    float64
	RadiusM     float64
	Categories  []string // friendly keys; see categoryQueries
	OpenNow     bool
	MinRating   float64 // 0 = any; Google accepts multiples of 0.5
	PriceLevels []int   // 1..4; empty = any
	Sort        string  // "match" = relevance; anything else = nearest
	Lang        string  // "" or "th" — Places languageCode
	// PhotoBase is the public base URL of this service (e.g. https://api.example
	// or http://localhost:8080) used to build proxied photo links.
	PhotoBase string
}

func (q Query) rankPreference() string {
	if q.Sort == "match" {
		return "RELEVANCE"
	}
	return "DISTANCE"
}

// Search resolves a Query to swipe cards. Every category becomes a Text Search
// (New) call — one call with a plain "restaurant" query when no category is
// picked, otherwise one call per selected category — and the results are merged
// and de-duped. Text Search is used (not the old type-filtered Nearby Search)
// because it's the only endpoint that filters by rating and price server-side.
func (c *Client) Search(ctx context.Context, q Query) ([]Card, error) {
	type call struct{ text, typ string }
	var calls []call
	if qs := categoryQueries(q.Categories, q.Lang); len(qs) > 0 {
		for _, text := range qs {
			calls = append(calls, call{text, ""})
		}
	} else {
		calls = []call{{defaultQuery(q.Lang), "restaurant"}}
	}

	seen := map[string]bool{}
	cards := make([]Card, 0, 20)
	for _, cl := range calls {
		got, err := c.searchText(ctx, cl.text, cl.typ, q)
		if err != nil {
			if len(calls) == 1 {
				return nil, err
			}
			continue // one category failing shouldn't sink the whole search
		}
		for _, card := range got {
			if !seen[card.ID] {
				seen[card.ID] = true
				cards = append(cards, card)
			}
		}
	}
	if q.Sort != "match" {
		sort.SliceStable(cards, func(i, j int) bool { return cards[i].DistanceM < cards[j].DistanceM })
	}
	return cards, nil
}

// GetPlace fetches full Place Details for one place ID. lat/lng are optional —
// when given, the result carries a distance.
func (c *Client) GetPlace(ctx context.Context, id, lang, photoBase string, lat, lng float64) (Place, error) {
	p, err := c.placeDetails(ctx, id, lang, detailMask)
	if err != nil {
		return Place{}, err
	}
	card := p.toCard(lat, lng, photoBase, detailPhotos, langCode(lang))
	hours := p.CurrentOpeningHours.WeekdayDescriptions
	if len(hours) == 0 {
		hours = p.RegularOpeningHours.WeekdayDescriptions
	}
	return Place{
		Card:         card,
		Phone:        firstNonEmpty(p.InternationalPhoneNumber, p.NationalPhoneNumber),
		Website:      p.WebsiteURI,
		Summary:      p.EditorialSummary.Text,
		WeekdayHours: hours,
	}, nil
}

// GetPlaceLite resolves one place ID to a Card only, on the cheaper field-mask
// tier. Used to render a shared list without paying for full details on every
// row.
func (c *Client) GetPlaceLite(ctx context.Context, id, lang, photoBase string) (Card, error) {
	p, err := c.placeDetails(ctx, id, lang, liteDetailMask)
	if err != nil {
		return Card{}, err
	}
	return p.toCard(0, 0, photoBase, nearbyPhotos, langCode(lang)), nil
}

func (c *Client) placeDetails(ctx context.Context, id, lang, mask string) (apiPlace, error) {
	u := detailURL + url.PathEscape(id)
	if lc := langCode(lang); lc != "" {
		u += "?languageCode=" + lc
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return apiPlace{}, err
	}
	req.Header.Set("X-Goog-Api-Key", c.APIKey)
	req.Header.Set("X-Goog-FieldMask", mask)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return apiPlace{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error struct{ Message string } `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&e)
		return apiPlace{}, fmt.Errorf("place %d: %s", resp.StatusCode, e.Error.Message)
	}
	var p apiPlace
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return apiPlace{}, err
	}
	return p, nil
}

// searchText is one Text Search (New) call: a free-text query, optionally
// constrained to a single place type, with the query's rating / price / open /
// sort filters applied server-side and biased to the search circle.
func (c *Client) searchText(ctx context.Context, textQuery, includedType string, q Query) ([]Card, error) {
	body := map[string]any{
		"textQuery":      textQuery,
		"maxResultCount": 20,
		"rankPreference": q.rankPreference(),
		"locationBias": map[string]any{
			"circle": map[string]any{
				"center": map[string]float64{"latitude": q.Lat, "longitude": q.Lng},
				"radius": clampRadius(q.RadiusM),
			},
		},
	}
	if includedType != "" {
		body["includedType"] = includedType
	}
	if q.OpenNow {
		body["openNow"] = true
	}
	if q.MinRating > 0 {
		body["minRating"] = q.MinRating
	}
	if levels := priceLevelEnums(q.PriceLevels); len(levels) > 0 {
		body["priceLevels"] = levels
	}
	if lc := langCode(q.Lang); lc != "" {
		body["languageCode"] = lc
	}
	reqBody, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, searchTextURL, bytes.NewReader(reqBody))
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
		return nil, fmt.Errorf("searchText %d: %s", resp.StatusCode, e.Error.Message)
	}

	var out struct {
		Places []apiPlace `json:"places"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	cards := make([]Card, 0, len(out.Places))
	for _, p := range out.Places {
		card := p.toCard(q.Lat, q.Lng, q.PhotoBase, nearbyPhotos, langCode(q.Lang))
		if int(card.DistanceM) > int(clampRadius(q.RadiusM)) {
			continue
		}
		if q.OpenNow && card.OpenKnown && !card.OpenNow {
			continue
		}
		cards = append(cards, card)
	}
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

// Geocode resolves a free-text area ("Thonglor", "Siam Paragon") to a
// coordinate and a display label, via a lightweight text search. Powers the
// app's manual "change location".
func (c *Client) Geocode(ctx context.Context, query, lang string) (lat, lng float64, label string, err error) {
	body := map[string]any{"textQuery": query, "maxResultCount": 1}
	if lc := langCode(lang); lc != "" {
		body["languageCode"] = lc
	}
	reqBody, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, searchTextURL, bytes.NewReader(reqBody))
	if err != nil {
		return 0, 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.APIKey)
	req.Header.Set("X-Goog-FieldMask", "places.location,places.displayName,places.formattedAddress")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, 0, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, "", fmt.Errorf("geocode %d", resp.StatusCode)
	}
	var out struct {
		Places []apiPlace `json:"places"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return 0, 0, "", err
	}
	if len(out.Places) == 0 {
		return 0, 0, "", fmt.Errorf("geocode: no match")
	}
	p := out.Places[0]
	label = p.DisplayName.Text
	if label == "" {
		label = p.FormattedAddress
	}
	return p.Location.Latitude, p.Location.Longitude, label, nil
}

// PlaceLocation resolves an autocomplete placeId to a coordinate + label via
// Place Details on the location-only field mask (Essentials tier). Passing the
// session token completes the autocomplete session so its predictions bill at
// zero.
func (c *Client) PlaceLocation(ctx context.Context, placeID, token, lang string) (lat, lng float64, label string, err error) {
	u := detailURL + url.PathEscape(placeID)
	q := url.Values{}
	if token != "" {
		q.Set("sessionToken", token)
	}
	if lc := langCode(lang); lc != "" {
		q.Set("languageCode", lc)
	}
	if s := q.Encode(); s != "" {
		u += "?" + s
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return 0, 0, "", err
	}
	req.Header.Set("X-Goog-Api-Key", c.APIKey)
	req.Header.Set("X-Goog-FieldMask", "location,displayName,shortFormattedAddress")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, 0, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, "", fmt.Errorf("place location %d", resp.StatusCode)
	}
	var p struct {
		Location             struct{ Latitude, Longitude float64 } `json:"location"`
		DisplayName          struct{ Text string }                 `json:"displayName"`
		ShortFormattedAddres string                                `json:"shortFormattedAddress"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return 0, 0, "", err
	}
	label = p.DisplayName.Text
	if label == "" {
		label = p.ShortFormattedAddres
	}
	return p.Location.Latitude, p.Location.Longitude, label, nil
}

// Suggestion is one autocomplete prediction.
type Suggestion struct {
	PlaceID   string `json:"placeId"`
	Primary   string `json:"primaryText"`
	Secondary string `json:"secondaryText"`
}

// Autocomplete returns type-ahead predictions, biased to (lat,lng). token is
// the caller's per-search session UUID.
func (c *Client) Autocomplete(ctx context.Context, input, token, lang string, lat, lng float64) ([]Suggestion, error) {
	body := map[string]any{"input": input}
	if token != "" {
		body["sessionToken"] = token
	}
	if lat != 0 || lng != 0 {
		body["locationBias"] = map[string]any{
			"circle": map[string]any{
				"center": map[string]float64{"latitude": lat, "longitude": lng},
				"radius": 30000,
			},
		}
	}
	if lc := langCode(lang); lc != "" {
		body["languageCode"] = lc
	}
	reqBody, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, autocompleteURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("autocomplete %d", resp.StatusCode)
	}

	var out struct {
		Suggestions []struct {
			PlacePrediction struct {
				PlaceID          string `json:"placeId"`
				StructuredFormat struct {
					MainText      struct{ Text string } `json:"mainText"`
					SecondaryText struct{ Text string } `json:"secondaryText"`
				} `json:"structuredFormat"`
				Text struct{ Text string } `json:"text"`
			} `json:"placePrediction"`
		} `json:"suggestions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	sugs := make([]Suggestion, 0, len(out.Suggestions))
	for _, s := range out.Suggestions {
		p := s.PlacePrediction
		if p.PlaceID == "" {
			continue
		}
		primary := p.StructuredFormat.MainText.Text
		if primary == "" {
			primary = p.Text.Text
		}
		sugs = append(sugs, Suggestion{
			PlaceID:   p.PlaceID,
			Primary:   primary,
			Secondary: p.StructuredFormat.SecondaryText.Text,
		})
	}
	return sugs, nil
}

// Reverse turns a coordinate into a short "where am I" label via the Geocoding
// API, favouring the names Bangkok navigates by: the nearest BTS/MRT station,
// then a named landmark, then the street or neighbourhood. Empty string only if
// Geocoding returns nothing usable.
func (c *Client) Reverse(ctx context.Context, lat, lng float64, lang string) (string, error) {
	u := fmt.Sprintf("%s?latlng=%f,%f&key=%s", geocodeAPIURL, lat, lng, url.QueryEscape(c.APIKey))
	if lc := langCode(lang); lc != "" {
		u += "&language=" + lc
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var out struct {
		Status  string `json:"status"`
		Results []struct {
			FormattedAddress  string   `json:"formatted_address"`
			Types             []string `json:"types"`
			AddressComponents []struct {
				LongName string   `json:"long_name"`
				Types    []string `json:"types"`
			} `json:"address_components"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.Status != "OK" || len(out.Results) == 0 {
		return "", nil
	}

	has := func(types []string, want ...string) bool {
		for _, t := range types {
			for _, w := range want {
				if t == w {
					return true
				}
			}
		}
		return false
	}

	// 1. nearest rail/transit station — how locals give directions.
	for _, r := range out.Results {
		if has(r.Types, "subway_station", "train_station", "transit_station", "light_rail_station") &&
			len(r.AddressComponents) > 0 {
			return r.AddressComponents[0].LongName, nil
		}
	}
	// 2. a named place that isn't just a street address.
	for _, r := range out.Results {
		if has(r.Types, "point_of_interest", "establishment", "tourist_attraction", "shopping_mall") &&
			!has(r.Types, "street_address", "premise", "subpremise", "route") &&
			len(r.AddressComponents) > 0 {
			return r.AddressComponents[0].LongName, nil
		}
	}
	// 3. street / neighbourhood, most specific first.
	for _, pref := range []string{"neighborhood", "sublocality_level_2", "route", "sublocality_level_1", "locality"} {
		for _, r := range out.Results {
			for _, comp := range r.AddressComponents {
				if has(comp.Types, pref) && comp.LongName != "" {
					return comp.LongName, nil
				}
			}
		}
	}
	if fa := out.Results[0].FormattedAddress; fa != "" {
		if i := strings.IndexByte(fa, ','); i > 0 {
			return strings.TrimSpace(fa[:i]), nil
		}
	}
	return "", nil
}

// --- Places (New) response shapes -------------------------------------------

type openingHours struct {
	OpenNow             *bool    `json:"openNow"`
	WeekdayDescriptions []string `json:"weekdayDescriptions"`
}

// apiMoney is Google's Money type: units is a string-encoded int64.
type apiMoney struct {
	CurrencyCode string `json:"currencyCode"`
	Units        string `json:"units"`
}

type apiPlace struct {
	ID               string                                `json:"id"`
	DisplayName      struct{ Text string }                 `json:"displayName"`
	FormattedAddress string                                `json:"formattedAddress"`
	Location         struct{ Latitude, Longitude float64 } `json:"location"`
	PriceLevel       string                                `json:"priceLevel"`
	PriceRange       *struct {
		StartPrice *apiMoney `json:"startPrice"`
		EndPrice   *apiMoney `json:"endPrice"`
	} `json:"priceRange"`
	Rating          float64               `json:"rating"`
	UserRatingCount int                   `json:"userRatingCount"`
	Types           []string              `json:"types"`
	PrimaryTypeDisp struct{ Text string } `json:"primaryTypeDisplayName"`
	Photos          []struct {
		Name string `json:"name"`
	} `json:"photos"`
	CurrentOpeningHours      openingHours          `json:"currentOpeningHours"`
	RegularOpeningHours      openingHours          `json:"regularOpeningHours"`
	GoogleMapsURI            string                `json:"googleMapsUri"`
	InternationalPhoneNumber string                `json:"internationalPhoneNumber"`
	NationalPhoneNumber      string                `json:"nationalPhoneNumber"`
	WebsiteURI               string                `json:"websiteUri"`
	EditorialSummary         struct{ Text string } `json:"editorialSummary"`
}

func (p apiPlace) toCard(lat, lng float64, photoBase string, maxPhotos int, lang string) Card {
	c := Card{
		ID:          p.ID,
		Name:        p.DisplayName.Text,
		Address:     p.FormattedAddress,
		PriceLevel:  priceLevel(p.PriceLevel),
		Rating:      p.Rating,
		RatingCount: p.UserRatingCount,
		Cuisines:    cuisines(p.Types, p.PrimaryTypeDisp.Text, lang),
		DistanceM:   int(math.Round(haversineM(lat, lng, p.Location.Latitude, p.Location.Longitude))),
		MapsURI:     p.GoogleMapsURI,
	}
	if p.CurrentOpeningHours.OpenNow != nil {
		c.OpenKnown = true
		c.OpenNow = *p.CurrentOpeningHours.OpenNow
	}
	c.PriceRange = parsePriceRange(p)
	if c.MapsURI == "" {
		c.MapsURI = "https://www.google.com/maps/search/?api=1&query=" +
			url.QueryEscape(p.DisplayName.Text) + "&query_place_id=" + url.QueryEscape(p.ID)
	}
	for i, ph := range p.Photos {
		if i == maxPhotos {
			break
		}
		c.PhotoURLs = append(c.PhotoURLs, photoBase+"/photo?name="+url.QueryEscape(ph.Name)+"&w=1000")
	}
	return c
}

func langCode(s string) string {
	if strings.HasPrefix(strings.ToLower(s), "th") {
		return "th"
	}
	return ""
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// --- mapping ---------------------------------------------------------------

// categoryQueryText maps each of the app's friendly filter keys to a Text
// Search phrase, per language. Every category is a text query now — Text Search
// is the only Places endpoint that also filters by rating and price.
var categoryQueryText = map[string]map[string]string{
	"thai":       {"en": "Thai restaurant", "th": "ร้านอาหารไทย"},
	"isaan":      {"en": "Isaan Northeastern Thai food", "th": "อาหารอีสาน ส้มตำ"},
	"noodles":    {"en": "noodle shop", "th": "ก๋วยเตี๋ยว บะหมี่"},
	"street":     {"en": "street food", "th": "สตรีทฟู้ด อาหารริมทาง"},
	"seafood":    {"en": "seafood restaurant", "th": "ร้านซีฟู้ด อาหารทะเล"},
	"japanese":   {"en": "Japanese restaurant sushi ramen", "th": "ร้านอาหารญี่ปุ่น ซูชิ ราเมง"},
	"cafe":       {"en": "cafe coffee shop", "th": "คาเฟ่ ร้านกาแฟ"},
	"bar":        {"en": "bar pub", "th": "บาร์ ผับ"},
	"bbq":        {"en": "barbecue grill mookata", "th": "ปิ้งย่าง หมูกระทะ"},
	"dessert":    {"en": "dessert ice cream shop", "th": "ร้านของหวาน ไอศกรีม"},
	"vegetarian": {"en": "vegetarian vegan restaurant", "th": "ร้านอาหารมังสวิรัติ เจ"},
	"chinese":    {"en": "Chinese restaurant", "th": "ร้านอาหารจีน"},
	"korean":     {"en": "Korean restaurant", "th": "ร้านอาหารเกาหลี"},
	"indian":     {"en": "Indian restaurant", "th": "ร้านอาหารอินเดีย"},
	"italian":    {"en": "Italian restaurant", "th": "ร้านอาหารอิตาเลียน"},
	"pizza":      {"en": "pizza restaurant", "th": "ร้านพิซซ่า"},
	"burgers":    {"en": "burger restaurant", "th": "ร้านเบอร์เกอร์"},
}

func defaultQuery(lang string) string {
	if langCode(lang) == "th" {
		return "ร้านอาหาร"
	}
	return "restaurant"
}

// categoryQueries returns one localized Text Search phrase per selected
// category. Empty in / empty out (the caller then uses defaultQuery).
func categoryQueries(cats []string, lang string) []string {
	l := "en"
	if langCode(lang) == "th" {
		l = "th"
	}
	var out []string
	for _, k := range cats {
		k = strings.ToLower(strings.TrimSpace(k))
		if q, ok := categoryQueryText[k]; ok {
			out = append(out, q[l])
		} else if k != "" {
			out = append(out, k)
		}
	}
	return out
}

func priceLevelEnums(levels []int) []string {
	var out []string
	for _, l := range levels {
		switch l {
		case 1:
			out = append(out, "PRICE_LEVEL_INEXPENSIVE")
		case 2:
			out = append(out, "PRICE_LEVEL_MODERATE")
		case 3:
			out = append(out, "PRICE_LEVEL_EXPENSIVE")
		case 4:
			out = append(out, "PRICE_LEVEL_VERY_EXPENSIVE")
		}
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

var typeLabelTh = map[string]string{
	"thai_restaurant": "ไทย", "japanese_restaurant": "ญี่ปุ่น", "chinese_restaurant": "จีน",
	"korean_restaurant": "เกาหลี", "vietnamese_restaurant": "เวียดนาม", "indian_restaurant": "อินเดีย",
	"italian_restaurant": "อิตาเลียน", "mexican_restaurant": "เม็กซิกัน", "french_restaurant": "ฝรั่งเศส",
	"american_restaurant": "อเมริกัน", "seafood_restaurant": "ซีฟู้ด", "sushi_restaurant": "ซูชิ",
	"ramen_restaurant": "ราเมง", "pizza_restaurant": "พิซซ่า", "hamburger_restaurant": "เบอร์เกอร์",
	"barbecue_restaurant": "ปิ้งย่าง", "vegetarian_restaurant": "มังสวิรัติ", "vegan_restaurant": "วีแกน",
	"breakfast_restaurant": "อาหารเช้า", "brunch_restaurant": "บรันช์", "cafe": "คาเฟ่",
	"coffee_shop": "กาแฟ", "bakery": "เบเกอรี่", "bar": "บาร์", "fast_food_restaurant": "ฟาสต์ฟู้ด",
	"fine_dining_restaurant": "ไฟน์ไดนิ่ง", "steak_house": "สเต๊ก", "ice_cream_shop": "ไอศกรีม",
	"dessert_restaurant": "ของหวาน", "dessert_shop": "ของหวาน",
}

func cuisines(types []string, primary, lang string) []string {
	labels := typeLabel
	fallback := "Restaurant"
	if lang == "th" {
		labels = typeLabelTh
		fallback = "ร้านอาหาร"
	}
	seen := map[string]bool{}
	var out []string
	for _, t := range types {
		if l, ok := labels[t]; ok && !seen[l] {
			seen[l] = true
			out = append(out, l)
		}
	}
	if len(out) == 0 && primary != "" {
		out = append(out, primary)
	}
	if len(out) == 0 {
		out = append(out, fallback)
	}
	if len(out) > 3 {
		out = out[:3]
	}
	return out
}

func parsePriceRange(p apiPlace) *PriceRange {
	if p.PriceRange == nil {
		return nil
	}
	units := func(m *apiMoney) (int, string) {
		if m == nil {
			return 0, ""
		}
		n, _ := strconv.Atoi(m.Units)
		return n, m.CurrencyCode
	}
	start, cur := units(p.PriceRange.StartPrice)
	end, cur2 := units(p.PriceRange.EndPrice)
	if cur == "" {
		cur = cur2
	}
	if start == 0 && end == 0 {
		return nil
	}
	return &PriceRange{Start: start, End: end, Currency: cur}
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
