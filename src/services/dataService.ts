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
  AudioPlaylistItem,
  CombinedVerse,
  ExtraMealsSurahFile,
  ManifestData,
  MealKey,
  MealSurahFile,
  MealVerse,
  MetaData,
  MushafPageSegment,
  PageBundle,
  QuestionIndexFile,
  QuestionItem,
  QuestionSurahFile,
  SurahBundle,
  WordSurahFile,
} from '../types/quran';
import type {
  BazerganTimelineFile,
  FihristTopicsFile,
  MutashabihatFile,
  RukusFile,
  SurahExtraInfo,
  SurahInfoExtrasFile,
} from '../types/fihrist';
import type { SegMetaFile, SegSurahFile } from '../types/wordSync';
import type { TajweedMetaFile, TajweedSurahFile } from '../types/tajweed';

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

// Tembel yüklemeli ek 22 meal (m3..m24) sure bazlı bellek önbelleği: surahNo -> mealId -> ayahNo -> MealVerse
const extraMealsSurahMap = new Map<number, Map<string, Map<number, MealVerse>>>();
const extraMealsRawCache = new Map<number, Record<string, MealVerse[]>>();
const extraMealsInflight = new Map<number, Promise<Record<string, MealVerse[]>>>();
const extraMealsListeners = new Set<() => void>();
let extraMealsVersion = 0;

function notifyExtraMealsListeners(): void {
  extraMealsVersion += 1;
  for (const listener of extraMealsListeners) {
    listener();
  }
}

export function subscribeExtraMeals(listener: () => void): () => void {
  extraMealsListeners.add(listener);
  return () => {
    extraMealsListeners.delete(listener);
  };
}

export function getExtraMealsVersion(): number {
  return extraMealsVersion;
}

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

let surahInfoExtrasMapCache: Map<number, SurahExtraInfo> | null = null;

export function enableDemoMode(): void {
  demoMode = true;
  activeSourceMode = 'demo';
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
  surahInfoExtrasMapCache = null;
  extraMealsSurahMap.clear();
  extraMealsRawCache.clear();
  extraMealsInflight.clear();
  notifyExtraMealsListeners();
}

export function disableDemoMode(): void {
  demoMode = false;
  resolvedBaseUrl = null;
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
  surahInfoExtrasMapCache = null;
  extraMealsSurahMap.clear();
  extraMealsRawCache.clear();
  extraMealsInflight.clear();
  notifyExtraMealsListeners();
}

export function clearDataCache(): void {
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
  surahInfoExtrasMapCache = null;
  extraMealsSurahMap.clear();
  extraMealsRawCache.clear();
  extraMealsInflight.clear();
  notifyExtraMealsListeners();
}

function getCandidateBaseUrls(): string[] {
  if (resolvedBaseUrl) {
    return resolvedBaseUrl === LOCAL_DATA_BASE_URL
      ? [LOCAL_DATA_BASE_URL, LIVE_DATA_BASE_URL]
      : [resolvedBaseUrl, LOCAL_DATA_BASE_URL];
  }
  if (HAS_CUSTOM_DATA_BASE_URL) {
    return [DATA_BASE_URL, LOCAL_DATA_BASE_URL];
  }
  // Aynı kök üzerinde /data erişilebilirliği varsa önce yerel /data, erişilemezse canlı domain
  return [LOCAL_DATA_BASE_URL, LIVE_DATA_BASE_URL];
}

const PERSISTENT_DATA_CACHE_NAME = 'muallimun-offline-json-v1';

