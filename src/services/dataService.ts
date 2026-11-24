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
import { FALLBACK_FIHRIST_TOPICS } from '../data/fallbackFihristTopics';
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
let dataGeneration = 0;
let activeManifestDataVersion: string | null = null;

const dataGenerationListeners = new Set<() => void>();

export function onDataGenerationChange(listener: () => void): () => void {
  dataGenerationListeners.add(listener);
  return () => {
    dataGenerationListeners.delete(listener);
  };
}

function notifyDataGenerationChange(): void {
  for (const listener of dataGenerationListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

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
  dataGeneration += 1;
  demoMode = true;
  activeSourceMode = 'demo';
  activeManifestDataVersion = null;
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
  surahInfoExtrasMapCache = null;
  extraMealsSurahMap.clear();
  extraMealsRawCache.clear();
  extraMealsInflight.clear();
  notifyExtraMealsListeners();
  notifyDataGenerationChange();
}

export function disableDemoMode(): void {
  dataGeneration += 1;
  demoMode = false;
  resolvedBaseUrl = null;
  activeManifestDataVersion = null;
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
  surahInfoExtrasMapCache = null;
  extraMealsSurahMap.clear();
  extraMealsRawCache.clear();
  extraMealsInflight.clear();
  notifyExtraMealsListeners();
  notifyDataGenerationChange();
}

export function clearDataCache(): void {
  dataGeneration += 1;
  activeManifestDataVersion = null;
  memoryCache.clear();
  inflightRequests.clear();
  surahBundleCache.clear();
  surahInfoExtrasMapCache = null;
  extraMealsSurahMap.clear();
  extraMealsRawCache.clear();
  extraMealsInflight.clear();
  notifyExtraMealsListeners();
  notifyDataGenerationChange();
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

export const PERSISTENT_DATA_CACHE_NAME = 'muallimun-offline-json-v1';
const DATA_VERSION_HEADER = 'X-Muallimun-Data-Version';
const NETWORK_FIRST_META_PATHS = new Set<string>(['manifest.json', 'meta.json']);
const CORE_OFFLINE_JSON_PATHS = new Set<string>([
  'manifest.json',
  'meta.json',
  'q/index.json',
  'fihrist/topics.json',
]);

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = 9000,
  externalSignal?: AbortSignal,
): Promise<{ ok: boolean; status: number; contentType: string; text: string }> {
  if (typeof AbortController === 'undefined') {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const contentType = res.headers.get('content-type') || '';
    const text = res.ok ? await res.text() : '';
    return { ok: res.ok, status: res.status, contentType, text };
  }
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      return { ok: false, status: res.status, contentType, text: '' };
    }
    const text = await res.text();
    return { ok: true, status: res.status, contentType, text };
  } finally {
    clearTimeout(timerId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function readPersistentJsonCacheWithMeta<T>(
  cleanPath: string,
): Promise<{ data: T; dataVersion: string | null } | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await window.caches.open(PERSISTENT_DATA_CACHE_NAME);
    const key = `/__offline_cache__/data/${cleanPath}`;
    const res = await cache.match(key);
    if (!res) return null;
    const dataVersion = res.headers.get(DATA_VERSION_HEADER);
    const data = (await res.json()) as T;
    return { data, dataVersion };
  } catch {
    return null;
  }
}

