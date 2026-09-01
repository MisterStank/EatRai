DROP TABLE IF EXISTS stretch_picks;
ALTER TABLE sessions
    DROP COLUMN IF EXISTS mode,
    DROP COLUMN IF EXISTS quorum,
    DROP COLUMN IF EXISTS expires_at,
    DROP COLUMN IF EXISTS result_restaurant_id;
ALTER TABLE taste_dimensions DROP COLUMN IF EXISTS idx;
DROP INDEX IF EXISTS users_auth_uniq;
ALTER TABLE users RENAME COLUMN core_vector TO taste_vector;
ALTER TABLE users
    DROP COLUMN IF EXISTS recent_vector,
    DROP COLUMN IF EXISTS adventure_streak,
    DROP COLUMN IF EXISTS last_stretch_at,
    DROP COLUMN IF EXISTS home_location,
    DROP COLUMN IF EXISTS auth_provider,
    DROP COLUMN IF EXISTS auth_sub;
