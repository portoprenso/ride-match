# Backend operations — BE-006

Updated: 2026-11-20. Local backend/container work is verified; BE-006 remains open for the handoff's bounded iOS/Android smoke, which was not run under the user's no-native-QA restriction. Nothing was deployed externally. External push stays disabled by explicit user decision.

## Run the packaged API locally

Requirements remain Node 24.17.0/pnpm 11.28.2 for workspace commands and local Docker Engine/Compose. From the repository root:

```bash
nvm use
pnpm build:api:image
# Initial setup only; preserve an existing .env.runtime.local.
cp apps/api/.env.runtime.example apps/api/.env.runtime.local

docker compose --env-file apps/api/.env.runtime.local -f apps/api/compose.runtime.yaml up -d --wait postgres
docker compose --env-file apps/api/.env.runtime.local -f apps/api/compose.runtime.yaml run --rm migrate
docker compose --env-file apps/api/.env.runtime.local -f apps/api/compose.runtime.yaml up -d --wait api
```

API is `http://127.0.0.1:3001/v1` by default; API_HOST_PORT selects another free host port. PostgreSQL has no published host port in this runtime stack. Its network/volume/project are separate from the existing development `apps/api/compose.yaml`. These are local rehearsal commands, not a public deployment. The synthetic example uses API_APP_ENV=production with SMS/push disabled; OTP requests intentionally fail safely and do not pretend to send SMS. Keep the separate host development setup for synthetic sign-in/integration journeys. Do not replace an existing env file or stop another project's listener.

The Dockerfile pins the multi-platform official Node image by version and digest. It builds API/contracts from the workspace frozen lockfile with lifecycle scripts disabled, then performs an offline frozen production-only installation and preserves the pnpm workspace symlink layout. Runtime copies only production dependencies, compiled API/contracts, package manifests and SQL migrations. No application source/tests/mobile/native assets/env files, registry credentials or dev tools enter the runtime stage. Deny-by-default .dockerignore limits the build context. No new package versions or lockfile changes were needed in BE-006.

Node runs as a non-root user and receives SIGTERM directly through the runtime command/init. Compose uses a read-only root filesystem, a small temporary /tmp, dropped capabilities and no-new-privileges. API_HOST defaults to 127.0.0.1 for host runs; the image explicitly binds 0.0.0.0 inside its isolated container while Compose publishes only loopback. No TLS certificate, external domain, hosting account or trusted-proxy configuration is supplied.

## Probes, startup and shutdown

- `/v1/health/live` does not require PostgreSQL and remains 200 during an outage.
- `/v1/health/ready` performs a bounded DB query and compares the exact committed migration journal (names/checksums/count) with the packaged immutable SQL manifest. Missing/pending/extra/edited journal entries, absent migration files/journal table and DB failure return safe SERVICE_UNAVAILABLE/503. This is ledger compatibility, not full schema-drift analysis or SMS/push/business readiness.
- Migrations are a separate explicit release command. API startup never applies DDL or resets a DB. Readiness is false until migration succeeds; a later successful migration recovers readiness without restarting API.
- The image's silent health CLI checks readiness with a timeout. Container smoke verified Docker health status healthy after migration; it does not print private response/environment content.
- SIGTERM/SIGINT closes HTTP/WebSockets, stops/awaits workers and drains pools. Runtime stop grace is 15 s. Smoke verified a normal 0/143 exit rather than forced kill/OOM and socket disconnect.

Stop only this runtime stack, preserving its DB volume:

```bash
docker compose --env-file apps/api/.env.runtime.local -f apps/api/compose.runtime.yaml down
```

Do not add `--volumes` for ordinary stopping. Stop Docker Desktop only when it was started for the session and no unrelated containers need it. The host development stack still uses `pnpm db:down` separately.

## Release and rollback boundaries

Build an image from the reviewed lockfile, preserve its identity, back up before migration, run migration using the image's own files, then start instances and verify readiness/one representative journey. The migration runner serializes and checks immutable history; failed batches roll back. Readiness intentionally refuses an older image against a newer journal, so arbitrary rolling upgrades/old-image rollback are **not** zero-downtime-compatible today. Coordinate a maintenance window; use a reviewed forward fix or a validated restore when schemas are incompatible. There is no automatic down migration.

Keep environment/secrets out of Docker build args/layers, URLs in logs and public Expo variables. API_AUTH_SECRET must match restored identity/verifier/token ciphertext data; changing it is not transparent key rotation. Migration/runtime DB roles are not separated in the synthetic local example; least-privilege roles, external DB TLS/access controls and key rotation require an operational decision before external rollout.

## Backup/restore rehearsal

