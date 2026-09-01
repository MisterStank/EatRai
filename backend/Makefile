include .env
export

.PHONY: up down migrate migrate-down run seed test tidy

up:
	docker compose up -d --build

down:
	docker compose down

migrate:
	migrate -path migrations -database "$(DATABASE_URL)" up

migrate-down:
	migrate -path migrations -database "$(DATABASE_URL)" down 1

run:
	go run ./cmd/api

# fake restaurants around a point so you can swipe without a Places key
seed:
	go run ./cmd/seed -lat 13.7440 -lng 100.5330 -n 80

test:
	go test ./...

tidy:
	go mod tidy && gofmt -w ./cmd ./internal
