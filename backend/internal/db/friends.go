package db

import (
	"context"

	"github.com/google/uuid"

	"github.com/chakkrit/eatrai/internal/taste"
)

// orderPair returns the two ids in the canonical a<b order used by the
// friendships and compatibility tables.
func orderPair(x, y uuid.UUID) (uuid.UUID, uuid.UUID) {
	if x.String() < y.String() {
		return x, y
	}
	return y, x
}

func (d *DB) RequestFriend(ctx context.Context, from, to uuid.UUID) error {
	a, b := orderPair(from, to)
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO friendships (a_id, b_id, status, requested_by)
		VALUES ($1,$2,'pending',$3)
		ON CONFLICT (a_id,b_id) DO NOTHING`, a, b, from)
	return err
}

func (d *DB) AcceptFriend(ctx context.Context, me, other uuid.UUID) error {
	a, b := orderPair(me, other)
	_, err := d.Pool.Exec(ctx, `
		UPDATE friendships SET status = 'accepted'
		WHERE a_id = $1 AND b_id = $2 AND requested_by <> $3`, a, b, me)
	return err
}

type Friend struct {
	User
	Status        string  `json:"status"`
	Incoming      bool    `json:"incoming"`
	Compatibility float64 `json:"compatibility"`
	CompatBasis   string  `json:"compatBasis"`
}

func (d *DB) ListFriends(ctx context.Context, me uuid.UUID) ([]Friend, error) {
	rows, err := d.Pool.Query(ctx, `
		SELECT u.id, u.handle, u.display_name, COALESCE(u.avatar_url,''),
		       u.core_vector::text, f.status, f.requested_by,
		       COALESCE(c.score,0), COALESCE(c.overlap_n,0)
		FROM friendships f
		JOIN users u ON u.id = CASE WHEN f.a_id = $1 THEN f.b_id ELSE f.a_id END
		LEFT JOIN compatibility c
		       ON c.a_id = LEAST(f.a_id,f.b_id) AND c.b_id = GREATEST(f.a_id,f.b_id)
		WHERE f.a_id = $1 OR f.b_id = $1
		ORDER BY f.status, u.display_name`, me)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Friend
	for rows.Next() {
		var f Friend
		var core *string
		var reqBy uuid.UUID
		var overlap int
		if err := rows.Scan(&f.ID, &f.Handle, &f.DisplayName, &f.AvatarURL,
			&core, &f.Status, &reqBy, &f.Compatibility, &overlap); err != nil {
			return nil, err
		}
		f.Core, f.HasCore = nullableVec(core)
		f.Incoming = f.Status == "pending" && reqBy != me
		f.CompatBasis = compatBasis(overlap)
		out = append(out, f)
	}
	return out, rows.Err()
}

// SaveCompatibility caches a freshly computed pair score.
func (d *DB) SaveCompatibility(ctx context.Context, x, y uuid.UUID, score float64, overlapN, agreeN int) error {
	a, b := orderPair(x, y)
	_, err := d.Pool.Exec(ctx, `
		INSERT INTO compatibility (a_id,b_id,score,overlap_n,agree_n,computed_at)
		VALUES ($1,$2,$3,$4,$5, now())
		ON CONFLICT (a_id,b_id) DO UPDATE SET
		  score = EXCLUDED.score, overlap_n = EXCLUDED.overlap_n,
		  agree_n = EXCLUDED.agree_n, computed_at = now()`,
		a, b, score, overlapN, agreeN)
	return err
}

// AcceptedFriendVectors returns the blended taste vectors for a set of the
// caller's accepted friends — used to build a consensus deck.
func (d *DB) AcceptedFriendVectors(ctx context.Context, me uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]taste.Vec, error) {
	rows, err := d.Pool.Query(ctx, `
		SELECT u.id, u.core_vector::text, u.recent_vector::text
		FROM users u
		JOIN friendships f ON f.status = 'accepted'
		     AND ((f.a_id = $1 AND f.b_id = u.id) OR (f.b_id = $1 AND f.a_id = u.id))
		WHERE u.id = ANY($2)`, me, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[uuid.UUID]taste.Vec{}
	for rows.Next() {
		var id uuid.UUID
		var core, recent *string
		if err := rows.Scan(&id, &core, &recent); err != nil {
			return nil, err
		}
		c, _ := nullableVec(core)
		r, hasR := nullableVec(recent)
		if hasR {
			m[id] = taste.Blend(c, r, 0.25)
		} else {
			m[id] = c
		}
	}
	return m, rows.Err()
}

func compatBasis(overlap int) string {
	switch {
	case overlap < 5:
		return "taste-profile"
	case overlap < 20:
		return "blended"
	default:
		return "shared-history"
	}
}
