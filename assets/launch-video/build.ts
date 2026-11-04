#!/usr/bin/env bun
// bun assets/launch-video/build.ts            full rebuild: capture, render, encode, publish
// bun assets/launch-video/build.ts --draft    30 fps wide and tall drafts plus contact sheets in out/
// bun assets/launch-video/build.ts --no-capture   reuse captured frames
// bun assets/launch-video/build.ts --shots proof,desk   recapture only these shots
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { BUNDLE_SIZES } from "../../docs/src/lib/bundle-sizes.generated";
import { capture } from "./capture/capture";
import { SHOTS } from "./capture/shots";
import { render, still } from "./render";

const HERE = dirname(new URL(import.meta.url).pathname);
const OUT = join(HERE, "out");
const PUBLIC = join(HERE, "../../docs/public/launch");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const LIMITS = { film: 8_000_000, tall: 8_000_000, gif: 2_000_000 };

function run(cmd: string, ...rest: string[]): void {
  const r = spawnSync(cmd, rest, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

function writeFilmData(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "film-data.json"), JSON.stringify({ sizes: BUNDLE_SIZES, shots: Object.keys(SHOTS) }));
}

function contact(video: string, name: string, tile: string, width: number, fps: string): void {
  run(
    "ffmpeg", "-y", "-loglevel", "error", "-i", video,
    "-vf", `fps=${fps},scale=${width}:-1,tile=${tile}`,
    "-frames:v", "1", join(OUT, name),
  );
}

/** Two-pass encode to a byte target, so the budget is met on the first try. */
function encode(input: string, output: string, bytes: number, seconds: number): void {
  const kbps = Math.floor((bytes * 8 * 0.97) / seconds / 1000);
  const pass = join(OUT, "x264pass");
  const base = [
    "-y", "-loglevel", "error", "-i", input, "-an",
    "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-b:v", `${kbps}k`, "-maxrate", `${kbps * 3}k`, "-bufsize", `${kbps * 4}k`,
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-passlogfile", pass,
  ];
  run("ffmpeg", ...base, "-pass", "1", "-f", "null", "/dev/null");
  run("ffmpeg", ...base, "-pass", "2", "-movflags", "+faststart", output);
}

const shotsArg = value("shots");
if (shotsArg) await capture(shotsArg.split(","));
else if (!flag("no-capture") && !flag("draft")) await capture([]);
writeFilmData();

if (flag("draft")) {
  const fps = Number(value("fps") ?? 30);
  for (const [name, width, height] of [["wide", 1920, 1080], ["tall", 1080, 1920]] as const) {
    if (value("only") && value("only") !== name) continue;
    const video = join(OUT, `draft-${name}.mp4`);
    await render({ out: video, width, height, fps, crf: 24 });
    contact(video, `contact-${name}.png`, name === "wide" ? "6x6" : "9x4", name === "wide" ? 320 : 200, name === "wide" ? "36/40" : "36/40");
  }
  process.exit(0);
}

mkdirSync(PUBLIC, { recursive: true });
const FILM_FPS = 60;
const wideMaster = join(OUT, "master-wide.mp4");
const tallMaster = join(OUT, "master-tall.mp4");
const seconds = await render({ out: wideMaster, width: 1920, height: 1080, fps: FILM_FPS });
await render({ out: tallMaster, width: 1080, height: 1920, fps: FILM_FPS });
const wideOut = join(PUBLIC, "scrollsheet-launch.mp4");
const tallOut = join(PUBLIC, "scrollsheet-launch-vertical.mp4");
encode(wideMaster, wideOut, LIMITS.film, seconds);
encode(tallMaster, tallOut, LIMITS.tall, seconds);

const posterAt = Number(value("poster") ?? process.env.POSTER_T ?? 4);
await still({ out: join(PUBLIC, "scrollsheet-launch-poster.jpg"), width: 1920, height: 1080, t: posterAt, quality: 90 });

const loop = join(OUT, "master-loop.mp4");
await render({ out: loop, width: 520, height: 1000, fps: 30, cut: "loop", crf: 10 });
const gif = join(PUBLIC, "hero.gif");
for (const [fps, quality] of [[20, 80], [20, 70], [15, 75], [15, 65], [12, 60]] as const) {
  run("gifski", "--quiet", "--fps", String(fps), "--quality", String(quality), "--width", "390", "-o", gif, loop);
  if (statSync(gif).size < LIMITS.gif) break;
}

for (const file of [wideOut, tallOut, gif, join(PUBLIC, "scrollsheet-launch-poster.jpg")]) {
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  console.log(`${file}: ${(statSync(file).size / 1_000_000).toFixed(2)} MB`);
}
if (statSync(wideOut).size > LIMITS.film) throw new Error("wide film over budget");
if (statSync(tallOut).size > LIMITS.tall) throw new Error("tall film over budget");
if (statSync(gif).size > LIMITS.gif) throw new Error("gif over budget");
