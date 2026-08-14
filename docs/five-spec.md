# Five — specification

Source of truth for Five. If this file and a chat message disagree, **this file
wins**. Change it in the same commit as the behaviour it describes.

Status: agreed and implemented, 13 August 2026.

---

## What Five is

Pick a language, pick a difficulty, get a random word, play forever. There are
no levels and no end. The result sheet is the loop: finish a word, press
**Nytt ord**, get the next one without leaving the screen.

## The difficulty table

This table is the contract. `test/levels.test.ts` asserts it with `toEqual`, so
it cannot drift without a test failing.

| Difficulty | Slug | Letters | Guesses | Keyboard colours | Hints |
|---|---|---|---|---|---|
| Lätt | `easy` | 5 | 6 | on | 2 |
| Medel | `medium` | 5 | 6 | on | 1 |
| Svår | `hard` | 6 | 6 | on | 0 |
| Extrem | `extreme` | 6 | 6 | off | 0 |

Labels: Lätt, Medel, Svår, Extrem in Swedish; Easy, Medium, Hard, Extreme in
English.

**There is no hard mode, on any difficulty.** Any valid word is a legal guess
at any point. A guess can be refused for exactly two reasons — wrong length, or
not a word — and `checkGuess` in `games/five/engine.ts` is the only place that
decides.

**Svår and Extrem differ only by the keyboard colours** and by how hard the
words themselves are. Same length, same guesses, same hints.

**Hints** reveal the first still-unknown letter, greyed, in its own column, and
cost score. Lätt keeps the two the old level 1 had, so the gentlest way to play
never got harder than it used to be.

### Revision history

- **v1** (superseded): all four difficulties at 5 letters, Extrem at 5 guesses.
  Built and then reverted. If you see 5-letter Svår/Extrem or a 5-guess Extrem
  anywhere, it is v1 residue.
- **v2** (superseded): 5/5/6/6 letters, 6 guesses throughout, hard mode on for
  Svår and Extrem, hints 2/0/0/0.
- **v3** (current): the table above. **Hard mode was removed entirely**, not
  merely defaulted off — the flag, the enforcement, the toast string and the
  rule text are all gone. It was rejecting guesses the player considered
  perfectly valid, which is not wanted on any difficulty. Do not reintroduce
  it. Medel also gained its one hint here.

## Routes

```
/five                        language: Svenska or English
/five/[lang]                 difficulty: 4 cards
/five/[lang]/[difficulty]    the game, new random word every time
```

Statically exported, so all 8 leaf routes are generated. Five has no `/g/five`
routes; `LEVELLED_GAME_IDS` excludes it.

The last language and difficulty are remembered in `fiveLast`, so the home card
deep links straight into a game. Both pickers stay reachable in one tap from
the game header.

## Word data

Two pools, scored and split independently. A six letter word is never ranked
against a five letter one.

| Pool | Feeds | Split |
|---|---|---|
| 5 letters | Lätt, Medel | Lätt takes the gentlest **600**; Medel takes the rest |
| 6 letters | Svår, Extrem | **60 / 40** by score |

Lätt is an absolute count on purpose. Its job is to be gentle, so it stays the
gentlest 600 whatever the pool does; letting it grow only pushes it deeper into
the frequency tail. Svår and Extrem are a ratio on purpose, so Extrem's size is
never an accident of pool size.

**A bucket under 300 words fails the build.** It does not ship short.

### Difficulty score

```
logRank = log(rank) / log(maxRank)          0 commonest, 1 rarest

structure penalty s, capped at 1:
  +0.25  repeated letter
  +0.15  per rare letter, capped at 0.30    sv: c q w x z    en: j q v x z
  +0.20  3 or fewer unique letters
  +0.15  1 or fewer vowels
  +0.20  * min(1, neighbours / 12)

difficulty = 0.75 * logRank + 0.25 * s
```

`neighbours` counts words in the **same length pool** differing in exactly one
position. Never across lengths — that is what makes `hatta / hatts / hatte`
clusters visible, and pure frequency cannot see them.