async function writePersistentJsonCache(
  cleanPath: string,
  rawText: string,
  forcePersist = false,
  dataVersion?: string,
): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;

  // Aktif Service Worker (Workbox) sure parçalarını zaten kendi önbelleğinde tutuyorsa
  // normal gezinmede yalnızca çekirdek meta dosyalarını ikincil önbelleğe yaz (çift depolamayı önle).
  // Toplu çevrimdışı paket indirmede (forcePersist = true) her zaman kalıcı önbelleğe yaz.
  const hasSwController =
    typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
  if (!forcePersist && hasSwController && !CORE_OFFLINE_JSON_PATHS.has(cleanPath)) {
    return false;
  }

  try {
    const cache = await window.caches.open(PERSISTENT_DATA_CACHE_NAME);
    const key = `/__offline_cache__/data/${cleanPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
    };
    const versionToStore = dataVersion ?? activeManifestDataVersion;
    if (versionToStore) {
      headers[DATA_VERSION_HEADER] = versionToStore;
    }
    await cache.put(
      key,
      new Response(rawText, {
        headers,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Toplu çevrimdışı paket indirme için JSON dosyasını RAM haritasına (memoryCache)
 * doldurmadan indirir, geçerli JSON olduğunu doğrular ve kalıcı Cache API'ye yazar.
 */
export async function prefetchJsonForOffline(
  relativePath: string,
  signal?: AbortSignal,
  forceRefresh = false,
  expectedDataVersion?: string,
): Promise<boolean> {
  if (demoMode) return false;
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  const cleanPath = relativePath.replace(/^\/+/, '');
  if (signal?.aborted) {
    const err = new Error('Çevrimdışı indirme iptal edildi.');
    err.name = 'AbortError';
    throw err;
  }

  // Zaten kalıcı önbellekte geçerli sürümle varsa tekrar ağa çıkma
  if (!forceRefresh) {
    try {
      const cache = await window.caches.open(PERSISTENT_DATA_CACHE_NAME);
      const existing = await cache.match(`/__offline_cache__/data/${cleanPath}`);
      if (existing) {
        const cachedVersion = existing.headers.get(DATA_VERSION_HEADER);
        if (!expectedDataVersion || !cachedVersion || cachedVersion === expectedDataVersion) {
          return true;
        }
      }
    } catch {
      // Okuma başarısızsa ağdan devam et
    }
  }

  const candidates = getCandidateBaseUrls();
  for (const base of candidates) {
    if (signal?.aborted) {
      const err = new Error('Çevrimdışı indirme iptal edildi.');
      err.name = 'AbortError';
      throw err;
    }
    const url = `${base.replace(/\/+$/, '')}/${cleanPath}`;
    try {
      const res = await fetchTextWithTimeout(url, 12000, signal);
      if (!res.ok) continue;
      const trimmed = res.text.trimStart();
      if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
        continue;
      }
      // Geçerli JSON doğrulaması (bozuk içerik önbelleğe yazılmaz)
      JSON.parse(res.text);
      resolvedBaseUrl = base;
      activeSourceMode = base === LOCAL_DATA_BASE_URL ? 'local' : 'remote';
      return await writePersistentJsonCache(
        cleanPath,
        res.text,
        true,
        expectedDataVersion ?? activeManifestDataVersion ?? undefined,
      );
    } catch (err) {
      if (signal?.aborted) {
        const abortErr = new Error('Çevrimdışı indirme iptal edildi.');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
        // Zaman aşımı olduysa sonraki aday kaynağa geç
        continue;
      }
      // Sonraki aday kaynağa geç
    }
  }

  return false;
}

async function fetchJsonWithFallback<T>(relativePath: string): Promise<T> {
  const cleanPath = relativePath.replace(/^\/+/, '');
  const reqGen = dataGeneration;
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
    const isNetworkFirstMeta = NETWORK_FIRST_META_PATHS.has(cleanPath);

    // Çevrimdışıysa veya Lie-Fi gecikmelerini önlemek için statik içerik parçası kalıcı önbellekteyse 0ms'de dön
    const preReadCached = await readPersistentJsonCacheWithMeta<T>(cleanPath);
    if (preReadCached !== null) {
      const versionMatches =
        !activeManifestDataVersion ||
        !preReadCached.dataVersion ||
        preReadCached.dataVersion === activeManifestDataVersion;

      if (isOfflineNow || (!isNetworkFirstMeta && versionMatches)) {
        if (reqGen === dataGeneration) {
          memoryCache.set(cacheKey, preReadCached.data);
        }
        return preReadCached.data;
      }
    }

    const candidates = getCandidateBaseUrls();
    let lastError: Error | null = null;

    for (const base of candidates) {
      const url = `${base.replace(/\/+$/, '')}/${cleanPath}`;
      try {
        const res = await fetchTextWithTimeout(url, 9000);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} (${url})`);
        }
        if (
          res.text.trimStart().startsWith('<!doctype') ||
          res.text.trimStart().startsWith('<html')
        ) {
          throw new Error(`Beklenmeyen HTML yanıtı (${url}) ${res.contentType}`);
        }
        const data = JSON.parse(res.text) as T;
        if (reqGen === dataGeneration) {
          resolvedBaseUrl = base;
          activeSourceMode = base === LOCAL_DATA_BASE_URL ? 'local' : 'remote';
          memoryCache.set(cacheKey, data);
        }
        const versionTag =
          cleanPath === 'manifest.json' &&
          data &&
          typeof data === 'object' &&
          'dataVersion' in data &&
          typeof (data as { dataVersion?: unknown }).dataVersion === 'string'
            ? (data as { dataVersion: string }).dataVersion
            : activeManifestDataVersion ?? undefined;
        void writePersistentJsonCache(cleanPath, res.text, false, versionTag);
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // Ağ istekleri başarısız olduysa kalıcı önbellekteki son kopyaya düş
    if (preReadCached !== null) {
      if (reqGen === dataGeneration) {
        memoryCache.set(cacheKey, preReadCached.data);
      }
      return preReadCached.data;
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
    if (inflightRequests.get(cacheKey) === promise) {
      inflightRequests.delete(cacheKey);
    }
  }
}

export async function getManifest(): Promise<ManifestData> {
  if (demoMode) return DEMO_MANIFEST;
  const manifest = await fetchJsonWithFallback<ManifestData>('manifest.json');
  if (manifest && typeof manifest.dataVersion === 'string' && manifest.dataVersion.trim()) {
    activeManifestDataVersion = manifest.dataVersion.trim();
  }
  return manifest;
}

