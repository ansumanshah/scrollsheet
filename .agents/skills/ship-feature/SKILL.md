---
name: ship-feature
description: Implement and review scrollsheet library changes while preserving compatibility and bundle budgets.
---

# Ship a feature

1. Read the affected source, callers, tests, and API docs. State the public behavior and likely regressions before changing library code. Prefer existing helpers and native behavior.
2. Keep optional features behind lazy loaders. Edit authored CSS in `packages/scrollsheet/src/internal/` or `packages/scrollsheet/src/toast/toast.css`, then run `bun run gen:css`. Never edit generated CSS modules.
3. Follow `AGENTS.md` for new props and adapter forwarding. Current paths are `drawer/`, `dialog/`, `toast/`, and `docs/`.
4. Add a focused regression for nontrivial behavior. Unit tests live in `tests/unit`; browser tests use `tests/e2e/fixtures/`. Keep fixture changes separate from site examples.
5. Run the relevant checks, then `bun run verify` for library changes. Build precedes unit tests. Run the full browser matrix for gesture, focus, dismissal, and release changes. Do not run browser suites concurrently. Judge commands by their exit codes.
6. Measure bundle changes with `bun run size`. Keep existing budgets; update documented measurements with `bun scripts/sync-sizes.ts` when needed.
7. Obtain an independent source review before committing library changes. Fix actionable findings and rerun checks affected by those fixes.
8. Update the API reference and changelog for public changes. Use conventional commits without attribution. Push or release only within the user's authorized scope.
