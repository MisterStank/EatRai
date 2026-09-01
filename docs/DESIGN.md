# EatRai — Design Brief

Full design (market research, architecture, data model, algorithms, roadmap) is
authored as a rendered page: [`design.html`](design.html), also published as a
Claude Artifact.

## What's different from the ~dozen existing swipe apps

1. **Legible learning** — every card says *why* ("Because you love Isaan · Spicy · Cheap eats"); a Palate screen shows top dimensions + mood shift. Fixes the group-swipe retention problem.
2. **Palate mood** — dual vectors per user: slow `core` + decaying `recent`; recs rank against `Blend(core, recent, 0.25)`.
3. **Consensus decks** — `/v1/consensus` ranks a group's deck by **maximin** (worst-matched member still likes it), works **async** (off stored vectors, nobody needs to be online).
4. **Stretch pick + adventure streak** — one deliberate out-of-comfort card per deck.

## Technical decisions

| Concern | Decision |
|---|---|
| Mobile | React Native + Expo + TS; gesture-handler + reanimated; Zustand |
| API | Go 1.23, chi, pgx — one binary (API + nightly Places sync worker) |
| DB | Postgres 16 + PostGIS (nearby) + pgvector (taste ranking) |
| Place data | Google Places (New), synced per city into our `restaurants` table |
| Auth | Apple/Google ID token → JWKS verify → our short-lived JWT; `DEV_LOGIN` bypass |
| Taste model | 64-dim space; `core` = online weighted centroid, `recent` = EMA (25-swipe half-life) |
| Recommendations | Nearby candidates from PostGIS, final ranking in Go (`deck.RankSolo`): fit + rating/distance prior + decaying exploration + cuisine diversity + 1 stretch |
| Compatibility | `taste.Compatibility`: blend of vector cosine + observed swipe agreement, weighted by shared-history confidence `min(0.85, √n/8)` |
| Consensus | `taste.ConsensusScore`: `0.7·min + 0.3·mean + 0.05·likedBy`, zero if any member passed |

Reference code: `backend/internal/taste/` (model + tests), `backend/internal/deck/`
(rankers + tests), `backend/migrations/` (schema).
