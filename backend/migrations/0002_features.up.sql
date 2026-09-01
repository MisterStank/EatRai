-- Dual taste vectors + differentiators --------------------------------------

ALTER TABLE users
    ADD COLUMN recent_vector   vector(64),
    ADD COLUMN adventure_streak INT NOT NULL DEFAULT 0,
    ADD COLUMN last_stretch_at  TIMESTAMPTZ,
    ADD COLUMN home_location    GEOGRAPHY(POINT, 4326),
    ADD COLUMN auth_provider    TEXT,
    ADD COLUMN auth_sub         TEXT;

-- rename the learned profile to make the core/recent split explicit
ALTER TABLE users RENAME COLUMN taste_vector TO core_vector;

CREATE UNIQUE INDEX users_auth_uniq ON users (auth_provider, auth_sub)
    WHERE auth_provider IS NOT NULL;

-- taste_dimensions is upserted from code on boot; add columns it needs
ALTER TABLE taste_dimensions ADD COLUMN idx INT;   -- canonical vector position

-- Group rooms: live OR async ---------------------------------------------
ALTER TABLE sessions
    ADD COLUMN mode        TEXT NOT NULL DEFAULT 'live',   -- 'live' | 'async'
    ADD COLUMN quorum      INT  NOT NULL DEFAULT 2,        -- async: agreeing members needed
    ADD COLUMN expires_at  TIMESTAMPTZ,                    -- async polls close automatically
    ADD COLUMN result_restaurant_id UUID REFERENCES restaurants(id);

-- Stretch picks the user was shown, so we can score the streak & not repeat
CREATE TABLE stretch_picks (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    shown_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted      BOOLEAN,                -- null = not resolved, true = swiped right
    PRIMARY KEY (user_id, restaurant_id)
);

-- swipes already has session_id; nothing else needed for async polls.
