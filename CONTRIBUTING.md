# Contributing

## Setup

```sh
bun install              # Bun 1.4.4 (matches packageManager and CI)
```

## Verify before opening a PR

```sh
bun run verify            # typecheck -> CSS compat -> dependency audit -> build -> unit -> e2e fast -> size -> pack -> registry
```

Or run the steps yourself:

```sh
bun run typecheck
bun run check:compat    # authored CSS against .browserslistrc
bun run check:deps      # high/critical dependency advisories
bun run build           # required before unit tests read dist/
bun test tests/unit
bun run test:e2e:fast    # chromium-mobile only
bun run test:e2e --workers=3 # full browser matrix and local visual/performance projects
bun run size            # per-import gzip budgets and size-document freshness
bun run pack:check
bun run check:registry
bun run test:site         # site smoke, builds the docs site first
```

`bun run typecheck` uses `bun check` for library source, scripts, tests, fixtures, and
build/test configs. The docs workspace has its own `bun run --cwd docs typecheck`.
The TypeScript 6 dependency supplies declaration generation and Astro's checker;
source typechecking uses Bun's built-in checker. The latest `@astrojs/check` rejects
the TypeScript 7 npm package as of `@astrojs/check` 0.9.12.
`check:compat` checks CSS only; JavaScript browser-API linting is not part of this gate.

The package's JavaScript and bundle-size probes use Bun's bundler. `bun-plugin-dts`
bundles declarations during the production builds. `tsconfig.declarations.json`
keeps build-tool ambient types out of the published API; a strict NodeNext
consumer test checks the generated declarations and public component props.
Declarations ship in `dist/types/` inside the same npm package as the JavaScript.

The `minimatch` override keeps doiuse's transitive matcher on a patched release.
`check:compat` validates that integration against the authored stylesheets.

## Formatting

Use `bun fmt <files>` to format changed files, or `bun fmt --check <files>` to check
them without writing. Settings live in `bunfig.toml`; generated modules are excluded.

## CSS

The authored stylesheets are `packages/scrollsheet/src/internal/core.css`,
`packages/scrollsheet/src/internal/widgets.css`, and
`packages/scrollsheet/src/toast/toast.css`. Never edit `*-css.generated.ts` by hand.
After editing a stylesheet, run:

```sh
bun run gen:css
```

The build regenerates these modules before unit tests check the CSS output.

## Pull requests

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`.
- Include a test plan in the PR description, as a checklist:

```md
## Test plan

- [ ] bun run typecheck
- [ ] bun run check:compat
- [ ] bun run check:deps
- [ ] bun run build
- [ ] bun test tests/unit
- [ ] bun run test:e2e:fast
- [ ] bun run test:e2e --workers=3
- [ ] bun run size
- [ ] bun run pack:check
- [ ] bun run check:registry
```
