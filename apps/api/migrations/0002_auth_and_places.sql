CREATE TABLE ride_match.users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  avatar_url text
);
-- Keyed phone digests are private identity keys; no plaintext phone/OTP/token storage.
CREATE TABLE ride_match.auth_identities (
  phone_key text PRIMARY KEY,
  user_id uuid UNIQUE REFERENCES ride_match.users(id),
  current_challenge_id uuid,
  resend_at timestamptz
);
CREATE TABLE ride_match.otp_challenges (
  id uuid PRIMARY KEY,
  phone_key text NOT NULL REFERENCES ride_match.auth_identities(phone_key),
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  resend_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed boolean NOT NULL DEFAULT false,
  delivered boolean NOT NULL DEFAULT false
);
CREATE TABLE ride_match.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ride_match.users(id),
  refresh_expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE ride_match.credentials (
  verifier text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES ride_match.sessions(id),
  kind text NOT NULL CHECK (kind IN ('access', 'refresh')),
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX credentials_session_idx ON ride_match.credentials(session_id);
CREATE TABLE ride_match.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0)
);
CREATE TABLE ride_match.places (
  id text PRIMARY KEY,
  label text NOT NULL,
  detail text,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180)
);
CREATE TABLE ride_match.place_coverage (
  id text PRIMARY KEY,
  south double precision NOT NULL,
  north double precision NOT NULL,
  west double precision NOT NULL,
  east double precision NOT NULL,
  CHECK (south < north AND west < east)
);
-- Server-owned synthetic development catalogue; never copied from mobile fixtures.
INSERT INTO ride_match.place_coverage VALUES ('synthetic-bishkek', 42.80, 42.95, 74.50, 74.70);
INSERT INTO ride_match.places VALUES
  ('dev_central_square', 'Demo Central Square', 'Synthetic development landmark', 42.875, 74.605),
  ('dev_east_library', 'Demo East Library', 'Synthetic development landmark', 42.880, 74.620),
  ('dev_west_garden', 'Demo West Garden', 'Synthetic development landmark', 42.860, 74.580);
