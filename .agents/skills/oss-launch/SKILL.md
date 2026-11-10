---
name: oss-launch
description: Launch checklist for shipping a NoodleApps OSS package - pre-flight gates (adversarial review done, tests green, README/LICENSE/demo ready, npm name free), publish with beta dist-tag, flip repo public, apply branch protection, deploy docs, run the announce round. Use when launching or publishing an open-source package, shipping a library to npm, or taking a repo public.
---

# OSS Launch

The sequence scrollsheet ran, generalized. Gates before actions; every gate
that fails stops the launch with a named reason, not a warning.

## Pre-flight gates (all must pass)

1. **Clean tree, feature-branch discipline**: no uncommitted work; nothing
   ships from a dirty tree.
2. **Adversarial review evidence** (standing library rule: no commit of
   library src/ without it): confirm the current HEAD's diff-range was
   reviewed by a fresh-instance adversarial pass (check recent git log
   for review-fix commits + ask the user if evidence is ambiguous). For
   extra teeth on big releases, add `cross-model-review` as second skeptic.
3. **Tests green**: run the repo's real gates (typecheck, unit, e2e) —
   fresh, not from memory.
4. **Launch assets**: README (install + one compelling example + honest
   size/support table), LICENSE, demo GIF/MP4, CHANGELOG or release notes.
5. **npm identity**: package name free or owned (`npm info <name>`),
   `npm whoami` logged in, version sane (beta for first publish:
   `1.0.0-beta.N`), `files`/`exports` field ships dist only —
   `npm publish --dry-run` and READ the file list.

## Publish sequence

1. `npm publish --tag beta` from the package dir (never repo root in a
   monorepo). First publish claims the name — do this EARLY once gates
   pass; names get squatted.
2. Verify: `npm info <name>` shows the version; install it in a scratch dir
   and import once.
3. Repo → public (user clicks; account-gated). Then apply branch
   protection: main force-push/deletion blocked (free tier allows it once
   public).
4. Docs site deploy if the repo has one.
5. `latest` dist-tag only after the beta has survived real use:
   `npm dist-tag add <name>@<version> latest`.

## Announce round

Pepper drafts, the human posts (never auto-publish, house rule):
- X thread: demo GIF first, one concrete technical hook (numbers beat
  adjectives), link last.
- Reddit: the relevant sub as an answer/show-off per the 90/10 rule, on the
  account with history.
- Newsletters for the ecosystem (for React: React Status, JS Weekly; RN:
  React Native Newsletter).
- Follow the binding writing rules: no em-dashes, no slop words, specifics
  over adjectives, no internal Zepto metrics ever.

## After

Update `~/Code/wiki/ops/RELEASE-TRACKER.md` (one line: what shipped, what's next),
and promote any durable launch lesson to the wiki per its AGENTS.md.

## Changelog Sell Test

Score every release-notes entry 0-3: what changed (+1), why the reader cares (+1), how to use it (+1). Entries under 2 get rewritten before shipping.
