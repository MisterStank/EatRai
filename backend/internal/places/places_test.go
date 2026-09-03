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

func TestRankPreference(t *testing.T) {
	if (Query{Sort: "match"}).rankPreference() != "RELEVANCE" {
		t.Fatal("match -> RELEVANCE")
	}
	if (Query{}).rankPreference() != "DISTANCE" {
		t.Fatal("default -> DISTANCE")
	}
}
