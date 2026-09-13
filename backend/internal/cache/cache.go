// Package cache is a tiny in-memory TTL store. On its own it resets on every
// redeploy and Cloud Run cold start — cheap to accept when it only shaves
// latency, expensive when (as with /nearby) a miss is a real, billed Google
// Places call. Snapshot/Restore let a caller (see cmd/api/main.go) persist the
// live entries to Cloud Storage periodically and reload them at boot, so a
// fresh instance starts warm instead of empty.
package cache

import (
	"bytes"
	"encoding/gob"
	"sync"
	"time"
)

type entry struct {
	val     any
	expires time.Time
}

type TTL struct {
	mu  sync.Mutex
	ttl time.Duration
	m   map[string]entry
}

func New(ttl time.Duration) *TTL {
	return &TTL{ttl: ttl, m: make(map[string]entry)}
}

func (c *TTL) Get(key string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || time.Now().After(e.expires) {
		if ok {
			delete(c.m, key)
		}
		return nil, false
	}
	return e.val, true
}

// GetStale returns the stored value even when it has expired (fresh=false), and
// never deletes on read. Used by the serve-stale path: when the Google quota is
// spent, an expired cache entry is still better than nothing. A caller that
// wants fresh-only should use Get.
func (c *TTL) GetStale(key string) (val any, fresh, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok {
		return nil, false, false
	}
	return e.val, time.Now().Before(e.expires), true
}

// Len reports the number of entries (including expired-but-not-yet-swept ones).
// For /status.
func (c *TTL) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.m)
}

func (c *TTL) Set(key string, val any) {
	c.SetTTL(key, val, c.ttl)
}

// SetTTL stores val under key for a caller-chosen lifetime — used where the
// default TTL is wrong (e.g. "open now" results, which go stale sooner).
func (c *TTL) SetTTL(key string, val any, ttl time.Duration) {
	if ttl <= 0 {
		ttl = c.ttl
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[key] = entry{val: val, expires: time.Now().Add(ttl)}
	// opportunistic sweep so the map can't grow forever
	if len(c.m) > 4096 {
		now := time.Now()
		for k, e := range c.m {
			if now.After(e.expires) {
				delete(c.m, k)
			}
		}
	}
}

// snapshotEntry mirrors entry with exported fields — gob only encodes those,
// and entry's are deliberately unexported to keep them out of the package's
// public surface everywhere else.
type snapshotEntry struct {
	Val     any
	Expires time.Time
}

// Snapshot gob-encodes every still-valid entry. The caller persists the bytes
// somewhere durable (Cloud Storage) and passes them to Restore on the next
// boot. Values must be gob-friendly (exported fields only) and any concrete
// type ever stored under the `any` boundary must be gob.Register-ed by the
// caller at startup — if even one entry holds an unregistered type, Encode
// fails for the WHOLE snapshot (not just that key), so cmd/api/main.go must
// register every type it ever passes to SetTTL. A failed Snapshot only loses
// the *next* persisted copy, not the live in-memory cache — see the caller's
// error handling.
func (c *TTL) Snapshot() ([]byte, error) {
	c.mu.Lock()
	now := time.Now()
	export := make(map[string]snapshotEntry, len(c.m))
	for k, e := range c.m {
		if now.Before(e.expires) {
			export[k] = snapshotEntry{Val: e.val, Expires: e.expires}
		}
	}
	c.mu.Unlock()

	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(export); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Restore merges a previously-Snapshot()ed blob into the live cache — already
// warm entries are left alone, entries that expired since the snapshot was
// taken are dropped, and gob decode errors (e.g. an empty/corrupt blob) are
// returned rather than panicking so a bad snapshot never blocks startup.
func (c *TTL) Restore(data []byte) (loaded int, err error) {
	var imported map[string]snapshotEntry
	if err := gob.NewDecoder(bytes.NewReader(data)).Decode(&imported); err != nil {
		return 0, err
	}
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range imported {
		if now.Before(e.Expires) {
			c.m[k] = entry{val: e.Val, expires: e.Expires}
			loaded++
		}
	}
	return loaded, nil
}
