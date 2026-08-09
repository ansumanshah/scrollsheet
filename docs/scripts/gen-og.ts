#!/usr/bin/env bun
/**
 * Renders scripts/og.svg to public/og.png (1200x630, the Open Graph /
 * Twitter card image). Run after editing og.svg so the two never drift —
 * @resvg/resvg-js is a proven, maintained SVG rasterizer, not a hand-rolled
 * renderer.
 */
import { Resvg } from "@resvg/resvg-js";

const svgPath = new URL("./og.svg", import.meta.url);
const outPath = new URL("../public/og.png", import.meta.url);

const svg = await Bun.file(svgPath).text();
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
const png = resvg.render().asPng();

await Bun.write(outPath, png);
console.log(`✔ wrote ${outPath.pathname} (${png.byteLength} bytes)`);
