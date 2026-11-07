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
| Typography | UI-001-A bundles static Manrope weights 400/500/600/700/800 with the OFL license, embedded through `expo-font`. `AppText` variants: display 48/54 ExtraBold, heading 30/36 ExtraBold, section 24/30 Bold, subheading 18/24 Bold, body 15/22 Regular, label 15/20 Bold, and small 12/18 Medium, from the design source's style table. Micro is deferred. |
| Type scale | Reference size/line height: display 48/54, heading 30/36, section 24/30, subheading 18/24, body 15/22, label 15/20, small 12/18. Micro 10/14 is not for essential information. |
| Spacing | 4, 8, 12, 16, 24, 32; reference side padding 24, adapted to insets and width. |
| Shape | Radii 12/16/24/32; reference buttons 52 high with radius 16; allow growth with text. |
| Colors | Ink #123C38; teal #146B59; lime #DDF5A0; paper #F7F8F2; muted #586D68; line #DCE4DC; soft #EAF2E9; danger #AD3E36; warning #8A5B14. |
| Layout | Separate map, scrolling content, modal form, and chat layouts; shared footer/spacing rules. |
| Icons | Consistent small vector set: back, close, search, location, members, chat, shield, clock, settings, external opening. Hide decorative icons from accessibility. UI-001-B's `IconButton` hides whatever icon it receives. **Decided in MAP-001-A:** `react-native-svg` 15.15.4 (Expo SDK 57's version) draws the design's own 24-point stroke paths in `src/ui/Icon.tsx`, one icon at a time as screens need them (`locate`, `back` and `sliders` so far). `@expo/vector-icons` was not chosen: its sets differ from the design's drawings. |
| Sheets | One coordinated host per flow; content-driven sizing, keyboard handling, focus restoration, explicit dismissal. UI-001-D builds `SheetHost` on React Native's `Modal`; see the sheet-library decision below. |

For SDK 57, use static Manrope font assets. Expo's guidance supports native embedding through expo-font, avoiding startup font swapping; verify platform font-family/weight names and preserve the license. [Expo font guidance](https://docs.expo.dev/develop/user-interface/fonts/)

Component inventory:

- Extend Screen, Button, UnavailableScreen.
- Core: AppText (UI-001-A, `src/ui/AppText.tsx`, with tokens in `src/ui/tokens.ts`), and, from UI-001-B, `Button` variants (primary, secondary, ghost, danger; `busy`), IconButton, Badge (neutral, success, warning, danger), and Notice (neutral, warning, danger). LoadingState and EmptyState are still to come.
- Inputs (UI-001-C): `TextField` and `SearchField` (`src/ui/TextField.tsx`); `OtpField`, one transparent input over decorative digit cells; and `SegmentedControl`, a radio group that RIDE-001-B fills with the Now, +5, and +10 departure options. Errors are announced through `FieldMessage`'s `useAnnouncement`.
- Layout (UI-001-D): `Screen`'s `scroll` and `footer` form layout, `ActionFooter`, `SheetHost` with `SheetContent` (`src/ui/SheetHost.tsx`), and `ConfirmAction`. MOCK-001-C added `ScreenHeader` (`src/ui/ScreenHeader.tsx`: a back `IconButton` and the screen's name as its header). MAP-001-A added the map layout, `MapLayout` (`src/ui/MapLayout.tsx`): a map behind a floating header, right-hand controls and a fixed, non-draggable bottom sheet.
- Discovery: destination row/chip, public ride/group card, nearby row, ride/group/own/meeting markers, cluster marker.
- Groups: member row, capacity display, status header, meeting summary, role-aware action menu.
- Chat: message bubble, composer, failed-send action, closure banner, history-loading controls.
- Safety/settings: reason row, permission row, blocked-user row.

