// ============================================================================
// Statik Kelime Zamanlama & WBW Ses Veri Şemaları (public/data/seg/*.json)
// ============================================================================

/** [wordIndex1Based, startMs, endMs] */
export type WordSegmentTuple = [number, number, number];

export interface SegReciterMeta {
  key: string;
  nameTr: string;
  matchHints: string[];
  excludeHints: string[];
  audioUrlTemplate: string | null;
  ayahCount: number;
  besmele: WordSegmentTuple[];
}

export interface SegMetaFile {
  version: string;
  wbwAudioTemplate: string;
  wbwFallbackTemplate: string;
  /** wordCounts[surahNo - 1][ayahNo - 1] = Resmi QUL / Quran.com kelime sayısı */
  wordCounts?: number[][];
  reciters: Record<string, SegReciterMeta>;
}

export interface SegSurahFile {
  s: number;
  r: string;
  /** Anahtar: ayet numarası ("1", "2", ...), Değer: [wordIndex1Based, startMs, endMs][] */
  v: Record<string, WordSegmentTuple[]>;
}
