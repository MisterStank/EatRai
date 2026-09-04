package places

import (
	"reflect"
	"testing"
)

func TestCategoryQueries(t *testing.T) {
	got := categoryQueries([]string{"thai", "noodles"}, "th")
	want := []string{"ร้านอาหารไทย", "ก๋วยเตี๋ยว บะหมี่"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("th queries = %v, want %v", got, want)
	}
	if en := categoryQueries([]string{"burgers"}, ""); len(en) != 1 || en[0] != "burger restaurant" {
		t.Fatalf("en burgers = %v", en)
	}
	if unknown := categoryQueries([]string{"franco-thai"}, ""); len(unknown) != 1 || unknown[0] != "franco-thai" {
		t.Fatalf("unknown key should pass through: %v", unknown)
	}
	if none := categoryQueries(nil, ""); none != nil {
		t.Fatalf("no categories -> %v", none)
	}
}

func TestDefaultQuery(t *testing.T) {
	if defaultQuery("th") != "ร้านอาหาร" || defaultQuery("") != "restaurant" {
		t.Fatal("bad default query")
	}
}

func TestPriceLevelEnums(t *testing.T) {
	got := priceLevelEnums([]int{1, 3, 9})
	want := []string{"PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_EXPENSIVE"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("enums = %v, want %v", got, want)
	}
}

func TestCommonVenue(t *testing.T) {
	siam := []string{
		"Molly Ally Siam Paragon", "Hokkai-Don (Siam Paragon)", "CH Home Media",
		"Ros'niyom Siam Paragon", "Burn Busaba Siam Paragon",
		"PAR RIS Pop-up - Siam Paragon", "Mothercare Thailand - Siam Paragon",
		"Atmo Decor,Siam Paragon", "U.S. POLO ASSN. - SIAM PARAGON",
	}
	if got := commonVenue(siam); got != "Siam Paragon" {
		t.Fatalf("siam venue = %q, want %q", got, "Siam Paragon")
	}
	// no shared venue -> no guess
	if got := commonVenue([]string{"Oak's Diner", "Paris Mikki", "Hit It", "SQ Bangkok"}); got != "" {
		t.Fatalf("unrelated names -> %q, want empty", got)
	}
}

func TestCleanVenue(t *testing.T) {
	for in, want := range map[string]string{
		"Phrom Phong BTS Station":             "Phrom Phong",
		"Victory Monument (Ratchawithi side)": "Victory Monument",
		"After You (Siam Paragon) Fl.G":       "After You",
		"Terminal 21":                         "Terminal 21",
	} {
		if got := cleanVenue(in); got != want {
			t.Errorf("cleanVenue(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRankPreference(t *testing.T) {
	if (Query{Sort: "match"}).rankPreference() != "RELEVANCE" {
		t.Fatal("match -> RELEVANCE")
	}
	if (Query{}).rankPreference() != "DISTANCE" {
		t.Fatal("default -> DISTANCE")
	}
}
