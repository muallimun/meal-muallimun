// ============================================================================
// Statik Renkli Tecvit Veri Şemaları (public/data/tj/*.json)
// ============================================================================

/** Düz metin parçası veya [metinParçası, kuralKodu] çifti */
export type TajweedSegment = string | [string, string];

/** Tek bir Arapça kelimenin segment dizisi (harf birleşmesi korunarak izole edilir) */
export type TajweedWord = TajweedSegment[];

export interface TajweedVerse {
  a: number;
  w: TajweedWord[];
}

export interface TajweedSurahFile {
  s: number;
  verses: TajweedVerse[];
}

export interface TajweedRuleDef {
  code: string;
  nameTr: string;
  nameAr: string;
  category: string;
  colorLight: string;
  colorDark: string;
  desc: string;
  count: number;
}

export interface TajweedMetaFile {
  version: string;
  source: string;
  totalAyahs: number;
  totalRuleSpans: number;
  besmele: TajweedWord[];
  rules: Record<string, TajweedRuleDef>;
}

export interface TajweedAnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface TajweedActiveSelection {
  word: TajweedWord;
  rule: TajweedRuleDef;
  rect: TajweedAnchorRect;
  surahNo?: number;
  ayahNo?: number;
  wordIndex?: number;
  totalWords?: number;
}
