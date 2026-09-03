package ratelimit

import (
	"testing"
	"time"
)

func TestAllowWithinWindow(t *testing.T) {
	l := New(3, time.Minute)
	for i := 0; i < 3; i++ {
		if !l.Allow("a") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if l.Allow("a") {
		t.Fatal("4th request should be blocked")
	}
	if !l.Allow("b") {
		t.Fatal("a different key should be independent")
	}
}

func TestWindowResets(t *testing.T) {
	l := New(1, 20*time.Millisecond)
	if !l.Allow("a") {
		t.Fatal("first allowed")
	}
	if l.Allow("a") {
		t.Fatal("second blocked")
	}
	time.Sleep(30 * time.Millisecond)
	if !l.Allow("a") {
		t.Fatal("allowed again after the window")
	}
}

func TestZeroDefaults(t *testing.T) {
	l := New(0, 0)
	if l.max != 60 || l.window != time.Minute {
		t.Fatalf("bad defaults: max=%d window=%s", l.max, l.window)
	}
}
