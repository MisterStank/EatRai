package config

import (
	"strconv"
	"strings"
	"time"

	"github.com/kelseyhightower/envconfig"

	"github.com/chakkrit/eatrai/internal/places"
)

type Config struct {
	DatabaseURL        string        `envconfig:"DATABASE_URL" required:"true"`
	RedisURL           string        `envconfig:"REDIS_URL" default:""`
	HTTPAddr           string        `envconfig:"HTTP_ADDR" default:":8080"`
	JWTSecret          string        `envconfig:"JWT_SECRET" required:"true"`
	AccessTTL          time.Duration `envconfig:"ACCESS_TTL" default:"1h"`
	RefreshTTL         time.Duration `envconfig:"REFRESH_TTL" default:"720h"`
	GooglePlacesAPIKey string        `envconfig:"GOOGLE_PLACES_API_KEY"`
	// Comma-separated: a native app usually has several OAuth client IDs
	// (iOS / Android / Web for Google; the app's bundle id and any Services ID
	// for Apple). Any of them is an acceptable token audience.
	GoogleClientIDs []string `envconfig:"GOOGLE_CLIENT_IDS"`
	AppleClientIDs  []string `envconfig:"APPLE_CLIENT_IDS"`
	DevLogin        bool     `envconfig:"DEV_LOGIN" default:"false"`

	// SYNC_POINTS: "lat,lng,radiusM;lat,lng,radiusM". Default: central Bangkok.
	SyncPointsRaw string        `envconfig:"SYNC_POINTS" default:"13.7440,100.5330,3000;13.7290,100.5690,3000"`
	SyncInterval  time.Duration `envconfig:"SYNC_INTERVAL" default:"24h"`
}

func Load() (Config, error) {
	var c Config
	err := envconfig.Process("", &c)
	return c, err
}

func (c Config) SyncPoints() []places.Point {
	var out []places.Point
	for _, chunk := range strings.Split(c.SyncPointsRaw, ";") {
		f := strings.Split(strings.TrimSpace(chunk), ",")
		if len(f) != 3 {
			continue
		}
		lat, _ := strconv.ParseFloat(strings.TrimSpace(f[0]), 64)
		lng, _ := strconv.ParseFloat(strings.TrimSpace(f[1]), 64)
		rad, _ := strconv.ParseFloat(strings.TrimSpace(f[2]), 64)
		if lat != 0 && lng != 0 && rad > 0 {
			out = append(out, places.Point{Lat: lat, Lng: lng, RadiusM: rad})
		}
	}
	return out
}

func (c Config) OAuthAudiences() map[string][]string {
	m := map[string][]string{}
	if len(c.GoogleClientIDs) > 0 {
		m["google"] = c.GoogleClientIDs
	}
	if len(c.AppleClientIDs) > 0 {
		m["apple"] = c.AppleClientIDs
	}
	return m
}
