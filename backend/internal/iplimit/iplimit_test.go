package iplimit

import (
	"testing"
	"time"
)

func TestInnerHourLimitTripsOn41st(t *testing.T) {
	l := New(40, 150, 200, 750)
	for i := 0; i < 40; i++ {
		if !l.Allow("1.1.1.1", "tokA") {
			t.Fatalf("call %d should be allowed", i+1)
		}
	}
	if l.Allow("1.1.1.1", "tokA") {
		t.Fatal("41st call in the hour should be denied")
	}
	// a different token on the same IP has its own inner budget
	if !l.Allow("1.1.1.1", "tokB") {
		t.Fatal("a fresh token should have its own budget")
	}
}

func TestOuterPerIPCeilingTripsAcrossManyTokens(t *testing.T) {
	// inner limit high so only the outer per-IP hour ceiling (10) can bite
	l := New(1000, 1000, 10, 1000)
	allowed := 0
	for i := 0; i < 20; i++ {
		if l.Allow("2.2.2.2", "token-"+string(rune('a'+i))) {
			allowed++
		}
	}
	if allowed != 10 {
		t.Fatalf("outer per-IP hour ceiling should cap the IP at 10 across all tokens, got %d", allowed)
	}
	// another IP is unaffected
	if !l.Allow("3.3.3.3", "x") {
		t.Fatal("a different IP has its own ceiling")
	}
}

func TestMissingTokenSharesTheDashBucket(t *testing.T) {
	l := New(3, 100, 100, 1000)
	if !l.Allow("4.4.4.4", "") || !l.Allow("4.4.4.4", "") || !l.Allow("4.4.4.4", "") {
		t.Fatal("first three tokenless calls should pass")
	}
	if l.Allow("4.4.4.4", "") {
		t.Fatal("tokenless calls all share the '-' bucket and should trip at the inner limit")
	}
	// an explicit token on the same IP is a separate inner bucket
	if !l.Allow("4.4.4.4", "real") {
		t.Fatal("an explicit token isn't the '-' bucket")
	}
}

func TestWindowRolls(t *testing.T) {
	l := New(2, 100, 100, 1000)
	if !l.Allow("5.5.5.5", "t") || !l.Allow("5.5.5.5", "t") {
		t.Fatal("first two should pass")
	}
	if l.Allow("5.5.5.5", "t") {
		t.Fatal("third should be denied")
	}
	// force the hour window open
	l.mu.Lock()
	w := l.perKey["5.5.5.5|t"]
	w.hourStart = w.hourStart.Add(-2 * time.Hour)
	l.mu.Unlock()
	if !l.Allow("5.5.5.5", "t") {
		t.Fatal("after the hour window rolls, the client should be allowed again")
	}
}

func TestNilLimiterAllows(t *testing.T) {
	var l *Limiter
	if !l.Allow("x", "y") {
		t.Fatal("nil limiter must allow")
	}
	if k, d := l.Stats(); k != 0 || d != 0 {
		t.Fatal("nil limiter stats are zero")
	}
}

func TestDeniedCallBumpsDegradeHits(t *testing.T) {
	l := New(1, 100, 100, 1000)
	l.Allow("6.6.6.6", "t")
	l.Allow("6.6.6.6", "t") // denied
	l.Allow("6.6.6.6", "t") // denied
	if _, d := l.Stats(); d != 2 {
		t.Fatalf("degradeHits = %d, want 2", d)
	}
}
