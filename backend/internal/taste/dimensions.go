package taste

// Dimensions is the canonical, append-only taste space. Its length MUST equal
// Dim (64). Row order == index in every vector. The API upserts this list into
// the taste_dimensions table on boot so the DB and code never drift.
//
// To add a dimension: append it here, bump Dim, add a migration widening the
// vector columns. Never reorder or delete.
var Dimensions = []Dimension{
	// --- cuisines (0..43) ---
	{"thai_central", Cuisine, "Central Thai"},
	{"thai_isaan", Cuisine, "Isaan / Northeastern Thai"},
	{"thai_southern", Cuisine, "Southern Thai"},
	{"thai_northern", Cuisine, "Northern Thai / Lanna"},
	{"chinese_cantonese", Cuisine, "Cantonese"},
	{"chinese_szechuan", Cuisine, "Szechuan"},
	{"chinese_hokkien", Cuisine, "Hokkien / Teochew"},
	{"dim_sum", Cuisine, "Dim sum"},
	{"japanese_sushi", Cuisine, "Sushi"},
	{"japanese_ramen", Cuisine, "Ramen"},
	{"japanese_izakaya", Cuisine, "Izakaya"},
	{"korean_bbq", Cuisine, "Korean BBQ"},
	{"korean_stew", Cuisine, "Korean stews & rice"},
	{"vietnamese", Cuisine, "Vietnamese"},
	{"indian_north", Cuisine, "North Indian"},
	{"indian_south", Cuisine, "South Indian"},
	{"malaysian", Cuisine, "Malaysian"},
	{"indonesian", Cuisine, "Indonesian"},
	{"filipino", Cuisine, "Filipino"},
	{"burmese", Cuisine, "Burmese"},
	{"singaporean_hawker", Cuisine, "Singaporean hawker"},
	{"italian_pasta", Cuisine, "Italian / pasta"},
	{"neapolitan_pizza", Cuisine, "Pizza"},
	{"american_burger", Cuisine, "Burgers"},
	{"american_bbq", Cuisine, "American BBQ"},
	{"southern_comfort", Cuisine, "Southern / comfort"},
	{"mexican_taqueria", Cuisine, "Mexican / taqueria"},
	{"tex_mex", Cuisine, "Tex-Mex"},
	{"peruvian", Cuisine, "Peruvian"},
	{"brazilian_churrasco", Cuisine, "Brazilian churrascaria"},
	{"argentine_grill", Cuisine, "Argentine grill"},
	{"french_bistro", Cuisine, "French bistro"},
	{"spanish_tapas", Cuisine, "Spanish / tapas"},
	{"greek", Cuisine, "Greek"},
	{"turkish", Cuisine, "Turkish"},
	{"levantine", Cuisine, "Levantine / Lebanese"},
	{"persian", Cuisine, "Persian"},
	{"ethiopian", Cuisine, "Ethiopian"},
	{"moroccan", Cuisine, "Moroccan"},
	{"german", Cuisine, "German / central European"},
	{"british_pub", Cuisine, "British / gastropub"},
	{"seafood_raw", Cuisine, "Seafood & raw bar"},
	{"steakhouse", Cuisine, "Steakhouse"},
	{"vegetarian_indian", Cuisine, "Vegetarian / plant-based"},

	// --- attributes (44..63) ---
	{"spicy", Attribute, "Spicy"},
	{"cheap_eats", Attribute, "Cheap eats"},
	{"mid_price", Attribute, "Mid-priced"},
	{"fine_dining", Attribute, "Fine dining"},
	{"healthy", Attribute, "Healthy"},
	{"veg_forward", Attribute, "Veg-forward"},
	{"meat_forward", Attribute, "Meat-forward"},
	{"cozy", Attribute, "Cozy"},
	{"lively", Attribute, "Lively / buzzy"},
	{"trendy", Attribute, "Trendy"},
	{"quiet", Attribute, "Quiet"},
	{"late_night", Attribute, "Late night"},
	{"breakfast_brunch", Attribute, "Breakfast & brunch"},
	{"coffee_focused", Attribute, "Coffee-focused"},
	{"dessert_focused", Attribute, "Dessert-focused"},
	{"good_for_groups", Attribute, "Good for groups"},
	{"good_for_solo", Attribute, "Good for solo"},
	{"quick_bite", Attribute, "Quick bite"},
	{"long_meal", Attribute, "Lingering meal"},
	{"adventurous", Attribute, "Adventurous / unusual"},
}

type Kind string

const (
	Cuisine   Kind = "cuisine"
	Attribute Kind = "attribute"
)

type Dimension struct {
	Key   string
	Kind  Kind
	Label string
}

var indexByKey = func() map[string]int {
	m := make(map[string]int, len(Dimensions))
	for i, d := range Dimensions {
		m[d.Key] = i
	}
	return m
}()

func init() {
	if len(Dimensions) != Dim {
		panic("taste: Dimensions length != Dim")
	}
}

// Index returns the vector position for a dimension key, or -1.
func Index(key string) int {
	if i, ok := indexByKey[key]; ok {
		return i
	}
	return -1
}

// Label returns the human label for a vector index.
func Label(i int) string {
	if i < 0 || i >= len(Dimensions) {
		return ""
	}
	return Dimensions[i].Label
}
