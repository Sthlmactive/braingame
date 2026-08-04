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
  useTheClues: "Use the letters you have found",
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

  // Ordoku
  hiddenWord: "Hidden word",
  hiddenWordLocked: "Solve the board to see it",
  conflict: "Conflict",

  // Grid
  rowsLeft: "{n} rows to go",

  // Word data credits. The Swedish list is CC BY 4.0, so naming its source is
  // a licence condition, not a courtesy.
  wordData: "Word lists",
  wordDataSv:
    "Swedish: SALDO morphology, Språkbanken, University of Gothenburg (CC BY 4.0).",
  wordDataEn: "English: SCOWL by Kevin Atkinson (SCOWL licence).",
  wordDataFreq:
    "Word frequencies: OpenSubtitles 2018 via hermitdave/FrequencyWords (MIT).",
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
  missingCentre: "Mittbokstaven saknas",
  useTheClues: "Använd bokstäverna du har hittat",
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

  hiddenWord: "Dolt ord",
  hiddenWordLocked: "Lös brädet för att se det",
  conflict: "Konflikt",

  rowsLeft: "{n} rader kvar",

  wordData: "Ordlistor",
  wordDataSv:
    "Svenska: SALDO:s morfologi, Språkbanken, Göteborgs universitet (CC BY 4.0).",
  wordDataEn: "Engelska: SCOWL av Kevin Atkinson (SCOWL-licens).",
  wordDataFreq:
    "Ordfrekvenser: OpenSubtitles 2018 via hermitdave/FrequencyWords (MIT).",
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
