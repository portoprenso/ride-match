CREATE TABLE ride_match.ride_requests (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ride_match.users(id),
  status text NOT NULL CHECK (status IN ('active','grouped','expired','cancelled','completed')),
  group_id text,
  destination jsonb NOT NULL,
  public_latitude double precision NOT NULL,
  public_longitude double precision NOT NULL,
  departure_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  UNIQUE (id,user_id),
  CHECK (departure_at < expires_at AND created_at < expires_at),
  CHECK ((status NOT IN ('grouped','completed') OR group_id IS NOT NULL)
    AND (status NOT IN ('active','expired') OR group_id IS NULL))
);
CREATE UNIQUE INDEX one_live_request_per_user ON ride_match.ride_requests(user_id) WHERE status IN ('active','grouped');
CREATE INDEX request_deadlines ON ride_match.ride_requests(expires_at) WHERE status='active';
CREATE TABLE ride_match.current_requests (
  user_id uuid PRIMARY KEY REFERENCES ride_match.users(id),
  request_id text NOT NULL UNIQUE,
  FOREIGN KEY (request_id,user_id) REFERENCES ride_match.ride_requests(id,user_id)
);
-- Exact origins never share a row/projection with discovery data.
CREATE TABLE ride_match.ride_origins (
  request_id text PRIMARY KEY REFERENCES ride_match.ride_requests(id),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  source text NOT NULL CHECK (source IN ('device','manual'))
);
CREATE TABLE ride_match.ride_groups (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('forming','ready','completed','cancelled')),
  coordinator_id uuid NOT NULL REFERENCES ride_match.users(id),
  destination jsonb NOT NULL,
  public_latitude double precision NOT NULL,
  public_longitude double precision NOT NULL,
  departure_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  history_expires_at timestamptz,
  closure_reason text CHECK (closure_reason IN ('completed','coordinator_cancelled','expired','members_left')),
  version integer NOT NULL CHECK (version > 0),
  CHECK (departure_at < expires_at AND created_at < expires_at),
  CHECK ((status IN ('forming','ready') AND closed_at IS NULL AND history_expires_at IS NULL AND closure_reason IS NULL)
    OR (status IN ('completed','cancelled') AND closed_at IS NOT NULL AND history_expires_at IS NOT NULL AND history_expires_at > closed_at
      AND closure_reason IS NOT NULL AND (status='completed')=(closure_reason='completed')))
);
ALTER TABLE ride_match.ride_requests ADD FOREIGN KEY (group_id) REFERENCES ride_match.ride_groups(id);
CREATE INDEX group_deadlines ON ride_match.ride_groups(expires_at) WHERE status IN ('forming','ready');
CREATE TABLE ride_match.group_memberships (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES ride_match.ride_groups(id),
  user_id uuid NOT NULL REFERENCES ride_match.users(id),
  request_id text NOT NULL UNIQUE REFERENCES ride_match.ride_requests(id),
  seat smallint NOT NULL CHECK (seat BETWEEN 1 AND 4),
  join_order integer NOT NULL CHECK (join_order > 0),
  UNIQUE (group_id,join_order),
  joined_at timestamptz NOT NULL,
  left_at timestamptz,
  live boolean NOT NULL DEFAULT true,
  CHECK (NOT live OR left_at IS NULL)
);
CREATE UNIQUE INDEX one_live_group_per_user ON ride_match.group_memberships(user_id) WHERE live;
CREATE UNIQUE INDEX one_current_member ON ride_match.group_memberships(group_id,user_id) WHERE left_at IS NULL;
CREATE UNIQUE INDEX group_seat_capacity ON ride_match.group_memberships(group_id,seat) WHERE left_at IS NULL;
CREATE TABLE ride_match.group_meeting_points (
  group_id text PRIMARY KEY REFERENCES ride_match.ride_groups(id),
  id text NOT NULL,
  place_id text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  label text NOT NULL
);
-- Private replay snapshots are not a source of public discovery or event payloads.
CREATE TABLE ride_match.operation_receipts (
  actor_id uuid NOT NULL REFERENCES ride_match.users(id),
  operation_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb,
  access_membership_id text REFERENCES ride_match.group_memberships(id),
  replay_until timestamptz NOT NULL,
  PRIMARY KEY (actor_id,operation_id)
);
CREATE TABLE ride_match.match_sets (
  request_id text PRIMARY KEY REFERENCES ride_match.ride_requests(id),
  fingerprint text NOT NULL,
  version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE ride_match.domain_outbox (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  resource_id text NOT NULL,
  version integer NOT NULL,
  occurred_at timestamptz NOT NULL
);
-- Deferred validation observes the final state of a multi-row membership transaction.
CREATE FUNCTION ride_match.check_group_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid text; g ride_match.ride_groups%ROWTYPE; n integer;
BEGIN
  IF TG_TABLE_NAME='ride_groups' THEN gid=NEW.id; ELSE gid=COALESCE(NEW.group_id,OLD.group_id); END IF;
  SELECT * INTO g FROM ride_match.ride_groups WHERE id=gid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO n FROM ride_match.group_memberships WHERE group_id=gid AND left_at IS NULL;
  IF n > 4 OR n < 1 OR (g.closure_reason IS DISTINCT FROM 'members_left' AND n < 2)
    OR (g.closure_reason='members_left' AND n <> 1)
    OR NOT EXISTS (SELECT 1 FROM ride_match.group_memberships WHERE group_id=gid AND user_id=g.coordinator_id AND left_at IS NULL)
    OR EXISTS (SELECT 1 FROM ride_match.group_memberships m JOIN ride_match.ride_requests r ON r.id=m.request_id
      WHERE m.group_id=gid AND m.left_at IS NULL AND
        (m.live <> (g.status IN ('forming','ready')) OR r.group_id IS DISTINCT FROM gid OR
          r.status <> CASE WHEN g.status IN ('forming','ready') THEN 'grouped' WHEN g.status='completed' THEN 'completed' ELSE 'cancelled' END))
    OR (g.status IN ('ready','completed') AND NOT EXISTS (SELECT 1 FROM ride_match.group_meeting_points WHERE group_id=gid))
  THEN RAISE EXCEPTION 'Group invariant violated' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_group_after_write AFTER INSERT OR UPDATE ON ride_match.ride_groups
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ride_match.check_group_integrity();
CREATE CONSTRAINT TRIGGER check_members_after_write AFTER INSERT OR UPDATE OR DELETE ON ride_match.group_memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ride_match.check_group_integrity();
