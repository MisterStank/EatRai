package snapshot

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func discardLog() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// fakeStore is an in-memory Store, plus knobs to simulate failure.
type fakeStore struct {
	mu        sync.Mutex
	data      []byte
	has       bool
	loadErr   error
	saveErr   error
	saveCount int32
}

func (f *fakeStore) Load(ctx context.Context) ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.loadErr != nil {
		return nil, f.loadErr
	}
	if !f.has {
		return nil, ErrNotFound
	}
	return f.data, nil
}

func (f *fakeStore) Save(ctx context.Context, data []byte) error {
	atomic.AddInt32(&f.saveCount, 1)
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.saveErr != nil {
		return f.saveErr
	}
	f.data, f.has = data, true
	return nil
}

func (f *fakeStore) saves() int { return int(atomic.LoadInt32(&f.saveCount)) }

// fakeCache is a minimal Cache double.
type fakeCache struct {
	mu          sync.Mutex
	snapshotOut []byte
	snapshotErr error
	restored    []byte
	restoreN    int
	restoreErr  error
}

func (f *fakeCache) Snapshot() ([]byte, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.snapshotOut, f.snapshotErr
}

func (f *fakeCache) Restore(data []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.restored = data
	return f.restoreN, f.restoreErr
}

func TestRestoreAtBoot_FirstBootHasNoSnapshot(t *testing.T) {
	store := &fakeStore{} // has = false
	c := &fakeCache{}
	RestoreAtBoot(context.Background(), store, c, discardLog()) // must not panic or block
	if c.restored != nil {
		t.Fatal("Restore should not have been called with no snapshot present")
	}
}

func TestRestoreAtBoot_LoadsAnExistingSnapshot(t *testing.T) {
	store := &fakeStore{data: []byte("blob"), has: true}
	c := &fakeCache{restoreN: 3}
	RestoreAtBoot(context.Background(), store, c, discardLog())
	if string(c.restored) != "blob" {
		t.Fatalf("restored = %q, want %q", c.restored, "blob")
	}
}

func TestRestoreAtBoot_LoadErrorDoesNotPanic(t *testing.T) {
	store := &fakeStore{loadErr: errors.New("network down")}
	c := &fakeCache{}
	RestoreAtBoot(context.Background(), store, c, discardLog())
	if c.restored != nil {
		t.Fatal("Restore should not be called when Load fails")
	}
}

func TestRestoreAtBoot_DecodeErrorDoesNotPanic(t *testing.T) {
	store := &fakeStore{data: []byte("bad"), has: true}
	c := &fakeCache{restoreErr: errors.New("corrupt")}
	RestoreAtBoot(context.Background(), store, c, discardLog()) // just must not panic
}

func TestLoop_SavesOnceMoreOnShutdownEvenBeforeFirstTick(t *testing.T) {
	store := &fakeStore{}
	c := &fakeCache{snapshotOut: []byte("live")}
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		Loop(ctx, store, c, time.Hour, discardLog()) // tick interval never fires
		close(done)
	}()

	cancel() // shutdown immediately
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Loop did not return after ctx was cancelled")
	}

	if store.saves() != 1 {
		t.Fatalf("saves = %d, want 1 (the shutdown save)", store.saves())
	}
	if string(store.data) != "live" {
		t.Fatalf("saved data = %q, want %q", store.data, "live")
	}
}

func TestLoop_SavesPeriodically(t *testing.T) {
	store := &fakeStore{}
	c := &fakeCache{snapshotOut: []byte("tick")}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		Loop(ctx, store, c, 10*time.Millisecond, discardLog())
		close(done)
	}()

	time.Sleep(55 * time.Millisecond) // a handful of ticks
	cancel()
	<-done

	if store.saves() < 3 {
		t.Fatalf("saves = %d, want at least 3 periodic saves", store.saves())
	}
}

func TestLoop_EncodeFailureIsSkippedNotFatal(t *testing.T) {
	store := &fakeStore{}
	c := &fakeCache{snapshotErr: errors.New("unregistered type")}
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		Loop(ctx, store, c, time.Hour, discardLog())
		close(done)
	}()
	cancel()
	<-done

	if store.saves() != 0 {
		t.Fatalf("saves = %d, want 0 (Save should never be called when Snapshot fails)", store.saves())
	}
}

func TestLoop_SaveFailureDoesNotStopTheLoop(t *testing.T) {
	store := &fakeStore{saveErr: errors.New("bucket unreachable")}
	c := &fakeCache{snapshotOut: []byte("x")}
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		Loop(ctx, store, c, 10*time.Millisecond, discardLog())
		close(done)
	}()
	time.Sleep(35 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Loop should keep running (and eventually exit on cancel) despite repeated save failures")
	}
	if store.saves() < 2 {
		t.Fatalf("saves attempted = %d, want at least 2 (failures shouldn't stop retries)", store.saves())
	}
}
