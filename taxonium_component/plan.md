Read `AGENTS.md` before starting work.

This file is the authoritative record of project state, priorities, decisions, and handoff context.

Work only on the Current Task unless the user explicitly requests a different task. If the requested work differs, update Current Task before modifying code.

Do not automatically begin Next Task or other backlog items.

# Current Status

**Phase:** Visualisation improvements
**Status:** VIS-01 complete. META-01–04 remain complete.

The Layout control switches between standard and downward trees, with horizontal metadata rows and left-to-right sample order. The URL retains the preference; Treenome temporarily uses standard layout. Shared colours, selection/table scope, canonical navigation, density processing and exports are preserved. Metadata labels and overlays adapt to orientation and available space.

Type checking, 53 tests across 16 files, component/website production builds and browser validation pass. The small fixture covers desktop/mobile interaction, minimap, search, exports and reload; the 2,399,238-tip compressed fixture covers density rendering and repeated orientation changes. Existing build warnings remain. No VIS-01 blockers.

# Current Task

## VIS-01 — Rotated tree and metadata layout

Completed the approved downward layout, preserving top-to-bottom tip order left-to-right. Standard layout remains the default; Treenome temporarily overrides the URL-backed preference.

### Checklist

- [x] Add shared orientation, camera and viewport transforms with URL-backed controls.
- [x] Align tree, metadata, labels, hover, minimap and navigation in both layouts.
- [x] Preserve SVG/PNG exports and existing backend/metadata contracts.
- [x] Add regression coverage; validate types, tests, builds and both real fixtures.
- [x] Record decisions, validation, status and handoff.

# Next Task

## COMP-01 — Geographic map

Plan COMP-01 after VIS-01. Do not automatically start it.

---

# Project

## Goal

Extend the metadata and visualisation capabilities of Taxonium in this fork.

The primary objectives are:

- Improved metadata typing and colour management.
- Tabular exploration of metadata.
- Better handling of categorical metadata legends.
- Alternative tree and metadata orientation.
- Geographic visualisation of samples.
- Spatial visualisation using coordinates supplied in `.dot` files.

## Scope

Primary target:

- `taxonium_component/`

Supporting application:

- `taxonium_website/`

Most implementation work should occur in `taxonium_component/`. The website is needed for integration testing and interactive validation.

Test fixtures (paths relative to `taxonium_component/`):

| Tree and metadata | Tips | Coverage |
| --- | ---: | --- |
| `../tree_small.nwk` + `../metadata_small.csv` | 1,508 | Routine browser checks; `Cluster__autocolour`, `BAPS1__autocolour`, `BAPS2__autocolour` |
| `../ATB_tree_batch2_cleaned.nwk.gz` + `../has_capsule_all.csv.gz` | 2,399,238 (verified) | Compressed uploads and large-tree performance; taxonomy, capsule flags and capsule counts |

Both compressed paths are local symlinks resolving to available files. The large tree has 2,399,238 tips, independently checked against Newick delimiters and the importer. Its CSV contains 2,393,274 nonempty metadata records (2,393,275 lines including its header); this corrects the original fixture description. Missing metadata continues to use the shared missing-value behavior. Numeric-looking CSV strings remain categorical unless overridden; use Numeric for `n_capsule_systems` coverage. META-04 includes large-tree testing; earlier manual-only exclusions below describe historical META-02/03 scope.

Avoid unrelated changes to other packages unless required by the Current Task.

# Engineering Principles

In priority order:

1. Correctness and consistency across visualisations.
2. Interactive performance and responsiveness.
3. Reuse of existing application state and components.
4. Readability and maintainability.
5. Memory efficiency for large datasets.

Taxonium may handle large phylogenetic trees and associated metadata. Avoid unnecessary copies of sample-level data, repeated metadata processing, and expensive operations during rendering.

## Shared State Requirements

Where possible, the application should maintain consistent sources of truth for:

- Sample identifiers and selected samples.
- Metadata columns and their types.
- Active metadata used for colouring.
- Colour assignments and legends.
- Filtering and visibility state.

New visualisation components should consume existing shared state rather than independently reconstructing it.

The distinction between selected samples and visible/filtered samples must be established from the existing application behaviour before implementing linked views.

---

# Development and Validation

## Environment

Use `npm` for all dependency management and scripts.

If needed, configure the Node.js heap limit before building:

`export NODE_OPTIONS='--max-old-space-size=100000'`

This setting applies to the current shell session. Use it only where the memory requirement is justified.

## Component

From `taxonium_component/`:

1. Run `npm install` if dependencies are missing or require updating.
2. Run `npm run check-types`.
3. Run `npm run build`.
4. Run relevant existing tests, where available.

## Website

From `taxonium_website/`:

1. Run `npm install` if needed.
2. Run `npm run dev` for interactive testing.
3. Verify the feature in the browser.

`npm run dev` starts the development server; it does not by itself establish that a feature works.

Run additional type-check, test, or production-build scripts if available and relevant.

## Validation Requirements

For each completed feature:

- Relevant type checking should pass.
- Relevant builds should succeed.
- Existing tests should continue to pass.
- New behaviour should be tested where practical.
- Interactive features should be checked in the browser.
- Existing metadata and tree functionality should remain intact.

Record validation commands, outcomes, and known limitations in the Session Log.

---

# Backlog

Backlog items are not automatically authorised for implementation.

