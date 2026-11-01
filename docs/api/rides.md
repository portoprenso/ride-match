# Future API: places, rides, and matching

Status: planned; the place, ride request, nearby and match contracts exist in `packages/contracts`. Last updated: 2026-11-01.

All paths use `/v1`; tables show unwrapped response data. See [overview](overview.md) for common errors and idempotency.

## Endpoints

| Method/path | Auth | Body/query | Response | Important errors |
| --- | --- | --- | --- | --- |
| `GET /places/search` | Public | Optional search text, coarse area, limit | `PlaceDto[]` | `VALIDATION_FAILED`, `UNSUPPORTED_AREA` |
| `GET /rides/nearby` | Public | `NearbyQueryInput`: coarse viewport, optional destination place and departure choice, limit | `NearbySnapshotDto`: items, match previews, `truncated` | `VALIDATION_FAILED` (including a viewport wider than 0.5°), `UNSUPPORTED_AREA` |
| `GET /rides/{rideId}` | Public | Ride ID | `RideRequestDto` | `TARGET_UNAVAILABLE` for an unknown request or one no longer active |
| `GET /me/ride-request` | User | None | Current/latest `OwnRideRequestDto` or `null` | Session expired |
| `POST /rides` | User | `CreateRideRequestInput` | `OwnRideRequestDto` | `ACTIVE_REQUEST_EXISTS`, `LOCATION_STALE`, `UNSUPPORTED_AREA`, `IDEMPOTENCY_CONFLICT` |
| `POST /rides/{rideId}/cancel` | Owner | `CancelRideRequestInput`: expected version, operation ID | Updated `OwnRideRequestDto` | `USE_LEAVE_GROUP`, `RIDE_EXPIRED`, `INVALID_TRANSITION`, `VERSION_CONFLICT` |
| `GET /rides/{rideId}/matches` | Owner | None | `RideMatchSetDto` | `FORBIDDEN` for another user's request; an inactive request has an empty set |

## Places and discovery

Destination search uses a curated fixture dataset in the MVP. Suggestions contain place ID, label, and selected place coordinates. Do not add a real geocoder or places-service dependency during the mock milestone.

The place contracts exist since CONTRACT-002-A (`packages/contracts/src/places.ts`):

| Schema | Rule |
| --- | --- |
| `PlaceSchema` | `id` (stable across searches, sessions and resets), `label` (1–80 characters), `detail` (secondary line such as a street, 1–120 characters, or `null`) and `coordinates` of the place itself. Public; it never describes a person |
| `SearchPlacesInputSchema` | Optional `query` (1–80 characters, one line, trimmed by the app), `area` and `limit` (1–20). Without a query, the area's places come nearest its center first, for the "other places" list (screen 03) and named pickup points (screen 22); with one, matches come by relevance |
| `PlaceSearchAreaSchema` | `center` as coarse coordinates (at most 2 decimal places, about 1 km) and `radiusMeters` (whole number, 1,000–50,000), derived from the map region, never the exact device position |
| `PlaceSearchResultsSchema` | At most 20 places, each once, never more than the requested `limit`. Empty means nothing matched in a supported area |

An area outside the curated coverage (the demo city) fails with `UNSUPPORTED_AREA` (422); an invalid query fails with `VALIDATION_FAILED`. These limits are mock values (`PLACE_SEARCH_POLICY`). How the future HTTP adapter encodes the input as query parameters is decided with that adapter.

Discovery accepts a coarse bounded viewport, not an exact continuously uploaded device track: the app rounds its visible region outward to 2 decimal places, and each span is at most 0.5°. The source caps the items at the requested limit (at most 100), keeps those nearest the viewport's center, and sets `truncated` when it left some out. The UI must not imply an exhaustive count when truncated. A viewport entirely outside the covered area fails with `UNSUPPORTED_AREA`.

`NearbyItemDto` is a union on `kind`:

- `ride`: the public projection of an active solo request (`RideRequestDto` fields).
- `group`: the public preview of a live group (`GroupPreviewDto` fields): public origin area, agreed destination, expected departure, `memberCount` of `capacity` (four), `forming` or `ready` status, expiry and version. No member list, coordinator, shared meeting point, or private chat.

