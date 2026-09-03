# EatRai — "กินไร?" / What to eat?

A restaurant-finder with a Tinder-style swipe deck. Point it at your location,
optionally filter by category, swipe through nearby places, and open the ones you
like in Maps.

**No accounts, no server-side database.** The backend is a thin stateless proxy
over Google Places. Right-swipes are saved **on the device** (AsyncStorage /
localStorage) so they're there when you come back — nothing syncs, nothing leaves
the phone.

## Stack

- **Mobile:** React Native (Expo, TypeScript) — `gesture-handler` + `reanimated`
  for the deck, `zustand` for session state, Bricolage Grotesque + Hanken Grotesk
- **Backend:** Go 1.23 — chi. One binary, three `GET` routes, an in-memory TTL
  cache. No persistence.
- **Data:** Google Places API (New) — Nearby Search + Place Photos. Without a key
  the backend serves a curated set of real restaurants around the
  Chula – Samyan – Siam Square area so the app is demoable offline.

## Run it locally

```bash
# backend — runs in MOCK mode with no key
cd backend
cp .env.example .env
make run                     # proxy on :8080

# mobile
cd ../mobile
cp .env.example .env.local   # EXPO_PUBLIC_API_URL=http://localhost:8080
npm install
npx expo start               # press a / i, or w for web
```

To use live data, put a **Places API (New)** key in `backend/.env`
(`GOOGLE_PLACES_API_KEY=...`) and restart — the app switches to real nearby
results and photos everywhere, no code change.

## Deploy

Backend: `backend/Dockerfile` → any container host (Cloud Run / Fly / Render) or a
plain binary. Set `GOOGLE_PLACES_API_KEY` and `CORS_ORIGIN`. Mobile: `expo export
--platform web` for the web build, EAS Build for native.

Full runbook is in `docs/DEPLOYMENT.md` (kept local, not in this repo).

## Backend API

```
GET /status                                         -> {ok, mock}
GET /nearby?lat&lng&radius&categories=thai,cafe&openNow=true
                                                    -> {cards: [Card]}
GET /photo?name=places/<id>/photos/<id>&w=900       -> image bytes (key stays server-side)
```

`Card`: `id, name, address, priceLevel (0-4), rating, ratingCount, photoUrls[],
cuisines[], distanceM, openNow, openKnown, mapsUri`. Nearby results are cached
per rounded location + filter for `CACHE_TTL` (default 10m) to keep Places calls
down.

Config (`backend/.env`): `HTTP_ADDR`, `CACHE_TTL`, `CORS_ORIGIN`,
`GOOGLE_PLACES_API_KEY`, `MOCK`.

## Layout

```
backend/
  cmd/api/            entrypoint
  internal/
    config/           env config
    places/           Places (New) client + normalisation + curated mock data
    cache/            in-memory TTL cache
    httpapi/          chi router: /status, /nearby, /photo
mobile/
  src/
    api/client.ts     getNearby()
    store/session.ts  filters + liked pile, persisted on-device (zustand persist)
    lib/              categories, formatting
    components/       SwipeCard, ActionBar, TopBar, FilterSheet, LikedSheet
    screens/          DeckScreen (the whole app)
    theme/tokens.ts   "Fresh Market" palette + fonts
```

## Category filters

The app's filter keys (`src/lib/categories.ts`) map to Places (New) primary types
in `backend/internal/places/places.go` (`categoryTypes`). Unknown keys fall back
to a plain `restaurant` search.