/**
 * Standart 604 sayfalık Medine Mushafı sayfa sınırı düzeltmeleri.
 * 358. sayfa Furkân 25:2 ile biter; Furkân 25:3 ayeti 359. sayfanın ilk ayetidir.
 * Yerel/uzak JSON ve Cache API yanıtları okunurken deterministik olarak uygulanır.
 */
const CANONICAL_AYAH_PAGE_OVERRIDES: Readonly<Record<string, number>> = {
  '25:3': 359,
};

function normalizeMetaPages(meta: MetaData): MetaData {
  let hasChanges = false;
  for (let i = 0; i < meta.verseIndex.length; i += 1) {
    const row = meta.verseIndex[i];
    const overridePage = CANONICAL_AYAH_PAGE_OVERRIDES[`${row[1]}:${row[2]}`];
    if (overridePage !== undefined && row[4] !== overridePage) {
      hasChanges = true;
      break;
    }
  }
  if (!hasChanges) return meta;

  const normalizedVerseIndex = meta.verseIndex.map((row) => {
    const overridePage = CANONICAL_AYAH_PAGE_OVERRIDES[`${row[1]}:${row[2]}`];
    if (overridePage !== undefined && row[4] !== overridePage) {
      return [row[0], row[1], row[2], row[3], overridePage, row[5]] as MetaData['verseIndex'][number];
    }
    return row;
  });

  return {
    ...meta,
    verseIndex: normalizedVerseIndex,
  };
}

function normalizeArabicSurahPages(file: ArabicSurahFile): ArabicSurahFile {
  let hasChanges = false;
  for (let i = 0; i < file.verses.length; i += 1) {
    const v = file.verses[i];
    const overridePage = CANONICAL_AYAH_PAGE_OVERRIDES[`${file.s}:${v.a}`];
    if (overridePage !== undefined && v.p !== overridePage) {
      hasChanges = true;
      break;
    }
  }
  if (!hasChanges) return file;

  return {
    ...file,
    verses: file.verses.map((v) => {
      const overridePage = CANONICAL_AYAH_PAGE_OVERRIDES[`${file.s}:${v.a}`];
      if (overridePage !== undefined && v.p !== overridePage) {
        return { ...v, p: overridePage };
      }
      return v;
    }),
  };
}

export async function getMeta(): Promise<MetaData> {
  if (demoMode) return normalizeMetaPages(DEMO_META);
  const raw = await fetchJsonWithFallback<MetaData>('meta.json');
  return normalizeMetaPages(raw);
}

export async function getQuestionIndex(): Promise<QuestionIndexFile> {
  if (demoMode) return DEMO_QUESTION_INDEX;
  return fetchJsonWithFallback<QuestionIndexFile>('q/index.json');
}

export async function getArabicSurah(surahNo: number): Promise<ArabicSurahFile> {
  if (demoMode) {
    return normalizeArabicSurahPages(DEMO_ARABIC_SURAHS[surahNo] ?? DEMO_ARABIC_SURAHS[49]);
  }
  const raw = await fetchJsonWithFallback<ArabicSurahFile>(`ar/s${padSurahNo(surahNo)}.json`);
  return normalizeArabicSurahPages(raw);
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

  const reqGen = dataGeneration;
  const cachedRaw = extraMealsRawCache.get(surahNo);
  if (cachedRaw) return cachedRaw;

  const inflight = extraMealsInflight.get(surahNo);
  if (inflight) return inflight;

  const promise = (async () => {
    if (demoMode) {
      const empty: Record<string, MealVerse[]> = {};
      if (reqGen === dataGeneration) {
        extraMealsRawCache.set(surahNo, empty);
        extraMealsSurahMap.set(surahNo, new Map());
        notifyExtraMealsListeners();
      }
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

    if (reqGen === dataGeneration) {
      extraMealsSurahMap.set(surahNo, mealIndexMap);
      extraMealsRawCache.set(surahNo, normalizedRaw);
      notifyExtraMealsListeners();
    }
    return normalizedRaw;
  })();

  extraMealsInflight.set(surahNo, promise);
  try {
    return await promise;
  } finally {
    if (extraMealsInflight.get(surahNo) === promise) {
      extraMealsInflight.delete(surahNo);
    }
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
  const reqGen = dataGeneration;
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

  if (reqGen === dataGeneration) {
    surahBundleCache.set(cacheKey, bundle);
  }
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
    return {
      version: '1.0',
      source: 'fallback',
      totalTopics: FALLBACK_FIHRIST_TOPICS.length,
      topics: [...FALLBACK_FIHRIST_TOPICS],
    };
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
  prefetchJsonForOffline,
  enableDemoMode,
  disableDemoMode,
  isDemoMode,
  getActiveDataSource,
  clearDataCache,
};
