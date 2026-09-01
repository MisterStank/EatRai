# EatRai — "กินไร?" / What to eat?

A restaurant-discovery app with a Tinder-style swipe deck. Swipe nearby
restaurants; the app learns your taste, generates recommendations, and lets
friends compare how compatible their palates are.

### What makes it different from the dozen existing swipe apps

| | |
|---|---|
| **Legible learning** | Every card shows *why* — "Because you love Isaan · Spicy · Cheap eats" — and a **Palate** screen with confidence bars. You watch it get smarter. |
| **Palate mood** | Two vectors per user: slow **core** taste + a decaying **recent** vector. Recs blend them, so the deck tracks what you've been into lately. |
| **Consensus decks (async, min-regret)** | Pick any friends → a shared deck ranked by **maximin**: the person who'd like it least still likes it. No live room, no "everyone online at once". |
| **Stretch pick + streak** | One deliberate out-of-comfort card per deck, with an adventure streak. Discovery, not just matching. |

Market research + full design: [`docs/DESIGN.md`](docs/DESIGN.md) and the
published Artifact.

## Stack

- **Mobile:** React Native (Expo, TypeScript), `gesture-handler` + `reanimated`, Zustand
- **API:** Go 1.23 — chi, pgx. One binary = HTTP API + nightly Places sync worker
- **DB:** PostgreSQL 16 + PostGIS (nearby) + pgvector (taste ranking)
- **Place data:** Google Places (New), synced per city into our `restaurants` table so swiping never triggers a billed call
- **Auth:** native Sign in with Apple (`expo-apple-authentication`) + Google (`expo-auth-session`) → the provider's signed ID token → verified server-side against the provider JWKS → our short-lived JWTs. Apple uses a hashed-nonce round-trip. `DEV_LOGIN=true` gives a no-OAuth bypass for local work.

## Run it locally

```bash
cd backend
cp .env.example .env                 # DEV_LOGIN=true is set; no OAuth needed
make up                              # postgres(+postgis+pgvector) + redis
make migrate                         # needs `migrate` CLI (golang-migrate)
make seed                            # ~80 fake Bangkok restaurants (no API key needed)
make run                             # API on :8080

cd ../mobile
npm install
npx expo start                       # tap "dev: skip sign-in" on the login screen
```

Point the app at a non-localhost API with `EXPO_PUBLIC_API_URL`.

## Layout

```
backend/
  cmd/api/            entrypoint (API + sync worker)
  cmd/seed/           fake restaurants for local dev
  internal/
    taste/            64-dim taste space, dual-vector model, compatibility,
                      consensus (maximin), stretch scoring, feature extraction
    deck/             solo deck ranker (fit + diversity + stretch) & consensus ranker
    db/               pgx queries: users, restaurants, swipes, friends, sessions
    auth/             Apple/Google JWKS verification + our JWT issuer
    places/           Google Places (New) client + sync worker
    api/              chi router + handlers
  migrations/         0001 schema, 0002 differentiator columns/tables
mobile/
  src/api/            typed client with token refresh
  src/store/          zustand auth store
  src/screens/        Deck, Friends, Palate, Consensus, SignIn
  src/components/      SwipeCard, MatchModal
```

## Tests

```bash
cd backend && go test ./...
```

`internal/taste` covers the learning rule, core-vs-recent decay, compatibility
blending, and the maximin consensus guarantee. `internal/deck` covers ranking
order and one-stretch-per-deck.

## API sketch

```
POST /v1/auth/exchange {provider,idToken,nonce?,fullName?}  -> {tokens,user}
POST /v1/auth/dev {handle}                     -> {tokens,user}   (DEV_LOGIN only)
GET  /v1/me                                    -> palate, mood, streak
GET  /v1/deck?lat&lng&radiusM                  -> [card] with reasons + stretch
POST /v1/swipes {restaurantId,direction,...}   -> {ok, adventureStreak?, match?}
GET  /v1/friends                               -> [friend] with cached compatibility
POST /v1/friends/requests {handle}
POST /v1/friends/{id}/accept
GET  /v1/friends/{id}/compatibility            -> score + bothLove/neitherLikes
POST /v1/consensus {friendIds,lat,lng}         -> maximin-ranked group deck
POST /v1/sessions {mode,lat,lng,quorum}        -> live or async room
GET  /v1/sessions/{id}/state                   -> members + match (poll this)
```

## OAuth setup (for real sign-in, not `DEV_LOGIN`)

**Google** — in one Google Cloud project create three OAuth client IDs (iOS,
Android, Web). Put all three in the backend's `GOOGLE_CLIENT_IDS` and in
`mobile/.env.local` (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`). Add the **reversed** iOS
client id to `mobile/app.json` → `ios.infoPlist.CFBundleURLTypes`.

**Apple** — enable "Sign in with Apple" on the App ID `app.eatrai.mobile` in the
Apple Developer portal. Set backend `APPLE_CLIENT_IDS=app.eatrai.mobile`. No
client secret is needed for native iOS (the identity token is verified by
signature); a Services ID + key is only required if you add web/Android Apple
sign-in later.

The app falls back to Google-only on Android and non-iOS-13 devices.

## Not built yet

Live-session WebSocket push (state is poll-based for now), reservations/delivery
deep links, and a learned two-tower recommender to replace the centroid once
there's a swipe corpus. See the roadmap in the design doc.
