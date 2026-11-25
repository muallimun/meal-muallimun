import { PERSISTENT_DATA_CACHE_NAME, dataService } from './dataService';

export const OFFLINE_PACK_STATUS_KEY = 'muallimun_offline_pack_status_v1';

export type OfflinePackScope = 'pool' | 'full';

export interface OfflinePackStatus {
  scope: OfflinePackScope;
  surahCount: number;
  updatedAt: string;
  includesExtraMeals: boolean;
  includesTajweed: boolean;
  dataVersion?: string;
}

export interface OfflinePackProgress {
  completedSurahs: number;
  totalSurahs: number;
  percent: number;
  phaseLabel: string;
  failedFilesCount: number;
  mandatoryFailedCount?: number;
}

export interface DownloadOfflinePackOptions {
  scope: OfflinePackScope;
  surahs: number[];
  includeExtraMeals: boolean;
  includeTajweed: boolean;
  availableQuestionSurahs?: number[];
  signal?: AbortSignal;
  onProgress?: (progress: OfflinePackProgress) => void;
}

export interface DownloadOfflinePackResult {
  status: OfflinePackStatus;
  failedFilesCount: number;
  mandatoryFailedCount: number;
  optionalFailedCount: number;
  persistentStorageGranted: boolean | null;
}

const SURAH_BATCH_SIZE = 6;

function padSurahNo(surahNo: number): string {
  return String(surahNo).padStart(3, '0');
}

function createAbortError(): Error {
  const err = new Error('Çevrimdışı indirme iptal edildi.');
  err.name = 'AbortError';
  return err;
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: string }).name === 'AbortError';
}

export function loadOfflinePackStatus(): OfflinePackStatus | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OFFLINE_PACK_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflinePackStatus>;
    if (
      (parsed.scope !== 'pool' && parsed.scope !== 'full') ||
      typeof parsed.surahCount !== 'number' ||
      !Number.isFinite(parsed.surahCount) ||
      parsed.surahCount <= 0 ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }
    const cleanVersion =
      typeof parsed.dataVersion === 'string' && parsed.dataVersion.trim()
        ? parsed.dataVersion.trim()
        : undefined;
    return {
      scope: parsed.scope,
      surahCount: Math.min(114, Math.max(1, Math.trunc(parsed.surahCount))),
      updatedAt: parsed.updatedAt,
      includesExtraMeals: Boolean(parsed.includesExtraMeals),
      includesTajweed: Boolean(parsed.includesTajweed),
      ...(cleanVersion ? { dataVersion: cleanVersion } : {}),
    };
  } catch {
    return null;
  }
}

export function saveOfflinePackStatus(status: OfflinePackStatus): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_PACK_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Depolama kısıtlıysa sessizce geç
  }
}

function clearOfflinePackStatusKey(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(OFFLINE_PACK_STATUS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Tarayıcı Cache API'sinde çevrimdışı metin önbelleğinin gerçekten var olduğunu doğrular.
 * İşletim sistemi (ör. iOS Safari 7 gün kuralı) önbelleği temizlediyse localStorage rozetini de sıfırlar.
 */
export async function verifyOfflinePackCache(): Promise<boolean> {
  const status = loadOfflinePackStatus();
  if (typeof window === 'undefined' || !('caches' in window)) {
    if (status) clearOfflinePackStatusKey();
    return false;
  }

  try {
    const cache = await window.caches.open(PERSISTENT_DATA_CACHE_NAME);
    const hasMeta = Boolean(await cache.match('/__offline_cache__/data/meta.json'));
    let hasArabic = Boolean(await cache.match('/__offline_cache__/data/ar/s001.json'));
    if (hasMeta && !hasArabic && status?.scope === 'pool') {
      const keys = await cache.keys();
      hasArabic = keys.some((req) => req.url.includes('/__offline_cache__/data/ar/s'));
    }
    if (hasMeta && hasArabic) {
      return true;
    }
  } catch {
    // Cache açılamadıysa önbellek doğrulanamadı kabul et
  }

  clearOfflinePackStatusKey();
  return false;
}

/**
 * Kalıcı çevrimdışı JSON önbelleğini ve durum kaydını tamamen temizler.
 */
export async function clearOfflinePack(): Promise<void> {
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      await window.caches.delete(PERSISTENT_DATA_CACHE_NAME);
    } catch {
      // ignore
    }
  }
  clearOfflinePackStatusKey();
}

