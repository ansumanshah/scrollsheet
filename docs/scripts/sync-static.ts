/**
 * Copies the canonical single-source files into docs/public before dev/build:
 * registry/*.json (the raw.githubusercontent install path documented in the
 * README) and the root llms.txt. The copies are gitignored — this script is
 * the only writer, so the served files can never drift from the canonical
 * ones the way the old hand-maintained duplicates did.
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const pub = join(import.meta.dir, "..", "public");

await mkdir(join(pub, "r"), { recursive: true });
for (const name of await readdir(join(root, "registry"))) {
  if (!name.endsWith(".json")) continue;
  await Bun.write(join(pub, "r", name), Bun.file(join(root, "registry", name)));
}
await Bun.write(join(pub, "llms.txt"), Bun.file(join(root, "llms.txt")));
console.log("synced registry/ and llms.txt into docs/public");
