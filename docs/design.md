# Ordlek design system

Source of truth for the visual layer. `docs/five-spec.md` owns Five's
behaviour; this file owns how anything looks.

Status: home screen and all of Five migrated, 14 August 2026. Hive, Grid, Loop,
Ordoku, Rush and Tiles still run on the legacy aliases below.

State colours are green and yellow as of the same date; the orange and blue
pair they replaced is recorded under "Green and yellow, by choice".

---

## The one rule

**Colour only ever means game state.**

Nothing in navigation, chrome, headers or icons is coloured. The only saturated
pixels in the app are:

1. tiles reporting a result,
2. keyboard keys reporting a result,
3. the single bar on the result sheet for the round just played.

That is the whole list. The home screen used to spend colour on seven
decorative badges, which is why the board's feedback had no weight left by the
time you reached it. Board glyphs are monochrome for the same reason: colouring
one cell of the Five glyph to liven it up is the rule breaking.

`test/design.test.ts` enforces this. `--hit`, `--near` and `--miss` may only be
referenced by `components/Tile.tsx`, `components/Keyboard.tsx` and
`games/five/FiveResult.tsx`, and the redesigned screens may not reference a
colour token at all, legacy aliases and per-game accents included.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#EDEBE4` | `#16181C` | page ground |
| `--ink` | `#16181C` | `#EDEBE4` | primary text, active tile border |
| `--raised` | `#E3E0D6` | `#212429` | stat blocks, keyboard keys |
| `--line` | `#C6C2B6` | `#3A3E44` | tile borders, dividers, glyphs |
| `--muted` | `#636057` | `#93908A` | secondary text |
| `--hit` | `#63AC5B` | `#5B9B52` | right letter, right place |
| `--near` | `#E0B93F` | `#C9A63A` | in the word, wrong place |
| `--miss` | `#8E8A80` | `#55585E` | not in the word |
| `--on-state` | `#16181C` | `#16181C` | text on hit and near |
| `--on-miss` | `var(--ink)` | `var(--ink)` | text on miss |

`--on-state` is the one token that does **not** flip between modes. It is a
fixed dark ink, not `var(--ink)`: `--ink` inverts to near-white in dark mode,
and near-white on a mid green is 2.81:1. Fixed dark ink is 6.42:1 in light and
5.29:1 in dark, and the tile letter is then the same colour in both themes.

### Green and yellow, by choice

The state pair is Wordle-conventional green and yellow. This is a deliberate
decision to be conventional, and it has a known cost, recorded here so it can
be revisited rather than rediscovered.

**The cost.** Green and yellow are the exact pair red-green colour blindness
confuses, which affects roughly 8% of men. They are also close in lightness, so
removing hue does not separate them either:

| | `L(hit)` | `L(near)` | gap |
|---|---|---|---|
| light | 0.329 | 0.509 | 0.180 |
| dark | 0.263 | 0.400 | 0.137 |

A board is still readable without hue — the gap is not nothing, and position on
the board carries most of the meaning — but the pair is not colour blind safe
in the way a hue-opposed pair would be.

**There is deliberately no greyscale separation test.** An earlier revision had
one at `|L(hit) − L(near)| ≥ 0.15`, which this palette would fail in dark mode.
It was removed rather than lowered: a threshold tuned until whatever ships
passes it tests nothing. If the pair changes again, reinstate the test at a
threshold chosen from first principles, not from the shipped values.

**What was here before**, if this decision is ever reversed — a hue-opposed
pair, deep orange and deep blue, which passed a 0.15 separation in both modes:

| Token | Light | Dark |
|---|---|---|
| `--hit` | `#CE460D` | `#FF862A` |
| `--near` | `#082167` | `#4980E5` |
| `--on-state` | `#FFFFFF` | `#16181C` |

That pair needed white tile text, and white at 4.5:1 caps a light background at
L ≤ 0.183, which is what forced `near` down to a near-black navy. Switching the
tile letter to dark ink is what allows the current mid-tone green and yellow.

### Other values that differ from the original brief

- **`--on-miss` added.** `--on-state` on `--miss` is **3.44:1 light and 2.49:1
  dark** — the miss tile is a light neutral by design, so white on it fails. Ink
  on it is 5.16:1 and 5.98:1 and still reads as spent.

- **`--muted` light `#7A776C` → `#636057`.** It was 3.76:1 on paper and 3.40:1
  on raised. Every caption and one-line description in the app is `--muted`, so
  that is most of the app's secondary text failing AA. Now 5.27:1 and 4.76:1.

