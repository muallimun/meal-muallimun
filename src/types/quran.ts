// ============================================================================
// Veri Şemaları (public/data/*.json)
// ============================================================================

export type MealKey = 'm1' | 'm2';
export type PreferredMeal = 'm1' | 'm2' | 'both';
export type ThemeMode = 'light' | 'cream' | 'dark';
export type NavTab = 'home' | 'reader' | 'exam' | 'mistakes';

export type StudyViewMode = 'mushaf' | 'cards' | 'book';
export type BookContentMode = 'ar_only' | 'meal_only' | 'interleaved';
export type PageLayoutMode = 'single' | 'double_mushaf' | 'double_meal';
export type WordMealMode = 'off' | 'visible' | 'quiz';
export type AudioPlayMode = 'ar' | 'meal' | 'ar_then_meal';
export type MealAudioSourceId = 'tdv' | 'dib' | (string & {});
export type PlaybackRateOption = 0.75 | 1 | 1.25 | 1.5;
export type RepeatCountOption = 1 | 2 | 3;

// 1. manifest.json
export interface MealSourceInfo {
  id: MealKey | (string & {});
  label: string;
  shortLabel?: string;
  audioSource?: string | null;
  audioSourceKey?: string | null;
  hasAudio?: boolean;
}

export interface AudioSourceInfo {
  id: string;
  kind: 'ar' | 'meal';
  mealId?: MealKey | (string & {});
  label: string;
  reciterName?: string;
  baseUrl: string;
  fallbackBaseUrl?: string;
  ext: string;
}

export interface ManifestStats {
  surahs: number;
  juzs: number;
  ayahs: number;
  words: number;
  questions: number;
  questionSurahs: number[];
  tdvFootnotes?: number;
  dibFootnotes?: number;
  tdvMergedGroups?: number;
  dibMergedGroups?: number;
  pedagogicalFlags?: Record<string, number>;
}

export interface ManifestData {
  app: string;
  domain: string;
  schemaVersion: number;
  dataVersion: string;
  generatedAt?: string;
  defaultPool: {
    mode: string;
    surahs: number[];
    juzs: number[];
    preferredMeal: MealKey;
    arabicAudio: string;
    mealAudio: string;
  };
  examEngine?: {
    supportedQuestionCounts: number[];
    modes: string[];
    supportsPdfExport: boolean;
    supportsBookletAB: boolean;
  };
  meals: Record<MealKey, MealSourceInfo>;
  audioSources: Record<string, AudioSourceInfo>;
  stats: ManifestStats;
}

// 2. meta.json
export interface BesmeleInfo {
  ayahId: number;
  audioCode: string;
  excludeSurahs: number[];
  ar: string;
  tdv: string;
  dib: string;
}

export interface SurahMeta {
  no: number;
  nuzulSirasi: number;
  nameTr: string;
  nameAr: string;
  type: 'Mekkî' | 'Medenî' | string;
  ayahCount: number;
  hakkinda?: string;
  nuzul?: string;
  konusu?: string;
  shortNameTr: string;
  cuzs: number[];
  pageStart: number;
  pageEnd: number;
  firstId: number;
  lastId: number;
  tdvFootnoteCount?: number;
  dibFootnoteCount?: number;
  stemEligible?: {
    tdv: number;
    dib: number;
  };
  questionCount: number;
}

export interface JuzEndpoint {
  s: number;
  a: number;
}

export interface JuzMeta {
  no: number;
  ayahCount: number;
  surahs: number[];
  surahCounts: Record<string, number>;
  firstId: number;
  lastId: number;
  start: JuzEndpoint;
  end: JuzEndpoint;
}

export interface StudyPreset {
  id: string;
  label: string;
  mode: 'SURAHS' | 'JUZS' | 'ALL' | string;
  surahs?: number[];
  juzs?: number[];
}

export interface VerseIndexFlags {
  muqattaat: number;
  arDupCrossSurah: number;
  tdvDupCrossSurah: number;
  dibDupCrossSurah: number;
  tdvHasFootnote: number;
  dibHasFootnote: number;
  tdvMergedGroup: number;
  dibMergedGroup: number;
}

/** [id, surah, ayah, cuz, page, flags] */
export type VerseIndexRow = [number, number, number, number, number, number];

export interface MetaData {
  schemaVersion: number;
  dataVersion: string;
  besmele: BesmeleInfo;
  surahs: SurahMeta[];
  juzs: JuzMeta[];
  presets: StudyPreset[];
  verseIndexSchema: string[];
  verseIndexFlags: VerseIndexFlags;
  verseIndex: VerseIndexRow[];
}

