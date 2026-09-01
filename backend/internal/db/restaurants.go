package db

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/chakkrit/eatrai/internal/taste"
)

type Restaurant struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Address     string    `json:"address"`
	PriceLevel  int       `json:"priceLevel"`
	Rating      float32   `json:"rating"`
	RatingCount int       `json:"ratingCount"`
	PhotoURLs   []string  `json:"photoUrls"`
	Cuisines    []string  `json:"cuisines"`
}

// Candidate is a restaurant plus everything the deck ranker needs.
type Candidate struct {
	Restaurant
	DistanceM float64
	Feature   taste.Vec
}

// UpsertRestaurant is used by the Places sync worker.
func (d *DB) UpsertRestaurant(ctx context.Context, placeID, name, address string,
	lng, lat float64, priceLevel int, rating float64, ratingCount int,
	photos, cuisines []string, feature taste.Vec) error {
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO restaurants
		  (place_id, name, location, address, price_level, rating, rating_count,
		   photo_urls, cuisines, feature_vector, synced_at)
		VALUES ($1,$2, ST_MakePoint($3,$4)::geography, $5,$6,$7,$8,$9,$10,$11, now())
		ON CONFLICT (place_id) DO UPDATE SET
		  name = EXCLUDED.name, location = EXCLUDED.location, address = EXCLUDED.address,
		  price_level = EXCLUDED.price_level, rating = EXCLUDED.rating,
		  rating_count = EXCLUDED.rating_count, photo_urls = EXCLUDED.photo_urls,
		  cuisines = EXCLUDED.cuisines, feature_vector = EXCLUDED.feature_vector,
		  synced_at = now()`,
		placeID, name, lng, lat, priceLevel, rating, ratingCount,
		photos, cuisines, Lit(feature))
	return err
}

func (d *DB) GetRestaurant(ctx context.Context, id uuid.UUID) (Restaurant, taste.Vec, error) {
	var r Restaurant
	var feat string
	err := d.Pool.QueryRow(ctx, `
		SELECT id, name, COALESCE(address,''), COALESCE(price_level,0),
		       COALESCE(rating,0), COALESCE(rating_count,0), photo_urls, cuisines,
		       feature_vector::text
		FROM restaurants WHERE id = $1`, id).
		Scan(&r.ID, &r.Name, &r.Address, &r.PriceLevel, &r.Rating, &r.RatingCount,
			&r.PhotoURLs, &r.Cuisines, &feat)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, taste.Vec{}, ErrNotFound
	}
	v, _ := ParseVec(feat)
	return r, v, err
}

// NearbyCandidates returns unseen restaurants near a point for the ranker.
// excludeSeenBy is the set of user ids whose swipes disqualify a restaurant
// (the requester alone for the solo deck; all members for a consensus deck).
func (d *DB) NearbyCandidates(ctx context.Context, excludeSeenBy []uuid.UUID,
	lng, lat float64, radiusM, limit int) ([]Candidate, error) {
	rows, err := d.Pool.Query(ctx, `
		SELECT r.id, r.name, COALESCE(r.address,''), COALESCE(r.price_level,0),
		       COALESCE(r.rating,0), COALESCE(r.rating_count,0), r.photo_urls, r.cuisines,
		       ST_Distance(r.location, ST_MakePoint($2,$3)::geography) AS dist,
		       r.feature_vector::text
		FROM restaurants r
		WHERE ST_DWithin(r.location, ST_MakePoint($2,$3)::geography, $4)
		  AND cardinality(r.photo_urls) > 0
		  AND NOT EXISTS (
		      SELECT 1 FROM swipes s
		      WHERE s.restaurant_id = r.id AND s.user_id = ANY($1))
		ORDER BY dist
		LIMIT $5`,
		excludeSeenBy, lng, lat, radiusM, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Candidate
	for rows.Next() {
		var c Candidate
		var feat string
		if err := rows.Scan(&c.ID, &c.Name, &c.Address, &c.PriceLevel, &c.Rating,
			&c.RatingCount, &c.PhotoURLs, &c.Cuisines, &c.DistanceM, &feat); err != nil {
			return nil, err
		}
		c.Feature, _ = ParseVec(feat)
		out = append(out, c)
	}
	return out, rows.Err()
}

// FriendsWhoLiked returns friend display names who swiped right on a restaurant.
func (d *DB) FriendsWhoLiked(ctx context.Context, userID uuid.UUID, restIDs []uuid.UUID) (map[uuid.UUID][]string, error) {
	rows, err := d.Pool.Query(ctx, `
		SELECT s.restaurant_id, u.display_name
		FROM swipes s
		JOIN users u ON u.id = s.user_id
		JOIN friendships f ON f.status = 'accepted'
		     AND ((f.a_id = $1 AND f.b_id = s.user_id) OR (f.b_id = $1 AND f.a_id = s.user_id))
		WHERE s.direction > 0 AND s.restaurant_id = ANY($2)`, userID, restIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[uuid.UUID][]string{}
	for rows.Next() {
		var rid uuid.UUID
		var name string
		if err := rows.Scan(&rid, &name); err != nil {
			return nil, err
		}
		m[rid] = append(m[rid], name)
	}
	return m, rows.Err()
}
