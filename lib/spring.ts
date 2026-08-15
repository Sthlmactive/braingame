/**
 * A spring, solved by hand.
 *
 * Four surfaces in this app want spring motion and none of them want an
 * animation library, so this is the whole engine: a damped harmonic
 * oscillator, advanced by its closed-form solution.
 *
 * Closed form rather than numerical integration, and not for elegance. The
 * first version stepped it with semi-implicit Euler, which adds damping
 * proportional to the step size: at 60Hz it quietly erased the sheet spring's
 * overshoot entirely, and the same spring would have bounced on a 120Hz
 * screen. The exact solution gives the same motion at any frame rate, and a
 * tab that was backgrounded for ten seconds resolves in one evaluation
 * instead of six hundred substeps.
 *
 * It is configured the way Apple configures springs — by `response` and
 * `damping` rather than by stiffness and mass — because those are the two
 * numbers you can reason about from the feel you want. `response` is how long
 * one oscillation of the undamped system would take; `damping` is the damping
 * ratio, where 1 settles without ever overshooting and anything below 1
 * bounces.
 *
 * Everything here is pure and frame-rate independent, so the motion can be
 * tested by stepping it rather than by watching it.
 */

export interface SpringConfig {
  /** Seconds for one oscillation of the undamped system. */
  response: number;
  /** Damping ratio. 1 is critical: fast, and no overshoot. */
  damping: number;
}

/** Repositioning something that is already on screen. Never overshoots. */
export const SPRING_MOVE: SpringConfig = { response: 0.4, damping: 1 };

/** A sheet arriving or leaving. Slightly underdamped, so it lands with life. */
export const SPRING_SHEET: SpringConfig = { response: 0.3, damping: 0.8 };

/** How close to 1 counts as critical damping, where the solution changes form. */
const CRITICAL_EPSILON = 1e-4;

/** Rest thresholds, in the units the spring is driving (px here). */
const REST_OFFSET = 0.1;
const REST_VELOCITY = 1;

export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(
    value: number,
    private readonly config: SpringConfig,
  ) {
    this.value = value;
    this.target = value;
  }

  /** Retarget without disturbing velocity, so a redirect mid-flight is smooth. */
  setTarget(target: number): void {
    this.target = target;
  }

  /** Hand a gesture's position and velocity (px/s) straight to the spring. */
  handoff(value: number, velocity: number): void {
    this.value = value;
    this.velocity = velocity;
  }

  /** Advance by `dt` seconds. Returns true once it has come to rest. */
  step(dt: number): boolean {
    const t = Math.max(0, dt);
    const omega = (2 * Math.PI) / this.config.response;
    const zeta = this.config.damping;
    // Solved in displacement from the target, which is what makes the three
    // cases below the textbook ones.
    const x0 = this.value - this.target;
    const v0 = this.velocity;
    const decay = Math.exp(-zeta * omega * t);
    let x: number;
    let v: number;

    if (Math.abs(zeta - 1) < CRITICAL_EPSILON) {
      const c = v0 + omega * x0;
      x = decay * (x0 + c * t);
      v = decay * (v0 - omega * c * t);
    } else if (zeta < 1) {
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      const cos = Math.cos(wd * t);
      const sin = Math.sin(wd * t);
      x = decay * (x0 * cos + ((v0 + zeta * omega * x0) / wd) * sin);
      v =
        decay *
        (v0 * cos - ((omega * omega * x0 + zeta * omega * v0) / wd) * sin);
    } else {
      // Overdamped: two real roots, no oscillation. Nothing in the app is
      // configured this way today, but a config that is would otherwise take
      // the underdamped branch and produce NaN from the square root.
      const root = omega * Math.sqrt(zeta * zeta - 1);
      const r1 = -zeta * omega + root;
      const r2 = -zeta * omega - root;
      const a = (v0 - r2 * x0) / (r1 - r2);
      const b = x0 - a;
      const e1 = Math.exp(r1 * t);
      const e2 = Math.exp(r2 * t);
      x = a * e1 + b * e2;
      v = a * r1 * e1 + b * r2 * e2;
    }

    this.value = this.target + x;
    this.velocity = v;

    if (
      Math.abs(this.value - this.target) < REST_OFFSET &&
      Math.abs(this.velocity) < REST_VELOCITY
    ) {
      // Snap, so the final frame is exact rather than a rounding error away.
      this.value = this.target;
      this.velocity = 0;
      return true;
    }
    return false;
  }
}

/**
 * Run a spring on animation frames until it rests.
 *
 * Returns a cancel function. Cancelling leaves the spring where it is, with
 * its velocity intact, which is what makes a mid-flight grab work: stop the
 * driver, hand the current value to the gesture, carry on.
 */
export function driveSpring(
  spring: Spring,
  onFrame: (value: number) => void,
  onRest?: () => void,
): () => void {
  let handle = 0;
  let last = 0;
  let stopped = false;

  const tick = (now: number): void => {
    if (stopped) return;
    // The first frame has no previous timestamp to subtract, so assume 60Hz.
    const dt = last === 0 ? 1 / 60 : (now - last) / 1000;
    last = now;
    const settled = spring.step(dt);
    onFrame(spring.value);
    if (settled) {
      stopped = true;
      onRest?.();
      return;
    }
    handle = requestAnimationFrame(tick);
  };

  handle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}

/**
 * Where a flick would end up if it were left to decelerate.
 *
 * This is what lets a fast, short flick dismiss a sheet that a slow drag of
 * the same distance would not: the decision is made on where the gesture was
 * going, not on where the finger happened to leave the glass. The rate is
 * UIScrollView's normal deceleration.
 */
export function projectMomentum(velocity: number, rate = 0.998): number {
  return ((velocity / 1000) * rate) / (1 - rate);
}

/**
 * Resistance for dragging past the end of the allowed range.
 *
 * The surface still tracks the finger, which is the point — it just gives less
 * and less, so the limit announces itself without the motion ever stopping
 * dead. Apple's formula, with their constant.
 */
export function rubberBand(offset: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const x = Math.abs(offset);
  // Tracks at `constant` of the finger at first and asymptotes at `dimension`,
  // so the surface never stops moving and never runs away either.
  return sign * (1 - 1 / ((x * constant) / dimension + 1)) * dimension;
}