Move an item into Current Task before beginning work.

## Metadata Improvements

### META-01 — Metadata types and categorical colours

Allow each metadata column to be explicitly classified as numeric or categorical.

Requirements:

- User-selectable column type.
- Continuous colour mapping for numeric data.
- Randomised but stable category colour assignment.
- User-controlled reshuffling of categorical colours.
- Consistent colour assignments across all visualisations.
- Appropriate handling of missing values and many categories.

### META-02 — Metadata table

**Dependency:** Shared sample selection and metadata state.

Add a metadata table in a panel at the bottom of the application.

Requirements:

- Display sample identifiers and metadata values.
- When samples are selected, restrict the table to the corresponding samples.
- Return to the appropriate unselected view when the selection is cleared.
- Support a large number of metadata columns.
- Avoid rendering the entire table unnecessarily for large datasets.
- Keep table state consistent with the tree.

Investigate whether an existing table component or virtualisation mechanism can be reused.

### META-03 — Expandable metadata legend/key

**Dependency:** META-01.

Improve the metadata legend for columns containing many categories.

Requirements:

- Do not permanently truncate categories with an ellipsis.
- Allow the legend to expand to show all categories.
- Use scrolling or another suitable mechanism when the legend becomes large.
- Preserve the correct category-to-colour mapping.
- Avoid obscuring the main tree visualisation unnecessarily.

### META-04 — Further metadata tweaks

**Dependency:** META-01.

Improve the metadata interaction experience for the user, and include
testing of large trees.

Requirements:

- When zooming with the controls, the display moves to the top left corner, so the tree
  disappears without panning. The zoom should centre on the current
  position.
- Remove the 'replace custom colours' disclaimer text throughout. Retain existing
  manual colour editing, as clarified in the approved META-04 plan.
- Add a hover tooltip over the metadata bars, which displays the label
  associated with the hovered colour.
- Create a drop-down box for the metadata matrix controls, including the
  width, colours and order, so the user can hide the controls.
- Make the height of the boxes for the colour categories match the size
  of the colour by selection box.
- Larger trees now take a long time to render metadata columns, so the
  link between server-side preprocessing at each zoom level and the
  client side display has been lost. Restore this processing, so that
  metadata columns are displayed reactively.

---

# Visualisation Improvements

### VIS-01 — Rotated tree and metadata layout

Support a layout rotated 90 degrees clockwise.

Requirements:

- Tree displayed horizontally across the top of the page.
- Tree tips directed downwards.
- Metadata bars displayed horizontally below the tree.
- Correct alignment between tree tips and metadata.
- Existing selection and interaction behaviour preserved.
- Labels, axes, and tooltips positioned appropriately.
- User control to switch between standard and rotated layouts.

Investigate the rendering architecture before deciding whether to rotate existing geometry or implement an alternative layout calculation.

Avoid duplicating the entire rendering pipeline.

---

# New Components

### COMP-01 — Geographic map

**Dependencies:** Shared metadata colours and sample selection.

Add a geographic map using MapLibre.

Detect geographic metadata columns using conventional names:

- `latitude` and `longitude`
- `lat` and `lon`

Requirements:

- Detect coordinate columns where available.
- Validate or safely ignore missing and invalid coordinates.
- Display samples as points at their geographic positions.
- Colour points according to the active metadata and shared colour mapping.
- Subset displayed points according to selected samples.
- Update when the active metadata or colour assignment changes.
- Support appropriate zooming and panning.
- Remain responsive for large sample counts. This will require prerender
  on the backend component, and possibly aggregation of points when
  zoomed out.

Design considerations:

- Reuse existing selection state.
- Avoid independent metadata colour logic.
- Investigate efficient MapLibre layers and rendering strategies.
- Consider point overlap and dense geographic sampling.
- Record any map tile provider, network dependency, or attribution requirements.

### COMP-02 — `.dot` spatial visualisation

**Dependencies:** Shared metadata colours and sample selection.

Add a component to display samples using coordinates supplied in a `.dot` file.

Requirements:

- Load or consume a `.dot` file containing pre-supplied coordinates.
- Associate graph nodes with Taxonium samples.
- Display sample points at the supplied coordinates.
- Use the current metadata colour mapping.
- Subset displayed samples according to selection.
- Update when metadata colouring or selection changes.
- Support zooming and panning where appropriate.
- Handle missing coordinates or unmatched sample identifiers gracefully.

Design considerations:

- Inspect the expected `.dot` format before implementation.
- Determine how node identifiers correspond to sample identifiers.
- Do not compute a graph layout if usable coordinates are already provided.
- Prefer efficient rendering for large numbers of points.
- Reuse existing visualisation infrastructure where possible.

---

# Definition of Done

## Current Task

A task is complete when:

- [x] The Current Task checklist is complete.
- [x] The feature works as specified.
- [x] Existing relevant functionality remains intact.
- [x] Relevant type checks have been run and pass, or outstanding errors are explicitly documented.
- [x] Relevant builds succeed.
- [x] Existing and newly added tests pass.
- [x] Interactive behaviour has been verified where appropriate.
- [x] Significant implementation decisions are recorded in Design Notes.
- [x] Blockers and unresolved issues are recorded.
- [x] Current Status accurately reflects the repository.
- [x] Session Log records the work performed and validation results.
- [x] Next Task provides a clear handoff.

