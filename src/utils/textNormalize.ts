// ============================================================================
// Arapça & Türkçe Akıllı Metin Normalizasyonu ve <mark> Vurgulama Motoru
// ============================================================================

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/**
 * Harekeler, şedde, tenvin, üstün/esre/ötre, med, tatwil, vakıf/secavend ve Kur'an işaretleri
 */
function isArabicDiacriticCode(code: number): boolean {
  return (
    code === 0x0640 || // Tatweel
    code === 0x0670 || // Superscript alef
    (code >= 0x0610 && code <= 0x061a) ||
    (code >= 0x064b && code <= 0x065f) ||
    (code >= 0x06d6 && code <= 0x06ed) ||
    (code >= 0x08d3 && code <= 0x08ff)
  );
}

function isArabicDiacriticChar(ch: string): boolean {
  return ch.length > 0 && isArabicDiacriticCode(ch.charCodeAt(0));
}

function isTurkishStripPunctChar(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    code === 0x0027 || // '
    code === 0x0060 || // `
    code === 0x00b4 || // ´
    code === 0x02bc || // ʼ
    code === 0x02c8 || // ˈ
    code === 0x0307 || // Combining dot above (İ -> i + \u0307)
    code === 0x2018 || // ‘
    code === 0x2019 // ’
  );
}

function mapArabicChar(ch: string): string {
  switch (ch) {
    case 'أ':
    case 'إ':
    case 'آ':
    case 'ٱ':
    case 'ٲ':
    case 'ٳ':
    case 'ٵ':
      return 'ا';
    case 'ة':
    case 'ۀ':
      return 'ه';
    case 'ى':
    case 'ي':
    case 'ئ':
    case 'ی':
    case 'ې':
      return 'ي';
    case 'ؤ':
      return 'و';
    case 'ک':
      return 'ك';
    default:
      return ch;
  }
}

function mapTurkishChar(ch: string): string {
  switch (ch) {
    case 'İ':
      return 'i';
    case 'I':
      return 'ı';
    case 'Â':
    case 'â':
    case 'Á':
    case 'á':
    case 'À':
    case 'à':
      return 'a';
    case 'Î':
    case 'î':
    case 'Í':
    case 'í':
    case 'Ì':
    case 'ì':
      return 'i';
    case 'Û':
    case 'û':
    case 'Ú':
    case 'ú':
    case 'Ù':
    case 'ù':
      return 'u';
    case 'Ê':
    case 'ê':
    case 'É':
    case 'é':
      return 'e';
    case 'Ô':
    case 'ô':
    case 'Ó':
    case 'ó':
      return 'o';
    default:
      return ch.toLocaleLowerCase('tr-TR');
  }
}

/**
 * Sorgu veya metnin Arapça harf içerip içermediğini tespit eder.
 */
export function isArabicText(text: string): boolean {
  return ARABIC_CHAR_REGEX.test(text);
}

/**
 * Arapça metni Türk Mushaf imlâsı ve standart klavye girişleriyle %100 eşleşecek
 * biçimde hareke, vakıf/secavend ve harf varyantlarından arındırır.
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  let out = '';
  let prevSpace = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (isArabicDiacriticChar(ch)) {
      continue;
    }
    if (/\s/.test(ch)) {
      if (!prevSpace && out.length > 0) {
        out += ' ';
        prevSpace = true;
      }
      continue;
    }
    out += mapArabicChar(ch);
    prevSpace = false;
  }

  return out.trim();
}

/**
 * Türkçe metni İ/i, I/ı kurallarına, şapkalı harflere (â->a, î->i, û->u)
 * ve kesme işaretlerine (Kur'an <-> kuran) duyarlı biçimde normalize eder.
 */
export function normalizeTurkish(text: string): string {
  if (!text) return '';
  let out = '';
  let prevSpace = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (isTurkishStripPunctChar(ch)) {
      continue;
    }
    if (/\s/.test(ch)) {
      if (!prevSpace && out.length > 0) {
        out += ' ';
        prevSpace = true;
      }
      continue;
    }
    const mapped = mapTurkishChar(ch);
    for (let j = 0; j < mapped.length; j += 1) {
      const mch = mapped[j];
      if (!isTurkishStripPunctChar(mch)) {
        out += mch;
      }
    }
    prevSpace = false;
  }

  return out.trim();
}

