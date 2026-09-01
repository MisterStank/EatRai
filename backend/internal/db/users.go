package db

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/chakkrit/eatrai/internal/taste"
)

type User struct {
	ID              uuid.UUID
	Handle          string
	DisplayName     string
	Email           string
	AvatarURL       string
	Core            taste.Vec
	HasCore         bool
	Recent          taste.Vec
	HasRecent       bool
	SwipeCount      int
	AdventureStreak int
}

// UpsertByAuth finds or creates a user from a verified identity-provider subject.
func (d *DB) UpsertByAuth(ctx context.Context, provider, sub, email, name string) (User, error) {
	handle := suggestHandle(name, email)
	var u User
	err := d.Pool.QueryRow(ctx, `
		INSERT INTO users (handle, display_name, email, auth_provider, auth_sub)
		VALUES ($1,$2,NULLIF($3,''),$4,$5)
		ON CONFLICT (auth_provider, auth_sub)
		DO UPDATE SET display_name = COALESCE(NULLIF(users.display_name,''), EXCLUDED.display_name)
		RETURNING id, handle, display_name, COALESCE(email,''), COALESCE(avatar_url,''),
		          swipe_count, adventure_streak`,
		handle, name, email, provider, sub).
		Scan(&u.ID, &u.Handle, &u.DisplayName, &u.Email, &u.AvatarURL,
			&u.SwipeCount, &u.AdventureStreak)
	if err != nil && isUniqueViolation(err, "users_handle_key") {
		// handle collision on first insert — retry with a random suffix
		return d.UpsertByAuth(ctx, provider, sub, email, name+"-"+shortID())
	}
	return u, err
}

func (d *DB) GetUser(ctx context.Context, id uuid.UUID) (User, error) {
	var u User
	var core, recent *string
	err := d.Pool.QueryRow(ctx, `
		SELECT id, handle, display_name, COALESCE(email,''), COALESCE(avatar_url,''),
		       core_vector::text, recent_vector::text, swipe_count, adventure_streak
		FROM users WHERE id = $1`, id).
		Scan(&u.ID, &u.Handle, &u.DisplayName, &u.Email, &u.AvatarURL,
			&core, &recent, &u.SwipeCount, &u.AdventureStreak)
	if err != nil {
		return u, err
	}
	u.Core, u.HasCore = nullableVec(core)
	u.Recent, u.HasRecent = nullableVec(recent)
	return u, nil
}

func (d *DB) FindByHandle(ctx context.Context, handle string) (User, error) {
	var u User
	err := d.Pool.QueryRow(ctx, `
		SELECT id, handle, display_name, COALESCE(avatar_url,'')
		FROM users WHERE lower(handle) = lower($1)`, handle).
		Scan(&u.ID, &u.Handle, &u.DisplayName, &u.AvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// SaveVectors persists both taste vectors and bumps the swipe counter.
func (d *DB) SaveVectors(ctx context.Context, id uuid.UUID, core, recent taste.Vec) error {
	_, err := d.Pool.Exec(ctx, `
		UPDATE users SET core_vector = $2, recent_vector = $3,
		       swipe_count = swipe_count + 1
		WHERE id = $1`, id, Lit(core), Lit(recent))
	return err
}

func (d *DB) BumpAdventureStreak(ctx context.Context, id uuid.UUID, accepted bool) error {
	q := `UPDATE users SET adventure_streak = 0, last_stretch_at = now() WHERE id = $1`
	if accepted {
		q = `UPDATE users SET adventure_streak = adventure_streak + 1, last_stretch_at = now() WHERE id = $1`
	}
	_, err := d.Pool.Exec(ctx, q, id)
	return err
}

// --- helpers ----------------------------------------------------------

var ErrNotFound = errors.New("not found")

func suggestHandle(name, email string) string {
	base := strings.ToLower(name)
	if base == "" {
		base, _, _ = strings.Cut(email, "@")
	}
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			return r
		default:
			return -1
		}
	}, base)
	if base == "" {
		base = "eater"
	}
	if len(base) > 16 {
		base = base[:16]
	}
	return base + shortID()
}

func shortID() string { return uuid.NewString()[:4] }

func isUniqueViolation(err error, constraint string) bool {
	return err != nil && strings.Contains(err.Error(), constraint)
}