Neither item carries a distance. Discovery never receives the device position, so the app computes the approximate distance it shows from the item's `publicOrigin.center` and its own location fix.

Before destination selection, show general activity. With a destination (and optionally a departure choice), the snapshot's `previews` give each compatible item an advisory match level. Preview results are advisory and do not reserve seats or guarantee later join success. Authenticated discovery leaves out the viewer's own request and group and blocked users without changing the public projection.

Grouped ride requests no longer appear individually in discovery. Represent their group once. Removed/expired/closed discovery items produce corresponding realtime removal hints.

## Request fields and lifecycle

Public request fields (`RideRequestDto`): ID, public user summary, `publicOrigin`, destination place, `departureAt`, `expiresAt`, version. Only an active request has a public projection, so it has no status or group reference: once grouped, ended or unknown, a public read answers `TARGET_UNAVAILABLE` and discovery shows the group instead. This keeps public reads from linking a named rider to a group, which group previews deliberately hide. The owner's view (`OwnRideRequestDto`) adds `status`, `groupId` and the exact `origin`. Exact origins never appear in public responses. Destinations are curated public places in the MVP, so the chosen place is public; a private exact destination would need its own owner-only field.

Statuses:

```text
active -> grouped -> completed
   |         |
   |         -> cancelled
   -> expired
   -> cancelled
```

Rules:

