package config

import (
	"time"

	"github.com/kelseyhightower/envconfig"
)

// Config is the whole surface of the service now: it proxies Google Places and
// caches responses in memory. No database, no auth, no secrets beyond the
// Places key.
type Config struct {
	HTTPAddr string `envconfig:"HTTP_ADDR" default:":8080"`

	// GooglePlacesAPIKey enables live data. Empty (or Mock=true) serves
	// generated Bangkok restaurants so the app runs with no key.
	GooglePlacesAPIKey string `envconfig:"GOOGLE_PLACES_API_KEY"`
	Mock               bool   `envconfig:"MOCK" default:"false"`

	// CacheTTL is how long a /nearby result for a given location+filter is
	// reused before we call Places again.
	CacheTTL time.Duration `envconfig:"CACHE_TTL" default:"10m"`

	// CORSOrigin is the allowed browser origin for the Expo web build. "*" in
	// dev; set to the real origin in production.
	CORSOrigin string `envconfig:"CORS_ORIGIN" default:"*"`
}

func Load() (Config, error) {
	var c Config
	if err := envconfig.Process("", &c); err != nil {
		return c, err
	}
	if c.GooglePlacesAPIKey == "" {
		c.Mock = true
	}
	return c, nil
}
