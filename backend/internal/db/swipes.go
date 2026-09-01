package db

import (
	"context"

	"github.com/google/uuid"

	"github.com/chakkrit/eatrai/internal/taste"
)

// RecordSwipe upserts a swipe and returns the restaurant's feature vector.
func (d *DB) RecordSwipe(ctx context.Context, userID, restaurantID uuid.UUID, dir int, sessionID *uuid.UUID) (taste.Vec, error) {
	var feat string
	err := d.Pool.QueryRow(ctx, `
		WITH ins AS (
		  INSERT INTO swipes (user_id, restaurant_id, direction, session_id)
		  VALUES ($1,$2,$3,$4)
		  ON CONFLICT (user_id, restaurant_id)
		  DO UPDATE SET direction = EXCLUDED.direction, created_at = now()
		)
		SELECT feature_vector::text FROM restaurants WHERE id = $2`,
		userID, restaurantID, dir, sessionID).Scan(&feat)
	if err != nil {
		return taste.Vec{}, err
	}
	return ParseVec(feat)
}

func (d *DB) MarkStretchResolved(ctx context.Context, userID, restaurantID uuid.UUID, accepted bool) error {
	_, err := d.Pool.Exec(ctx, `
		UPDATE stretch_picks SET accepted = $3
		WHERE user_id = $1 AND restaurant_id = $2 AND accepted IS NULL`,
		userID, restaurantID, accepted)
	return err
}

func (d *DB) RecordStretchShown(ctx context.Context, userID, restaurantID uuid.UUID) error {
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO stretch_picks (user_id, restaurant_id) VALUES ($1,$2)
		ON CONFLICT DO NOTHING`, userID, restaurantID)
	return err
}

// PairStats returns overlap/agreement counts for two users (order-independent).
func (d *DB) PairStats(ctx context.Context, a, b uuid.UUID) (overlapN, agreeN int, err error) {
	err = d.Pool.QueryRow(ctx, `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE sign(sa.direction) = sign(sb.direction))
		FROM swipes sa JOIN swipes sb USING (restaurant_id)
		WHERE sa.user_id = $1 AND sb.user_id = $2`, a, b).Scan(&overlapN, &agreeN)
	return
}

// LikedRestaurants returns the user's right-swiped restaurants, newest first.
func (d *DB) LikedRestaurants(ctx context.Context, userID uuid.UUID, limit int) ([]Restaurant, error) {
	rows, err := d.Pool.Query(ctx, `
		SELECT r.id, r.name, COALESCE(r.address,''), COALESCE(r.price_level,0),
		       COALESCE(r.rating,0), COALESCE(r.rating_count,0), r.photo_urls, r.cuisines
		FROM swipes s JOIN restaurants r ON r.id = s.restaurant_id
		WHERE s.user_id = $1 AND s.direction > 0
		ORDER BY s.created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Restaurant
	for rows.Next() {
		var r Restaurant
		if err := rows.Scan(&r.ID, &r.Name, &r.Address, &r.PriceLevel, &r.Rating,
			&r.RatingCount, &r.PhotoURLs, &r.Cuisines); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
