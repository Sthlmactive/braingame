// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSolveClock, type SolveClock } from "@/games/mini/useSolveClock";

/**
 * The clock, mounted for real.
 *
 * The engine tests cannot reach this: they run pure functions, and the bug
 * this file exists for was a React lifecycle bug — the parent was notified
 * from inside a `setState` updater, which React runs during the render phase.
 * The only way to catch that is to mount the thing and watch what React says.
 *
 * React reports it through `console.error`, so any `console.error` during a
 * test fails that test. That is the assertion; the tick counting below is the
 * behaviour it protects.
 */

// React refuses to treat act() as act() without this, and warns via
// console.error — which this file treats as a failure.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let hidden = false;
let consoleErrors: string[] = [];

/** The child that owns the clock, as `Mini` does. */
function Board({
  onTick,
  handle,
}: {
  onTick: (seconds: number) => void;
  handle: { current: SolveClock | null };
}) {
  handle.current = useSolveClock(onTick);
  return <span>{handle.current.seconds}</span>;
}

/**
 * A real parent that holds the displayed time in state, as `MiniGameScreen`
 * does with `elapsed`.
 *
 * This shape is load-bearing. If the harness passed a plain spy instead of a
 * parent `setState`, notifying from inside a state updater would not update
 * *another component* and React would emit no warning at all — the test would
 * pass against the very bug it exists to catch.
 */
function Harness({
  spy,
  handle,
}: {
  spy: (seconds: number) => void;
  handle: { current: SolveClock | null };
}) {
  const [elapsed, setElapsed] = useState(0);
  const onTick = (s: number) => {
    spy(s);
    setElapsed(s);
  };
  return (
    <>
      <output>{elapsed}</output>
      <Board onTick={onTick} handle={handle} />
    </>
  );
}

function mount(spy: (seconds: number) => void): { current: SolveClock | null } {
  const handle: { current: SolveClock | null } = { current: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Harness spy={spy} handle={handle} />);
  });
  return handle;
}

/** Advance the clock by whole seconds, flushing effects after each tick. */
function tickSeconds(n: number): void {
  for (let i = 0; i < n; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

beforeEach(() => {
  hidden = false;
  consoleErrors = [];
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
  });
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Any React warning during the test is a failure, and the render-phase
  // update this hook was written to avoid is reported exactly this way.
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

describe("the solve clock", () => {
  it("does not run before the first keystroke", () => {
    const onTick = vi.fn();
    mount(onTick);
    tickSeconds(5);
    // One call for the initial zero, and nothing after it.
    expect(onTick.mock.calls.map(([s]) => s)).toEqual([0]);
  });

  it("reports once per second after starting", () => {
    const onTick = vi.fn();
    const handle = mount(onTick);
    act(() => handle.current!.start());
    tickSeconds(3);
    expect(onTick.mock.calls.map(([s]) => s)).toEqual([0, 1, 2, 3]);
  });

  it("pauses while the tab is hidden", () => {
    const onTick = vi.fn();
    const handle = mount(onTick);
    act(() => handle.current!.start());
    tickSeconds(2);

    hidden = true;
    tickSeconds(5);
    expect(onTick.mock.calls.map(([s]) => s)).toEqual([0, 1, 2]);
  });

  it("does not double count on resume", () => {
    const onTick = vi.fn();
    const handle = mount(onTick);
    act(() => handle.current!.start());
    tickSeconds(2);

    hidden = true;
    tickSeconds(10);
    hidden = false;
    tickSeconds(2);

    // Ten hidden seconds are gone for good: the clock counts ticks it was
    // present for, so there is nothing to catch up on.
    expect(onTick.mock.calls.map(([s]) => s)).toEqual([0, 1, 2, 3, 4]);
    expect(handle.current!.seconds).toBe(4);
  });

  it("keeps ticking when the parent passes a new callback every render", () => {
    // The failure this guards: onTick in the interval effect's dependencies
    // tears the interval down and rebuilds it on every parent rerender.
    const seen: number[] = [];
    const handle: { current: SolveClock | null } = { current: null };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const render = () =>
      act(() => {
        root!.render(
          <Harness spy={(s: number) => seen.push(s)} handle={handle} />,
        );
      });

    render();
    act(() => handle.current!.start());
    tickSeconds(1);
    render(); // new inline callback identity
    tickSeconds(1);
    render();
    tickSeconds(1);

    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it("resets to zero and stops", () => {
    const onTick = vi.fn();
    const handle = mount(onTick);
    act(() => handle.current!.start());
    tickSeconds(3);
    act(() => handle.current!.reset());
    tickSeconds(2);

    expect(onTick.mock.calls.map(([s]) => s)).toEqual([0, 1, 2, 3, 0]);
    expect(handle.current!.seconds).toBe(0);
  });
});
