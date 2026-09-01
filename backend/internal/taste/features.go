package taste

import "strings"

// PlaceSignal is the subset of Google Places (New) data we turn into a feature
// vector. The sync worker fills this in.
type PlaceSignal struct {
	Name                                        string
	Types                                       []string // Places primary + secondary types
	PriceLevel                                  int      // 0..4 (0 = unknown)
	Rating                                      float64
	RatingCount                                 int
	Editorial                                   string // editorialSummary.text, if any
	ServesBreakfast, ServesBrunch, ServesDinner bool
	LiveMusic, GoodForGroups, GoodForChildren   bool
	Reservable, Takeout, Delivery, DineIn       bool
}

// keyword → dimension. Matched against lowercased name+types+editorial.
var cuisineKeywords = map[string][]string{
	"thai_central":        {"thai", "pad thai", "bangkok"},
	"thai_isaan":          {"isaan", "isan", "som tam", "somtum", "larb", "laab", "esan"},
	"thai_northern":       {"lanna", "khao soi", "chiang mai", "northern thai"},
	"thai_southern":       {"southern thai", "phuket", "gaeng tai pla"},
	"chinese_cantonese":   {"cantonese", "hong kong", "roast duck", "char siu"},
	"chinese_szechuan":    {"szechuan", "sichuan", "mala", "chongqing"},
	"chinese_hokkien":     {"hokkien", "teochew", "fujian"},
	"dim_sum":             {"dim sum", "yum cha", "dumpling house"},
	"japanese_sushi":      {"sushi", "omakase", "sashimi", "nigiri"},
	"japanese_ramen":      {"ramen", "tsukemen", "noodle bar"},
	"japanese_izakaya":    {"izakaya", "yakitori", "sake bar"},
	"korean_bbq":          {"korean bbq", "kbbq", "gogi", "samgyeopsal"},
	"korean_stew":         {"kimchi", "bibimbap", "sundubu", "korean"},
	"vietnamese":          {"pho", "vietnamese", "banh mi", "bun cha"},
	"indian_north":        {"punjabi", "tandoori", "north indian", "butter chicken", "curry house"},
	"indian_south":        {"dosa", "idli", "south indian", "chettinad"},
	"malaysian":           {"malaysian", "nasi lemak", "char kway teow", "laksa"},
	"indonesian":          {"indonesian", "nasi goreng", "rendang", "padang"},
	"filipino":            {"filipino", "adobo", "sinigang", "kamayan"},
	"burmese":             {"burmese", "myanmar", "tea leaf salad"},
	"singaporean_hawker":  {"hawker", "singapore", "hainanese chicken"},
	"italian_pasta":       {"italian", "pasta", "trattoria", "osteria", "cucina"},
	"neapolitan_pizza":    {"pizza", "pizzeria", "napoletana", "wood fired"},
	"american_burger":     {"burger", "smashburger", "patty"},
	"american_bbq":        {"bbq", "barbecue", "brisket", "smokehouse", "pit"},
	"southern_comfort":    {"southern", "fried chicken", "soul food", "biscuits"},
	"mexican_taqueria":    {"taco", "taqueria", "mexican", "birria", "al pastor"},
	"tex_mex":             {"tex-mex", "tex mex", "fajita", "queso"},
	"peruvian":            {"peruvian", "ceviche", "lomo saltado", "nikkei"},
	"brazilian_churrasco": {"churrasc", "brazilian", "rodizio"},
	"argentine_grill":     {"argentin", "parrilla", "asado", "empanada"},
	"french_bistro":       {"french", "bistro", "brasserie", "creperie"},
	"spanish_tapas":       {"tapas", "spanish", "paella", "pintxos"},
	"greek":               {"greek", "souvlaki", "gyro", "taverna"},
	"turkish":             {"turkish", "kebab", "doner", "meze"},
	"levantine":           {"lebanese", "levantine", "shawarma", "falafel", "hummus"},
	"persian":             {"persian", "iranian", "kabab koobideh"},
	"ethiopian":           {"ethiopian", "injera", "doro wat", "eritrean"},
	"moroccan":            {"moroccan", "tagine", "couscous"},
	"german":              {"german", "schnitzel", "bratwurst", "bavarian", "beer hall"},
	"british_pub":         {"gastropub", "british", "fish and chips", "sunday roast"},
	"seafood_raw":         {"seafood", "oyster", "raw bar", "fish market", "crab"},
	"steakhouse":          {"steakhouse", "steak house", "chophouse", "prime rib"},
	"vegetarian_indian":   {"vegetarian", "vegan", "plant-based", "plant based"},
}

