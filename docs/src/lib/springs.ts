import { spring } from "scrollsheet/motion";

/*
 * Site chrome uses the library's own spring solver, compiled to linear(),
 * so a copy button and a sheet settle with the same physics. Tokens follow
 * the snappy / default pair: snappy for small controls, default for panels.
 */
const snappy = spring({ stiffness: 320, damping: 30 });
const base = spring({ stiffness: 170, damping: 26 });

export const springCss =
  `:root{--spring-snappy:${snappy.easing};--spring-snappy-dur:${snappy.durationMs}ms;` +
  `--spring-default:${base.easing};--spring-default-dur:${base.durationMs}ms}`;
