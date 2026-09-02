# --- build ---
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/eatrai ./cmd/api

# --- run ---
# distroless/static ships CA certs (needed for the outbound HTTPS call to Places)
# and runs as a non-root user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/eatrai /eatrai
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/eatrai"]
