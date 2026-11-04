#!/usr/bin/env bun
// bun assets/launch-video/strip.ts <label> <startSeconds> <endSeconds> [--tall]
// Renders a range at 60 fps and tiles consecutive frames into out/strip-<label>.png for motion review.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

import { render } from "./render";

const OUT = join(dirname(new URL(import.meta.url).pathname), "out");
const [label, start, end] = process.argv.slice(2);
const tall = process.argv.includes("--tall");
const video = join(OUT, `strip-${label}.mp4`);
await render({
  out: video,
  width: tall ? 1080 : 1920,
  height: tall ? 1920 : 1080,
  fps: 60,
  crf: 18,
  start: Number(start),
  end: Number(end),
});
const every = Math.max(1, Math.round(((Number(end) - Number(start)) * 60) / 24));
spawnSync(
  "ffmpeg",
  [
    "-y", "-loglevel", "error", "-i", video,
    "-vf", `select='not(mod(n\\,${every}))',scale=${tall ? 200 : 320}:-1,tile=${tall ? "12x2" : "6x4"}`,
    "-fps_mode", "vfr", "-frames:v", "1", join(OUT, `strip-${label}.png`),
  ],
  { stdio: "inherit" },
);
