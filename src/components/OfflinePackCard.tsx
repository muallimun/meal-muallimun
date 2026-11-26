import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Headphones,
  Info,
  Loader2,
  RefreshCw,
  Square,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { getDynamicMealAudioSources } from '../config/assetsConfig';
import { isExtraMealId } from '../config/mealsConfig';
import {
  buildReciterAudioUrls,
  buildTemplateAudioUrl,
  findReciterById,
  resolveSyncedReciterKey,
} from '../config/recitersConfig';
import {
  clearAudioCache,
  getAudioCacheInventory,
  getAudioCacheStats,
  getAutoCacheAudioEnabled,
  isAudioCacheAbortError,
  prefetchSurahAudio,
  setAutoCacheAudioEnabled,
  subscribeAudioCacheChanges,
  subscribeAutoCacheAudio,
  type AudioCacheInventory,
  type AudioCacheStats,
  type SurahAudioPrefetchProgress,
} from '../services/audioCacheService';
import { audioQueueService } from '../services/audioQueueService';
import {
  clearOfflinePack,
  downloadOfflineTextPack,
  isAbortError,
  loadOfflinePackStatus,
  verifyOfflinePackCache,
  type OfflinePackProgress,
  type OfflinePackScope,
  type OfflinePackStatus,
} from '../services/offlinePackService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { formatNumberTr } from '../utils/poolUtils';

interface OfflinePackCardProps {
  compact?: boolean;
}

function formatDateTr(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dt);
  } catch {
    return '';
  }
}

