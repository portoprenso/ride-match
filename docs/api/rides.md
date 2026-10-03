# Future API: places, rides, and matching

Status: planned. Last updated: 2026-10-03.

All paths use `/v1`; tables show unwrapped response data. See [overview](overview.md) for common errors and idempotency.

## Endpoints

| Method/path | Auth | Body/query | Response | Important errors |
| --- | --- | --- | --- | --- |
| `GET /places/search` | Public | Search text, coarse area, limit | `PlaceDto[]` | Invalid query, unsupported area |
| `GET /rides/nearby` | Public | Bounded viewport, optional destination place/departure, limit | Public nearby items, preview matches, `truncated` | Viewport too large, invalid query |
| `GET /rides/{rideId}` | Public | Ride ID | `RideRequestDto` | `NOT_FOUND`, `TARGET_UNAVAILABLE` |
| `GET /me/ride-request` | User | None | Current/latest own request or `null` | Session expired |
| `POST /rides` | User | `CreateRideRequestInput` | `OwnRideRequestDto` | `ACTIVE_REQUEST_EXISTS`, `LOCATION_STALE`, `INVALID_DEPARTURE` |
| `POST /rides/{rideId}/cancel` | Owner | Expected version, operation identity | Updated own request | `USE_LEAVE_GROUP`, `VERSION_CONFLICT` |
| `GET /rides/{rideId}/matches` | Owner | Optional cursor | Match page | `RIDE_EXPIRED`, inactive request |

## Places and discovery

Destination search uses a curated fixture dataset in the MVP. Suggestions contain place ID, label, and selected place coordinates. Do not add a real geocoder or places-service dependency during the mock milestone.

Discovery accepts a coarse bounded viewport, not an exact continuously uploaded device track. Apply input limits and return `truncated` when capped. The UI must not imply an exhaustive count when truncated.

`NearbyItemDto` is a discriminated union:

- Ride item: public request summary, public origin/destination, approximate distance, expiry, version.
- Group item: public origin/destination, expected departure, occupancy/capacity, forming/ready status, expiry, version. No full member list, shared meeting point, or private chat.

Before destination selection, show general activity. With a destination/departure filter, the source may return preview compatibility. Preview results are advisory and do not reserve seats or guarantee later join success. Authenticated discovery applies block filtering without changing the public projection.

Grouped ride requests no longer appear individually in discovery. Represent their group once. Removed/expired/closed discovery items produce corresponding realtime removal hints.

## Request fields and lifecycle

Public request fields: ID, public user summary, `publicOrigin`, public destination area/label, `departureAt`, `expiresAt`, status, optional group ID, version. Owner-only restoration data uses a distinct schema. Exact private destination and origin do not leak into public responses.

Proposed statuses:

```text
active -> grouped -> completed
   |         |
   |         -> cancelled
   -> expired
   -> cancelled
```

Rules:

- One live (`active` or `grouped`) request per user.
- Departure options: Now, +5 minutes, +10 minutes.
- Active discovery lifetime: 15 minutes from successful creation, controlled by the data source.
- The source validates departure time and origin recency/accuracy or explicit pickup confirmation.
- `expiresAt` controls discovery while active. Once grouped, group lifetime controls the intention; original discovery expiry does not eject a member.
- Cancelling active request removes its matches/discovery entry. Cancelling a grouped request through this endpoint fails with `USE_LEAVE_GROUP`.
- Leaving cancels that member's grouped request. Re-search requires explicit creation of a new request.
- Group cancellation cancels associated live grouped requests; completion completes them.
- UI may remove an expired marker locally by timestamp, but cannot extend or recreate validity. Refetch on foreground/reconnect.
- Keep the current/latest terminal own request available long enough for the active UI to explain its outcome; a new request replaces that current-reference role.

No arbitrary ride editing, recurring requests, or long-term scheduling in the MVP.

## Matching contract

`RideMatchDto` contains target kind/ID, `level: possible | good | excellent`, optional additional minutes, validity time, and version. A score is optional only if a later reviewed API needs it; UI must not depend on an unexplained numeric score.

The future backend is responsible for origin/departure compatibility, road-network distance, route overlap, detour, and destination compatibility. Straight-line distance is insufficient, for example where a railway makes geographically close destinations far apart by road.

Mock scenarios supply match records. No routing engine, route calculation, or production matching algorithm is implemented on mobile. A match never authorizes access to private data or guarantees a join; mutation-time checks remain authoritative.

## UI consistency and unknown outcomes

- Cancel in-flight obsolete viewport/place searches and use parameterized query keys.
- A matched target can disappear or fill during authentication/join latency; show the canonical error and refresh.
- If own request creation succeeds but joining fails, retain the active request.
- Repeated creation with the same operation ID returns the same request; a different concurrent creation violates the one-live-request invariant.
- Response loss after creation is an unknown outcome; read current own request or retry the same operation ID.

## Verification

Contract/public-projection checks, anonymous browse, destination preview, authenticated creation, existing-request conflict, idempotent retries, supplied match arrival, cancellation, foreground/background expiry, grouped request lifetime, stale selected target, and privacy-safe realtime events.