/**
 * Harekeleri ve vakıf işaretlerini hızlı biçimde temizler.
 */
export function stripArabicDiacritics(text: string): string {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    if (!isArabicDiacriticCode(text.charCodeAt(i))) {
      out += text[i];
    }
  }
  return out;
}

interface NormalizedIndexMap {
  normalized: string;
  starts: number[];
  ends: number[];
}

function buildNormalizedIndexMap(original: string, arabicMode: boolean): NormalizedIndexMap {
  let normalized = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let prevSpace = false;

  for (let i = 0; i < original.length; i += 1) {
    const ch = original[i];

    if (arabicMode) {
      if (isArabicDiacriticChar(ch)) {
        // Hareke/şedde/vakıf işaretini önceki baz harfin aralığına dahil et
        if (ends.length > 0) {
          ends[ends.length - 1] = i + 1;
        }
        continue;
      }
      if (/\s/.test(ch)) {
        if (!prevSpace && normalized.length > 0) {
          normalized += ' ';
          starts.push(i);
          ends.push(i + 1);
          prevSpace = true;
        } else if (prevSpace && ends.length > 0) {
          ends[ends.length - 1] = i + 1;
        }
        continue;
      }
      const mapped = mapArabicChar(ch);
      normalized += mapped;
      starts.push(i);
      ends.push(i + 1);
      prevSpace = false;
    } else {
      if (isTurkishStripPunctChar(ch)) {
        if (ends.length > 0) {
          ends[ends.length - 1] = i + 1;
        }
        continue;
      }
      if (/\s/.test(ch)) {
        if (!prevSpace && normalized.length > 0) {
          normalized += ' ';
          starts.push(i);
          ends.push(i + 1);
          prevSpace = true;
        } else if (prevSpace && ends.length > 0) {
          ends[ends.length - 1] = i + 1;
        }
        continue;
      }
      const mapped = mapTurkishChar(ch);
      for (let j = 0; j < mapped.length; j += 1) {
        const mch = mapped[j];
        if (isTurkishStripPunctChar(mch)) continue;
        normalized += mch;
        starts.push(i);
        ends.push(i + 1);
      }
      prevSpace = false;
    }
  }

  return { normalized, starts, ends };
}

const TURKISH_WORD_CHAR_REGEX = /[a-z0-9çğıöşü]/;
const ARABIC_LETTER_REGEX = /[\u0621-\u064A\u0671-\u06D3]/;

/**
 * Arapça kelime başında gelebilecek standart birleşik ön ekler (proclitics).
 * Örn: جن sorgusu الجن، والجن، بالجن، للجن kelimelerini bulurken alakasız kelime içi geçişleri eler.
 */
const ARABIC_PROCLITIC_PREFIXES = new Set([
  'و',
  'ف',
  'ب',
  'ل',
  'ك',
  'س',
  'ال',
  'وال',
  'فال',
  'بال',
  'كال',
  'لل',
  'ولل',
  'فلل',
  'وب',
  'ول',
  'وك',
  'وس',
  'فب',
  'فل',
  'فك',
  'فس',
  'وبال',
  'فبال',
  'وكال',
  'فكال',
]);

function isTurkishWordChar(ch: string): boolean {
  return ch.length > 0 && TURKISH_WORD_CHAR_REGEX.test(ch);
}

function isArabicLetterChar(ch: string): boolean {
  return ch.length > 0 && ARABIC_LETTER_REGEX.test(ch);
}

/**
 * Normalize edilmiş metin içindeki `matchIndex` konumunun kelime başı / Arapça ön ek
 * sınırına uygun olup olmadığını doğrular.
 */
