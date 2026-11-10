---
name: qa-sweep
description: Structured exploratory QA sweep of a web app - severity taxonomy, per-page exploration checklist, weighted health score, diff-aware scoping, regression-test-per-fix discipline, and a self-regulation formula for when an autonomous fix loop must stop. Use when asked to QA an app, run a quality sweep, hunt UI bugs before a release, or fix-and-verify a batch of issues.
---

# QA Sweep

The protocol layer: what to look for, how to score it, when to stop.
Drive the browser with the webapp-testing / playwright stack; this skill
decides coverage and governance.

## Scope

Diff-aware by default on a feature branch: derive affected pages from the
diff (route/view → page, component → pages importing it, CSS → pages
including it) instead of crawling everything. Full-crawl only on request
or pre-launch.

## Per-page exploration (each page, in order)

1. Visual scan (layout breaks, overflow, contrast).
2. Click every interactive element.
3. Forms: submit empty, invalid, and edge-case data.
4. Navigation paths in and out.
5. States: empty, loading, error, overflow-content.
6. Console after EVERY interaction (errors, warnings, mixed content, CSP).
7. Responsive pass (mobile width minimum).
8. Auth boundaries: logged out, wrong role.

Severity + categories: `references/issue-taxonomy.md` (4 severities with
calibrated examples; 7 categories with concrete sub-items). Cite it, don't
improvise severities.

## Health score (trackable over time)

Weighted: Functional 20% · Console 15% · UX 15% · A11y 15% · Links 10% ·
Visual 10% · Performance 10% · Content 5%. Each category starts at 100;
deduct 25/15/8/3 per critical/high/medium/low finding. Report the number —
it makes week-over-week quality visible.

## Fix loop discipline

- **Regression test per verified fix** (mandatory, with teeth): trace the
  bug's exact precondition first — the test must fail on the old code, not
  merely "not throw". Match sibling test files' naming and assertion style.
  Attribute: `// Regression: <issue> — <what broke>, found by qa-sweep <date>`.
  Bail rule: test fails → fix it once; still failing → delete and defer;
  >2 min exploring → defer. Never ship a flaky regression test.
- **Self-regulation (when to stop and ask)**: run a drift score from 0%.
  +15% per reverted fix · +5% per fix touching >3 files · +20% for touching
  unrelated files · +10% once only-Low issues remain · +1% per fix after
  the 15th. Over 20% → stop, show the ledger, ask the human. Hard cap: 50
  fixes per sweep regardless.

## Output

Findings by severity with reproduction steps, the health score, fixes
applied (each with its regression test path), deferred items into the
repo's todo convention.
