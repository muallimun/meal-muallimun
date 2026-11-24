import type { ArabicLineHeightOption, ArabicTextDensity } from '../types/quran';

/**
 * Arapça sure başlıklarını her yazı tipinde eksiksiz (kutu/yuvarlak □/◌ glif hatası olmadan)
 * görüntülemek için güvenli Unicode normalizasyon yardımcıları.
 */

const ORNAMENT_AND_ISOLATED_MARKS =
  /(?:[\u06DD\u06DE\u06E9\u200B-\u200F\u202A-\u202E\uFEFF\u25CC]|[\u06D6-\u06DC]|[\u06DF-\u06E4]|[\u06E7\u06E8]|[\u06EA-\u06ED])/g;

/**
 * Özel mushaf fontlarının eksik bırakabildiği nadir Unicode karakterleri
 * (örn. Elif-i Vasl ٱ U+0671, durak süsleri, görünmez kontrol karakterleri)
 * standart Arapça karşılıklarına dönüştürür.
 */
export function formatSafeArabicTitle(
  raw: string | null | undefined,
  options?: { stripSurahPrefix?: boolean },
): string {
  if (!raw) return '';

  let cleaned = raw
    .normalize('NFC')
    .replace(/\u0671/g, '\u0627') // ٱ (Alif Wasla) -> ا
    .replace(/\u0670/g, '') // küçük dik üstün (bazı başlıklarda yuvarlak/kutu üretir)
    .replace(/\u0640/g, '') // tatwil / keșide
    .replace(ORNAMENT_AND_ISOLATED_MARKS, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (options?.stripSurahPrefix) {
    cleaned = cleaned.replace(/^سُ?ورَ?ةُ?\s+/u, '').trim();
  }

  return cleaned;
}

const ENDS_WITH_SURESI = /(?:suresi|sûresi)\s*$/iu;

/**
 * Sure adını çift "Suresi Suresi" tekrarını önleyerek temiz biçimde formatlar.
 * Örn: "İsrâ Suresi" -> "İsrâ Suresi", "İsrâ" -> "İsrâ Suresi".
 */
export function formatSurahTitle(
  name: string | null | undefined,
  fallbackSurahNo?: number,
): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return fallbackSurahNo ? `${fallbackSurahNo}. Sure` : '';
  }
  if (ENDS_WITH_SURESI.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} Suresi`;
}

export const ARABIC_TEXT_DENSITY_OPTIONS: ReadonlyArray<{
  id: ArabicTextDensity;
  label: string;
  description: string;
}> = [
  { id: 'compact', label: 'Sıkı', description: 'Basılı Mushaf gibi derli toplu kelime aralığı' },
  { id: 'balanced', label: 'Dengeli', description: 'Varsayılan dengeli kelime aralığı' },
  { id: 'relaxed', label: 'Ferah', description: 'Geniş ve rahat kelime aralığı' },
];

export const ARABIC_LINE_HEIGHT_OPTIONS: ReadonlyArray<{
  id: ArabicLineHeightOption;
  label: string;
  description: string;
}> = [
  { id: 'tight', label: 'Çok Sıkı', description: 'Kompakt Mushaf satır aralığı' },
  { id: 'compact', label: 'Sıkı', description: 'Sıkı ve toplu satır aralığı' },
  { id: 'balanced', label: 'Dengeli', description: 'Varsayılan dengeli satır aralığı' },
  { id: 'relaxed', label: 'Ferah', description: 'Geniş ve rahat satır aralığı' },
];

export interface ArabicDensityMetrics {
  wordSpacing: string;
  lineHeight: number;
  tajweedLineHeight: number;
  mushafLineHeight: number;
}

const WORD_SPACING_MAP: Record<ArabicTextDensity, string> = {
  compact: '-0.08em',
  balanced: '-0.01em',
  relaxed: '0.09em',
};

const LINE_HEIGHT_MAP: Record<
  ArabicLineHeightOption,
  { lineHeight: number; tajweedLineHeight: number; mushafLineHeight: number }
> = {
  tight: {
    lineHeight: 1.66,
    tajweedLineHeight: 1.76,
    mushafLineHeight: 1.66,
  },
  compact: {
    lineHeight: 1.82,
    tajweedLineHeight: 1.92,
    mushafLineHeight: 1.82,
  },
  balanced: {
    lineHeight: 2.04,
    tajweedLineHeight: 2.14,
    mushafLineHeight: 2.04,
  },
  relaxed: {
    lineHeight: 2.32,
    tajweedLineHeight: 2.42,
    mushafLineHeight: 2.32,
  },
};

/**
 * Arapça kelime sıklığı (`arabicTextDensity`) ve bağımsız satır aralığı (`arabicLineHeight`)
 * ayarlarına göre hareke, med ve vakıf işaretlerinin üst/alt satırlarla çakışmayacağı güvenli
 * metrikleri döner.
 */
export function getArabicDensityMetrics(
  density: ArabicTextDensity | undefined,
  lineHeightOption?: ArabicLineHeightOption,
): ArabicDensityMetrics {
  const safeDensity: ArabicTextDensity =
    density === 'compact' || density === 'relaxed' || density === 'balanced'
      ? density
      : 'balanced';

  const resolvedLineHeight: ArabicLineHeightOption =
    lineHeightOption === 'tight' ||
    lineHeightOption === 'compact' ||
    lineHeightOption === 'balanced' ||
    lineHeightOption === 'relaxed'
      ? lineHeightOption
      : safeDensity === 'compact'
        ? 'compact'
        : safeDensity === 'relaxed'
          ? 'relaxed'
          : 'balanced';

  const lh = LINE_HEIGHT_MAP[resolvedLineHeight];
  return {
    wordSpacing: WORD_SPACING_MAP[safeDensity],
    lineHeight: lh.lineHeight,
    tajweedLineHeight: lh.tajweedLineHeight,
    mushafLineHeight: lh.mushafLineHeight,
  };
}