Lätt additionally requires: no repeated letter, no rare letter, at least two
vowels. A common but awkward word drops to Medel rather than being served to a
beginner.

### The answer pool is narrower than the guess list

Anything held out below is still a perfectly legal **guess**. It is only barred
from being the hidden word.

| Held out | How | Why |
|---|---|---|
| Swedish proper nouns | SALDO `pm`/`pmm` tag, 22,291 forms | `kalle`, `ystad`, `curie` survive the dictionary filter because they carry a second reading |
| Swedish multiword fragments | msd segment marker `n:m-k`, 10,104 forms | `cetera` exists only inside "et cetera", `round` only inside "all round" |
| Swedish genitive-only forms | every reading tagged `gen`, 393,137 forms | `greens` is the genitive of the loanword `green`; a possessive is a weak thing to guess |
| English obscurities | SCOWL band > 55 | `ariel`, `merle`, `dexter`, `bilbo`, `tesla` are all band 70 |
| English name-words | hand list in `lib/curation.ts` | `peter`, `japan` are ordinary lowercase words *and* names; no source separates them |
| Crude words, both | LDNOOBW (CC BY 4.0) ∪ stems + exceptions in `lib/curation.ts` | a word list leaks a new inflection every rebuild |

The crude filter is by stem, because `skita` was caught once and `skiter`,
`skitit`, `skitig` were not. Stems collide, so each carries exceptions:
`analys` contains anal, `grape` contains rape. That list is reviewed by hand and
is incomplete by construction; `test/difficulty.test.ts` walks every bucket and
fails if anything blocked is reachable, and pins the known innocents so a future
stem cannot quietly eat them.

**Every build writes `docs/answer-removals.md`**, grouped by the rule that
fired. Skim it after a rebuild. A false positive is invisible in the surviving
buckets — the word is simply gone — but obvious there, and it diffs. It has
already caught real ones: `stem:rapi` was eating `rapid`, `rapidly`, `rapids`,
`scraping`, `therapies` and `therapist` for one true hit; `stem:semen` was
eating only `amusement`, `basement`, `basements` and `horsemen`; `stem:röv` was
eating `bedrövad`, `erövring`, `förövare`, `prövning`, `sjörövare` and `rövare`.
All three were narrowed as a result.

LDNOOBW is unioned in, but it is a content-moderation list where over-blocking
is cheap, so exceptions override it: it holds `hård`, `sås`, `stake`, `escort`,
`nude` and `snatch`.

### Sources evaluated and rejected

**SCOWL proper-name lists.** Verified as real and correctly licensed: the
tarball at `downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz`
contains 30 `final/*-proper-names.*` files, 60,938 lowercase names, under
SCOWL's own permissive licence. **Not adopted**, for two measured reasons:

1. It does not contain `peter`, `japan`, `phoebe`, `carter` or `berlin` — the
   exact words that needed hand curation, since each is an ordinary lowercase
   English word as well as a name.
2. It overlaps 784 words of the 8,042-word English answer pool, and at the low
   ordinary bands those are `apple autumn garden family coffee dream flower
   forest castle dragon`. Unioning it would remove far more good answers than
   names.

The existing SCOWL band ≤ 55 cap already covers what it would usefully add, so
the hand list of English name-words stays.

### Shipping

`public/data/{lang}/answer-difficulty.bin`, one byte per answer, in the same
order as `answers.txt` and `answer-bands.bin`.

- `0..3` are the four buckets, in `DIFFICULTIES` order.
- **`255` means no bucket.** Wrong length, or held out of answers. Never a
  defaulted `0`.
- The build asserts no byte outside `{0,1,2,3,255}` and that the file length
  equals `answer-bands.bin`'s. Tests assert both again against the shipped file.

The build is deterministic: two runs produce byte-identical output across all
files. There is no timestamp in `meta.json` for exactly this reason.

## Random without repeats

A shuffled bag, not `Math.random()` over the pool. Every word is drawn exactly
once before any repeats.

