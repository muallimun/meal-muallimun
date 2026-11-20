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
