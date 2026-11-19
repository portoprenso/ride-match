# Consolidated native verification report

Updated: 2026-11-20 (Asia/Bishkek). Actor: Codex / verify-005-final-native-pass.

**VERIFY-005 is Paused; ownership released at the user's request. VERIFY-006 and VERIFY-007 are Completed.** This report consolidates the November 9, 19 and 20 evidence; it does not mark all twenty implementation cards complete. No further native run is authorized by this report. Historical evidence is identified below; a passing test is not evidence for every variant on that screen.

## Changes delivered

- **VERIFY-007, Codex:** `DiscoveryMarkers.tsx` uses compact numeric cluster badges: minimum 32 × 40 points, 4-point horizontal padding. Counts, clustering, accessible descriptions, match outlines and camera behavior remain intact. `nearbyMap.test.tsx` covers the presentation. Native density, pan/zoom, destination select/clear and shared-area list passed on iOS at normal/XXXL text and Android at normal/150%/200%.
- **VERIFY-005 continuation, Codex:** fixed the Demo presentation clock. Advancing mock time previously expired source access while cached closed-chat history stayed on screen against device time. `DevControlsProvider.tsx` now exposes the read-only `useDemoTimeAhead`; `useClock.ts` applies that offset to presentation deadlines. Builds without controls use device time. No device-clock modification or direct simulator import. Useful TSDoc was added/updated on both hooks.
- `chatScreen.test.tsx` adds a regression which advances Demo time past closure and retention without advancing device time by an hour. It failed before the fix and passed after it. The final iOS client also passed closure and private-history expiry; **Android native confirmation of this final fix was not completed**.
- **Earlier work, Claude Code:** VERIFY-005 fixed map recenter/readback, cluster zoom, keyboard field visibility, Android discovery feedback loop, pre-ready map padding and interrupted camera moves. VERIFY-006 fixed ghost/default pins and the disappearing own marker by remounting the reattached Android map. These are prior delivered fixes, not new changes in this continuation.
- No backend, contracts, dependencies, environment files or production integrations were added. No Git commands, staging, commits or remote operations were performed by Codex in these continuations.

## What has native evidence

| Area | iOS | Android |
| --- | --- | --- |
| Discovery, markers, list, previews, destination emphasis | Core paths passed November 9; density variants passed November 19 | Core paths passed November 9 after fixes; density variants passed November 19 |
| Request draft, named pickup, publish, countdown, keep/cancel, Demo expiry | Passed November 9 | Passed November 9/19, including natural foreground expiry and accelerated expiry followed by background/resume |
| Match, Aida join, group/home card, meeting point and leave | Core paths passed November 9; includes anonymous sign-in → draft → join and match dismissal | Match/review, confirmation/back, 2/4 group and leave passed November 19; meeting-point map passed November 9 |
| Keyboard and ordinary chat | Passed November 9 | Full Gboard keyboard, multiline composer/counter/Send, send and reply passed November 19 |
| Chat failure/recovery | Final focused XCTest passed: lost acknowledgement, duplicate-event retry, offline failure, online without automatic sending, explicit retry | Lost acknowledgement reconciled to the stored message; a separate offline message stayed unsent after reconnect and explicit retry produced one message |
| Long history and scroll anchoring | More than 60 entries, all older pages loaded; visible older-message position held after a new reply | Not run natively |
| Closure and retention after Demo advance | Final-code XCTest passed: read-only after closure, then Chat unavailable beyond retention | Read-only closure passed; observed retention defect led to the fix, but final-code native rerun did not complete |
| Report/block/unblock | Earlier keyboard/report evidence; latest XCTest passed confirmation/back, receipt → block-and-leave, absent group card, blocked list and unblock | Earlier report/receipt passed; latest block confirmation/back and unknown-outcome error passed. Successful retry, leave and unblock were not completed |
| Map-centre picker | Earlier point/name/pin evidence; latest open, drag, confirm and named-place/back test passed | Not completed |
| Notifications | Earlier native module, startup, permission allow, foreground delivery and warm/cold entry evidence | Earlier permission prompt and warm/cold entry evidence |
| Taxi handoff | Earlier external website/store handoff and return to still-ready group passed | Earlier browser handoff and return passed |

Latest environments: iPhone 17 Pro / iOS 26.5; Pixel 10 Pro XL / Android 17 API 37.2. Earlier Android evidence used Pixel 9 Pro XL / Android 16.

## Remaining work — do not restart completed paths

### Known defects and observations

1. **UI-001-A:** Android heading/line-height clipping at enlarged text is an existing deferred defect. Compact density badges passed, but that does not close typography across other screens.
2. Earlier minor observations remain untriaged on final files: Aida can fade in the join confirmation, destination copy can say no nearby matches while the own-request match is highlighted, and some list/inspect camera moves show a wider area than intended. These are historical observations, not newly reproduced failures.
3. No additional confirmed product failure remains from this continuation beyond the fixed Demo-clock defect. Incomplete checks below are verification gaps, not asserted bugs.

