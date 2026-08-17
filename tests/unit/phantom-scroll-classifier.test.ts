import { describe, expect, test } from "bun:test";

import {
  isPhantomScrollStep,
  PHANTOM_SCROLL_JUMP_PX,
  USER_SCROLL_ATTRIBUTION_MS,
} from "../../packages/scrollsheet/src/internal/content-helpers";

/**
 * The two-factor boundary as executable spec: if a case here flips, the
 * PHANTOM_SCROLL_JUMP_PX docs and the a11y tradeoff flip with it.
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
    // Identical to an assistive single-jump dismiss; winding it back would
    // trap AT users (PHANTOM_SCROLL_JUMP_PX doc).
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
    expect(phantom({ lastInput: 0 })).toBe(true);
  });

  test("the zero sentinel is stale BY DEFINITION, even on a page younger than the window", () => {
    // Subtraction alone reads 0 as fresh for the first 1.5s of page life.
    expect(isPhantomScrollStep(400, 400 - JUMP, true, 0, 700, false, false, false)).toBe(true);
  });

  test("a real stamp on a young page still reads fresh", () => {
    expect(isPhantomScrollStep(400, 400 - JUMP, true, 650, 700, false, false, false)).toBe(false);
  });
});
