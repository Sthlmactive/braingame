# Mini — specification

Source of truth for Mini. If this file and a chat message disagree, **this file
wins**. Change it in the same commit as the behaviour it describes.

`docs/five-spec.md` is the reference implementation Mini follows;
`docs/design.md` owns how it looks.

Status: phases 1 and 2 built, 14 August 2026. Clues, game and integration
still to come.

---

## What Mini is

A mini crossword. Pick a language, pick a difficulty, solve, repeat. Same shape
as Five: no levels, no end, and the result sheet is the loop.

## The difficulty table

| Difficulty | Slug | Grid | Black squares | Fill bands | Entries |
|---|---|---|---|---|---|
| Lätt | `easy` | 4x4 | 0 | easy + medium | 8 |
| Medel | `medium` | 5x5 | 4 or 5 | easy + medium | 10 to 12 |
| Svår | `hard` | 5x5 | 2 or 3 | medium + hard | 10 to 11 |
| Extrem | `extreme` | 5x5 | 0 | every band | 10, fully checked |

**Fully checked** means all five rows and all five columns are words at once — a
double word square. That is what makes Extrem hard, rather than word rarity.

## The rule that decides whether this game is good

**Grids are filled from the frequency-ranked answer pool, never from the full
guess list.**

Every letter in a mini is checked twice, once across and once down. One obscure
word poisons two entries and the player has no way to recover. Guessing stays
permissive; fill stays conservative.

## Sources, and one that keeps coming back

The word pipeline is SALDO (Swedish) and SCOWL (English), intersected with
OpenSubtitles frequency, minus the `pm` tag, multiword fragments, genitive-only
forms, the crude stem list and the name list. Details in `docs/five-spec.md`.

**Hunspell is not part of this pipeline and never has been.** It was proposed
in the first session, evaluated, and not adopted: the binary is not installed,
there is no package manager on the build machine to install it, and the
brute-force sweep it was meant to power was never run. It has since been
written into a later brief twice as though it were proven. It is not. If
hunspell is ever wanted, it is a new decision with a dependency attached, not a
return to something that worked.

## Navigation

Back is always up one level, never history: `/mini/[lang]/[difficulty]` goes to
`/mini/[lang]`, and both pickers go to `/`. Byt nivå uses `router.replace`. The
rule and the reason are in `docs/design.md`.

## Fill pool

Built by `npm run data:words` into `data/fill/{lang}.json`. Build input only —
the phone never fetches it, because Mini ships generated puzzles.

Lengths 3, 4 and 5, each banded into easy / medium / hard / extreme at
**20 / 30 / 30 / 20** by the same difficulty score Five uses. Bands are cut
*within* a length, so a 3-letter "hard" is hard among three-letter words rather
than against the whole language. Easy keeps Five's structural filter: no
repeated letter, no rare letter, at least two vowels.

| | 3 letters | 4 letters | 5 letters |
|---|---|---|---|
| sv | 250 | 1,636 | 3,022 |
| en | 250 | 1,875 | 2,955 |

### Nothing rarer than corpus rank 20,000

`FILL_RANK_CAP`. The first banks drew Svår and Extrem from the bottom 0.2% of
the answer pool — rank 25,106 of 25,149 in Swedish, 24,437 of 24,487 in English
— which is `ister`, `aktre`, `golar`, `bulor` on one side and `croup`, `yens`,
`louts`, `tulle` on the other. Every letter in a mini is checked twice, so one
of those takes two entries down with it.

**The cap is applied after banding, to every band, and the order matters.**
Capping the pool first and banding the survivors looks equivalent and is not:
the shares are proportional, so cutting the rarest 15% shrinks all four bands by
15%, including the two that never held a word that rare. Measured, that took
Swedish Medel from 500 puzzles to 266 — a bank ruined by a rule aimed at a
different bank. Banding first leaves easy and medium untouched and takes the
tail out of hard and extreme, where it lives:

| | easy | medium | hard | extreme |
|---|---|---|---|---|
| sv 5 letters | 711 | 1,067 | 810 *(was 1,067)* | 434 *(was 711)* |
| en 5 letters | 675 | 1,013 | 850 *(was 1,013)* | 417 *(was 675)* |

