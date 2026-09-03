// Package ratelimit is a tiny in-memory per-key limiter: a fixed-window counter
// keyed by client IP. It resets on redeploy — fine, it only exists to bound
// abuse of the paid Places proxy, not to be exact.
package ratelimit

import (
	"sync"
	"time"
)

type bucket struct {
	count int
	start time.Time
}

// Limiter allows up to max requests per window per key.
type Limiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string]*bucket
}

func New(maxPerWindow int, window time.Duration) *Limiter {
	if maxPerWindow <= 0 {
		maxPerWindow = 60
	}
	if window <= 0 {
		window = time.Minute
	}
	return &Limiter{max: maxPerWindow, window: window, hits: make(map[string]*bucket)}
}

// Allow records a hit for key and reports whether it is within the limit.
func (l *Limiter) Allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	w := l.hits[key]
	if w == nil || now.Sub(w.start) >= l.window {
		l.hits[key] = &bucket{count: 1, start: now}
		l.sweep(now)
		return true
	}
	w.count++
	return w.count <= l.max
}

// sweep drops stale windows so the map can't grow without bound. Called under
// lock, only occasionally (on a fresh window) and only when the map is large.
func (l *Limiter) sweep(now time.Time) {
	if len(l.hits) < 2048 {
		return
	}
	for k, w := range l.hits {
		if now.Sub(w.start) >= l.window {
			delete(l.hits, k)
		}
	}
}