var spicyCuisines = map[string]bool{
	"thai_isaan": true, "thai_southern": true, "chinese_szechuan": true,
	"korean_stew": true, "indian_south": true, "mexican_taqueria": true,
	"malaysian": true, "indonesian": true,
}

// BuildRestaurantVector maps a PlaceSignal into taste space and normalizes it.
func BuildRestaurantVector(p PlaceSignal) Vec {
	hay := strings.ToLower(p.Name + " " + strings.Join(p.Types, " ") + " " + p.Editorial)
	var v Vec

	matchedCuisine := false
	for key, words := range cuisineKeywords {
		for _, w := range words {
			if strings.Contains(hay, w) {
				i := Index(key)
				v[i] += 1
				if spicyCuisines[key] {
					v[Index("spicy")] += 0.5
				}
				matchedCuisine = true
				break
			}
		}
	}
	if !matchedCuisine {
		// generic restaurant — leave cuisine dims empty, lean on attributes
		v[Index("adventurous")] += 0.1
	}

	switch p.PriceLevel {
	case 1:
		v[Index("cheap_eats")] += 1
		v[Index("quick_bite")] += 0.4
	case 2:
		v[Index("mid_price")] += 1
	case 3:
		v[Index("mid_price")] += 0.5
		v[Index("long_meal")] += 0.4
	case 4:
		v[Index("fine_dining")] += 1
		v[Index("long_meal")] += 0.6
		v[Index("quiet")] += 0.3
	}

	if p.RatingCount > 1500 {
		v[Index("lively")] += 0.6
		v[Index("trendy")] += 0.3
	} else if p.RatingCount > 0 && p.RatingCount < 150 {
		v[Index("cozy")] += 0.4
	}
	if p.LiveMusic {
		v[Index("lively")] += 0.5
	}
	if p.GoodForGroups {
		v[Index("good_for_groups")] += 0.6
	}
	if p.ServesBreakfast || p.ServesBrunch {
		v[Index("breakfast_brunch")] += 0.7
	}
	if p.Reservable {
		v[Index("long_meal")] += 0.3
	}
	if p.Takeout && !p.DineIn {
		v[Index("quick_bite")] += 0.6
		v[Index("good_for_solo")] += 0.3
	}
	for _, t := range p.Types {
		switch t {
		case "cafe", "coffee_shop":
			v[Index("coffee_focused")] += 0.8
		case "bakery", "dessert_shop", "ice_cream_shop":
			v[Index("dessert_focused")] += 0.9
		case "bar", "pub", "wine_bar":
			v[Index("lively")] += 0.4
			v[Index("late_night")] += 0.4
		case "fast_food_restaurant", "meal_takeaway":
			v[Index("quick_bite")] += 0.7
			v[Index("cheap_eats")] += 0.4
		case "fine_dining_restaurant":
			v[Index("fine_dining")] += 0.8
		case "vegan_restaurant", "vegetarian_restaurant":
			v[Index("veg_forward")] += 0.9
			v[Index("healthy")] += 0.4
		case "steak_house":
			v[Index("meat_forward")] += 0.8
		case "seafood_restaurant":
			v[Index("seafood_raw")] += 0.6
		}
	}

	return v.Normalized()
}
