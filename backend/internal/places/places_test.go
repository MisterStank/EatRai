package places

import (
	"reflect"
	"testing"
)

func TestSplitCategories(t *testing.T) {
	typeCats, textQueries := SplitCategories([]string{"thai", "noodles", "isaan", "cafe"}, "th")
	if !reflect.DeepEqual(typeCats, []string{"thai", "cafe"}) {
		t.Fatalf("typeCats = %v", typeCats)
	}
	if len(textQueries) != 2 {
		t.Fatalf("want 2 text queries, got %v", textQueries)
	}
	// Thai locale should yield Thai query text.
	if textQueries[0] != "ก๋วยเตี๋ยว" {
		t.Fatalf("noodles th query = %q", textQueries[0])
	}
}

func TestSplitCategoriesEnglish(t *testing.T) {
	_, textQueries := SplitCategories([]string{"street"}, "")
	if len(textQueries) != 1 || textQueries[0] != "street food" {
		t.Fatalf("street en query = %v", textQueries)
	}
}

func TestIncludedTypesFallback(t *testing.T) {
	if got := includedTypes(nil); !reflect.DeepEqual(got, []string{"restaurant"}) {
		t.Fatalf("empty -> %v", got)
	}
	if got := includedTypes([]string{"totally-unknown"}); !reflect.DeepEqual(got, []string{"restaurant"}) {
		t.Fatalf("unknown -> %v", got)
	}
}
