/**
 * Resmi Mushaf'a göre 114 surenin ayet sayıları (1-tabanlı sure no -> indeks `surah - 1`).
 * Depolama şema doğrulaması ve ayet aralığı kırpma işlemlerinde üst sınır olarak kullanılır.
 */
export const SURAH_AYAH_COUNTS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/**
 * Verilen sure numarası (1..114) için resmi ayet üst sınırını döndürür.
 * Geçersiz sure numaraları için `0` döner.
 */
export function getSurahMaxAyah(surah: number): number {
  if (!Number.isFinite(surah)) return 0;
  const s = Math.floor(surah);
  if (s < 1 || s > SURAH_AYAH_COUNTS.length) return 0;
  return SURAH_AYAH_COUNTS[s - 1] ?? 0;
}

/**
 * Bir sure + ayet aralığını resmi Mushaf sınırlarına (`1..getSurahMaxAyah(surah)`) kırpar.
 * Sure numarası veya ayet değerleri geçersizse `null` döner.
 */
export function clampAyahRange(
  surah: number,
  startAyah: number,
  endAyah: number,
): { surah: number; startAyah: number; endAyah: number } | null {
  if (!Number.isFinite(surah) || !Number.isFinite(startAyah) || !Number.isFinite(endAyah)) {
    return null;
  }
  const cleanSurah = Math.floor(surah);
  const maxAyah = getSurahMaxAyah(cleanSurah);
  if (maxAyah <= 0) return null;

  const rawStart = Math.floor(startAyah);
  const rawEnd = Math.floor(endAyah);
  if (rawStart < 1 && rawEnd < 1) return null;

  const clampedStart = Math.max(1, Math.min(maxAyah, rawStart));
  const clampedEnd = Math.max(1, Math.min(maxAyah, rawEnd));

  return {
    surah: cleanSurah,
    startAyah: Math.min(clampedStart, clampedEnd),
    endAyah: Math.max(clampedStart, clampedEnd),
  };
}

/**
 * `"sure:ayet"` biçimindeki anahtarın 114 sure ve resmi ayet sınırları içinde olduğunu doğrular.
 */
export function isValidVerseKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(key.trim());
  if (!match) return false;
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  const maxAyah = getSurahMaxAyah(surah);
  return maxAyah > 0 && ayah >= 1 && ayah <= maxAyah;
}
