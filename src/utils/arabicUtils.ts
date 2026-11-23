import type { ArabicTextDensity } from '../types/quran';

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
  { id: 'compact', label: 'Sıkı', description: 'Daha fazla kelime, derli toplu satır' },
  { id: 'balanced', label: 'Dengeli', description: 'Varsayılan okuma aralığı' },
  { id: 'relaxed', label: 'Ferah', description: 'Geniş kelime ve satır aralığı' },
];

export interface ArabicDensityMetrics {
  wordSpacing: string;
  lineHeight: number;
  tajweedLineHeight: number;
  mushafLineHeight: number;
}

const DENSITY_METRIC_MAP: Record<ArabicTextDensity, ArabicDensityMetrics> = {
  compact: {
    wordSpacing: '-0.04em',
    lineHeight: 1.98,
    tajweedLineHeight: 2.06,
    mushafLineHeight: 2.04,
  },
  balanced: {
    wordSpacing: '0em',
    lineHeight: 2.18,
    tajweedLineHeight: 2.26,
    mushafLineHeight: 2.24,
  },
  relaxed: {
    wordSpacing: '0.11em',
    lineHeight: 2.42,
    tajweedLineHeight: 2.5,
    mushafLineHeight: 2.46,
  },
};

/**
 * Arapça metin sıklığı ayarına göre hareke, med ve vakıf işaretlerinin üst/alt
 * satırlarla asla çakışmayacağı güvenli satır yüksekliği ve kelime aralığı döner.
 */
export function getArabicDensityMetrics(
  density: ArabicTextDensity | undefined,
): ArabicDensityMetrics {
  if (density === 'compact' || density === 'relaxed' || density === 'balanced') {
    return DENSITY_METRIC_MAP[density];
  }
  return DENSITY_METRIC_MAP.balanced;
}


