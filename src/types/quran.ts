// ============================================================================
// Veri Şemaları (public/data/*.json)
// ============================================================================

export type MealKey = 'm1' | 'm2';
export type PreferredMeal = 'm1' | 'm2' | 'both';
export type ThemeMode = 'light' | 'cream' | 'dark';
export type NavTab = 'home' | 'reader' | 'exam' | 'mistakes';

// 1. manifest.json
export interface MealSourceInfo {
  id: MealKey;
  label: string;
  audioSource: string;
}

export interface AudioSourceInfo {
  id: string;
  kind: 'ar' | 'meal';
  mealId?: MealKey;
  label: string;
  baseUrl: string;
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
  mq?: boolean;
  dup?: boolean;
  dupX?: boolean;
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
  dup?: boolean;
  dupX?: boolean;
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
}

export interface StudyPool {
  selectedSurahs: number[];
  selectedJuzs: number[];
  isCustomized?: boolean;
}

export interface ExamHistoryRecord {
  id: string;
  date: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  xpEarned: number;
  surahs: number[];
  durationSeconds?: number;
}

export interface GamificationState {
  totalXp: number;
  streakDays: number;
  lastActiveDate: string | null;
  solvedCount: number;
  correctCount: number;
  wrongQuestionIds: string[];
  examHistory: ExamHistoryRecord[];
}

export interface PersistedAppState {
  settings: AppSettings;
  studyPool: StudyPool;
  gamification: GamificationState;
}

export interface PoolStatsSummary {
  surahCount: number;
  juzCount: number;
  ayahCount: number;
  questionCount: number;
  effectiveSurahs: number[];
}