## Project

The project is complete when:

- [x] Metadata typing and categorical colour management are implemented.
- [x] Metadata table is implemented.
- [x] Metadata legend supports large numbers of categories.
- [x] Metadata interaction and large-tree density rendering improvements are implemented.
- [x] Rotated tree and metadata layout is implemented.
- [ ] Geographic MapLibre component is implemented.
- [ ] `.dot` spatial visualisation is implemented.
- [ ] All relevant validation passes.
- [ ] Cross-component selection and colouring are consistent.
- [ ] `plan.md` reflects the final implementation state.

---

# Design Notes

## 2026-10-22 — VIS-01 rendering and interaction findings

**Decision:** Supply canonical viewport dimensions to the existing query and metadata code; swap layer model matrices and display cameras only. Density remains sampled along canonical Y, which becomes screen X. SVG applies the same swap and an affine density-image transform with viewport clipping.

**Browser findings:** Existing bottom overlays obscured rotated metadata, so controls and legend move above the metadata viewport and are bounded on short/narrow screens. A transparent Deck-generated `view-main` wrapper intercepted actual pointer clicks. Move the passive metadata header outside DeckGL and remove its empty main View child; retain the interactive Treenome View. This restores canvas hit testing without accepting control-overlay events as tree clicks. The screenshot dialog also needs explicit positioning/z-index on its portal root (the scoped utility classes do not style that root); otherwise the relocated toolbar covers its format buttons. This is confined to the export dialog.

## 2026-10-22 — VIS-01 approved design

**Decision:** Keep canonical tree coordinates/camera and reuse rendering layers with a shared axis swap. Downward tips retain top-to-bottom order left-to-right, intentionally differing from literal clockwise rotation. Store `treeLayout=standard|rotated` in the URL; Treenome uses standard layout without changing the saved preference. Keep centre and canonical axis zoom on switching. Reuse metadata column width as rotated row thickness, existing colours, selection and aggregation. Convert viewport dimensions and screen interactions at the presentation boundary; backend contracts remain unchanged. Validate exports, small-fixture interaction and large-fixture rendering; the separate META-02 table-index check remains deferred.


## 2026-10-21 — META-04 tooltip placement

**Decision:** Apply positioning through Deck's existing tooltip style interface, shared by individual-cell and aggregate tooltips. Anchor the tooltip 12px left of the pointer, choose above or below according to available vertical space, and constrain it to the canvas with an 8px margin. Long labels wrap within 320px; exceptionally tall content is clipped to the available height. Tooltip text and metadata interpretation are unchanged. No additional hover state or dependency is needed.

## 2026-10-21 — META-04 approved implementation

**Decision:** Fix overlay picking and preserve zoom centres; collapse controls by default; retain manual colour editing while removing disclaimers. Hover reports raw cell values or the exact rendered aggregate. Optimize uploaded-tree worker aggregation and request lifecycle without changing the HTTP backend interface. Validate both real fixture pairs, including the 2,393,275-tip compressed tree.

**Status:** Complete; tests, builds and both real-fixture browser checks pass. Performance and fixture-count evidence is recorded in the Session Log.

**Import dependency:** The unchanged compressed large fixture crashed Chrome during import. The Node worker baseline used about 10 GB heap. CSV records and merged tree nodes now use compact property construction instead of dynamically extended property dictionaries; metadata values and blank defaults are preserved. This directly enables the approved large-fixture validation.

**Root causes:** Overlay pointer events were entering canvas picking with button-relative offsets. The worker density connection was still present; repeated categorical scans and request effects depending on changing backend objects added unnecessary work.

**Density:** Exact dictionary-coded modes use bounded indexes (approximately 128 MiB) and 32 viewport summaries, independent of colour settings. Unselected indexes are released. One active worker request and the newest pending request are retained; cooperative checkpoints allow cancellation. Responses carry summaries for hover, and compatible older bitmaps remain at their original world bounds while a new viewport loads.

## 2026-10-21 — META-03 approved implementation

**Decision:** Replace the discrete legend's ellipsis with a full-list dialog over existing legend entries. Keep a ten-entry preview, stable frequency ordering, case-insensitive search and virtualized scrolling. Preserve click-to-edit by closing the dialog before opening the existing editor. Reset dialog state on dataset/field/locus/mode changes; keep colours live and reuse the supplied RGB values.

**Consequences:** No new category aggregation, dataset-wide queries, dependencies, public API or URL state. Million-tip validation and META-04 remain outside this task.

## 2026-10-21 — Legend dialog lifecycle and compatibility

**Related task:** META-03

**Decision:** `Key` filters empty labels before taking its ten-entry preview and supplies one memoized, stable frequency-sorted list to the preview and dialog. The existing `keyStuff` category aggregation, counts and RGB colours remain authoritative for both local and server-backed views. Missing metadata and a literal category named “Missing” have distinct row identities. Numeric ramps and empty-numeric messages retain their existing behaviour.

**Presentation:** The Headless UI dialog is at most 560px wide and 80% of the dynamic viewport height. It supports case-insensitive label search, matching/total category counts, native keyboard scrolling and fixed 36px rows with four overscan rows using the existing window helper. Search resets on opening; membership/order and search changes reset scrolling while palette-only changes preserve it. Full labels appear in native titles and the scrollable hover/focus detail area. Empty results are explicit.

