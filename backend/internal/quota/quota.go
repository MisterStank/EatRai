// Package quota is a per-instance, in-memory, best-effort counter of real Google
// Places calls by SKU, so the service can degrade to cached/mock data before it
// burns through the monthly free tier. It is NOT the hard spend cap — that's the
// GCP budget kill-switch (see docs/COST_AND_MONETIZATION_PLAN.md Part 7 / 13).
// With more than one Cloud Run instance the true total can be up to N× a single
// instance's count; that's acceptable for a "stay under the free tier" signal.
package quota

import (
	"sync"
	"time"
)

// Meter counts calls per SKU key ("search", "details", "photo") within the
// current calendar month (UTC), resetting on month rollover.
type Meter struct {
	mu     sync.Mutex
	month  time.Month
	counts map[string]int
	caps   map[string]int
}

// New builds a Meter. A cap of 0 (or negative) for a SKU means "no limit" —
// Exceeded is always false for it.
func New(caps map[string]int) *Meter {
	return &Meter{month: time.Now().UTC().Month(), counts: map[string]int{}, caps: caps}
}

// roll must be called with the lock held.
func (m *Meter) roll() {
	if cur := time.Now().UTC().Month(); cur != m.month {
		m.month = cur
		m.counts = map[string]int{}
	}
}

// Count records one real Google call for sku.
func (m *Meter) Count(sku string) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.roll()
	m.counts[sku]++
}

// Exceeded reports whether sku has reached 90% of its configured cap. A nil
// Meter or an unset/zero cap is never exceeded.
func (m *Meter) Exceeded(sku string) bool {
	if m == nil {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.roll()
	cap := m.caps[sku]
	if cap <= 0 {
		return false
	}
	return m.counts[sku] >= cap*9/10
}

// Snapshot returns a copy of the current counts and the month they belong to,
// for /status.
func (m *Meter) Snapshot() (counts map[string]int, month string) {
	if m == nil {
		return map[string]int{}, ""
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.roll()
	out := make(map[string]int, len(m.counts))
	for k, v := range m.counts {
		out[k] = v
	}
	return out, m.month.String()
}
