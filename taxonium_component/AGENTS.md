# Development Rules

- Always use `npm`, never `yarn`.
- Run `npm run check-types` in the relevant package before completing a coding task. Aim for zero TypeScript errors.
- Run the relevant build and tests when changes affect application behaviour.
- Do not introduce unrelated refactoring while implementing a feature.
- Preserve existing functionality unless a change is explicitly requested.
- Use existing application state and interfaces where practical rather than introducing duplicate state.

## Planning

`plan.md` is the authoritative project plan.

Every coding task must:

1. Read `plan.md` before making changes.
2. Ensure the Current Task reflects the requested work.
3. Work only on the Current Task and any directly necessary dependencies.
4. Update checklist items as milestones are completed.
5. Record important implementation decisions in Design Notes.
6. Record blockers and unresolved issues.
7. Run relevant validation commands and record their results.
8. Update Current Status and Session Log before finishing.
9. Leave a clear Next Task for the following session.

A task is not complete until both the code and `plan.md` are consistent.

Do not automatically proceed to Next Task.

## Correctness and Consistency

- Metadata colours must remain consistent across all visualisation components.
- Sample selection and filtering must be applied consistently across components.
- Avoid duplicating metadata parsing, colour assignment, or sample selection logic.
- Preserve backwards compatibility with existing metadata where practical.
- Do not weaken existing tests or disable type checking to accommodate implementation changes.
- Record any intentional change to existing behaviour in Design Notes.

If validation fails, distinguish errors introduced by the Current Task from pre-existing errors. Record both, and do not claim that validation passed when it did not.
