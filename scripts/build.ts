import assert from "node:assert/strict";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import dts from "bun-plugin-dts";

const pkg = resolve(import.meta.dir, "../packages/scrollsheet");
const src = `${pkg}/src`;
const dist = `${pkg}/dist`;
const entries = ["index.ts", "drawer/index.tsx", "dialog/index.tsx", "toast/index.tsx"];
const cssStubs: Bun.BunPlugin = {
  name: "css-stubs",
  setup(build) {
    build.onResolve(
      { filter: /(?:^|\/)(?:(?:core|toast)-css\.generated|inject-styles)(?:\.ts)?$/ },
      () => ({ path: `${src}/internal/css-stubs.ts` }),
    );
  },
};

await rm(dist, { recursive: true, force: true });

for (const nodeEnv of ["production", "development"]) {
  for (const auto of [false, true]) {
    const outdir = `${dist}${nodeEnv === "development" ? "/dev" : ""}${auto ? "/auto" : ""}`;
    const result = await Bun.build({
      entrypoints: [...entries, ...(auto ? [] : ["motion/index.ts"])].map(
        (entry) => `${src}/${entry}`,
      ),
      root: src,
      outdir,
      target: "browser",
      format: "esm",
      splitting: true,
      modulePreload: false,
      external: ["react", "react-dom", "react/jsx-runtime"],
      naming: { entry: "[dir]/[name].mjs", chunk: "chunk-[hash].mjs" },
      banner: '"use client";',
      define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv) },
      minify: { syntax: true, whitespace: false, identifiers: false },
      plugins: [
        ...(auto ? [] : [cssStubs]),
        ...(nodeEnv === "production"
          ? [
              dts({
                output: { noBanner: true, exportReferencedTypes: false },
                compilationOptions: {
                  preferredConfigPath: resolve(import.meta.dir, "../tsconfig.declarations.json"),
                },
              }),
            ]
          : []),
      ],
    });
    if (!result.success) throw new AggregateError(result.logs, `Build failed: ${outdir}`);
    // Next's client boundary must survive shared and lazy chunk splitting.
    for (const output of result.outputs) {
      assert(
        (await output.text()).startsWith('"use client";'),
        `${output.path} is missing its client boundary`,
      );
    }
    console.log(`${outdir}: ${result.outputs.length} chunks`);
  }
}

// Snapshot before moving files so the scan cannot revisit the new types directory.
const declarations = [...new Bun.Glob("**/*.d.ts").scanSync(dist)];
for (const file of declarations) {
  const target = resolve(dist, "types", file);
  await mkdir(dirname(target), { recursive: true });
  await rename(resolve(dist, file), target);
}
