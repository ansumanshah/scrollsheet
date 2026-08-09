# Contributing

## Setup

```sh
bun install
```

## Verify before opening a PR

```sh
bun run verify            # typecheck -> unit -> e2e fast -> build -> size -> pack:check, one shot
```

Or run the steps yourself:

```sh
bun run typecheck
bun test tests/unit
bun run test:e2e:fast    # ~28s, chromium-mobile only
bunx playwright test     # full 4-project matrix, ~1.4 min
bun run size              # 16.0 kB gzip budget on the core bundle
bun run pack:check
bun run test:site         # site smoke, builds the docs site first
```

## CSS

`src/internal/core.css` is the authored source. Never edit `src/internal/core-css.generated.ts`
by hand: it's a generated, pre-minified module. After editing `core.css`, run:

```sh
bun run gen:css
```

CI fails if the generated file is stale.

## Pull requests

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`.
- Include a test plan in the PR description, as a checklist:

```md
## Test plan
- [ ] bun run typecheck
- [ ] bun test tests/unit
- [ ] bun run test:e2e:fast
- [ ] bunx playwright test
```
