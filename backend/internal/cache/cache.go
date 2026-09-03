// Package cache is a tiny in-memory TTL store. It resets on redeploy — that's
// fine, it only saves Places calls.
package cache

import (
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
	if len(c.m) > 512 {
		now := time.Now()
		for k, e := range c.m {
			if now.After(e.expires) {
				delete(c.m, k)
			}
		}
	}
}
