import { describe, expect, it } from "vitest";
import {
  projectMomentum,
  rubberBand,
  Spring,
  SPRING_MOVE,
  SPRING_SHEET,
} from "@/lib/spring";

/**
 * The spring, stepped rather than watched.
 *
 * The whole reason for integrating it by hand instead of pulling in a library
 * is that the motion is then testable: `step` is pure arithmetic, so "does not
 * overshoot", "settles", and "survives a dropped frame" are assertions rather
 * than opinions held after looking at a phone.
 */

/** Run to rest at 60Hz, returning every value on the way. */
function settle(s: Spring, maxSeconds = 5): number[] {
  const values: number[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const done = s.step(dt);
    values.push(s.value);
    if (done) return values;
  }
  throw new Error(`did not settle within ${maxSeconds}s`);
}

describe("Spring", () => {
  it("arrives exactly on target and stops", () => {
    const s = new Spring(0, SPRING_MOVE);
    s.setTarget(100);
    const values = settle(s);
    expect(s.value).toBe(100);
    expect(s.velocity).toBe(0);
    expect(values.length).toBeGreaterThan(5);
  });

  it("does not overshoot when critically damped", () => {
    const s = new Spring(0, SPRING_MOVE);
    s.setTarget(100);
    for (const v of settle(s)) expect(v).toBeLessThanOrEqual(100);
  });

  it("overshoots a little when underdamped, which is the point of the sheet", () => {
    const s = new Spring(0, SPRING_SHEET);
    s.setTarget(100);
    expect(Math.max(...settle(s))).toBeGreaterThan(100);
  });

  it("settles in roughly the response time it was given", () => {
    const s = new Spring(0, { response: 0.4, damping: 1 });
    s.setTarget(100);
    const frames = settle(s).length;
    // Critical damping takes a few time constants to reach the rest
    // threshold; what matters is that 0.4s is the order, not 4s or 0.04s.
    expect(frames / 60).toBeGreaterThan(0.2);
    expect(frames / 60).toBeLessThan(1.2);
  });

  it("carries a handed-off velocity into the motion", () => {
    const thrown = new Spring(0, SPRING_MOVE);
    thrown.setTarget(0);
    thrown.handoff(0, 400);
    // Given a push away from a target it is already sitting on, it must move.
    thrown.step(1 / 60);
    expect(thrown.value).toBeGreaterThan(0);
    settle(thrown);
    expect(thrown.value).toBe(0);
  });

  it("survives a backgrounded tab handing it a ten second frame", () => {
    const s = new Spring(0, SPRING_SHEET);
    s.setTarget(100);
    s.step(10);
    expect(Number.isFinite(s.value)).toBe(true);
    // Substepping means it has integrated its way to rest, not exploded.
    expect(s.value).toBeCloseTo(100, 1);
  });

  it("reaches the same place at 30Hz as at 120Hz", () => {
    const slow = new Spring(0, SPRING_MOVE);
    const fast = new Spring(0, SPRING_MOVE);
    slow.setTarget(100);
    fast.setTarget(100);
    for (let i = 0; i < 30; i++) slow.step(1 / 30);
    for (let i = 0; i < 120; i++) fast.step(1 / 120);
    expect(slow.value).toBeCloseTo(fast.value, 1);
  });

  it("redirects mid-flight without losing its velocity", () => {
    const s = new Spring(0, SPRING_MOVE);
    s.setTarget(100);
    for (let i = 0; i < 10; i++) s.step(1 / 60);
    const moving = s.velocity;
    expect(moving).toBeGreaterThan(0);
    s.setTarget(0);
    expect(s.velocity).toBe(moving);
  });
});

describe("projectMomentum", () => {
  it("is zero for a gesture that ended still", () => {
    expect(projectMomentum(0)).toBe(0);
  });

  it("scales with speed and keeps its sign", () => {
    expect(projectMomentum(1000)).toBeGreaterThan(projectMomentum(500));
    expect(projectMomentum(-1000)).toBeLessThan(0);
  });

  it("turns a hard flick into a real distance", () => {
    // A 1500px/s flick is a decisive one, and should project far enough to
    // clear a third of any sheet on a phone.
    expect(projectMomentum(1500)).toBeGreaterThan(300);
  });
});

describe("rubberBand", () => {
  it("gives nothing back at zero", () => {
    expect(rubberBand(0, 400)).toBe(0);
  });

  it("tracks the finger at first and then resists", () => {
    const near = rubberBand(10, 400);
    expect(near / 10).toBeGreaterThan(0.5);
    expect(near).toBeLessThan(10);
    // Ten times the pull does not give ten times the movement.
    expect(rubberBand(100, 400)).toBeLessThan(near * 10);
  });

  it("never exceeds the dimension, however hard it is pulled", () => {
    expect(rubberBand(100_000, 400)).toBeLessThan(400);
  });

  it("is symmetric", () => {
    expect(rubberBand(-60, 400)).toBeCloseTo(-rubberBand(60, 400), 10);
  });

  it("is safe on an unmeasured element", () => {
    expect(rubberBand(50, 0)).toBe(0);
  });
});
