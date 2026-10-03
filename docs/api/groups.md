# Future API: groups, meeting points, chat, and safety

Status: planned. Last updated: 2026-10-03.

Paths use `/v1`. Common envelopes/errors/idempotency are in [overview](overview.md). `Member` requires current membership; `Coordinator` also requires that role. Retained terminal history is accessible to members authorized at closure, not users who previously left.

## Endpoints

| Method/path | Auth | Body/query | Response | Important errors |
| --- | --- | --- | --- | --- |
| `POST /groups/join` | User | Own request ID; target ride ID **or** group ID; optional expected group version; operation identity | Group and updated own request | Full/closed/expired target, blocked relationship, already grouped, version conflict |
| `GET /groups/{groupId}/preview` | Public | Group ID | Public group summary | Not found/unavailable |
| `GET /groups/{groupId}` | Member | Group ID | `RideGroupDto` | Membership revoked, retention ended |
| `DELETE /groups/{groupId}/members/me` | Member | Operation identity | Leave result and updated own request | Already-left is idempotent |
| `PATCH /groups/{groupId}/status` | Coordinator | Requested status, expected version, operation identity | Updated group | Invalid transition, insufficient members, missing meeting point, version conflict |
| `GET /groups/{groupId}/meeting-point` | Member | Group ID | `MeetingPointDto` or `null` | Membership revoked |
| `GET /groups/{groupId}/messages` | Member | `beforeCursor` **or** `afterSequence`, limit | Message page and pagination metadata | Access revoked, history expired |
| `POST /groups/{groupId}/messages` | Member | Text, client message ID | Canonical message | Group closed, invalid text, access revoked |
| `PUT /me/blocks/{userId}` | User | Operation identity | Block result and membership effects | Cannot block self |
| `DELETE /me/blocks/{userId}` | User | None | `204` | Idempotent if absent |
| `GET /me/blocks` | User | Cursor | Blocked-user summaries | Session expired |
| `POST /reports` | User | Target, reason, optional bounded details/context IDs, operation identity | Report receipt ID | Invalid target/context |

## Group model

`RideGroupDto` contains ID, coordinator ID, authorized member list, capacity (four), status, agreed destination, expected departure, optional meeting point, createdAt/expiresAt, version, and terminal closure metadata where relevant.

Each member has a public user summary, joinedAt, and linked ride-request ID. One user occupies one seat and belongs to at most one live group. Do not add invitations, approval queues, multiple seats per account, or a role hierarchy.

Public previews expose public location/destination, occupancy, expected departure, status, and expiry. They omit private locations, meeting points, chat, and the full private group representation.

## Atomic joining

1. Authenticate caller and validate the own request is active, owned by them, and unexpired.
2. Resolve the target ride or group at mutation time.
3. Check no conflicting membership, no blocked relationship with any participant, allowed lifecycle, target validity, and available capacity.
4. If target is solo, atomically create a two-person group; target rider is initial coordinator.
5. If another join already grouped that target, resolve the canonical group and check current capacity rather than create a second group.
6. Add membership and transition relevant requests to grouped atomically.
7. Return canonical group and own request; emit public discovery/private group changes.

Two last-seat joins produce one success and one `GROUP_FULL`. Two first joins of one solo target produce one canonical group. Repeated identical operation IDs return the prior result; a new operation from an already-grouped user is an explicit conflict.

If own request creation succeeded before a join failure, that request remains active. The UI explains this partial sequence; it is not one cross-operation transaction.

## State machine

```text
forming -> ready -> completed
   ^         |
   +---------+

forming / ready -> cancelled
```

| Trigger | Rule and resulting state |
| --- | --- |
| Join | Only forming; capacity below four |
| Mark ready | Coordinator; at least two members; shared meeting point present |
| Fourth member joins | Full forming group; not automatically ready |
| Reopen | Coordinator changes ready to forming to accept further members |
| Member leaves | Remove access immediately; ready becomes forming if at least two remain |
| Fewer than two remain | Cancel group and associated remaining live grouped requests |
| Coordinator leaves | Earliest remaining member becomes coordinator if group survives |
| Explicit completion | Coordinator transitions ready to completed |
| Explicit cancellation | Coordinator cancels forming/ready group |
| Group expires | Source cancels forming/ready group with expiry reason |

Proposed lifetime: 30 minutes from group creation. Grouped requests follow this deadline, not their old discovery expiry. Leave cancels the leaver's request; no automatic resurrection or replacement request.

Opening a taxi link does not change group status or prove departure/completion. No separate `departed` state is needed for this MVP.

On completed/cancelled groups, disable joining and sending. Keep authorized terminal history read-only until one hour after closure, then return a documented unavailable/history-expired result. These timings are mock-product defaults to review before production, not a full legal data-retention policy. Leaving always revokes access immediately, irrespective of history retention.

## Meeting points

The mock source supplies a suggested shared public place after group formation and can emit an update. Members see its distinct map landmark, label, and optional viewer-specific approximate walking estimate. The source returns `null` until available.

Meeting-point coordinates are not a member's live location. Keep them member-only. Walking estimates are supplied values, not client route calculations. Agreement happens through chat and readiness confirmation; no optimization or collaborative point-editing endpoint is needed now.

Group destination is a reviewed shared destination/venue. Do not expose members' private exact destinations or silently create multi-stop taxi bookings.

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

Apply normal leave/coordinator/cancellation rules, revoke private access, and return membership effects so UI can reconcile. Unblock removes future filtering; it does not restore former membership or history access.

Reports accept a bounded reason and optional details with relevant context IDs. Return a receipt only after successful mock acceptance. Validate referenced context access, avoid copying private content into analytics, and allow explicit retry on failure. A receipt is not proof of a moderation outcome. No moderation dashboard or reputation system is part of the MVP.

## Verification

Test atomic solo formation, canonical group resolution under simultaneous joins, capacity/idempotency, coordinator transfer, ready/reopen, leave-to-forming/cancelled, expiry, history retention, unauthorized reads/sends, chat pagination/retry/deduplication, block-and-leave, and report failure/receipt. Verify public group previews never contain member-only fields.