**Lifecycle:** Dataset identity comes from the existing backend configuration-getter reference. Dataset, field, genotype-locus and legend-mode changes remount the scoped content and cancel pending edits; the compact collapse preference survives. Closing clears highlighting and restores focus. Activating an editable category closes the dialog before opening the existing editor on the next animation frame; missing-data entries remain read-only. No public Taxonium API, backend endpoint, worker protocol, URL state or dependency was added.

**Browser finding:** Utility CSS is scoped to descendants of `.taxonium`, so the new portal root needs explicit fixed positioning for a nonzero accessible dialog box and correct stacking above tree controls. The final browser check covers both. This fix is confined to the new dialog.

## 2026-10-20 — META-02 approved implementation

**Related task:** META-02

**Decision:** Use a collapsed, resizable bottom panel and worker-side pages of exactly 2,000 samples (except the final page). Tree selection controls the scope; column choices are independent of matrix settings. Use compact descendant-tip intervals and iterative traversal, lazy indexing, bounded field projection and row/column windowing. Keep display preferences in component state. Large one-million-tip validation is explicitly reserved for the user.

**Consequences:** No page-size selector, table-driven selection, sorting, editing, export or server-backed table is added.

## 2026-10-20 — Table indexing, selection and presentation

**Related task:** META-02

**Decision:** The optional local-backend table API returns exact counts and at most 2,000 tip rows, projecting at most 32 metadata fields plus the configured sample identifier. A lazy iterative traversal builds compact typed arrays for ordered tip positions and each node's descendant interval. Normalized IDs need no lookup Map; sparse IDs have a fallback. Page reads index directly into existing worker nodes without copying full metadata records or materializing clade membership lists. Row order follows a stable traversal of processed nodes.

**Selection:** `useNodeDetails` exposes the immediately selected node ID while retaining its existing detail-loading interface. Clear, replacement and unmount cancel pending detail debounce work; generation checks reject late callbacks. Local detail/table responses carry unique request IDs. Upload messages precede child table queries, and a late-finishing older import cannot replace newer data. The table uses this shared tree selection, independently of searches and viewport bounds, and resets to page one whenever selection changes.

**Presentation:** No existing table/windowing component was suitable. Small fixed-size window helpers bound rows, columns and the searchable column chooser without dependencies. The bottom panel starts collapsed, defaults to 300px when expanded, supports pointer/keyboard resizing and is capped at half the application height. The identifier and header stay pinned. Column choices and paging survive collapse, dataset-specific choices reset on replacement, and no table settings enter the URL. Only the current response is retained; dimensions survive column fetches to prevent scroll jumps. Collapsed panels issue no table queries. Errors expose Retry and requests time out after 30 seconds.

**Colours and values:** Cells call the existing matrix colour resolver, including its boolean compatibility styling, independently of matrix column selection. Type/palette changes repaint without refetching rows. Raw values, including leading zeros, false and zero, are preserved; absent/empty values display an em dash. Native hover titles and focus tooltips expose full values. Tooltips clear when their rows change.

**Validation scope:** Automated checks use up to 4,501 tips, a 5,000-node deep chain and 1,000 metadata fields. The browser fixture has 2,105 tips and 64 fields. The one-million-tip index, latency and memory checks remain explicitly reserved for the user's manual validation.

## 2026-10-16 — META-01 approved implementation

**Related task:** META-01

**Decision:** Uploaded datasets receive shared field types and colour mappings. Auto preserves boolean displays and configured types; string identifiers remain categorical. Numeric scales use finite dataset-wide ranges unless a ramp is configured. URL state stores types, seeds and manual colours. Reshuffle replaces all colours for its field, including configured colours. Dense categorical rows show the mode, with lexical ties; numeric rows average valid raw numbers.

**Consequences:** Numeric matrix colours, missing-value means and unconfigured numeric-string inference intentionally change. External server APIs remain unchanged and legacy server behaviour is retained. META-02 and META-03 are not included.

## 2026-10-16 — Shared metadata implementation and compatibility

**Related task:** META-01

**Context:** Tree colours used a global value-only cache, while matrix colours and numeric density used separate 0–1 logic. Numeric strings were inferred as numbers, including identifiers.

**Decision:** `useMetadata` owns interpretation and colour settings via the optional `metadata` JSON query parameter. Entries are keyed by field and contain optional `type`, `seed` and `colors`. Existing `color` and `metadataMatrix` query parameters retain their roles. The worker supplies dataset-wide `metadataSummaries`; `metadataFields` now represents explicit configured types. Raw node values are never rewritten. Numeric ranges include finite, strictly parsed values across all tips so an explicit numeric override works for TSV columns.

**Rationale:** A shared worker-compatible colour resolver gives tree points, matrix cells, density rows, legends and exports the same mapping without copying sample metadata. Generated categorical colours depend on field, exact value and seed (default zero), not category order or visibility. Per-resolver colour caches are bounded to 10,000 values. Numeric prefix indexes remain lazy; categorical density uses row-local counts with lexical tie-breaking rather than per-category full-dataset indexes.

**Consequences:** Auto keeps configured types and boolean compatibility, but otherwise string values remain categorical. Explicit Numeric uses the configured ramp or a fixed full-dataset linear plasma range; constant fields use the midpoint. Missing/invalid numeric values use neutral grey and are excluded from density means. Reshuffle replaces manual/configured category colours only for that field; later manual edits apply to the new palette. Auto boolean matrix styling remains a compatibility exception. Server datasets retain legacy rendering and do not expose the new type controls; no server endpoint or protocol was added. URL state saves display settings, not uploaded files, so files must be supplied again after reload. Categorical legend expansion remains META-03.