## Type

Familjen Grotesk, via `next/font/google`, subset `latin` (which carries å, ä and
ö). Behind one token, `--font-display`, so swapping it is one line in
`app/layout.tsx` plus that token.

| Class | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| `.t-result` | 38px | 700 | −0.02em | 1.15 |
| `.t-choice` | 34px | 700 | −0.02em | 1.15 |
| `.t-wordmark` | 30px | 700 | −0.02em | 1.15 |
| `.t-option` | 24px | 600 | −0.01em | 1.25 |
| `.t-title` | 19px | 600 | — | 1.3 |
| `.t-row` | 15px | 600 | — | 1.35 |
| `.t-body` | 13px | 400 | — | 1.45 |
| `.t-caption` | 11px | 400 | — | 1.4 |

`.t-option` names a choice that owns a quarter of the screen and `.t-choice`
one that owns half; both are card names rather than list rows.

### Leading is set for Swedish, and 1.25 is the floor

Familjen Grotesk sets `USE_TYPO_METRICS` with ascender 1230 and descender
-270 over `unitsPerEm` 1200, so its natural content area is

```
(1230 + 270) / 1200 = 1.25em
```

Below that, the line box is **shorter than the font's own ink**: half-leading
goes negative and glyphs hang out of their box. In English you never see it,
because nothing reaches higher than a cap or an ascender. In Swedish, Å Ä Ö
stack a ring or an umlaut *above* the cap line, and that is the part that
lands on the line above.

Every class that wraps or stacks therefore sits at 1.25 or more. The three
display classes are tighter on purpose — 1.25 on a 38px result word looks
slack — but at 1.15 rather than 1.05, because at 1.05 an uppercase Å
overflowed its box and only the surrounding margin was saving it.

**Tune leading against `LÅSTA`, never against `LOCKED`.**

Tile letters scale with tile size (`px * 0.44`), weight 600, `line-height: 1`.
Two weights, 400 and 600, plus 700 for the wordmark and the result word.
`.tnum` gives tabular numerals and is applied wherever numbers sit in a column.

### Cap-height centring, and why

**Do not vertically centre the tile letter on the em box.** Centre it on cap
height, or Å and Ä sit visibly lower than A in the same row, because the ring
and the umlaut eat the space above the cap.

The shift is `--tile-cap-shift: -0.075em`, derived from the font's own metrics
rather than guessed. Familjen Grotesk 600: `unitsPerEm` 1200, typo ascender
1230, descender −270, `sCapHeight` 780, and `USE_TYPO_METRICS` is set, so a
browser builds the line box from the typo values.

```
A = 1230/1200 = 1.025em    D = 270/1200 = 0.225em    C = 780/1200 = 0.65em

half-leading = (1 − (A + D)) / 2 = −0.125em
baseline     = half-leading + A  =  0.900em from the top of the line box
cap centre   = baseline − C/2    =  0.575em
box centre   =                      0.500em
shift        = 0.500 − 0.575     = −0.075em      i.e. (C + D − A) / 2
```

Tiles never set `overflow: hidden`, so a diacritic can never clip. A and Å share
a baseline exactly; Å simply extends above it, which is correct.

**If the typeface changes, this number changes.** Re-derive it from the new
font's `sCapHeight`, ascender and descender rather than carrying −0.075em over.

## Navigation

**The back chevron goes up one level in the hierarchy. It never goes back
through history.**

`router.back()` looks right until the stack has anything extra on it. Five's
result sheet pushed a fourth entry with Byt nivå, so `[home, difficulty, game]`
became `[home, difficulty, game, difficulty]` and the difficulty screen's
chevron went *forwards* into the game. History is not a hierarchy and cannot be
used as one.

Every screen therefore names its parent:

| Screen | Chevron goes to |
|---|---|
| `/five/[lang]/[difficulty]` (game) | `/five/[lang]` |
| `/five/[lang]` (difficulty) | `/` |
| `/five` (language) | `/` |
| `/mini/[lang]/[difficulty]` (game) | `/mini/[lang]` |
| `/mini/[lang]` (difficulty) | `/` |
| `/mini` (language) | `/` |

`Screen` takes a `backHref` and renders the chevron as a real `<Link>`, because
up-navigation is a destination. A control that changes level uses
`router.replace`, not `push`, so switching never grows the stack at all.

**The six unmigrated games still call `router.back()`.** Grid does it directly
in its own header; Hive, Loop, Ordoku, Rush and Tiles fall through `Screen`'s
default. Give each one a `backHref` when it is migrated.