```
localStorage  ordlek.five.bag.v1
{ "sv:easy": { seed: 1837462, cursor: 143, hash: "1a2b3c" }, ... }
```

Seed and cursor only — the permutation is rebuilt from the seed with mulberry32
and memoised, never stored.

`hash` is a fingerprint of that difficulty's pool (length plus contents in
order). **On mismatch the cursor resets to 0 and a new seed is drawn.** Without
it, a rebuild silently repoints every saved cursor at a different word and the
no-repeats promise breaks without erroring. A silent reset is fine; silent
misindexing is not.

When the cursor reaches `pool.length`, a new seed is drawn, the cursor resets,
and "Du har spelat alla ord på den här nivån" is shown **once** — on the result
sheet of the word that emptied the bag, before the reshuffle.

## Board geometry

Tile size is computed from the column count in the width direction and the row
count in the height direction; the smaller wins. `fitTile` in
`lib/useBoardFit.ts` is the pure function, so it is tested without a DOM.

`test/board-fit.test.ts` covers **5 and 6 columns at 320, 375 and 430pt** and
asserts the row never exceeds the width it was measured against and tiles stay
at least 24pt.

## Stats

Per language and difficulty, in `Ordlek.state.v1` under `five`, keyed
`${lang}:${difficulty}`: played, won, current streak, max streak, and a six bar
guess distribution.

Schema is **v2**. The v1 to v2 migration **drops only Five's per level records**
and leaves the other six games untouched — Five's old keys simply fail the
progress key test, because `LEVELLED_GAMES` no longer contains `five`. Unknown
or corrupt state resets to defaults silently, as before.

## Result sheet

The most important screen in the app. Primary button **Nytt ord** starts the
next word instantly in the same difficulty, with no route change and no menu.
Secondary: byt svårighetsgrad, and hem. The streak is on this sheet, because
that is what makes an endless mode worth playing.

## Debug

Every refused guess appends to `ordlek.debug.rejects`: word, length, language,
difficulty, and which check refused it. Bounded ring buffer of 200, no UI.

Deliberately **not** gated on `NODE_ENV`: the rejections worth reading happen on
a real phone playing the deployed production build, so a dev-only gate would
log nothing useful.

```js
JSON.parse(localStorage.getItem("ordlek.debug.rejects"))
```

## Known and accepted

- **Compound gap at 7+ letters.** SALDO has no productive compounds, so
  `varmkorv`, `drömjobb`, `klubbhus`, `tidslinje` are rejected as guesses. The
  genuine miss rate is ~0.3% at 5 letters rising to ~1.2% at 9. Five uses 5 and
  6, so this is logged against Tiles, Hive and Ordoku and is not fixed here.
- **SALDO paradigm gaps.** `gläder` is absent (SALDO prescribes `glädjer`);
  `rädslor` is absent (`rädsla` uses the uncountable paradigm `nn_0u_hälsa`).
  The pipeline reproduces SALDO faithfully; these are upstream.
- No give up in Five. Nytt ord replaces it in an endless mode.

## Presentation

How Five looks is owned by `docs/design.md`, not by this file. The visual pass
of 14 August 2026 changed no behaviour described here: same table, same routes,
same bag, same buckets, same two reject reasons.

What it did change on Five's screens: the game header carries four things
rather than six and the streak moved to the result sheet, the difficulty picker
leads each row with a row of empty tiles at its real width instead of naming
the length, and the result sheet became a destination with Nytt ord, Byt nivå
and Dela.

## Attribution

Shown in the settings sheet, and a licence condition rather than a courtesy:

- SALDO morphology, Språkbanken, Göteborgs universitet — **CC BY 4.0**
- SCOWL, Kevin Atkinson — SCOWL's own permissive terms
- OpenSubtitles 2018 frequencies via hermitdave/FrequencyWords — **CC BY-SA 4.0**
  (that repo is MIT for its *code*, CC BY-SA 4.0 for the word list *data*, and
  the data is what we use)