## 2026-10-16 — Worker correctness and export dependencies

**Related task:** META-01

**Context:** Browser validation found that the existing initial full-tree query passed null bounds to a worker that dereferenced them. SVG export omitted metadata layers. Density callbacks were keyed only by request contents.

**Decision:** Treat null query bounds as an unbounded query. Match the worker's tip predicate to the renderer, excluding explicitly non-tip unary nodes. Reuse boolean parsing, refresh configuration on dataset replacement, give density requests unique callback IDs, and reject resolved density data from a different dataset or settings. Include metadata polygons and density images in SVG exports using the same layer colours and aligned Y coordinates.

**Consequences:** These are direct META-01 correctness dependencies. Tree topology, search/selection semantics and external server APIs are unchanged. Existing tests asserting zero-filled numeric means and missing hover values were updated to assert the approved new behaviour; legacy inference/normalization tests remain.

Record architectural decisions that future sessions need to understand.

Use the following format:

## YYYY-MM-DD — Decision title

**Related task:** `TASK-ID`

**Context:** Why the decision was needed.

**Decision:** What was chosen.

**Rationale:** Why this approach was selected.

**Consequences:** Important implications or future work.

---

# Blockers

None currently recorded.

Pending user validation (META-02, not an implementation blocker): manually check index construction, memory and interaction latency on the one-million-tip dataset. This was excluded from automated testing by request.

For each blocker, record:

- Related task ID.
- Description of the problem.
- What has been investigated.
- What is required to proceed.

Once resolved, record the resolution in Design Notes or Session Log and remove the active blocker.

---

# Session Log

## 2026-10-22 — VIS-01 complete

**Completed:**
- Added the URL-backed `treeLayout=standard|rotated` preference and accessible Standard/Downward selector. Missing/invalid values use standard; Treenome retains the preference while temporarily rendering standard.
- Reused canonical tree coordinates, camera state, node data and worker/server queries. A shared axis swap transforms display cameras, tree/metadata/minimap layers and pointer coordinates. Downward layout intentionally keeps existing tip order left-to-right rather than applying literal clockwise ordering.
- Preserved centre and axis zoom on switching, screen-direction zoom buttons, sample-axis wheel zoom, drag, minimap navigation, search zoom, selection and table scope. Density queries use canonical dimensions, so rotated output resolution follows screen width without a second aggregation pipeline.
- Added horizontal metadata headers/hover values and row-thickness wording. Kept labels upright and moved controls/legend above the matrix, bounding them on short/narrow screens. Removed a passive Deck wrapper that intercepted actual canvas clicks; explicitly positioned the screenshot dialog portal above controls.
- Applied orientation and viewport clipping to SVG, including density bitmap direction. Verified SVG and PNG downloads through the actual format dialog. No dependencies, required public component props, worker/HTTP endpoints or website source changes.
- Preserved existing uncommitted plan content and fixture files. COMP-01 was not started.

**Validation:**
- `npm run check-types`: passed, zero TypeScript errors.
- `npm test -- --run`: 53 tests across 16 files passed, including all 47 existing tests. New coverage checks camera round trips/scalar zoom, ordering, actual orthographic projection alignment and canonical bounds, resize/clamping, screen-axis navigation, Treenome restoration, query persistence and rotated SVG polygons/density images.
- `NODE_OPTIONS=--max-old-space-size=16384 npm run build`: passed. Existing vm-browserify/loaders.gl and mixed-export warnings remain.
- Website `npm run build`: passed against the final component bundle; existing eval and bundle-size warnings remain. The sandbox initially blocked sibling-package cache writes; the authorized rerun passed.
- Small-fixture Chrome: actual pointer selection and clear, linked table counts, centred zoom buttons, drag/wheel gestures, individual and aggregate hover, tree/matrix alignment, minimap drag, search-to-sample, empty metadata panels, Treenome override/restoration, reload/re-upload persistence and desktop/mobile layouts passed. SVG parsed as valid XML with canvas dimensions and metadata polygons; PNG dimensions matched. Existing HTTP endpoints and array-shaped density summaries passed via a local browser route mock; no live external server was contacted. Zero page errors.
- Large-fixture Chrome with default heap allowance: 2,399,238 tips imported in 25.05 seconds. One/three/six metadata fields, numeric override for `n_capsule_systems`, categorical/numeric aggregate hover, repeated navigation and standard/downward switching passed. Zero page errors.
- `git diff --check`: passed.

**Large-fixture observations:** Times below include waiting for the current pickable density image at the requested canonical bounds. They are single-run observations, not a controlled speedup benchmark. Early one-field pan/zoom overlaps initial application work and is retained as measured.

| Fields | First use | Pan | Zoom | Rapid navigation |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 632 ms | 473 ms | 1,374 ms | 27 ms |
| 3 | 1,562 ms | 16 ms | 19 ms | 21 ms |
| 6 | 1,428 ms | 33 ms | 34 ms | 23 ms |

