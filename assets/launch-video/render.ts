import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
};

export interface RenderOptions {
  out: string;
  width: number;
  height: number;
  fps: number;
  cut?: "film" | "loop";
  crf?: number;
  start?: number;
  end?: number;
}

/** Steps window.seek(t) in the film page and pipes every screenshot straight into ffmpeg. */
export async function render(opts: RenderOptions): Promise<number> {
  mkdirSync(dirname(opts.out), { recursive: true });
  const root = resolve(HERE);
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      const file = join(root, path);
      if (!file.startsWith(root + sep)) return new Response("no", { status: 403 });
      const f = Bun.file(file);
      if (!(await f.exists())) return new Response("not found", { status: 404 });
      return new Response(f, {
        headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream" },
      });
    },
  });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => console.error(`film error: ${e.message}`));
  await page.goto(`http://localhost:${server.port}/film/index.html?cut=${opts.cut ?? "film"}`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => (window as unknown as { __duration: number }).__duration);

  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(opts.fps), "-i", "-",
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v", "libx264", "-preset", "fast", "-crf", String(opts.crf ?? 12),
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-r", String(opts.fps), opts.out,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const from = opts.start ?? 0;
  const to = Math.min(opts.end ?? duration, duration);
  const total = Math.round((to - from) * opts.fps);
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => (window as unknown as { seek(t: number): Promise<void> }).seek(t), from + i / opts.fps);
    const shot = await page.screenshot({ type: "jpeg", quality: 96 });
    if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % (opts.fps * 10) === 0) console.log(`  ${(i / opts.fps).toFixed(0)}s of ${(total / opts.fps).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  server.stop(true);
  console.log(`  ${opts.out} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  return duration;
}

/** Writes one exact frame, for the poster. */
export async function still(opts: { out: string; width: number; height: number; t: number; quality: number }): Promise<void> {
  const root = resolve(HERE);
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const file = join(root, decodeURIComponent(new URL(req.url).pathname));
      const f = Bun.file(file);
      if (!(await f.exists())) return new Response("not found", { status: 404 });
      return new Response(f, { headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream" } });
    },
  });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: opts.width, height: opts.height } });
  await page.goto(`http://localhost:${server.port}/film/index.html`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((t) => (window as unknown as { seek(t: number): Promise<void> }).seek(t), opts.t);
  await page.screenshot({ path: opts.out, type: "jpeg", quality: opts.quality });
  await browser.close();
  server.stop(true);
}
