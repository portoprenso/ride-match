# Along — local Figma importer

Build **1.0.1** (2026-10-04): fixes duplicate prototype starting points and nested-layer cleanup failures.

This package builds the prepared mobile MVP concept as native Figma nodes using the standard Plugin API. It does not use MCP, a conversion service, API keys, a server, or external dependencies. The manifest denies all network access.

## Run it

1. In **Figma desktop**, open the [Along design](https://www.figma.com/design/y6N9BYkaqf4gOZlBUiJfvA) with editing access. Select the empty **02 · States & safety** page for a clean canvas. The importer also works beside existing content on another page.
2. Open **Plugins → Development → Import plugin from manifest…** and choose `manifest.json` from this folder. Keep `code.js` and `ui.html` beside it. No build command or coding is needed.
3. Run **Along · Mobile MVP importer** from **Plugins → Development**.
4. Click **Import 6-screen sample**. Review welcome, map, group, taxi handoff, denied location, and settings using the screen selector and **Show screen**.
5. Use **Remove this sample** without closing the plugin. Then click **Import all 55 screens**.
6. Review the result and use **Save import report**. The report includes screen IDs, font checks, geometry warnings, component/node counts, and prototype-link totals.

The standard import workflow is [documented by Figma](https://help.figma.com/hc/en-us/articles/360042786733-Create-a-classic-plugin-for-development). The descriptive development ID follows [Figma's own sample manifest convention](https://github.com/figma/plugin-samples/blob/main/barchart/manifest.json); it is not a published Community plugin ID.

## What it creates

- Provisional Along brand and alternative name sketches.
- 40 color/spacing/radius variables, eight Manrope text styles, 17 components in the existing kit structure.
- 55 native mobile frames, 390 × 844, with editable text and vector artwork.
- 192 navigation actions, including journey-to-safety/recovery links, and three prototype entry points.

All screens are top-level frames on the current page so prototype links can connect them. Brand, journey and states occupy separate columns. The importer adds no pages and preserves the existing 20-screen draft, styles, variables, and prototype flows. It creates independent foundations for the revised copy rather than altering the original draft's shared components.

This is an illustrated storyboard. Form input, timers, OS prompts, taxi booking, and application services are not implemented. Data is synthetic. Manrope is required; missing fonts stop the import before writes instead of silently substituting fonts.

## Recovery and verification

- If you saw `Found duplicate input nodeIds` followed by `Removing this node is not allowed`, close the old plugin window and reopen build **1.0.1**. The header shows the build number. If you imported the manifest from this repository, its files are already updated; if you extracted the ZIP elsewhere, replace that extracted folder with the updated package or import this repository's manifest.
- First retry the six-screen sample. The older rollback can report child-removal errors even when later parent removal cleared the canvas; the error alone does not prove nodes remain. If the importer reports an existing import, inspect it before deleting anything. Undo only if the failed import is the latest document action and no later work would be undone. Never clear the entire page or remove unrelated foundations.
- Duplicate imports are refused using the exact version/mode foundation name. The plugin does not delete an existing import by matching a name.
- Prototype registration replaces automatically created entry points only on this invocation's nodes and merges by node ID. Existing unrelated flow names and order are preserved.
- A failed construction attempts to remove only owned parent containers (including orphaned construction nodes) and exact style/collection IDs. Descendants are removed with their parents, avoiding constrained-child deletion. Pruned sample sections and their children are removed from the ownership ledger so cleanup cannot attempt to delete them again. Cleanup failures are reported.
- **Remove this sample** is available only for a sample created in the current plugin session. If you close the plugin, use Figma Undo or remove the sample deliberately; rerunning cannot silently replace it.
- A successful import creates an undo boundary. Keep the plugin open while reviewing and downloading the report.
- Map sheets move upward if needed to respect the bottom safe area. Content/footer collisions are reported and still require repair and visual review.
- The report's structural pass is not a visual acceptance result. Check native typography, clipping, sheet placement, and the prototype before accepting the design.

**Current verification:** the user ran the previous build in Figma desktop and reported the errors above. Updated regression checks reproduce the duplicate error with the old code and pass with build 1.0.1, including sample cleanup, removal of stale ledger entries and failure after prototype wiring. Native verification of the repaired build is still pending: Along is now open, but the native manifest picker did not accept automated path entry. The user chose to test the updated package themselves. No native rendering or prototype acceptance is claimed.

## Maintainer commands

```sh
node docs/design/along/plugin/build.cjs
node docs/design/along/plugin/check.cjs
node --check docs/design/along/plugin/code.js
```

`build.cjs` embeds `../source/helpers.js`, `kit.js`, `journey.js`, and `states.js`, adapting the MCP-only auto-layout helper, placeholder fields and page-specific navigation to the standard Plugin API. It fails if expected source anchors have changed. Edit the sources or `runtime.js`, then rebuild; do not hand-edit generated `code.js`.

`check.cjs` uses a deliberately limited API double to exercise six-screen sampling, parent-container cleanup with constrained children, 55-screen/192-link coverage, automatic flow creation and duplicate-ID rejection, preservation of user nodes/renamed flows, duplicate-import refusal, missing-font preflight, early/late failure rollback and retry. It does not simulate native text measurement or Figma layout. No app dependencies or runtime code are changed.
