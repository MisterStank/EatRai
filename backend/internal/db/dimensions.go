package db

import (
	"context"

	"github.com/chakkrit/eatrai/internal/taste"
)

// SyncDimensions upserts the canonical taste dimensions from code into the DB
// so the two never drift. Called once on boot.
func (d *DB) SyncDimensions(ctx context.Context) error {
	b := d.Pool
	for i, dim := range taste.Dimensions {
		_, err := b.Exec(ctx, `
			INSERT INTO taste_dimensions (key, kind, label, idx)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (key) DO UPDATE SET kind = EXCLUDED.kind,
			       label = EXCLUDED.label, idx = EXCLUDED.idx`,
			dim.Key, string(dim.Kind), dim.Label, i)
		if err != nil {
			return err
		}
	}
	return nil
}
