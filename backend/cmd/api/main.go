package main

import (
	"context"
	"encoding/gob"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cloud.google.com/go/storage"

	"github.com/chakkrit/eatrai/internal/cache"
	"github.com/chakkrit/eatrai/internal/cache/snapshot"
	"github.com/chakkrit/eatrai/internal/config"
	"github.com/chakkrit/eatrai/internal/httpapi"
	"github.com/chakkrit/eatrai/internal/iplimit"
	"github.com/chakkrit/eatrai/internal/places"
	"github.com/chakkrit/eatrai/internal/quota"
	"github.com/chakkrit/eatrai/internal/ratelimit"
)

// Every concrete type ever passed to Cache.Set/SetTTL must be registered here
// so cache.TTL.Snapshot (gob under the hood) can persist it. Forgetting one
// doesn't corrupt anything — Snapshot just starts failing for ALL entries
// (see cache.TTL.Snapshot's doc comment) — but it means CacheBucket silently
// stops helping, so keep this list in sync with every s.Cache.Set*(key, X)
// call in internal/httpapi/server.go.
func init() {
	gob.Register(places.Card{})
	gob.Register([]places.Card{})
	gob.Register(places.Place{})
	gob.Register(map[string]any{})
	gob.Register(map[string]string{})
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}

	// SIGTERM is what Cloud Run (and most container platforms) actually send
	// before killing an old revision; os.Interrupt (SIGINT) alone only covers
	// Ctrl-C in a local terminal. Both matter for the cache snapshot's
	// save-on-shutdown to actually fire before a redeploy.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	memCache := cache.New(cfg.CacheTTL)
	// closed once snapshot.Loop has made (or given up on) its final,
	// shutdown-triggered save; main waits on it below so the process doesn't
	// exit mid-flush. Pre-closed when there's no snapshot loop to wait for.
	snapshotFlushed := make(chan struct{})
	close(snapshotFlushed)
	if cfg.CacheBucket != "" {
		gcs, err := storage.NewClient(ctx)
		if err != nil {
			log.Warn("cache snapshot: disabled — gcs client init failed", "err", err)
		} else {
			store := snapshot.NewBucket(gcs, cfg.CacheBucket, "cache-snapshot.gob")
			snapshot.RestoreAtBoot(ctx, store, memCache, log)
			snapshotFlushed = make(chan struct{})
			go func() {
				defer close(snapshotFlushed)
				snapshot.Loop(ctx, store, memCache, cfg.CacheSnapshotEvery, log)
			}()
		}
	}

	srv := &httpapi.Server{
		Places:         places.NewClient(cfg.GooglePlacesAPIKey),
		Cache:          memCache,
		Limiter:        ratelimit.New(cfg.RateLimitRPM, time.Minute),
		Quota:          quota.New(cfg.FreeCaps()),
		IPLimit:        iplimit.New(cfg.IPLimitHour, cfg.IPLimitDay, cfg.IPLimitIPHour, cfg.IPLimitIPDay),
		Mock:           cfg.Mock,
		AllowedOrigins: cfg.AllowedOrigins,
		RequireOrigin:  cfg.RequireOrigin,
		Log:            log,
	}

	httpSrv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 5 * time.Second,
		// Generous enough to stream a full-size photo passthrough without the
		// write deadline cutting the response.
		WriteTimeout: 45 * time.Second,
	}

	go func() {
		log.Info("EatRai proxy listening", "addr", cfg.HTTPAddr, "mock", cfg.Mock, "cacheBucket", cfg.CacheBucket)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("serve", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutdownCtx)

	// Give the final cache snapshot save (up to snapshot.ioTimeout ≈10s) a
	// chance to land before the process exits — otherwise a redeploy could
	// exit right as the flush starts and the next cold start restores a
	// slightly stale copy instead of the freshest one. If your platform's
	// shutdown grace period is short, this wait — plus the 5s HTTP shutdown
	// above — needs to fit inside it.
	select {
	case <-snapshotFlushed:
	case <-time.After(12 * time.Second):
		log.Warn("cache snapshot: final save did not finish before shutdown wait timed out")
	}
	log.Info("shut down cleanly")
}
