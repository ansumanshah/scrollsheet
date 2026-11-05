#!/usr/bin/env bun
// bun assets/launch-video/sound.ts [--out dir]
// Sound-effects cut for social posts. The site's film stays silent; these outputs are never published
// from docs/public. Run the film build first: this muxes onto its mp4s and reads its captured metrics.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { spring } from "./film/motion.js";
import type { FrameMetrics } from "./capture/harness";
import { type FilmTimeline, readTimeline } from "./render";

type CueType = "click" | "thump" | "pop" | "whoosh";

interface Cue {
  t: number;
  type: CueType;
  why: string;
}

interface Shot {
  frames: FrameMetrics[];
  marks: Record<string, number>;
}

const HERE = dirname(new URL(import.meta.url).pathname);
const FRAMES = join(HERE, "out/frames");
const WORK = join(HERE, "out/sound");
const PUBLIC = join(HERE, "../../docs/public/launch");
const KIT = process.env.MOTION_FIRST_KIT ?? join(homedir(), ".agents/skills/motion-first");
const outFlag = process.argv.indexOf("--out");
const OUT = outFlag >= 0 ? resolve(process.argv[outFlag + 1]!) : WORK;

// A spring has no impact moment, so a motion "lands" once it is within 2% of its travel from rest.
const LANDED = 0.02;
// Mount to arrival for a toast, read off the captured frames: fully opaque and 90% of the way in.
const TOAST_ARRIVAL_FRAMES = 10;
// sfx.mjs shapes the whoosh as a half sine over 0.35 s, so its peak sits at the midpoint.
const WHOOSH_PEAK = 0.175;
const DEFAULT_SPRING = [170, 26] as const;
const TARGET_LUFS = -14;
// Under the -1.5 dBTP delivery ceiling, because the AAC encode overshoots slightly.
const PEAK_CEILING = -2;

// Stems stay well under full scale; the sum gets one static gain. The soft clip adds harmonics so
// the thump, which is under 90 Hz, still registers on phone speakers.
const STEMS: Record<CueType, string> = {
  click: "volume=0.25",
  pop: "volume=0.4",
  thump: "volume=2,asoftclip=type=tanh,volume=0.35",
  whoosh: "highpass=f=400,lowpass=f=5000,volume=0.5",
};

const CUTS = [
  { silent: "scrollsheet-launch.mp4", out: "scrollsheet-launch-sound.mp4", cut: "wide", w: 1920, h: 1080 },
  { silent: "scrollsheet-launch-vertical.mp4", out: "scrollsheet-launch-vertical-sound.mp4", cut: "tall", w: 1080, h: 1920 },
] as const;

