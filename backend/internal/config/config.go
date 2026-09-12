package config

import (
	"os"
	"strings"
	"time"

	"github.com/kelseyhightower/envconfig"
)

// Config is the whole surface of the service now: it proxies Google Places and
// caches responses in memory. No database, no auth, no secrets beyond the
// Places key.
type Config struct {
	// HTTP_ADDR wins if set; otherwise PORT (Cloud Run / most PaaS) is used;
	// otherwise :8080.
	HTTPAddr string `envconfig:"HTTP_ADDR"`

	// GooglePlacesAPIKey enables live data. Empty (or Mock=true) serves
	// generated Bangkok restaurants so the app runs with no key.
	GooglePlacesAPIKey string `envconfig:"GOOGLE_PLACES_API_KEY"`
	Mock               bool   `envconfig:"MOCK" default:"false"`

	// CacheTTL is how long a /nearby result for a given location+filter is
	// reused before we call Places again.
	CacheTTL time.Duration `envconfig:"CACHE_TTL" default:"10m"`

	// CORSOrigin is the allowed browser origin(s) for the web build, comma
	// separated. "*" in dev; set to the real origin(s) in production. The same
	// list gates non-browser abuse of the paid endpoints (see RequireOrigin).
	CORSOrigin string `envconfig:"CORS_ORIGIN" default:"*"`

	// RequireOrigin, when true, rejects requests to the paid data endpoints
	// whose Origin/Referer is not in the CORS_ORIGIN list. Requests with no
	// Origin and no Referer still pass (native apps, health checks) — the rate
	// limiter is the backstop for those. Ignored when CORS_ORIGIN is "*".
	RequireOrigin bool `envconfig:"REQUIRE_ORIGIN" default:"true"`

	// RateLimitRPM caps requests per client IP per minute on the data
	// endpoints. 0 disables it.
	RateLimitRPM int `envconfig:"RATE_LIMIT_RPM" default:"60"`

	// FreeCap* are the per-month, per-SKU real-Google-call budgets the in-memory
	// quota meter degrades at (at 90%). 0 = no limit for that SKU.
	//
	// Verified 2026-09-11 (docs/COST_AND_MONETIZATION_PLAN.md 13.1): EatRai's
	// /nearby field mask (rating, priceLevel, priceRange, currentOpeningHours,
	// photos) bills as Text Search Enterprise + Atmosphere, and /place similarly —
	// both Enterprise-class SKUs with a 1,000/month free tier, not 10k. Place
	// Photo is ~$7/1k with a ~5,000 free tier. The GCP budget kill-switch (฿500)
	// is the hard no-loss backstop; these just soft-degrade early.
	FreeCapSearch  int `envconfig:"FREE_CAP_SEARCH" default:"1000"`
	FreeCapDetails int `envconfig:"FREE_CAP_DETAILS" default:"1000"`
	FreeCapPhoto   int `envconfig:"FREE_CAP_PHOTO" default:"5000"`

	// IPLimit* budget cache-miss /nearby fetches per client. Inner limit is per
	// (IP | X-EatRai-Client token); outer ceiling is per IP across all tokens.
	// 0 = disabled. See docs/COST_AND_MONETIZATION_PLAN.md Part 12.
	IPLimitHour   int `envconfig:"IPLIMIT_HOUR" default:"40"`
	IPLimitDay    int `envconfig:"IPLIMIT_DAY" default:"150"`
	IPLimitIPHour int `envconfig:"IPLIMIT_IP_HOUR" default:"200"`
	IPLimitIPDay  int `envconfig:"IPLIMIT_IP_DAY" default:"750"`

	AllowedOrigins []string `ignored:"true"`
}

// FreeCaps is the quota.Meter caps map built from the FREE_CAP_* settings.
func (c Config) FreeCaps() map[string]int {
	return map[string]int{
		"search":  c.FreeCapSearch,
		"details": c.FreeCapDetails,
		"photo":   c.FreeCapPhoto,
	}
}

func Load() (Config, error) {
	var c Config
	if err := envconfig.Process("", &c); err != nil {
		return c, err
	}
	if c.HTTPAddr == "" {
		if p := os.Getenv("PORT"); p != "" {
			c.HTTPAddr = ":" + p
		} else {
			c.HTTPAddr = ":8080"
		}
	}
	if c.GooglePlacesAPIKey == "" {
		c.Mock = true
	}
	for _, o := range strings.Split(c.CORSOrigin, ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, o)
		}
	}
	if len(c.AllowedOrigins) == 0 {
		c.AllowedOrigins = []string{"*"}
	}
	return c, nil
}
