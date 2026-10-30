# Along mobile MVP implementation plan

Saved: 2026-10-10. Planning record: **DOC-003 — Completed**. Implementation cards below are **Planned**, except MOBILE-001-H whose status remains owned by [FIRST_STEPS.md](FIRST_STEPS.md).

This saves the complete design review and proposed execution plan from the preceding conversation. Saving it authorizes documentation work only: no implementation, dependency installation, commit, or Figma modification has started. Before execution, assign one child explicitly or invoke the one-task NEXT prompt below to select exactly one. This document and the shared handoff let Codex, Codex (Terra), and Claude Code continue without the original chat.

The local design is detailed enough to implement the MVP, including failure and recovery states. It describes **55 visual states across the existing navigation structure**, not 55 separate routes. MOBILE-001-H, the existing iOS shell checkpoint, was completed on 2026-10-30. By section E's order, the next card is **TOOLCHAIN-001-A**, only when requested.

## Authority and status ownership

- Follow [AGENTS.md](../AGENTS.md), [AI_CONTEXT.md](AI_CONTEXT.md), [AI_WORKFLOW.md](AI_WORKFLOW.md), and the current user request.
- [ROADMAP.md](ROADMAP.md) owns parent statuses and the original 25-parent dependency graph. [FIRST_STEPS.md](FIRST_STEPS.md) continues to own MONO-001/MOBILE-001 child statuses, including H; completed work is not restarted.
- This document owns the later child cards/statuses in section E. Its TOOLCHAIN-001 and UI-001 additions are proposed roadmap extensions, recorded separately from the original graph. Their full parent criteria are the union of their child criteria. Saving this plan does not approve an unresolved dependency or product-policy decision.
- Product/API specifications govern runtime behavior. The local SVGs and construction sources govern visual intent; prototype links only illustrate possible outcomes. Pending recommendations in section G do not silently supersede specifications.
- Recheck files, dependencies, and latest handoff before each assignment. Baseline findings here describe the review-time state, not permanent assertions about the repository.
- Paths below are relative to the repository or this document so they work in another checkout.

## A. Current state and design corrections

### Review evidence

The preceding read-only review inspected Git status/diff, manifests, routes, reusable UI, tests, contracts, relevant project/API/development guidance, and the latest implementation/design handoffs. It visually examined all 55 SVGs, the brand sheet, all 11 review panels, screen index, layout report, and construction sources.

Primary references:

- [Design package and delivery status](design/along/README.md), [screen inventory](design/along/screen-index.json), [local review](design/along/index.html), [brand sheet](design/along/brand.png), [layout report](design/along/layout-report.json).
- [Drawing helpers](design/along/source/helpers.js), [component kit](design/along/source/kit.js), [journey](design/along/source/journey.js), [additional states](design/along/source/states.js), and [Figma importer runtime](design/along/plugin/runtime.js).
- [Root manifest](../package.json), [mobile manifest](../apps/mobile/package.json), [contracts manifest](../packages/contracts/package.json), [architecture](ARCHITECTURE.md), [development guide](DEVELOPMENT.md), and [toolchain](TOOLCHAIN.md).

The importer adjusts drawing geometry and checks some body/footer bounds. Its generated code is a design artifact, not application architecture. Its local test-double success is not native Figma verification. Manrope is intended; SVGs use fallback typography. The 390 × 844 canvas is a reference viewport, not a fixed device requirement.

### Actual application baseline

| Area | Actual state at review | Implementation consequence |
| --- | --- | --- |
| Workspace | pnpm/Turbo/TypeScript workspace exists; MONO-001 complete. | Preserve it; no new scaffold. |
| Mobile | Expo 57.0.26, React Native 0.86.3, React 19.2.3, Expo Router. | Use recorded compatible pins, not independent latest versions. |
| Navigation | Home, phone/OTP, group, chat, settings, and development routes exist. | Replace placeholder contents incrementally. |
| UI | Screen, Button, UnavailableScreen exist. Since MOBILE-001-H, Screen pads from the safe-area provider's insets rather than a native `SafeAreaView`, which missed the bottom inset in a newly opened iOS sheet. | Extend them; add an edge-to-edge map layout. |
| Contracts | Public package/build/export boundary exists; source is effectively empty. | Runtime schemas and domain contracts remain to be written. |
| Product behavior | No native map, real location flow, auth/session, requests, groups, chat, or simulator. | Design assets do not establish implemented functionality. |
| Tests | Jest/Testing Library harness has 16 shell/UI tests. | Reuse it; contract testing remains to be introduced. |
| Native evidence | Android shell verification is recorded; iOS H remains unfinished. | Exports cannot substitute for iOS verification. |
| Working copy | Pre-existing application/config/docs changes and untracked IDE files. | Preserve them; no broad staging, formatting, or cleanup. |
| Backend | Intentionally absent. | Keep this milestone mobile plus in-memory mocks. |

### Corrections to carry into implementation

| Reference issue | Required runtime behavior |
| --- | --- |
| Screen 15 returns to a ready-group example. | Viewing a point never changes readiness; only a successful coordinator operation does. |
| Screen 32 has four people but its ready example has three. | Occupancy comes from the current group response. |
| Overflow buttons directly link to Block Rider A. | Open a contextual menu and select the actual member/action; never silently choose a target. |
| Screen 18 completion leads to cancellation copy in chat. | Closed history explains the actual completed/cancelled/expired reason. |
| Screen 43 says other members remain in the group. | If fewer than two remain after block-and-leave, cancel the group and remaining live requests. |
| Screen 35 says the viewer became coordinator. | Show only when the viewer actually receives the role. |
| Screen 30 has an uncertain mutation outcome. | Read canonical state or retry the same operation ID; no fresh duplicate create/join intent. |
| Screen 52 says no report receipt was issued. | Use only for known rejection; lost response after acceptance needs reconciliation/idempotent retry. |
| Links force auth errors, taxi failure, or other example outcomes. | Real operation/scenario/native results determine outcomes. |
| Demo labels are inconsistent. | Identify synthetic data throughout group/chat/safety/taxi flows. |
| Some drawn icon controls are too small as touch targets. | Preserve visual size inside an accessible interaction area. |
| Absolute canvas geometry and fallback fonts determine wrapping. | Use native responsive layout, Manrope, growth, and scrolling. |

Runtime behavior follows [rides](api/rides.md), [groups/chat/safety](api/groups.md), [authentication](api/authentication.md), and [privacy/idempotency](api/overview.md).

Repository follow-ups:

- [Jest configuration](../apps/mobile/jest.config.js) discovers apps/mobile/tests/**/*.test.ts?(x). Several older roadmap commands point at source-directory tests; use the actual tests directory and correct those examples in the owning tasks.
- TOOLCHAIN.md records installed react-native-gesture-handler 3.3.0 versus Expo's local recommendation ~2.32.0. Android worked, but resolve the dependency decision before new gesture-heavy sheets.
- Some documentation status wording is stale, including the architecture introduction. Reconcile affected wording during its owning implementation task; do not rewrite unrelated history.