Every band is filtered, not only the two that offended, because bands are cut by
difficulty score rather than by rank: a rare word with gentle structure lands
mid-table, and both Svår and Extrem draw the `medium` band.

### Words held out by hand

Three words were cut from the answer pool after reading the banks, all through
the name list in `lib/curation.ts`, so all three appear in
`docs/answer-removals.md` under `name`:

- `rhea` and `saki` — a flightless bird and a monkey, and a name to anyone who
  has not met either animal. They were turning up in Lätt.
- `senna` — a real SALDO noun, the plant (`nn_0u_radar`), and the racing driver
  to everyone else.

Three more were reviewed and **kept**, recorded so they are not re-litigated:
`kåre` is a gust of wind (`nn_2u_vinge`, cf. vindkåre), `remi` is the draw in
chess (`nn_3u_akademi`), and `yves` is not a name at all but the present s-form
and imperative of `yvas`.

### Three letter fill is gated twice

Three letter words are where crosswords go bad. Two gates, both by rule:

1. **Category.** Interjections and abbreviations are removed. Swedish reads
   SALDO's own tags — `in` for interjections, and the `a` suffix for
   abbreviations (`nna` DVD, `pma`, `aba`, `ava`, `ppa`). English has no part
   of speech, so SCOWL's size band stands in: at three letters ordinary words
   sit at band 10 to 35 (dog 10, cat 10, sea 20, fox 35) and interjections at
   40 to 55 (yep 40, duh 50, psst 50, ooh 55, shh 55, nah 55). Band ≤ 35 takes
   the category out. A word with no vowel at all is removed in both languages.

   Both use **only-ever** semantics: a word is only excluded when it has no
   ordinary reading. Abbreviations inflect and collide — `Ba` → "bas", `Ga` →
   "gas", `OS` → "oss", `ha` (hectare) → "har" — and every one of those has an
   ordinary reading, so all of them stay.

2. **Frequency.** Only the commonest `THREE_LETTER_RANK_CAP` (250) survive.

   The original brief said 1,500. That is a no-op: there are only 670 three
   letter Swedish answers and 602 English ones in total.

Known residue: English `huh` and `ugh` sit at band 20 and survive the gate.
English has no interjection tag to catch them.

## Puzzle banks

Generated by `npm run data:mini` into `public/data/{lang}/mini-{difficulty}.txt`,
one puzzle per line.

A puzzle is **one string**: one character per cell in reading order, `#` for a
black square. The mask, the entries and the numbering are all derived from it
by `lib/mini.ts`, shared by the generator and the runtime, so the two can never
disagree about what the entries are. Storing the entry list as well would be
redundant and could drift.

Target 500 per language per difficulty. **A bank under 200 fails the build**,
Extrem included.

| | Lätt | Medel | Svår | Extrem |
|---|---|---|---|---|
| sv | 442 | 263 | 394 | 473 |
| en | 333 | 381 | 429 | 354 |

### Extrem is fully checked, and that is not negotiable

Extrem is a fully checked 5x5 — a double word square, ten entries each crossing
every other — filled from words no rarer than corpus rank 20,000, with every
entry required to be pinned by its crossings. That is close to the limit of what
either language can produce, and its bank nearly did not survive: at three fill
bands it came out at **128 puzzles in Swedish and 36 in English**, against a
floor of 200.

**When that happens again, widen the fill. Do not loosen the geometry.** There
are four ways to make the bank bigger. One is free. The other three each remove
the thing Extrem exists to be, and are refused:

1. **Black squares.** This is the tempting one, because Svår already has two or
   three and it fills easily. A 5x5 with black squares is not a double word
   square; it is Svår with a different word list. Extrem's whole difficulty is
   that every letter is checked twice. Adding a black square deletes the
   difficulty and keeps the name.
2. **Raising the rank cap.** The cap exists because the previous banks were
   built from `ister`, `aktre`, `golar` and `croup`. A fully checked grid is the
   worst possible place for a word nobody knows, because it takes two entries
   with it and the crossings cannot help.
3. **Dropping the ambiguity check.** Extrem is the only difficulty where that
   check earns its keep — it is the one grid with no black squares to break the
   inflection clusters up. Removing it brings `ANTAG`/`ANTAR`/`ANTAS` straight
   back.

