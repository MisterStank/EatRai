// Package places syncs Google Places (New) restaurant data into our own table
// so the swipe deck never triggers a billed per-card API call. We pay per sync
// point per run, not per user action.
package places

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/taste"
)

const searchURL = "https://places.googleapis.com/v1/places:searchNearby"

// fieldMask keeps the response (and the bill) tight.
const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location," +
	"places.priceLevel,places.rating,places.userRatingCount,places.types," +
	"places.primaryType,places.editorialSummary,places.photos," +
	"places.servesBreakfast,places.servesBrunch,places.servesDinner," +
	"places.liveMusic,places.goodForGroups,places.reservable," +
	"places.takeout,places.delivery,places.dineIn"

type Client struct {
	APIKey string
	HTTP   *http.Client
}

func NewClient(key string) *Client {
	return &Client{APIKey: key, HTTP: &http.Client{Timeout: 15 * time.Second}}
}

type Point struct{ Lat, Lng, RadiusM float64 }

// Worker periodically refreshes a fixed set of sync points.
type Worker struct {
	DB       *db.DB
	Client   *Client
	Points   []Point
	Interval time.Duration
	Log      *slog.Logger
}

func (w *Worker) Run(ctx context.Context) {
	if w.Client.APIKey == "" {
		w.Log.Warn("places sync disabled: no API key")
		return
	}
	t := time.NewTicker(w.Interval)
	defer t.Stop()
	w.syncAll(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			w.syncAll(ctx)
		}
	}
}

func (w *Worker) syncAll(ctx context.Context) {
	for _, p := range w.Points {
		n, err := w.sync(ctx, p)
		if err != nil {
			w.Log.Error("places sync point failed", "lat", p.Lat, "lng", p.Lng, "err", err)
			continue
		}
		w.Log.Info("places sync point done", "lat", p.Lat, "lng", p.Lng, "upserted", n)
	}
}

func (w *Worker) sync(ctx context.Context, p Point) (int, error) {
	places, err := w.Client.searchNearby(ctx, p)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, pl := range places {
		sig := taste.PlaceSignal{
			Name:            pl.DisplayName.Text,
			Types:           pl.Types,
			PriceLevel:      priceLevel(pl.PriceLevel),
			Rating:          pl.Rating,
			RatingCount:     pl.UserRatingCount,
			Editorial:       pl.EditorialSummary.Text,
			ServesBreakfast: pl.ServesBreakfast,
			ServesBrunch:    pl.ServesBrunch,
			ServesDinner:    pl.ServesDinner,
			LiveMusic:       pl.LiveMusic,
			GoodForGroups:   pl.GoodForGroups,
			Reservable:      pl.Reservable,
			Takeout:         pl.Takeout,
			Delivery:        pl.Delivery,
			DineIn:          pl.DineIn,
		}
		feature := taste.BuildRestaurantVector(sig)
		photos := w.Client.photoURLs(pl.Photos, 3)
		cuisines := cuisineLabels(feature)

		if err := w.DB.UpsertRestaurant(ctx, pl.ID, sig.Name, pl.FormattedAddress,
			pl.Location.Longitude, pl.Location.Latitude, sig.PriceLevel,
			pl.Rating, pl.UserRatingCount, photos, cuisines, feature); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

// --- HTTP ----------------------------------------------------------

type apiPlace struct {
	ID               string                                `json:"id"`
	DisplayName      struct{ Text string }                 `json:"displayName"`
	FormattedAddress string                                `json:"formattedAddress"`
	Location         struct{ Latitude, Longitude float64 } `json:"location"`
	PriceLevel       string                                `json:"priceLevel"`
	Rating           float64                               `json:"rating"`
	UserRatingCount  int                                   `json:"userRatingCount"`
	Types            []string                              `json:"types"`
	PrimaryType      string                                `json:"primaryType"`
	EditorialSummary struct{ Text string }                 `json:"editorialSummary"`
	Photos           []struct {
		Name string `json:"name"`
	} `json:"photos"`
	ServesBreakfast, ServesBrunch, ServesDinner bool
	LiveMusic, GoodForGroups, Reservable        bool
	Takeout, Delivery, DineIn                   bool
}

func (c *Client) searchNearby(ctx context.Context, p Point) ([]apiPlace, error) {
	body, _ := json.Marshal(map[string]any{
		"includedTypes":  []string{"restaurant"},
		"maxResultCount": 20,
		"locationRestriction": map[string]any{
			"circle": map[string]any{
				"center": map[string]float64{"latitude": p.Lat, "longitude": p.Lng},
				"radius": p.RadiusM,
			},
		},
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, searchURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.APIKey)
	req.Header.Set("X-Goog-FieldMask", fieldMask)

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
	return out.Places, nil
}

func (c *Client) photoURLs(photos []struct {
	Name string `json:"name"`
}, n int) []string {
	urls := make([]string, 0, n)
	for i, ph := range photos {
		if i == n {
			break
		}
		urls = append(urls, fmt.Sprintf(
			"https://places.googleapis.com/v1/%s/media?maxHeightPx=1000&key=%s", ph.Name, c.APIKey))
	}
	return urls
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

// cuisineLabels lists the human labels for the strongest cuisine dims in a
// feature vector, for display on the card.
func cuisineLabels(v taste.Vec) []string {
	var out []string
	for _, i := range taste.TopDims(v, 3) {
		if taste.Dimensions[i].Kind == taste.Cuisine {
			out = append(out, taste.Dimensions[i].Label)
		}
	}
	return out
}
