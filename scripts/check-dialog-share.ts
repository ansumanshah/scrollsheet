/**
 * Verifies the docs' "browsers with no <dialog> (~4%)" claim against live
 * caniuse data (StatCounter-weighted). Network-dependent by design — run on
 * demand before a release, never in CI:
 *
 *   bun run check:dialog-share
 *
 * Exits non-zero when the live worst case drifts a full point away from the
 * claimed number, i.e. when every "~4%" in README.md, docs.mdx, index.astro
 * and llms-full.txt needs a synchronized edit.
 */

export {};

const CLAIMED_PERCENT = 4;

const FEATURE_URL = "https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/dialog.json";
const FULL_URL = "https://raw.githubusercontent.com/Fyrd/caniuse/main/fulldata-json/data-2.0.json";

interface FeatureJson {
  usage_perc_y: number;
  usage_perc_a: number;
}

interface FullJson {
  agents: Record<string, { usage_global: Record<string, number> }>;
  data: { dialog: { stats: Record<string, Record<string, string>> } };
}

const [feature, full] = (await Promise.all(
  [FEATURE_URL, FULL_URL].map(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }),
)) as [FeatureJson, FullJson];

const supported = feature.usage_perc_y + feature.usage_perc_a;

let tracked = 0;
const knownNo = new Map<string, number>();
for (const [browser, agent] of Object.entries(full.agents)) {
  const stats = full.data.dialog.stats[browser] ?? {};
  for (const [version, usage] of Object.entries(agent.usage_global)) {
    tracked += usage;
    if ((stats[version] ?? "u").startsWith("n")) {
      knownNo.set(browser, (knownNo.get(browser) ?? 0) + usage);
    }
  }
}

const worstCase = 100 - supported;
const knownNoTotal = [...knownNo.values()].reduce((sum, v) => sum + v, 0);
const untracked = 100 - tracked;
const fmt = (n: number) => `${n.toFixed(2)}%`;

console.log(`<dialog> support, caniuse ${new Date().toISOString().slice(0, 10)}`);
console.log(`  supported:          ${fmt(supported)}`);
console.log(`  worst case without: ${fmt(worstCase)}  (docs claim ~${CLAIMED_PERCENT}%)`);
console.log(`  known unsupporting: ${fmt(knownNoTotal)}`);
for (const [browser, usage] of [...knownNo.entries()].sort((a, b) => b[1] - a[1])) {
  if (usage >= 0.05) console.log(`    ${browser}: ${fmt(usage)}`);
}
console.log(`  untracked traffic:  ${fmt(untracked)}  (counted against us in the worst case)`);

if (Math.abs(worstCase - CLAIMED_PERCENT) >= 1) {
  console.error(
    `\nClaim drifted: live worst case ${fmt(worstCase)} vs claimed ~${CLAIMED_PERCENT}%. ` +
      "Update every occurrence (rg '~4%') and CLAIMED_PERCENT here.",
  );
  process.exit(1);
}
console.log("\nClaim holds.");
