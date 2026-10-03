# Mobile product and UX plan

Status: planned. Last updated: 2026-10-03.

## Product principle

The central experience is: “Someone physically close to me wants to travel in my direction.” The map stays the primary interaction, with sheets supporting discovery and decisions. Do not turn the home screen into a conventional search-results list.

Ride Match helps people coordinate sharing a taxi. Booking and payment happen outside the application. The first milestone demonstrates every important flow with clearly identified synthetic data; it does not claim real riders are nearby.

## Scope

Include anonymous browsing, destination selection, simulated phone/OTP authentication, create/cancel request, supplied match results, groups of two to four, temporary text chat, meeting-point display, Yandex Go handoff, leave/block/report, and local notification-driven navigation.

Exclude actual backend/database, PostGIS/OSRM/Valhalla servers, production matching, mobile road routing, meeting-point optimization, payments/wallet/splitting, driver app/fleet, AI, social/friends/followers, recurring commuting, advanced reputation/ratings, background GPS, and multiple taxi providers. Chat excludes media/files, reactions, threads, editing, typing indicators, and read receipts.

One account occupies one seat. Multi-seat bookings are outside the MVP. Bishkek-area fixtures and recognizable destination labels are an initial demo assumption, not a finalized localization or market-expansion strategy.

## Navigation

| Route | Presentation and access |
| --- | --- |
| `/` | Persistent main map; anonymous browsing |
| `/auth/phone` | Modal phone entry; shown for protected actions |
| `/auth/otp` | Modal code verification |
| `/groups/[groupId]` | Member-only group detail |
| `/groups/[groupId]/chat` | Member-only full-screen chat |
| `/settings` | Minimal session, permission, and blocked-user controls |
| `/dev/scenarios` | Development/preview mock builds only |

Map-local sheets cover destination search, selected ride/group preview, create confirmation, active request/matches, and meeting-point inspection. Do not make every sheet position a route. Preserve camera state when opening and dismissing sheets.

Notification/deep-link entries carry resource IDs. Validate payload, restore authentication if required, fetch authoritative state, then navigate. Expired, removed, or unauthorized targets show a clear unavailable state rather than stale private content.

## Map behavior

Before destination selection, display general nearby public activity. After selection, render supplied compatibility results: compatible rides become prominent, excellent matches gain stronger emphasis, and unrelated rides become less prominent while remaining visible.

| Marker/state | Treatment |
| --- | --- |
| Normal ride | Compact destination label and approximate distance |
| Compatible | Distinct outline/icon and compatibility label |
| Highly compatible | Stronger emphasis and restrained arrival animation |
| Own request | Clearly labeled “You,” separate from the location dot |
| Group | Distinct group symbol and occupancy, for example `3/4` |
| Selected | Higher contrast and linked detail sheet |
| Expired/removing | Short removal transition, then absent |
| Meeting point | Separate landmark symbol for authorized group members |

Rules:

- A marker represents a ride intention, not a person's tracked position.
- Use only safe public coordinates for discovery markers.
- Display approximate distance without claiming exact walking or road distance.
- Any simple directional line must be labeled as a direction hint, not a calculated route.
- Do not calculate compatibility from straight-line proximity.
- Group formation replaces separate member ride markers with one group marker.
- Cluster discovery items at wider zoom levels; cluster tap zooms into the area.
- Cluster counts represent discovery items; group occupancy represents people.
- Keep the own request and meeting point separately visible, outside discovery clustering.
- Preserve understandable selection as cluster membership changes.
- Incoming events must not repeatedly recenter the camera or steal selection.
- Use labels/icons as well as color. Honor reduced-motion settings.
- Provide a compact accessible nearby-items view as a secondary interaction, not the home-screen replacement.
- Never create synthetic people merely to fill an empty scenario. Clearly label the mock/demo environment.

## Main UI states

| State | Visible behavior |
| --- | --- |
| Active map | Nearby intentions/groups with inspectable details |
| Empty map | Honest absence of nearby activity and a create-request CTA |
| Searching | Own active request, departure choice, remaining search window, no compatible result yet |
| Match found | Supplied compatibility highlighted on map and active-request sheet |
| Group forming | Members, remaining seats, expected departure, chat access |
| Group ready | Shared meeting point and taxi handoff CTA |
| Request expired | Search ended; offer explicit create-again action |
| Offline/stale | Last-known data clearly labeled; protected mutations unavailable |
| Group closed | Reason shown; no join/send actions; permitted read-only history until retention ends |

## Location lifecycle

