package api

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/chakkrit/eatrai/internal/auth"
	"github.com/chakkrit/eatrai/internal/db"
)

type Server struct {
	DB       *db.DB
	Issuer   auth.Issuer
	Verifier *auth.Verifier
	Log      *slog.Logger
	DevLogin bool
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PATCH", "DELETE"},
		AllowedHeaders: []string{"Authorization", "Content-Type"},
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })

	r.Post("/v1/auth/exchange", s.authExchange)
	r.Post("/v1/auth/refresh", s.authRefresh)
	if s.DevLogin {
		r.Post("/v1/auth/dev", s.authDev)
	}

	r.Group(func(r chi.Router) {
		r.Use(s.requireUser)

		r.Get("/v1/me", s.getMe)
		r.Get("/v1/deck", s.getDeck)
		r.Post("/v1/swipes", s.postSwipe)
		r.Get("/v1/restaurants/{id}", s.getRestaurant)
		r.Get("/v1/likes", s.getLikes)

		r.Post("/v1/friends/requests", s.requestFriend)
		r.Post("/v1/friends/{id}/accept", s.acceptFriend)
		r.Get("/v1/friends", s.listFriends)
		r.Get("/v1/friends/{id}/compatibility", s.getCompatibility)

		r.Post("/v1/consensus", s.postConsensus)

		r.Post("/v1/sessions", s.createSession)
		r.Post("/v1/sessions/{code}/join", s.joinSession)
		r.Get("/v1/sessions/{id}/deck", s.sessionDeck)
		r.Get("/v1/sessions/{id}/state", s.sessionState)
	})
	return r
}