**Validation findings:** Initial implementation type errors in heterogeneous layer-spec property assignment were corrected without disabling checks. Browser validation exposed the wrapper/portal issues described in Design Notes. Test-harness corrections awaited asynchronous checkbox/type changes and GPU picking, refreshed coordinates after table resizing and waited for download actions together. These were corrected before the final passing runs. The final export-dialog-only fix did not require repeating the completed large-tree rendering run.

**Evidence:** `/private/tmp/vis01-smoke.cjs` (small checks; `--large` for the compressed fixture), `/private/tmp/vis01-large.json`, `/private/tmp/vis01-{density,cells,mobile,large,export-dialog}.png`, SVG/PNG downloads at `/private/tmp/vis01-export.*`, and `/private/tmp/vis01-{component,website}-build.log`.

**Remaining issues:** No VIS-01 blockers or known new validation errors. Existing build warnings remain. The separately deferred META-02 million-tip table-index validation remains reserved for the user.

**Next:** Plan COMP-01 — Geographic map. Do not automatically implement it.


## 2026-10-21 — META-04 tooltip placement follow-up complete

**Request and scope:** Reopened META-04 because metadata tooltips were hidden beyond the right-hand bars. Updated Current Task before implementation. Reused Deck tooltip styling to position both individual and aggregate tooltips on the left, with wrapping and vertical bounds. VIS-01 remains unstarted; no blockers.

**Validation:** `npm run check-types` passes with zero errors; `npm test -- --run` passes all 47 tests in 14 files. Component build (`NODE_OPTIONS=--max-old-space-size=16384 npm run build`) and website `npm run build` pass with existing dependency, mixed-export, eval and bundle-size warnings. `git diff --check` passes.

**Browser:** Chrome smoke check with `tree_small.nwk` and `metadata_small.csv` passes. Individual and aggregate tooltip rectangles stay left of the cursor and within the canvas; upper/lower-half placement and long-label wrapping at a maximum width of 320px are verified. Existing zoom, controls, selection and table checks pass with no page errors. Screenshots: `/private/tmp/meta04-tooltip-density.png` and `/private/tmp/meta04-tooltip-cell.png`. Large-fixture performance checks were not repeated for this presentation-only follow-up; the million-tip index remains reserved for manual validation.

## 2026-10-21 — META-04 complete

**Completed implementation:**
- Isolated canvas picking from overlay controls and used canvas-relative coordinates. Axis zoom preserves the current target; scalar zoom is supported. Matrix picking provides hover without turning aggregates into node selection; matrix clicks retain the previous clear-selection behavior.
- Added a native, keyboard-accessible matrix disclosure, initially collapsed, retaining settings and showing selected-column count. Reused the Colour by selector styling. Removed custom-colour disclaimer text while retaining manual editing.
- Added cell/sample and aggregate metadata tooltips using the rendered summaries, including missing labels, exact categorical modes, valid numeric means and boolean proportions. Stale summaries are not hoverable.
- Added exact encoded categorical indexes, reusable counters and 32-entry viewport-summary caching independent of colours. Category indexes are bounded to approximately 128 MiB; unselected categorical/boolean/numeric indexes are released on subsequent density requests. Numeric and boolean prefix construction also yields for cancellation. No full-dataset per-category prefix tables are created.
- Coalesced density requests to the active request plus the newest pending request. Added cancellation and dataset/request checks, removed unstable backend-object effect dependencies, and retained compatible bitmaps at their original world bounds during navigation.
- Reduced large-import memory through compact metadata object construction; preserved existing parsing, values, duplicate-name assignments and blank defaults. No dependencies or external HTTP backend changes.

**Fixtures:** Verified the small CSV has 1,508 records. The large Newick actually has 2,399,238 tips; its CSV has 2,393,274 nonempty records, or 2,393,275 lines including the header. Confirmed by the importer, independent Newick delimiter counting and CSV parsing. Updated the fixture catalog. These META-04 checks supersede earlier large-tree exclusions for this task only; the separately requested META-02 million-tip table-index handoff remains manual.

**Validation:**
- `npm run check-types`: passed, zero TypeScript errors.
- `npm test -- --run`: 47 tests across 14 files passed. Added coverage for exact modes across ranges/missing values/ties, interrupted index construction, worker request coalescing and cancellation, callback isolation on replacement, legacy HTTP aggregate arrays, scalar/axis zoom and matrix resizing, and compact metadata import compatibility. Existing 40 tests remain passing.
- Initial new-test failures were test assumptions: the default zoom axis is Y, and existing embedded Newick parsing retains its existing value syntax. Corrected harness expectations without changing that behavior or weakening existing tests.
- `NODE_OPTIONS=--max-old-space-size=16384 npm run build`: component passed. Existing vm-browserify/loaders.gl and mixed-export warnings remain.
- Website `npm run build`: passed against the final component bundle. Existing eval and bundle-size warnings remain. The first attempt was blocked by sandbox writes in the sibling package and passed after the permitted rerun. Small-fixture browser checks also passed: collapsed controls and retained selections, 30px selectors matching Colour by, all four axis zoom controls preserving a panned centre after resize, aggregate and exact sample/value tooltips, and the 1,508-sample table. Zero page errors.
- Large-fixture Chrome: compressed upload completed in 24.9 seconds, all 20 metadata fields available, one/three/six columns rendered, Numeric override for `n_capsule_systems`, categorical density hover and repeated viewport updates passed; zero page errors. Warm rendered updates were 16–33 ms in the sampled interactions. Screenshots and scripts are in `/private/tmp/meta04-*`.
- Small-fixture browser harness was corrected to wait for asynchronous checkbox/view-state/GPU picking updates, compare only metadata selectors, and pick actual rendered cells rather than a potentially superseded node list.
- `git diff --check`: passed.

