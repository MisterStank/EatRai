// Package iplimit is a per-instance, in-memory, best-effort request budget for
// cache-miss /nearby fetches, keyed on (client IP | browser token). It stops one
// client (a scraper, a render-loop bug, one heavy user) from burning the shared
// Google budget — a fairness layer on top of Part 7's global meter and the
// Cloudflare rate-limit rule. NOT a security control: the token is spoofable,
// which is why there's also an outer per-IP ceiling. See
// docs/COST_AND_MONETIZATION_PLAN.md Part 12.
package iplimit

import (
	"sync"
	"time"
)

type window struct {
	hourStart time.Time
	hourCount int
	dayStart  time.Time
	dayCount  int
}

func (w *window) roll(now time.Time) {
	if now.Sub(w.hourStart) >= time.Hour {
		w.hourStart, w.hourCount = now, 0
	}
	if now.Sub(w.dayStart) >= 24*time.Hour {
		w.dayStart, w.dayCount = now, 0
	}
}

// Limiter holds the two-tier budget. A limit of 0 disables that check.
type Limiter struct {
	mu          sync.Mutex
	perKey      map[string]*window // "ip|token" — the inner (fair) budget
	perIP       map[string]*window // "ip"       — the outer ceiling
	keyHour     int
	keyDay      int
	ipHour      int
	ipDay       int
	degradeHits int
	lastSweep   time.Time
}

func New(keyHour, keyDay, ipHour, ipDay int) *Limiter {
	return &Limiter{
		perKey:    map[string]*window{},
		perIP:     map[string]*window{},
		keyHour:   keyHour,
		keyDay:    keyDay,
		ipHour:    ipHour,
		ipDay:     ipDay,
		lastSweep: time.Now(),
	}
}

// Allow reports whether a cache-miss /nearby fetch is permitted for this
// ip+token right now, and records it when permitted. A denied call is NOT
// counted (so a client stuck at the limit doesn't push its window out forever)
// but does bump the degrade-hits stat. A nil Limiter always allows.
func (l *Limiter) Allow(ip, token string) bool {
	if l == nil {
		return true
	}
	if token == "" {
		token = "-"
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	l.sweep(now)

	kw := l.get(l.perKey, ip+"|"+token, now)
	iw := l.get(l.perIP, ip, now)
	kw.roll(now)
	iw.roll(now)

	if (l.keyHour > 0 && kw.hourCount >= l.keyHour) ||
		(l.keyDay > 0 && kw.dayCount >= l.keyDay) ||
		(l.ipHour > 0 && iw.hourCount >= l.ipHour) ||
		(l.ipDay > 0 && iw.dayCount >= l.ipDay) {
		l.degradeHits++
		return false
	}

	kw.hourCount++
	kw.dayCount++
	iw.hourCount++
	iw.dayCount++
	return true
}

func (l *Limiter) get(m map[string]*window, k string, now time.Time) *window {
	w := m[k]
	if w == nil {
		w = &window{hourStart: now, dayStart: now}
		m[k] = w
	}
	return w
}

// sweep drops windows that haven't been touched in over a day. Cheap and
// infrequent — the map is bounded by active clients per instance anyway.
func (l *Limiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < 10*time.Minute {
		return
	}
	l.lastSweep = now
	for k, w := range l.perKey {
		if now.Sub(w.dayStart) > 25*time.Hour {
			delete(l.perKey, k)
		}
	}
	for k, w := range l.perIP {
		if now.Sub(w.dayStart) > 25*time.Hour {
			delete(l.perIP, k)
		}
	}
}

// Stats is for /status.
func (l *Limiter) Stats() (trackedKeys, degradeHits int) {
	if l == nil {
		return 0, 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.perKey), l.degradeHits
}
