# Mobile product and UX plan

Status: planned. Last updated: 2026-11-01.

Design reference: [Along mobile MVP concept](design/along/README.md) (DESIGN-001). Along is provisional branding only. The saved Figma draft has the brand kit and 20 journey screens; the local package covers 55 illustrative screens. Offline importer 1.0.1 repairs the user's failed native import; the user will retest it, and native visual/prototype verification remains pending. This does not change implemented app capabilities or the lifecycle rules below.

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

Current shell (MOBILE-001-D/E): home has a temporary, always-visible “Sign in” button that opens inert `/auth/phone` and `/auth/otp` placeholders in a modal. They collect nothing and never sign anyone in. AUTH-001 replaces that entry with protected-action gating. The group and group chat routes show only a “not available yet” message and a “Go to map” action, for any group ID; home does not link to them. `/dev/scenarios` holds the demo controls in development and preview builds on the mock data source, reached from home's Demo badge, and an unavailable state in production builds, without redirecting (MOCK-001-C; see [MOCK_SCENARIOS](MOCK_SCENARIOS.md#scenario-controls)). Since AUTH-001-D `/settings` is real, opened from home's Settings button: the session (sign in, or sign out after a confirmation that names what it does not do), the location permission summary and the demo label; see [authentication](api/authentication.md#implemented-settings-and-sign-out-auth-001-d).

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
- Display approximate distance without claiming exact walking or road distance. The app computes it from the item's public area center and its own location fix; discovery requests never carry the device position (CONTRACT-002-B).
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

**Implemented map shell (MAP-001-A):** `apps/mobile/src/features/map/` replaced the placeholder home. Native rendering is not verified yet (see DEVELOPMENT, map shell checks).

- **Map:** Apple Maps on iOS and Google Maps on Android, light style, flat and north-up (no pitch or rotation), without the provider's own location dot, location button or Android toolbar. Anyone can pan and zoom it, whatever the permission. No ride or group markers yet (MAP-002).
- **Overlays:** the "along" title and a "Demo" badge float at the top. A fixed sheet at the bottom holds the location card (or "Going the same way?" while location needs no explanation), the confirmed pickup and the temporary Sign in. The overlays are passed to the map as padding, so the camera centres in the visible part and the provider's logo and legal notice stay above the sheet. The sheet is not draggable; MAP-002-A decides that.
- **Camera:** it opens on the confirmed pickup, else the device position, else the demo city (about 13 km from north to south). The first device position moves it there once, unless the user has touched the map. "Show my location", shown only with a position, moves it there and asks for a fresh fix, which it follows once. A newly confirmed pickup moves it there. Later positions move only the dot.
- **Device position:** drawn from the location controller's fix, only while located: a teal dot with its accuracy circle, grey once out of date (over two minutes), and only the circle under approximate permission, so an approximate position never looks exact. Nothing is drawn with a denial, services off or no fix.
- **Pickup point:** a confirmed pickup shows as a pin titled "Pickup point", "Near …". It is the user's own choice, never drawn as the device position.
- **Observation:** the controller observes the device while home is the focused screen; another screen on top, such as sign-in, stops it.
- **Android without a map key:** a notice says the map can't be shown in this build, and the sheet, with the named pickup, still works.

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

Initial tunable defaults: cached browsing fix up to two minutes old; discovery refresh after roughly 100 metres of movement. Creation requires a recent, sufficiently accurate fix or an explicitly confirmed pickup point. CONTRACT-001-B chose mock defaults for the creation fix: accuracy of 100 m or better and at most 60 seconds old ([locations and users](api/overview.md#locations-and-users-contract-001-b)); otherwise the user confirms a manual pickup point. Confirm or adjust these after device checks; they are not a production policy.

**Implemented controller (LOCATION-001-A):** `apps/mobile/src/platform/location/` holds these rules; LOCATION-001-B's home screens use them (below), and MAP-001-A adds the map.

- Starting reads the permission without prompting. The OS prompt appears only through `requestPermission()`, which the explanation screen calls.
- With permission it shows a cached fix up to two minutes old, then asks for a fresh one with high accuracy. An attempt that takes over 15 seconds counts as failed, but a fix that arrives later still applies. A failed attempt rechecks location services. Nothing prompts for device settings.
- The states it reports: checking, needs permission, denied (and whether the prompt can still appear), unavailable (services off, no fix, or the permission could not be read), locating, and located. A located fix is `fresh` (60 s or less, the pickup limit), `recent` (two minutes or less) or `stale`, and accurate only with precise permission and 100 m or better. Only a fresh, accurate fix may become a pickup point; otherwise the user refreshes or confirms a point on the map.
- Observation (a new position after about 20 m, at most every 5 s on Android, balanced accuracy) runs only while something needs it, with permission and services, and in the foreground. Going to the background stops it; returning rechecks the permission and services, refreshes the fix and resumes. iOS `inactive` (an OS dialog or the app switcher) counts as foreground.
- Losing permission clears the fix. Fixes are frozen, so a position captured for a request never changes when the device moves.
- Native configuration is foreground-only: iOS has only the when-in-use description, Android only coarse and fine location.

**Device behavior (VERIFY-002, 2026-11-01):**

- **Services off before denial:** with location services off, iOS reports every app's permission as denied, even when the app's own setting allows it. The controller therefore reads the services state on a denial too, and reports "location services are off" before "denied". The recovery UI should send the user to the services switch first.
- **Android's "can ask again":** after a second denial, expo-location still reported that the prompt could appear. Only the next request, which showed no dialog, reported that it could not. LOCATION-001-B's card therefore explains a request that ends in a denial and then offers the system settings.
- **Accuracy seen in the emulator and simulator:** a fresh high-accuracy fix was ±5 m on both; Android's balanced observation reported ±100 m (exactly the pickup limit); approximate permission gave ±11 km on iOS and ±2 km on Android. Before confirming a pickup, request a fresh fix (`refresh`) instead of relying on observation.

**Implemented recovery (LOCATION-001-B):** `apps/mobile/src/features/location/` puts these rules on home; since MAP-001-A they sit in the map's sheet (map behavior above).

- **Introduction (screen 01):** shown while the permission was never requested. It explains what the app does, that location is used only while the app is open and that others see only an approximate area, and labels the riders synthetic. "Use my location" shows the OS prompt; "Choose an area instead" closes the introduction for this launch without prompting. A failed request is explained on the screen.
- **Home location card (screen 21 and its siblings):** one card for each state that needs words: location not in use ("Use my location"), denied ("Allow location" while the prompt can still appear, otherwise "Open device settings"), location services off (Android opens the device switch; iOS opens the app's settings page and the text names the path to Location Services), no fix in time ("Try again"), the permission unreadable, locating, an approximate fix (precise location is off), an inaccurate fix and a stale fix ("Try again" or "Refresh location"). Nothing shows while the permission is read, or with a fresh or recent, precise and accurate fix. A request that ends in a denial, or settings that did not open, are explained inside the card. The card always says that location is used only while the app is open.
- **Named pickup point:** every card offers "Choose pickup area", which searches the curated places through `places.search` (debounced; without text, the area's places nearest its center). Choosing a place asks "Is this your pickup point?" and says that discovery shows only an approximate area and that the point stays fixed after publishing; only "Confirm this pickup" sets it. Home then shows "Near …", "Chosen by you, not your device location", and "Change pickup point". The pickup is a `manual` location at the place's own point and is never shown as the device position: the location card keeps describing the real location state.
- **Per launch:** the set-aside introduction and the confirmed pickup live in memory only. A new launch asks again while the permission was never requested; RIDE-001-B takes the pickup into the request draft.
- **Map picker (MAP-001-B, screen 22):** where the build has a map, "Choose pickup area" and "Change pickup point" show a fixed pin over the centre of the visible map; dragging the map moves the point under it. The sheet names the nearest curated place within 1 km ("Near …") or says none is close, repeats that discovery shows only an approximate area and that the point stays fixed after publishing, and waits while the map moves. "Confirm this pickup" keeps the exact point as a `manual` pickup for the draft and sends nothing; to name it, only the point rounded to 0.01° goes to place search. "Choose a named place" opens the named list, which is also what a build without a map shows. The header's back button and Android back leave the picker unchanged.
- **Search area:** the named list searches a fixed area around the demo city (30 km from 42.87° N, 74.59° E), never derived from the device position or narrowed to the visible map, since a place is chosen by name. Only the map picker's "Near …" label searches around the pin.
- **Map tiles:** the app tracks whether the map drew its tiles separately from the data source. Google Maps (Android) reports it; without a report within 15 s the picker says the map may not be loading and offers the named list. Apple Maps reports nothing, so no tile failure is claimed on iOS. Screen 26 (MAP-002-B) builds its fallback on this.
- **Nearby activity (MAP-002-A):** the top of home's sheet describes public ride plans in the region the map last rested on, read for a coarse viewport (rounded outward to 0.01°) and kept current by live updates. It shows "Finding nearby plans…" while the first read is on its way (a loading view is not an empty area), a count of riders and groups when there is activity ("At least N … Zoom in" when the list was cut short), "You could be the first." when the area is empty, "Let’s try that again." with "Retry discovery" when the read failed (nobody knows whether anyone is nearby; outside the demo area it says so), "Waiting for a connection." before anything loaded offline, and "Showing the last view." with the last update time when it can no longer refresh, adding that actions won't be queued. A view wider than about half a degree asks to zoom in. Discovery never moves the camera. The ride plans are not drawn on the map until MAP-002-B.
- **Markers, clusters and list (MAP-002-B):** the map draws what the sheet counts, at each ride's or group's approximate public area: a ride with its destination (and "~350 m" from the device's own position, when there is one), a group with its destination and "3/4" people. Overlapping markers become a count of ride plans, in which a group counts once; tapping it zooms in, or lists the items when they share one area. "View nearby items" lists the same items (the accessible alternative), says when the list was cut short or is the last view, and explains that occupancy counts people while map counts count ride plans. Choosing a row or a marker selects it on the map; nothing is reserved. When the map's tiles don't load (Android reports this), the sheet says so and points to the list.
- **Ride and group previews (MAP-002-C):** a marker or list row opens that ride's or group's public preview in the sheet: for a ride, its destination, approximate distance, departure and the rider's display name; for a group, its status, free seats, occupancy and departure, with members, chat and the meeting point kept private. The app checks the plan again each time; until the source confirms it no join is offered. If the plan has expired, closed or joined a group, the sheet says "That plan has changed.", that nothing was reserved and that the rider's own request stays active, and offers to refresh nearby plans. "Plan to join this rider" or "Create a request to join" (forming groups with a free seat only) reserves nothing: it asks an anonymous rider to sign in, then reopens the checked preview and explains that joining starts from the rider's own request, which arrives with RIDE-001 and GROUP-002-A.
- **Destination (DESTINATION-001-B):** "Choose a destination" opens a search of the curated demo places (no live places service). Choosing one sets it at once, without moving the map or creating anything. The map then emphasizes the plans the source supplied as matches for it: an outline and the level ("Excellent match", "Good match", "Possible match") in their accessible names, a stronger fill for excellent ones, and the others stay visible, quieter. The sheet names the best level and offers "Inspect highlighted ride"; with no match it says so and that other plans stay on the map. Matches are advisory and reserve nothing. "Clear destination" returns to general browsing.

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

The authoritative state machine and transition permissions are in [group contracts](api/groups.md). Four members means full; it does not automatically mean ready. Readiness needs at least two members and a shared point, then coordinator confirmation. If the point changes or is withdrawn while the group is ready, the group returns to forming and the coordinator confirms again. Leaving may reopen or cancel the group. Make those effects visible.

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
