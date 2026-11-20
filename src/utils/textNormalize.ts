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

/**
 * Orijinal (harekeli Arapça veya şapkalı/kesmeli Türkçe) metin içinde
 * normalize sorgunun eşleştiği tüm aralıkları bularak <mark> segmentleri üretir.
 */
export function buildHighlightedSegments(
  original: string,
  rawQuery: string,
  arabicMode?: boolean,
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
