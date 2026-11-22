import { dataService } from './dataService';

export const OFFLINE_PACK_STATUS_KEY = 'muallimun_offline_pack_status_v1';

export type OfflinePackScope = 'pool' | 'full';

export interface OfflinePackStatus {
  scope: OfflinePackScope;
  surahCount: number;
  updatedAt: string;
  includesExtraMeals: boolean;
  includesTajweed: boolean;
}

export interface OfflinePackProgress {
  completedSurahs: number;
  totalSurahs: number;
  percent: number;
  phaseLabel: string;
  failedFilesCount: number;
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
    return {
      scope: parsed.scope,
      surahCount: Math.min(114, Math.max(1, Math.trunc(parsed.surahCount))),
      updatedAt: parsed.updatedAt,
      includesExtraMeals: Boolean(parsed.includesExtraMeals),
      includesTajweed: Boolean(parsed.includesTajweed),
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
 * bellek haritasına doldurmadan doğrudan Cache API'ye yazar.
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

  const persistentStorageGranted = await requestPersistentStorage();

  onProgress?.({
    completedSurahs: 0,
    totalSurahs: uniqueSurahs.length,
    percent: 2,
    phaseLabel: 'Çekirdek dizin, fihrist ve rehber dosyaları önbelleğe alınıyor...',
    failedFilesCount: 0,
  });

  // 1. Çekirdek meta & rehber dosyalarını ısıt
  const coreResults = await Promise.allSettled([
    dataService.getManifest(),
    dataService.getMeta(),
    dataService.getQuestionIndex(),
    dataService.getFihristTopics(),
    dataService.getMutashabihatData(),
    dataService.getRukusData(),
    dataService.getTajweedMeta(),
    dataService.getSegMeta(),
    dataService.getSurahInfoExtras(),
    dataService.getBazerganTimeline(),
  ]);

  if (signal?.aborted) {
    throw createAbortError();
  }

  let questionSurahSet = new Set<number>(availableQuestionSurahs ?? []);
  if (questionSurahSet.size === 0) {
    const qIndexResult = coreResults[2];
    if (qIndexResult.status === 'fulfilled' && Array.isArray(qIndexResult.value?.availableSurahs)) {
      questionSurahSet = new Set<number>(qIndexResult.value.availableSurahs);
    }
  }

  let completedSurahs = 0;
  let failedFilesCount = 0;

  onProgress?.({
    completedSurahs: 0,
    totalSurahs: uniqueSurahs.length,
    percent: 5,
    phaseLabel: `Sure metinleri ve mealler indiriliyor (0 / ${uniqueSurahs.length})...`,
    failedFilesCount: 0,
  });

  // 2. Sureleri 6'lı paketler hâlinde indir (RAM şişirmeden kalıcı Cache API'ye yazar)
  for (let start = 0; start < uniqueSurahs.length; start += SURAH_BATCH_SIZE) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const batch = uniqueSurahs.slice(start, start + SURAH_BATCH_SIZE);

    await Promise.all(
      batch.map(async (surahNo) => {
        if (signal?.aborted) return;

        const pad = padSurahNo(surahNo);
        const paths: string[] = [
          `ar/s${pad}.json`,
          `m1/s${pad}.json`,
          `m2/s${pad}.json`,
          `w/s${pad}.json`,
        ];

        if (includeExtraMeals) {
          paths.push(`mx/s${pad}.json`);
        }
        if (includeTajweed) {
          paths.push(`tj/s${pad}.json`);
        }
        if (questionSurahSet.has(surahNo)) {
          paths.push(`q/s${pad}.json`);
        }

        const results = await Promise.all(
          paths.map((relativePath) => dataService.prefetchJsonForOffline(relativePath, signal)),
        );

        if (signal?.aborted) return;

        for (const ok of results) {
          if (!ok) {
            failedFilesCount += 1;
          }
        }

        completedSurahs += 1;
        const ratio = completedSurahs / uniqueSurahs.length;
        const percent = Math.min(99, Math.max(5, Math.round(5 + ratio * 94)));

        onProgress?.({
          completedSurahs,
          totalSurahs: uniqueSurahs.length,
          percent,
          phaseLabel: `Sure metinleri önbelleğe alınıyor (${completedSurahs} / ${uniqueSurahs.length})...`,
          failedFilesCount,
        });
      }),
    );
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  const status: OfflinePackStatus = {
    scope,
    surahCount: uniqueSurahs.length,
    updatedAt: new Date().toISOString(),
    includesExtraMeals: includeExtraMeals,
    includesTajweed: includeTajweed,
  };

  saveOfflinePackStatus(status);

  onProgress?.({
    completedSurahs: uniqueSurahs.length,
    totalSurahs: uniqueSurahs.length,
    percent: 100,
    phaseLabel: `Tamamlandı (${uniqueSurahs.length} sure çevrimdışı hazır).`,
    failedFilesCount,
  });

  return {
    status,
    failedFilesCount,
    persistentStorageGranted,
  };
}
