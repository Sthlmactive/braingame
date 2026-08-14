/**
 * Every user facing string in the app lives here. Nothing is hardcoded in a
 * component. Swedish is written as Swedish, not as translated English.
 */

export const LANGS = ["sv", "en"] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(v: unknown): v is Lang {
  return v === "sv" || v === "en";
}

const en = {
  // Shell
  appName: "Ordlek",
  tagline: "Seven word games",
  back: "Back",
  close: "Close",
  settings: "Settings",
  cancel: "Cancel",
  confirm: "Confirm",
  loading: "Loading",

  // Language screen
  chooseLanguage: "Choose language",
  langSv: "Svenska",
  langEn: "English",
  langSvNative: "Swedish",
  langEnNative: "English",

  // Level screen
  chooseLevel: "Choose level",
  level: "Level",
  levelN: "Level {n}",
  levelLocked: "Locked",
  levelCleared: "Cleared",
  levelsCleared: "{n} of 10 cleared",
  bestScore: "Best {n}",
  bestTime: "Best {t}",
  streak: "Streak {n}",

  // Game names and one line descriptions
  gameFive: "Five",
  gameFiveDesc: "Guess the hidden word",
  gameHive: "Hive",
  gameHiveDesc: "Build words from seven letters",
  gameGrid: "Grid",
  gameGridDesc: "Uncover five words at once",
  gameLoop: "Loop",
  gameLoopDesc: "Swipe the wheel, fill the board",
  gameOrdoku: "Ordoku",
  gameOrdokuDesc: "Sudoku with letters",
  gameRush: "Rush",
  gameRushDesc: "Build your own crossword",
  gameTiles: "Tiles",
  gameTilesDesc: "Play the board against Ordlek",

  // Shared game chrome
  giveUp: "Give up",
  hint: "Hint",
  hintsLeft: "{n} left",
  noHintsLeft: "No hints left",
  notAWord: "Not a word",
  alreadyFound: "Already found",
  tooShort: "Too short, {n} letters minimum",
  wrongLength: "Needs {n} letters",
  missingCentre: "Missing the centre letter",
  typeAWord: "Type a word",
  scorePoints: "{n} points",
  wordsOfTotal: "{n} of {m} words",
  goalN: "Goal {n}",
  foundWords: "Found words",
  nLetters: "{n} letters",
  more: "More",
  timeLeft: "Time",
  score: "Score",
  found: "Found",
  guesses: "Guesses",
  pangram: "Pangram",
  bonusWords: "Bonus words",
  submit: "Enter",
  del: "Delete",
  shuffle: "Shuffle",
  clear: "Clear",
  pass: "Pass",
  swap: "Swap",
  play: "Play",
  recall: "Recall",

  // Result sheet
  solved: "Solved",
  cleared: "Level cleared",
  notCleared: "Not cleared",
  outOfGuesses: "Out of guesses",
  timeUp: "Time up",
  gaveUp: "You gave up",
  theWordWas: "The word was {w}",
  playAgain: "Play again",
  nextLevel: "Next level",
  home: "Home",
  yourScore: "Score {n}",
  yourTime: "Time {t}",
  newBest: "New best",
  needScore: "You needed {n}",
  needPangram: "You needed a pangram",

  // Settings
  language: "Language",
  sound: "Sound",
  soundOn: "On",
  soundOff: "Off",
  motion: "Motion",
  motionFull: "Full",
  motionReduced: "Reduced",
  motionSystem: "System",
  resetProgress: "Reset all progress",
  resetProgressBody:
    "This clears every cleared level, best score and streak. It cannot be undone.",
  resetProgressDo: "Reset everything",
  progressReset: "Progress reset",

  // Errors and empty states
  dataError: "Could not load the word list",
  dataErrorBody: "Check your connection and try again.",
  retry: "Try again",
  puzzleError: "Could not build a puzzle",
  puzzleErrorBody: "Try another level, or play again.",
  notFound: "Nothing here",
  notFoundBody: "That screen does not exist.",

  // Tiles (Scrabble)
  yourTurn: "Your turn",
  ordleksTurn: "Ordlek is thinking",
  ordlekPlayed: "Ordlek played {w} for {n}",
  ordlekPassed: "Ordlek passed",
  you: "You",
  opponent: "Ordlek",
  tilesLeft: "{n} tiles left",
  invalidPlacement: "Tiles must form one line",
  mustTouch: "New words must touch the board",
  mustCoverCentre: "The first word must cross the centre",
  notConnected: "Everything must connect",
  turnTime: "Turn time",
  zoomFit: "Fit",

  // Rush
  useAllTiles: "Use every tile",
  tilesInvalid: "{n} words are not valid",
  newTile: "New tile",

  // Loop
  boardCleared: "Board cleared",
  bonusFound: "{n} bonus words",
  dragToForm: "Drag to form a word",
  bonusN: "Bonus {n}",
  tapHint: "Tap the letters, then tap the last one again to submit.",
  gotIt: "Got it",

  // Ordoku
  hiddenWord: "Hidden word",
  hiddenWordLocked: "Solve the board to see it",
  conflict: "Conflict",
  glyphNumbers: "Numbers",
  glyphLetters: "Letters",
  cellsFilled: "{n} of {m} cells",
  undo: "Undo",
  erase: "Erase",
  notes: "Notes",

  // Grid
  rowsLeft: "{n} rows to go",
  gridRowHints: "Use the letters you have found",
  howToPlay: "How to play",
  startPlaying: "Play",
  gridRule1: "Every one of the five rows is a word.",
  gridRule2:
    "Guess any five letter word. A letter in the right column fills in, on every row at once.",
  gridRule3: "An amber letter is somewhere in that row, but in another column.",
  gridInstruction:
    "Guess a five letter word. Correct letters in the right column fill in.",
  guessesLeft: "{n} guesses left",
  previousGuesses: "Previous guesses",

  // Five, which has difficulties instead of levels and never ends
  chooseDifficulty: "Choose difficulty",
  diffEasy: "Easy",
  diffMedium: "Medium",
  diffHard: "Hard",
  diffExtreme: "Extreme",
  diffEasyDesc: "Common words. Two hints.",
  diffMediumDesc: "One hint.",
  diffHardDesc: "Six letters. Rarer words.",
  diffExtremeDesc: "Six letters. No keyboard colours.",
  newWord: "New word",
  changeDifficulty: "Change difficulty",
  loadingWords: "Loading word list",
  allWordsPlayed: "You have played every word at this level",
  rightIn: "Right in {n}",
  theWordWasLabel: "The word was",
  changeLevel: "Change level",
  share: "Share",
  shareCopied: "Copied",
  played: "Played",
  wins: "Wins",
  winRate: "Win rate",
  currentStreak: "Streak",
  maxStreak: "Best streak",
  guessDistribution: "Guesses",
  noGamesYet: "No words played yet",
  fiveRuleGuesses: "Guess the hidden {len} letter word in {n} guesses.",
  fiveRuleColours:
    "A green letter is in the right column. An amber letter is in the word, but somewhere else.",
  fiveRuleNoColours:
    "At this difficulty the keyboard stays grey. The board still shows its colours.",

  // Word data credits. Both the Swedish list and the frequency data carry
  // attribution licences, so naming the source is a condition, not a courtesy.
  // The FrequencyWords repo is MIT for its code but CC BY-SA 4.0 for the word
  // lists themselves, and it is the word lists we use.
  wordData: "Word lists",
  wordDataSv:
    "Swedish: SALDO morphology, Språkbanken, University of Gothenburg (CC BY 4.0).",
  wordDataEn: "English: SCOWL by Kevin Atkinson (SCOWL licence).",
  wordDataFreq:
    "Word frequencies: OpenSubtitles 2018 via hermitdave/FrequencyWords (CC BY-SA 4.0).",
  wordDataFilter:
    "Answer filtering: LDNOOBW word lists (CC BY 4.0). Guessing is unaffected.",
} as const;

