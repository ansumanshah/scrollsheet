---
name: devex-review
description: Live developer-experience audit of a library or tool - install it as a stranger in a clean directory, measure time-to-hello-world, probe error messages, score the seven DX characteristics with the gap method, and rank fixes. Use before an OSS launch, when asked to audit DX, review onboarding, check getting-started friction, or explain weak adoption.
---

# DevEx Review

Audit the adoption path, not the code. Run it as a stranger: clean scratch
dir, README only, stopwatch running. The library is judged in its first
five minutes, not its architecture.

## The live audit

1. **T0 run**: fresh scratch dir. Follow ONLY the public README (no repo
   knowledge, no source peeking). Install → first visible success.
   Record every stumble verbatim: missing peer dep, unexplained config,
   copy-paste block that doesn't run.
2. **TTHW clock**: <2 min champion (3-4x adoption) · 2-5 min competitive ·
   5-10 min drop-off · >10 min red flag (50-70% abandon).
3. **Error empathy probes**: break it on purpose three ways (wrong prop,
   missing provider/setup step, SSR/environment mismatch). Each error must
   state problem + cause + fix. Score each message.
4. **Docs surface**: if there's a docs site, drive it with the browser
   stack (agent-browser/playwright) — can a dev find "how do I X" for the
   three most likely X's in under a minute each?
5. **Upgrade fear check**: changelog exists? Breaking changes named?
   Migration path from the obvious competitor (for a vaul-style lib: a
   real migration section)?

## Score: the seven characteristics (0-10 each, gap method)

Usable (Stripe: one key, one curl) · Credible (TypeScript: never breaks JS)
· Findable (React: every question answered) · Useful (Tailwind: 95% of
needs) · Valuable (Next: many tools replaced by one) · Accessible (works
junior to principal) · Desirable (devs WANT it, not tolerate it).

For every score, state what a 10 looks like FOR THIS LIBRARY — then the
fixes are just the gap, ranked by adoption impact.

## Principles that decide close calls

- Zero friction at T0; hello world without reading docs is the bar.
- Decide for me, let me override: opinionated defaults + escape hatches.
- Show code in context: real usage with real error handling, not toy demos.
- Pit of Success: the right way must be the easy way.
- Progressive disclosure: the simple case is production-ready, and the
  complex case uses the same API.

## Output

Ranked fix list (max 10): each with the characteristic it moves, the score
gap it closes, and effort (S/M/L). Top 3 become pre-launch blockers if the
audit runs before a launch (feed them into `oss-launch` pre-flight).
Verbatim stumble log attached — the stumbles ARE the evidence.