Do not add a broad UI framework. A sheet library is justified only after a bounded compatibility check for gestures, scrolling, keyboard, and accessibility. [Official documentation](https://gorhom.dev/react-native-bottom-sheet/)

**Sheet-library decision (UI-001-D, 2026-10-31): no library for now.**

- **Checked:** `@gorhom/bottom-sheet` 5.2.14, the latest release (2026-05-09). It is plain JavaScript, and its peers (gesture-handler ≥ 2.16.1, Reanimated ≥ 3.16 or 4) are met by the installed 2.32.0 and 4.5.1, so it would not need a native rebuild. Expo SDK 57 does not list it.
- **Why not now:** the modal sheets need what React Native's `Modal` already provides. The sheet is its own window, so screen readers stay inside it, and Android back arrives through `onRequestClose`. Gorhom's modal renders inside the app's own view tree, so it would need its own back handling and a way to hide the screen behind it from screen readers. Its keyboard handling also relies on its own `BottomSheetTextInput` rather than `TextField`.
- **Still open:** the draggable discovery sheet that stays over the map (02, 03, 20) is the case a gesture library serves. MAP-002-A decides it, with native checks of gestures, scrolling, keyboard, and accessibility.

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
| TOOLCHAIN-001-A | MOBILE-001-H | Resolve gesture-handler alignment in M/package.json and root lockfile; record decision. New bounded compatibility work. | Intended version resolves/autolinks; doctor, tests, exports and both native builds pass. Doctor alone is insufficient. | S / native compatibility | Completed (2026-10-31, VERIFY-001): tests, exports, doctor and clean Android and iOS rebuilds pass; 2.32.0 autolinks |
| UI-001-A | MOBILE-001-H | New UI tokens/AppText and M/assets static Manrope/license/Along mark; reuse existing art. All screens. | Correct native weights; no clipped sample headings/startup font failure; static checks and both-platform inspection. | S / font naming/assets | Paused: weights and startup verified on both platforms (2026-10-31, VERIFY-001); Android clips `section` descenders from 150% font scale, so a line-height fix is open |
| UI-001-B | UI-001-A | Extend Button; add UI IconButton/Badge/Notice. All screens. | Variants, busy/disabled states, names, touch targets; blocked controls cannot submit again. Focused behavior tests. | S / low | Completed (2026-10-30) |
| UI-001-C | UI-001-B | New UI fields, accessible OTP and departure selector. 03, 06–09, 41, 47. | Error/focus/paste/selection behavior; native keyboard and enlarged text. | M / native input behavior | Completed (2026-10-31, VERIFY-001): keyboards, focus, paste and enlarged text checked on both platforms; Android hidden-text fix in OtpField; OTP autofill needs a real SMS |
| UI-001-D | UI-001-B, TOOLCHAIN-001-A | Extend Screen; new form/footer, ConfirmAction and sheet host. Verify candidate library before adoption. | One sheet at a time; Android back/iOS dismissal; keyboard-safe actions and restored focus; native checks. | M / gestures/keyboard | Completed (2026-11-01, user waiver): one sheet, Android back, background dismissal, busy refusal and keyboard-safe actions verified on both platforms (2026-10-31, VERIFY-001), with Screen and Button fixes; screen-reader focus return, the VoiceOver escape gesture and the announced error were not run natively; the user accepted them untested on 2026-11-01 and will test TalkBack and VoiceOver in the final device testing, once everything including the backend works (Jest covers the calls) |

### Contracts

Reuse C's public exports/build. CONTRACT-001-A introduces Zod and the planned Vitest harness/scripts; do not install tooling in unrelated cards. Each card exports inferred types from schemas and tests invalid inputs/public projections. Update api/overview.md and its domain API document. No React types, UI state, database models or services in C.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| CONTRACT-001-A | MONO-001 | C common/errors plus C/tests and Vitest/root scripts; reuse package boundary. Supports all screens. | Invalid IDs/timestamps/errors fail; real test:contracts command; existing mobile import/build remains valid. | S / test/export integration | Completed (2026-10-31, VERIFY-001): mobile Jest, both exports and both development builds load Zod through the package |
| CONTRACT-001-B | CONTRACT-001-A | C location/users: exact/public/owner/meeting schemas and user projections. 01–05, 15, 19–22. | Strict public schemas reject private fields; location bounds and validation-policy defaults recorded/tested. | S / location policy | Completed (2026-10-31): location and user schemas with strict public projections; mock location policy (fix accuracy 100 m, age 60 s, public radius 200–5,000 m) recorded in api/overview.md and boundary-tested |
| CONTRACT-001-C | CONTRACT-001-B | C auth: challenge/session inputs/results and errors. 07–09, 31, 47–48. | Challenge/resend/expiry/rotation fields represented; credentials never public; mock OTP policy recorded and boundary-tested. | S / mock policy values | Completed (2026-10-31): auth schemas, `OTP_INVALID`/`OTP_EXPIRED`, mock OTP and token policy recorded in api/authentication.md; code length and cross-field limits tested here, timing and attempts left to AUTH-001-A |
| CONTRACT-002-A | CONTRACT-001 | C places: curated search inputs/results. 03, 22. | Query/limit/area bounds; stable place IDs; invalid cases rejected. | S / low | Completed (2026-10-31): place, search input (optional query, coarse area, limit 1–20) and results (at most 20, no duplicates); `UNSUPPORTED_AREA`; rules in api/rides.md |
| CONTRACT-002-B | CONTRACT-002-A | C rides/matches: public/own rides, nearby ride/group union, create/cancel and matches. 02–06, 09–12, 19–30, 53–55. | Lifecycle, truncation, operation IDs/versions, public and owner projections validate. Define lightweight public group summary without private group data. | M / projection consistency | Completed (2026-11-01): public and owner ride requests, create/cancel inputs (departure choice 0/5/10, operation ID, expected version), coarse viewport and nearby snapshot with `truncated`, match previews and the versioned match set, and `GroupPreviewDto`; `INVALID_DEPARTURE` removed; rules in api/rides.md |
| CONTRACT-003-A | CONTRACT-002 | C groups: members, join/status/leave, points and closure metadata. 12–19, 29, 32–38, 49, 51. | Permissions/transitions explicit; public preview remains separate; resolve ready-point policy in specs before implementing it. | M / point-update policy | Completed |
| CONTRACT-003-B | CONTRACT-003-A | C chat: canonical messages/send and history/catch-up pages. 14, 36, 45. | Text bounds; client/canonical identities; mutually exclusive pagination; sequence metadata. | S / pagination edges | Completed |
| CONTRACT-003-C | CONTRACT-003-B | C safety: block/unblock/list/report inputs/results. 41–44, 52. | Bounded reasons/details, validated context, membership effects, receipt/error shapes. | S / report bounds | Completed (2026-11-01): four report reasons, 500-character multi-line details, group/message context references, idempotent report receipt without moderation status; block result with the caller's leave or `null`; newest-first block list; rules in api/groups.md |
| CONTRACT-004-A | CONTRACT-003 | C realtime: event union, audience/version and subscription vocabulary. All live states. | Validated payload/audience per event; invalid and mixed public/private examples fail. | M / event coverage | Completed (2026-11-01): envelope with schema version 1 and audience (public, user, group), seven events with versioned ID-only or public payloads, per-subscription unions, subscription request/ack/unsubscribe; reasons never reveal joins or blocks; rules in api/realtime.md |
| CONTRACT-004-B | CONTRACT-004-A | C notifications: payloads/registration. 39, 46. | Versioned IDs-only payloads; kinds/expiry; private text and coordinates rejected. | S / low | Completed (2026-11-01): four versioned payloads (`matches.available`, `group.member_joined`, `group.ready`, `chat.message_created`) with notification ID, resource IDs only, issuedAt/expiresAt within one hour; no display text; text, names, coordinates, phone numbers, tokens and links rejected; push-device registration (installation UUID, Expo token, platform, permission) with an inert receipt that never echoes the token; rules in api/realtime.md |

### Data, simulator, authentication and synchronization

Documentation: ARCHITECTURE.md, DEVELOPMENT.md, MOCK_SCENARIOS.md, and auth/realtime/API specs as affected. TSDoc explains cancellation, identity, reset, operation receipts, authorization and event ordering.

Execution clarification: MOCK-001-B supplies minimal curated place reads as well as discovery. LOCATION-001-B can therefore offer a named manual pickup without importing fixtures or depending on the later destination UI. DESTINATION-001-A extends this foundation with search/compatibility scenarios. SYNC-001-B depends specifically on AUTH-001-B, not the entire later auth UI parent.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| DATA-001-A | MOBILE-001, CONTRACT-004 | New Data AppDataSource/composition and M/src/config validation. Reuse bootstrap. | Eight typed namespaces; unsupported API mode fails; no transport or silent mock fallback. | S / interface completeness | Completed (2026-11-01): `AppDataSource` with eight namespaces (one operation per documented endpoint, read signals, typed subscriptions, connection state); `createDataSource` selects once and `api` throws `DataSourceUnavailableError`, never using the simulator; config validation with no defaults; composition in bootstrap with a configuration error screen; unavailable stand-in in the mock slot until MOCK-001. Native/export check of `.env` loading passed in VERIFY-002: both development builds open with the mock source composed, and both exports pass |
| DATA-001-B | DATA-001-A | Query provider/keys, normalized errors, read aborts and lint boundaries. | Keys distinguish identity/parameters; obsolete reads abort; controlled forbidden fixture import fails lint; replace temporary smoke import when real contract consumer exists. | M / Query integration | Completed (2026-11-01): TanStack Query 5.104.5 client per launch (bounded read retries, no mutation retries); keys scoped by viewer with all parameters, public place search, per-group private prefix; options for the eight unpaged reads pass the abort signal, so obsolete reads abort (tested); `DataError` model with contract-validated source bodies; ESLint blocks simulator imports outside bootstrap and the simulator, tested with controlled imports; smoke import replaced by the runtime `ApiErrorSchema` use |
| MOCK-001-A | DATA-001 | New Mock state/clock/IDs/scheduler/emitter/receipts. | Seeded latency/failures repeat; due events process after background time; repeated disposal/reset leaks no timers/listeners. Fake-clock tests. | M / lifecycle cleanup | Completed (2026-11-01): simulated clock, seeded random and latency (separate streams), IDs, scheduler with background catch-up, typed emitter, idempotency receipts, `createSimulator` pipeline with explicit network/source failures, connection loss, aborts, reset and disposal; 30 fake-clock tests show repeated latencies, overdue tasks run after background time, and no timers or listeners left after ten resets or disposal. Not yet wired into the app (MOCK-001-B) |
| MOCK-001-B | MOCK-001-A | Mock safe serializers, minimal active/empty/curated-place seeds and reads. 02, 05, 19, 23–25, 54; manual fallback data. | Outputs/events validate without private fields; grouped riders not duplicated; basic places.search callable through AppDataSource. | S / projection correctness | Completed (2026-11-01): world records that keep exact origins and meeting points private; serializers that build every public DTO and event field by field and refuse records with no public projection; 12 curated places and the demo coverage; `active-neighborhood` (six solo rides, two groups, a ride at +8 s, an expiry at +20 s, a deadline for every ride and group) and `empty-neighborhood`; place search, nearby discovery, ride and group previews and nearby subscriptions through `AppDataSource`; the simulator composed at launch and disposed on unmount, an unknown scenario key shown as a configuration error. 31 adapter tests: outputs and events validate with no exact origin or meeting point, grouped riders only through their group. No native build run |
| MOCK-001-C | MOCK-001-B, UI-001-D | Existing Demo route plus injected dev-control port; no direct fixture imports. 50. | Reset/connectivity/fail-next/time controls; only implemented scenarios enabled; production unavailable. | S / build gate | Completed (2026-11-01): `DevControls` port and `useDevControls()`, created by the composition root with the mock source only outside `production` (`EXPO_PUBLIC_APP_ENV`; replaces the `__DEV__` check); `/dev/scenarios` (screen 50, also from home's Demo badge): all 14 documented scenarios with only implemented ones selectable, restart, Online/Offline, +30 s/+5 min/+15 min, and next-request failures (no answer, refused), each announced; starting a scenario resets the same simulator into it (`reset(next)`) and clears the Query cache; production shows an unavailable state. `ScreenHeader` and the back and sliders icons. 12 new tests (268). Not opened on a device yet (JS only) |
| AUTH-001-A | MOCK-001 | Mock auth operations: challenge/verify/refresh/logout/me. Supports auth/session states. | Synthetic identity only; expiry/resend/attempt bounds; consumed challenge/rotated credential reuse rejected. | M / session rules | Completed (2026-11-01): `src/data/mock/auth.ts` through the mock source's `auth` namespace: demo numbers only (Ofcom fiction range +44 7700 900000–900999; others `VALIDATION_FAILED` with a field error), demo code `123456`, one synthetic rider per number, `AUTH_POLICY` timing and attempts (throttle with `retryAfterSeconds`, expiry at the deadline, fifth wrong code and after `OTP_ATTEMPTS_EXCEEDED`, used/replaced/unknown `OTP_EXPIRED`), seeded opaque tokens, rotation (rotated token `REFRESH_TOKEN_INVALID`), logout revoking the session idempotently, `getCurrentUser` with `UNAUTHENTICATED`/`SESSION_EXPIRED`; auth records in the world, so a reset signs everyone out. `AccessTokenSource` port (anonymous until AUTH-001-B). Simulator errors can carry field errors and `retryAfterSeconds`. 16 tests (284) |
| AUTH-001-B | AUTH-001-A | New Platform storage and Features auth session controller; SecureStore boundary. | Memory-only access token; namespaced refresh storage; one concurrent refresh; local logout completes despite cleanup failure. | M / storage/concurrency | Completed (2026-11-07; native check in VERIFY-003: both development clients rebuilt, launch reaches home with no SecureStore error, no `NSFaceIDUsageDescription`, Android's merged manifest has the SecureStore backup and data-extraction rules, demo sign-in from home works on both): implemented and unit-tested — `src/platform/secureStorage/credentialStore.ts` (namespaced SecureStore key, this-device-only), `src/features/auth/createSessionController.ts` and `AuthSessionProvider.tsx` (memory-only access token, one shared refresh, serialized storage, sign-out that completes locally and reports unconfirmed revocation or cleanup), wired by the composition root; 305 mobile tests. Pending: the native check of the new `expo-secure-store` module (rebuild both development clients; launch clears the demo key without errors; no Face ID text; Android backup rules), deferred to the next native pass |
| SYNC-001-A | MOCK-001 | Data event synchronization/version guards/invalidation and snapshot races. | Duplicate/out-of-order events and delayed reads converge without overwriting newer state. Deterministic integration tests. | M / ordering | Completed (2026-11-07): `src/data/synchronizeEvents.ts` — `createEventSynchronizer(queryClient)` (event-ID deduplication, per-viewer resource versions and tombstones, nearby snapshot patching or invalidation, private-event audience checks and invalidation, `access.revoked` clearing, reconciliation of every successful read with one follow-up reread for older results or upserts missed by an in-flight first read, invalid events reread as missed) and `synchronizeSubscription`; 16 deterministic tests including mock-source races; 321 mobile tests |
| SYNC-001-B | SYNC-001-A, AUTH-001-B | Data foreground/reconnect/session-reset integration. Supports 25, 31, 37, 45–46. | Identity change cancels reads/subscriptions; late results cannot restore private data; repeated reset/reconnect leaks nothing. | M / stale private responses | Completed (2026-11-07): `src/data/createSyncCoordinator.ts` (watched subscriptions per viewer with generation-guarded delivery; identity change ends subscriptions, cancels and removes the previous rider's reads, resets the synchronizer and resubscribes; reconnect resubscribes and rereads; Query focus follows `AppState` and online follows the connection; demo scenario start resubscribes), `SyncProvider`/`useEventSubscription`, `useViewer`/`viewerOfSession`; the composition root now owns the Query client; mutations never wait for the connection; 331 mobile tests |
| AUTH-001-C | AUTH-001-B, SYNC-001-B, UI-001-C, UI-001-D | Replace auth placeholders; Features auth typed pending-intent gate. 07–08, 31, 47. | Invalid/expired/resend/cancel work; draft survives; target revalidated then confirmed; no automatic mutation/send. | M / navigation restoration | Completed (2026-11-07): `PhoneScreen`, `OtpScreen` (fresh-code state 47), `SessionEndedScreen` (31) and `SignInFlow` replace the placeholders (number and challenge in memory, the flow closes on sign-in and cancels the intent otherwise); `SessionExpiryRedirect`; typed gate `pendingIntent.ts` with `useRequireSignIn`/`useResumeIntent` (intent is data, owner rereads and confirms, nothing runs automatically); `DemoSignIn` for the mock's number and code; Sign in on home only while signed out; 351 mobile tests. Screen-reader checks waived to final device testing; the screens join the next native pass for keyboard and sheet layout |
| AUTH-001-D | AUTH-001-C, UI-001-D | Existing Settings route plus Features settings/sign-out confirmation. 40, 48. | Anonymous/signed-in variants; private routes/cache cleared; no implicit group leave; incomplete deregistration described honestly. | S / cleanup feedback | Completed (2026-11-07): `SettingsScreen` (40) for signed-in, signed-out, restoring and failed-restore sessions, with the location summary and the demo label, opened from home's Settings button; `SignOutSheet` (48, `ConfirmAction` in a sheet) says signing out does not leave a group or cancel a request; sign-out through the session controller (sync coordinator clears private reads), then the root stack reset to map + settings; `signOutOutcome.ts` reports `confirmed`/`unconfirmed`/`storage-kept` honestly; 370 mobile tests. Notifications and blocked riders wait for their cards; screen-reader checks waived to final device testing; the screen joins the next native pass |

### Location, native map and discovery

Documentation: architecture/development, location behavior, scenarios A/B/I/M and analytics. Use react-native-maps with Apple Maps on iOS and Google Maps on Android as already specified; verify configuration/coverage in native builds. [Expo map guidance](https://docs.expo.dev/versions/latest/sdk/map-view/)

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| LOCATION-001-A | MOBILE-001 | New Platform foreground permission/fix controller. | Denied/unavailable/stale/inaccurate states; stop observation in background; never relocate published request. Unit lifecycle/native permission checks. | M / OS behavior | Completed (2026-11-01; native checks in VERIFY-002): `expo-location` 57.0.22 with foreground-only native config; `src/platform/location/` controller (no prompt until asked, cached then fresh fixes, 15 s timeout, services, observation only while needed and in the foreground, recheck on return, permission loss clears the fix, frozen fixes) with `describeLocation`/`assessFix` and React hooks; 25 lifecycle tests. VERIFY-002 passed the native checks on the iOS 26.5 simulator and the Android 16 emulator and fixed services-off showing as a denial on iOS (a denial now reads the services state; 26 tests) |
| LOCATION-001-B | LOCATION-001-A, UI-001-D, MOCK-001-B | Features location explanation/denial/recovery and named manual pickup through places boundary. 01, 21. | Browse after denial; no invented position; confirm a named pickup without GPS; no fixture imports. | S / permission recovery | Completed (2026-11-01): `src/features/location/`: the introduction (01) prompts only on "Use my location" and can be set aside; a home card per state (not in use, denied with ask-again or settings, services off first, no fix, unreadable, locating, approximate, inaccurate, stale) keeps browsing open and never reads or invents a device position for it; "Choose pickup area" searches curated places through `places.search` and confirms a frozen `manual` pickup; choices live per launch; the root layout owns the controller. 22 tests through the real routes; typecheck and lint (import boundary) pass. Not opened on a device yet (JS only) |
| MAP-001-A | LOCATION-001, UI-001-D | Replace MapPlaceholderScreen with native Features map/camera/recenter/overlays; app native config. | Both providers render/pan; Bishkek coverage; denial still permits browsing; no domain markers yet. | M / provider config | Completed (2026-11-07; native checks in VERIFY-003 and VERIFY-004 on the iOS 26.5 simulator and, with the user's restricted key, the Android 16 emulator. The Android stale dot, which kept its teal image, is fixed: the marker asks react-native-maps to `redraw()` a frame after its colour changes, checked on the emulator in both directions (`#586D68` once out of date, teal after a refresh). The iOS stale dot was not checked on the simulator, whose precise-location switch could not be turned back on; iOS draws the marker view live): implemented. react-native-maps 1.27.2 (Apple Maps, Google Maps) and react-native-svg 15.15.4 (the design's icons, `src/ui/Icon.tsx`); `MapLayout` (map behind a floating header, controls and a fixed sheet, with the covered space as map padding); `src/features/map/`: the device position from the location controller (dot and accuracy circle, grey when stale, circle only when approximate), the confirmed pickup pin, a camera that opens on the demo city and moves once to the first fix or a new pickup, "Show my location", observation only while home is focused; the location card and pickup moved into the sheet. Android key from `GOOGLE_MAPS_ANDROID_API_KEY` through Expo's `android.config.googleMaps.apiKey` (kept out of the public config); without one a notice replaces the map. 13 new tests (256); typecheck, lint, doctor 21/21. **Pending:** rebuild both clients and run DEVELOPMENT's map shell checks (render, pan, Bishkek coverage, recenter, denial); Android rendering needs the user's restricted key |
| MAP-001-B | MAP-001-A | Features map-centre picker and tile-status boundary. 22; foundation for 26. | Pin tracks centre; confirmation changes draft only; accessible named alternative; tile/source failures distinct. | M / camera coordination | Paused (2026-11-07): implemented, native check pending. Home's "Choose pickup area" and "Change pickup point" open the map picker (22): a fixed `CentrePin` over the visible centre, the point read with `coordinateForPoint` at the pin's tip whenever the camera rests (`useMapPointPicker`), "Near …" from `useNearestPlace` (only the point rounded to 0.01° is sent; the nearest place within 1 km is picked on the device), and "Confirm this pickup", which only sets this launch's `map-point` pickup. "Choose a named place" opens the named list (the accessible alternative); a build without a map goes straight to it; the header's back and Android back leave the picker. `src/platform/map/useMapTileStatus.ts` follows tiles apart from the data source (`loading`/`loaded`/`slow` from Google Maps' `onMapLoaded`, `unknown` on Apple Maps, `not-configured`); the picker warns when `slow`. 386 mobile tests |
| ANALYTICS-001-A | MOBILE-001 | New M/src/analytics typed memory/no-op boundary. | Sensitive properties rejected; intent/success distinct; session/dwell tested; demo events identifiable/excludable. | S / metric definitions | Completed (2026-11-01; created by the app since MAP-002-A): `src/analytics/` catalog of the 22 documented events with stages and bounded properties (types plus run-time validation that rejects sensitive, unknown and out-of-range values without echoing them), sessions (new after 30 minutes in the background), once-per-session/once-per-key events, 1-second marker dwell once per target per session, context with `synthetic` for mock-source events and `isRealUserEvent`, memory/no-op sinks, provider and hook; 27 tests. Not yet created by the app (first instrumented card) |
| MAP-002-A | MAP-001, SYNC-001, ANALYTICS-001 | Features map discovery Query hook and loading/empty/error/stale views. 02, 23–25, 54. | Obsolete viewport reads cannot win; no camera jumps; honest states and exposure semantics. | M / viewport races | Paused (2026-11-07): implemented, native check pending. `src/features/discovery/`: `toViewport` (visible region rounded outward to 0.01°, `null` above 0.5°), `useNearbyDiscovery` (one Query read per viewport with the previous snapshot kept as `updating`, obsolete reads aborted, a nearby subscription for the same viewport, never moves the camera), `describeDiscovery` (`too-wide`, `loading` 54, `offline`, `failed` 24 incl. outside coverage, `active` 02, `empty` 23, `stale` 25), `DiscoveryPanel` at the top of home's sheet; `src/data/useConnectionState.ts`. Analytics now created by the composition root and started by the root layout: `map_opened` once per session, `nearby_activity_exposed` once per completed connected read (count bucket, truncation), never for placeholder, stale or failed snapshots. Markers remain MAP-002-B. 401 mobile tests. Started at the user's request while MAP-001-B's native check is pending |
| MAP-002-B | MAP-002-A | Features map markers/clusters/list and tile fallback; reuse map/sheets. 20, 26, 53. | Map/list agree; group counts once; disclose truncation; 100-item native scenario usable; accessible list selection. Evaluate small clustering utility only here. | M / density | Paused (2026-11-07): implemented, native check pending. `src/features/discovery/`: `nearbyItems.ts` (`describeItem` from public fields with approximate distance, `clusterItems` on a power-of-two grid anchored to absolute coordinates, `clusterZoomRegion`, `itemKey`), `DiscoveryMarkers.tsx` (pills for rides and groups, lime cluster counts of ride plans, faded when stale, redraw on change, `markerVisible`/`nearby_marker_tapped`), `NearbyListSheet.tsx` (20: same items in source order, demo badge, truncation and stale notices, count meanings, a cluster's items when its area cannot be split), selection from a marker or row (highlighted marker, "Selected on the map", camera to the item on a row), screen 26 as a sheet notice pointing to the list when tiles are `slow`; mock scenario M `map-density` (100 items). Clustering: no dependency; a grid suffices for ≤100 items (supercluster considered, not needed). 413 mobile tests |
| MAP-002-C | MAP-002-B | Public ride/group sheets and disappeared selection; reuse cards/UnavailableScreen. 05, 19, 55. | Refresh/removal reconciles selection; no private fields; join intent reserves no seat; preserve own request. | S / selection races | Paused (2026-11-07): implemented, native check pending. `src/features/discovery/`: `useTargetPreview.ts` (`describePreview`: `checking` with the map's copy, `available` once the source has just confirmed it, `gone` on `TARGET_UNAVAILABLE` even over older data, `failed`; reads `GET /rides/{rideId}` or the group preview again on every open and for each viewer, and turns `gone` when the synchronizer invalidates it on removal or expiry), `PreviewPanel.tsx` (05: destination, approximate distance, departure, display name, "One seat · Public demo profile", approximate-pin note, "Plan to join this rider"; 19: `describeGroupAvailability` badge and headline, occupancy, privacy note, "Create a request to join" only for a forming group with a free seat; 55: "That plan has changed.", nothing reserved, own request untouched, "Refresh nearby plans"). Home's sheet becomes the preview (header "Ride preview"/"Group preview" with the marker label, back button and Android back close it); the MAP-002-B selection card is gone. The join action reserves nothing and sends nothing: it records `join-ride`/`join-group` through `useRequireSignIn`; after sign-in `useResumeIntent` reopens the preview, which reads the target again and says joining needs the rider's own request (RIDE-001, GROUP-002-A). `group_join_clicked` stays with the join confirmation. 420 mobile tests |
| DESTINATION-001-A | MAP-002 | Extend Mock places/search and supplied preview matches; reuse minimal place reads. | Deterministic bounded/cancellable queries; compatibility fixture results; no geocoder, routing or production matching. | S / low | Completed (2026-11-07): `SuppliedMatchRecord` (`world.suppliedMatches`), seeded through `matches` on ride and group seeds in scenarios A (hand-written fixtures for nine destinations, departure-limited ones included, none for the ready group) and M; `readNearby` returns them as `previews` for returned items only, in item order, filtered by the departure choice (`matchPreviews`, `toMatchPreviewDto`). Place search reused unchanged (already deterministic, bounded and cancellable). Started at the user's request while MAP-002's native checks are pending. 425 mobile tests |
| DESTINATION-001-B | DESTINATION-001-A, UI-001-C | Features destinations search sheet/selection/clear and map emphasis. 03–04. | Rapid changes reject stale results; map visible; unrelated activity retained; clear restores general browsing. | M / search/sheet integration | Paused (2026-11-07): implemented, native check pending. `src/features/destinations/`: `DestinationSheet` (03: "Where to?", curated search through `usePlaceSearch`, the curated-demo note; a row sets the destination and tracks `destination_selected`), `DestinationPanel` (02 invitation "Choose a destination"; 04 destination name, "Excellent match nearby" and "Inspect highlighted ride"/"group", none or checking, Change and Clear) and `summarizeDestination`, `matches.ts` (`indexMatches`, `bestMatch`, `matchLabel`). `useNearbyDiscovery(region, destinationPlaceId)` reads with the destination and exposes `matches` only for a snapshot read for the current destination. Markers: matched outlined with the level in the accessible name, excellent filled lime, unrelated faded but kept; clusters count matches; list rows and the preview badge name the level. `PlaceSearchResults` extracted from the pickup sheet and shared. The camera never moves for a destination. Not done: "Create my ride request" (RIDE-001), the arrival animation. 432 mobile tests |

### Requests and groups

Documentation: api/rides.md, api/groups.md, PRODUCT.md, scenarios C–G and unknown-outcome behavior. Reuse operation receipts and confirmation UI. Group readiness screens initially use supplied points; MEETING-001 adds their full inspection.

| ID | Prerequisites | Goal, screens, expected modules and reuse | Observable acceptance and checks | Size / uncertainty | Status |
| --- | --- | --- | --- | --- | --- |
| RIDE-001-A | DESTINATION-001, AUTH-001 | Mock ride create/current/cancel/expiry operations. | One live request; same-key original result; changed-input conflict; grouped cancel rejected; private origins protected. | M / receipts/deadlines | Completed (2026-11-07): `src/data/mock/rides.ts` (`createRide`, `readOwnRequest`, `cancelRide`, `publicAreaFor`) through the simulator's receipts, in the contract's error order; `toOwnRideRequestDto`; `authenticate`/`viewerOf` extracted in `auth.ts`; expiry through the existing `expireRide`; discovery and nearby subscriptions leave out the viewer's own request and groups; `user` subscriptions accepted for a signed-in rider. Started at the user's request while DESTINATION-001-B's native check is pending. 444 mobile tests |
| RIDE-001-B | RIDE-001-A | Features rides draft/departure/final confirmation; existing auth gate. 06, 09. | Now/+5/+10; valid origin; preserved draft; repeated presses create once; useful existing-request continuation. | S / draft restoration | Planned |
| RIDE-001-C | RIDE-001-B | Features rides active card/countdown/cancel/expiry. 10, 27–28. | Foreground/background expiry removes invalid actions; cancellation uses canonical success; explicit create-again. | S / timing boundaries | Planned |
| RIDE-001-D | RIDE-001-C | Mock match scenario and Features rides match/unknown-create recovery. 11, 30. | Scenario C one valid supplied match; expired match removed; lost acknowledgement does not duplicate creation. | M / uncertain outcome | Planned |
| GROUP-001-A | MOCK-001, RIDE-001-A | Mock atomic solo/group join operations, reused receipt mechanism. | Simultaneous first joins one group; last-seat race one winner; max four; rejected join preserves own request. | M / concurrency | Planned |
| GROUP-001-B | GROUP-001-A | Mock leave/coordinator transfer. | Immediate revocation; survivor/under-two rules; leaver request cancelled; repeated leave idempotent. | S / membership effects | Planned |
| GROUP-001-C | GROUP-001-B | Mock ready/reopen/complete/cancel/expiry/terminal access. | Role/version/prerequisites; grouped deadline; one-hour retention; no taxi-induced transition. | M / lifecycle matrix | Planned |
| GROUP-002-A | GROUP-001, RIDE-001 | Features groups join confirmation/conflict recovery; existing routes/gate. 12, 29–30, 55. | Revalidate target; no optimistic membership; full/closed/expired/unavailable/unknown outcomes reconcile (a join has no version check since CONTRACT-003-A); own request preserved. | M / partial sequence | Planned |
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
| pnpm test:contracts | Vitest contract suites against the source, no build needed; extra arguments filter files (added by CONTRACT-001-A). |
| pnpm test | Workspace test tasks: contracts and mobile since CONTRACT-001-A. |
| pnpm doctor:mobile | Expo/config checks; plain pnpm doctor is a different command. |
| pnpm export:android / pnpm export:ios | JavaScript export; not native verification. |
| pnpm mobile:android / pnpm mobile:ios | Local development builds; follow TOOLCHAIN native setup. |
| git diff --check | Whitespace/error check. |

Not yet available: pnpm test:e2e, Maestro flows. Their owning cards add real tooling; never add success-only placeholders.

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
| Android map provider configuration/restricted credential | Native Android map verification | MAP-001-A reads `GOOGLE_MAPS_ANDROID_API_KEY` from the ignored `.env.local` or the shell into the Android manifest; without it Android shows a notice instead of the map. Open: the user creates the key and restricts it to `com.ridematch.dev`, the signing SHA-1 and Maps SDK for Android ([DEVELOPMENT](DEVELOPMENT.md#configuration)). No credentials in docs/logs. |
| Point changes while group is ready | Final group/meeting semantics | Resolved in CONTRACT-003-A (2026-11-01): the recommendation was adopted. A changed or withdrawn point returns a ready group to forming, and the coordinator marks it ready again; see [groups](api/groups.md#state-machine). |
| Supported Yandex link/fallback formats and test availability | TAXI-001 completion | Verify official provider formats and installed/absent native paths in taxi cards. |

### Reasonable assumptions

- Along is provisional; no trademark/availability claim or release-identifier change.
- Local construction sources/SVGs take priority over the unverified remote copy.
- Keep current map/provider architecture and native responsive layout.
- Bundle static Manrope/license; curated destination data remains synthetic.
- Report categories follow the four illustrated choices.
- OTP timing, report-detail bounds, location freshness/accuracy limits and analytics thresholds are documented mock policies with boundary tests. CONTRACT-001-B chose the location limits and CONTRACT-001-C the OTP and token values. Relevant contract/operation cards must choose explicit values before coding against them; they do not imply production policy.
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
