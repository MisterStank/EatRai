package db

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/chakkrit/eatrai/internal/taste"
)

// Lit renders a taste.Vec as a pgvector text literal: [0.1,0.2,...].
func Lit(v taste.Vec) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(f), 'g', 6, 32))
	}
	b.WriteByte(']')
	return b.String()
}

// ParseVec reads a pgvector text literal back into a taste.Vec.
func ParseVec(s string) (taste.Vec, error) {
	var v taste.Vec
	s = strings.Trim(strings.TrimSpace(s), "[]")
	if s == "" {
		return v, nil
	}
	for i, part := range strings.Split(s, ",") {
		if i >= taste.Dim {
			break
		}
		f, err := strconv.ParseFloat(strings.TrimSpace(part), 32)
		if err != nil {
			return v, fmt.Errorf("parse vec[%d]: %w", i, err)
		}
		v[i] = float32(f)
	}
	return v, nil
}

// nullableVec handles a possibly-NULL vector column.
func nullableVec(s *string) (taste.Vec, bool) {
	if s == nil || *s == "" {
		return taste.Vec{}, false
	}
	v, err := ParseVec(*s)
	if err != nil {
		return taste.Vec{}, false
	}
	return v, true
}
