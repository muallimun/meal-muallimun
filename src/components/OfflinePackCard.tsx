import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudDownload,
  Info,
  Loader2,
  RefreshCw,
  Square,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { isExtraMealId } from '../config/mealsConfig';
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

export const OfflinePackCard: React.FC<OfflinePackCardProps> = ({ compact = false }) => {
  const { manifest, poolStats, settings, questionIndex, isOnline, dataSourceMode } = useAppStore();

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

  useEffect(() => {
    let active = true;
    void verifyOfflinePackCache().then((isValid) => {
      if (active && !isValid) {
        setStatus((prev) => (prev !== null ? null : prev));
      }
    });
    return () => {
      active = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

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

  const hasDataUpdate = Boolean(
    status &&
      manifest?.dataVersion &&
      status.dataVersion &&
      status.dataVersion !== manifest.dataVersion,
  );
  const updatedDateLabel = status ? formatDateTr(status.updatedAt) : '';

  return (
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
  );
};
