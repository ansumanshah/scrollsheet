# scrollsheet-codemod

Moves a codebase from [vaul](https://github.com/emilkowalski/vaul) to
[scrollsheet](https://scrollsheet.dev). It rewrites the imports and prints a `file:line` report
of every prop scrollsheet ignores or handles differently, so the part that needs a human is a
list instead of a search.

```sh
npx scrollsheet-codemod vaul src
# or
bunx scrollsheet-codemod vaul src
```

Add `--dry-run` to report without writing, and `--json` for machine-readable output. Run it on a
clean git tree so the diff is the review.

## What it rewrites

- `from "vaul"` to `from "scrollsheet"`, including aliased imports such as
  `import { Drawer as DrawerPrimitive } from "vaul"` (the shadcn drawer) and `import * as`.
- `import "vaul/style.css"` to `import "scrollsheet/styles.css"`, and `@import "vaul/style.css"`
  in `.css`, `.scss`, and `.pcss` files.
- `require("vaul")` and `import("vaul")`.
- A `vaul` import that mixes supported and unsupported names is split: `Drawer` moves, the rest
  stay on `vaul` and are reported. An existing `scrollsheet` import is reused.

Quotes follow the file. Formatting is preserved by [recast](https://github.com/benjamn/recast)
through [jscodeshift](https://github.com/facebook/jscodeshift).

## What it reports

Each item has a kind:

| Kind | Meaning |
| --- | --- |
| `ignored` | The prop is accepted and dropped. `Drawer.Root` `onDrag`, `noBodyStyles`, `container`, `nested`, `fixed`, and the other no-op props, and Radix `Drawer.Content` props such as `onEscapeKeyDown`. The message names the replacement when there is one, such as `escapeDismissible={false}` |
| `changed` | It works, but behaves differently: `direction="left"` and `"right"` (width comes from `snapPoints`), `onRelease`'s second argument, and `Drawer.Overlay`, which renders nothing |
| `manual` | An import with no scrollsheet equivalent, left on `vaul` |
| `info` | Worth a look: spread props the tool cannot see through, `closeThreshold` alongside `snapPoints` |

The full table of differences is in
[Migrate from vaul](https://scrollsheet.dev/docs/migrating/from-vaul).

## Limits

It reads JSX statically. A `Drawer.Root` built with `React.createElement`, or props passed
through a spread or a wrapper component, are not seen: spreads are flagged as `info`, and a
wrapper such as shadcn's `DrawerContent` is reported where it spreads, not where it is used.
