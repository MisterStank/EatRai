package quota

import "testing"

func TestCountAndExceededAt90Percent(t *testing.T) {
	m := New(map[string]int{"search": 10})

	for i := 0; i < 8; i++ {
		m.Count("search")
	}
	if m.Exceeded("search") {
		t.Fatal("8/10 should not be exceeded (threshold is 90%)")
	}
	m.Count("search") // 9/10 == 90%
	if !m.Exceeded("search") {
		t.Fatal("9/10 should be exceeded (>= 90% of cap)")
	}
}

func TestNoCapMeansNeverExceeded(t *testing.T) {
	m := New(map[string]int{"search": 0})
	for i := 0; i < 1000; i++ {
		m.Count("search")
	}
	if m.Exceeded("search") {
		t.Fatal("a zero cap means unlimited")
	}
	if m.Exceeded("details") {
		t.Fatal("an unconfigured SKU is unlimited")
	}
}

func TestNilMeterIsInert(t *testing.T) {
	var m *Meter
	m.Count("search") // must not panic
	if m.Exceeded("search") {
		t.Fatal("nil meter is never exceeded")
	}
	if c, _ := m.Snapshot(); len(c) != 0 {
		t.Fatal("nil meter snapshot is empty")
	}
}

func TestMonthRolloverResets(t *testing.T) {
	m := New(map[string]int{"search": 10})
	m.Count("search")
	m.Count("search")

	// Simulate a month change.
	m.month = (m.month % 12) + 1

	if c, _ := m.Snapshot(); c["search"] != 0 {
		t.Fatalf("counts should reset on month rollover, got %d", c["search"])
	}
}

func TestSnapshotIsACopy(t *testing.T) {
	m := New(map[string]int{"search": 10})
	m.Count("search")
	c, _ := m.Snapshot()
	c["search"] = 999
	if c2, _ := m.Snapshot(); c2["search"] != 1 {
		t.Fatal("mutating a snapshot must not affect the meter")
	}
}
