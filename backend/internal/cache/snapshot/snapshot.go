// Package snapshot persists a cache.TTL's contents to durable storage and
// restores them at boot, so a Cloud Run cold start (a redeploy, or scaling
// back up after idling to zero) starts warm instead of empty. Without this,
// every instance restart turns the next request for each cache key back into
// a real, billed Google Places call — see docs/COST_AND_MONETIZATION_PLAN.md.
//
// The orchestration here (RestoreAtBoot, Loop) only depends on two small
// interfaces, so it's tested with fakes; Bucket (gcs.go) is the real
// Cloud Storage-backed Store used in production.
package snapshot

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

// ErrNotFound is what Store.Load returns when no snapshot has ever been
// saved (e.g. the very first boot). Not an error worth logging loudly.
var ErrNotFound = errors.New("snapshot: not found")

// Store is a single durable blob a snapshot is written to and read from.
type Store interface {
	Load(ctx context.Context) ([]byte, error)
	Save(ctx context.Context, data []byte) error
}

// Cache is the slice of *cache.TTL this package needs. An interface so this
// package doesn't have to import internal/cache, and so tests can fake it.
type Cache interface {
	Snapshot() ([]byte, error)
	Restore(data []byte) (int, error)
}

// ioTimeout bounds each individual Load/Save call — a hung network call must
// never block startup or delay shutdown indefinitely.
const ioTimeout = 10 * time.Second

// RestoreAtBoot loads the last snapshot into c, if one exists. Any failure
// (no snapshot yet, a read error, a decode error) just means the instance
// starts cold, exactly like before this package existed — it never blocks
// startup or returns an error the caller has to handle.
func RestoreAtBoot(ctx context.Context, store Store, c Cache, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(ctx, ioTimeout)
	defer cancel()

	data, err := store.Load(ctx)
	if errors.Is(err, ErrNotFound) {
		log.Info("cache snapshot: no existing snapshot, starting cold (first boot)")
		return
	}
	if err != nil {
		log.Warn("cache snapshot: load failed, starting cold", "err", err)
		return
	}

	n, err := c.Restore(data)
	if err != nil {
		log.Warn("cache snapshot: restore decode failed, starting cold", "err", err)
		return
	}
	log.Info("cache snapshot: restored", "entries", n)
}

// Loop saves c's snapshot to store every `every`, until ctx is done, then
// saves once more on the way out — a graceful shutdown (Cloud Run sends one
// before a new revision takes over) leaves the freshest possible snapshot for
// the instance that's about to start cold. Meant to run in its own goroutine;
// blocks until ctx is done.
func Loop(ctx context.Context, store Store, c Cache, every time.Duration, log *slog.Logger) {
	save := func() {
		data, err := c.Snapshot()
		if err != nil {
			// A single unregistered gob type fails the whole encode (see
			// cache.TTL.Snapshot) — log it, but the live in-memory cache is
			// unaffected; only this persisted copy is stale until fixed.
			log.Warn("cache snapshot: encode failed, skipping this save", "err", err)
			return
		}
		saveCtx, cancel := context.WithTimeout(context.Background(), ioTimeout)
		defer cancel()
		if err := store.Save(saveCtx, data); err != nil {
			log.Warn("cache snapshot: save failed", "err", err)
		}
	}

	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			save()
			return
		case <-t.C:
			save()
		}
	}
}
