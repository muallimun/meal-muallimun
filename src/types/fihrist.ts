// ============================================================================
// Alfabetik Konu Fihristi & Kişisel Araştırma Defteri Veri Şemaları
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
  tags?: string[];
  seeAlso?: string;
  refs: FihristRefTuple[];
}

export interface FihristTopicsPayload {
  version?: string;
  updatedAt?: string;
  topics: FihristTopic[];
}

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
