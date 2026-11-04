---
name: release
description: Verify, review, and publish a scrollsheet release when the user requests one.
---

# Release

Version lives in `packages/scrollsheet/package.json`. Publish only within the user's explicit release authorization. Existing authorization applies throughout the task; npm authentication may still require the user's browser.

## Verify

- Run `bun run verify`, `bun run test:e2e --workers=3`, `bun run test:site`, and `bun run check:dialog-share`. Serialize local browser suites.
- Check `bun outdated` in the root and `docs/`. TypeScript 6 remains for `bun-plugin-dts` and Astro's checker; source typechecking uses `bun check`.
- Run `gitleaks git` on full history and `gitleaks dir` on `docs/dist` and the extracted package tarball. Review the file list as well as `bun run pack:check`.
- Add a dated changelog entry and run `bun scripts/sync-sizes.ts` after build changes.
- Review changes before committing; wait for PR checks before merging.

## Publish

1. Use a clean clone of the reviewed commit. Install with `bun install --frozen-lockfile`, build, and run `bun publish --dry-run --cwd packages/scrollsheet`.
2. Pack with `bun pm pack` from `packages/scrollsheet`. Publish that reviewed tarball with `bun publish <tarball>`, from the clean clone.
3. Verify the registry version, `latest` tag, and downloaded tarball integrity against the reviewed artifact. Registry caches can lag; use a fresh request before judging failure.
4. Create the GitHub release at the verified merged commit. Do not reuse published versions or move existing release tags.
5. Check the Cloudflare deployment and fresh public pages. Report actual checks and remaining hardware or platform gaps. Repository visibility and promotional launch are separate tasks.
