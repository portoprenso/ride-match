# Future API: groups, meeting points, chat, and safety

Status: planned; the group, membership, join, leave and status contracts exist in `packages/contracts` (CONTRACT-003-A). Last updated: 2026-11-01.

Paths use `/v1`. Common envelopes/errors/idempotency are in [overview](overview.md). `Member` requires current membership; `Coordinator` also requires that role. Retained terminal history is accessible to members authorized at closure, not users who previously left.

## Endpoints

| Method/path | Auth | Body/query | Response | Important errors |
| --- | --- | --- | --- | --- |
| `POST /groups/join` | User | `JoinGroupInput`: own request ID, target (`kind` ride or group, and `id`), operation ID | `JoinGroupResultDto`: the forming group and the grouped own request | In the order of [atomic joining](#atomic-joining) |
| `GET /groups/{groupId}/preview` | Public | Group ID | `GroupPreviewDto` | `TARGET_UNAVAILABLE` for an unknown or closed group |
| `GET /groups/{groupId}` | Member | Group ID | `RideGroupDto` | `MEMBERSHIP_REQUIRED` for a former member, a non-member or an unknown group, so private reads never reveal whether a group exists; `HISTORY_EXPIRED` after a closed group's `historyExpiresAt` |
| `DELETE /groups/{groupId}/members/me` | Member | `LeaveGroupInput`: operation ID | `LeaveGroupResultDto`: group ID and the cancelled own request | `MEMBERSHIP_REQUIRED` for a new leave by a non-member (a retry with the same operation ID returns the original result), `GROUP_CLOSED` for a completed or cancelled group |
| `PATCH /groups/{groupId}/status` | Coordinator | `UpdateGroupStatusInput`: requested status, expected version, operation ID | Updated `RideGroupDto` | In this order: `MEMBERSHIP_REQUIRED`, `FORBIDDEN` (a member who is not the coordinator), `GROUP_CLOSED`, `VERSION_CONFLICT`, then `INVALID_TRANSITION` for a transition the current status does not allow, including marking ready without a meeting point |
| `GET /groups/{groupId}/messages` | Member | `beforeCursor` **or** `afterSequence`, limit | Message page and pagination metadata | Access revoked, history expired |
| `POST /groups/{groupId}/messages` | Member | Text, client message ID | Canonical message | Group closed, invalid text, access revoked |
| `PUT /me/blocks/{userId}` | User | Operation identity | Block result and membership effects | Cannot block self |
| `DELETE /me/blocks/{userId}` | User | None | `204` | Idempotent if absent |
| `GET /me/blocks` | User | Cursor | Blocked-user summaries | Session expired |
| `POST /reports` | User | Target, reason, optional bounded details/context IDs, operation identity | Report receipt ID | Invalid target/context |

## Group model

`RideGroupDto` is the member-only view: ID, status, coordinator ID, members in join order, capacity (four), agreed destination, expected departure, meeting point or `null`, createdAt/expiresAt, closure (`null` while live) and version. It has no member count; the app counts `members`. Destination and departure come from the target ride when the group forms, and members do not edit them.

Each member (`GroupMemberDto`) has a public user summary, joinedAt, and linked ride-request ID. One user occupies one seat and belongs to at most one live group. Do not add invitations, approval queues, multiple seats per account, or a role hierarchy. The coordinator is always one of the listed members: when the coordinator leaves, the earliest remaining member takes over, even if the group then closes.

A closed group's `closure` holds its reason (`completed`, `coordinator_cancelled`, `expired` or `members_left`), `closedAt` and `historyExpiresAt`. A group cancelled because members left keeps its one remaining member, who may read the history. The reason never says that a member left by blocking someone.

Public previews expose public location/destination, occupancy, expected departure, status, and expiry. They omit private locations, meeting points, chat, and the full private group representation. `GroupPreviewDto` exists since CONTRACT-002-B, with `GroupStatusSchema` and `GROUP_POLICY` (capacity four, at least two members); see [ride contracts](rides.md#implemented-contracts-contract-002-b). Only `forming` and `ready` groups have a preview. `JoinTargetSchema` (`kind` ride or group, and `id`) is also the join input's target.

## Atomic joining

1. Authenticate caller and validate the own request is active, owned by them, and unexpired.
2. Resolve the target ride or group at mutation time.
3. Check no conflicting membership, no blocked relationship with any participant, allowed lifecycle, target validity, and available capacity.
4. If target is solo, atomically create a two-person group; target rider is initial coordinator.
5. If another join already grouped that target, resolve the canonical group and check current capacity rather than create a second group.
6. Add membership and transition relevant requests to grouped atomically.
7. Return canonical group and own request; emit public discovery/private group changes.

Two last-seat joins produce one success and one `GROUP_FULL`. Two first joins of one solo target produce one canonical group. Repeated identical operation IDs return the prior result; a new operation from an already-grouped user is an explicit conflict.

The source checks in this order and answers the first failure:

| Check | Answer |
| --- | --- |
| The caller already sent this operation ID | The original result; `IDEMPOTENCY_CONFLICT` if the input differs |
| The own request is not the caller's | `FORBIDDEN` |
| The own request is grouped | `ALREADY_IN_GROUP` |
| The own request expired | `RIDE_EXPIRED` |
| The own request was completed or cancelled | `INVALID_TRANSITION` |
| The target is unknown or ended: a completed or cancelled group, or a ride that expired, was cancelled or completed. Also when a participant blocked the caller | `TARGET_UNAVAILABLE` |
| The caller blocked a participant | `BLOCKED_RELATIONSHIP` |
| The group (or the group that a ride target already joined) is `ready` | `GROUP_CLOSED` |
| The group has four members | `GROUP_FULL` |

The caller's own ride as the target fails input validation. A block in either direction prevents the join, but only the blocker learns that a block is the reason: to the blocked user the target is unavailable, as in authenticated discovery.

The join has no expected group version. It checks the group's current status and seats, so a group that changed in an unrelated way does not fail the join, and two last-seat joins end in one success and one `GROUP_FULL`, not a version conflict.

If own request creation succeeded before a join failure, that request remains active. The UI explains this partial sequence; it is not one cross-operation transaction.

## State machine

```text
forming -> ready -> completed
   ^         |
   +---------+

forming / ready -> cancelled
```

| Trigger | Actor | Transition (closure reason) | Rule |
| --- | --- | --- | --- |
| Join a solo ride | User with an active request | new group: `forming` | A group of two; the target rider is coordinator |
| Join a group | User with an active request | `forming` stays `forming` | A seat must be free. The fourth member makes the group full, not ready |
| Mark ready | Coordinator | `forming` → `ready` | A meeting point is present; a live group always has at least two members. Joins stop |
| Reopen | Coordinator | `ready` → `forming` | Accepts further members |
| Meeting point changes or is withdrawn | Source | `ready` → `forming`; `forming` stays | The source replaces the point (new ID) or sets it to `null`. A ready group returns to forming, so the coordinator must confirm the new point by marking the group ready again; meanwhile it accepts joins if a seat is free |
| Member leaves, at least two remain | That member | `ready` → `forming`; `forming` stays | Access ends at once and the leaver's request is cancelled. If the coordinator left, the earliest remaining member takes over |
| Member leaves, one remains | That member | → `cancelled` (`members_left`) | The remaining member's live request is cancelled too; that member keeps read access until `historyExpiresAt` |
| Complete | Coordinator | `ready` → `completed` (`completed`) | Completes the members' requests |
| Cancel | Coordinator | `forming` or `ready` → `cancelled` (`coordinator_cancelled`) | Cancels the members' requests |
| Expiry | Source | `forming` or `ready` → `cancelled` (`expired`) | At `expiresAt`; cancels the members' requests |

Any other requested status fails with `INVALID_TRANSITION`, and a change to a closed group with `GROUP_CLOSED`. Every transition increases the group version.

Lifetime: 30 minutes from group creation (`GROUP_POLICY.lifetimeSeconds`). Grouped requests follow this deadline, not their old discovery expiry. Leave cancels the leaver's request; no automatic resurrection or replacement request.

Opening a taxi link does not change group status or prove departure/completion. No separate `departed` state is needed for this MVP.

On completed/cancelled groups, disable joining and sending. Keep authorized terminal history read-only until one hour after closure (`historyExpiresAt`, from `GROUP_POLICY.historyRetentionSeconds`), then answer `HISTORY_EXPIRED`. These timings are mock-product defaults to review before production, not a full legal data-retention policy. Leaving always revokes access immediately, irrespective of history retention.

## Meeting points

The mock source supplies a suggested shared public place after group formation and can replace or withdraw it. Members see its distinct map landmark, label, and optional viewer-specific approximate walking estimate. The group carries it as `meetingPoint`, `null` until available. There is no separate meeting-point read: the app reads the group again.

A replaced point has a new `id`, which is how the app notices a change. The viewer-specific `walkingMinutes` may differ between members and reads without changing the group version. Changing or withdrawing a ready group's point returns the group to forming (see the [state machine](#state-machine)). A completed group keeps the point it was ready with.

`MeetingPointDto` exists since CONTRACT-001-B: ID, coordinates, a 1–80 character label and `walkingMinutes` (0–60 or `null`); see [locations and users](overview.md#locations-and-users-contract-001-b). Meeting-point coordinates are not a member's live location. Keep them member-only. Walking estimates are supplied values, not client route calculations. Agreement happens through chat and readiness confirmation; no optimization or collaborative point-editing endpoint is needed now.

Group destination is a reviewed shared destination/venue. Do not expose members' private exact destinations or silently create multi-stop taxi bookings.

## Implemented contracts (CONTRACT-003-A)

`packages/contracts/src/groups.ts`, covered by `pnpm test:contracts`:

| Schema | Visibility | Rule |
| --- | --- | --- |
| `RideGroupSchema` | Current members; members at closure until `historyExpiresAt` | The fields above. A closure exactly when closed, with a reason that fits the status; two to four members unless the group closed with `members_left` (then one); each user and ride request once; members in join order, none before `createdAt`; the coordinator among them; a meeting point when `ready` or `completed`; creation and departure before expiry. Exact origins, phone numbers, chat and a stored member count fail |
| `GroupMemberSchema` | Members | `user`, `joinedAt`, `rideRequestId`. Exact origins, live locations and roles fail |
| `GroupClosureSchema`, `GroupClosureReasonSchema` | Members | `reason`, `closedAt`, `historyExpiresAt` after `closedAt` |
| `JoinGroupInputSchema` | Private input | `operationId`, `rideRequestId`, `target`. The caller's own ride as the target, an expected version and a caller-supplied user ID fail |
| `JoinGroupResultSchema` | Joiner | `group` (still `forming`) and `rideRequest` (`grouped` into that group and listed among its members) |
| `LeaveGroupInputSchema` | Member input | `operationId` only: no version, no other member |
| `LeaveGroupResultSchema` | Leaver | `groupId` and `rideRequest`, `cancelled` with that group. Nothing about the group after the leave |
| `UpdateGroupStatusInputSchema` | Coordinator input | `operationId`, requested `status`, `expectedVersion`. A meeting point or coordinator change fails |

Mock values, to revisit before a backend exists:

| Policy | Value | Applied by |
| --- | --- | --- |
| `GROUP_POLICY.capacity`, `minMembers` | 4 seats, at least 2 members | The schemas |
| `GROUP_POLICY.lifetimeSeconds` | 1,800 (30 minutes) | The source (GROUP-001-C); a test checks every departure choice comes before it |
| `GROUP_POLICY.historyRetentionSeconds` | 3,600 (one hour) | The source (GROUP-001-C) |

No error codes were added. `GROUP_CLOSED` answers a join to a ready group and a leave or status change on a closed group; chat sending to a closed group (CONTRACT-003-B) uses it too.

## Chat

- Text only; proposed trimmed length 1–1,000 characters, enforced at the boundary.
- Server/source sets sender and timestamp. Caller cannot impersonate a user.
- Group-local increasing message sequence supports catch-up and stable ordering.
- Canonical message ID identifies a stored message. A sender's client message ID identifies one send intent and remains unchanged on retry.
- Deduplicate retries and socket echoes by canonical/client message IDs scoped appropriately to sender/group.
- `beforeCursor` loads older history; `afterSequence` catches up missing messages. They are mutually exclusive.
- Return messages in ascending sequence order within each page plus next cursor/hasMore. Continue catch-up until complete.
- Pending/sending/failed presentation is mobile-only. Do not persist it as canonical message status.
- Losing a response after commit must not create another message on retry.
- Membership/lifecycle is checked on every read/send and subscription.
- Leaving or revocation clears history/composer private data immediately; stale events cannot restore access.
- No background offline send queue, attachments, editing, reactions, threads, presence, or read receipts.

## Block and report

Blocking is authenticated and idempotent. It filters future authenticated discovery/pairing, prevents groups containing a mutually blocked relationship, and prevents subsequent shared-group interaction. If the blocker currently shares a group with the target, block and remove the blocker from that group atomically. Explain “block and leave group” before confirmation; do not expel the other user on the blocker's behalf.

Apply normal leave/coordinator/cancellation rules, revoke private access, and return membership effects so UI can reconcile. If fewer than two members remain, the group closes with reason `members_left`, which does not reveal the block. Unblock removes future filtering; it does not restore former membership or history access.

Reports accept a bounded reason and optional details with relevant context IDs. Return a receipt only after successful mock acceptance. Validate referenced context access, avoid copying private content into analytics, and allow explicit retry on failure. A receipt is not proof of a moderation outcome. No moderation dashboard or reputation system is part of the MVP.

## Verification

Test atomic solo formation, canonical group resolution under simultaneous joins, capacity/idempotency, coordinator transfer, ready/reopen, leave-to-forming/cancelled, expiry, history retention, unauthorized reads/sends, chat pagination/retry/deduplication, block-and-leave, and report failure/receipt. Verify public group previews never contain member-only fields.
