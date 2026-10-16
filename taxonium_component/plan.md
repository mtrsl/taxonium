Read `AGENTS.md` before starting work.

This file is the authoritative record of project state, priorities, decisions, and handoff context.

Work only on the Current Task unless the user explicitly requests a different task. If the requested work differs, update Current Task before modifying code.

Do not automatically begin Next Task or other backlog items.

# Current Status

**Phase:** Metadata infrastructure  
**Status:** META-01 complete — validated; META-02 awaits planning.

Uploaded datasets now have shared metadata types, continuous numeric scales and stable categorical colours across the tree, matrix, legend and SVG export.

META-01 implementation and validation are complete. Type checking, all 26 tests, component and website builds, and browser smoke checks pass. No new dependencies were added.

# Current Task

## META-01 — Metadata types and categorical colours

Allow each metadata column to be treated as numeric or categorical, with user-selectable types and appropriate colour handling.

### Checklist

- [x] Add shared dataset metadata summaries, types and URL-backed overrides.
- [x] Unify numeric and categorical colours across tree, matrix and legend.
- [x] Add type controls and field-specific reshuffling.
- [x] Update worker density, hover and export paths.
- [x] Add regression tests and run type checking, tests and builds.
- [x] Verify uploaded datasets interactively and record final handoff.

### Design constraints

- Reuse existing metadata and colour-management infrastructure where practical.
- Avoid creating separate colour assignments for different visualisation components.
- Keep categorical colour assignments stable across filtering and sample selection.
- Do not silently convert categorical identifiers into numeric data merely because their values look numeric.
- Preserve existing behaviour for metadata without an explicit user-selected type where practical.
- Do not introduce additional dependencies without a clear benefit.

# Next Task

## META-02 — Metadata table

Implement a metadata table in a resizable or otherwise appropriately sized panel at the bottom of the application.

The table should display the currently available samples and metadata columns, and respond to sample selection.

META-01 is complete. Next session: plan META-02 using the shared metadata controller and existing selection state. Do not begin implementation automatically.

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

Improve the metadata interaction experience for the user.

Requirements:

- When zooming with the controls, the display moves to the top left corner, so the tree
  disappears without panning. The zoom should centre on the current
  position.
- Remove the 'replace custom colours' disclaimer text throughout, as
  custom colours are no longer supported.
- Add a hover tooltip over the metadata bars, which displays the label
  associated with the hovered colour.
- Create a drop-down box for the metadata matrix controls, including the
  width, colours and order, so the user can hide the controls.
- Make the height of the boxes for the colour categories match the size
  of the colour by selection box.

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
- Remain responsive for large sample counts.

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
- [ ] Metadata table is implemented.
- [ ] Metadata legend supports large numbers of categories.
- [ ] Rotated tree and metadata layout is implemented.
- [ ] Geographic MapLibre component is implemented.
- [ ] `.dot` spatial visualisation is implemented.
- [ ] All relevant validation passes.
- [ ] Cross-component selection and colouring are consistent.
- [ ] `plan.md` reflects the final implementation state.

---

# Design Notes

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

For each blocker, record:

- Related task ID.
- Description of the problem.
- What has been investigated.
- What is required to proceed.

Once resolved, record the resolution in Design Notes or Session Log and remove the active blocker.

---

# Session Log

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

Record significant departures from the agreed scope, implementation approach, or requirements.

None currently recorded.
