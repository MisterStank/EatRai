package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/chakkrit/eatrai/internal/api"
	"github.com/chakkrit/eatrai/internal/auth"
	"github.com/chakkrit/eatrai/internal/config"
	"github.com/chakkrit/eatrai/internal/db"
	"github.com/chakkrit/eatrai/internal/places"
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

	database, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("db open", "err", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.SyncDimensions(ctx); err != nil {
		log.Error("sync taste dimensions", "err", err)
		os.Exit(1)
	}

	// Places sync worker (no-op without an API key).
	worker := &places.Worker{
		DB:       database,
		Client:   places.NewClient(cfg.GooglePlacesAPIKey),
		Points:   cfg.SyncPoints(),
		Interval: cfg.SyncInterval,
		Log:      log,
	}
	go worker.Run(ctx)

	srv := &api.Server{
		DB: database,
		Issuer: auth.Issuer{
			Secret:     []byte(cfg.JWTSecret),
			AccessTTL:  cfg.AccessTTL,
			RefreshTTL: cfg.RefreshTTL,
		},
		Verifier: auth.NewVerifier(cfg.OAuthAudiences()),
		Log:      log,
		DevLogin: cfg.DevLogin,
	}

	httpSrv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      15 * time.Second,
	}
	go func() {
		log.Info("EatRai API listening", "addr", cfg.HTTPAddr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
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
