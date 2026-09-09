package cache

import (
	"testing"
	"time"
)

func TestGetSetRoundTrip(t *testing.T) {
	c := New(time.Minute)
	c.Set("k", "v")
	got, ok := c.Get("k")
	if !ok || got != "v" {
		t.Fatalf("got = %v, ok = %v, want v, true", got, ok)
	}
}

func TestMissingKey(t *testing.T) {
	c := New(time.Minute)
	if _, ok := c.Get("nope"); ok {
		t.Fatal("expected miss for a key never set")
	}
}

func TestExpiry(t *testing.T) {
	c := New(20 * time.Millisecond)
	c.Set("k", "v")
	if _, ok := c.Get("k"); !ok {
		t.Fatal("expected hit before expiry")
	}
	time.Sleep(30 * time.Millisecond)
	if _, ok := c.Get("k"); ok {
		t.Fatal("expected miss after expiry")
	}
}

func TestSetTTLOverridesDefault(t *testing.T) {
	c := New(time.Hour) // default TTL would still be "fresh" at check time
	c.SetTTL("k", "v", 10*time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	if _, ok := c.Get("k"); ok {
		t.Fatal("expected the per-key TTL to override the store default")
	}
}

func TestSetTTLZeroFallsBackToDefault(t *testing.T) {
	c := New(10 * time.Millisecond)
	c.SetTTL("k", "v", 0)
	if _, ok := c.Get("k"); !ok {
		t.Fatal("expected hit immediately after set")
	}
	time.Sleep(20 * time.Millisecond)
	if _, ok := c.Get("k"); ok {
		t.Fatal("expected ttl<=0 to fall back to the store default, not live forever")
	}
}

func TestGetStaleReturnsExpiredEntry(t *testing.T) {
	c := New(10 * time.Millisecond)
	c.Set("k", "v")

	val, fresh, ok := c.GetStale("k")
	if !ok || !fresh || val != "v" {
		t.Fatalf("before expiry: val=%v fresh=%v ok=%v, want v true true", val, fresh, ok)
	}

	time.Sleep(20 * time.Millisecond)

	val, fresh, ok = c.GetStale("k")
	if !ok || fresh || val != "v" {
		t.Fatalf("after expiry: val=%v fresh=%v ok=%v, want v false true", val, fresh, ok)
	}

	// GetStale must not delete on read, and Get must still evict the expired entry.
	if _, ok := c.Get("k"); ok {
		t.Fatal("Get should still treat the expired entry as a miss")
	}
	if _, _, ok := c.GetStale("nope"); ok {
		t.Fatal("GetStale on a never-set key should report ok=false")
	}
}

func TestLen(t *testing.T) {
	c := New(time.Minute)
	if c.Len() != 0 {
		t.Fatalf("Len() = %d, want 0", c.Len())
	}
	c.Set("a", 1)
	c.Set("b", 2)
	if c.Len() != 2 {
		t.Fatalf("Len() = %d, want 2", c.Len())
	}
}