The opt-in container smoke uses `pg_dump --format=custom --no-owner --no-acl`, restores to a newly created test DB with `pg_restore --exit-on-error`, verifies all five migration records and three catalogue rows, then removes its owned temporary DB/dump/containers/volume/network. It tested a synthetic schema/catalogue snapshot, not production credentials/messages, PITR, storage durability or a promised RPO/RTO.

For a manual **local** runtime backup, keep the dump outside the checkout with restricted permissions:

```bash
umask 077
ride_match_backup=$(mktemp /private/tmp/ride-match-backup.XXXXXX)
docker compose --env-file apps/api/.env.runtime.local -f apps/api/compose.runtime.yaml exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$ride_match_backup"
```

Restore only into a new, explicitly selected empty database; never point a rehearsal at the live database. `createdb` must succeed before running `pg_restore`, and restore must stop at the first error. The smoke test is the reproducible automated version. Dumps can contain private messages/locations/identities even though application logs do not; backup encryption/access/retention and recovery of the matching secret must be planned separately. See [PostgreSQL dump/restore](https://www.postgresql.org/docs/18/backup-dump.html).

The 2026-11-21 realtime deadline follow-up passed source build/typecheck/lint and 26 unit/HTTP checks, followed by 9 real PostgreSQL/two-instance WebSocket checks. `pnpm build:api:image` rebuilt `ride-match-api:local` with the fix; `pnpm test:api:container` passed on that image (local ID `sha256:dec553a0aadc4d1eb1acbc8f98929b526f2002502178a88b1bf4ffcc42f721c9`). Owned resources and Docker Desktop were stopped; the image and existing development data/env remain. Native acceptance is still open.

## What is verified and what remains open

| Area | Local evidence | Remaining before external use |
| --- | --- | --- |
| Representative multi-user flow | Five actual mobile transport/session clients, two API instances and PostgreSQL: anonymous discovery/place search → requests/matches → canonical joins/last-seat race → ready → stable lost-response chat → restart/catch-up → report/block-and-leave → coordinator completion/history expiry/logout | Bounded iOS/Android smoke against actual native networking/UI; not run under existing user restriction |
| Container/recovery | Pinned image, non-root/read-only runtime, packaged contracts, absent env/source/dev tools, explicit 5/0 migrations, ready false before schema, Docker healthy after schema, DB outage/restart and safe production-disabled OTP | Public HTTPS/upgrade routing, trusted proxy/ingress abuse protection and rollout rehearsal |
| Auth/push | Synthetic SMS for dev, production-disabled SMS; actual session/device/revision boundaries and disabled external push | Real SMS provider/limits; EAS/APNs/FCM/provider credentials/native tokens/OS delivery remain unconfigured; user leaves sending disabled |
| Data durability/privacy | Checked transactional SQL; local message/report purge and synthetic dump/restore | Approved auth/location/report/metadata/tombstone/outbox/WAL/backup retention, encrypted backups/PITR/RPO/RTO and key rotation |
| Capacity/operations | Durable references, guarded delivery, fixed safe logs/request IDs | Global serialized scans/IO under lock, outbox growth, queue monitoring/backoff/reconciliation and load/availability review |
| Product matching | Fixed public cells, owner/private projection boundaries and coarse venue/time recommendations | Real catalogue/coverage/route policy and privacy review; no anonymity/production routing claim |

Unknown/crashed push sending work is not automatically reset to pending: this could duplicate an accepted POST. Tickets are provider acceptance, not OS delivery. Inspect aggregate states rather than logging token/payload/private inputs; define a recovery policy before production. Current readiness does not certify these external/provider/product policies.

## Reproduce the focused checks

```bash
pnpm build:api
pnpm --filter @ride-match/api typecheck
pnpm --filter @ride-match/api lint
pnpm test:api
# Local development PostgreSQL required; test creates/drops only random test DBs.
cd apps/api
node --env-file=.env.local --test tests/journey.integration.mjs tests/database.integration.mjs
# From repository root, after building the image:
pnpm test:api:container
```

Run the last command from the repository root (leave apps/api first). Container smoke is explicit, not part of test:integration, and creates/removes only its own random resources; it never resets the user's DB or removes unrelated containers. It requires Docker but no mobile/native tooling. Historical broad mobile/contract passes are not fresh BE-006 evidence. Detailed outcomes/failures are in WORK_LOG.

BE-006 cannot be marked fully completed while the bounded cross-platform smoke remains unperformed. The earlier user instruction prohibits Metro/emulator/native QA; the handoff's requirement does not override that instruction. Keep that acceptance item explicit until separately authorized or explicitly waived by the user.
