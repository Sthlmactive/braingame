# Ordlek

Seven word games, two languages, ten difficulty levels each. Client side only:
no backend, no accounts, no analytics. Built to feel right on an iPhone in
Safari, added to the home screen.

```
npm install
npm run dev          # http://localhost:3000
npm run verify       # typecheck, lint, tests
npm run build        # static export to out/
```

## The games

| In app | Mechanic reference | Level knob |
| ------ | ------------------ | ---------- |
| Five   | Wordle             | word length, guesses, word pool, hints, hard mode |
| Hive   | Spelling Bee       | minimum length, score to clear, pangram, countdown |
| Grid   | Squareword         | guesses, word pool, columns must be words too |
| Loop   | Wordscapes         | wheel letters, crossword slots, hints |
| Ordoku | Wordoku            | board size, givens, live conflicts, hidden word |
| Rush   | Bananagrams        | tiles, timer, peels, vowel bias |
| Tiles  | Scrabble           | opponent search depth and skill, hints, turn timer |

The whole ladder lives in `lib/levels.ts`.

## Word data

This is the part that decides whether the app is any good, so every source was
checked for existence and licence before anything depended on it.

| Data | Source | Licence |
| ---- | ------ | ------- |
| Swedish words | [SALDO morphology](https://spraakbanken.gu.se/en/resources/saldom), Språkbanken, Göteborgs universitet | CC BY 4.0 |
| English words | [SCOWL](http://wordlist.aspell.net/) by Kevin Atkinson, via the `wordlist-english` package | SCOWL permissive licence |
| Frequencies, both | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), OpenSubtitles 2018 | MIT |

CC BY 4.0 requires attribution, so the sources are named in the app's settings
sheet as well as here.

SALDO gives fully inflected Swedish word forms with part of speech tags, which
is why `hundarna` and `skrivit` are accepted and `Stockholm` is not. The
LibreOffice `sv_SE` hunspell dictionary was considered and rejected: it exists
and it is good, but it is LGPL v3, and SALDO is both cleaner licensing and
better data.

### Building it

```
npm run data:fetch    # downloads the raw sources into scripts/.cache (254 MB)
npm run data:words    # -> public/data/{en,sv}/{dict.bin,answers.txt,...}
npm run data:puzzles  # -> grid-squares.json, loop-boards.json
npm run data:icons    # -> public/icons/*
```

`scripts/.cache` is gitignored; `public/data` is committed, so a clean checkout
runs without downloading a quarter of a gigabyte.

### Shape of the shipped data

Per language, roughly 250 kB transferred, lazily loaded when that language is
first chosen:

- `dict.bin` — a packed DAWG in a `Uint32Array`. Every edge is 32 bits: letter
  index, terminal flag, last-edge flag, target offset. It answers validity,
  prefix queries, "which words can these letters spell", and pattern matching
  without ever building a `Set` of strings.
- `answers.txt` — the answer pool, front coded and alphabetical.
- `answer-bands.bin` — one byte per answer giving its difficulty band.

Filtering: proper nouns, abbreviations, anything with punctuation or digits,
and Swedish compounds over nine letters are all dropped. Å, Ä and Ö are
distinct letters, never folded to A and O, and they sort last after Z.

**Answers versus guesses.** Guesses are checked against the full dictionary
(114k English, 226k Swedish word forms). Answers only ever come from the
frequency ranked pool (~26k per language). Without that split, "full list" at
level 9 would happily serve `avlönades` as a Wordle answer.

## Layout

```
app/          routes: /, /g/[game], /g/[game]/[lang], /g/[game]/[lang]/[level]
components/   Tile, Keyboard, LevelDial, Screen, Sheet, GameShell, ResultSheet
games/        one folder per game: a pure engine plus its board component
lib/          dictionary, dawg, storage, i18n, levels, rng, sound
scripts/      the data pipeline
test/         engine and data tests
```

Every game's rules live in an `engine.ts` with no React and no I/O, which is
what makes them testable. The seven boards are lazily imported, so opening
Five does not download Tiles.

## iOS notes

- `100dvh` everywhere, never `100vh`. `env(safe-area-inset-*)` on every fixed
  element.
- No native `<input>` is used for letter entry anywhere, so the iOS keyboard
  never appears and never resizes the viewport mid game. That includes
  choosing a letter for a blank tile in Tiles, which uses a sheet of tiles.
- `user-scalable=no`, `viewport-fit=cover`, `overscroll-behavior: none`,
  `touch-action: manipulation`, transparent tap highlight.
- iOS Safari has no Vibration API, so feedback is visual plus a short Web Audio
  click. `navigator.vibrate` is feature detected and used where it exists.
- PWA: `display: standalone`, 180×180 apple touch icon, black translucent
  status bar, maskable icon. Icons are generated from the tile motif by
  `scripts/build-icons.ts`, which writes PNGs through a small hand rolled
  encoder rather than pulling in an image dependency.

## Storage

One versioned key, `Ordlek.state.v1`. Corrupt, unknown or partially valid
payloads reset to defaults silently rather than throwing — see `migrate()` in
`lib/storage.ts`. Per game, per language and level it keeps: completed, best
score, best time, streak.
