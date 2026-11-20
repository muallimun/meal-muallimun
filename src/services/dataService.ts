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
  ManifestData,
  MealKey,
  MealSurahFile,
  MetaData,
  QuestionIndexFile,
  QuestionSurahFile,
  WordSurahFile,
} from '../types/quran';

export type DataSourceMode = 'local' | 'remote' | 'demo';

const memoryCache = new Map<string, unknown>();
const inflightRequests = new Map<string, Promise<unknown>>();

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
}

export function disableDemoMode(): void {
  demoMode = false;
  resolvedBaseUrl = null;
  memoryCache.clear();
  inflightRequests.clear();
}

export function clearDataCache(): void {
  memoryCache.clear();
  inflightRequests.clear();
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
        // SPA fallback index.html dönmüşse JSON hatası olarak ele al
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

export const dataService = {
  getManifest,
  getMeta,
  getQuestionIndex,
  getArabicSurah,
  getMealSurah,
  getWordsSurah,
  getSurahQuestions,
  enableDemoMode,
  disableDemoMode,
  isDemoMode,
  getActiveDataSource,
  clearDataCache,
};