## Spacing and shape

Radius **3px** on tiles and keys, **8px** on cards and buttons, **22px** on the
page container. Tile gap **4px**. Nothing else is rounded.

## The tile is the only atom

One `<Tile>`, used by the board, the difficulty picker and the language picker.
Size is a prop and flows from `fitTile` in `lib/useBoardFit.ts`, which is not
forked. Variants:

| Variant | Ground | Border | Letter |
|---|---|---|---|
| `empty` | transparent | `--line` | `--ink` |
| `typed` | `--paper` | `--ink` | `--ink` |
| `hit` | `--hit` | `--hit` | `--on-state` (fixed dark ink) |
| `near` | `--near` | `--near` | `--on-state` (fixed dark ink) |
| `miss` | `--miss` | `--miss` | `--on-miss` |

`filled`, `correct`, `present`, `absent`, `accent`, `locked` and `muted` are
legacy names the six unmigrated games still pass; the first four render
identically to `typed`, `hit`, `near` and `miss`.

## Reveal cascade

`lib/reveal.ts` is the source of truth; `globals.css` mirrors the numbers.

- Flip **220ms** per tile, `ease-out`, colour swapping at the halfway point
- Stagger **160ms** per column, so a six-letter row completes in **1.02s**
- Keyboard keys recolour **only after the whole row has finished** — the board
  drives a `revealed` counter and the keyboard reads that, not `guesses`
- On a win, a settle bounce on the winning row after the last tile lands

Reduced motion: no flip, colour in a **120ms** fade, **no stagger**, no bounce.
Wired to both the OS media query and the in-app override
(`data-reduce-motion` on `<html>`) through `lib/useReducedMotion.ts`. The CSS
alone is not enough, because the stagger is a JavaScript delay no media query
can reach.

## Press

Every control dips under the finger. `.tap` is a 44px hit target that also
presses; `.press` presses without forcing the size, for things already larger
than the minimum.

The `data-pressed` attribute is set by **one delegated pointer listener**
(`lib/press.ts`, installed from `AppProvider`), not by a hook wired into forty
call sites — it cannot be forgotten on the forty-first. CSS `:active` would be
the obvious alternative and is unreliable on iOS Safari for anything that is
not a link, which is most of this app.

| | Scale | Duration |
|---|---|---|
| Tiles and keys | 0.96 | 40ms |
| Everything else | 0.97 | 110ms |

Two numbers because they are two gestures. A tile is being **typed on**, and
40ms is the difference between a keyboard that feels instant and one that
feels laggy. A button is being **pushed**, and 40ms there reads as a flicker.

Reduced motion swaps the scale for a dim to 0.55 opacity. Feedback is not
decoration, so it survives the preference; only the movement goes.

## A control never disappears mid-game

**Unavailable means disabled. It never means absent.**

A keyboard that changes shape while you are typing is broken whatever the
reason, because the key you are aiming at moves out from under your thumb.
The same goes for any control you have already learned the position of.

This shipped. Mini's Enter key was wired to the hint, and `Keyboard` rendered
it as `{isLast && onEnter ? … : null}` — so its *presence* was inferred from
whether the callback happened to be defined at that instant. Mini passed
`onEnter={hintsLeft > 0 ? onHint : undefined}`. Spending the second hint on
Lätt unmounted the key, and the remaining letters spread out to fill the row.

Two rules came out of it:

1. **Presence is decided once per round, availability continuously.** A
   control's existence may depend on things fixed at the start (Mini's hint
   grant is 2 on Lätt and 0 everywhere else, so the key is present all round
   or absent all round). Whether it *works* may change freely.
2. **Absent-always beats absent-sometimes.** A control that can never do
   anything this round is removed from the layout entirely, not shown
   permanently disabled.

`Keyboard` takes `enterLabel` to pin the key in the layout; without it, the
old inference still applies, which is what Five and Grid rely on since their
Enter always has an action. `hintKey` in `games/mini/engine.ts` makes the
decision, and `test/keyboard-invariants.test.tsx` asserts the bottom row's key
count and labels are invariant across a whole round, in both languages at
every difficulty.

The count lives in the label — "Ledtråd 2" — so the key is the same width at
2, 1 and 0. It says **Ledtråd / Hint**, not Klar: a crossword has nothing to
submit, the grid checks itself the moment it is full, and the old label
promised an action the game does not have.

## Springs