function run(cmd: string, ...rest: string[]): void {
  const r = spawnSync(cmd, rest, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

/** One gain for the whole mix: toward the loudness target, stopping at the peak ceiling. */
function staticGain(wav: string): number {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", wav, "-af", "ebur128=peak=true", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const summary = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(peak)) throw new Error(`no loudness for ${wav}`);
  const gain = Math.min(TARGET_LUFS - lufs, PEAK_CEILING - peak);
  console.log(`  mix ${lufs} LUFS, ${peak} dBTP, gain ${gain.toFixed(2)} dB`);
  return gain;
}

const shots: Record<string, Shot> = {};
for (const name of ["proof", "keyboard", "desk", "toasts", "vaul"]) {
  shots[name] = (await Bun.file(join(FRAMES, name, "metrics.json")).json()) as Shot;
}

/** Each real drag in a shot, as the frame it lands on its snap stop. */
function dragLandings(shot: Shot): { frame: number; stop: number }[] {
  const { frames } = shot;
  const downs = frames.flatMap((m, i) => (i > 0 && m.finger && !frames[i - 1]!.finger ? [i] : []));
  const out: { frame: number; stop: number }[] = [];
  downs.forEach((down, n) => {
    const start = frames[down]!;
    if (!start.modal) return;
    const rest = frames[(downs[n + 1] ?? frames.length) - 1]!.scrollTop;
    const travel = Math.abs(rest - start.scrollTop);
    if (travel < 50) return;
    if (!start.stops.some((s) => Math.abs(s - rest) < 1))
      throw new Error(`drag at frame ${down} rests at ${rest}, not a snap stop`);
    const frame = frames.findIndex(
      (m, i) => i >= down && Math.abs(m.scrollTop - rest) <= travel * LANDED,
    );
    out.push({ frame, stop: rest });
  });
  return out;
}

/** Each sheet opening in a shot, as the frame its panel settles, on whichever axis it travelled. */
function openSettles(shot: Shot): number[] {
  const { frames } = shot;
  const opens = frames.flatMap((m, i) => (i > 0 && m.modal && !frames[i - 1]!.modal ? [i] : []));
  return opens.map((open) => {
    const start = frames[open]!;
    const rest = frames[open + 60]!;
    const key =
      Math.abs((start.panelLeft ?? 0) - (rest.panelLeft ?? 0)) >
      Math.abs((start.panelTop ?? 0) - (rest.panelTop ?? 0))
        ? "panelLeft"
        : "panelTop";
    const target = rest[key]!;
    const tolerance = Math.abs(start[key]! - target) * LANDED;
    return frames.findIndex((m, i) => i >= open && Math.abs((m[key] ?? Infinity) - target) <= tolerance);
  });
}

function buildCues(tl: FilmTimeline): Cue[] {
  const cues: Cue[] = [];
  const at = (shot: string, frame: number) =>
    tl.T[shot]! + frame / tl.fps - (shot === "keyboard" ? tl.keyboardSkip : 0);
  const add = (t: number, type: CueType, why: string, floor = 0) => {
    if (t >= floor) cues.push({ t: Math.round(t * 1000) / 1000, type, why });
  };

  for (const shot of ["proof", "vaul"]) {
    for (const { frame, stop } of dragLandings(shots[shot]!)) {
      add(at(shot, frame), "click", `${shot}: drag lands on stop ${stop} (frame ${frame})`);
    }
  }
  // The keyboard scene cuts in after its sheet has opened, so the floor drops that one.
  for (const shot of ["proof", "keyboard", "desk", "vaul"]) {
    for (const frame of openSettles(shots[shot]!)) {
      add(at(shot, frame), "thump", `${shot}: sheet settles (frame ${frame})`, tl.T[shot]);
    }
  }
  let settle = 0;
  while (spring(settle, ...DEFAULT_SPRING) < 1 - LANDED) settle += 1 / 240;
  add(tl.lastMarkSheet + settle, "thump", "end card: last sheet of the mark settles");

  const { frames } = shots.toasts!;
  frames.forEach((m, i) => {
    if (i > 0 && m.toasts > frames[i - 1]!.toasts) {
      add(at("toasts", i + TOAST_ARRIVAL_FRAMES), "pop", `toast ${m.toasts} arrives (mount frame ${i})`);
    }
  });

  // Centre the whoosh on the fastest moment of the middle wipe panel: a critically damped spring
  // peaks in speed at 1/w0.
  const fastest = tl.wipeStagger + 1 / Math.sqrt(DEFAULT_SPRING[0]);
  tl.wipes.forEach((wipe, i) => add(wipe + fastest - WHOOSH_PEAK, "whoosh", `wipe ${i + 1}`));

  cues.sort((a, b) => a.t - b.t);
  if (cues.length < 15 || cues.length > 25) throw new Error(`${cues.length} cues, want 15 to 25`);
  return cues;
}

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
const all: Record<string, Cue[]> = {};

for (const { silent, out, cut, w, h } of CUTS) {
  const timeline = await readTimeline(w, h);
  const cues = buildCues(timeline);
  all[cut] = cues;
  const inputs: string[] = [];
  const graph: string[] = [];
  const types = Object.keys(STEMS) as CueType[];
  types.forEach((type, i) => {
    const cueFile = join(WORK, `${cut}-${type}.json`);
    const wav = join(WORK, `${cut}-${type}.wav`);
    writeFileSync(cueFile, JSON.stringify(cues.filter((c) => c.type === type)));
    run("node", join(KIT, "sfx.mjs"), cueFile, wav);
    inputs.push("-i", wav);
    graph.push(`[${i}:a]${STEMS[type]}[s${i}]`);
  });
  // Pad to the film's length: the mux trims to the shorter stream and copies video, so a short mix
  // would cut the end card off.
  graph.push(
    `${types.map((_, i) => `[s${i}]`).join("")}amix=inputs=${types.length}:normalize=0:duration=longest,apad,atrim=end=${timeline.duration}[mix]`,
  );
  const mix = join(WORK, `${cut}-mix.wav`);
  run("ffmpeg", "-y", "-loglevel", "error", ...inputs, "-filter_complex", graph.join(";"), "-map", "[mix]", "-ar", "48000", mix);
  // Not the kit's mux.sh: single-pass loudnorm rides its gain over seconds, which lifts every sparse
  // hit to the ceiling and erases the mix, and it resamples to 96 kHz AAC.
  run(
    "ffmpeg", "-y", "-loglevel", "error", "-i", join(PUBLIC, silent), "-i", mix,
    "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-af", `volume=${staticGain(mix).toFixed(2)}dB`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-shortest", "-movflags", "+faststart", join(OUT, out),
  );
  console.log(`${cut}: ${cues.length} cues, ${timeline.duration.toFixed(2)}s`);
}

writeFileSync(join(OUT, "cues.json"), `${JSON.stringify(all, null, 2)}\n`);
