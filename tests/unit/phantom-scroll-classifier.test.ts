import { describe, expect, test } from "bun:test";

import {
  isPhantomScrollStep,
  PHANTOM_SCROLL_JUMP_PX,
  USER_SCROLL_ATTRIBUTION_MS,
} from "../../packages/scrollsheet/src/internal/content-helpers";

/**
 * The two-factor boundary, pinned as executable spec. Every case here maps
 * to a documented contract line (content-helpers' PHANTOM_SCROLL_JUMP_PX
 * doc + the 2026-08-16 review findings) — if one of these flips, the docs
 * and the a11y tradeoff flip with it, not just an implementation detail.
 */

const NOW = 100_000;
const STALE = NOW - USER_SCROLL_ATTRIBUTION_MS - 1;
const FRESH = NOW - USER_SCROLL_ATTRIBUTION_MS + 100;
const JUMP = PHANTOM_SCROLL_JUMP_PX + 1;
const STEP = PHANTOM_SCROLL_JUMP_PX - 1;

const phantom = (
  overrides: Partial<{
    prev: number | null;
    pos: number;
    guard: boolean;
    lastInput: number;
    tween: boolean;
    drag: boolean;
    wheel: boolean;
  }> = {},
) => {
  const v = {
    prev: 400 as number | null,
    pos: 400 - JUMP,
    guard: true,
    lastInput: STALE,
    tween: false,
    drag: false,
    wheel: false,
    ...overrides,
  };
  return isPhantomScrollStep(v.prev, v.pos, v.guard, v.lastInput, NOW, v.tween, v.drag, v.wheel);
};

describe("isPhantomScrollStep", () => {
  test("a stale over-floor teleport is phantom", () => {
    expect(phantom()).toBe(true);
  });

  test("direction does not matter — an upward teleport classifies the same", () => {
    expect(phantom({ pos: 400 + JUMP })).toBe(true);
  });

  test("recent input on the dialog credits the same teleport to the user", () => {
    expect(phantom({ lastInput: FRESH })).toBe(false);
  });

  test("a sub-floor step never classifies, no matter how stale — the screen-reader/momentum contract", () => {
    expect(phantom({ pos: 400 - STEP, lastInput: 0 })).toBe(false);
  });

  test("compact-sheet exemption: a closed-stop hop under the floor is trusted BY DESIGN", () => {
    // A 90px resting detent's full dismiss teleport (review finding 1).
    // Deliberately uncovered: this hop is geometrically identical to an
    // assistive single-jump dismiss, and winding it back would trap AT
    // users. If this expectation ever flips, the a11y tradeoff documented
    // on PHANTOM_SCROLL_JUMP_PX must be re-decided first.
    expect(phantom({ prev: 90, pos: 0, lastInput: 0 })).toBe(false);
  });

  test("the first observed frame (null prev) is never phantom", () => {
    expect(phantom({ prev: null })).toBe(false);
  });

  test("guard opt-out clears every frame", () => {
    expect(phantom({ guard: false })).toBe(false);
  });

  test("ownership exemptions: tween, drag session, wheel session each clear the frame", () => {
    expect(phantom({ tween: true })).toBe(false);
    expect(phantom({ drag: true })).toBe(false);
    expect(phantom({ wheel: true })).toBe(false);
  });

  test("a reset stamp (0 = no input this presentation) leaves a teleport phantom", () => {
    // The reopen-cycle fix (review finding 2): per-attachment reset means
    // the previous session's tap can never vouch for this session's jump.
    expect(phantom({ lastInput: 0 })).toBe(true);
  });

  test("the zero sentinel is stale BY DEFINITION, even on a page younger than the window", () => {
    // now - 0 < 1500 on a young page — subtraction alone would read the
    // sentinel as fresh input and blind the guard exactly when a
    // defaultOpen sheet needs it (caught live by the reopen spec under
    // reduced motion).
    expect(isPhantomScrollStep(400, 400 - JUMP, true, 0, 700, false, false, false)).toBe(true);
  });

  test("a real stamp on a young page still reads fresh", () => {
    expect(isPhantomScrollStep(400, 400 - JUMP, true, 650, 700, false, false, false)).toBe(false);
  });
});
