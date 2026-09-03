package places

import (
	"fmt"
	"net/url"
	"sort"
	"strings"
)

// mock.go serves a hand-curated set of real restaurants around the
// Chula – Samyan – Siam Square area of Bangkok (Banthat Thong food street and
// nearby), so the app is demoable with no Places key. Names and cuisines are
// real venues; ratings, prices, distances, phones and hours are stand-ins.
// Photos point at picsum.photos so they load in a browser. Set
// GOOGLE_PLACES_API_KEY to switch to live Places data everywhere.

type mockSpot struct {
	name     string
	area     string
	cuisines []string
	cats     []string // friendly filter keys this spot matches
	price    int
	rating   float64
	count    int
	open     bool
}

var mockSpots = []mockSpot{
	{"Jeh O Chula", "Soi Charat Mueang", []string{"Thai", "Noodles"}, []string{"thai", "noodles", "street"}, 2, 4.5, 9200, true},
	{"Pen Sook", "Banthat Thong Rd", []string{"Thai"}, []string{"thai"}, 2, 4.4, 2800, true},
	{"Elvis Suki", "Banthat Thong Rd", []string{"Thai", "Suki"}, []string{"thai"}, 1, 4.2, 2400, true},
	{"Aey Seafood", "Banthat Thong Rd", []string{"Seafood", "Thai"}, []string{"seafood", "thai", "street"}, 2, 4.3, 5600, true},
	{"Kai Yang Banthat Thong", "Banthat Thong Rd", []string{"Isaan", "Thai", "Grilled"}, []string{"isaan", "thai", "bbq", "street"}, 1, 4.3, 3100, true},
	{"Baan Ba Mee", "Banthat Thong Rd", []string{"Noodles"}, []string{"noodles"}, 1, 4.2, 1900, true},
	{"Nai Uan Yentafo", "Charat Mueang", []string{"Noodles"}, []string{"noodles", "street"}, 1, 4.1, 2600, true},
	{"Guss Damn Good", "Banthat Thong Rd", []string{"Dessert", "Ice cream"}, []string{"dessert"}, 2, 4.5, 1400, true},
	{"Ohkajhu", "Samyan Mitrtown", []string{"Thai", "Vegetarian"}, []string{"vegetarian", "thai"}, 2, 4.4, 4200, true},
	{"Penguin Eat Shabu", "Samyan", []string{"Thai", "Shabu"}, []string{"thai"}, 2, 4.2, 3600, true},
	{"Shinkanzen Sushi", "Samyan Mitrtown", []string{"Sushi", "Japanese"}, []string{"japanese"}, 2, 4.0, 2900, true},
	{"After You", "Samyan Mitrtown", []string{"Dessert", "Café"}, []string{"dessert", "cafe"}, 2, 4.3, 5100, true},
	{"Som Tam Nua", "Siam Square Soi 5", []string{"Isaan", "Thai"}, []string{"isaan", "thai"}, 2, 4.3, 8300, true},
	{"Inter Restaurant", "Siam Square Soi 9", []string{"Thai"}, []string{"thai"}, 2, 4.1, 6400, true},
	{"Coca Restaurant", "Siam Square", []string{"Thai", "Chinese", "Suki"}, []string{"thai", "chinese"}, 3, 4.0, 4700, true},
	{"MK Restaurants", "Siam Paragon", []string{"Thai", "Suki"}, []string{"thai"}, 2, 3.9, 5200, true},
	{"Mo-Mo-Paradise", "Siam Square One", []string{"Japanese"}, []string{"japanese"}, 3, 4.1, 3900, true},
	{"Pacamara Coffee Roasters", "Siam Square One", []string{"Café", "Coffee"}, []string{"cafe"}, 2, 4.3, 2200, true},
	{"% Arabica", "Lang Suan", []string{"Café", "Coffee"}, []string{"cafe"}, 2, 4.4, 3300, true},
	{"Tep Bar", "Soi Nana, Chinatown", []string{"Bar", "Thai"}, []string{"bar"}, 2, 4.5, 4100, true},
	{"Wallflowers Upstairs", "Soi Nana, Chinatown", []string{"Bar"}, []string{"bar"}, 3, 4.4, 1500, false},
	{"Charmgang", "Charoen Krung", []string{"Thai"}, []string{"thai"}, 3, 4.7, 1700, true},
}

// mockPriceRange fakes a per-person THB band from the mock price level. Level 3
// is left without a range so the "range or nothing" UI is exercised.
func mockPriceRange(level int) *PriceRange {
	switch level {
	case 1:
		return &PriceRange{Start: 80, End: 250, Currency: "THB"}
	case 2:
		return &PriceRange{Start: 250, End: 600, Currency: "THB"}
	case 4:
		return &PriceRange{Start: 1200, End: 3000, Currency: "THB"}
	default:
		return nil
	}
}

func mockPhotos(name string, n int) []string {
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, fmt.Sprintf("https://picsum.photos/seed/eatrai-%s-%d/1000/1400", slug(name), i))
	}
	return out
}