### Missing native evidence

| Combined pass | Still required |
| --- | --- |
| Request → match → group | Both platforms: TSUM join to 4/4, unknown-create and unknown-join recovery, match clock expiry. Android: explicit match dismissal and own-match map redraw/emphasis. Also retain iOS airport/disappeared-preview and signed-out group-link variants from the earlier log. Lost acknowledgement after commit is covered by automated tests; generic Demo No answer alone does not prove that variant. |
| Group → chat → safety | Android: final Demo-clock fix, long-history pagination and scroll anchoring; finish successful block retry, leave, block list/unblock and verify access stays revoked. Both: report failure/retry/edit preservation, message-context report/block and dismissal while sending/blocking where not already evidenced. Coordinator transitions and last-seat races currently have automated evidence only; scenario D is future QA work. |
| Map → pickup → location | Android: picker and real network-off tile notices on home/picker. Both: fresh precise current-location pickup, remaining enlarged-text sheets. iOS: stale grey dot and foreground/background location refresh. iOS mid-drag copy was not captured. |
| Background → notifications | True request deadline crossed during suspension: iOS request was prepared and backgrounded, but the resume assertion never ran; Android previously passed only the accelerated-clock/resume variant. Both: notification deny/settings recovery, account switch, repeat taps without stacking, ready/joined notifications and expired/left-group targets. |

The temporary iOS tests for resume, unknown creation and TSUM join were written but **not executed**. Android cold-reload attempts ended at intro/stale UI-tree controls; these do not establish a product failure. Earlier mixed XCTest bundles contain harness failures even where individual safety/picker cases passed; they must not be described as entirely green. The final focused chat recovery, history-anchor and clock bundles passed.

### Environment limits and explicitly deferred checks

- Mock push uses foreground JS timers; true suspended/lock-screen push delivery is not implemented. Production remote push belongs to the backend/transport milestone.
- Installed Yandex Go with route prefilled requires a device with that app. OS refusal/fallback was not reproduced natively; automated boundary tests cover failure outcomes.
- TalkBack/VoiceOver remain explicitly waived until final physical-device testing. Android OTP paste is still not verified; native input automation is not clipboard-paste evidence.
- Simulator location accuracy/permission conditions prevented a proven fresh precise pickup; this is distinct from the manual/named pickup paths which passed.

### Planned product work after this verification

Priority changed on 2026-11-20: [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) permits backend foundation work before this frontend backlog is complete. The items below remain unfinished final-audit work, not backend-start prerequisites.

- **QA-001-A:** remaining mock scenarios A–N and integrated reset/timer/listener/cache checks.
- **QA-001-B:** repository Maestro flows and real `test:e2e` wrapper; temporary native drivers are not that suite.
- **QA-001-C/D:** planned full Android/iOS visual and native audit, reusing accepted evidence where final code permits.
- **HANDOFF-001-A:** contracts/operations/API/event/privacy reconciliation after QA. Backend and HTTP/Socket.IO implementation remain outside the current milestone.

## Automated results already obtained

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed; 3 successful Turbo tasks, 2 cached |
| `pnpm lint` | Passed; 3 successful Turbo tasks, 2 cached |
| `pnpm test:mobile --runInBand --testTimeout=15000` | Passed on final source: 51 suites, 656 tests |
| `pnpm test:contracts` | Passed: 14 files, 860 tests; contracts untouched by the UI-clock fix |

The mobile run explicitly used a 15-second test timeout under native CPU load; this is not a claim that the latest default 5-second run passed. No new app build, export, doctor, Maestro or performance benchmark was run for the JS-only clock change. This consolidation reread existing files/logs and did not rerun application checks.

Evidence is summarized here so future work does not depend on temporary artifacts. Original native screenshots/XCTest bundles and test logs currently remain under `/private/tmp/ride-match-verify005-final/`; earlier Android evidence is under `/private/tmp/ride-match-verify005-android/` and density evidence under `/private/tmp/ride-match-verify007-native/`.

## Cleanup and next-run rule

At the user's request, Metro, the native driver, Android emulator, iOS simulator/GUI, ADB and this task's UI automation workers were stopped. Port 8081 was confirmed free. Android keyboard setting was restored to 0 and font scale confirmed 1.0. Simulator/app data and temporary evidence were not erased; the temporary XCTest runner may remain installed but is not running.

If explicitly asked to resume, build a single matrix from the missing-evidence table, group checks across one journey/screen, and run independent platform/scenario work in parallel where safe. Reuse accepted results; rerun affected behavior after a fix and reserve a broad regression for the final state. This report does not authorize restarting checks.