## B. Complete screen coverage

Home means /; Auth means existing /auth/phone or /auth/otp; Group means /groups/[groupId]; Chat means /groups/[groupId]/chat; Settings means /settings; Demo means /dev/scenarios. Sheets and state variants do not automatically become routes.

The final column identifies the card that finishes the visible behavior. Shared foundations are prerequisites; all IDs are defined in section E.

| ID | Runtime placement | Shared UI and interaction | Required data/state | Implementing task |
| --- | --- | --- | --- | --- |
| 01 | Home introduction/location overlay | Brand, explanation, allow/manual actions | Permission; first-use presentation | LOCATION-001-B |
| 02 | Home discovery | Native map, search, demo badge, discovery sheet | Public nearby items; location availability | MAP-002-A |
| 03 | Expanded destination sheet | Search, result rows, clear/back | Curated places; query/loading/error/empty | DESTINATION-001-B |
| 04 | Home with destination selected | Destination chip, compatible markers, sheet | Draft destination; supplied preview matches | DESTINATION-001-B |
| 05 | Public ride-preview sheet | Rider/public route summary, join intent | Public projection; availability | MAP-002-C |
| 06 | Departure-selection sheet | Segmented options, draft summary, continue | Local draft; Now/+5/+10 choice | RIDE-001-B |
| 07 | Phone route | Demo explanation, field, continue | Synthetic challenge; validation/pending | AUTH-001-C |
| 08 | OTP route | Accessible code input, resend, close | Challenge expiry/resend time; verification | AUTH-001-C |
| 09 | Final create-confirmation sheet | Reviewed pickup/destination/departure | Preserved draft; session; usable origin | RIDE-001-B |
| 10 | Home active request | Own marker, card, countdown, cancel | Canonical own request; source deadline | RIDE-001-C |
| 11 | Match-arrival state | Match badge/card, inspect target | Valid supplied match and target | RIDE-001-D |
| 12 | Join-confirmation sheet | Target, occupancy, confirm | Own active request; fresh target; operation ID | GROUP-002-A |
| 13 | Forming-group route | Members, seats, chat/meeting actions | Authorized group snapshot and role | GROUP-002-B |
| 14 | Chat route | Messages, composer, member-action menu | Authorized paged history and send operation | CHAT-001-B |
| 15 | Member-only meeting sheet | Native map, landmark, estimate, return | Authorized point; supplied estimate | MEETING-001-B |
| 16 | Ready-group state | Ready badge, members, meeting/taxi actions | Current group; viewer role | GROUP-002-C |
| 17 | Taxi-review sheet/modal | Pickup/destination review, external action | Fresh ready group; reviewed shared coordinates | TAXI-001-B |
| 18 | Completed-group state | Outcome, retained-history/home actions | Closure reason/time; retained access | GROUP-002-C |
| 19 | Public group-preview sheet | Capacity, public route, availability, join intent | Public group projection only | MAP-002-C |
| 20 | Expanded nearby-list sheet | Accessible rows and selection | Same public result set/filter as map | MAP-002-B |
| 21 | Location-denied home state | Explanation, manual/settings actions | OS permission; no fabricated user dot | LOCATION-001-B |
| 22 | Manual pickup mode/sheet | Map-centre pin, place label, confirmation | Local chosen coordinate; explicit confirmation | MAP-001-B |
| 23 | Home empty state | Honest notice, destination/create intent | Successful empty discovery | MAP-002-A |
| 24 | Initial data failure | Error notice, retry | Failed nearby read; no successful snapshot | MAP-002-A |
| 25 | Stale/offline home state | Stale banner, previous public content, retry | Last snapshot; source connectivity; freshness | MAP-002-A |
| 26 | Map-tile failure | Tile notice, nearby-list alternative | Tile availability independently of source | MAP-002-B |
| 27 | Expired request | Outcome, explicit create-again | Authoritative expiry; useful draft fields | RIDE-001-C |
| 28 | Cancel-request confirmation | Confirmation, pending/error | Active own request; expected version | RIDE-001-C |
| 29 | Full/join-conflict state | Updated occupancy, own-request continuation | GROUP_FULL; own request still active | GROUP-002-A |
| 30 | Unknown operation outcome | Check-status/same-intent retry | Stable operation ID; canonical result | RIDE-001-D; GROUP-002-A |
| 31 | Session-expired/auth gate | Sign-in/browse notice | Failed refresh; preserved safe intent | AUTH-001-C |
| 32 | Full forming group | Four seats, coordinator prerequisites | Forming status; occupancy; point availability | GROUP-002-B |
| 33 | Meeting point unavailable | Waiting notice, disabled ready action | Authorized point is null | MEETING-001-B |
| 34 | Leave-group confirmation | Consequences, confirm/back | Membership; occupancy and role | GROUP-002-C |
| 35 | Reopened group/role change | Updated status, conditional role notice | Canonical post-leave group/coordinator | GROUP-002-C |
| 36 | Closed read-only chat | Closure banner, history, no composer | Reason; authorized retention window | CHAT-001-C |
| 37 | Revoked/unavailable private resource | UnavailableScreen, home action | Access denial; private cleanup | GROUP-002-C; CHAT-001-C |
| 38 | Taxi failure | Retry/supported fallback/copy | Native result; revalidated group | TAXI-001-B |
| 39 | Notification explanation | Allow/later/settings | OS notification permission | NOTIFICATION-001-B |
| 40 | Settings | Session, permissions, blocked users, demo label | Session/platform summaries | AUTH-001-D; NOTIFICATION-001-B; SAFETY-001-C |
| 41 | Report modal/panel | Reason choices, bounded details, submit | Selected target/context; draft; pending/error | SAFETY-001-B |
| 42 | Report accepted | Receipt, explanation, optional block intent | Canonical mock receipt | SAFETY-001-B |
| 43 | Block confirmation | Named target, contextual consequences | Target; shared-membership effects | SAFETY-001-C |
| 44 | Blocked-riders settings panel | List, empty/error, unblock | Authenticated paged summaries | SAFETY-001-C |
| 45 | Failed-message chat | Failed bubble, explicit retry/refresh | Original client message ID and text | CHAT-001-C |
| 46 | Stale-notification fallback | Generic unavailable notice, home | Validated payload; current authorization | NOTIFICATION-001-C |
| 47 | Invalid/expired OTP | Error, new challenge/resend, close | Stable auth error; challenge timing | AUTH-001-C |
| 48 | Sign-out confirmation | Consequences, confirm/cancel | Session cleanup; deregistration result | AUTH-001-D |
| 49 | Ready coordinator management | Taxi, reopen, complete, cancel | Current role/status; expected version | GROUP-002-C |
| 50 | Demo route | Scenario/reset/failure/time controls | Injected dev-control boundary; build gate | MOCK-001-C; QA-001-A |
| 51 | Cancel-group confirmation | Group-wide consequences, confirm/back | Coordinator; current group | GROUP-002-C |
| 52 | Report failure/recovery | Preserved form, retry/edit | Known rejection versus uncertain acceptance | SAFETY-001-B |
| 53 | Clustered map | Count markers, zoom/list | Public items; camera bounds | MAP-002-B |
| 54 | Discovery loading | Loading sheet/skeleton, usable map | Initial pending read; not an empty result | MAP-002-A |
| 55 | Disappeared target | Unavailable sheet, refresh, own-request explanation | Removed/expired target; current own request | MAP-002-C; GROUP-002-A |

