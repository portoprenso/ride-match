ALTER TABLE ride_match.domain_outbox ADD COLUMN ordinal bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX domain_outbox_order ON ride_match.domain_outbox(ordinal);
-- Metadata contains only resource references/reasons/actor IDs, never content or tokens.
ALTER TABLE ride_match.domain_outbox ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE ride_match.ride_groups ADD COLUMN history_revoked boolean NOT NULL DEFAULT false;
CREATE TABLE ride_match.push_devices (
  installation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ride_match.users(id),
  session_id uuid NOT NULL REFERENCES ride_match.sessions(id),
  token_digest text NOT NULL UNIQUE,
  token_cipher text NOT NULL,
  revision uuid NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  permission text NOT NULL CHECK (permission IN ('granted','denied','undetermined')),
  registered_at timestamptz NOT NULL
);
-- Only the session owning the current association can remove it on logout/replay revocation.
CREATE FUNCTION ride_match.drop_revoked_devices() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revoked THEN DELETE FROM ride_match.push_devices WHERE session_id=NEW.id; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER session_devices_revoked AFTER UPDATE OF revoked ON ride_match.sessions
  FOR EACH ROW EXECUTE FUNCTION ride_match.drop_revoked_devices();
CREATE TABLE ride_match.push_deliveries (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  installation_id uuid NOT NULL,
  revision uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES ride_match.users(id),
  payload jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','sending','accepted','failed','unknown','cancelled','disabled')),
  ticket_id text,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE (event_id,installation_id,revision)
);
CREATE INDEX push_pending ON ride_match.push_deliveries(created_at) WHERE state='pending';

-- Visibility-only changes must supersede public tombstones without inventing a private group change.
ALTER TABLE ride_match.ride_groups ADD COLUMN public_version integer NOT NULL DEFAULT 1 CHECK (public_version > 0);
UPDATE ride_match.ride_groups SET public_version=version;
CREATE FUNCTION ride_match.advance_group_public_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version <> OLD.version THEN NEW.public_version=GREATEST(OLD.public_version+1,NEW.version); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_public_version BEFORE UPDATE ON ride_match.ride_groups
  FOR EACH ROW EXECUTE FUNCTION ride_match.advance_group_public_version();

ALTER TABLE ride_match.domain_outbox ADD COLUMN push_prepared boolean NOT NULL DEFAULT true;
ALTER TABLE ride_match.domain_outbox ALTER COLUMN push_prepared SET DEFAULT false;
ALTER TABLE ride_match.match_sets ADD COLUMN targets jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ride_match.push_deliveries ADD COLUMN membership_id text REFERENCES ride_match.group_memberships(id);
ALTER TABLE ride_match.push_deliveries ADD COLUMN checked_at timestamptz;