**Performance evidence:** Full uploaded tree; columns introduced in order `Cluster`, `Phylum`, `Wzy`, `Genus`, `Domain`, `n_capsule_systems` (Numeric). Density requests used 400 aggregate rows, 800 output pixels, 24px columns and full/panned/zoomed Y ranges. Times include aggregation and rasterization; Chrome query times also include worker transfer. Rendering was measured separately by waiting for the new pickable bitmap at the requested bounds.

| Columns | Browser first-use preparation | Warm repeat | Warm pan | Warm zoom | Recolour |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 571 ms | 137 ms | 376 ms | 144 ms | 3.1 ms |
| 3 | 1,192 ms | 0.8 ms | 4.0 ms | 2.6 ms | 0.7 ms |
| 6 | 1,098 ms | 1.3 ms | 8.4 ms | 4.6 ms | 0.8 ms |

The early one-column samples overlap initial tree/application work and are retained rather than discarded. One/three/six column bitmap payloads were 115,200 / 268,800 / 499,200 bytes. The measured main-thread heap was about 330 MB, excluding worker memory.

The unchanged browser baseline crashed during import. A Node bundle of the original worker/import path completed the same fixture in 100.2 seconds with about 10.1 GB heap immediately after import. The optimized Node path took 53.7 seconds with about 3.5 GB heap at the same checkpoint (about 2.5 GB after queries/GC). Original one/three-column warm repeat queries took 473 / 1,586 ms; optimized values were 1.18 / 0.71 ms. Original six-column timings were 8–16 seconds, but overlapped another memory-heavy run and must not be treated as controlled speedup measurements. These are single-run observations, not a formal benchmark suite. Raw results: `/private/tmp/meta04-worker-results-{baseline,optimized}.json` and `/private/tmp/meta04-rendered.json`. A final Chrome run with its default heap allowance also passed: 24.1-second upload, 14–33 ms sampled rendered navigation, and zero page errors (`/private/tmp/meta04-default-heap.json`).

**Remaining issues:** No META-04 blockers. Existing build warnings remain. External live HTTP servers were not contacted; legacy response compatibility is covered with existing array-shaped payloads. The separate META-02 million-tip table-index check remains reserved for the user.

**Next:** Plan VIS-01; do not automatically implement it.

## 2026-10-21

**Task:** META-03 — complete

**Completed:**
- Updated Current Task before implementation and the checklist during work; preserved the pre-existing uncommitted META-02 changes.
- Replaced the discrete legend's ellipsis with “Show all N categories” and added a searchable, virtualized dialog using existing legend data.
- Added keyboard-accessible preview/row actions, full-label details, missing-value distinction, live colours, lifecycle resets and focus-safe colour-editor handoff.
- Kept category aggregation, numeric/genotype handling and server protocols intact. META-04 was not started.

**Files/components:** `Key`, the new `LegendDialog`, its existing key tests, one dataset-identity prop at the `Deck` call site, and this plan. No package/dependency or website source changes.

**Validation:**
- Planning baseline: `npm run check-types` and 35 tests passed.
- Final `npm run check-types`: passed, zero TypeScript errors.
- Final `npm test -- --run`: all 40 tests across 11 files passed. New scenarios cover 0/1/10/11 entries, filtering before truncation, stable ties, a 10,000-category list with bounded DOM and last-entry access, case-insensitive/no-match searches, full labels, palette changes, missing versus literal “Missing”, focus/editor handoff, empty live lists, membership resets and dataset/field/locus/mode resets including pending-edit cancellation.
- Initial new-test failures were a missing initial harness render and NodeList iteration unsupported by the repository's TypeScript lib configuration; both were fixed in tests without weakening checks.
- Component `NODE_OPTIONS=--max-old-space-size=16384 npm run build`: passed. Existing vm-browserify/loaders.gl and mixed-export warnings remain.
- Website `npm run build`: passed (about 6 seconds). Existing eval and bundle-size warnings remain.
- Headless Chrome: 123-tip Newick/TSV fixture with 63 legend entries; preview size, search, bounded rows, keyboard scrolling, live shared RGB colours, missing/long labels, numeric-mode reset, Escape/backdrop/Close actions, focus restoration and actual colour-editor handoff passed. Desktop (1500×1000) and mobile (390×844) layouts fit their bounds with the metadata table open; portal hit testing confirms tree controls stay behind the dialog. Zero page errors.
- Existing server protocol checked through a local HTTP mock: full legend search works with no new endpoint. No live external server was contacted.
- Browser validation first exposed the portal-positioning issue documented above; the final run passed after the fix. Screenshots and smoke script are under `/private/tmp/meta03-*`.
- `git diff --check`: passed.

**Remaining issues:** No META-03 blockers. Existing build warnings remain. Million-tip tests/benchmarks were not run; the META-02 manual validation handoff is unchanged.

**Next:** Plan META-04 — further metadata tweaks. Do not automatically implement it.

## 2026-10-20

**Task:** META-02 — complete