async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      return await navigator.storage.persist();
    }
  } catch {
    // Bazı tarayıcı/iframe ortamlarında izin reddedilebilir
  }
  return null;
}

/**
 * Seçili çalışma havuzu veya 114 surenin tamamı için Kur'an metinlerini, mealleri,
 * kelime kırılımlarını, isteğe bağlı ek meal/tecvit ve soru dosyalarını tarayıcının
 * kalıcı çevrimdışı önbelleğine indirir. RAM şişmesini önlemek için sure JSON'larını
 * bellek haritasına doldurmadan doğrudan Cache API'ye yazar ve gerçek yazım sonucunu doğrular.
 */
export async function downloadOfflineTextPack(
  options: DownloadOfflinePackOptions,
): Promise<DownloadOfflinePackResult> {
  if (dataService.isDemoMode()) {
    throw new Error('Örnek veri modunda çevrimdışı paket indirilemez. Önce canlı veriye bağlanın.');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('İnternet bağlantısı olmadan yeni çevrimdışı paket indirilemez.');
  }

  if (typeof window === 'undefined' || !('caches' in window)) {
    throw new Error('Bu tarayıcı çevrimdışı kalıcı önbellek (Cache API) özelliğini desteklemiyor.');
  }

  const {
    scope,
    surahs,
    includeExtraMeals,
    includeTajweed,
    availableQuestionSurahs,
    signal,
    onProgress,
  } = options;

  const uniqueSurahs = Array.from(
    new Set(
      (scope === 'full' ? Array.from({ length: 114 }, (_, idx) => idx + 1) : surahs).filter(
        (s) => Number.isInteger(s) && s >= 1 && s <= 114,
      ),
    ),
  ).sort((a, b) => a - b);

  if (uniqueSurahs.length === 0) {
    throw new Error('İndirilecek geçerli sure bulunamadı.');
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const existingStatus = loadOfflinePackStatus();
  const persistentStorageGranted = await requestPersistentStorage();

  onProgress?.({
    completedSurahs: 0,
    totalSurahs: uniqueSurahs.length,
    percent: 2,
    phaseLabel: 'Çekirdek dizin, fihrist ve rehber dosyaları önbelleğe alınıyor...',
    failedFilesCount: 0,
    mandatoryFailedCount: 0,
  });

  // Güncel manifest dataVersion değerini kontrol et
  let manifestDataVersion: string | undefined;
  try {
    const manifest = await dataService.getManifest();
    if (manifest && typeof manifest.dataVersion === 'string' && manifest.dataVersion.trim()) {
      manifestDataVersion = manifest.dataVersion.trim();
    }
  } catch {
    // manifest ağdan alınamazsa aşağıda zorunlu prefetch sırasında yakalanır
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const forceRefresh = Boolean(
    existingStatus?.dataVersion &&
      manifestDataVersion &&
      existingStatus.dataVersion !== manifestDataVersion,
  );

  let mandatoryFailedCount = 0;
  let optionalFailedCount = 0;

  // 1. Zorunlu çekirdek dosyaları (manifest.json ve meta.json) doğrudan Cache API'ye yaz & doğrula
  const mandatoryCorePaths = ['manifest.json', 'meta.json'];
  const mandatoryCoreResults = await Promise.all(
    mandatoryCorePaths.map((relativePath) =>
      dataService.prefetchJsonForOffline(relativePath, signal, forceRefresh, manifestDataVersion),
    ),
  );
  for (const ok of mandatoryCoreResults) {
    if (!ok) mandatoryFailedCount += 1;
  }

  // 2. İsteğe bağlı rehber ve dizin dosyalarını önbelleğe al
  const optionalCorePaths = [
    'q/index.json',
    'fihrist/topics.json',
    'fihrist/mutashabihat.json',
    'fihrist/rukus.json',
    'tj/meta.json',
    'seg/meta.json',
    'fihrist/surah_info.json',
    'fihrist/bazergan_timeline.json',
  ];
  const optionalCoreResults = await Promise.all(
    optionalCorePaths.map((relativePath) =>
      dataService.prefetchJsonForOffline(relativePath, signal, forceRefresh, manifestDataVersion),
    ),
  );
  for (const ok of optionalCoreResults) {
    if (!ok) optionalFailedCount += 1;
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  let questionSurahSet = new Set<number>(availableQuestionSurahs ?? []);
  if (questionSurahSet.size === 0) {
    try {
      const qIndex = await dataService.getQuestionIndex();
      if (Array.isArray(qIndex?.availableSurahs)) {
        questionSurahSet = new Set<number>(qIndex.availableSurahs);
      }
    } catch {
      // Soru dizini isteğe bağlıdır
    }
  }

  let completedSurahs = 0;

  onProgress?.({
    completedSurahs: 0,
    totalSurahs: uniqueSurahs.length,
    percent: 5,
    phaseLabel: `Sure metinleri ve mealler indiriliyor (0 / ${uniqueSurahs.length})...`,
    failedFilesCount: mandatoryFailedCount + optionalFailedCount,
    mandatoryFailedCount,
  });

  // 3. Sureleri 6'lı paketler hâlinde indir (zorunlu: ar, m1, m2; isteğe bağlı: w, mx, tj, q)
  for (let start = 0; start < uniqueSurahs.length; start += SURAH_BATCH_SIZE) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const batch = uniqueSurahs.slice(start, start + SURAH_BATCH_SIZE);

    await Promise.all(
      batch.map(async (surahNo) => {
        if (signal?.aborted) return;

        const pad = padSurahNo(surahNo);
        const mandatoryPaths: string[] = [
          `ar/s${pad}.json`,
          `m1/s${pad}.json`,
          `m2/s${pad}.json`,
        ];
        const optionalPaths: string[] = [`w/s${pad}.json`];

        if (includeExtraMeals) {
          optionalPaths.push(`mx/s${pad}.json`);
        }
        if (includeTajweed) {
          optionalPaths.push(`tj/s${pad}.json`);
        }
        if (questionSurahSet.has(surahNo)) {
          optionalPaths.push(`q/s${pad}.json`);
        }

        const [mandatoryResults, optionalResults] = await Promise.all([
          Promise.all(
            mandatoryPaths.map((relativePath) =>
              dataService.prefetchJsonForOffline(
                relativePath,
                signal,
                forceRefresh,
                manifestDataVersion,
              ),
            ),
          ),
          Promise.all(
            optionalPaths.map((relativePath) =>
              dataService.prefetchJsonForOffline(
                relativePath,
                signal,
                forceRefresh,
                manifestDataVersion,
              ),
            ),
          ),
        ]);

        if (signal?.aborted) return;

        for (const ok of mandatoryResults) {
          if (!ok) mandatoryFailedCount += 1;
        }
        for (const ok of optionalResults) {
          if (!ok) optionalFailedCount += 1;
        }

        completedSurahs += 1;
        const ratio = completedSurahs / uniqueSurahs.length;
        const percent = Math.min(99, Math.max(5, Math.round(5 + ratio * 94)));

        onProgress?.({
          completedSurahs,
          totalSurahs: uniqueSurahs.length,
          percent,
          phaseLabel: `Sure metinleri önbelleğe alınıyor (${completedSurahs} / ${uniqueSurahs.length})...`,
          failedFilesCount: mandatoryFailedCount + optionalFailedCount,
          mandatoryFailedCount,
        });
      }),
    );
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  if (mandatoryFailedCount > 0) {
    throw new Error(
      `Zorunlu Kur'an ve meal dosyalarından ${mandatoryFailedCount} tanesi cihaza kaydedilemedi (depolama kotası veya ağ hatası). Lütfen depolama alanınızı kontrol edip tekrar deneyin.`,
    );
  }

  const status: OfflinePackStatus = {
    scope,
    surahCount: uniqueSurahs.length,
    updatedAt: new Date().toISOString(),
    includesExtraMeals: includeExtraMeals,
    includesTajweed: includeTajweed,
    ...(manifestDataVersion ? { dataVersion: manifestDataVersion } : {}),
  };

  saveOfflinePackStatus(status);

  const failedFilesCount = mandatoryFailedCount + optionalFailedCount;

  onProgress?.({
    completedSurahs: uniqueSurahs.length,
    totalSurahs: uniqueSurahs.length,
    percent: 100,
    phaseLabel: `Tamamlandı (${uniqueSurahs.length} sure çevrimdışı hazır).`,
    failedFilesCount,
    mandatoryFailedCount,
  });

  return {
    status,
    failedFilesCount,
    mandatoryFailedCount,
    optionalFailedCount,
    persistentStorageGranted,
  };
}
