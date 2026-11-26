export const AUDIO_CACHE_NAME = 'muallimun-audio-cache-v1';
export const AUTO_CACHE_AUDIO_KEY = 'muallimun_auto_cache_audio_v1';

const MIN_VALID_AUDIO_BYTES = 256;

export interface AudioCacheStats {
  entryCount: number;
  totalBytes: number;
}

export interface SurahAudioPrefetchProgress {
  completed: number;
  total: number;
  percent: number;
  failed: number;
}

export interface PrefetchSurahAudioOptions {
  surahNo: number;
  ayahCount: number;
  buildAyahUrls: (surahNo: number, ayahNo: number) => string[];
  buildExtraAyahUrls?: (surahNo: number, ayahNo: number) => string[];
  includeBesmele?: boolean;
  includeExtraBesmele?: boolean;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SurahAudioPrefetchProgress) => void;
}

export interface PrefetchSurahAudioResult {
  completed: number;
  total: number;
  failed: number;
  cachedCount: number;
}

type Listener = () => void;

const autoCacheListeners = new Set<Listener>();
const cacheStatsListeners = new Set<Listener>();
const inflightCacheWrites = new Map<string, Promise<boolean>>();

let cachedAutoCachePref: boolean | null = null;

function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function createAbortError(): Error {
  const err = new Error('Ses önbellekleme iptal edildi.');
  err.name = 'AbortError';
  return err;
}

export function isAudioCacheAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: string }).name === 'AbortError';
}

function emitAutoCachePrefChange(): void {
  for (const listener of autoCacheListeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

function emitCacheStatsChange(): void {
  for (const listener of cacheStatsListeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

/**
 * Dinledikçe ses önbelleğe alma tercihini okur (varsayılan: true).
 */
export function getAutoCacheAudioEnabled(): boolean {
  if (cachedAutoCachePref !== null) return cachedAutoCachePref;
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(AUTO_CACHE_AUDIO_KEY);
    if (raw === 'false' || raw === '0') {
      cachedAutoCachePref = false;
      return false;
    }
    cachedAutoCachePref = true;
    return true;
  } catch {
    return true;
  }
}

/**
 * Dinledikçe ses önbelleğe alma tercihini kaydeder ve aboneleri bilgilendirir.
 */
export function setAutoCacheAudioEnabled(enabled: boolean): void {
  const next = Boolean(enabled);
  cachedAutoCachePref = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AUTO_CACHE_AUDIO_KEY, next ? 'true' : 'false');
    } catch {
      // Depolama kısıtlıysa sessizce devam et
    }
  }
  emitAutoCachePrefChange();
}

export function subscribeAutoCacheAudio(listener: Listener): () => void {
  autoCacheListeners.add(listener);
  return () => {
    autoCacheListeners.delete(listener);
  };
}

export function subscribeAudioCacheChanges(listener: Listener): () => void {
  cacheStatsListeners.add(listener);
  return () => {
    cacheStatsListeners.delete(listener);
  };
}

/**
 * Verilen MP3 URL'sini CORS ile indirip `muallimun-audio-cache-v1` önbelleğine kaydeder.
 * Hata veya kota dolması (QuotaExceededError) durumunda uygulamayı bozmadan `false` döner.
 */
export async function cacheAudioFromUrl(
  url: string,
  signal?: AbortSignal,
  force = false,
): Promise<boolean> {
  if (!force && !getAutoCacheAudioEnabled()) return false;
  if (typeof window === 'undefined' || !('caches' in window)) return false;

  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed || !isValidHttpUrl(trimmed)) return false;
  if (signal?.aborted) return false;

  const inflight = inflightCacheWrites.get(trimmed);
  if (inflight) {
    return inflight;
  }

  const task = (async (): Promise<boolean> => {
    try {
      const cache = await window.caches.open(AUDIO_CACHE_NAME);
      const existing = await cache.match(trimmed);
      if (existing) {
        return true;
      }

      if (signal?.aborted) return false;

      const response = await fetch(trimmed, {
        signal,
        mode: 'cors',
      });
      if (!response.ok) return false;

      const contentType = response.headers.get('content-type') || 'audio/mpeg';
      if (/text\/html/i.test(contentType)) {
        return false;
      }

      const cloned = response.clone();
      const buffer = await cloned.arrayBuffer();
      if (buffer.byteLength <= MIN_VALID_AUDIO_BYTES) {
        return false;
      }

      if (signal?.aborted) return false;

      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Content-Length', String(buffer.byteLength));
      const responseToStore = new Response(buffer, {
        status: 200,
        statusText: 'OK',
        headers,
      });

      await cache.put(trimmed, responseToStore);
      emitCacheStatsChange();
      return true;
    } catch {
      // Ağ hatası, CORS kısıtı, AbortError veya QuotaExceededError durumunda sessizce false dön
      return false;
    } finally {
      inflightCacheWrites.delete(trimmed);
    }
  })();

  inflightCacheWrites.set(trimmed, task);
  return task;
}

/**
 * Verilen aday URL listesinden önbellekte bulunan ilk ses kaydı için bir Blob Object URL döndürür.
 * Çağıran taraf kullanım bitiminde `URL.revokeObjectURL` ile belleği serbest bırakmalıdır.
 */