The free lever is the fourth: **Extrem draws every fill band, including easy.**
That is what was pulled, and it took the two banks from 128 and 36 to **473 and
354** — comfortably over the floor, with no change to the geometry, the rank cap
or the ambiguity check. It costs nothing Extrem was selling, because its
difficulty is the geometry and the pinning, not word rarity. A grid of five
common words that all cross each other is still a double word square.

A lower floor for Extrem was drafted while the banks stood at 128 and 36, and
then deleted unused. Record of it survives here so the next person knows the
option was considered and did not turn out to be necessary.

### Patterns

Black square masks are **enumerated, not hand written**: symmetry pairs the
cells up, so a 5x5 is 12 pairs plus a centre and the space is small enough to
walk exhaustively. Every candidate is filtered on the three rules a crossword
needs — 180° rotational symmetry, no run shorter than 3, white cells connected
— so a pattern cannot be typo'd into an invalid grid.

The geometry admits fewer patterns than the brief assumed:

| Difficulty | Blacks | Usable patterns |
|---|---|---|
| Lätt | 0 | 1 |
| Medel | 4 or 5 | 5 |
| Svår | 2 or 3 | 2 |
| Extrem | 0 | 1 |

Eight per difficulty is not available. A 5x5 with two black squares only works
with them in opposite corners; anything further in leaves a run of one or two.
Variety comes from the fill, not the shape: 500 puzzles over 2 patterns is 250
distinct fills each.

### The solver

Backtracking with constraint propagation, in `scripts/lib/mini-solve.ts`:

- The pool is indexed by (position, letter) as bitsets over `Uint32Array`, so
  matching `A??E?` is a few ANDs rather than a scan
- Minimum remaining values: the most constrained slot first
- Prune the moment any crossing slot has zero candidates
- Candidate order shuffled from a seed, so the bank varies and the build is
  deterministic
- Attempts capped, so a pattern that will not fill is abandoned, not hung on

**A slot can be completed implicitly**, by the letters of its crossings rather
than by being chosen. Such a slot never passes through the candidate loop, and
without an explicit check it can hold a non-word, a second copy of a word
already in the grid, or a word over its repetition cap. Every placement
therefore re-validates every filled slot against the pool and against the other
filled slots. This is not an optimisation — the first version of the solver
shipped grids containing `inert` twice, and the first version of the repetition
cap leaked `sant` into 36 puzzles against a cap of 15. The test suite caught the
first and the build report caught the second.

### Every entry must be pinned by its crossings

Fully checked grids only. The first Swedish Extrem bank was full of inflections
— `ANTAG`, `AKTAR`, `TAGNA`, `GENAR` — and `ANTAG` appeared in three of five
sampled grids. The problem is not that they are verb forms. It is that
`ANTAG`, `ANTAR` and `ANTAS` all fit, and if the crossings do not rule the
others out then no clue of under eight words is going to.

So the test is ambiguity, not part of speech:

> For each entry, count the pool words whose letter at every position is one
> its crossing would still accept. More than one, and the grid is rejected.

Swapping an entry's word changes exactly one letter in each crossing, and each
crossing is then valid or not independently of the others, so this is exact for
single-entry swaps rather than a heuristic. The count is never zero, because the
word already in the slot satisfies its own crossings.

A stem rule rides along: no two entries may share three or more letters of
prefix while differing in at most one letter of the shorter word. `ANTAG`/
`ANTAR` share a stem, `ARM`/`ARMAR` share a stem, `TRÄNG`/`TRÄTT` do not.

**Deliberately not a part of speech blocklist.** That would need a tagger
English does not have, would be wrong at the edges in both languages, and would
still miss noun pairs like `ARM`/`ARMAR`.

Applied to Extrem only. Lätt at 4x4 with no black squares is equally fully
checked, and was measured with the same rule: its bank comes out at **179**,
under the 200 floor. One entry in `UNIQUE_DIFFICULTIES` turns it on if the floor
ever moves.

### No word may carry more than 3% of a bank

The first banks put `area` in 120 of 500 English Lätt puzzles and `arena` in 84
of 500 Swedish Extrem. A word that fits everywhere is the one the solver reaches
for first, and the tenth puzzle in a sitting is where that shows.

