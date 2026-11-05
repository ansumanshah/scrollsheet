# Launch film style guide

## Reference

Grammar taken from product release reels that show the running interface at large scale with one
claim on screen at a time (Linear release clips), and from flat colour-block film cuts (Teenage
Engineering product films). Only the grammar: no footage, layouts or assets are reused.

The bar to beat was a 25 fps, 696 px wide real-time recording with no type and no argument.

## The one idea

The mark is three sheets rising. So the film's transition is three sheets rising: the same 0.3, 0.55
and 1.0 opacities as `assets/brand/mark.svg`, with rounded top corners, settling on a spring.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| ink | `#0a0a0b` | proof and closing backgrounds |
| violet | `#534AB7` | mark tile, keyboard and size backgrounds |
| lavender | `#AFA9EC` | code and live values on dark |
| paper | `#f2f1ee` | code diff background |
| white | `#ffffff` | type on violet |
| muted | `#a8a49c` | secondary type on dark |

## Type

System stack, same as scrollsheet.dev: `ui-sans-serif, system-ui`; `ui-monospace` for code. Headlines
700 weight, tracking -0.035em. Rendered on macOS; other platforms substitute their system font.

## Motion

Springs only, from `film/motion.js`: type on `default` (170, 26) with no overshoot, wipes on `default`,
camera on `heavy` (90, 22), exits on `snappy` (320, 30). Words rise out of a line mask. Nothing fades in
on its own.

## Rules

- One claim on screen at a time. Every claim stays long enough to read aloud.
- Readouts are not decoration: `:modal`, `scrollTop`, `scroll-snap-type` and the detent ticks are read
  from the running page on each captured frame.
- No corner labels, borders, glow, particles or centred-on-gradient titles.
- All numbers come from `docs/src/lib/bundle-sizes.generated.ts`.
