---
name: diataxis-docs
description: Write and audit library documentation using the Diataxis framework - tutorial, how-to, reference, explanation - with per-quadrant quality rules, a partitioning matrix, and a coverage-map audit that turns undocumented public API into a ranked debt list. Use when writing docs for a library or feature, auditing documentation coverage, or preparing docs for an OSS launch.
---

# Diataxis Docs

Four quadrants, four different readers. Most bad docs come from writing one
document that tries to be all four.

## Before writing: archaeology

Produce a concept map first — purpose, 3-5 key concepts, the full public
surface, dependencies, edge cases (read the TESTS for these; tests are
where edge cases live), and design decisions worth explaining. No prose
until this exists.

## Partitioning matrix (what each thing needs)

- Public API / component → Reference + How-to (+ Tutorial if it's the
  entry point).
- Config option → How-to + Reference only.
- Internal module / architecture → Reference + Explanation. No tutorial.
- Whole library → all four, tutorial first.

## Per-quadrant hard rules

- **Tutorial** (learning by doing): reader sees something WORK by step 3
  or the tutorial is too slow. One golden path, zero choices offered.
- **How-to** (task): title starts "How to". Every step an imperative
  command — never "consider whether…". Troubleshooting section mandatory
  if the task can fail.
- **Reference** (information): accuracy over elegance. "Accepts a string"
  is insufficient; "accepts a string (max 256 chars, matches `^[a-z-]+$`)"
  is reference-grade. Covers 100% of public surface — no favorites.
- **Explanation** (understanding): lead with the problem, not the solution.
  Name trade-offs explicitly — "we chose X over Y because Z" is the gold
  standard.

## Quality gates before shipping docs

1. Accuracy: every code example actually runs (execute them).
2. Completeness: reference covers the whole public surface.
3. Voice: "You can now…" not "The system provides…". House writing rules
   apply: no em-dashes, no slop words, specifics over adjectives.

## Coverage-map audit (docs debt, for releases)

For every new/changed public-surface item in a diff: a ✅/❌ row across the
four quadrants. Zero-coverage items = critical debt; reference-only = the
common gap (nobody can DO anything with it). Also check architecture
diagrams for drift: entity names in ASCII/Mermaid diagrams that the diff
renamed or removed. Feed the debt list into the release notes or
`oss-launch` pre-flight.
