Read `AGENTS.md` before starting work.

This file is the authoritative record of project state, priorities, decisions, and handoff context.

Work only on the Current Task unless the user explicitly requests a different task. If the requested work differs, update Current Task before modifying code.

Do not automatically begin Next Task or other backlog items.

# Current Status

**Phase:** Metadata infrastructure  
**Status:** Not started — repository implementation needs verification.

The initial priority is to establish explicit metadata types and consistent colour assignment for categorical metadata.

No implementation changes have yet been recorded in this plan.

# Current Task

## META-01 — Metadata types and categorical colours

Allow each metadata column to be treated as numeric or categorical, with user-selectable types and appropriate colour handling.

### Checklist

TODO: To be filled by the agent planning the task, before it begins

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

Do not begin until META-01 is complete or explicitly reprioritised.

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

- [ ] The Current Task checklist is complete.
- [ ] The feature works as specified.
- [ ] Existing relevant functionality remains intact.
- [ ] Relevant type checks have been run and pass, or outstanding errors are explicitly documented.
- [ ] Relevant builds succeed.
- [ ] Existing and newly added tests pass.
- [ ] Interactive behaviour has been verified where appropriate.
- [ ] Significant implementation decisions are recorded in Design Notes.
- [ ] Blockers and unresolved issues are recorded.
- [ ] Current Status accurately reflects the repository.
- [ ] Session Log records the work performed and validation results.
- [ ] Next Task provides a clear handoff.

## Project

The project is complete when:

- [ ] Metadata typing and categorical colour management are implemented.
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

Keep entries concise and focused on completed work, validation, and handoff information.

## YYYY-MM-DD

**Task:** `TASK-ID`

**Completed:**
- ...

**Files/components changed:**
- ...

**Validation:**
- ...

**Decisions:**
- ...

**Remaining issues:**
- ...

**Next:** ...

---

# Deviations

Record significant departures from the agreed scope, implementation approach, or requirements.

None currently recorded.