export type StringKey = keyof typeof en;

const sv: Record<StringKey, string> = {
  appName: "Ordlek",
  tagline: "Sju ordspel",
  back: "Tillbaka",
  close: "Stäng",
  settings: "Inställningar",
  cancel: "Avbryt",
  confirm: "Bekräfta",
  loading: "Laddar",

  chooseLanguage: "Välj språk",
  langSv: "Svenska",
  langEn: "English",
  langSvNative: "Svenska",
  langEnNative: "Engelska",

  chooseLevel: "Välj nivå",
  level: "Nivå",
  levelN: "Nivå {n}",
  levelLocked: "Låst",
  levelCleared: "Klarad",
  levelsCleared: "{n} av 10 klarade",
  bestScore: "Bäst {n}",
  bestTime: "Bäst {t}",
  streak: "Svit {n}",

  gameFive: "Five",
  gameFiveDesc: "Gissa det dolda ordet",
  gameHive: "Hive",
  gameHiveDesc: "Bygg ord av sju bokstäver",
  gameGrid: "Grid",
  gameGridDesc: "Lös fem ord samtidigt",
  gameLoop: "Loop",
  gameLoopDesc: "Dra i hjulet, fyll brädet",
  gameOrdoku: "Ordoku",
  gameOrdokuDesc: "Sudoku med bokstäver",
  gameRush: "Rush",
  gameRushDesc: "Bygg ett eget korsord",
  gameTiles: "Tiles",
  gameTilesDesc: "Spela brädet mot Ordlek",

  giveUp: "Ge upp",
  hint: "Ledtråd",
  hintsLeft: "{n} kvar",
  noHintsLeft: "Inga ledtrådar kvar",
  notAWord: "Inte ett ord",
  alreadyFound: "Redan hittat",
  tooShort: "För kort, minst {n} bokstäver",
  wrongLength: "Behöver {n} bokstäver",
  missingCentre: "Saknar mittbokstaven",
  typeAWord: "Skriv ett ord",
  scorePoints: "{n} poäng",
  wordsOfTotal: "{n} av {m} ord",
  goalN: "Mål {n}",
  foundWords: "Hittade ord",
  nLetters: "{n} bokstäver",
  more: "Mer",
  timeLeft: "Tid",
  score: "Poäng",
  found: "Hittade",
  guesses: "Gissningar",
  pangram: "Pangram",
  bonusWords: "Bonusord",
  submit: "Klar",
  del: "Radera",
  shuffle: "Blanda",
  clear: "Rensa",
  pass: "Stå över",
  swap: "Byt",
  play: "Lägg",
  recall: "Ta tillbaka",

  solved: "Löst",
  cleared: "Nivå klarad",
  notCleared: "Inte klarad",
  outOfGuesses: "Slut på gissningar",
  timeUp: "Tiden är ute",
  gaveUp: "Du gav upp",
  theWordWas: "Ordet var {w}",
  playAgain: "Spela igen",
  nextLevel: "Nästa nivå",
  home: "Hem",
  yourScore: "Poäng {n}",
  yourTime: "Tid {t}",
  newBest: "Nytt rekord",
  needScore: "Du behövde {n}",
  needPangram: "Du behövde ett pangram",

  language: "Språk",
  sound: "Ljud",
  soundOn: "På",
  soundOff: "Av",
  motion: "Rörelse",
  motionFull: "Full",
  motionReduced: "Dämpad",
  motionSystem: "Som systemet",
  resetProgress: "Nollställ alla framsteg",
  resetProgressBody:
    "Detta rensar alla klarade nivåer, rekord och sviter. Det går inte att ångra.",
  resetProgressDo: "Nollställ allt",
  progressReset: "Framstegen är nollställda",

  dataError: "Kunde inte ladda ordlistan",
  dataErrorBody: "Kontrollera anslutningen och försök igen.",
  retry: "Försök igen",
  puzzleError: "Kunde inte bygga ett pussel",
  puzzleErrorBody: "Prova en annan nivå, eller spela igen.",
  notFound: "Inget här",
  notFoundBody: "Den skärmen finns inte.",

  yourTurn: "Din tur",
  ordleksTurn: "Ordlek tänker",
  ordlekPlayed: "Ordlek lade {w} för {n}",
  ordlekPassed: "Ordlek stod över",
  you: "Du",
  opponent: "Ordlek",
  tilesLeft: "{n} brickor kvar",
  invalidPlacement: "Brickorna måste ligga på en rad",
  mustTouch: "Nya ord måste röra brädet",
  mustCoverCentre: "Första ordet måste korsa mitten",
  notConnected: "Allt måste hänga ihop",
  turnTime: "Dragtid",
  zoomFit: "Anpassa",

  useAllTiles: "Använd alla brickor",
  tilesInvalid: "{n} ord är inte giltiga",
  newTile: "Ny bricka",

  boardCleared: "Brädet är klart",
  bonusFound: "{n} bonusord",
  dragToForm: "Dra för att bilda ord",
  bonusN: "Bonus {n}",
  tapHint: "Tryck på bokstäverna, tryck på den sista igen för att svara.",
  gotIt: "Uppfattat",

  hiddenWord: "Dolt ord",
  hiddenWordLocked: "Lös brädet för att se det",
  conflict: "Konflikt",
  glyphNumbers: "Siffror",
  glyphLetters: "Bokstäver",
  cellsFilled: "{n} av {m} rutor",
  undo: "Ångra",
  erase: "Radera",
  notes: "Anteckningar",

  rowsLeft: "{n} rader kvar",
  gridRowHints: "Använd bokstäverna du har hittat",
  howToPlay: "Så spelar du",
  startPlaying: "Spela",
  gridRule1: "Var och en av de fem raderna är ett ord.",
  gridRule2:
    "Gissa vilket fembokstavsord som helst. En bokstav i rätt kolumn fylls i, på alla rader samtidigt.",
  gridRule3: "En gul bokstav finns någonstans i raden, men i en annan kolumn.",
  gridInstruction:
    "Gissa ett fembokstavsord. Rätt bokstav i rätt kolumn fylls i.",
  guessesLeft: "{n} gissningar kvar",
  previousGuesses: "Tidigare gissningar",

  chooseDifficulty: "Välj svårighetsgrad",
  diffEasy: "Lätt",
  diffMedium: "Medel",
  diffHard: "Svår",
  diffExtreme: "Extrem",
  diffEasyDesc: "Vanliga ord. Två ledtrådar.",
  diffMediumDesc: "En ledtråd.",
  diffHardDesc: "Sex bokstäver. Ovanligare ord.",
  diffExtremeDesc: "Sex bokstäver. Inget färgat tangentbord.",
  newWord: "Nytt ord",
  changeDifficulty: "Byt svårighetsgrad",
  loadingWords: "Laddar ordlista",
  allWordsPlayed: "Du har spelat alla ord på den här nivån",
  rightIn: "Rätt på {n}",
  theWordWasLabel: "Ordet var",
  changeLevel: "Byt nivå",
  share: "Dela",
  shareCopied: "Kopierat",
  played: "Spelade",
  wins: "Vinster",
  winRate: "Vinstandel",
  currentStreak: "Svit",
  maxStreak: "Bästa svit",
  guessDistribution: "Gissningar",
  noGamesYet: "Inga ord spelade än",
  fiveRuleGuesses: "Gissa det dolda ordet på {len} bokstäver på {n} gissningar.",
  fiveRuleColours:
    "En grön bokstav står i rätt kolumn. En gul bokstav finns i ordet, men på en annan plats.",
  fiveRuleNoColours:
    "På den här svårighetsgraden förblir tangentbordet grått. Brädet visar fortfarande sina färger.",

  wordData: "Ordlistor",
  wordDataSv:
    "Svenska: SALDO:s morfologi, Språkbanken, Göteborgs universitet (CC BY 4.0).",
  wordDataEn: "Engelska: SCOWL av Kevin Atkinson (SCOWL-licens).",
  wordDataFreq:
    "Ordfrekvenser: OpenSubtitles 2018 via hermitdave/FrequencyWords (CC BY-SA 4.0).",
  wordDataFilter:
    "Filtrering av svarsord: LDNOOBW:s ordlistor (CC BY 4.0). Gissningar påverkas inte.",
};

const dicts: Record<Lang, Record<StringKey, string>> = { en, sv };

export type Vars = Record<string, string | number>;

/** Look up a string and substitute {name} placeholders. */
export function t(lang: Lang, key: StringKey, vars?: Vars): string {
  const raw = dicts[lang][key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    return v === undefined ? whole : String(v);
  });
}

/** Bind a language once and get a plain t(key, vars) back. */
export function translator(lang: Lang) {
  return (key: StringKey, vars?: Vars) => t(lang, key, vars);
}

export type T = ReturnType<typeof translator>;

/** mm:ss, used by every result sheet and timer. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
