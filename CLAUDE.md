# scrollsheet

Zero-dependency React (18+) bottom sheets, drawers, centered dialogs, side panels, and toasts.
The sheet is a native `<dialog>` in the top layer, the drag is a native `scroll-snap` scroll,
and the spring is compiled to CSS `linear()`. Bundle size is a headline feature.

## Layout

- `packages/scrollsheet/src`: the published package `scrollsheet`.
  - `root.tsx` (props, context), `content.tsx` (dialog, track, panel, travel), `handle.tsx`.
  - `internal/`: per-concern hooks (`use-*.ts`), lazy feature chunks (`*-loader.ts`), CSS
    (`core.css`, `widgets.css`) and their generated modules.
  - `motion/`: React-free spring solver, WAAPI wrapper, scroll tween (also `scrollsheet/motion`).
  - `drawer/` (vaul compat), `dialog/` (Radix Dialog compat), `toast/` (Sonner compat).
- `docs/`: the scrollsheet.dev Astro site (second workspace). Prop docs live in
  `docs/src/content/docs/docs/reference/api.mdx`.
- `tests/unit` (bun + happy-dom), `tests/e2e` (Playwright, fixtures bundle straight from `src`).
- `skills/`, `registry/`, `examples/`: consumer-facing agent skills, shadcn-style registry items.

## Commands

```sh
bun install
bun run typecheck
bun run build            # required before unit tests: use-client.test.ts reads dist/
bun test tests/unit
bun run test:e2e:fast    # chromium-mobile only; `bunx playwright test` for all projects
bun run size             # gzip budgets per entry; fails if size docs are stale
bun scripts/sync-sizes.ts  # rewrite size numbers in README/llms.txt/docs after a size change
bun run verify           # the whole local gate
```

In a cloud container, Playwright's Chromium is at `/opt/pw-browsers`; do not run
`playwright install`.

## Rules

- Never hand-edit `*-css.generated.ts`. Edit `core.css` / `toast.css`, then `bun run gen:css`.
- Every byte in the default `Sheet` entry is weighed. Prefer platform behavior over JS, keep new
  features small, or move optional systems behind a lazy loader like the existing `*-loader.ts`.
- Code comments state constraints and reasons; no review narrative, dates, or consumer names.
- New `Sheet.Root` props: add to `SheetRootProps` (with JSDoc and `@default`), the context value
  and its memo deps, the API reference page, and forward from `Drawer.Root` / `Dialog.Root` when
  the prop has no vaul/Radix name collision.
- Elements outside the dialog (the `backgroundEffect` page wrapper) do not inherit the
  `--scrollsheet-*` custom properties; use literal values there.
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`). PRs use
  `.github/PULL_REQUEST_TEMPLATE.md` with a test-plan checklist.

## Releases

Version lives in `packages/scrollsheet/package.json`. Each release gets a dated
`CHANGELOG.md` entry (`## X.Y.Z - YYYY-MM-DD`, one bold lead sentence per bullet). Tagging and
`npm publish` are done by the maintainer; never publish or tag without explicit approval.