var mockCuisineTh = map[string]string{
	"Thai": "ไทย", "Noodles": "ก๋วยเตี๋ยว", "Isaan": "อีสาน", "Seafood": "ซีฟู้ด",
	"Grilled": "ปิ้งย่าง", "Dessert": "ของหวาน", "Ice cream": "ไอศกรีม", "Café": "คาเฟ่",
	"Coffee": "กาแฟ", "Vegetarian": "มังสวิรัติ", "Shabu": "ชาบู", "Suki": "สุกี้",
	"Sushi": "ซูชิ", "Japanese": "ญี่ปุ่น", "Chinese": "จีน", "Bar": "บาร์",
}

func (s mockSpot) card(dist int, lang string) Card {
	cz := s.cuisines
	if lang == "th" {
		cz = make([]string, len(s.cuisines))
		for i, c := range s.cuisines {
			if th, ok := mockCuisineTh[c]; ok {
				cz[i] = th
			} else {
				cz[i] = c
			}
		}
	}
	return Card{
		ID:          "mock_" + slug(s.name),
		Name:        s.name,
		Address:     s.area + ", Bangkok",
		PriceLevel:  s.price,
		PriceRange:  mockPriceRange(s.price),
		Rating:      s.rating,
		RatingCount: s.count,
		Cuisines:    cz,
		DistanceM:   dist,
		OpenNow:     s.open,
		OpenKnown:   true,
		MapsURI:     "https://www.google.com/maps/search/?api=1&query=" + url.QueryEscape(s.name+" Bangkok"),
		PhotoURLs:   mockPhotos(s.name, nearbyPhotos),
	}
}

// MockNearby gives each spot a fixed pseudo-distance, then applies the query's
// radius / category / open filters — so a smaller radius really does return
// fewer places, the way live Places does.
func MockNearby(q Query) []Card {
	n := len(mockSpots)
	cards := make([]Card, 0, n)
	for i, s := range mockSpots {
		rank := (i*37 + 5) % n // deterministic shuffle -> ~90m .. ~2.8km
		dist := 90 + rank*130
		if q.RadiusM > 0 && float64(dist) > q.RadiusM {
			continue
		}
		if len(q.Categories) > 0 && !intersects(s.cats, q.Categories) {
			continue
		}
		if q.OpenNow && !s.open {
			continue
		}
		cards = append(cards, s.card(dist, q.Lang))
	}
	sort.SliceStable(cards, func(i, j int) bool { return cards[i].DistanceM < cards[j].DistanceM })
	return cards
}

// MockPlace resolves a mock id back to a spot and fakes the detail fields.
func MockPlace(id, lang string, lat, lng float64) Place {
	want := strings.TrimPrefix(id, "mock_")
	for _, s := range mockSpots {
		if slug(s.name) != want {
			continue
		}
		c := s.card(0, lang)
		c.PhotoURLs = mockPhotos(s.name, detailPhotos)
		hours := []string{
			"Monday: 10:00 AM – 10:00 PM", "Tuesday: 10:00 AM – 10:00 PM",
			"Wednesday: 10:00 AM – 10:00 PM", "Thursday: 10:00 AM – 10:00 PM",
			"Friday: 10:00 AM – 11:00 PM", "Saturday: 10:00 AM – 11:00 PM",
			"Sunday: 10:00 AM – 10:00 PM",
		}
		if lang == "th" {
			hours = []string{
				"จันทร์: 10:00 – 22:00", "อังคาร: 10:00 – 22:00", "พุธ: 10:00 – 22:00",
				"พฤหัสบดี: 10:00 – 22:00", "ศุกร์: 10:00 – 23:00", "เสาร์: 10:00 – 23:00",
				"อาทิตย์: 10:00 – 22:00",
			}
		}
		return Place{
			Card:         c,
			Phone:        "+66 2 000 0000",
			Website:      "https://maps.google.com/?q=" + url.QueryEscape(s.name+" Bangkok"),
			Summary:      "",
			WeekdayHours: hours,
		}
	}
	return Place{Card: Card{ID: id, Name: "Unknown place", Cuisines: []string{"Restaurant"}}}
}

// MockList resolves shared-list ids back to cards (lite view).
func MockList(ids []string, lang string) []Card {
	out := make([]Card, 0, len(ids))
	for _, id := range ids {
		want := strings.TrimPrefix(id, "mock_")
		for _, s := range mockSpots {
			if slug(s.name) == want {
				out = append(out, s.card(0, lang))
				break
			}
		}
	}
	return out
}

// MockGeocode fakes "change location" — everything resolves to Samyan, Bangkok.
func MockGeocode(query string) (lat, lng float64, label string) {
	if strings.TrimSpace(query) == "" {
		query = "Samyan"
	}
	return 13.7326, 100.5289, query
}

func intersects(a, b []string) bool {
	set := map[string]bool{}
	for _, x := range a {
		set[x] = true
	}
	for _, y := range b {
		if set[strings.ToLower(strings.TrimSpace(y))] {
			return true
		}
	}
	return false
}

func slug(s string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		default:
			if !prevDash {
				b.WriteRune('-')
				prevDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
