CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(80),
  given_name VARCHAR(80),
  family_name VARCHAR(80),
  preferred_username VARCHAR(64),
  locale VARCHAR(35),
  zoneinfo VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_display_name_no_control
    CHECK (display_name IS NULL OR display_name !~ '[[:cntrl:]]'),
  CONSTRAINT user_profiles_given_name_no_control
    CHECK (given_name IS NULL OR given_name !~ '[[:cntrl:]]'),
  CONSTRAINT user_profiles_family_name_no_control
    CHECK (family_name IS NULL OR family_name !~ '[[:cntrl:]]')
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_preferred_username_lower_key
  ON user_profiles (LOWER(preferred_username))
  WHERE preferred_username IS NOT NULL;
