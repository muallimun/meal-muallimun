import {
  DATA_BASE_URL,
  HAS_CUSTOM_DATA_BASE_URL,
  LIVE_DATA_BASE_URL,
  LOCAL_DATA_BASE_URL,
} from '../config/assetsConfig';
import {
  DEMO_ARABIC_SURAHS,
  DEMO_MANIFEST,
  DEMO_MEAL1_SURAHS,
  DEMO_MEAL2_SURAHS,
  DEMO_META,
  DEMO_QUESTION_INDEX,
  DEMO_QUESTIONS_EMPTY,
  DEMO_WORDS_EMPTY,
} from '../data/demoFallback';
import type {
  ArabicSurahFile,
  CombinedVerse,
  ManifestData,
  MealKey,
  MealSurahFile,
  MetaData,
  MushafPageSegment,
  PageBundle,
  QuestionIndexFile,
  QuestionItem,
  QuestionSurahFile,
  SurahBundle,
  WordSurahFile,
} from '../types/quran';

export type DataSourceMode = 'local' | 'remote' | 'demo';

/**
 * Diyanet / Hanefî standardına göre 14 Tilâvet Secdesi ayet ID'leri (sureNo * 1000 + ayetNo).
 */
export const SAJDAH_AYAH_IDS = new Set<number>([
  7206, 13015, 16050, 17109, 19058, 22018, 25060, 27026, 32015, 38024, 41038, 53062, 84021, 96019,
]);

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

export function toArabicIndicDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => ARABIC_INDIC_DIGITS[Number(digit)] ?? digit);
}

const memoryCache = new Map<string, unknown>();
const inflightRequests = new Map<string, Promise<unknown>>();
const surahBundleCache = new Map<string, SurahBundle>();

let resolvedBaseUrl: string | null = null;
let activeSourceMode: DataSourceMode = HAS_CUSTOM_DATA_BASE_URL ? 'remote' : 'local';
let demoMode = false;

export function padSurahNo(surahNo: number): string {
  return String(surahNo).padStart(3, '0');
}

export function isDemoMode(): boolean {
  return demoMode;
}

export function getActiveDataSource(): DataSourceMode {
  return demoMode ? 'demo' : activeSourceMode;
}

export function enableDemoMode(): void {
  demoMode = true;
  activeSourceMode = 'demo';
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
}

export function disableDemoMode(): void {
  demoMode = false;
  resolvedBaseUrl = null;
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
}

export function clearDataCache(): void {
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
}

function getCandidateBaseUrls(): string[] {
  if (resolvedBaseUrl) {
    return [resolvedBaseUrl];
  }
  if (HAS_CUSTOM_DATA_BASE_URL) {
    return [DATA_BASE_URL, LOCAL_DATA_BASE_URL];
  }
  // Aynı kök üzerinde /data erişilebilirliği varsa önce yerel /data, erişilemezse canlı domain
  return [LOCAL_DATA_BASE_URL, LIVE_DATA_BASE_URL];
}

async function fetchJsonWithFallback<T>(relativePath: string): Promise<T> {
  const cleanPath = relativePath.replace(/^\/+/, '');
  const cacheKey = `${demoMode ? 'demo:' : ''}${cleanPath}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey) as T;
  }

  const existing = inflightRequests.get(cacheKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    const candidates = getCandidateBaseUrls();
    let lastError: Error | null = null;

    for (const base of candidates) {
      const url = `${base.replace(/\/+$/, '')}/${cleanPath}`;
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} (${url})`);
        }
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        if (text.trimStart().startsWith('<!doctype') || text.trimStart().startsWith('<html')) {
          throw new Error(`Beklenmeyen HTML yanıtı (${url}) ${contentType}`);
        }
        const data = JSON.parse(text) as T;
        resolvedBaseUrl = base;
        activeSourceMode = base === LOCAL_DATA_BASE_URL ? 'local' : 'remote';
        memoryCache.set(cacheKey, data);
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(
      lastError?.message ||
        `Veri kaynağına ulaşılamadı (${cleanPath}). İnternet bağlantınızı kontrol edin.`,
    );
  })();

  inflightRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

export async function getManifest(): Promise<ManifestData> {
  if (demoMode) return DEMO_MANIFEST;
  return fetchJsonWithFallback<ManifestData>('manifest.json');
}

export async function getMeta(): Promise<MetaData> {
  if (demoMode) return DEMO_META;
  return fetchJsonWithFallback<MetaData>('meta.json');
}