Anything a finger can grab is **sprung**, not timed. A duration has nowhere to
put a velocity: flick a sheet down hard and a 220ms animation still takes
220ms, which feels like the sheet ignoring you.

`lib/spring.ts` is the whole engine — a damped harmonic oscillator advanced by
its closed-form solution, configured by `response` and `damping` the way Apple
configures springs. No animation library; four surfaces do not justify 18kb.

| Spring | Response | Damping | Used by |
|---|---|---|---|
| `SPRING_MOVE` | 0.4s | 1.0 | repositioning, no overshoot |
| `SPRING_SHEET` | 0.3s | 0.8 | sheets; lands 1.5px past and settles |

**Closed form rather than numerical integration, and not for elegance.** The
first version used semi-implicit Euler, which adds damping proportional to the
step size: at 60Hz it erased the sheet spring's overshoot completely, and the
same spring would have bounced on a 120Hz screen. Frame-rate-dependent feel is
a bug you cannot see on the machine you wrote it on.

Timed CSS keyframes are still right for the reveal cascade, the toast and the
page fade: nothing can grab those mid-flight, so there is no velocity to
preserve.

## Sheets

`components/Sheet.tsx`. Arrives from the bottom edge on `SPRING_SHEET`, and
**goes back there** — it used to be `if (!open) return null`, so it arrived
from somewhere and left from nowhere. A thing that appears from an edge has
told you where it lives; the second time you open it, you should already know
where it came from.

Draggable by its header (the grip and the title), deliberately not by the whole
panel — a sheet whose body drags fights its own buttons. Downward tracking is
1:1; upward is rubber-banded, because there is nothing above the open position
to go to. Letting go dismisses past **30% of the sheet's height** or above
**550px/s**, and the decision uses projected momentum, so a fast short flick
dismisses where a slow drag of the same distance does not. The gesture is
interruptible: grabbing a moving sheet takes it from wherever it is with
whatever speed it had.

The scrim's opacity is tied to the sheet's position rather than faded
independently, so one gesture moves one thing.

## Material

The sheet is the **only** translucent surface in the app: it is the one place
where two layers coexist and the lower one has to stay legible as context.
`--material-sheet` (82% paper) over `--scrim` (55% ink), blurred 20px.
Everything else is opaque, which is a restraint rather than an omission.

## Accessibility preferences

| Query | Effect |
|---|---|
| `prefers-reduced-motion` | reveal cascade flattens; springs jump to their end state; press dims instead of scaling |
| `prefers-reduced-transparency` | the sheet material goes solid; the scrim stays, so the layering survives |
| `prefers-contrast: more` | `--muted` and `--line` only — the two tokens that trade contrast for calm |
| `@supports not (backdrop-filter)` | same solid fallback as reduced transparency |

The state colours are **not** touched by increased contrast. Their ratios are
the ones this document argues for, and changing them would change what green
and yellow mean. `test/design.test.ts` asserts the contrast overrides actually
increase contrast, in both modes — an override block written by hand a long way
from the tokens it replaces is the easy place to get that backwards.

## Board glyphs

`<BoardGlyph game={...} />`, 34×34, monochrome in `--line`. Each is a miniature
of that game's real board, because every review round came back with "I cannot
tell what this game is".

Five a row of five squares · Hive seven hexes in a flower · Grid a 5×5 grid ·
Loop six dots on a circle · Ordoku a 4×4 grid with heavier 2×2 divides · Rush an
interlocking crossword fragment · Tiles a 3×3 board corner.

Geometry is a pure function, `glyphShapes(game)`, which **throws on an unknown
id** rather than rendering an empty box, so a new game cannot ship without one.

## Migrating the other six

They still write the old token names, aliased in `globals.css`:

| Legacy | Now |
|---|---|
| `--text` | `--ink` |
| `--surface` | `--raised` |
| `--correct` | `--hit` |
| `--present` | `--near` |
| `--absent` | `--miss` |
| `--on-absent` | `--on-miss` |
| `--radius-sheet` | `--radius-card` |

`--ink` is **not** aliased. It used to mean "the page ground, and the colour of
text on a saturated surface"; it now means primary text. Those call sites were
renamed by hand to `--on-state` (text on a filled surface) and `--raised` /
`--paper` (the two that meant a ground).

To migrate a game: replace its `--accent-*` chrome with `--ink` and `--muted`,
swap its legacy tile states for the new names, adopt the `.t-*` type classes,
and delete its entry from `--accent-*`. The colour-leak test will start
covering it as soon as it stops using the aliases.
