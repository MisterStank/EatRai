// Command seed inserts fake restaurants around a point so you can swipe
// locally without a Google Places key. Usage:
//
//	go run ./cmd/seed -lat 13.7440 -lng 100.5330 -n 60
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"

	"github.com/chakkrit/eatrai/internal/config"
	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/taste"
)

var samples = []taste.PlaceSignal{
	{Name: "Som Tam Der", Types: []string{"restaurant"}, Editorial: "isaan som tam larb", PriceLevel: 1},
	{Name: "Gaggan Anand", Types: []string{"fine_dining_restaurant"}, Editorial: "progressive indian tasting", PriceLevel: 4},
	{Name: "Sushi Masato", Types: []string{"restaurant"}, Editorial: "omakase sushi edomae", PriceLevel: 4},
	{Name: "Ippudo Ramen", Types: []string{"restaurant"}, Editorial: "tonkotsu ramen noodle bar", PriceLevel: 2},
	{Name: "El Mercado", Types: []string{"restaurant"}, Editorial: "spanish tapas paella", PriceLevel: 3},
	{Name: "Bo.lan", Types: []string{"restaurant"}, Editorial: "central thai traditional", PriceLevel: 3},
	{Name: "Peppina", Types: []string{"restaurant"}, Editorial: "neapolitan wood fired pizza", PriceLevel: 2},
	{Name: "Charmgang", Types: []string{"restaurant"}, Editorial: "southern thai curry spicy", PriceLevel: 2},
	{Name: "Din Tai Fung", Types: []string{"restaurant"}, Editorial: "dim sum xiao long bao", PriceLevel: 2},
	{Name: "Roast Coffee", Types: []string{"cafe", "coffee_shop"}, Editorial: "brunch specialty coffee", PriceLevel: 2},
	{Name: "Bproduct Burgers", Types: []string{"restaurant"}, Editorial: "smashburger patty", PriceLevel: 1},
	{Name: "Saawaan", Types: []string{"fine_dining_restaurant"}, Editorial: "modern thai tasting menu", PriceLevel: 4},
	{Name: "Err Urban Rustic", Types: []string{"restaurant", "bar"}, Editorial: "thai street food late night", PriceLevel: 2},
	{Name: "Little Beast", Types: []string{"restaurant"}, Editorial: "french bistro brunch", PriceLevel: 3},
	{Name: "Baan Ice", Types: []string{"restaurant"}, Editorial: "southern thai spicy home cooking", PriceLevel: 1},
}

func main() {
	lat := flag.Float64("lat", 13.7440, "center latitude")
	lng := flag.Float64("lng", 100.5330, "center longitude")
	n := flag.Int("n", 60, "number of restaurants")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx := context.Background()
	database, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	if err := database.SyncDimensions(ctx); err != nil {
		log.Fatal(err)
	}

	for i := 0; i < *n; i++ {
		s := samples[i%len(samples)]
		s.Rating = 3.6 + rand.Float64()*1.3
		s.RatingCount = 50 + rand.Intn(4000)
		feat := taste.BuildRestaurantVector(s)
		// jitter within ~2 km
		jLat := *lat + (rand.Float64()-0.5)*0.03
		jLng := *lng + (rand.Float64()-0.5)*0.03
		photo := fmt.Sprintf("https://picsum.photos/seed/eatrai%d/900/1200", i)
		cuisines := labelsFor(feat)
		if err := database.UpsertRestaurant(ctx,
			fmt.Sprintf("seed-%d", i), fmt.Sprintf("%s #%d", s.Name, i/len(samples)+1), "Bangkok",
			jLng, jLat, s.PriceLevel, s.Rating, s.RatingCount, []string{photo}, cuisines, feat); err != nil {
			log.Fatal(err)
		}
	}
	log.Printf("seeded %d restaurants around %.4f,%.4f", *n, *lat, *lng)
}

func labelsFor(v taste.Vec) []string {
	var out []string
	for _, i := range taste.TopDims(v, 3) {
		if taste.Dimensions[i].Kind == taste.Cuisine {
			out = append(out, taste.Dimensions[i].Label)
		}
	}
	return out
}