export async function getQuestionIndex(): Promise<QuestionIndexFile> {
  if (demoMode) return DEMO_QUESTION_INDEX;
  return fetchJsonWithFallback<QuestionIndexFile>('q/index.json');
}

export async function getArabicSurah(surahNo: number): Promise<ArabicSurahFile> {
  if (demoMode) {
    return DEMO_ARABIC_SURAHS[surahNo] ?? DEMO_ARABIC_SURAHS[49];
  }
  return fetchJsonWithFallback<ArabicSurahFile>(`ar/s${padSurahNo(surahNo)}.json`);
}

export async function getMealSurah(meal: MealKey, surahNo: number): Promise<MealSurahFile> {
  if (demoMode) {
    const source = meal === 'm1' ? DEMO_MEAL1_SURAHS : DEMO_MEAL2_SURAHS;
    return source[surahNo] ?? source[49];
  }
  return fetchJsonWithFallback<MealSurahFile>(`${meal}/s${padSurahNo(surahNo)}.json`);
}

export async function getWordsSurah(surahNo: number): Promise<WordSurahFile> {
  if (demoMode) return DEMO_WORDS_EMPTY(surahNo);
  return fetchJsonWithFallback<WordSurahFile>(`w/s${padSurahNo(surahNo)}.json`);
}

export async function getSurahQuestions(surahNo: number): Promise<QuestionSurahFile> {
  if (demoMode) return DEMO_QUESTIONS_EMPTY(surahNo);
  return fetchJsonWithFallback<QuestionSurahFile>(`q/s${padSurahNo(surahNo)}.json`);
}

/**
 * Verilen sure numaraları için soru bankası JSON dosyalarını paralel (Promise.all) ve bellek önbellekli çeker.
 */
export async function getQuestionsForSurahs(surahNumbers: number[]): Promise<QuestionItem[]> {
  const uniqueSurahs = Array.from(
    new Set(surahNumbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 114)),
  ).sort((a, b) => a - b);

  if (uniqueSurahs.length === 0) return [];

  const files = await Promise.all(
    uniqueSurahs.map(async (sNo) => {
      try {
        return await getSurahQuestions(sNo);
      } catch {
        return { s: sNo, questions: [] } as QuestionSurahFile;
      }
    }),
  );

  const merged: QuestionItem[] = [];
  for (const file of files) {
    if (Array.isArray(file.questions)) {
      for (const q of file.questions) {
        if (q && typeof q.stem === 'string' && Array.isArray(q.options) && q.options.length >= 2) {
          merged.push(q);
        }
      }
    }
  }
  return merged;
}

/**
 * meta.verseIndex içindeki entry[4] (page) değerlerinden dinamik olarak minPage ve maxPage hesaplar.
 */
export function getPageBounds(meta: MetaData): { minPage: number; maxPage: number } {
  let minPage = Infinity;
  let maxPage = -Infinity;

  if (meta.verseIndex && meta.verseIndex.length > 0) {
    for (const row of meta.verseIndex) {
      const p = row[4];
      if (typeof p === 'number') {
        if (p < minPage) minPage = p;
        if (p > maxPage) maxPage = p;
      }
    }
  }

  if (!Number.isFinite(minPage) || !Number.isFinite(maxPage)) {
    for (const s of meta.surahs) {
      if (s.pageStart < minPage) minPage = s.pageStart;
      if (s.pageEnd > maxPage) maxPage = s.pageEnd;
    }
  }

  if (!Number.isFinite(minPage) || !Number.isFinite(maxPage)) {
    return { minPage: 1, maxPage: 604 };
  }

  return { minPage, maxPage };
}

export function findPageForSurahAyah(meta: MetaData, surahNo: number, ayahNo: number): number {
  const row = meta.verseIndex.find((r) => r[1] === surahNo && r[2] === ayahNo);
  if (row) return row[4];
  const surah = meta.surahs.find((s) => s.no === surahNo);
  return surah ? surah.pageStart : getPageBounds(meta).minPage;
}

export function findFirstLocationForJuz(
  meta: MetaData,
  juzNo: number,
): { surah: number; ayah: number; page: number } {
  const juz = meta.juzs.find((j) => j.no === juzNo);
  if (juz) {
    const page = findPageForSurahAyah(meta, juz.start.s, juz.start.a);
    return { surah: juz.start.s, ayah: juz.start.a, page };
  }
  const row = meta.verseIndex.find((r) => r[3] === juzNo);
  if (row) {
    return { surah: row[1], ayah: row[2], page: row[4] };
  }
  const { minPage } = getPageBounds(meta);
  return { surah: 1, ayah: 1, page: minPage };
}