function formatBytesTr(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${formatNumberTr(Math.max(1, Math.round(bytes / 1024)))} KB`;
  }
  const mb = bytes / (1024 * 1024);
  try {
    return `${new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(mb)} MB`;
  } catch {
    return `${mb.toFixed(1).replace('.', ',')} MB`;
  }
}

export const OfflinePackCard: React.FC<OfflinePackCardProps> = ({ compact = false }) => {
  const {
    manifest,
    meta,
    poolStats,
    settings,
    audioPrefs,
    studyProgress,
    questionIndex,
    isOnline,
    dataSourceMode,
  } = useAppStore();

  const [status, setStatus] = useState<OfflinePackStatus | null>(() => loadOfflinePackStatus());
  const [isDownloading, setIsDownloading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [activeScope, setActiveScope] = useState<OfflinePackScope | null>(null);
  const [progress, setProgress] = useState<OfflinePackProgress | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Ses önbelleği & tek sure ön-indirme durumları
  const autoCacheAudioEnabled = useSyncExternalStore(
    subscribeAutoCacheAudio,
    getAutoCacheAudioEnabled,
  );
  const [audioStats, setAudioStats] = useState<AudioCacheStats>({ entryCount: 0, totalBytes: 0 });
  const [audioInventory, setAudioInventory] = useState<AudioCacheInventory>(() =>
    getAudioCacheInventory(),
  );
  const [isAudioInventoryOpen, setIsAudioInventoryOpen] = useState(false);
  const [isLoadingAudioStats, setIsLoadingAudioStats] = useState(true);
  const [selectedSurahNo, setSelectedSurahNo] = useState<number>(() => {
    const activeLastSurah =
      studyProgress.lastRead?.surah ?? audioQueueService.getSnapshot().currentSurah ?? 1;
    return activeLastSurah >= 1 && activeLastSurah <= 114 ? activeLastSurah : 1;
  });
  const [includeMealAudioInPrefetch, setIncludeMealAudioInPrefetch] = useState<boolean>(
    () => audioPrefs.mode !== 'ar',
  );
  const [isPrefetchingAudio, setIsPrefetchingAudio] = useState(false);
  const [isClearingAudio, setIsClearingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState<SurahAudioPrefetchProgress | null>(null);
  const [audioFeedback, setAudioFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  const audioAbortRef = useRef<AbortController | null>(null);
  const isPrefetchingAudioRef = useRef(false);
  const statsRefreshTimerRef = useRef<number | null>(null);

  const refreshAudioStats = useCallback(async () => {
    const nextStats = await getAudioCacheStats();
    setAudioStats(nextStats);
    const nextInventory = getAudioCacheInventory();
    setAudioInventory(nextInventory);
    if (nextStats.entryCount === 0) {
      setIsAudioInventoryOpen(false);
    }
    setIsLoadingAudioStats(false);
  }, []);

  useEffect(() => {
    let active = true;
    void verifyOfflinePackCache().then((isValid) => {
      if (active && !isValid) {
        setStatus((prev) => (prev !== null ? null : prev));
      }
    });
    void getAudioCacheStats().then((nextStats) => {
      if (active) {
        setAudioStats(nextStats);
        setAudioInventory(getAudioCacheInventory());
        if (nextStats.entryCount === 0) {
          setIsAudioInventoryOpen(false);
        }
        setIsLoadingAudioStats(false);
      }
    });
    const unsubscribeAudioCache = subscribeAudioCacheChanges(() => {
      if (!active || isPrefetchingAudioRef.current) return;
      if (statsRefreshTimerRef.current !== null) {
        window.clearTimeout(statsRefreshTimerRef.current);
      }
      statsRefreshTimerRef.current = window.setTimeout(() => {
        statsRefreshTimerRef.current = null;
        if (active) {
          void refreshAudioStats();
        }
      }, 400);
    });

    return () => {
      active = false;
      unsubscribeAudioCache();
      if (statsRefreshTimerRef.current !== null) {
        window.clearTimeout(statsRefreshTimerRef.current);
        statsRefreshTimerRef.current = null;
      }
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      audioAbortRef.current?.abort();
      audioAbortRef.current = null;
    };
  }, [refreshAudioStats]);

  const includeExtraMeals = useMemo(() => {
    return (
      isExtraMealId(settings.primaryMealId) ||
      settings.compareMealIds.some((mealId) => isExtraMealId(mealId))
    );
  }, [settings.primaryMealId, settings.compareMealIds]);

  const includeTajweed = settings.tajweedEnabled;
  const poolSurahs = poolStats.effectiveSurahs;
  const poolCount = poolSurahs.length;

  const handleStartDownload = useCallback(
    async (scope: OfflinePackScope) => {
      if (isDownloading) return;
      sfxService.play('click');
      setFeedback(null);

      if (dataSourceMode === 'demo') {
        setFeedback({
          type: 'error',
          text: 'Örnek veri modunda çevrimdışı paket indirilemez. Önce canlı veriye bağlanın.',
        });
        return;
      }

      if (!isOnline) {
        setFeedback({
          type: 'error',
          text: 'İnternet bağlantısı algılanmadı. Paket indirmek için çevrimiçi olmanız gerekir.',
        });
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsDownloading(true);
      setActiveScope(scope);
      setProgress({
        completedSurahs: 0,
        totalSurahs: scope === 'full' ? 114 : poolCount,
        percent: 2,
        phaseLabel: 'Çevrimdışı önbellek hazırlanıyor...',
        failedFilesCount: 0,
      });

      try {
        const result = await downloadOfflineTextPack({
          scope,
          surahs: poolSurahs,
          includeExtraMeals,
          includeTajweed,
          availableQuestionSurahs: questionIndex?.availableSurahs,
          signal: controller.signal,
          onProgress: (nextProgress) => {
            setProgress(nextProgress);
          },
        });

        setStatus(result.status);
        sfxService.play('success');
        setFeedback({
          type: 'success',
          text:
            result.optionalFailedCount > 0
              ? `${formatNumberTr(result.status.surahCount)} sure önbelleğe alındı (${result.optionalFailedCount} isteğe bağlı parça atlandı).`
              : `${formatNumberTr(result.status.surahCount)} sure metinleri, mealler ve rehberler çevrimdışı kullanım için kaydedildi.`,
        });
      } catch (err) {
        if (isAbortError(err)) {
          setFeedback({
            type: 'info',
            text: 'İndirme durduruldu. Şimdiye kadar indirilen sureler tarayıcı önbelleğinde saklandı.',
          });
        } else {
          setFeedback({
            type: 'error',
            text:
              err instanceof Error
                ? err.message
                : 'Çevrimdışı paket indirilirken bir hata oluştu.',
          });
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsDownloading(false);
        setActiveScope(null);
      }
    },
    [
      isDownloading,
      dataSourceMode,
      isOnline,
      poolCount,
      poolSurahs,
      includeExtraMeals,
      includeTajweed,
      questionIndex?.availableSurahs,
    ],
  );

  const handleCancel = useCallback(() => {
    sfxService.play('click');
    abortControllerRef.current?.abort();
  }, []);

  const handleClearCache = useCallback(async () => {
    if (isDownloading || isClearing) return;
    sfxService.play('click');
    setIsClearing(true);
    setFeedback(null);
    try {
      await clearOfflinePack();
      setStatus(null);
      setFeedback({
        type: 'info',
        text: 'Çevrimdışı metin önbelleği cihazınızdan temizlendi.',
      });
    } catch {
      setFeedback({
        type: 'error',
        text: 'Çevrimdışı önbellek temizlenirken bir sorun oluştu.',
      });
    } finally {
      setIsClearing(false);
    }
  }, [isDownloading, isClearing]);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId || audioPrefs.arabicAudioSource, manifest),
    [audioPrefs.arabicReciterId, audioPrefs.arabicAudioSource, manifest],
  );

  const activeMealAudio = useMemo(() => {
    const sources = getDynamicMealAudioSources(manifest);
    if (sources.length === 0) return null;
    if (audioPrefs.mealAudioSource) {
      const exact = sources.find((s) => s.id === audioPrefs.mealAudioSource);
      if (exact) return exact;
    }
    return sources[0] ?? null;
  }, [audioPrefs.mealAudioSource, manifest]);

  const selectedSurahMeta = useMemo(() => {
    const found = meta?.surahs.find((s) => s.no === selectedSurahNo);
    if (found) return found;
    return {
      no: selectedSurahNo,
      nameTr: `${selectedSurahNo}. Sure`,
      ayahCount: 7,
    };
  }, [meta?.surahs, selectedSurahNo]);

  const surahNameByNo = useMemo(() => {
    const map = new Map<number, string>();
    if (meta?.surahs) {
      for (const s of meta.surahs) {
        map.set(s.no, s.nameTr);
      }
    }
    return map;
  }, [meta?.surahs]);

  const cachedSurahsForActiveReciter = useMemo(() => {
    const entry = audioInventory.sources[activeReciter.id];
    return new Set<number>(entry?.surahs ?? []);
  }, [audioInventory.sources, activeReciter.id]);

  const audioInventorySummary = useMemo(() => {
    const entries = Object.values(audioInventory.sources).filter((e) => e.surahs.length > 0);
    const arEntries = entries.filter((e) => e.kind === 'ar');
    const mealEntries = entries.filter((e) => e.kind === 'meal');
    const uniqueSurahs = new Set<number>();
    for (const entry of entries) {
      for (const sNo of entry.surahs) {
        uniqueSurahs.add(sNo);
      }
    }
    return {
      entries,
      arEntries,
      mealEntries,
      uniqueSurahCount: uniqueSurahs.size,
      sourceCount: entries.length,
    };
  }, [audioInventory.sources]);

  const handleToggleAutoCacheAudio = useCallback(() => {
    sfxService.play('click');
    setAutoCacheAudioEnabled(!autoCacheAudioEnabled);
  }, [autoCacheAudioEnabled]);

  const handlePrefetchSurahAudio = useCallback(async () => {
    if (isPrefetchingAudio || isClearingAudio) return;
    sfxService.play('click');
    setAudioFeedback(null);

    if (!isOnline) {
      setAudioFeedback({
        type: 'error',
        text: 'İnternet bağlantısı algılanmadı. Sure sesi indirmek için çevrimiçi olmanız gerekir.',
      });
      return;
    }

    const willIncludeMeal = Boolean(includeMealAudioInPrefetch && activeMealAudio);
    const willIncludeArabic = audioPrefs.mode !== 'meal' || !willIncludeMeal;

    const controller = new AbortController();
    audioAbortRef.current = controller;
    isPrefetchingAudioRef.current = true;
    setIsPrefetchingAudio(true);

    const segMeta = settings.wordSyncEnabled
      ? await audioQueueService.ensureSegMetaLoaded()
      : null;
    const syncedReciterKey =
      settings.wordSyncEnabled && segMeta ? resolveSyncedReciterKey(activeReciter, segMeta) : null;
    const syncedTemplate =
      syncedReciterKey && segMeta?.reciters[syncedReciterKey]?.audioUrlTemplate
        ? segMeta.reciters[syncedReciterKey].audioUrlTemplate
        : null;

    const buildArabicAyahUrls = (sNo: number, aNo: number): string[] => {
      const base = buildReciterAudioUrls(activeReciter, sNo, aNo);
      if (syncedTemplate) {
        const syncedUrl = buildTemplateAudioUrl(syncedTemplate, sNo, aNo);
        return [syncedUrl, ...base.filter((u) => u !== syncedUrl)];
      }
      return base;
    };

    const buildMealAyahUrls = (sNo: number, aNo: number): string[] => {
      if (!activeMealAudio) return [];
      return buildReciterAudioUrls(activeMealAudio, sNo, aNo);
    };

    const primaryBuilder = willIncludeArabic ? buildArabicAyahUrls : buildMealAyahUrls;
    const extraBuilder = willIncludeArabic && willIncludeMeal ? buildMealAyahUrls : undefined;

    setAudioProgress({
      completed: 0,
      total: selectedSurahMeta.ayahCount * (extraBuilder ? 2 : 1),
      percent: 0,
      failed: 0,
    });

    try {
      const result = await prefetchSurahAudio({
        surahNo: selectedSurahMeta.no,
        ayahCount: selectedSurahMeta.ayahCount,
        buildAyahUrls: primaryBuilder,
        buildExtraAyahUrls: extraBuilder,
        includeBesmele: true,
        includeExtraBesmele: Boolean(extraBuilder),
        concurrency: 3,
        signal: controller.signal,
        recordInventory: {
          surahName: selectedSurahMeta.nameTr,
          reciterId: activeReciter.id,
          reciterLabel: activeReciter.shortLabel,
          includeReciter: willIncludeArabic,
          ...(willIncludeMeal && activeMealAudio
            ? { mealId: activeMealAudio.id, mealLabel: activeMealAudio.shortLabel }
            : {}),
        },
        onProgress: (next) => {
          setAudioProgress(next);
        },
      });

      await refreshAudioStats();
      sfxService.play('success');

      if (result.cachedCount === 0 && result.failed > 0) {
        setAudioFeedback({
          type: 'error',
          text: 'Ses dosyaları önbelleğe kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.',
        });
      } else if (result.failed > 0) {
        setAudioFeedback({
          type: 'info',
          text: `${selectedSurahMeta.no}. ${selectedSurahMeta.nameTr} Suresi için ${formatNumberTr(result.cachedCount)} ses kaydı önbelleğe alındı (${formatNumberTr(result.failed)} kayıt atlandı).`,
        });
      } else {
        setAudioFeedback({
          type: 'success',
          text: `${selectedSurahMeta.no}. ${selectedSurahMeta.nameTr} Suresi sesleri önbelleğe alındı.`,
        });
      }
    } catch (err) {
      await refreshAudioStats();
      if (isAudioCacheAbortError(err)) {
        setAudioFeedback({
          type: 'info',
          text: 'Sure ses indirmesi durduruldu. Şimdiye kadar indirilen kayıtlar cihazda saklandı.',
        });
      } else {
        setAudioFeedback({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Sure sesleri indirilirken beklenmeyen bir sorun oluştu.',
        });
      }
    } finally {
      if (audioAbortRef.current === controller) {
        audioAbortRef.current = null;
      }
      isPrefetchingAudioRef.current = false;
      setIsPrefetchingAudio(false);
    }
  }, [
    isPrefetchingAudio,
    isClearingAudio,
    isOnline,
    includeMealAudioInPrefetch,
    activeMealAudio,
    audioPrefs.mode,
    settings.wordSyncEnabled,
    activeReciter,
    selectedSurahMeta.no,
    selectedSurahMeta.ayahCount,
    selectedSurahMeta.nameTr,
    refreshAudioStats,
  ]);

  const handleCancelAudioPrefetch = useCallback(() => {
    sfxService.play('click');
    audioAbortRef.current?.abort();
  }, []);

  const handleClearAudioCache = useCallback(async () => {
    if (isPrefetchingAudio || isClearingAudio) return;
    sfxService.play('click');
    setIsClearingAudio(true);
    setAudioFeedback(null);
    try {
      await clearAudioCache();
      setAudioInventory({ sources: {}, lastPrefetched: null });
      setIsAudioInventoryOpen(false);
      await refreshAudioStats();
      setAudioFeedback({
        type: 'info',
        text: 'Ses önbelleği cihazınızdan temizlendi.',
      });
    } catch {
      setAudioFeedback({
        type: 'error',
        text: 'Ses önbelleği temizlenirken bir sorun oluştu.',
      });
    } finally {
      setIsClearingAudio(false);
    }
  }, [isPrefetchingAudio, isClearingAudio, refreshAudioStats]);

  const hasDataUpdate = Boolean(
    status &&
      manifest?.dataVersion &&
      status.dataVersion &&
      status.dataVersion !== manifest.dataVersion,
  );
  const updatedDateLabel = status ? formatDateTr(status.updatedAt) : '';

  return (
    <div className="space-y-3 min-w-0">
    <div
      className={`rounded-2xl border ${compact ? 'p-3.5' : 'p-4'} space-y-3`}
      style={{
        backgroundColor: 'var(--bg-surface-soft)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Üst Başlık & Durum Rozeti */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <CloudDownload className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-extrabold leading-snug">
              Tek Tıkla Çevrimdışı Metin Paketi
            </h4>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Arapça hat, TDV &amp; Diyanet mealleri, kelime kelime anlam, fihrist ve sınav soruları
              cihazınızın kalıcı önbelleğine kaydedilir.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {hasDataUpdate && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold shrink-0"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
                border: '1px solid rgba(217, 119, 6, 0.35)',
              }}
            >
              <RefreshCw className="w-3 h-3 shrink-0" />
              <span>Yeni Veri Güncellemesi Mevcut</span>
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold shrink-0"
            style={{
              backgroundColor: status ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
              color: status ? 'var(--brand-primary-text)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {status ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Hazır: {formatNumberTr(status.surahCount)} Sure Çevrimdışı Önbellekte
                  {updatedDateLabel ? ` · ${updatedDateLabel}` : ''}
                </span>
              </>
            ) : (
              <span>Henüz tam paket indirilmedi</span>
            )}
          </span>
        </div>
      </div>

      {/* İndirme Kapsam Etiketleri */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span
          className="px-2 py-0.5 rounded-md border font-semibold"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          Arapça + Kelime + TDV/DİB
        </span>
        {includeTajweed && (
          <span
            className="px-2 py-0.5 rounded-md border font-semibold"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            Renkli Tecvit Dahil
          </span>
        )}
        {includeExtraMeals && (
          <span
            className="px-2 py-0.5 rounded-md border font-semibold"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            27 Meal/Tefsir Paketi Dahil
          </span>
        )}
      </div>

      {/* Canlı İlerleme Çubuğu */}
      {isDownloading && progress && (
        <div
          className="p-3 rounded-xl border space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--brand-primary)',
          }}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold flex items-center gap-1.5 min-w-0 truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              <span className="truncate">{progress.phaseLabel}</span>
            </span>
            <span className="font-extrabold tabular-nums shrink-0" style={{ color: 'var(--brand-primary-text)' }}>
              %{progress.percent}
            </span>
          </div>

          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${progress.percent}%`,
                backgroundColor: 'var(--brand-primary)',
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="tabular-nums font-semibold">
              {formatNumberTr(progress.completedSurahs)} / {formatNumberTr(progress.totalSurahs)} Sure
              {activeScope === 'full' ? ' (Tüm Kur’an)' : ' (Aktif Havuz)'}
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[32px] px-2.5 rounded-lg border font-bold inline-flex items-center gap-1 cursor-pointer hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Square className="w-3 h-3 fill-current shrink-0" />
              <span>İptal Et</span>
            </button>
          </div>
        </div>
      )}

      {/* Aksiyon Butonları */}
      {!isDownloading && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!isOnline || dataSourceMode === 'demo' || isClearing}
              onClick={() => void handleStartDownload('pool')}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Havuzumu Çevrimdışı İndir ({formatNumberTr(poolCount)} Sure)
              </span>
            </button>

            <button
              type="button"
              disabled={!isOnline || dataSourceMode === 'demo' || isClearing}
              onClick={() => void handleStartDownload('full')}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 transition-opacity cursor-pointer hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              <span className="truncate">Tüm Kur&apos;an Metinlerini İndir (114 Sure)</span>
            </button>
          </div>

          {status && (
            <button
              type="button"
              disabled={isClearing}
              onClick={() => void handleClearCache()}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-wait touch-manipulation"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--state-danger-text)',
              }}
            >
              {isClearing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isClearing ? 'Önbellek Temizleniyor...' : 'Çevrimdışı Önbelleği Temizle'}</span>
            </button>
          )}
        </div>
      )}

      {/* Çevrimdışı İken Bilgi */}
      {!isOnline && (
        <p
          className="text-[11px] font-semibold flex items-center gap-1.5"
          style={{ color: 'var(--brand-accent-text)' }}
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Şu an çevrimdışısınız. Önceden önbelleğe alınan sureler kesintisiz açılır.</span>
        </p>
      )}

      {/* Geri Bildirim Mesajı */}
      {feedback && (
        <p
          role="status"
          className="text-xs font-bold px-3 py-2 rounded-xl border"
          style={{
            backgroundColor:
              feedback.type === 'success'
                ? 'var(--brand-primary-soft)'
                : feedback.type === 'error'
                  ? 'var(--state-danger-bg)'
                  : 'var(--bg-surface)',
            borderColor:
              feedback.type === 'success'
                ? 'var(--brand-primary)'
                : feedback.type === 'error'
                  ? 'rgba(239, 68, 68, 0.35)'
                  : 'var(--border-subtle)',
            color:
              feedback.type === 'success'
                ? 'var(--brand-primary-text)'
                : feedback.type === 'error'
                  ? 'var(--state-danger-text)'
                  : 'var(--text-secondary)',
          }}
        >
          {feedback.text}
        </p>
      )}

      {/* Çevrimdışı Paket Kapsamı Bilgilendirmesi */}
      <div
        className="rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed flex items-start gap-2"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
        <Info
          className="w-3.5 h-3.5 shrink-0 mt-0.5"
          style={{ color: 'var(--brand-primary-text)' }}
        />
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Bilgi:</strong> Çevrimdışı paket; Mushaf
          sayfalarını, seçili mealleri, fihristi ve sınav metinlerini internetsiz kullanım için
          cihazınıza kaydeder. Cihaz hafızasını aşırı doldurmamak amacıyla 28 okuyucuya ait sesli
          tilavet kayıtları çevrimiçi (internet üzerinden) dinlenir.
        </p>
      </div>
    </div>

    {/* Dinledikçe Ses Önbelleği & İsteğe Bağlı Tek Sure Ön-İndirme Kartı */}
    <div
      className={`rounded-2xl border ${compact ? 'p-3.5' : 'p-4'} space-y-3 min-w-0 overflow-hidden`}
      style={{
        backgroundColor: 'var(--bg-surface-soft)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Üst Başlık */}
      <div className="flex items-start gap-2.5 min-w-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            color: 'var(--brand-primary-text)',
          }}
        >
          <Headphones className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-extrabold leading-snug">
            Dinledikçe Ses Önbelleği &amp; Sure Ön-İndirme
          </h4>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Dinlediğiniz ayet sesleri otomatik olarak cihazınızda saklanır; internet yokken tekrar
            dinlenebilir.
          </p>
        </div>
      </div>

      {/* Önbellek İstatistiği & "Dinledikçe sakla" Anahtarı */}
      <div
        className="rounded-xl border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 min-w-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold tabular-nums max-w-full"
            style={{
              backgroundColor:
                audioStats.entryCount > 0 ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
              color:
                audioStats.entryCount > 0 ? 'var(--brand-primary-text)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {isLoadingAudioStats ? (
              <span>Hesaplanıyor…</span>
            ) : audioStats.entryCount > 0 ? (
              <span className="truncate">
                {formatNumberTr(audioStats.entryCount)} ayet · {formatBytesTr(audioStats.totalBytes)}
              </span>
            ) : (
              <span>Henüz kayıtlı ses yok</span>
            )}
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={autoCacheAudioEnabled}
          onClick={handleToggleAutoCacheAudio}
          className="min-h-[36px] inline-flex items-center gap-2 cursor-pointer shrink-0 touch-manipulation"
        >
          <span className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
            Dinledikçe sakla
          </span>
          <span
            aria-hidden="true"
            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
            style={{
              backgroundColor: autoCacheAudioEnabled
                ? 'var(--brand-primary)'
                : 'var(--border-strong)',
            }}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                autoCacheAudioEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      {/* Tek Satırlık Açılır İndirilen Sureler Özeti (Varsayılan Kapalı) */}
      {audioInventorySummary.uniqueSurahCount > 0 && (
        <div
          className="rounded-xl border overflow-hidden min-w-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            aria-expanded={isAudioInventoryOpen}
            onClick={() => {
              sfxService.play('click');
              setIsAudioInventoryOpen((prev) => !prev);
            }}
            className="w-full min-h-[40px] px-3 py-2 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors hover:opacity-95 min-w-0 touch-manipulation"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                <span
                  className="text-xs font-extrabold truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  İndirilen Sureler ({formatNumberTr(audioInventorySummary.uniqueSurahCount)} Sure ·{' '}
                  {formatNumberTr(audioInventorySummary.sourceCount)} Kaynak)
                </span>
                {audioInventory.lastPrefetched && (
                  <span
                    className="text-[10.5px] font-semibold truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Son: {audioInventory.lastPrefetched.surahNo}.{' '}
                    {audioInventory.lastPrefetched.surahName}
                  </span>
                )}
              </div>
            </div>
            <span
              className="shrink-0 inline-flex items-center justify-center"
              style={{ color: 'var(--text-muted)' }}
              aria-hidden="true"
            >
              {isAudioInventoryOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {isAudioInventoryOpen && (
            <div
              className="max-h-52 overflow-y-auto scrollbar-thin px-3 pb-3 pt-2.5 border-t space-y-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {[
                {
                  groupKey: 'ar',
                  groupTitle: 'Tilavet Okuyucuları',
                  items: audioInventorySummary.arEntries,
                },
                {
                  groupKey: 'meal',
                  groupTitle: 'Sesli Mealler',
                  items: audioInventorySummary.mealEntries,
                },
              ]
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <div key={group.groupKey} className="space-y-2 min-w-0">
                    <p
                      className="text-[10px] font-extrabold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {group.groupTitle}
                    </p>
                    <div className="space-y-2">
                      {group.items.map((entry) => {
                        const isFullHatim = entry.surahs.length >= 114;
                        return (
                          <div key={`${entry.kind}:${entry.sourceId}`} className="space-y-1.5 min-w-0">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span
                                className="text-[11.5px] font-extrabold truncate"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {entry.label}
                              </span>
                              <span
                                className="text-[10.5px] font-bold tabular-nums shrink-0"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {formatNumberTr(entry.surahs.length)}/114
                              </span>
                            </div>

                            {isFullHatim ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold"
                                style={{
                                  backgroundColor: 'var(--brand-primary-soft)',
                                  color: 'var(--brand-primary-text)',
                                  border: '1px solid var(--brand-primary)',
                                }}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Tam Hatim (114/114 Sure)</span>
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1 min-w-0">
                                {entry.surahs.map((sNo) => {
                                  const sName = surahNameByNo.get(sNo);
                                  return (
                                    <span
                                      key={sNo}
                                      className="px-2 py-0.5 rounded-md border text-[10.5px] font-semibold max-w-full truncate"
                                      style={{
                                        backgroundColor: 'var(--bg-surface-soft)',
                                        borderColor: 'var(--border-subtle)',
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      {sName ? `${sNo}. ${sName}` : `${sNo}. Sure`}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Aktif Okuyucu & Meal Kaynağı Etiketleri */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] min-w-0">
        <span
          className="px-2 py-0.5 rounded-md border font-semibold max-w-full truncate"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          Okuyucu: {activeReciter.shortLabel}
        </span>
        {activeMealAudio && (
          <button
            type="button"
            disabled={isPrefetchingAudio}
            aria-pressed={includeMealAudioInPrefetch}
            onClick={() => {
              sfxService.play('click');
              setIncludeMealAudioInPrefetch((prev) => !prev);
            }}
            className="px-2 py-0.5 rounded-md border font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 max-w-full"
            style={{
              backgroundColor: includeMealAudioInPrefetch
                ? 'var(--brand-primary-soft)'
                : 'var(--bg-surface)',
              borderColor: includeMealAudioInPrefetch
                ? 'var(--brand-primary)'
                : 'var(--border-subtle)',
              color: includeMealAudioInPrefetch
                ? 'var(--brand-primary-text)'
                : 'var(--text-muted)',
            }}
          >
            <span className="truncate">
              {includeMealAudioInPrefetch ? '✓ ' : '+ '}
              {activeMealAudio.shortLabel}
            </span>
          </button>
        )}
      </div>

      {/* Sure Ön-İndirme İlerleme Çubuğu */}
      {isPrefetchingAudio && audioProgress && (
        <div
          className="p-3 rounded-xl border space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--brand-primary)',
          }}
        >
          <div className="flex items-center justify-between gap-2 text-xs min-w-0">
            <span className="font-bold flex items-center gap-1.5 min-w-0">
              <Loader2
                className="w-3.5 h-3.5 animate-spin shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span className="truncate">
                {selectedSurahMeta.no}. {selectedSurahMeta.nameTr} Suresi indiriliyor (
                {formatNumberTr(audioProgress.completed)}/{formatNumberTr(audioProgress.total)})…
              </span>
            </span>
            <span
              className="font-extrabold tabular-nums shrink-0"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              %{audioProgress.percent}
            </span>
          </div>

          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            role="progressbar"
            aria-valuenow={audioProgress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${audioProgress.percent}%`,
                backgroundColor: 'var(--brand-primary)',
              }}
            />
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="tabular-nums font-semibold">
              {formatNumberTr(audioProgress.completed)} / {formatNumberTr(audioProgress.total)} kayıt
              {audioProgress.failed > 0 ? ` · ${formatNumberTr(audioProgress.failed)} atlandı` : ''}
            </span>
            <button
              type="button"
              onClick={handleCancelAudioPrefetch}
              className="min-h-[34px] px-2.5 rounded-lg border font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Square className="w-3 h-3 fill-current shrink-0" />
              <span>İptal</span>
            </button>
          </div>
        </div>
      )}

      {/* Sure Seçici + Sure Ön-İndir Satırı & Temizle Butonu */}
      {!isPrefetchingAudio && (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
            <label htmlFor="offline-audio-surah-select" className="sr-only">
              Ön-indirilecek sureyi seçin
            </label>
            <select
              id="offline-audio-surah-select"
              value={selectedSurahNo}
              onChange={(e) => setSelectedSurahNo(Number(e.target.value))}
              disabled={isClearingAudio}
              className="w-full sm:flex-1 min-w-0 min-h-[42px] px-3 rounded-xl border text-xs font-bold cursor-pointer focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {(meta?.surahs && meta.surahs.length > 0
                ? meta.surahs
                : Array.from({ length: 114 }, (_, i) => ({
                    no: i + 1,
                    nameTr: `${i + 1}. Sure`,
                    ayahCount: 0,
                  }))
              ).map((s) => {
                const isCached = cachedSurahsForActiveReciter.has(s.no);
                const hasMetaName = Boolean(meta?.surahs && meta.surahs.length > 0);
                return (
                  <option key={s.no} value={s.no}>
                    {isCached ? '✓ ' : ''}
                    {hasMetaName ? `${s.no}. ${s.nameTr} Suresi` : s.nameTr}
                    {s.ayahCount > 0 ? ` (${s.ayahCount} ayet)` : ''}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              disabled={!isOnline || isClearingAudio}
              onClick={() => void handlePrefetchSurahAudio()}
              className="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 shrink-0 transition-opacity cursor-pointer hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              <span>Sure Ön-İndir</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isClearingAudio || audioStats.entryCount === 0}
            onClick={() => void handleClearAudioCache()}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--state-danger-text)',
            }}
          >
            {isClearingAudio ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{isClearingAudio ? 'Ses Önbelleği Temizleniyor…' : 'Ses Önbelleğini Temizle'}</span>
          </button>
        </div>
      )}

      {/* Ses Önbelleği Geri Bildirim Mesajı */}
      {audioFeedback && (
        <p
          role="status"
          className="text-xs font-bold px-3 py-2 rounded-xl border leading-snug"
          style={{
            backgroundColor:
              audioFeedback.type === 'success'
                ? 'var(--brand-primary-soft)'
                : audioFeedback.type === 'error'
                  ? 'var(--state-danger-bg)'
                  : 'var(--bg-surface)',
            borderColor:
              audioFeedback.type === 'success'
                ? 'var(--brand-primary)'
                : audioFeedback.type === 'error'
                  ? 'rgba(239, 68, 68, 0.35)'
                  : 'var(--border-subtle)',
            color:
              audioFeedback.type === 'success'
                ? 'var(--brand-primary-text)'
                : audioFeedback.type === 'error'
                  ? 'var(--state-danger-text)'
                  : 'var(--text-secondary)',
          }}
        >
          {audioFeedback.text}
        </p>
      )}
    </div>
    </div>
  );
};
