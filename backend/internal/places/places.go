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
	searchURL     = "https://places.googleapis.com/v1/places:searchNearby"
	searchTextURL = "https://places.googleapis.com/v1/places:searchText"
	detailURL     = "https://places.googleapis.com/v1/places/"
	photoMedia    = "https://places.googleapis.com/v1/%s/media"
	searchMask    = "places.id,places.displayName,places.formattedAddress,places.location," +
		"places.priceLevel,places.rating,places.userRatingCount,places.types," +
		"places.primaryTypeDisplayName,places.photos,places.currentOpeningHours.openNow," +
		"places.googleMapsUri"
	detailMask = "id,displayName,formattedAddress,location,priceLevel,rating," +
		"userRatingCount,types,primaryTypeDisplayName,photos,googleMapsUri," +
		"currentOpeningHours.openNow,currentOpeningHours.weekdayDescriptions," +
		"regularOpeningHours.weekdayDescriptions,internationalPhoneNumber," +
		"nationalPhoneNumber,websiteUri,editorialSummary"
	// liteDetailMask is the Pro-tier subset used to resolve a shared list — no
	// phone/website/summary (which push Place Details into the pricier tier).
	liteDetailMask = "id,displayName,formattedAddress,location,priceLevel,rating," +
		"userRatingCount,types,primaryTypeDisplayName,photos,googleMapsUri," +
		"currentOpeningHours.openNow"

	nearbyPhotos = 5
	detailPhotos = 10
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
	Lat, Lng   float64
	RadiusM    float64
	Categories []string // friendly keys; see categoryTypes
	OpenNow    bool
	Lang       string // "" or "th" — Places languageCode
	// PhotoBase is the public base URL of this service (e.g. https://api.example
	// or http://localhost:8080) used to build proxied photo links.
	PhotoBase string
}

// SearchNearby calls Places and returns normalised cards, nearest first.
func (c *Client) SearchNearby(ctx context.Context, q Query) ([]Card, error) {
	body := map[string]any{
		"includedTypes":  includedTypes(q.Categories),
		"maxResultCount": 20,
		"locationRestriction": map[string]any{
			"circle": map[string]any{
				"center": map[string]float64{"latitude": q.Lat, "longitude": q.Lng},
				"radius": clampRadius(q.RadiusM),
			},
		},
	}
	if lc := langCode(q.Lang); lc != "" {
		body["languageCode"] = lc
	}
	reqBody, _ := json.Marshal(body)

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
		card := p.toCard(q.Lat, q.Lng, q.PhotoBase, nearbyPhotos, langCode(q.Lang))
		if q.OpenNow && card.OpenKnown && !card.OpenNow {
			continue
		}
		cards = append(cards, card)
	}
	sort.SliceStable(cards, func(i, j int) bool { return cards[i].DistanceM < cards[j].DistanceM })
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

// SearchText runs a free-text query ("ก๋วยเตี๋ยว", "อาหารอีสาน", …) biased to the
// same circle as a nearby search. Used for the app's categories that Google's
// place-type vocabulary can't express. Returns normalised cards.
func (c *Client) SearchText(ctx context.Context, textQuery string, q Query) ([]Card, error) {
	body := map[string]any{
		"textQuery":      textQuery,
		"maxResultCount": 20,
		"locationBias": map[string]any{
			"circle": map[string]any{
				"center": map[string]float64{"latitude": q.Lat, "longitude": q.Lng},
				"radius": clampRadius(q.RadiusM),
			},
		},
	}
	if q.OpenNow {
		body["openNow"] = true
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

// --- Places (New) response shapes -------------------------------------------

type openingHours struct {
	OpenNow             *bool    `json:"openNow"`
	WeekdayDescriptions []string `json:"weekdayDescriptions"`
}

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

// categoryTypes maps the app's friendly filter keys to Places (New) primary
// types. Unknown keys fall back to a plain "restaurant" search.
var categoryTypes = map[string][]string{
	"thai":       {"thai_restaurant"},
	"seafood":    {"seafood_restaurant"},
	"japanese":   {"japanese_restaurant", "sushi_restaurant", "ramen_restaurant"},
	"cafe":       {"cafe", "coffee_shop"},
	"bar":        {"bar", "pub"},
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

// textCategoryQueries covers the filters Google's place-type vocabulary can't
// express — these run as free-text searches instead of type-filtered nearby
// searches. Query text is per language.
var textCategoryQueries = map[string]map[string]string{
	"isaan":   {"en": "Isaan / Northeastern Thai food", "th": "อาหารอีสาน"},
	"noodles": {"en": "noodle shop", "th": "ก๋วยเตี๋ยว"},
	"street":  {"en": "street food", "th": "สตรีทฟู้ด อาหารริมทาง"},
}

// SplitCategories separates friendly keys into type-filterable ones and
// free-text ones, and returns the localized text queries for the latter.
func SplitCategories(cats []string, lang string) (typeCats []string, textQueries []string) {
	l := "en"
	if langCode(lang) == "th" {
		l = "th"
	}
	for _, k := range cats {
		k = strings.ToLower(strings.TrimSpace(k))
		if q, ok := textCategoryQueries[k]; ok {
			textQueries = append(textQueries, q[l])
			continue
		}
		typeCats = append(typeCats, k)
	}
	return typeCats, textQueries
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
