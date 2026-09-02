-include .env
export

.PHONY: run build test tidy docker docker-run

# Runs in mock mode unless GOOGLE_PLACES_API_KEY is set in .env
run:
	go run ./cmd/api

build:
	go build -trimpath -ldflags="-s -w" -o bin/eatrai ./cmd/api

test:
	go test ./...

tidy:
	go mod tidy && gofmt -w ./cmd ./internal

docker:
	docker build -t eatrai:local .

# Run the image with your .env
docker-run: docker
	docker run --rm -p 8080:8080 --env-file .env eatrai:local