// 3. ar/s001.json .. s114.json
export interface ArabicVerse {
  id: number;
  a: number;
  c: number;
  p: number;
  t: string;
  wc: number;
  mq?: boolean | number;
  dup?: boolean | number;
  dupX?: boolean | number;
}

export interface ArabicSurahFile {
  s: number;
  verses: ArabicVerse[];
}

// 4. m1/s001.json ve m2/s001.json
export interface MealVerse {
  id: number;
  a: number;
  t: string;
  len: number;
  fn?: string[];
  mg?: [number, number];
  dup?: boolean | number;
  dupX?: boolean | number;
}

export interface MealSurahFile {
  s: number;
  meal: 'tdv' | 'dib' | string;
  verses: MealVerse[];
}

// 5. w/s001.json
export type WordPair = [string, string];

export interface WordSurahFile {
  s: number;
  words: Record<string, WordPair[]>;
}

// 6. q/index.json
export type QuestionScope = 'surah_info' | 'ayah' | string;
export type QuestionType = 'mcq' | 'fill' | 'premise' | string;

export interface QuestionIndexItem {
  id: string;
  surah: number;
  cuz: number;
  scope: QuestionScope;
  refs: [number, number, number][];
  mealBasis: string;
  type: QuestionType;
  difficulty: number;
  status: string;
}

export interface QuestionIndexFile {
  version: string;
  availableSurahs: number[];
  items: QuestionIndexItem[];
}

// 7. q/s017.json vb.
export interface QuestionRef {
  sure: number;
  from: number;
  to: number;
}

export interface QuestionItem {
  id: string;
  uid: string;
  surah: number;
  cuz: number;
  scope: QuestionScope;
  refs: QuestionRef[];
  mealBasis: string;
  type: QuestionType;
  difficulty: number;
  premises: string[];
  stem: string;
  options: string[];
  answerIndex: number;
  lockOrder: boolean;
  explanation: string;
  sourceRef: string;
  verificationStatus: string;
}

export interface QuestionSurahFile {
  s: number;
  questions: QuestionItem[];
}

// ============================================================================
// Okuyucu & Mushaf Birleştirilmiş Veri Tipleri
// ============================================================================

export interface CombinedVerse {
  id: number;
  surah: number;
  ayah: number;
  cuz: number;
  page: number;
  ar: ArabicVerse;
  m1: MealVerse | null;
  m2: MealVerse | null;
  words: WordPair[];
}

export interface SurahBundle {
  surahMeta: SurahMeta;
  verses: CombinedVerse[];
  hasBesmele: boolean;
}

export interface MushafPageSegment {
  surahMeta: SurahMeta;
  startsAtAyah1: boolean;
  showBesmele: boolean;
  verses: CombinedVerse[];
}

export interface PageBundle {
  pageNo: number;
  minPage: number;
  maxPage: number;
  cuzs: number[];
  segments: MushafPageSegment[];
  verses: CombinedVerse[];
}

export interface StudyNavigationTarget {
  viewMode?: StudyViewMode;
  surah?: number;
  ayah?: number;
  page?: number;
  nonce: number;
}

// ============================================================================
// Uygulama Durum & Kalıcı Depo Tipleri (localStorage: muallimun_meal_v1)
// ============================================================================

export interface AppSettings {
  theme: ThemeMode;
  preferredMeal: PreferredMeal;
  arabicFont: string;
  turkishFont: string;
  arabicFontSize: number; // 20..44
  turkishFontSize: number; // 14..24
  sfxEnabled: boolean;
  sfxVolume: number; // 0..1
  showOptionLettersInApp: boolean;
  wordByWordEnabled: boolean;
  showFootnotes: boolean;
  highlightSajdah: boolean;
}

export interface StudyPool {
  selectedSurahs: number[];
  selectedJuzs: number[];
  isCustomized?: boolean;
}

export interface StudyPrefs {
  viewMode: StudyViewMode;
  wordMode: WordMealMode;
  bookContentMode: BookContentMode;
  mealAudioFocusOnly: boolean;
  pageLayout: PageLayoutMode;
  mushafSidePanelOpen: boolean;
}

export interface LastReadPosition {
  surah: number;
  ayah: number;
  page: number;
  viewMode: StudyViewMode;
  updatedAt: string;
}

export type PageBookmarkColor = 'emerald' | 'amber' | 'rose' | 'indigo';

export interface PageBookmark {
  id: string;
  page: number;
  surah: number;
  ayah: number;
  label: string;
  color: PageBookmarkColor;
  isHatim?: boolean;
  updatedAt: string;
}

export interface StudyProgress {
  lastRead: LastReadPosition | null;
  bookmarkedAyahIds: number[];
  pageBookmarks: PageBookmark[];
}