Additional variants stay inside these screens: empty search, throttled resend, pending mutations, missing/stale/inaccurate fixes, truncated discovery, blocked-list empty/failure/pagination, chat history pagination, retention expiry while open, and permission recovery.

## C. UI foundations and components

| Foundation | Implementation direction |
| --- | --- |
| Branding | Along remains provisional. Reuse the merging-path mark; keep development identifiers/scheme unless separately requested. |
| Typography | Bundle static Manrope weights 400/500/600/700/800 with license; named text variants. No font files were bundled at review time. |
| Type scale | Reference size/line height: display 48/54, heading 30/36, section 24/30, subheading 18/24, body 15/22, label 15/20, small 12/18. Micro 10/14 is not for essential information. |
| Spacing | 4, 8, 12, 16, 24, 32; reference side padding 24, adapted to insets and width. |
| Shape | Radii 12/16/24/32; reference buttons 52 high with radius 16; allow growth with text. |
| Colors | Ink #123C38; teal #146B59; lime #DDF5A0; paper #F7F8F2; muted #586D68; line #DCE4DC; soft #EAF2E9; danger #AD3E36; warning #8A5B14. |
| Layout | Separate map, scrolling content, modal form, and chat layouts; shared footer/spacing rules. |
| Icons | Consistent small vector set: back, close, search, location, members, chat, shield, clock, settings, external opening. Hide decorative icons from accessibility. |
| Sheets | One coordinated host per flow; content-driven sizing, keyboard handling, focus restoration, explicit dismissal. |

For SDK 57, use static Manrope font assets. Expo's guidance supports native embedding through expo-font, avoiding startup font swapping; verify platform font-family/weight names and preserve the license. [Expo font guidance](https://docs.expo.dev/develop/user-interface/fonts/)

Component inventory:

- Extend Screen, Button, UnavailableScreen.
- Core: AppText, IconButton, Badge, Notice, LoadingState, EmptyState.
- Inputs: TextField, SearchField, a single accessible OTP input with optional visual cells, departure selector.
- Layout: ScreenHeader, scrolling form, sticky action footer, ConfirmAction, map overlay layout, sheet host.
- Discovery: destination row/chip, public ride/group card, nearby row, ride/group/own/meeting markers, cluster marker.
- Groups: member row, capacity display, status header, meeting summary, role-aware action menu.
- Chat: message bubble, composer, failed-send action, closure banner, history-loading controls.
- Safety/settings: reason row, permission row, blocked-user row.