The cap is **absolute — 15 uses, 3% of the 500 target** — rather than a share of
the finished bank, because the finished size is not known while the bank is
being built. On a full bank that lands at 3 to 6%. On the two Extrem banks,
which are much smaller by design, the same 15 is a larger share, and the build
report states the real percentage per bank rather than the intention.

Enforcing a true share needs a second pass that deletes puzzles after
generation, and it was measured with `scripts/prune-sim.ts` rather than argued
about. It costs 15 to 25% of the healthy banks and collapses the two whose pools
are tightest:

| | sv Lätt | sv Medel | sv Svår | sv Extrem | en Lätt | en Medel | en Svår | en Extrem |
|---|---|---|---|---|---|---|---|---|
| now | 442 | 263 | 394 | 473 | 333 | 381 | 429 | 354 |
| pruned to 3% | 360 | **53** | 286 | 457 | **52** | 258 | 350 | 259 |

The collapse is structural, not a tuning problem: the target moves as the bank
shrinks, so deleting a puzzle to satisfy 3% lowers the 3%, which demands another
deletion. Swedish Medel spirals from 263 to 53 that way.

Absolute it stays. The worst repetition in any shipped bank is 5.7%, which is
`agent` in 15 of Swedish Medel's 263 puzzles.

## Clues

Generated by `npm run data:clues` into `data/clues/{lang}.json`, **keyed by word
rather than by puzzle**. Across ~3,000 puzzles the same words recur constantly:
5,220 distinct words carry every entry in every bank, so the clue bank is a few
thousand generations rather than tens of thousands. Two clues per word, chosen
between by puzzle seed, so a word a player meets repeatedly does not read
identically every time.

The cache is committed. A rebuild costs nothing and stays deterministic; only
words that are new to the banks are ever sent to a model.

### The clue rules

In the system prompt, and the checkable ones re-checked in code afterwards
(`checkClue` in `scripts/build-clues.ts`) — a rule stated to a model and never
verified is a hope, not a rule:

1. The clue language follows the **puzzle** language, never the interface
   language. Swedish words get Swedish clues.
2. Eight words at most (`MAX_CLUE_WORDS`).
3. Never contains the answer, an inflection of it, or its stem — the same
   longest-common-prefix test the solver uses.
4. No proper nouns, since no answer is one.
5. Plain definitional for Lätt and Medel; mild indirection allowed for Svår and
   Extrem; never cryptic wordplay.
6. A Swedish clue must be solvable without knowing English.
7. **Never name the answer's grammatical form** — no "in the plural", "definite
   form", "imperative". The grid decides the ending; the clue decides the
   meaning. This one exists because of the ambiguity work: a clue that leaks the
   ending hands back exactly what the pinning rule was built to guarantee.

### What clue generation costs, and how the model was chosen

The economics are small enough that they should not drive the decision, and the
numbers are recorded here so nobody re-derives them under time pressure:

| | list $/MTok | full run, batched | with verification pass |
|---|---|---|---|
| Claude Haiku 4.5 | $1 / $5 | ~$0.60 | ~$1.10 |
| Claude Sonnet 5 | $2 / $10 *(intro rate)* | ~$1.20 | ~$2.20 |
| Claude Opus 5 | $5 / $25 | ~$3.00 | ~$5.50 |

Three things set those numbers:

- **Words are packed into one request, ~25 at a time.** One request per word
  re-sends the rules 5,220 times and costs roughly 5x more for identical output.
  This is the single biggest lever and it is structural, not a model choice.
- **The Batch API halves it.** ~209 requests is nowhere near the 100,000 per
  batch cap, and a bank build has no latency requirement.
- **Prompt caching is deliberately not used.** Haiku 4.5's minimum cacheable
  prefix is 4,096 tokens and the rules prompt is ~500, so it would silently
  never cache — and packing words per request already removes the duplication
  caching would have addressed.

**The decision is therefore made on Swedish quality, not on price**, and it came
out at **Claude Sonnet 5**. Measured in a pilot that clued the same 50 words per
language on all three candidates, weighted toward Extrem's inflection clusters,
three letter entries, and words appearing in several banks. Total pilot spend:
$0.18.

### Why not Haiku 4.5, at a third of the cost

