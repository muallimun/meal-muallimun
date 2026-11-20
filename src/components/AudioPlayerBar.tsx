import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  Loader2,
  MonitorPlay,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import {
  getDynamicArabicAudioSources,
  getDynamicMealAudioSources,
} from '../config/assetsConfig';
import { audioQueueService } from '../services/audioQueueService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type {
  AudioPlayMode,
  MealAudioSourceId,
  PlaybackRateOption,
  RepeatCountOption,
} from '../types/quran';

const PLAYBACK_RATES: readonly PlaybackRateOption[] = [0.75, 1, 1.25, 1.5];
const REPEAT_COUNTS: readonly RepeatCountOption[] = [1, 2, 3];

const MODE_LABELS: { id: AudioPlayMode; label: string }[] = [
  { id: 'ar', label: 'AR' },
  { id: 'meal', label: 'Meal' },
  { id: 'ar_then_meal', label: 'AR+Meal' },
];

export const AudioPlayerBar: React.FC = () => {
  const {
    audioPrefs,
    updateAudioPrefs,
    isExamActive,
    isSidebarCollapsed,
    activeTab,
    setActiveTab,
    openPresentationMode,
    manifest,
  } = useAppStore();
  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const arabicSources = useMemo(() => getDynamicArabicAudioSources(manifest), [manifest]);
  const mealSources = useMemo(() => getDynamicMealAudioSources(manifest), [manifest]);

  // Store'daki audioPrefs değişince ses motorunu anlık senkronize et
  useEffect(() => {
    audioQueueService.syncPrefs(audioPrefs);
  }, [audioPrefs]);

  if (isExamActive || !audioState.isVisible || audioState.status === 'idle') {
    return null;
  }

  const isPlaying = audioState.status === 'playing';
  const isLoading = audioState.status === 'loading';

  const reciterSuffix = audioState.activeReciterLabel
    ? ` · ${audioState.activeReciterLabel}`
    : '';

  const phaseText =
    audioState.activePhase === 'besmele'
      ? `Besmele${reciterSuffix}`
      : audioState.activePhase === 'ar'
        ? `Arapça Tilavet${reciterSuffix}`
        : audioState.activePhase === 'meal'
          ? `Sesli Meal${reciterSuffix}`
          : isPlaying
            ? 'Oynatılıyor'
            : 'Duraklatıldı';

  const cycleRate = () => {
    sfxService.play('click');
    const idx = PLAYBACK_RATES.indexOf(audioPrefs.playbackRate);
    const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    updateAudioPrefs({ playbackRate: next });
  };

  const cycleRepeat = () => {
    sfxService.play('click');
    const idx = REPEAT_COUNTS.indexOf(audioPrefs.repeatCount);
    const next = REPEAT_COUNTS[(idx + 1) % REPEAT_COUNTS.length];
    updateAudioPrefs({ repeatCount: next });
  };

  const handleModeChange = (mode: AudioPlayMode) => {
    sfxService.play('click');
    updateAudioPrefs({ mode });
  };

  const handleMealSourceChange = (mealAudioSource: MealAudioSourceId) => {
    sfxService.play('click');
    updateAudioPrefs({ mealAudioSource });
  };

  const handleOpenPresentation = () => {
    if (activeTab !== 'reader') {
      setActiveTab('reader');
    }
    openPresentationMode();
  };

  return (
    <div
      role="region"
      aria-label="Ses oynatıcı"
      className={`fixed bottom-16 lg:bottom-4 left-0 right-0 ${
        isSidebarCollapsed ? 'lg:left-0' : 'lg:left-72'
      } z-35 px-2.5 sm:px-4 pointer-events-none`}
    >
      <div
        className="pointer-events-auto max-w-4xl mx-auto rounded-2xl border backdrop-blur-md shadow-xl px-3 py-2.5 sm:px-4 sm:py-3"
        style={{
          backgroundColor: 'var(--bg-nav)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-col gap-2">
          {/* Üst Satır: Aktif Ayet Bilgisi + Ana Oynatma Kontrolleri + Kapat */}
          <div className="flex items-center justify-between gap-2">
            {/* Sol: Aktif Sure : Ayet (Sayfa X) */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: audioState.missingMealAudio
                    ? 'var(--brand-accent-soft)'
                    : 'var(--brand-primary-soft)',
                  color: audioState.missingMealAudio
                    ? 'var(--brand-accent-text)'
                    : 'var(--brand-primary-text)',
                }}
              >
                {audioState.missingMealAudio ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Volume2 className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-extrabold truncate tabular-nums">
                  {audioState.currentSurahName} : {audioState.currentAyah}
                  {audioState.currentPage !== null && (
                    <span
                      className="font-semibold ml-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      (Sayfa {audioState.currentPage})
                    </span>
                  )}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {audioState.errorMessage ? (
                    <span
                      style={{
                        color: audioState.missingMealAudio
                          ? 'var(--brand-accent-text)'
                          : '#EF4444',
                      }}
                    >
                      {audioState.errorMessage}
                    </span>
                  ) : (
                    <>
                      <span
                        className="font-semibold"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {phaseText}
                      </span>
                      {audioState.totalRepeats > 1 && (
                        <span className="tabular-nums">
                          {' '}
                          · Tekrar {audioState.currentRepeat}/{audioState.totalRepeats}
                        </span>
                      )}
                      {audioState.infoMessage && (
                        <span
                          className="ml-1.5 font-medium"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          · {audioState.infoMessage}
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Orta: Önceki / Oynat-Duraklat / Sonraki */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => audioQueueService.prevVerse()}
                disabled={!audioState.canGoPrev}
                aria-label="Önceki ayet"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-colors disabled:opacity-35 cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => audioQueueService.togglePlayPause()}
                disabled={audioState.missingMealAudio}
                aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-white shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-45"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => audioQueueService.nextVerse()}
                disabled={!audioState.canGoNext}
                aria-label="Sonraki ayet"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-colors disabled:opacity-35 cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => audioQueueService.stopAndReset(true)}
                aria-label="Oynatıcıyı kapat"
                className="min-w-[40px] min-h-[40px] ml-0.5 rounded-xl flex items-center justify-center border transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Seslendirmesi Olmayan Meal İçin Tek Dokunuşlu Alternatif Çubuğu */}
          {audioState.missingMealAudio && (
            <div
              className="rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <span className="font-semibold">
                Alternatif ses kaynağına geçin:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {mealSources.map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => handleMealSourceChange(src.id)}
                    className="min-h-[34px] px-2.5 rounded-lg font-bold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer"
                  >
                    {src.shortLabel}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleModeChange('ar')}
                  className="min-h-[34px] px-2.5 rounded-lg font-bold text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  Arapça Tilavet
                </button>
              </div>
            </div>
          )}

          {/* Alt Satır: Mod (AR | Meal | AR+Meal), Dinamik Okuyucu / Meal Sesi, Hız ve Tekrar */}
          <div
            className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {/* Mod Seçici */}
            <div
              className="flex items-center p-0.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {MODE_LABELS.map((item) => {
                const active = audioPrefs.mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleModeChange(item.id)}
                    className="min-h-[34px] px-2.5 rounded-md font-bold transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Okuyucu (birden fazlaysa) + Meal Sesi + Hız + Tekrar */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {arabicSources.length > 1 && audioPrefs.mode !== 'meal' && (
                <select
                  aria-label="Arapça okuyucu seç"
                  value={audioPrefs.arabicAudioSource}
                  onChange={(e) => {
                    sfxService.play('click');
                    updateAudioPrefs({ arabicAudioSource: e.target.value });
                  }}
                  className="min-h-[34px] px-2 rounded-lg border font-bold cursor-pointer max-w-[130px]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {arabicSources.map((src) => (
                    <option key={src.id} value={src.id}>
                      {src.shortLabel}
                    </option>
                  ))}
                </select>
              )}

              {(audioPrefs.mode !== 'ar' || audioState.activePhase === 'meal') &&
                mealSources.length > 0 && (
                  <div
                    className="flex items-center p-0.5 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {mealSources.map((src) => {
                      const active = audioPrefs.mealAudioSource === src.id;
                      const label =
                        src.id === 'tdv' ? 'TDV' : src.id === 'dib' ? 'DİB' : src.shortLabel;
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => handleMealSourceChange(src.id)}
                          className="min-h-[34px] px-2 rounded-md font-bold transition-colors cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                            color: active ? 'var(--brand-accent-text)' : 'var(--text-muted)',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

              <button
                type="button"
                onClick={cycleRate}
                title="Oynatma hızını değiştir"
                className="min-h-[34px] px-2.5 rounded-lg border font-bold tabular-nums cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {audioPrefs.playbackRate}x
              </button>

              <button
                type="button"
                onClick={cycleRepeat}
                title="Ayet tekrar sayısını değiştir"
                className="min-h-[34px] px-2.5 rounded-lg border font-bold tabular-nums flex items-center gap-1 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor:
                    audioPrefs.repeatCount > 1
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface)',
                  borderColor:
                    audioPrefs.repeatCount > 1
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                  color:
                    audioPrefs.repeatCount > 1
                      ? 'var(--brand-primary-text)'
                      : 'var(--text-primary)',
                }}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>{audioPrefs.repeatCount}x</span>
              </button>

              <button
                type="button"
                onClick={handleOpenPresentation}
                title="Tam ekran Sunum Modunu aç (TV / Projeksiyon)"
                className="min-h-[34px] px-2.5 rounded-lg border font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                <span>Sunum</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