Do not add a broad UI framework. A sheet library is justified only after a bounded compatibility check for gestures, scrolling, keyboard, and accessibility. @gorhom/bottom-sheet is a candidate, not an installed/verified decision. [Official documentation](https://gorhom.dev/react-native-bottom-sheet/)

Accessibility and responsiveness:

- At least 48-point interaction areas, including visually smaller icons.
- Preserve font scaling; allow scrolling/growth instead of clipping or shrinking important text.
- OTP is one logical field for screen readers, paste, and keyboard behavior.
- Label controls; expose roles, disabled/busy/selected states and meaningful errors.
- Restore focus after sheets/confirmations; respect reduced motion.
- Nearby list is a complete alternative to map markers. Manual pickup has a named-place alternative to dragging.
- Handle Android back, iOS dismissal, keyboards, and actual safe areas; never draw fake system bars.
- Test narrow/wide devices, supported landscape, enlarged text, and screen readers.
- Essential information never relies only on color or animation.

React Native supplies accessibility APIs but native testing is still required. [Official accessibility guidance](https://reactnative.dev/docs/accessibility)

Review-time nominal contrast calculations: muted on paper ~5.17:1; white on ink ~12.14:1. These do not establish complete accessibility compliance, especially with opacity, overlays, disabled states, font sizes, or dynamic layout.

## D. Navigation and state model

The existing architecture remains:

    Routes / feature hooks
        -> AppDataSource operations and events
        -> in-memory simulator now
        -> future HTTP/Socket.IO after this milestone

TanStack Query holds remote-like resources. React state/reducers hold presentation. Screens never import fixtures, clocks, scenarios, or simulator internals. AppDataSource namespaces remain auth, places, rides, groups, chat, safety, devices, events.

| State boundary | Contents |
| --- | --- |
| Local presentation | Camera, selection, open sheet, destination/departure draft, fields, typed pending protected intent, unsent text, pending/failed message presentation. |
| Data source | Identity/session validity, canonical request/group/member/role/status, point, messages, blocks, receipts, deadlines, versions. |
| Platform | Foreground state, permissions, fixes, tile availability, notification responses, external-open result. |

### Anonymous browsing and authentication

Browse/search/public previews are anonymous. Protected actions open existing auth routes. Preserve a typed local intent/draft, not an executable callback in a DTO. After authentication re-fetch the target and restore final confirmation. Cancelling auth returns to browsing. Restore chat text without sending it automatically. Authentication never substitutes for membership/ownership.

### Request creation and expiry

Review origin/destination/departure; source enforces one live request. Departures are Now/+5/+10; active discovery lifetime is 15 minutes. Countdown is presentation only. Foreground return processes elapsed deadlines before showing actions. Re-creation is explicit. A published origin is not silently moved by GPS updates.

### Joining

Join requires an owned active request. Create it first when absent, then confirm joining. These are separate operations: failed join leaves the created request active. Source atomically checks canonical target/group, expiry, capacity, blocks, membership and operation identity. No optimistic seat reservations. Simultaneous joins cannot create duplicate groups or exceed four.

### Group lifecycle

    forming -> ready -> completed
    ready -> forming (coordinator reopens)
    forming / ready -> cancelled (explicit action or expiry)

One seat per user, at most four, one live group/user. Full does not mean ready. Ready requires coordinator, at least two members, and point. Leaving revokes access immediately; ready becomes forming if two or more remain, otherwise cancel group and remaining live requests. Transfer coordinator to earliest remaining member when needed. Leave cancels the leaver's request; no resurrection. Grouped requests follow the 30-minute group deadline.

### Chat and temporary history

Trimmed text length 1–1,000; source assigns sender/time/sequence. Retry preserves client message ID. Deduplicate canonical IDs and echoes. Older-history pagination and sequence catch-up are distinct mutually exclusive modes; catch up all missing pages. Completion/cancellation disables sending; authorized-at-closure members retain read-only history for one hour. Leavers/revoked users immediately lose history/composer data. Late responses/events cannot restore it.

### Meeting point and taxi

Member-only shared places are not live rider coordinates. Walking estimates are supplied, not calculated routes. Review fresh shared pickup/destination before Yandex opening. A changed point invalidates the open taxi review; the broader ready-point policy is pending in G. Refresh on return. OS acceptance of a link proves neither booking nor group completion. Coordinator completion is a separate explicit operation.

### Safety and settings

Receipt only after canonical report acceptance; preserve details for explicit retry without logging them. Block-and-leave is atomic for shared membership; do not expel the target. Unblock changes future filtering, not old access. Logout attempts deregistration while credentials exist, then clears local credentials/private state even if that cleanup fails. Explain incomplete revocation; logout is not automatic group leave/cancellation.

### Notifications and recovery

Generic notification text and resource IDs only. Wait for session bootstrap, validate/deduplicate tap, fetch current authorization, then navigate. Stale/forbidden targets get generic unavailable UI. Source outage, tile failure, denial and empty results remain distinct. No automatic offline mutation queue. Stable operation IDs reconcile unknown outcomes. Reset cancels listeners/timers/queries/pending operations and clears demo credentials before reseeding. Cold mock reload resets the world/session; foreground resume retains state and catches up. Old notifications may therefore be stale after cold reload.

### Milestone exclusions

No backend/apps/api content, real transport, production matching, mobile routing, background GPS, payments, booking APIs, multiple taxi providers, real SMS, remote push delivery, media chat, reputation, or speculative shared packages.

## E. Dependency-ordered implementation cards

### Common card contract

These 65 assignments include the already-defined MOBILE-001-H and 64 later cards. The later rows start Planned. Update the Status column only when work actually starts or criteria are verified. Do not copy H's status here; FIRST_STEPS.md remains its single owner.

- Execute one child only; inspect prerequisites/current files and record owner/session/scope first.
- Each row lists exact dependency IDs. A parent ID requires all its required children and parent criteria; a child ID requires that child's criteria only. Completed MONO-001 is external to this plan. Additional child dependencies refine the original parent graph without requiring unrelated future siblings.
- Rows are an executable topological order, not permission to run the whole list. Do not assign a parent title as an instruction to implement all children.
- M means apps/mobile; C means packages/contracts. UI means M/src/ui; Features means M/src/features; Data means M/src/data; Mock means M/src/data/mock; Platform means M/src/platform. Proposed modules are not claims that files exist.
- All code cards use pnpm typecheck and pnpm lint plus meaningful focused behavior/contract checks. Mobile tests go in M/tests, contract tests in C/tests; never put tests in Expo routes. No broad snapshots or tests that merely restate trivial styles.
- Reuse routes, Screen/Button/UnavailableScreen, bootstrap, and the real test harness. New work stays in named feature/platform/data modules. No extra service/repository layers.
- Native changes require relevant Android/iOS checks. Existing builds suffice for JS-only interactions; native dependencies/configuration require rebuilt development clients. Exports and component mocks do not prove native behavior.
- Every card updates this row (or FIRST_STEPS for H), ROADMAP parent progress, AI_CONTEXT, WORK_LOG, and the affected specs listed below each group. Completion requires observable criteria, not just files.
- Add useful TSDoc to reusable APIs/hooks/transformations/operations/native boundaries: purpose, side effects, authorization/privacy, idempotency, cleanup, failure. Documentation/checkpoint-only work needs no artificial comments.
- Record commands/results and missing checks precisely. Preserve pre-existing work; no automatic commit or next-task execution.
- S = small focused unit; M = bounded integration/lifecycle unit. Uncertainty identifies the principal risk, not an elapsed-time estimate. If actual scope exceeds one coherent assignment, document a further split instead of silently absorbing unrelated work.

### Foundation and UI

Documentation: shared handoff/progress plus TOOLCHAIN.md and DEVELOPMENT.md as affected; UI cards also maintain this plan's token/component decisions. Screens not yet wired remain placeholders.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| MOBILE-001-H | MOBILE-001-G | Existing iOS shell checkpoint; reuse current app; normally docs and narrow config fixes. No design implementation. | Native launch/navigation/dismissal/safe areas and existing final checkpoint pass; recheck Android for shared changes. | S / iOS environment | See FIRST_STEPS.md |
| TOOLCHAIN-001-A | MOBILE-001-H | Resolve gesture-handler alignment in M/package.json and root lockfile; record decision. New bounded compatibility work. | Intended version resolves/autolinks; doctor, tests, exports and both native builds pass. Doctor alone is insufficient. | S / native compatibility | Planned |
| UI-001-A | MOBILE-001-H | New UI tokens/AppText and M/assets static Manrope/license/Along mark; reuse existing art. All screens. | Correct native weights; no clipped sample headings/startup font failure; static checks and both-platform inspection. | S / font naming/assets | Planned |
| UI-001-B | UI-001-A | Extend Button; add UI IconButton/Badge/Notice. All screens. | Variants, busy/disabled states, names, touch targets; blocked controls cannot submit again. Focused behavior tests. | S / low | Planned |
| UI-001-C | UI-001-B | New UI fields, accessible OTP and departure selector. 03, 06–09, 41, 47. | Error/focus/paste/selection behavior; native keyboard and enlarged text. | M / native input behavior | Planned |
| UI-001-D | UI-001-B, TOOLCHAIN-001-A | Extend Screen; new form/footer, ConfirmAction and sheet host. Verify candidate library before adoption. | One sheet at a time; Android back/iOS dismissal; keyboard-safe actions and restored focus; native checks. | M / gestures/keyboard | Planned |

### Contracts

Reuse C's public exports/build. CONTRACT-001-A introduces Zod and the planned Vitest harness/scripts; do not install tooling in unrelated cards. Each card exports inferred types from schemas and tests invalid inputs/public projections. Update api/overview.md and its domain API document. No React types, UI state, database models or services in C.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| CONTRACT-001-A | MONO-001 | C common/errors plus C/tests and Vitest/root scripts; reuse package boundary. Supports all screens. | Invalid IDs/timestamps/errors fail; real test:contracts command; existing mobile import/build remains valid. | S / test/export integration | Planned |
| CONTRACT-001-B | CONTRACT-001-A | C location/users: exact/public/owner/meeting schemas and user projections. 01–05, 15, 19–22. | Strict public schemas reject private fields; location bounds and validation-policy defaults recorded/tested. | S / location policy | Planned |
| CONTRACT-001-C | CONTRACT-001-B | C auth: challenge/session inputs/results and errors. 07–09, 31, 47–48. | Challenge/resend/expiry/rotation fields represented; credentials never public; mock OTP policy recorded and boundary-tested. | S / mock policy values | Planned |
| CONTRACT-002-A | CONTRACT-001 | C places: curated search inputs/results. 03, 22. | Query/limit/area bounds; stable place IDs; invalid cases rejected. | S / low | Planned |
| CONTRACT-002-B | CONTRACT-002-A | C rides/matches: public/own rides, nearby ride/group union, create/cancel and matches. 02–06, 09–12, 19–30, 53–55. | Lifecycle, truncation, operation IDs/versions, public and owner projections validate. Define lightweight public group summary without private group data. | M / projection consistency | Planned |
| CONTRACT-003-A | CONTRACT-002 | C groups: members, join/status/leave, points and closure metadata. 12–19, 29, 32–38, 49, 51. | Permissions/transitions explicit; public preview remains separate; resolve ready-point policy in specs before implementing it. | M / point-update policy | Planned |
| CONTRACT-003-B | CONTRACT-003-A | C chat: canonical messages/send and history/catch-up pages. 14, 36, 45. | Text bounds; client/canonical identities; mutually exclusive pagination; sequence metadata. | S / pagination edges | Planned |
| CONTRACT-003-C | CONTRACT-003-B | C safety: block/unblock/list/report inputs/results. 41–44, 52. | Bounded reasons/details, validated context, membership effects, receipt/error shapes. | S / report bounds | Planned |
| CONTRACT-004-A | CONTRACT-003 | C realtime: event union, audience/version and subscription vocabulary. All live states. | Validated payload/audience per event; invalid and mixed public/private examples fail. | M / event coverage | Planned |
| CONTRACT-004-B | CONTRACT-004-A | C notifications: payloads/registration. 39, 46. | Versioned IDs-only payloads; kinds/expiry; private text and coordinates rejected. | S / low | Planned |

### Data, simulator, authentication and synchronization

Documentation: ARCHITECTURE.md, DEVELOPMENT.md, MOCK_SCENARIOS.md, and auth/realtime/API specs as affected. TSDoc explains cancellation, identity, reset, operation receipts, authorization and event ordering.

Execution clarification: MOCK-001-B supplies minimal curated place reads as well as discovery. LOCATION-001-B can therefore offer a named manual pickup without importing fixtures or depending on the later destination UI. DESTINATION-001-A extends this foundation with search/compatibility scenarios. SYNC-001-B depends specifically on AUTH-001-B, not the entire later auth UI parent.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| DATA-001-A | MOBILE-001, CONTRACT-004 | New Data AppDataSource/composition and M/src/config validation. Reuse bootstrap. | Eight typed namespaces; unsupported API mode fails; no transport or silent mock fallback. | S / interface completeness | Planned |
| DATA-001-B | DATA-001-A | Query provider/keys, normalized errors, read aborts and lint boundaries. | Keys distinguish identity/parameters; obsolete reads abort; controlled forbidden fixture import fails lint; replace temporary smoke import when real contract consumer exists. | M / Query integration | Planned |
| MOCK-001-A | DATA-001 | New Mock state/clock/IDs/scheduler/emitter/receipts. | Seeded latency/failures repeat; due events process after background time; repeated disposal/reset leaks no timers/listeners. Fake-clock tests. | M / lifecycle cleanup | Planned |
| MOCK-001-B | MOCK-001-A | Mock safe serializers, minimal active/empty/curated-place seeds and reads. 02, 05, 19, 23–25, 54; manual fallback data. | Outputs/events validate without private fields; grouped riders not duplicated; basic places.search callable through AppDataSource. | S / projection correctness | Planned |
| MOCK-001-C | MOCK-001-B, UI-001-D | Existing Demo route plus injected dev-control port; no direct fixture imports. 50. | Reset/connectivity/fail-next/time controls; only implemented scenarios enabled; production unavailable. | S / build gate | Planned |
| AUTH-001-A | MOCK-001 | Mock auth operations: challenge/verify/refresh/logout/me. Supports auth/session states. | Synthetic identity only; expiry/resend/attempt bounds; consumed challenge/rotated credential reuse rejected. | M / session rules | Planned |
| AUTH-001-B | AUTH-001-A | New Platform storage and Features auth session controller; SecureStore boundary. | Memory-only access token; namespaced refresh storage; one concurrent refresh; local logout completes despite cleanup failure. | M / storage/concurrency | Planned |
| SYNC-001-A | MOCK-001 | Data event synchronization/version guards/invalidation and snapshot races. | Duplicate/out-of-order events and delayed reads converge without overwriting newer state. Deterministic integration tests. | M / ordering | Planned |
| SYNC-001-B | SYNC-001-A, AUTH-001-B | Data foreground/reconnect/session-reset integration. Supports 25, 31, 37, 45–46. | Identity change cancels reads/subscriptions; late results cannot restore private data; repeated reset/reconnect leaks nothing. | M / stale private responses | Planned |
| AUTH-001-C | AUTH-001-B, SYNC-001-B, UI-001-C, UI-001-D | Replace auth placeholders; Features auth typed pending-intent gate. 07–08, 31, 47. | Invalid/expired/resend/cancel work; draft survives; target revalidated then confirmed; no automatic mutation/send. | M / navigation restoration | Planned |
| AUTH-001-D | AUTH-001-C, UI-001-D | Existing Settings route plus Features settings/sign-out confirmation. 40, 48. | Anonymous/signed-in variants; private routes/cache cleared; no implicit group leave; incomplete deregistration described honestly. | S / cleanup feedback | Planned |

### Location, native map and discovery

Documentation: architecture/development, location behavior, scenarios A/B/I/M and analytics. Use react-native-maps with Apple Maps on iOS and Google Maps on Android as already specified; verify configuration/coverage in native builds. [Expo map guidance](https://docs.expo.dev/versions/latest/sdk/map-view/)

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| LOCATION-001-A | MOBILE-001 | New Platform foreground permission/fix controller. | Denied/unavailable/stale/inaccurate states; stop observation in background; never relocate published request. Unit lifecycle/native permission checks. | M / OS behavior | Planned |
| LOCATION-001-B | LOCATION-001-A, UI-001-D, MOCK-001-B | Features location explanation/denial/recovery and named manual pickup through places boundary. 01, 21. | Browse after denial; no invented position; confirm a named pickup without GPS; no fixture imports. | S / permission recovery | Planned |
| MAP-001-A | LOCATION-001, UI-001-D | Replace MapPlaceholderScreen with native Features map/camera/recenter/overlays; app native config. | Both providers render/pan; Bishkek coverage; denial still permits browsing; no domain markers yet. | M / provider config | Planned |
| MAP-001-B | MAP-001-A | Features map-centre picker and tile-status boundary. 22; foundation for 26. | Pin tracks centre; confirmation changes draft only; accessible named alternative; tile/source failures distinct. | M / camera coordination | Planned |
| ANALYTICS-001-A | MOBILE-001 | New M/src/analytics typed memory/no-op boundary. | Sensitive properties rejected; intent/success distinct; session/dwell tested; demo events identifiable/excludable. | S / metric definitions | Planned |
| MAP-002-A | MAP-001, SYNC-001, ANALYTICS-001 | Features map discovery Query hook and loading/empty/error/stale views. 02, 23–25, 54. | Obsolete viewport reads cannot win; no camera jumps; honest states and exposure semantics. | M / viewport races | Planned |
| MAP-002-B | MAP-002-A | Features map markers/clusters/list and tile fallback; reuse map/sheets. 20, 26, 53. | Map/list agree; group counts once; disclose truncation; 100-item native scenario usable; accessible list selection. Evaluate small clustering utility only here. | M / density | Planned |
| MAP-002-C | MAP-002-B | Public ride/group sheets and disappeared selection; reuse cards/UnavailableScreen. 05, 19, 55. | Refresh/removal reconciles selection; no private fields; join intent reserves no seat; preserve own request. | S / selection races | Planned |
| DESTINATION-001-A | MAP-002 | Extend Mock places/search and supplied preview matches; reuse minimal place reads. | Deterministic bounded/cancellable queries; compatibility fixture results; no geocoder, routing or production matching. | S / low | Planned |
| DESTINATION-001-B | DESTINATION-001-A, UI-001-C | Features destinations search sheet/selection/clear and map emphasis. 03–04. | Rapid changes reject stale results; map visible; unrelated activity retained; clear restores general browsing. | M / search/sheet integration | Planned |

### Requests and groups

Documentation: api/rides.md, api/groups.md, PRODUCT.md, scenarios C–G and unknown-outcome behavior. Reuse operation receipts and confirmation UI. Group readiness screens initially use supplied points; MEETING-001 adds their full inspection.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| RIDE-001-A | DESTINATION-001, AUTH-001 | Mock ride create/current/cancel/expiry operations. | One live request; same-key original result; changed-input conflict; grouped cancel rejected; private origins protected. | M / receipts/deadlines | Planned |
| RIDE-001-B | RIDE-001-A | Features rides draft/departure/final confirmation; existing auth gate. 06, 09. | Now/+5/+10; valid origin; preserved draft; repeated presses create once; useful existing-request continuation. | S / draft restoration | Planned |
| RIDE-001-C | RIDE-001-B | Features rides active card/countdown/cancel/expiry. 10, 27–28. | Foreground/background expiry removes invalid actions; cancellation uses canonical success; explicit create-again. | S / timing boundaries | Planned |
| RIDE-001-D | RIDE-001-C | Mock match scenario and Features rides match/unknown-create recovery. 11, 30. | Scenario C one valid supplied match; expired match removed; lost acknowledgement does not duplicate creation. | M / uncertain outcome | Planned |
| GROUP-001-A | MOCK-001, RIDE-001-A | Mock atomic solo/group join operations, reused receipt mechanism. | Simultaneous first joins one group; last-seat race one winner; max four; rejected join preserves own request. | M / concurrency | Planned |
| GROUP-001-B | GROUP-001-A | Mock leave/coordinator transfer. | Immediate revocation; survivor/under-two rules; leaver request cancelled; repeated leave idempotent. | S / membership effects | Planned |
| GROUP-001-C | GROUP-001-B | Mock ready/reopen/complete/cancel/expiry/terminal access. | Role/version/prerequisites; grouped deadline; one-hour retention; no taxi-induced transition. | M / lifecycle matrix | Planned |
| GROUP-002-A | GROUP-001, RIDE-001 | Features groups join confirmation/conflict recovery; existing routes/gate. 12, 29–30, 55. | Revalidate target; no optimistic membership; full/closed/expired/version/unknown outcomes reconcile; own request preserved. | M / partial sequence | Planned |
| GROUP-002-B | GROUP-002-A | Existing Group route plus member/seat/role-aware menu components. 13, 32. | Live 2→3→4 occupancy; full still forming; correct safety target; unauthorized direct entry rejected. | S / live updates | Planned |
| GROUP-002-C | GROUP-002-B | Features groups ready/leave/reopen/complete/cancel/revoked states. 16, 18, 34–35, 37, 49, 51. | Correct role/status controls and consequences; canonical transitions; late/denied responses reveal no private content. | M / role/closure transitions | Planned |

### Chat, meeting points, taxi, safety and notifications

Documentation: relevant API/product rules, DEVELOPMENT.md platform notes, and scenarios H/J/K/L/N; common handoff applies to each card. TSDoc covers access/retention, message identity, external handoff semantics and notification navigation.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| CHAT-001-A | GROUP-002 | Mock history/send and sequence pagination/idempotency. | Text bounds; source sender; retries/lost response create one message; history and complete catch-up pagination. | M / pagination/deduplication | Planned |
| CHAT-001-B | CHAT-001-A, UI-001-D | Existing Chat route plus Features chat list/composer/older history. 14. | Stable order; keyboard-safe composer; pending presentation; no sensitive logs/analytics. Both-platform keyboard checks. | M / keyboard/scroll | Planned |
| CHAT-001-C | CHAT-001-B, SYNC-001 | Chat retry/catch-up/closure/revocation. 36–37, 45. | Same ID retry; no automatic reconnect send; multi-page recovery; leave clears text/history; retention ends access. | M / late messages/access | Planned |
| MEETING-001-A | GROUP-002 | Mock nullable point assignment/updates through existing groups namespace. | Member-only reads/events; supplied estimate; documented update policy; null prevents ready. | S / ready-point policy | Planned |
| MEETING-001-B | MEETING-001-A, MAP-001 | Features groups meeting sheet using native map; readiness integration. 15, 33; details in 16/49. | Correct landmark/estimate; return never mutates status; point change invalidates taxi review. Native sheet/map check. | S / private map | Planned |
| TAXI-001-A | MEETING-001 | New Platform taxi/Yandex adapter and reviewed-parameter validation. | Verify official link/fallback formats; no coordinate/URL logging or group mutation; opening/failure adapter tests. | M / external support | Planned |
| TAXI-001-B | TAXI-001-A | Features groups taxi-review/fallback UI. 17, 38. | Fresh reviewed coordinates; installed/absent/failure; explicit copy; group refresh on return. Both-platform native checks. | M / provider availability | Planned |
| SAFETY-001-A | GROUP-002, CHAT-001 | Mock block/unblock/list/report. | Atomic block-and-leave; pairing filtered; no self-block; authorized report context; receipt/retry/failure tests. | M / privacy/membership | Planned |
| SAFETY-001-B | SAFETY-001-A, UI-001-C, UI-001-D | Features safety report form and accepted/rejected/unknown outcomes. 41–42, 52. | Draft retained; receipt only after acceptance; stable retry identity; no moderation claims. | S / lost report response | Planned |
| SAFETY-001-C | SAFETY-001-B | Features safety block confirmation/blocked-list Settings panel. 43–44, 40. | Correct two-person/surviving copy; clear access; paged/empty/error list; unblock never restores history. | S / contextual copy | Planned |
| NOTIFICATION-001-A | CHAT-001, MEETING-001 | New Platform local-notification adapter and Mock device registration. | Validated generic payloads; cleanup; no remote push/private notification content. | S / native integration | Planned |
| NOTIFICATION-001-B | NOTIFICATION-001-A, AUTH-001-D | Permission UI/settings and notification generation. 39–40. | Allow/deny/later/settings recovery; actual local delivery; no unsolicited startup prompt. | S / OS delivery | Planned |
| NOTIFICATION-001-C | NOTIFICATION-001-B, SYNC-001 | Platform tap coordinator/bootstrap routing. 46. | Wait for session; deduplicate; fetch authorization; stale/revoked targets reveal nothing. Warm/cold native checks. | M / startup ordering | Planned |

### Final integration and handoff

Documentation: DEVELOPMENT.md, MOCK_SCENARIOS.md, API specs, roadmap and final handoff. Audit discoveries become bounded fix cards, not an open-ended polish assignment. QA completion still requires every original parent acceptance criterion.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| QA-001-A | TAXI-001, SAFETY-001, NOTIFICATION-001 | Complete Mock A–N scenarios/dev controls and integration tests. Screen 50 plus all flows. | Every scenario produces documented result; reset clears timers/listeners/credentials/cache; picker selects actual scenarios. | M / interactions | Planned |
| QA-001-B | QA-001-A | Add planned M/.maestro suite and real test:e2e wrapper; reuse installed dev build. | Happy journey plus denial/conflict/expiry/failed-message/revocation run; exact prerequisites/commands documented. | M / automation | Planned |
| QA-001-C | QA-001-B | Android audit of 01–55, native integrations, typography/accessibility. | Compare local SVGs with Manrope, larger text, keyboard, map density, permissions/notification/taxi; record evidence and bounded defects. | M / device differences | Planned |
| QA-001-D | QA-001-C | Equivalent iOS 01–55 audit and cross-platform checkpoint. | All required evidence applies to final files; no unfinished mandatory criterion marked complete. | M / iOS behavior | Planned |
| HANDOFF-001-A | QA-001 | Reconcile C, data operations, API/event specs, privacy/scenarios and limitations. | Every operation maps to endpoint/event; contract/static checks; production assumptions explicit; no backend implementation. | M / spec drift | Planned |

## F. Verification and completion criteria

### Available versus future tooling

Re-read actual manifests before running commands. The following were available at review/save time:

| Command | Purpose / qualification |
| --- | --- |
| pnpm build:contracts | Existing shared-package build. |
| pnpm typecheck | Workspace static types. |
| pnpm lint | Existing lint; mock-import restrictions introduced by DATA-001. |
| pnpm test:mobile | Existing Jest harness; forwards arguments, paths relative to apps/mobile. |
| pnpm test | Workspace test tasks, currently mobile only. |
| pnpm doctor:mobile | Expo/config checks; plain pnpm doctor is a different command. |
| pnpm export:android / pnpm export:ios | JavaScript export; not native verification. |
| pnpm mobile:android / pnpm mobile:ios | Local development builds; follow TOOLCHAIN native setup. |
| git diff --check | Whitespace/error check. |

Not yet available: pnpm test:contracts, Vitest contract suites, pnpm test:e2e, Maestro flows. Their owning cards add real tooling; never add success-only placeholders.

Current targeted test example:

    pnpm test:mobile --runTestsByPath tests/navigation.test.tsx

New feature tests likewise belong below apps/mobile/tests, not src or app. Use fake clocks/deterministic failures rather than sleeping in tests. Use the same AppDataSource boundary as features in integration tests; lower-level operation tests may use a controlled simulator harness.

### Automated coverage

- Strict DTO validation/public serialization and public/private event audiences.
- One live request and one live group; four single-seat members.
- Concurrent first-group creation and last-seat joining.
- Same-key retries, changed-input conflicts, duplicate events, lost acknowledgements.
- Active/group/history deadlines with foreground catch-up and fake time.
- Role/version/prerequisite enforcement; leave/transfer/reopen/cancel/complete/block effects.
- One refresh under concurrent expiry; auth continuation, logout, reset and late-response rejection.
- Chat order, older pages, sequence catch-up, explicit retry, duplicate echoes, closure and retention.
- Search/viewport cancellation, selected-target disappearance and non-exhaustive truncated counts.
- Notification payload validation/tap deduplication/startup ordering/current authorization.
- Bounded analytics properties, intent versus success, fresh peer exposure, demo exclusion.
- Import boundary enforcement and timer/listener disposal.

### Native and visual matrix

- Real map providers/coverage, camera/recenter/manual pin, clusters and 100-item responsiveness.
- Distinct tile failure and simulated source outage.
- Permission denial/recovery, stale/inaccurate fixes, foreground-only observation.
- Small/large devices, enlarged text, screen readers, focus order, keyboards, sheets, safe areas, Android back and iOS dismissal.
- Local notification permission/delivery and warm/cold entry; reset-world stale notifications.
- Installed/absent/failure Yandex paths, supported fallback, refresh after external return.
- All 55 design states through deterministic synthetic scenarios; compare hierarchy, spacing, colors, controls and native Manrope reflow, not fallback-font pixel identity.

The complete journey is anonymous browse → destination → auth → create → match → group → chat → meeting point → ready → Yandex/fallback, with explicit coordinator completion and every required recovery path. Completion means the [DEVELOPMENT criteria](DEVELOPMENT.md#mobile-mvp-completion-criteria) pass, not simply that every frame has a component.

### Evidence and limits of this plan

The preceding read-only analysis visually reviewed every SVG and parsed all 55 with the expected 390 × 844 viewBox. The existing layout report was empty, and git diff --check passed. Its palette calculations and artifact checks are not native accessibility/interaction verification.

No application tests/builds were run for that analysis or for saving this documentation. The 16-test/Android results are historical implementation evidence in WORK_LOG.md, not fresh results from DOC-003. Native Figma verification remains pending. Remote Figma may differ from local corrections.

For DOC-003, validate local Markdown links/anchors, all screen IDs 01–55, task/status/reference coverage, dependency acyclicity/order, and preservation of unrelated tracked files; record actual results in WORK_LOG.md.

## G. Decisions and recommended starting task

### Genuine dependencies and pending decisions

| Dependency/decision | Blocks | Handling |
| --- | --- | --- |
| Working iOS environment/native evidence | MOBILE-001 completion | Resolved: MOBILE-001-H completed on 2026-10-30 with iOS and Android evidence. |
| Gesture-handler compatibility decision | New sheet/gesture integration | Resolve TOOLCHAIN-001-A when assigned; no silent dependency changes in H. |
| Android map provider configuration/restricted credential | Native Android map verification | MAP-001-A; no credentials in docs/logs. |
| Point changes while group is ready | Final group/meeting semantics | CONTRACT-003-A records a reviewed policy. Recommendation: a changed point invalidates readiness and requires coordinator confirmation again. This recommendation is not yet an adopted product transition. |
| Supported Yandex link/fallback formats and test availability | TAXI-001 completion | Verify official provider formats and installed/absent native paths in taxi cards. |

### Reasonable assumptions

- Along is provisional; no trademark/availability claim or release-identifier change.
- Local construction sources/SVGs take priority over the unverified remote copy.
- Keep current map/provider architecture and native responsive layout.
- Bundle static Manrope/license; curated destination data remains synthetic.
- Report categories follow the four illustrated choices.
- OTP timing, report-detail bounds, location freshness/accuracy limits and analytics thresholds are documented mock policies with boundary tests. Relevant contract/operation cards must choose explicit values before coding against them; they do not imply production policy.
- No dark theme/localization system, real SMS, remote push, booking service or backend is added.
- Figma verification is not a blocker for local mobile implementation.

Unverified: remote Figma fidelity, final native typography/accessibility, native map coverage, notification/taxi integration behavior and the native checks of later cards. No plan can guarantee zero bugs; narrow assignments, explicit acceptance and behavioral checks reduce ambiguity and catch regressions.

### Smallest next assignment

MOBILE-001-H was completed on 2026-10-30. The next card in section E's order is TOOLCHAIN-001-A, which settles the recorded `react-native-gesture-handler` version (3.3.0 installed; Expo SDK 57 expects `~2.32.0`). Execute it only when assigned, with the one-task prompt below. Completing H did not authorize it. The copyable H prompt below is kept for reference.

Copyable prompt:

    Read AGENTS.md and project guidance in the required order.
    Read docs/FIRST_STEPS.md, docs/TOOLCHAIN.md, docs/AI_CONTEXT.md,
    and the latest MOBILE-001-G handoff in docs/WORK_LOG.md.

    Execute only MOBILE-001-H: verify iOS and finish the shell checkpoint.
    Do not implement the Along design or start later roadmap tasks.

    Inspect Git status/diff first. Preserve all existing user/assistant changes.
    Record task ownership as Codex (Terra), with the working copy and scope.
    In Claude Code, use Claude Code as the actor instead.

    Use the documented local iOS prerequisites. Run:
    LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm mobile:ios

    Verify cold launch, anonymous home, phone/OTP navigation, Back/Close,
    native dismissal where supported, safe areas, dark status-bar content,
    and direct-entry fallback. Record simulator OS/runtime and outcomes
    without device identifiers or sensitive logs.

    Run the exact final checkpoint listed in MOBILE-001-H.
    Do not substitute JavaScript exports for native verification.
    If a shared configuration/code fix is necessary, keep it narrow and
    rerun the affected Android checks.

    Do not change dependency versions to address the separately documented
    gesture-handler decision. Record any resulting blocker honestly.

    Follow the documented generated-directory and MEGAsync rules.
    Leave generated native/build output untracked.
    Stop development processes started for this assignment.

    Update FIRST_STEPS.md, ROADMAP.md, AI_CONTEXT.md, WORK_LOG.md,
    and any affected setup documentation.
    Mark completion only when the required criteria pass.

    Report changes, checks/results, documentation updates, exclusions,
    and the next suggested task. Do not commit or start another assignment.

### Prompt for later child cards

Reusable one-task session prompt, added by DOC-004 on 2026-10-10. It also handles MOBILE-001-H through its original FIRST_STEPS card. Paste it into either assistant from the project root for each new session. Leave TASK as NEXT for sequential continuation, or replace NEXT with an exact child ID. Do not pass a parent ID. The first pending step at the time of writing is MOBILE-001-H; always recheck current files.

The stored prompt does nothing until the user invokes it. When invoked, NEXT authorizes selection and execution of one child only, not the remaining plan or unresolved product-policy changes.

    Work in the ride-match project root.

    TASK: NEXT
    SESSION LIMIT: exactly one implementation child task.

    Implement the saved plan step by step. This prompt authorizes only the
    single child selected below. Do not execute the entire plan.

    1. Read project context
    Follow AGENTS.md's reading order. Read docs/AI_CONTEXT.md, the relevant
    WORK_LOG.md handoff, ROADMAP.md, AI_WORKFLOW.md, and the implementation
    plan in docs/MOBILE_IMPLEMENTATION_PLAN.md. Read its common card contract,
    relevant screen/state requirements, verification and pending decisions.
    For MOBILE-001-H, use the full card in docs/FIRST_STEPS.md.
    Read affected API/product specs and actual tooling before editing.

    2. Select one child
    If TASK names a child, work only on it. If already completed, report that
    and stop; do not substitute another task.
    For NEXT, resume the unfinished implementation child identified by the
    handoff when ownership is released and continuation is authorized.
    Otherwise select the first unfinished child in section E's listed order.
    Do not select documentation/Figma work or a whole parent.
    Verify prerequisites against actual files and recorded checks.
    If blocked or another assistant owns overlapping work, report the issue;
    do not silently skip to another child or overwrite their changes.

    3. Establish scope
    Inspect Git status/diff and preserve pre-existing changes.
    Announce the selected ID, intended files, acceptance criteria and checks.
    Record the real tool/model/session owner and mark only that child
    In progress, updating parent progress when appropriate.
    Proceed within this authorized scope without another confirmation.
    Ask only for genuinely missing information, required permission, or a
    material unresolved decision; do not invent product policy.

    4. Implement only that child
    Resume unfinished criteria; do not restart completed work.
    Reuse existing modules, routes and components. Follow the card's scope.
    No sibling tasks, future-feature scaffolding, speculative abstractions,
    unrelated refactors, or dependency upgrades outside this child's needs.
    Preserve the mock-only MVP, AppDataSource boundary, location privacy,
    authentication/membership rules and existing working behavior.
    Treat design links as examples, not domain transitions.
    Add useful TSDoc to reusable logic and integration boundaries.

    5. Verify
    Run the card's required checks and meaningful focused tests.
    Check manifests before commands; mobile tests belong under
    apps/mobile/tests. Native requirements need native evidence.
    Fix in-scope failures; never weaken checks or claim exports/mocks prove
    native success. Record exact results and any checks not run.
    If a blocker remains, finish independent work within this child,
    checkpoint the unfinished criteria, and stop without changing tasks.

    6. Update shared documentation
    Update the owning child status: FIRST_STEPS.md for MOBILE-001-H,
    MOBILE_IMPLEMENTATION_PLAN.md for later children.
    Update ROADMAP.md, AI_CONTEXT.md, WORK_LOG.md and affected specs.
    Record changes, decisions, checks, limitations and the exact resume point.
    Mark Completed only when every required criterion passes; a parent also
    requires all its children and parent criteria. Release ownership.

    7. Stop
    Report task ID/status, changes, exclusions, checks, documentation/TSDoc,
    remaining risks, and one next suggested child ID.
    If unfinished, recommend resuming this same child.
    Do not implement, scaffold, or investigate the next child.
    Do not commit, push, create another session, or arrange automatic
    continuation. Wait for the user's next assignment.
