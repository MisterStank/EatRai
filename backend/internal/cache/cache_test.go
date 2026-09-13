package cache

import (
	"encoding/gob"
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

// Snapshot/Restore back the cold-start fix: a fresh instance restores the
// previous instance's entries instead of starting empty (which, for /nearby,
// means a real billed Places call on every request until the cache warms up
// again from scratch).

func TestSnapshotRestoreRoundTrip(t *testing.T) {
	src := New(time.Minute)
	src.Set("a", "hello")
	src.Set("b", 42)

	data, err := src.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	dst := New(time.Minute) // simulates a fresh instance / cold start
	loaded, err := dst.Restore(data)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if loaded != 2 {
		t.Fatalf("loaded = %d, want 2", loaded)
	}
	if v, ok := dst.Get("a"); !ok || v != "hello" {
		t.Fatalf(`dst.Get("a") = %v, %v, want "hello", true`, v, ok)
	}
	if v, ok := dst.Get("b"); !ok || v != 42 {
		t.Fatalf(`dst.Get("b") = %v, %v, want 42, true`, v, ok)
	}
}

func TestSnapshotExcludesExpiredEntries(t *testing.T) {
	c := New(10 * time.Millisecond)
	c.Set("gone", "v")
	time.Sleep(20 * time.Millisecond)
	c.Set("fresh", "v") // reuses c's default ttl, set after the sleep so it's still valid

	data, err := c.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	dst := New(time.Minute)
	if _, err := dst.Restore(data); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if _, ok := dst.Get("gone"); ok {
		t.Fatal(`expired entry "gone" should not survive a snapshot`)
	}
	if _, ok := dst.Get("fresh"); !ok {
		t.Fatal(`valid entry "fresh" should survive a snapshot`)
	}
}

func TestRestoreDropsEntriesThatExpiredSinceTheSnapshotWasTaken(t *testing.T) {
	src := New(10 * time.Millisecond)
	src.Set("k", "v")
	data, err := src.Snapshot() // still valid at snapshot time
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	time.Sleep(20 * time.Millisecond) // expires before anyone restores it

	dst := New(time.Minute)
	loaded, err := dst.Restore(data)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if loaded != 0 {
		t.Fatalf("loaded = %d, want 0 (entry expired before restore)", loaded)
	}
	if _, ok := dst.Get("k"); ok {
		t.Fatal("expected the now-expired entry to not be restored")
	}
}

func TestRestoreCorruptDataReturnsErrorNotPanic(t *testing.T) {
	c := New(time.Minute)
	if _, err := c.Restore([]byte("not a gob stream")); err == nil {
		t.Fatal("expected an error for corrupt snapshot data")
	}
}

// custom struct types stored under the `any` boundary must be gob.Register-ed
// by the caller (cmd/api/main.go does this for places.Card etc.) — this test
// pins down exactly what happens if that's forgotten, so it fails loudly here
// rather than as a silent cache miss in production.
type unregisteredStruct struct{ Name string }

func TestSnapshotRestoreOfAnUnregisteredStructTypeSilentlyDropsIt(t *testing.T) {
	src := New(time.Minute)
	src.Set("k", unregisteredStruct{Name: "x"})
	data, err := src.Snapshot()
	if err == nil {
		t.Fatal("expected Snapshot to fail encoding an unregistered concrete type")
	}
	_ = data
}

type registeredStruct struct{ Name string }

func init() {
	gob.Register(registeredStruct{})
}

func TestSnapshotRestoreOfARegisteredStructTypeRoundTrips(t *testing.T) {
	src := New(time.Minute)
	src.Set("k", registeredStruct{Name: "x"})
	data, err := src.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	dst := New(time.Minute)
	if _, err := dst.Restore(data); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	got, ok := dst.Get("k")
	if !ok {
		t.Fatal("expected the registered struct to survive the round trip")
	}
	if s, ok := got.(registeredStruct); !ok || s.Name != "x" {
		t.Fatalf("got = %#v, want registeredStruct{Name: \"x\"}", got)
	}
}

func TestRestoreMergesWithoutClearingExistingEntries(t *testing.T) {
	dst := New(time.Minute)
	dst.Set("kept", "already here")

	src := New(time.Minute)
	src.Set("new", "from snapshot")
	data, _ := src.Snapshot()

	if _, err := dst.Restore(data); err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if v, ok := dst.Get("kept"); !ok || v != "already here" {
		t.Fatal("Restore should not clear entries the cache already had")
	}
	if v, ok := dst.Get("new"); !ok || v != "from snapshot" {
		t.Fatal("Restore should add the snapshot's entries")
	}
}
