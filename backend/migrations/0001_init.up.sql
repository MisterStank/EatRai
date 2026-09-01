-- Extensions ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Taxonomy ----------------------------------------------------------------
-- We model taste as a fixed-length vector over a curated set of "taste
-- dimensions" (cuisines + attributes). The order of this table's rows == the
-- index in every taste_vector. Keep it append-only.
CREATE TABLE taste_dimensions (
    id          SERIAL PRIMARY KEY,
    key         TEXT UNIQUE NOT NULL,      -- 'thai', 'sushi', 'spicy', 'cheap_eats', 'fine_dining', 'vegan'...
    kind        TEXT NOT NULL,             -- 'cuisine' | 'attribute'
    label       TEXT NOT NULL
);

-- Users -----------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    handle        TEXT UNIQUE NOT NULL,
    display_name  TEXT NOT NULL,
    email         TEXT UNIQUE,
    avatar_url    TEXT,
    -- learned taste profile; NULL until the user has enough swipes
    taste_vector  vector(64),
    swipe_count   INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Restaurants (synced from Google Places, deduped by place_id) -----------
CREATE TABLE restaurants (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id      TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    location      GEOGRAPHY(POINT, 4326) NOT NULL,
    address       TEXT,
    price_level   SMALLINT,                -- 0..4 from Places
    rating        REAL,                    -- external aggregate rating
    rating_count  INT,
    photo_urls    TEXT[] NOT NULL DEFAULT '{}',
    cuisines      TEXT[] NOT NULL DEFAULT '{}',
    -- content vector: where this restaurant sits in taste space, derived from
    -- cuisines / price / attributes at sync time (see taste.BuildRestaurantVector)
    feature_vector vector(64) NOT NULL,
    hours         JSONB,
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX restaurants_location_gix ON restaurants USING GIST (location);
CREATE INDEX restaurants_vec_ivf ON restaurants USING ivfflat (feature_vector vector_cosine_ops) WITH (lists = 100);

-- Swipes --------------------------------------------------------------------
CREATE TABLE swipes (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    direction     SMALLINT NOT NULL,       -- 1 = right/like, -1 = left/pass, 2 = superlike
    session_id    UUID,                    -- non-null when swiped inside a group session
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, restaurant_id)
);
CREATE INDEX swipes_user_created_ix ON swipes (user_id, created_at DESC);
CREATE INDEX swipes_restaurant_ix ON swipes (restaurant_id);

-- Friendships (symmetric, stored once with a < b ordering) -----------------
CREATE TABLE friendships (
    a_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'accepted'
    requested_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);

-- Cached pairwise compatibility (recomputed on swipe, cheap to store) ------
CREATE TABLE compatibility (
    a_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score       REAL NOT NULL,             -- 0..100
    overlap_n   INT NOT NULL,              -- # restaurants both swiped
    agree_n     INT NOT NULL,              -- # where they agreed
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);

-- Group swipe sessions ----------------------------------------------------
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id     UUID NOT NULL REFERENCES users(id),
    code        TEXT UNIQUE NOT NULL,      -- short join code
    center      GEOGRAPHY(POINT, 4326) NOT NULL,
    radius_m    INT NOT NULL DEFAULT 2000,
    filters     JSONB NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE session_members (
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, user_id)
);