export interface AudioPrefs {
  mode: AudioPlayMode;
  arabicAudioSource: string;
  mealAudioSource: MealAudioSourceId;
  playbackRate: PlaybackRateOption;
  repeatCount: RepeatCountOption;
  autoScroll: boolean;
}

export type ExamMode = 'practice' | 'arena' | 'mock';
export type ExamDifficultyFilter = 'all' | 1 | 2 | 3;
export type ExamMealBasisFilter = 'all' | 'tdv' | 'dib' | 'common';
export type ArenaTimeLimit = 45 | 60;

export interface ExamConfig {
  mode: ExamMode;
  surahs: number[];
  difficulty: ExamDifficultyFilter;
  mealBasis: ExamMealBasisFilter;
  questionCount: number; // 0 = tümü
  prioritizeUnsolved: boolean;
  arenaTimePerQuestion: ArenaTimeLimit;
  isMistakeCamp?: boolean;
  customQuestionUids?: string[];
  title?: string;
}

export interface PreparedQuestion {
  uid: string;
  question: QuestionItem;
  options: string[];
  correctDisplayIndex: number;
  displayToOriginalIndex: number[];
  orderLocked: boolean;
  verseRefs: number[];
}

export interface ExamAnswerRecord {
  questionUid: string;
  selectedIndex: number | null; // null = boş veya süre doldu
  isCorrect: boolean;
  timedOut?: boolean;
  flagged?: boolean;
  answeredAt?: string;
}

export interface ExamArenaJokers {
  fiftyFiftyUsed: boolean;
  verseHintUsed: boolean;
  extraTimeUsed: boolean;
}

export interface ExamSessionState {
  sessionId: string;
  config: ExamConfig;
  questions: PreparedQuestion[];
  currentIndex: number;
  answers: Record<string, ExamAnswerRecord>;
  flaggedUids: string[];
  eliminatedOptionsByUid: Record<string, number[]>;
  hintRevealedUids: string[];
  livesRemaining: number;
  currentStreak: number;
  maxStreak: number;
  jokers: ExamArenaJokers;
  startedAt: number;
  elapsedSec: number;
  questionRemainingSec: number;
  totalRemainingSec: number;
}

export interface ExamResultSummary {
  sessionId: string;
  config: ExamConfig;
  questions: PreparedQuestion[];
  answers: Record<string, ExamAnswerRecord>;
  totalQuestions: number;
  correct: number;
  wrong: number;
  blank: number;
  scorePct: number;
  earnedXp: number;
  durationSec: number;
  maxStreak: number;
  newlyMasteredCount: number;
  endedByNoLives?: boolean;
  completedAt: string;
}

export interface ExamNavigationTarget {
  surahNo?: number; // Tek sure filtresi ile Sınav Merkezini aç
  mode?: ExamMode;
  autoStartMistakeCamp?: boolean;
  mistakeLimit?: number; // 0 = tümü
  nonce: number;
}

export interface ExamHistoryRecord {
  id: string;
  date: string;
  mode: ExamMode;
  surahs: number[];
  totalQuestions: number;
  correct: number;
  wrong: number;
  blank: number;
  scorePct: number;
  earnedXp: number;
  durationSec: number;
  isMistakeCamp?: boolean;
}

export interface GamificationState {
  totalXp: number;
  streakDays: number;
  lastActiveDate: string | null;
  solvedCount: number;
  correctCount: number;
  wrongQuestionIds: string[];
  bookmarkedQuestionIds: string[];
  masteredQuestionIds: string[];
  solvedQuestionUids: string[];
  examHistory: ExamHistoryRecord[];
}

export type QuestionIssueReason =
  | 'logic_contradiction'
  | 'language_typo'
  | 'option_answer_error'
  | 'other';

export interface QuestionIssueReport {
  uid: string;
  id: string;
  surah: number;
  sourceRef: string;
  verseRefs: number[];
  reason: QuestionIssueReason;
  note: string;
  stemSnippet: string;
  reportedAt: string;
}

export interface QuestionAuditState {
  reports: Record<string, QuestionIssueReport>;
  skipReportedInExams: boolean;
}

export interface PersistedAppState {
  settings: AppSettings;
  studyPool: StudyPool;
  studyPrefs: StudyPrefs;
  studyProgress: StudyProgress;
  audioPrefs: AudioPrefs;
  gamification: GamificationState;
  questionAudit: QuestionAuditState;
}

export interface PoolStatsSummary {
  surahCount: number;
  juzCount: number;
  ayahCount: number;
  questionCount: number;
  effectiveSurahs: number[];
}
