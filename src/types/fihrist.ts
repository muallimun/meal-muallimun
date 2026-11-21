// ============================================================================
// Alfabetik Konu Fihristi, Sure & Nüzul Rehberi, Bazergan Kronolojisi ve
// Kişisel Araştırma Defteri Veri Şemaları
// ============================================================================

export const TURKISH_FIHRIST_LETTERS = [
  'A',
  'B',
  'C',
  'Ç',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'İ',
  'K',
  'L',
  'M',
  'N',
  'O',
  'Ö',
  'P',
  'R',
  'S',
  'Ş',
  'T',
  'U',
  'Ü',
  'V',
  'Y',
  'Z',
] as const;

export type TurkishFihristLetter = (typeof TURKISH_FIHRIST_LETTERS)[number];

/** [sureNo, baslangicAyet, bitisAyet] */
export type FihristRefTuple = [number, number, number];

export interface FihristTopic {
  id: string;
  letter: string;
  title: string;
  refs: FihristRefTuple[];
  tags?: string[];
  seeAlso?: string;
}

export interface FihristTopicsFile {
  version: string;
  source: string;
  totalTopics: number;
  topics: FihristTopic[];
}

export interface FihristTopicsPayload {
  version?: string;
  source?: string;
  updatedAt?: string;
  totalTopics?: number;
  topics: FihristTopic[];
}

// ============================================================================
// 114 Sure — Türkçe Anlamlar, Nüzul Sıraları ve Medenî İstisna Ayetler
// ============================================================================

export interface SurahNuzulInfo {
  osman: number;
  ibnAbbas: number;
  noldekeRank: number;
  noldekePeriod: string;
}

export interface SurahExtraInfo {
  no: number;
  nameTr: string;
  meaningTr: string;
  type: 'Mekkî' | 'Medenî' | string;
  ayahCount: number;
  nuzul: SurahNuzulInfo;
  /** Sadece 35 Mekkî surede bulunan Medenî ayet aralıkları [startAyah, endAyah] */
  medeniAyahs?: [number, number][];
  /** Bilinen nüzul tarihi notu */
  nuzulNote?: string;
  /** Nota ait özel ayet aralıkları [startAyah, endAyah] */
  nuzulNoteRanges?: [number, number][];
}

export interface SurahInfoExtrasSources {
  nuzul: string;
  medeniExceptions: string;
  historicalNotes: string;
  noldeke: string;
  meanings: string;
}

export interface SurahInfoExtrasFile {
  version: string;
  sources: SurahInfoExtrasSources;
  totalSurahs: number;
  surahs: SurahExtraInfo[];
}

// ============================================================================
// Mehdi Bazergan — 24 Yıl / 213 Kayıt Vahiy Kronolojisi
// ============================================================================

export interface BazerganEntry {
  order: number;
  surah: number;
  surahName: string;
  label: string;
  ranges: [number, number][];
}

export interface BazerganYearGroup {
  year: string;
  phase: 'Mekke' | 'Medine';
  entries: BazerganEntry[];
}

export interface BazerganTimelineFile {
  version: string;
  source: string;
  methodologyNote: string;
  totalYears: number;
  totalEntries: number;
  years: BazerganYearGroup[];
}

// ============================================================================
// Fihrist Görünüm / Yazdırma ve Kişisel Araştırma Defteri Tipleri
// ============================================================================

export type FihristViewMode = 'index' | 'ar' | 'meal' | 'ar_meal';

export type FihristPrintMode = 'index' | 'meal' | 'ar_meal';

export type ResearchSortMode = 'custom' | 'mushaf' | 'nuzul';

export interface ResearchVerseEntry {
  id: string;
  surah: number;
  startAyah: number;
  endAyah: number;
  note?: string;
  addedAt: string;
}

export interface ResearchTopic {
  id: string;
  title: string;
  description?: string;
  items: ResearchVerseEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface QuickResearchSeed {
  surah: number;
  startAyah: number;
  endAyah?: number;
  page?: number;
  nonce: number;
}

export interface ResearchBackupPayload {
  schema: 'muallimun_research_backup_v1';
  exportedAt: string;
  topics: ResearchTopic[];
}

// ============================================================================
// Faz 5: Müteşâbihât (Benzer Ayetler) Veri Şeması (fihrist/mutashabihat.json)
// ============================================================================

/** 1-tabanlı kapsayıcı kelime aralığı: [baslangicKelime, bitisKelime] */
export type MutashabihatWordRange = [number, number];

/**
 * [hedefSure, hedefAyet, kaynakKelimeAraligi?, hedefKelimeAraligi?]
 */
export type MutashabihatEntryTuple = [
  number,
  number,
  MutashabihatWordRange?,
  MutashabihatWordRange?,
];

export interface MutashabihatFile {
  version: string;
  source: string;
  totalVersesWithSimilar: number;
  totalLinks: number;
  /** Anahtar formatı: "sure:ayet" (ör. "2:3") */
  verses: Record<string, MutashabihatEntryTuple[]>;
}

// ============================================================================
// Faz 6: 556 Rükû (ع) Bölümleri ve Secâvend Vakıf Rehberi (fihrist/rukus.json)
// ============================================================================

export interface RukuItem {
  no: number;
  surah: number;
  surahRuku: number;
  startAyah: number;
  endAyah: number;
  ayahCount: number;
}

export interface WaqfSignDef {
  sign: string;
  altSigns: string[];
  code: string;
  nameTr: string;
  actionTr: string;
  color: string;
  desc: string;
}

export interface RukusFile {
  version: string;
  source: string;
  totalRukus: number;
  rukus: RukuItem[];
  waqfSigns: WaqfSignDef[];
}

