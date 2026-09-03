package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/chakkrit/eatrai/internal/cache"
	"github.com/chakkrit/eatrai/internal/config"
	"github.com/chakkrit/eatrai/internal/httpapi"
	"github.com/chakkrit/eatrai/internal/places"
	"github.com/chakkrit/eatrai/internal/ratelimit"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	srv := &httpapi.Server{
		Places:         places.NewClient(cfg.GooglePlacesAPIKey),
		Cache:          cache.New(cfg.CacheTTL),
		Limiter:        ratelimit.New(cfg.RateLimitRPM, time.Minute),
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
		log.Info("EatRai proxy listening", "addr", cfg.HTTPAddr, "mock", cfg.Mock)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("serve", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutdownCtx)
	log.Info("shut down cleanly")
}