export async function getCachedAudioObjectUrl(urls: string[]): Promise<string | null> {
  if (
    typeof window === 'undefined' ||
    !('caches' in window) ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    !Array.isArray(urls) ||
    urls.length === 0
  ) {
    return null;
  }

  try {
    const exists = await window.caches.has(AUDIO_CACHE_NAME);
    if (!exists) return null;

    const cache = await window.caches.open(AUDIO_CACHE_NAME);
    for (const candidate of urls) {
      const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
      if (!trimmed || !isValidHttpUrl(trimmed)) continue;
      const matched = await cache.match(trimmed);
      if (!matched) continue;
      const blob = await matched.blob();
      if (blob.size > MIN_VALID_AUDIO_BYTES) {
        return URL.createObjectURL(blob);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Ses önbelleğindeki kayıt sayısını ve toplam bayt boyutunu hesaplar.
 */
export async function getAudioCacheStats(): Promise<AudioCacheStats> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return { entryCount: 0, totalBytes: 0 };
  }

  try {
    const exists = await window.caches.has(AUDIO_CACHE_NAME);
    if (!exists) {
      return { entryCount: 0, totalBytes: 0 };
    }

    const cache = await window.caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    let totalBytes = 0;

    for (const req of keys) {
      try {
        const res = await cache.match(req);
        if (!res) continue;
        const headerLen = res.headers.get('content-length');
        const parsedLen = headerLen ? Number(headerLen) : Number.NaN;
        if (Number.isFinite(parsedLen) && parsedLen > 0) {
          totalBytes += parsedLen;
        } else {
          const blob = await res.blob();
          totalBytes += blob.size;
        }
      } catch {
        // Tekil bozuk giriş varsa toplam hesabı bozma
      }
    }

    return {
      entryCount: keys.length,
      totalBytes,
    };
  } catch {
    return { entryCount: 0, totalBytes: 0 };
  }
}

/**
 * `muallimun-audio-cache-v1` ses önbelleğini tamamen temizler.
 */
export async function clearAudioCache(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    await window.caches.delete(AUDIO_CACHE_NAME);
  } finally {
    emitCacheStatsChange();
  }
}

/**
 * Tek bir surenin tüm ayet seslerini sunucu dostu eşzamanlılıkla (varsayılan concurrency = 3)
 * ve iptal (AbortSignal) desteğiyle yerel ses önbelleğine indirir.
 */
export async function prefetchSurahAudio(
  options: PrefetchSurahAudioOptions,
): Promise<PrefetchSurahAudioResult> {
  const {
    surahNo,
    ayahCount,
    buildAyahUrls,
    buildExtraAyahUrls,
    includeBesmele = false,
    includeExtraBesmele = false,
    concurrency = 3,
    signal,
    onProgress,
  } = options;

  if (typeof window === 'undefined' || !('caches' in window)) {
    throw new Error('Tarayıcınız çevrimdışı ses önbelleğini (Cache API) desteklemiyor.');
  }

  const safeSurah = Math.max(1, Math.min(114, Math.trunc(surahNo)));
  const safeAyahCount = Math.max(1, Math.trunc(ayahCount));
  const poolSize = Math.max(1, Math.min(4, Math.trunc(concurrency)));

  const tasks: string[][] = [];

  if (includeBesmele && safeSurah !== 1 && safeSurah !== 9) {
    const besmeleUrls = buildAyahUrls(1, 1).filter(isValidHttpUrl);
    if (besmeleUrls.length > 0) {
      tasks.push(besmeleUrls);
    }
  }

  if (includeExtraBesmele && buildExtraAyahUrls && safeSurah !== 1 && safeSurah !== 9) {
    const extraBesmeleUrls = buildExtraAyahUrls(1, 1).filter(isValidHttpUrl);
    if (extraBesmeleUrls.length > 0) {
      tasks.push(extraBesmeleUrls);
    }
  }

  for (let ayah = 1; ayah <= safeAyahCount; ayah += 1) {
    const primaryUrls = buildAyahUrls(safeSurah, ayah).filter(isValidHttpUrl);
    if (primaryUrls.length > 0) {
      tasks.push(primaryUrls);
    }
    if (buildExtraAyahUrls) {
      const extraUrls = buildExtraAyahUrls(safeSurah, ayah).filter(isValidHttpUrl);
      if (extraUrls.length > 0) {
        tasks.push(extraUrls);
      }
    }
  }

  const total = tasks.length;
  if (total === 0) {
    return { completed: 0, total: 0, failed: 0, cachedCount: 0 };
  }

  let nextIdx = 0;
  let completed = 0;
  let failed = 0;
  let cachedCount = 0;

  const report = () => {
    const percent = Math.min(100, Math.round((completed / total) * 100));
    onProgress?.({ completed, total, percent, failed });
  };

  report();

  const worker = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) {
        throw createAbortError();
      }
      const idx = nextIdx;
      if (idx >= total) return;
      nextIdx += 1;

      const candidates = tasks[idx];
      let ok = false;
      for (const candidateUrl of candidates) {
        if (signal?.aborted) {
          throw createAbortError();
        }
        const stored = await cacheAudioFromUrl(candidateUrl, signal, true);
        if (stored) {
          ok = true;
          break;
        }
      }

      if (signal?.aborted) {
        throw createAbortError();
      }

      completed += 1;
      if (ok) {
        cachedCount += 1;
      } else {
        failed += 1;
      }
      report();
    }
  };

  const workers = Array.from({ length: Math.min(poolSize, total) }, () => worker());
  await Promise.all(workers);

  if (signal?.aborted) {
    throw createAbortError();
  }

  emitCacheStatsChange();

  return {
    completed,
    total,
    failed,
    cachedCount,
  };
}
