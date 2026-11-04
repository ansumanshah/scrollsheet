# Launch video

The launch film as code. Rebuild everything with one command:

```sh
bun assets/launch-video/build.ts
```

Writes to `docs/public/launch/`: `scrollsheet-launch.mp4` (1920x1080), `scrollsheet-launch-vertical.mp4`
(1080x1920), `scrollsheet-launch-poster.jpg` and `hero.gif`. Needs ffmpeg, gifski and Playwright's Chromium.

| Command | Does |
| --- | --- |
| `bun assets/launch-video/build.ts --no-capture` | Reuse captured frames, re-render and re-encode |
| `bun assets/launch-video/build.ts --shots proof,desk` | Recapture only these shots, then build |
| `bun assets/launch-video/build.ts --reuse-masters` | Only re-encode from the masters in `out/` |
| `bun assets/launch-video/build.ts --draft --fps 15` | Fast drafts and contact sheets in `out/` |
| `bun assets/launch-video/strip.ts drag 3 4.2` | Consecutive 60 fps frames of one moment, in `out/` |

## How it works

**`capture/`** runs the real library from `packages/scrollsheet/src`, frame by frame. Playwright's fake
clock drives timers and `requestAnimationFrame`; WAAPI and CSS animations are paused and seeked to that
clock each frame. Touch input is real CDP touch, so the drag is a native scroll, and each run reports how
many frames used the pointer engine (it must be 0 for touch shots). Each frame saves a JPEG plus the values
the film reads back: `:modal`, `scrollTop`, `scroll-snap-type`, snap stops, panel position.

**`film/`** is a pure `window.seek(t)` page that composites those frames with type. Scene timing comes from
marks recorded during capture, and sizes come from `docs/src/lib/bundle-sizes.generated.ts`, so neither is
hard-coded. Layout is a function of the frame, which is how one timeline renders both cuts.

## What is not the library

- **The finger, cursor and keyboard are drawn by the film.** Their positions come from the capture.
- **The software keyboard is emulated.** Headless Chromium has none, so the capture uses the same
  `visualViewport` stub as `tests/e2e/regression/keyboard-gaps.spec.ts`. The library's keyboard code runs
  for real against it; the keys are a drawing.
- **The end of each drag is held.** Browser snap runs in real time and cannot be stepped, so the finger stays
  down (hidden) along a spring onto the exact snap stop and lifts there. The rest positions are the library's
  own stops, but that final curve is the film's, not the browser's snap curve.

`STYLE.md` has the palette, type and motion rules.
