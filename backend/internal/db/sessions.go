package db

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Session struct {
	ID        uuid.UUID  `json:"id"`
	Code      string     `json:"code"`
	Mode      string     `json:"mode"`
	HostID    uuid.UUID  `json:"hostId"`
	Lng       float64    `json:"lng"`
	Lat       float64    `json:"lat"`
	RadiusM   int        `json:"radiusM"`
	Quorum    int        `json:"quorum"`
	Status    string     `json:"status"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

func (d *DB) CreateSession(ctx context.Context, host uuid.UUID, mode string, lng, lat float64, radiusM, quorum int, ttl time.Duration) (Session, error) {
	s := Session{Mode: mode, HostID: host, Lng: lng, Lat: lat, RadiusM: radiusM, Quorum: quorum, Status: "open"}
	var exp *time.Time
	if ttl > 0 {
		t := time.Now().Add(ttl)
		exp = &t
	}
	err := d.Pool.QueryRow(ctx, `
		INSERT INTO sessions (host_id, code, center, radius_m, mode, quorum, expires_at)
		VALUES ($1,$2, ST_MakePoint($3,$4)::geography, $5,$6,$7,$8)
		RETURNING id, code`,
		host, newCode(), lng, lat, radiusM, mode, quorum, exp).Scan(&s.ID, &s.Code)
	if err != nil {
		return s, err
	}
	s.ExpiresAt = exp
	_, err = d.Pool.Exec(ctx, `INSERT INTO session_members (session_id,user_id) VALUES ($1,$2)`, s.ID, host)
	return s, err
}

func (d *DB) JoinSession(ctx context.Context, code string, user uuid.UUID) (Session, error) {
	var s Session
	err := d.Pool.QueryRow(ctx, `
		SELECT id, code, mode, host_id, ST_X(center::geometry), ST_Y(center::geometry),
		       radius_m, quorum, status, expires_at
		FROM sessions WHERE code = $1`, code).
		Scan(&s.ID, &s.Code, &s.Mode, &s.HostID, &s.Lng, &s.Lat, &s.RadiusM, &s.Quorum, &s.Status, &s.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, ErrNotFound
	}
	if err != nil {
		return s, err
	}
	if s.Status != "open" {
		return s, errors.New("session closed")
	}
	_, err = d.Pool.Exec(ctx, `
		INSERT INTO session_members (session_id,user_id) VALUES ($1,$2)
		ON CONFLICT DO NOTHING`, s.ID, user)
	return s, err
}

func (d *DB) GetSession(ctx context.Context, id uuid.UUID) (Session, error) {
	var s Session
	err := d.Pool.QueryRow(ctx, `
		SELECT id, code, mode, host_id, ST_X(center::geometry), ST_Y(center::geometry),
		       radius_m, quorum, status, expires_at
		FROM sessions WHERE id = $1`, id).
		Scan(&s.ID, &s.Code, &s.Mode, &s.HostID, &s.Lng, &s.Lat, &s.RadiusM, &s.Quorum, &s.Status, &s.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, ErrNotFound
	}
	return s, err
}

func (d *DB) SessionMembers(ctx context.Context, sessionID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := d.Pool.Query(ctx, `SELECT user_id FROM session_members WHERE session_id = $1`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// CheckMatch returns the restaurant id if enough session members have swiped
// right on the same restaurant to meet quorum, and no one has passed it.
func (d *DB) CheckMatch(ctx context.Context, sessionID uuid.UUID) (uuid.UUID, bool, error) {
	var rid uuid.UUID
	err := d.Pool.QueryRow(ctx, `
		SELECT s.restaurant_id
		FROM swipes s
		JOIN sessions ss ON ss.id = $1
		WHERE s.session_id = $1
		GROUP BY s.restaurant_id, ss.quorum
		HAVING COUNT(*) FILTER (WHERE s.direction > 0) >= ss.quorum
		   AND COUNT(*) FILTER (WHERE s.direction < 0) = 0
		ORDER BY MAX(s.created_at)
		LIMIT 1`, sessionID).Scan(&rid)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	_, err = d.Pool.Exec(ctx, `
		UPDATE sessions SET status = 'closed', result_restaurant_id = $2
		WHERE id = $1 AND status = 'open'`, sessionID, rid)
	return rid, true, err
}

func newCode() string {
	const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 4)
	u := uuid.New()
	for i := range b {
		b[i] = alpha[int(u[i])%len(alpha)]
	}
	return string(b)
}