async function readPersistentJsonCache<T>(cleanPath: string): Promise<T | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await window.caches.open(PERSISTENT_DATA_CACHE_NAME);
    const key = `/__offline_cache__/data/${cleanPath}`;
    const res = await cache.match(key);
    if (!res) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function writePersistentJsonCache(cleanPath: string, rawText: string): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await window.caches.open(PERSISTENT_DATA_CACHE_NAME);
    const key = `/__offline_cache__/data/${cleanPath}`;
    await cache.put(
      key,
      new Response(rawText, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    );
  } catch {
    // Depolama kısıtlıysa sessizce geç
  }
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
    const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;

    // Çevrimdışıysa doğrudan kalıcı tarayıcı önbelleğinden anında dön
    if (isOfflineNow) {
      const offlineCached = await readPersistentJsonCache<T>(cleanPath);
      if (offlineCached !== null) {
        memoryCache.set(cacheKey, offlineCached);
        return offlineCached;
      }
    }

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
        void writePersistentJsonCache(cleanPath, text);
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // Ağ istekleri başarısız olduysa kalıcı önbellekteki son kopyaya düş
    const cachedFallback = await readPersistentJsonCache<T>(cleanPath);
    if (cachedFallback !== null) {
      memoryCache.set(cacheKey, cachedFallback);
      return cachedFallback;
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

function normalizeExtraMealEntry(
  surahNo: number,
  raw: unknown,
  fallbackAyah?: number,
): MealVerse | null {
  if (typeof raw === 'string') {
    if (!fallbackAyah) return null;
    const t = raw.trim();
    return {
      id: surahNo * 1000 + fallbackAyah,
      a: fallbackAyah,
      t,
      len: t.length,
    };
  }

  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<MealVerse> & { text?: string };
  const ayahNo =
    typeof obj.a === 'number' && obj.a > 0
      ? obj.a
      : typeof obj.id === 'number' && obj.id > 0
        ? obj.id % 1000
        : fallbackAyah ?? 0;
  if (!ayahNo) return null;

  const text =
    typeof obj.t === 'string'
      ? obj.t
      : typeof obj.text === 'string'
        ? obj.text
        : '';

  const fn = Array.isArray(obj.fn)
    ? obj.fn.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    : undefined;

  const mg =
    Array.isArray(obj.mg) &&
    obj.mg.length === 2 &&
    typeof obj.mg[0] === 'number' &&
    typeof obj.mg[1] === 'number'
      ? ([obj.mg[0], obj.mg[1]] as [number, number])
      : undefined;

  return {
    id: typeof obj.id === 'number' ? obj.id : surahNo * 1000 + ayahNo,
    a: ayahNo,
    t: text,
    len: typeof obj.len === 'number' ? obj.len : text.length,
    ...(fn && fn.length > 0 ? { fn } : {}),
    ...(mg ? { mg } : {}),
  };
}

/**
 * Bir surenin ek 22 Türkçe mealini (m3..m24) `mx/sXXX.json` dosyasından tek HTTP isteğiyle
 * tembel olarak çeker ve bellek önbelleğinde (Map) saklar.
 */
export async function loadExtraMealsForSurah(
  surahNo: number,
): Promise<Record<string, MealVerse[]>> {
  if (!Number.isInteger(surahNo) || surahNo < 1 || surahNo > 114) {
    return {};
  }

  const cachedRaw = extraMealsRawCache.get(surahNo);
  if (cachedRaw) return cachedRaw;

  const inflight = extraMealsInflight.get(surahNo);
  if (inflight) return inflight;

  const promise = (async () => {
    if (demoMode) {
      const empty: Record<string, MealVerse[]> = {};
      extraMealsRawCache.set(surahNo, empty);
      extraMealsSurahMap.set(surahNo, new Map());
      notifyExtraMealsListeners();
      return empty;
    }

    const file = await fetchJsonWithFallback<ExtraMealsSurahFile>(
      `mx/s${padSurahNo(surahNo)}.json`,
    );

    const normalizedRaw: Record<string, MealVerse[]> = {};
    const mealIndexMap = new Map<string, Map<number, MealVerse>>();

    const rawMeals = file?.meals ?? {};
    for (const [mealId, entries] of Object.entries(rawMeals)) {
      const ayahMap = new Map<number, MealVerse>();
      const list: MealVerse[] = [];

      if (Array.isArray(entries)) {
        for (const item of entries) {
          const parsed = normalizeExtraMealEntry(surahNo, item);
          if (parsed) {
            ayahMap.set(parsed.a, parsed);
            list.push(parsed);
          }
        }
      } else if (entries && typeof entries === 'object') {
        for (const [ayahKey, item] of Object.entries(entries as Record<string, unknown>)) {
          const ayahNo = Number.parseInt(ayahKey, 10);
          const parsed = normalizeExtraMealEntry(
            surahNo,
            item,
            Number.isFinite(ayahNo) ? ayahNo : undefined,
          );
          if (parsed) {
            ayahMap.set(parsed.a, parsed);
            list.push(parsed);
          }
        }
      }

      mealIndexMap.set(mealId, ayahMap);
      normalizedRaw[mealId] = list;
    }

    extraMealsSurahMap.set(surahNo, mealIndexMap);
    extraMealsRawCache.set(surahNo, normalizedRaw);
    notifyExtraMealsListeners();
    return normalizedRaw;
  })();

  extraMealsInflight.set(surahNo, promise);
  try {
    return await promise;
  } finally {
    extraMealsInflight.delete(surahNo);
  }
}

export function hasExtraMealsLoaded(surahNo: number): boolean {
  return extraMealsSurahMap.has(surahNo);
}

/**
 * Seçili mealId (m1..m24) için ilgili sure ve ayetin MealVerse (t, fn, mg) kaydını döndürür.
 * m1/m2 için önce verilen `verse` veya önbellekteki SurahBundle'ı kullanır;
 * m3..m24 için `loadExtraMealsForSurah` ile yüklenmiş önbelleği okur.
 */
export function getMealVerse(
  surahNo: number,
  ayahNo: number,
  mealId: string,
  verse?: CombinedVerse | null,
): MealVerse | null {
  if (mealId === 'm1') {
    if (verse?.m1) return verse.m1;
    const cachedBundle = surahBundleCache.get(`${demoMode ? 'demo:' : ''}${surahNo}`);
    return cachedBundle?.verses.find((v) => v.ayah === ayahNo)?.m1 ?? null;
  }
  if (mealId === 'm2') {
    if (verse?.m2) return verse.m2;
    const cachedBundle = surahBundleCache.get(`${demoMode ? 'demo:' : ''}${surahNo}`);
    return cachedBundle?.verses.find((v) => v.ayah === ayahNo)?.m2 ?? null;
  }

  return extraMealsSurahMap.get(surahNo)?.get(mealId)?.get(ayahNo) ?? null;
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
 * Bir dinleme/çalma listesi bölümünün başlangıç konumunu (sure, ayet, sayfa) eşzamanlı çözümler.
 */
export function resolvePlaylistItemStartLocation(
  item: Omit<AudioPlaylistItem, 'id'>,
  meta: MetaData | null,
): { surah?: number; ayah?: number; page?: number } {
  if (!meta) {
    return {
      surah: item.surah,
      ayah: item.startAyah ?? (item.surah ? 1 : undefined),
      page: item.startPage,
    };
  }

  if (item.type === 'juz') {
    return findFirstLocationForJuz(meta, item.juz ?? 1);
  }

  if (item.type === 'page_range') {
    const { minPage, maxPage } = getPageBounds(meta);
    const targetPage = Math.max(minPage, Math.min(maxPage, item.startPage ?? minPage));
    const firstRow = meta.verseIndex.find((row) => row[4] === targetPage);
    if (firstRow) {
      return { surah: firstRow[1], ayah: firstRow[2], page: firstRow[4] };
    }
    return { page: targetPage };
  }

  if (item.type === 'ayah_range') {
    const surahNo = item.surah ?? 1;
    const ayahNo = Math.max(1, item.startAyah ?? 1);
    const pageNo = findPageForSurahAyah(meta, surahNo, ayahNo);
    return { surah: surahNo, ayah: ayahNo, page: pageNo };
  }

  const surahNo = item.surah ?? 1;
  const pageNo = findPageForSurahAyah(meta, surahNo, 1);
  return { surah: surahNo, ayah: 1, page: pageNo };
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

const EMPTY_FIHRIST_TOPICS_FILE: FihristTopicsFile = {
  version: '1.0',
  source: 'Alfabetik Konu Fihristi',
  totalTopics: 0,
  topics: [],
};

const EMPTY_SURAH_INFO_EXTRAS_FILE: SurahInfoExtrasFile = {
  version: '1.0',
  sources: {
    nuzul: '',
    medeniExceptions: '',
    historicalNotes: '',
    noldeke: '',
    meanings: '',
  },
  totalSurahs: 0,
  surahs: [],
};

const EMPTY_BAZERGAN_TIMELINE_FILE: BazerganTimelineFile = {
  version: '1.0',
  source: 'Mehdi Bazergan — Seyr-i Tahavvül-i Kur’ân',
  methodologyNote:
    'Bu kronoloji klasik nüzul rivayetlerinden farklı olarak ayet uzunluğu ve üslup istatistiğine dayanan modern bir tahmindir; akademik karşılaştırma amacıyla sunulmuştur.',
  totalYears: 0,
  totalEntries: 0,
  years: [],
};

export async function getFihristTopics(): Promise<FihristTopicsFile> {
  try {
    return await fetchJsonWithFallback<FihristTopicsFile>('fihrist/topics.json');
  } catch {
    return EMPTY_FIHRIST_TOPICS_FILE;
  }
}

export async function getSurahInfoExtras(): Promise<SurahInfoExtrasFile> {
  try {
    return await fetchJsonWithFallback<SurahInfoExtrasFile>('fihrist/surah_info.json');
  } catch {
    return EMPTY_SURAH_INFO_EXTRAS_FILE;
  }
}

export async function getSurahInfoExtrasMap(): Promise<Map<number, SurahExtraInfo>> {
  if (surahInfoExtrasMapCache && surahInfoExtrasMapCache.size > 0) {
    return surahInfoExtrasMapCache;
  }
  const file = await getSurahInfoExtras();
  const map = new Map<number, SurahExtraInfo>();
  for (const s of file.surahs ?? []) {
    if (Number.isInteger(s.no)) {
      map.set(s.no, s);
    }
  }
  if (map.size > 0) {
    surahInfoExtrasMapCache = map;
  }
  return map;
}

export async function getBazerganTimeline(): Promise<BazerganTimelineFile> {
  try {
    return await fetchJsonWithFallback<BazerganTimelineFile>('fihrist/bazergan_timeline.json');
  } catch {
    return EMPTY_BAZERGAN_TIMELINE_FILE;
  }
}

const EMPTY_MUTASHABIHAT_FILE: MutashabihatFile = {
  version: '1.0',
  source: 'Mutashabihat ul Quran (QUL)',
  totalVersesWithSimilar: 0,
  totalLinks: 0,
  verses: {},
};

const EMPTY_RUKUS_FILE: RukusFile = {
  version: '1.0',
  source: 'Tanzil Quran Metadata (556 Rükû) & Secâvend Vakıf Rehberi',
  totalRukus: 0,
  rukus: [],
  waqfSigns: [],
};

export async function getMutashabihatData(): Promise<MutashabihatFile> {
  try {
    return await fetchJsonWithFallback<MutashabihatFile>('fihrist/mutashabihat.json');
  } catch {
    return EMPTY_MUTASHABIHAT_FILE;
  }
}

export async function getRukusData(): Promise<RukusFile> {
  try {
    return await fetchJsonWithFallback<RukusFile>('fihrist/rukus.json');
  } catch {
    return EMPTY_RUKUS_FILE;
  }
}

export async function getTajweedMeta(): Promise<TajweedMetaFile> {
  return fetchJsonWithFallback<TajweedMetaFile>('tj/meta.json');
}

export async function getTajweedSurah(surahNo: number): Promise<TajweedSurahFile> {
  return fetchJsonWithFallback<TajweedSurahFile>(`tj/s${padSurahNo(surahNo)}.json`);
}

export async function getSegMeta(): Promise<SegMetaFile> {
  return fetchJsonWithFallback<SegMetaFile>('seg/meta.json');
}

export async function getSegSurah(reciterKey: string, surahNo: number): Promise<SegSurahFile> {
  return fetchJsonWithFallback<SegSurahFile>(`seg/${reciterKey}/s${padSurahNo(surahNo)}.json`);
}

export const dataService = {
  getManifest,
  getMeta,
  getQuestionIndex,
  getArabicSurah,
  getMealSurah,
  loadExtraMealsForSurah,
  hasExtraMealsLoaded,
  getMealVerse,
  subscribeExtraMeals,
  getExtraMealsVersion,
  getWordsSurah,
  getSurahQuestions,
  getQuestionsForSurahs,
  getSurahBundle,
  getPageBundle,
  getPageBounds,
  findPageForSurahAyah,
  findFirstLocationForJuz,
  resolvePlaylistItemStartLocation,
  getFihristTopics,
  getSurahInfoExtras,
  getSurahInfoExtrasMap,
  getBazerganTimeline,
  getMutashabihatData,
  getRukusData,
  getTajweedMeta,
  getTajweedSurah,
  getSegMeta,
  getSegSurah,
  enableDemoMode,
  disableDemoMode,
  isDemoMode,
  getActiveDataSource,
  clearDataCache,
};