export function isValidMatchBoundary(
  normalizedHaystack: string,
  matchIndex: number,
  normalizedQuery: string,
  arabicMode: boolean,
  includeSubstring = false,
): boolean {
  if (includeSubstring) return true;
  if (matchIndex <= 0) return true;

  if (!arabicMode) {
    // Türkçe: eşleşme metin başında veya kelime harfi olmayan bir karakterden sonra başlamalı
    // Örn: "cin" -> "cin", "cinler", "cinlerden", "(cinni)" EŞLEŞİR; "haricinde", "ikincisi" EŞLEŞMEZ.
    const prevChar = normalizedHaystack[matchIndex - 1];
    return !isTurkishWordChar(prevChar);
  }

  // Arapça: kelime başı veya standart Arapça ön eklerden (ال، و، ف، ب، ل، ك، س ve kombinasyonları) hemen sonra
  const prevChar = normalizedHaystack[matchIndex - 1];
  if (!isArabicLetterChar(prevChar)) {
    return true;
  }

  let wordStart = matchIndex;
  while (wordStart > 0 && isArabicLetterChar(normalizedHaystack[wordStart - 1])) {
    wordStart -= 1;
  }

  const prefix = normalizedHaystack.slice(wordStart, matchIndex);
  if (!prefix) return true;
  if (!ARABIC_PROCLITIC_PREFIXES.has(prefix)) return false;

  // Sorgu zaten "ال" ile başlıyorsa önüne ikinci bir "ال" gelmesini önle
  if (normalizedQuery.startsWith('ال') && prefix.endsWith('ال')) {
    return false;
  }

  return true;
}

/**
 * Normalize edilmiş metin ve sorguyu varsayılan olarak kelime başı (Arapça'da ön ek duyarlı)
 * kurallarına göre eşleştirir. `includeSubstring = true` ise kelime içi eşleşmelere de izin verir.
 */
export function matchesNormalizedText(
  normalizedHaystack: string,
  normalizedQuery: string,
  arabicMode: boolean,
  includeSubstring = false,
): boolean {
  if (!normalizedHaystack || !normalizedQuery) return false;
  if (includeSubstring) {
    return normalizedHaystack.includes(normalizedQuery);
  }

  let searchFrom = 0;
  while (searchFrom <= normalizedHaystack.length - normalizedQuery.length) {
    const idx = normalizedHaystack.indexOf(normalizedQuery, searchFrom);
    if (idx === -1) return false;
    if (isValidMatchBoundary(normalizedHaystack, idx, normalizedQuery, arabicMode, false)) {
      return true;
    }
    searchFrom = idx + 1;
  }

  return false;
}

/**
 * Orijinal (harekeli Arapça veya şapkalı/kesmeli Türkçe) metin içinde
 * normalize sorgunun eşleştiği tüm geçerli aralıkları bularak <mark> segmentleri üretir.
 */
export function buildHighlightedSegments(
  original: string,
  rawQuery: string,
  arabicMode?: boolean,
  includeSubstring = false,
): HighlightSegment[] {
  if (!original) return [];
  const trimmed = rawQuery.trim();
  if (!trimmed) return [{ text: original, matched: false }];

  const useArabic = arabicMode ?? isArabicText(trimmed);
  const normQuery = useArabic ? normalizeArabic(trimmed) : normalizeTurkish(trimmed);
  if (!normQuery) return [{ text: original, matched: false }];

  const { normalized, starts, ends } = buildNormalizedIndexMap(original, useArabic);
  if (!normalized) return [{ text: original, matched: false }];

  const ranges: [number, number][] = [];
  let searchFrom = 0;

  while (searchFrom < normalized.length) {
    const idx = normalized.indexOf(normQuery, searchFrom);
    if (idx === -1) break;

    if (!isValidMatchBoundary(normalized, idx, normQuery, useArabic, includeSubstring)) {
      searchFrom = idx + 1;
      continue;
    }

    const endIdx = idx + normQuery.length - 1;
    const origStart = starts[idx];
    const origEnd = ends[endIdx];
    if (origStart !== undefined && origEnd !== undefined && origEnd > origStart) {
      if (ranges.length > 0 && origStart <= ranges[ranges.length - 1][1]) {
        ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], origEnd);
      } else {
        ranges.push([origStart, origEnd]);
      }
    }
    searchFrom = idx + normQuery.length;
  }

  if (ranges.length === 0) {
    return [{ text: original, matched: false }];
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const [start, end] of ranges) {
    if (start > cursor) {
      segments.push({ text: original.slice(cursor, start), matched: false });
    }
    segments.push({ text: original.slice(start, end), matched: true });
    cursor = end;
  }

  if (cursor < original.length) {
    segments.push({ text: original.slice(cursor), matched: false });
  }

  return segments;
}