- One live (`active` or `grouped`) request per user.
- Departure options: Now, +5 minutes, +10 minutes, sent as `departureOffsetMinutes` (0, 5 or 10). The source sets `departureAt` from its clock at creation, so a choice made before signing in still means "in 5 minutes" when confirmed.
- Active discovery lifetime: 15 minutes from successful creation, controlled by the data source. A request always departs before it expires.
- The source validates origin recency/accuracy or explicit pickup confirmation. The origin is an `ExactLocationInput`: a device fix of at most 100 m accuracy and at most 60 s old (`LOCATION_STALE` otherwise), or a confirmed manual point. Mock defaults: [locations and users](overview.md#locations-and-users-contract-001-b).
- `expiresAt` controls discovery while active. Once grouped, group lifetime controls the intention; original discovery expiry does not eject a member.
- `groupId` is set once grouped and stays on a `completed` request; it is `null` while `active` and when `expired`, and a `cancelled` request keeps the group it was cancelled with, if any.
- Cancelling active request removes its matches/discovery entry. Cancelling a grouped request through this endpoint fails with `USE_LEAVE_GROUP`, an expired one with `RIDE_EXPIRED`, a completed or already cancelled one with `INVALID_TRANSITION`; these come before the `VERSION_CONFLICT` check.
- Leaving cancels that member's grouped request. Re-search requires explicit creation of a new request.
- Group cancellation cancels associated live grouped requests; completion completes them.
- UI may remove an expired marker locally by timestamp, but cannot extend or recreate validity. Refetch on foreground/reconnect.
- Keep the current/latest terminal own request available long enough for the active UI to explain its outcome; a new request replaces that current-reference role.

No arbitrary ride editing, recurring requests, or long-term scheduling in the MVP.

## Matching contract

`RideMatchDto` contains the target (`kind` ride or group, and `id`), `level: possible | good | excellent`, `additionalMinutes` (0–60, or `null` when unknown) and `expiresAt`. A score is optional only if a later reviewed API needs it; UI must not depend on an unexplained numeric score. The owner reads the whole set at once: `RideMatchSetDto` holds at most 20 matches, best first, each target once, with the set's own `version`, which a `matches.changed` event compares against. Only an active request has matches. Match previews in discovery (`MatchPreviewDto`) have the same fields without `expiresAt`. The app reads a target's public projection for its details.

The future backend is responsible for origin/departure compatibility, road-network distance, route overlap, detour, and destination compatibility. Straight-line distance is insufficient, for example where a railway makes geographically close destinations far apart by road.

Mock scenarios supply match records. No routing engine, route calculation, or production matching algorithm is implemented on mobile. A match never authorizes access to private data or guarantees a join; mutation-time checks remain authoritative.

## Implemented contracts (CONTRACT-002-B)

`packages/contracts/src/{rides,nearby,matches,groups}.ts`, covered by `pnpm test:contracts`:

| Schema | Visibility | Rule |
| --- | --- | --- |
| `RideRequestSchema` | Anyone, including anonymous | `id`, `user`, `publicOrigin` (public area), `destination` (place), `departureAt`, `expiresAt`, `version`; departure before expiry. Status, group, exact origin, accuracy and distance fail |
| `OwnRideRequestSchema` | Owner only | The public fields plus `status`, `groupId` (consistent with the status, as above) and `origin` (`OwnerLocationDto`) |
| `RideRequestStatusSchema` | — | `active`, `grouped`, `completed`, `expired`, `cancelled` |
| `CreateRideRequestInputSchema` | Private input | `operationId`, `origin` (`ExactLocationInput`), `destinationPlaceId`, `departureOffsetMinutes` (0, 5 or 10). An absolute departure time, a client-chosen public origin or an owner ID fail; an unknown place ID fails with `VALIDATION_FAILED` |
| `CancelRideRequestInputSchema` | Owner input | `operationId` and `expectedVersion` |
| `MapViewportSchema` | Anonymous input | `southWest` and `northEast` as coarse coordinates; north above south, east of west (no antimeridian crossing), each span at most 0.5° |
| `NearbyQueryInputSchema` | Anonymous input | `viewport`, optional `destinationPlaceId`, optional `departureOffsetMinutes` (needs the destination), `limit` 1–100 |
| `NearbyItemSchema` | Anyone | Union on `kind`: `ride` with the public request fields, `group` with the group preview fields |
| `NearbySnapshotSchema` | Anyone | `items` (at most 100, each kind and ID once), `truncated`, `previews` (one per item at most, only for returned items; empty without a destination). No total count |
| `GroupPreviewSchema` | Anyone | `id`, `status` (`forming` or `ready`), `memberCount` (2–4), `capacity` (4), `publicOrigin`, `destination`, `departureAt`, `expiresAt`, `version`. Members, coordinator, meeting point, chat and linked requests fail |
| `JoinTargetSchema` | — | `kind` (`ride` or `group`) and `id`; `joinTargetKey` keys a target by both, since a ride and a group may share an ID |
| `MatchPreviewSchema`, `RideMatchSchema` | Viewer / owner | `target`, `level`, `additionalMinutes`; a match adds `expiresAt` |
| `RideMatchSetSchema` | Owner only | `version` and at most 20 `matches`, each target once. No cursor |

Mock values, to revisit before a backend exists:

| Policy | Value | Applied by |
| --- | --- | --- |
| `RIDE_POLICY.departureOffsetsMinutes` | 0, 5, 10 | The schema |
| `RIDE_POLICY.activeLifetimeSeconds` | 900 (15 minutes) | The source (RIDE-001-A); a test checks every departure choice comes before it |
| `NEARBY_POLICY` | Viewport span 0.5°, 100 items | The schemas |
| `MATCH_POLICY` | 20 matches, 0–60 additional minutes | The schemas |
| `GROUP_POLICY` | Capacity 4, at least 2 members | The group preview schema; the group timings are in [group contracts](groups.md#implemented-contracts-contract-003-a) |

`INVALID_DEPARTURE` was removed from the error codes: a departure outside the options fails validation instead.

## UI consistency and unknown outcomes

- Cancel in-flight obsolete viewport/place searches and use parameterized query keys.
- A matched target can disappear or fill during authentication/join latency; show the canonical error and refresh.
- If own request creation succeeds but joining fails, retain the active request.
- Repeated creation with the same operation ID returns the same request; a different concurrent creation violates the one-live-request invariant.
- Response loss after creation is an unknown outcome; read current own request or retry the same operation ID.

## Verification

Contract/public-projection checks, anonymous browse, destination preview, authenticated creation, existing-request conflict, idempotent retries, supplied match arrival, cancellation, foreground/background expiry, grouped request lifetime, stale selected target, and privacy-safe realtime events.
