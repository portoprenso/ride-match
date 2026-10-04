# Along mobile MVP design concept

Created 2026-10-03 by Codex for the user's full-MVP design request.

**Delivery status: partial in Figma; complete local screen inventory.** The connected Figma Starter plan reached its MCP tool-call limit. This is a design proposal, not implemented application functionality or a completed implementation sprint.

**Continuation check, 2026-10-03:** Figma account inspection succeeded, but a read-only canvas call was still rejected by the Starter MCP limit. The open browser tab showed the file in signed-out viewing mode. No remote edits were made during the retry; the saved native inventory below was not freshly verified. No reset time was supplied.

**Local plugin route, updated 2026-10-04:** The offline [Figma importer](plugin/README.md) and [ZIP](along-figma-importer.zip) are build **1.0.1**. It fixes duplicate flow IDs, removes owned parent containers during rollback and forgets pruned sample-section IDs. Local regressions pass for six-screen sampling and 55 screens/192 links. The user reported failure with the previous native build and chose to test this update themselves. Along is now open in desktop; native verification of the repaired build and visual/prototype acceptance remain pending. MCP availability is no longer the only continuation path.

- [Figma draft](https://www.figma.com/design/y6N9BYkaqf4gOZlBUiJfvA): three pages, provisional brand/kit, and 20 native editable journey screens in the saved MCP inventory. The states page's layer list appeared empty after the user's failed plugin run; exact native inventory needs verification after retry.
- [Local review](index.html): all 55 screens, with links between illustrated states. Open in a browser yourself. Inputs, timers, OS prompts and taxi actions are representations, not working integrations.
- [Editable SVG package](along-editable-screens.zip): 55 individual screens and a brand sheet. SVGs retain text and vector shapes; import fidelity has not been tested in Figma. They do not carry Figma component links, variables or reactions.
- [Screen inventory](screen-index.json), [layout report](layout-report.json), [brand preview](brand.png), and review panels `review-01.png` through `review-51.png` in increments of five.

## Direction

**Along** is the selected placeholder; **Wayly** and **Sameway** are alternative name/icon sketches. These are creative placeholders, with no availability/trademark research. Two merging paths form the Along symbol.

Deep teal `#123C38`, supporting teal `#146B59`, lime `#DDF5A0`, warm white `#F7F8F2`; Manrope in Figma. Local SVGs use Arial for reproducible measurements; HTML uses Manrope when installed, then Avenir Next/Arial. Local rendering is therefore not evidence of exact Figma typography.

390 × 844 base viewport, 24-point side margins, 52-point action buttons, 16-point control corners and 32-point sheets. Native implementations must use real safe-area insets, keyboards, permission dialogs and scalable text.

## Coverage

| Screens | Scope |
| --- | --- |
| 01–05 | Introduction/location explanation, anonymous map, destination search, compatibility, public ride preview |
| 06–10 | Departure, simulated phone/OTP, preserved draft confirmation, active search |
| 11–15 | Match, joining, group forming, temporary chat, member-only meeting point |
| 16–20 | Ready group, reviewed taxi handoff, completion, public group preview, accessible nearby list |
| 21–30 | Denied location/manual pickup, empty/error/stale/tiles, expiry, cancel, full group, uncertain mutation outcome |
| 31–40 | Session expiry, coordinator/full/waiting/reopened groups, leave, closed chat, access revocation, taxi fallback, notifications, settings |
| 41–50 | Report/receipt, block-and-leave/unblock, failed chat, old notification, invalid code, sign-out, coordinator readiness, demo controls |
| 51–55 | Coordinator cancellation, failed report, discovery clusters, loading, disappeared target |

Keep public approximate locations separate from private input and member-only meeting points. Groups contain at most four single-seat members. Full is distinct from ready; the coordinator explicitly marks readiness. A taxi handoff never proves booking or completion. Empty states do not invent riders. All people/messages/receipts are synthetic.

The prototype is a storyboard, not a state machine: links can jump to example outcomes. Main Figma page has 73 native navigation links; cross-page links and native OS actions are intentionally not claimed to work. In particular, readiness on returning from the meeting-point example represents a coordinator update. Runtime behavior remains governed by [PRODUCT.md](../../PRODUCT.md) and [group contracts](../../api/groups.md).

## Native Figma continuation

The authoritative remote IDs are in [source/state.json](source/state.json). Do not rerun creation scripts over populated pages.

**Preferred route:** Follow [plugin/README.md](plugin/README.md). Run and review the six-screen sample, remove it using the plugin, then import and inspect the full design on the empty states page. Save the native import report and update the remote ledger with the actual results. A local test-double pass is not native Figma verification.

The steps below describe the older MCP route, if that access becomes available instead:

1. Restore Figma MCP availability, reread the Figma skills, and inspect the current file. The quota response did not provide a reset time.
2. Review the post-fix kit and journey. Horizontal rows were repaired remotely, but fresh screenshots were blocked. Local sources additionally correct sheet bottoms, remove the location dot from the base map, and remove the premature own-request marker on screen 04; those corrections are **not yet applied remotely**.
3. Apply those targeted changes to existing IDs; keep frames top-level for prototype navigation. Main screen sheets should end above the bottom indicator. The map dot belongs in location-available screens, never denied/manual-location views.
4. Confirm the states page `2:3` is empty. Combine `const S = <state JSON>`, [helpers.js](source/helpers.js), and [states.js](source/states.js) inside a single `use_figma` call for that page. The script rejects an occupied page. Save returned IDs.
5. Review all newly created screens and controls, check font families and bounds, and verify prototype journeys. Do not claim cross-page navigation or backend behavior. Update this handoff and mark DESIGN-001 complete only after the requested Figma deliverable passes.

Scripts are construction snippets with top-level await/return, not app modules. Helper comments explain the drawing boundary. [kit.js](source/kit.js) and [journey.js](source/journey.js) preserve the intended revised design for reference, not permission to replace the existing content.

## Local verification and reproduction

The local fallback uses an in-memory drawing adapter and native Canvas/Sharp rendering, with no browser/server or dependency installation. Obtain bundled dependency paths with `load_workspace_dependencies`, then run:

```sh
ALONG_NODE_MODULES=/absolute/path/to/bundled/node_modules node docs/design/along/source/render.cjs
```

The exporter currently expects macOS system Arial fonts. [render.cjs](source/render.cjs) produces the HTML and screen index; [export-svg.cjs](source/export-svg.cjs) produces SVGs and checks the body/sheet bounds against footer/safe-area space. This is a focused layout check, not an exhaustive accessibility or platform audit.

Verified: 55 SVG files parse; generation scripts parse; local screen targets resolve; all 11 static review panels and brand sheet were inspected; local body/sheet bounds report zero warnings. Browser interaction testing was not completed: the in-app browser refused local `file:` navigation, and no workaround was attempted. Native Figma final visual/prototype verification is blocked by its quota. No application tests/builds were run because application code was not changed.
