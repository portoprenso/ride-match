-- Allocate sequences transactionally; PostgreSQL sequences would leave rollback gaps.
CREATE TABLE ride_match.chat_counters (
  group_id text PRIMARY KEY REFERENCES ride_match.ride_groups(id),
  latest_sequence integer NOT NULL CHECK (latest_sequence >= 0)
);
ALTER TABLE ride_match.group_memberships ADD UNIQUE (id,group_id,user_id);
-- Intent tombstones contain no message text. They prevent replay under a new membership epoch.
CREATE TABLE ride_match.chat_intents (
  group_id text NOT NULL REFERENCES ride_match.ride_groups(id),
  sender_id uuid NOT NULL REFERENCES ride_match.users(id),
  client_message_id uuid NOT NULL,
  message_id text NOT NULL UNIQUE,
  membership_id text NOT NULL,
  fingerprint text NOT NULL,
  PRIMARY KEY (group_id,sender_id,client_message_id),
  FOREIGN KEY (membership_id,group_id,sender_id) REFERENCES ride_match.group_memberships(id,group_id,user_id)
);
CREATE TABLE ride_match.chat_messages (
  id text PRIMARY KEY REFERENCES ride_match.chat_intents(message_id),
  group_id text NOT NULL REFERENCES ride_match.chat_counters(group_id),
  sequence integer NOT NULL CHECK (sequence > 0),
  sender jsonb NOT NULL,
  text text NOT NULL CHECK (length(text) > 0),
  created_at timestamptz NOT NULL,
  UNIQUE (group_id,sequence)
);
CREATE TABLE ride_match.user_blocks (
  actor_id uuid NOT NULL REFERENCES ride_match.users(id),
  target_id uuid NOT NULL REFERENCES ride_match.users(id),
  blocked_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id,target_id),
  CHECK (actor_id <> target_id)
);
CREATE INDEX block_incoming ON ride_match.user_blocks(target_id,actor_id);
CREATE INDEX block_pages ON ride_match.user_blocks(actor_id,blocked_at DESC,target_id DESC);
CREATE TABLE ride_match.user_reports (
  id text PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES ride_match.users(id),
  target_id uuid NOT NULL REFERENCES ride_match.users(id),
  reason text NOT NULL CHECK (reason IN ('unsafe_behavior','harassment','spam_or_misleading','other')),
  details text,
  group_id text REFERENCES ride_match.ride_groups(id),
  message_id text,
  received_at timestamptz NOT NULL,
  purge_at timestamptz NOT NULL,
  CHECK (actor_id <> target_id AND purge_at > received_at),
  CHECK (message_id IS NULL OR group_id IS NOT NULL)
);
CREATE INDEX report_retention ON ride_match.user_reports(purge_at);
-- Final state permits block-and-leave, but never blocked pairs in a live group.
CREATE FUNCTION ride_match.check_block_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM ride_match.user_blocks b
    JOIN ride_match.group_memberships a ON a.user_id=b.actor_id AND a.live
    JOIN ride_match.group_memberships t ON t.user_id=b.target_id AND t.group_id=a.group_id AND t.live)
  THEN RAISE EXCEPTION 'Blocked membership invariant violated' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_block_after_write AFTER INSERT OR UPDATE ON ride_match.user_blocks
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ride_match.check_block_integrity();
CREATE CONSTRAINT TRIGGER check_block_after_membership AFTER INSERT OR UPDATE ON ride_match.group_memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ride_match.check_block_integrity();
