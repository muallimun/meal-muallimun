import type {
  MetaData,
  PoolStatsSummary,
  QuestionIndexFile,
  StudyPool,
  SurahMeta,
} from '../types/quran';

/**
 * Türkçe arama için aksan, şapka ve büyük/küçük harf duyarsız normalizasyon.
 */
export function normalizeTurkish(input: string): string {
  return input
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[’'`"^-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatNumberTr(value: number): string {
  return value.toLocaleString('tr-TR');
}

export function buildSurahQuestionCountMap(
  questionIndex: QuestionIndexFile | null,
): Map<number, number> {
  const counts = new Map<number, number>();
  if (!questionIndex) return counts;
  for (const item of questionIndex.items) {
    counts.set(item.surah, (counts.get(item.surah) ?? 0) + 1);
  }
  return counts;
}

export function buildJuzQuestionCountMap(
  questionIndex: QuestionIndexFile | null,
): Map<number, number> {
  const counts = new Map<number, number>();
  if (!questionIndex) return counts;
  for (const item of questionIndex.items) {
    counts.set(item.cuz, (counts.get(item.cuz) ?? 0) + 1);
  }
  return counts;
}

/**
 * Seçili sureler ve cüzlerin birleşimi için tekilleştirilmiş (çift saymayan) havuz istatistikleri hesaplar.
 */
export function computePoolStats(
  pool: Pick<StudyPool, 'selectedSurahs' | 'selectedJuzs'>,
  meta: MetaData | null,
  questionIndex: QuestionIndexFile | null,
): PoolStatsSummary {
  const surahSet = new Set(pool.selectedSurahs);
  const juzSet = new Set(pool.selectedJuzs);

  if (!meta) {
    return {
      surahCount: surahSet.size,
      juzCount: juzSet.size,
      ayahCount: 0,
      questionCount: 0,
      effectiveSurahs: Array.from(surahSet).sort((a, b) => a - b),
    };
  }

  const effectiveSurahSet = new Set<number>(surahSet);
  for (const juz of meta.juzs) {
    if (juzSet.has(juz.no)) {
      for (const sNo of juz.surahs) {
        effectiveSurahSet.add(sNo);
      }
    }
  }

  let ayahCount = 0;
  if (meta.verseIndex && meta.verseIndex.length > 0 && meta.verseIndex.length >= meta.surahs.length) {
    // verseIndex satırları: [id, surah, ayah, cuz, page, flags]
    // Gerçek 6236 ayet varsa doğrudan tekilleştirilmiş sayım yap
    const isFullVerseIndex = meta.verseIndex.length > 100;
    if (isFullVerseIndex) {
      for (const row of meta.verseIndex) {
        const sNo = row[1];
        const cNo = row[3];
        if (surahSet.has(sNo) || juzSet.has(cNo)) {
          ayahCount += 1;
        }
      }
    } else {
      // Demo modunda küçük verseIndex varsa sure bazlı hesapla
      for (const surah of meta.surahs) {
        if (effectiveSurahSet.has(surah.no)) {
          ayahCount += surah.ayahCount;
        }
      }
    }
  } else {
    for (const surah of meta.surahs) {
      if (effectiveSurahSet.has(surah.no)) {
        ayahCount += surah.ayahCount;
      }
    }
  }

  let questionCount = 0;
  if (questionIndex) {
    for (const item of questionIndex.items) {
      if (surahSet.has(item.surah) || juzSet.has(item.cuz)) {
        questionCount += 1;
      }
    }
  }

  return {
    surahCount: effectiveSurahSet.size,
    juzCount: juzSet.size,
    ayahCount,
    questionCount,
    effectiveSurahs: Array.from(effectiveSurahSet).sort((a, b) => a - b),
  };
}

export function getSurahMap(meta: MetaData | null): Map<number, SurahMeta> {
  const map = new Map<number, SurahMeta>();
  if (!meta) return map;
  for (const s of meta.surahs) {
    map.set(s.no, s);
  }
  return map;
}