Use Expo Location with foreground permission only. [Expo Location documentation](https://docs.expo.dev/versions/latest/sdk/location/)

1. Explain why location helps, then request permission on first launch.
2. Show a sufficiently recent cached position while requesting a fresh fix.
3. When permission/fix is unavailable, allow map browsing around a manually selected area.
4. Indicate stale or inaccurate location explicitly.
5. Refresh on foreground return, recenter, and request confirmation.
6. While the map is active, use throttled foreground observation for the user dot and meaningful movement.
7. Debounce discovery refreshes when the coarse search area changes.
8. Stop observation in the background and when not needed.

Initial tunable defaults: cached browsing fix up to two minutes old; discovery refresh after roughly 100 metres of movement. Creation requires a recent, sufficiently accurate fix or an explicitly confirmed pickup point. The precise accuracy threshold should be documented when implemented after device checks.

Published request origins do not automatically move with the device. Exact input coordinates stay out of analytics, logs, and public responses. Discovery uses a coarse viewport; sensitive creation input uses an authenticated body.

## User flows

| Flow | Sequence |
| --- | --- |
| Anonymous browsing | Launch -> permission/fallback -> map activity -> inspect marker |
| Destination | Search curated places -> choose destination -> supplied compatibility emphasis |
| Create request | Choose departure -> authenticate if needed -> preserve draft -> confirm -> searching |
| Mock authentication | Phone -> challenge -> documented demo OTP -> simulated session |
| Match | Mock event -> query synchronization -> marker and sheet update |
| Join solo rider | Inspect -> own active request -> confirm -> atomic two-person group |
| Join group | Inspect public preview -> own active request -> confirm -> canonical group membership |
| Chat | Load history -> send text -> receive simulated reply |
| Meeting point | Inspect suggested shared point -> discuss in chat -> coordinator marks ready |
| Taxi | Review pickup/destination -> Open Yandex Go -> external app or fallback |
| Leave | Confirm -> membership removed -> private cache cleared -> map/search-again |
| Report | Reason and optional bounded details -> submit -> receipt |
| Block | Explain effect -> block and leave shared group -> filter future pairing |

Authentication must not block browsing. Gate creation, joining, and sending, and also authenticate other private mutations such as reporting. Dismissing authentication returns to browsing. Preserve the intended draft/target, revalidate it after sign-in, and require the final create/join confirmation. Restore unsent chat text without sending it automatically.

Joining requires an own active request. If creating that request succeeds but joining fails, keep the request active and explain the join failure. Do not pretend the entire sequence rolled back.

## Group and chat presentation

The authoritative state machine and transition permissions are in [group contracts](api/groups.md). Four members means full; it does not automatically mean ready. Readiness needs at least two members and a shared point, then coordinator confirmation. Leaving may reopen or cancel the group. Make those effects visible.

Messages display sender and timestamp. Use local sending/failed presentation without pretending it is a server status. Retry preserves the original client message ID. A canonical message replaces its pending representation. Closed groups have no enabled composer; leaving or access revocation immediately clears private chat.

## Yandex Go boundary

Use one small `openTaxi(...)` boundary, initially with only Yandex Go. Prefer the documented HTTPS redirect/universal-link format, with explicitly reviewed meeting-point and destination coordinates. Additional stops or different individual destinations are agreed outside the app; do not silently infer a multi-stop booking.

Handle URL opening failure and app-absent behavior. Provide supported browser/store fallback, retry, or copyable trip information. Do not log the generated link or coordinates. A successful OS handoff does not prove native app opening, booking, payment, departure, or completion.

Yandex documents route parameters and redirect behavior in its [deep-link documentation](https://yandex.ru/support/taxi-distr/en/api/deeplinks). Verify on both platforms during TAXI-001. No taxi API integration or booking telemetry is included.

## Error and edge behavior

| Condition | Required behavior |
| --- | --- |
| Permission denied | Browse manually; offer settings action |
| No location fix | Retry/manual pickup; no invented current position |
| Successful empty discovery | Honest empty state |
| Initial network failure | Error/retry, not “nobody nearby” |
| Refresh failure | Retain last-known markers with stale indication |
| Request expiry | Disable stale actions and offer create again |
| Selected ride removed | Explain unavailability and clear invalid actions |
| Stale match | Revalidate target before join |
| Group full | Show conflict and refreshed canonical capacity |
| Simultaneous join | One valid membership outcome; never exceed four |
| Mutation timeout | Unknown result; reconcile or retry the same operation ID |
| Failed message | Preserve content and explicit retry |
| Duplicate message event | Deduplicate using canonical/client message IDs |
| Session expiry | One shared refresh attempt; otherwise sign-in continuation |
| Access revoked | Clear private data; return to an allowed screen |
| Closure while chatting | Read-only presentation and closure reason |
| Old notification | Fetch current state; clear unavailable result |
| Taxi unavailable | Supported fallback or useful retry/copy action |
| Basemap unavailable | Explain tile connectivity separately from data-source availability |

Do not automatically queue joins, cancellations, or chat messages for later submission when offline.
