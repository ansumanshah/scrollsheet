import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { Take } from "./harness";
import { SHOTS } from "./shots";

const HERE = dirname(new URL(import.meta.url).pathname);
const OUT = join(HERE, "../out/frames");

/** Captures the named shots (all when empty). Bundles the library straight from src. */
export async function capture(names: string[]): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const built = await Bun.build({
    entrypoints: [join(HERE, "app.tsx")],
    target: "browser",
    format: "esm",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!built.success) throw new Error(built.logs.map((l) => l.message).join("\n"));
  const js = await built.outputs[0]!.text();
  const html = await Bun.file(join(HERE, "index.html")).text();
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/app.js")
        return new Response(js, { headers: { "content-type": "text/javascript" } });
      if (path === "/") return new Response(html, { headers: { "content-type": "text/html" } });
      return new Response("not found", { status: 404 });
    },
  });
  const base = `http://localhost:${server.port}`;
  const browser = await chromium.launch();
  try {
    for (const name of names.length ? names : Object.keys(SHOTS)) {
      const spec = SHOTS[name];
      if (!spec) throw new Error(`unknown shot ${name}`);
      const started = Date.now();
      const take = await Take.start(browser, base, name, OUT, spec);
      await spec.run(take);
      await take.end();
      const dragged = take.metrics.filter((m) => m.dragging).length;
      console.log(
        `${name}: ${take.metrics.length} frames in ${((Date.now() - started) / 1000).toFixed(0)}s, ` +
          `pointer-engine frames ${dragged}`,
      );
    }
  } finally {
    await browser.close();
    server.stop(true);
  }
}

if (import.meta.main) await capture(process.argv.slice(2));
