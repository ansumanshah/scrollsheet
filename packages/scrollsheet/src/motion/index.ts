/**
 * @experimental Framework-agnostic motion core: spring/WAAPI/scroll math with
 * zero React imports (enforced by tests/unit/motion/no-react-import.test.ts).
 * No semver promise yet — the surface may reshape as the v1.1 feature briefs
 * land on top of it.
 */
export { spring, sampleSpringAt, type SpringConfig, type SpringCurve } from "./spring";
export { animate, type AnimateHandle } from "./animate";
export { animateScrollTo, type ScrollAnimation } from "./scroll-animator";
export { geometryFor, mapScroll, recedeTransform, type Side, type SideGeometry } from "./geometry";