Haiku wrote words that are not Swedish:

- SMEKA → *"Stryka **zärtligt** över"* — `zärtligt` is German (*zärtlich*).
- PILLA → *"**Fiksa** med fingrarna"* — `fiksa` is Norwegian; the Swedish is
  *fixa*.

And clues describing the wrong object:

- LAKAN → *"**Täcke** på sängen"* — a lakan is a sheet, a täcke is a duvet.
- TRIST → *"**Sorglöst** och mörkt"* — *sorglöst* means carefree. Inverted.
- ANKOR → *"**Vadare** med näbb och vingar"* — ducks are not waders.
- TAGET → *"Hus översta del"* — that is TAKET.
- OSEDD → *"Inte sedd eller lagd märke till"* — ungrammatical.

Sonnet got every one of those right. This is the failure that price cannot
buy back: shipping *zärtligt* to a Swedish player costs more than the $1.10
it saved.

### Why not Opus 5, which writes the best Swedish

Opus has the best crossword voice of the three — *"Ligger mellan dig och
madrassen"* for LAKAN, *"Bilarna kör på den"* for VÄG, and the single best clue
in the pilot, STYRT → *"Har hållit i ratten"*, which cues the supine through
matching tense instead of naming it.

It is still refused, and the reason is **rule 7, not the price**. Opus produced
**four** clues naming the answer's grammatical form; Sonnet produced **zero**:

```
kanan#1  Bortre delen av båten, bestämd
kanan#2  Vattenkärlet med pip, bestämd form
taget#1  Färdmedlet på räls, bestämt
taget#2  Greppet i brottning, bestämt
```

Rule 7 is what protects the pinning work in *Every entry must be pinned by its
crossings*. Using Opus for Svår and Extrem only was considered and rejected for
the same reason — those are the banks where the pinning rule matters most.

Total mechanical violations per 100 Swedish clues in the pilot: **Haiku 6,
Sonnet 3, Opus 7.**

> **Correction, from the bulk run.** Sonnet's zero form-tells was a hundred-clue
> artifact, not a property of the model. Over the full 10,438-clue bank it
> produced **229** of them — 3.1% of Swedish clues, 1.3% of English — writing
> exactly the tag Opus wrote: *"Fågeln vid vattnet, bestämd form"*. Opus's pilot
> rate was 4%. **On this axis the two models are comparable, and the pilot
> number was too small to separate them.**
>
> The Sonnet decision stands, but it now rests on the Haiku-class errors it
> avoids and on costing 2.6x less — not on a form-tell advantage it does not
> have. Do not cite "Sonnet does not do this" as a reason; it does. The
> mitigation is the mechanical check plus a regeneration pass, which works
> regardless of model, and would be needed under Opus too.

### Words nobody can clue

`KANAN` is the definite of *kana*, the slide you take on ice. Asked to clue it,
the three models produced a sore on the foot, a bird in a pot, and the stern of
a boat. **When three independent writers all miss the same word, the word is the
problem.**

Such words go on the **cut list** (`data/clues/cut.json`), not a fix list: the
word is removed from the answer pool and the puzzles that used it are rebuilt.
A clue nobody can solve is worse than a slightly smaller bank. The verification
pass flags two signals for this list:

1. the two clues for a word disagree about which sense it has, and
2. the verifier, shown only the clue, does not arrive at the word.

## Known gaps

- English `huh` and `ugh` survive the three letter gate; English has no
  interjection tag.
- Svår has only two patterns and Lätt and Extrem only one each.
- **Lätt is fully checked and is not held to the ambiguity rule.** A 4x4 with
  no black squares has the same problem Extrem had, and the same rule applied
  to it produces 179 puzzles, under the floor. Widening its bands is not
  available — it already draws easy + medium, and drawing the hard band would
  stop it being Lätt. Left as it is, deliberately: the words are common enough
  that an unpinned entry is usually guessable anyway, and Lätt has two hints.
- Swedish Extrem still leans on inflected forms. They are now all pinned by
  their crossings, which was the actual complaint, but `AKTAR` and `ENADE` are
  still what a double word square is mostly made of in Swedish.

## Still to build

Phase 3 clues, phase 4 the game, phase 5 integration.
