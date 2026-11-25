// ============================================================================
// Arapça Kelime Bölme (Vakıf/Secâvend Korumalı) ve QUL İndeks Eşleştirme
// ============================================================================

/**
 * Tek başına duran vakıf / secâvend / hizb / secde / ayet sonu işaretleri.
 * Bu simgeler ayrı bir "kelime" sayılmamalı; önceki kelimeyle (baştaysa sonrakiyle)
 * birleştirilerek zamanlama indeksinin kayması önlenir.
 */
const STANDALONE_WAQF_OR_MARKER_RE = /^[\u06D6-\u06ED\u06DD\u06DE\u06E9۞۩﴿﴾٠-٩0-9]+$/;

const STANDALONE_WAQF_SIGN_RE = /^[\u06D6-\u06DC]+$/;

/**
 * Normal Türk Mushaf hattı Arapça metnini (`verse.ar.t`) karaoke vurgulaması için
 * kelimelere ayırır; tek başına duran vakıf/secâvend işaretlerini ekstra boşluk
 * oluşturmadan bitişik kelimeyle birleştirir (QUL kelime indeks sayısını korur).
 */
export function tokenizeArabicWithWaqf(text: string): string[] {
  const rawParts = text.trim().split(/\s+/).filter(Boolean);
  if (rawParts.length === 0) return [];

  const tokens: string[] = [];
  let pendingPrefix = '';

  for (const part of rawParts) {
    if (STANDALONE_WAQF_OR_MARKER_RE.test(part)) {
      if (tokens.length > 0) {
        if (STANDALONE_WAQF_SIGN_RE.test(part)) {
          tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}${part}`;
        } else {
          tokens[tokens.length - 1] = `${tokens[tokens.length - 1]} ${part}`;
        }
      } else {
        pendingPrefix = pendingPrefix ? `${pendingPrefix} ${part}` : part;
      }
    } else if (pendingPrefix) {
      tokens.push(`${pendingPrefix} ${part}`);
      pendingPrefix = '';
    } else {
      tokens.push(part);
    }
  }

  if (pendingPrefix) {
    if (tokens.length > 0) {
      tokens[tokens.length - 1] = STANDALONE_WAQF_SIGN_RE.test(pendingPrefix)
        ? `${tokens[tokens.length - 1]}${pendingPrefix}`
        : `${tokens[tokens.length - 1]} ${pendingPrefix}`;
    } else {
      tokens.push(pendingPrefix);
    }
  }

  return tokens;
}

/**
 * QUL 1-tabanlı kelime indeksini ekrandaki kelime dizisine (1..displayTotal) eşler.
 * Kelime sayıları eşitse birebir indeks döner; farklıysa güvenli orantısal eşleştirme yapar.
 */
export function mapQulWordIndexToDisplay(
  qulWordIndex1Based: number,
  qulTotalWords: number | null | undefined,
  displayTotalWords: number,
): number {
  if (displayTotalWords <= 1) return 1;
  if (!qulTotalWords || qulTotalWords <= 0 || qulTotalWords === displayTotalWords) {
    return Math.max(1, Math.min(displayTotalWords, qulWordIndex1Based));
  }
  if (qulTotalWords === 1) return 1;
  const ratio = (qulWordIndex1Based - 1) / (qulTotalWords - 1);
  const mapped = Math.round(ratio * (displayTotalWords - 1)) + 1;
  return Math.max(1, Math.min(displayTotalWords, mapped));
}

/**
 * Ekrandaki 1-tabanlı kelime indeksini resmi QUL WBW MP3 indeksine (1..qulTotalWords)
 * güvenli olarak eşler (404 hatasını önler).
 */
export function mapDisplayWordIndexToQul(
  displayWordIndex1Based: number,
  displayTotalWords: number | null | undefined,
  qulTotalWords: number | null | undefined,
): number {
  const safeInput = Math.max(1, Math.round(displayWordIndex1Based));
  if (!qulTotalWords || qulTotalWords <= 0) {
    return safeInput;
  }
  if (!displayTotalWords || displayTotalWords <= 0 || displayTotalWords === qulTotalWords) {
    return Math.max(1, Math.min(qulTotalWords, safeInput));
  }
  if (displayTotalWords === 1 || qulTotalWords === 1) {
    return 1;
  }
  const ratio = (safeInput - 1) / (displayTotalWords - 1);
  const mapped = Math.round(ratio * (qulTotalWords - 1)) + 1;
  return Math.max(1, Math.min(qulTotalWords, mapped));
}