**Completed:**
- Updated Current Task before code changes and checked off milestones during implementation.
- Added the uploaded-dataset metadata panel, fixed 2,000-row paging, searchable column visibility, pinned identifiers/headers and bounded row/column rendering.
- Added lazy worker indexing and bounded field projection with exact all-tip, clade and single-tip counts.
- Reused shared selection and colour state, preserved raw metadata, and protected requests/import replacement against stale results.
- Kept META-03 and META-04 out of scope. No dependencies, server APIs or website source files changed.

**Validation:**
- `npm run check-types`: passed with zero TypeScript errors.
- `npm test -- --run`: 35 tests in 11 files passed. Coverage includes page boundaries/counts, sparse IDs, empty and deep trees, invalid requests, 1,000-column projection/windowing, worker message routing, upload races, selection/clear races, cancellation/retry, column persistence, replacement reset and tooltip cleanup.
- Initial new-test failures were incomplete test fixtures (required types and worker mutation lookup); corrected without weakening existing tests. No outstanding type or test errors.
- `NODE_OPTIONS=--max-old-space-size=16384 npm run build`: component passed. Existing vm-browserify/loaders.gl and mixed-export warnings remain.
- Website `NODE_OPTIONS=--max-old-space-size=16384 npm run build`: passed; existing bundle-size warnings remain.
- Headless Chrome against the website with 2,105 tips and 64 metadata fields: fixed-page navigation and direct page entry; tip/clade selection, rapid select/clear and clearing back to all samples; horizontal/vertical scrolling with pinned identifiers and bounded DOM; searchable column visibility and persistence across collapse; no collapsed table requests; keyboard/pointer resize; shared colours and type/reshuffle updates without table refetches; raw identifiers and focus tooltips; search/zoom independence. Passed with zero page errors.
- Existing server protocol and selection passed against a local HTTP mock; the metadata table and uploaded-dataset type controls remain hidden. No live external server was contacted.
- Browser inspection found a stale focus tooltip after selection changed; fixed and covered by the final component test and Chrome run. The initial browser harness also needed to await the existing asynchronous matrix checkbox update.
- `git diff --check`: passed.
- Browser evidence and scripts are temporary files under `/private/tmp/meta02-*`.

**Manual handoff:** Run the one-million-tip index/memory/latency check manually as requested. No million-tip fixture, benchmark or test was generated or run.

**Remaining issues:** No META-02 implementation blockers. Existing build warnings remain; million-tip performance is unverified pending the user's manual check.

**Next:** Plan META-03 (expandable categorical legend); do not automatically start it.

## 2026-10-16

**Task:** META-01 — complete

**Completed:**
- Updated this plan before implementation and at completion; completed only META-01 and its direct dependencies.
- Added shared metadata summaries, Auto/Numeric/Categorical controls, URL-backed type/palette/manual-colour settings and per-field reshuffling.
- Unified numeric and categorical colours across tree, matrix, legend, hover and SVG export; implemented categorical density and valid-value numeric means.
- Fixed the pre-existing null-bounds worker error encountered during browser validation and protected density results against stale settings/datasets.

**Files/components changed:**
- Metadata controller and shared colour utilities; existing matrix, colour, local-worker and layer hooks.
- Search-panel controls, legends, hover values, SVG export and associated types.
- Regression tests and this plan. No dependency or website source changes; the pre-existing parent `package-lock.json` remains untouched.

**Validation:**
- Planning baseline: `npm run check-types` and 10 tests passed.
- Final `npm run check-types`: passed, zero TypeScript errors.
- Final `npm test -- --run`: 26 tests across six files passed, including actual worker message handling, shared hook/control behaviour, URL parsing, numeric ranges, category stability, density, legends, legacy genotype colours and SVG colours.
- Initial default-heap component build failed with Node heap exhaustion. `NODE_OPTIONS=--max-old-space-size=16384 npm run build`: passed (final build about 26 seconds). Third-party vm-browserify/loaders.gl warnings and the existing mixed-export configuration warning remain.
- Website `NODE_OPTIONS=--max-old-space-size=16384 npm run build`: passed (about 7 seconds); bundle-size warnings remain.
- Headless Chrome against the website: Newick plus TSV upload; exact rendered tree/matrix RGB agreement; boolean Auto; type switches; reshuffle; reload/re-upload restoring settings and colours; search highlighting; SVG download; 1,500-tip/40-category worker density and zoom. All passed, zero page errors.
- Existing server protocol smoke-tested with a local HTTP mock; legacy rendering works and uploaded-dataset type controls remain hidden. Live external servers were not contacted.
- `git diff --check`: passed. Browser validation script and screenshots were written under `/private/tmp/meta01-*` as temporary evidence.

**Decisions:** See the dated Design Notes above. Defaults, missing-value handling and intentional numeric behaviour changes follow the approved plan.

**Remaining issues:** No META-01 blockers. Categorical legend expansion is deferred to META-03 as planned. Million-tip performance was not benchmarked in this task.

**Next:** Plan META-02 (metadata table), first establishing how its rows should follow existing sample selection. Do not automatically implement it.

---

# Deviations

META-04 required a small import-memory fix before the large fixture could load in Chrome. Compact metadata object construction replaces dynamic property dictionaries without changing metadata semantics. The updated fixture catalog also distinguishes the verified tree-tip count from the CSV line/record counts. These direct dependencies and the measurement limitations are documented above.