/**
 * Bir surenin Arapça, TDV (m1), DİB (m2) ve kelime-kelime (w) verilerini tekilleştirip birleştirir.
 */
export async function getSurahBundle(surahNo: number): Promise<SurahBundle> {
  const cacheKey = `${demoMode ? 'demo:' : ''}${surahNo}`;
  const cached = surahBundleCache.get(cacheKey);
  if (cached) return cached;

  const [meta, arFile, m1File, m2File, wordsFile] = await Promise.all([
    getMeta(),
    getArabicSurah(surahNo),
    getMealSurah('m1', surahNo),
    getMealSurah('m2', surahNo),
    getWordsSurah(surahNo).catch(() => ({ s: surahNo, words: {} }) as WordSurahFile),
  ]);

  const surahMeta = meta.surahs.find((s) => s.no === surahNo);
  if (!surahMeta) {
    throw new Error(`${surahNo} numaralı sure meta verisi bulunamadı.`);
  }

  const m1Map = new Map(m1File.verses.map((v) => [v.a, v]));
  const m2Map = new Map(m2File.verses.map((v) => [v.a, v]));

  const verses: CombinedVerse[] = arFile.verses.map((ar) => ({
    id: ar.id,
    surah: surahNo,
    ayah: ar.a,
    cuz: ar.c,
    page: ar.p,
    ar,
    m1: m1Map.get(ar.a) ?? null,
    m2: m2Map.get(ar.a) ?? null,
    words: wordsFile.words[String(ar.a)] ?? [],
  }));

  const bundle: SurahBundle = {
    surahMeta,
    verses,
    hasBesmele: !meta.besmele.excludeSurahs.includes(surahNo),
  };

  surahBundleCache.set(cacheKey, bundle);
  return bundle;
}

/**
 * Verilen Mushaf sayfa numarasındaki tüm ayetleri sure bölümleri (segments) halinde paralel yükler.
 */
export async function getPageBundle(pageNo: number): Promise<PageBundle> {
  const meta = await getMeta();
  const { minPage, maxPage } = getPageBounds(meta);
  const clampedPage = Math.max(minPage, Math.min(maxPage, pageNo));

  const pageRows = meta.verseIndex.filter((row) => row[4] === clampedPage);
  const uniqueSurahNos: number[] = [];
  const seenSurahs = new Set<number>();

  for (const row of pageRows) {
    const sNo = row[1];
    if (!seenSurahs.has(sNo)) {
      seenSurahs.add(sNo);
      uniqueSurahNos.push(sNo);
    }
  }

  const bundles = await Promise.all(uniqueSurahNos.map((sNo) => getSurahBundle(sNo)));
  const bundleBySurah = new Map<number, SurahBundle>(
    bundles.map((b) => [b.surahMeta.no, b]),
  );

  const segments: MushafPageSegment[] = [];
  const allVerses: CombinedVerse[] = [];
  const juzSet = new Set<number>();

  let currentSegment: MushafPageSegment | null = null;

  for (const row of pageRows) {
    const [, surahNo, ayahNo, cuzNo] = row;
    juzSet.add(cuzNo);

    const surahBundle = bundleBySurah.get(surahNo);
    if (!surahBundle) continue;

    const combinedVerse = surahBundle.verses.find((v) => v.ayah === ayahNo);
    if (!combinedVerse) continue;

    allVerses.push(combinedVerse);

    if (!currentSegment || currentSegment.surahMeta.no !== surahNo) {
      const startsAtAyah1 = ayahNo === 1;
      currentSegment = {
        surahMeta: surahBundle.surahMeta,
        startsAtAyah1,
        showBesmele: startsAtAyah1 && surahBundle.hasBesmele,
        verses: [combinedVerse],
      };
      segments.push(currentSegment);
    } else {
      currentSegment.verses.push(combinedVerse);
    }
  }

  return {
    pageNo: clampedPage,
    minPage,
    maxPage,
    cuzs: Array.from(juzSet).sort((a, b) => a - b),
    segments,
    verses: allVerses,
  };
}

export const dataService = {
  getManifest,
  getMeta,
  getQuestionIndex,
  getArabicSurah,
  getMealSurah,
  getWordsSurah,
  getSurahQuestions,
  getQuestionsForSurahs,
  getSurahBundle,
  getPageBundle,
  getPageBounds,
  findPageForSurahAyah,
  findFirstLocationForJuz,
  enableDemoMode,
  disableDemoMode,
  isDemoMode,
  getActiveDataSource,
  clearDataCache,
};
