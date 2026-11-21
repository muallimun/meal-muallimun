import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Headphones,
  ListMusic,
  Loader2,
  MonitorPlay,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import { getDynamicMealAudioSources } from '../config/assetsConfig';
import { findMealById, resolveSpokenMealInfo } from '../config/mealsConfig';
import { findReciterById } from '../config/recitersConfig';
import { audioQueueService } from '../services/audioQueueService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type {
  AudioPlayMode,
  MealAudioSourceId,
  PlaybackRateOption,
  QueueLoopOption,
  RepeatCountOption,
} from '../types/quran';

const PLAYBACK_RATES: readonly PlaybackRateOption[] = [0.75, 1, 1.25, 1.5];
const REPEAT_COUNTS: readonly RepeatCountOption[] = [1, 2, 3, 5, 10];
const QUEUE_LOOPS: readonly QueueLoopOption[] = [1, 2, 3, 5, 10, 'infinite'];

function formatLoopShort(val: RepeatCountOption | QueueLoopOption): string {
  return val === 'infinite' ? '∞' : `${val}x`;
}

const MODE_LABELS: { id: AudioPlayMode; label: string }[] = [
  { id: 'ar', label: 'AR' },
  { id: 'meal', label: 'Meal' },
  { id: 'ar_then_meal', label: 'AR+Meal' },
];

export const AudioPlayerBar: React.FC = () => {
  const {
    settings,
    audioPrefs,
    updateAudioPrefs,
    isExamActive,
    isMemorizationZenActive,
    isMobileReaderImmersive,
    isAudioBarExpanded: isExpanded,
    setIsAudioBarExpanded: setIsExpanded,
    isSidebarCollapsed,
    activeTab,
    setActiveTab,
    studyProgress,
    navigateToStudy,
    openPresentationMode,
    openReciterSelector,
    openMealSelector,
    openListeningDrawer,
    manifest,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );
  const activePrimaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const mealSources = useMemo(() => getDynamicMealAudioSources(manifest), [manifest]);
  const activeMealAudioSource = useMemo(
    () => mealSources.find((s) => s.id === audioPrefs.mealAudioSource) ?? mealSources[0] ?? null,
    [mealSources, audioPrefs.mealAudioSource],
  );
  const showUnvoicedMealBanner =
    !activePrimaryMeal.hasAudio &&
    (audioPrefs.mode !== 'ar' || audioState.activePhase === 'meal') &&
    !audioState.missingMealAudio;

  // Store'daki audioPrefs değişince ses motorunu anlık senkronize et
  useEffect(() => {
    audioQueueService.syncPrefs(audioPrefs);
  }, [audioPrefs]);

  // Oynatıcı kapanınca genişletilmiş çekmeceyi kapat
  useEffect(() => {
    if (!audioState.isVisible || audioState.status === 'idle') {
      setIsExpanded(false);
    }
  }, [audioState.isVisible, audioState.status, setIsExpanded]);

  if (
    isExamActive ||
    isMemorizationZenActive ||
    !audioState.isVisible ||
    audioState.status === 'idle'
  ) {
    return null;
  }

  const isPlaying = audioState.status === 'playing';
  const isLoading = audioState.status === 'loading';
  const showDetailsPanel = isExpanded || audioState.missingMealAudio;

  const resolvedReciterLabel =
    audioState.activeReciterLabel ||
    (audioState.activePhase === 'meal'
      ? activeMealAudioSource?.shortLabel ?? 'Sesli Meal'
      : activeReciter.shortLabel);

  const subtitlePrefix =
    audioState.context === 'playlist' || audioState.context === 'custom'
      ? audioState.queueTitle
        ? `${audioState.queueTitle} · `
        : ''
      : '';

  const spokenMealForBar = resolveSpokenMealInfo(
    audioState.activePhase === 'meal' ? audioState.activeSourceKey : audioPrefs.mealAudioSource,
    manifest,
  );
  const spokenMealDisplay = spokenMealForBar
    ? spokenMealForBar.speakerName
      ? `${spokenMealForBar.shortTag} (${spokenMealForBar.speakerName})`
      : spokenMealForBar.shortTag
    : activeMealAudioSource?.shortLabel ?? 'TDV';

  const compactSubtitle = audioState.errorMessage
    ? audioState.errorMessage
    : audioState.activePhase === 'meal'
      ? `${subtitlePrefix}Sesli Meal: ${spokenMealDisplay}`
      : audioState.activePhase === 'besmele'
        ? `${subtitlePrefix}Besmele · ${resolvedReciterLabel}${
            audioPrefs.mode === 'ar_then_meal' && spokenMealForBar
              ? ` · Meal: ${spokenMealForBar.shortTag}`
              : ''
          }`
        : audioPrefs.mode === 'ar_then_meal' && spokenMealForBar
          ? `${subtitlePrefix}${resolvedReciterLabel} · Sesli Meal: ${spokenMealForBar.shortTag}`
          : `${subtitlePrefix}${resolvedReciterLabel}`;

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

  const cycleQueueLoop = () => {
    sfxService.play('click');
    const current = audioPrefs.queueLoop ?? 1;
    const idx = QUEUE_LOOPS.indexOf(current);
    const next = QUEUE_LOOPS[(idx + 1) % QUEUE_LOOPS.length];
    updateAudioPrefs({ queueLoop: next });
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
    setIsExpanded(false);
    if (activeTab !== 'reader') {
      setActiveTab('reader');
    }
    openPresentationMode();
  };

  const handleOpenListeningDrawer = () => {
    setIsExpanded(false);
    openListeningDrawer({
      initialTab: audioState.context === 'playlist' ? 'playlists' : 'quick',
      surah: audioState.currentSurah ?? undefined,
      startAyah: audioState.currentAyah ?? undefined,
      endAyah: audioState.currentAyah ?? undefined,
      page: audioState.currentPage ?? undefined,
    });
  };

  const handleJumpToPlayingText = () => {
    if (!audioState.currentSurah || !audioState.currentAyah) return;
    sfxService.play('click');
    setIsExpanded(false);
    navigateToStudy({
      surah: audioState.currentSurah,
      ayah: audioState.currentAyah,
      page: audioState.currentPage ?? undefined,
    });
  };

  const isAwayFromPlayingText =
    Boolean(audioState.currentSurah && audioState.currentAyah) &&
    (activeTab !== 'reader' ||
      (studyProgress.lastRead !== null &&
        (studyProgress.lastRead.surah !== audioState.currentSurah ||
          (audioState.currentPage !== null &&
            studyProgress.lastRead.page !== audioState.currentPage))));

  const activeLoopBadge =
    audioState.totalQueueRounds !== 1
      ? audioState.totalQueueRounds === 'infinite'
        ? '∞'
        : `${audioState.currentQueueRound}/${audioState.totalQueueRounds}`
      : audioState.totalRepeats !== 1
        ? `${audioState.currentRepeat}/${audioState.totalRepeats}`
        : null;

  return (
    <div
      role="region"
      aria-label="Ses oynatıcı"
      className={`fixed ${isMobileReaderImmersive ? 'bottom-2.5' : 'bottom-16'} lg:bottom-4 left-0 right-0 ${
        isSidebarCollapsed ? 'lg:left-0' : 'lg:left-64 xl:left-68'
      } z-[35] px-2 sm:px-4 pointer-events-none`}
    >
      <div className="pointer-events-auto max-w-2xl mx-auto flex flex-col gap-1.5">
        {/* Açılır Kompakt Ses Ayarları Paneli (Yalnızca ▴ ikonuyla açılır) */}
        {showDetailsPanel && (
          <div
            className="rounded-2xl border backdrop-blur-md shadow-xl p-3 space-y-2.5 text-xs"
            style={{
              backgroundColor: 'var(--bg-nav)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {/* Seslendirmesi Olmayan Meal İçin Alternatif Çubuğu */}
            {audioState.missingMealAudio && (
              <div
                className="rounded-xl px-2.5 py-2 flex flex-wrap items-center justify-between gap-2"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <span className="font-semibold">Alternatif ses kaynağına geçin:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {mealSources.map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => handleMealSourceChange(src.id)}
                      className="min-h-[30px] px-2.5 rounded-lg font-bold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer"
                    >
                      {src.shortLabel}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleModeChange('ar')}
                    className="min-h-[30px] px-2.5 rounded-lg font-bold text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Arapça Tilavet
                  </button>
                </div>
              </div>
            )}

            {/* Seslendirmesiz Meal Bilgilendirmesi */}
            {showUnvoicedMealBanner && activeMealAudioSource && (
              <div
                className="rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] border"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <button
                  type="button"
                  onClick={() => openMealSelector('primary')}
                  className="font-semibold text-left hover:underline cursor-pointer truncate"
                >
                  Metin: <strong>{activePrimaryMeal.shortLabel}</strong> · Ses:{' '}
                  <strong>
                    {activeMealAudioSource.id === 'tdv'
                      ? 'TDV'
                      : activeMealAudioSource.id === 'dib'
                        ? 'DİB'
                        : activeMealAudioSource.shortLabel}
                  </strong>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('ar')}
                  className="px-2 py-0.5 rounded-md font-bold border shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  Sadece AR
                </button>
              </div>
            )}

            {/* Satır 1: Ses Akışı + Okuyucu (27 Kurrâ) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex items-center p-0.5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {MODE_LABELS.map((item) => {
                  const active = audioPrefs.mode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleModeChange(item.id)}
                      className="min-h-[32px] px-2.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap"
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

              {audioPrefs.mode !== 'meal' && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    openReciterSelector();
                  }}
                  title={`Kur'an okuyucu: ${activeReciter.label}`}
                  className="min-h-[34px] px-2.5 rounded-xl border font-bold cursor-pointer max-w-[205px] flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Headphones
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <span className="truncate">{activeReciter.shortLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65" />
                </button>
              )}
            </div>

            {/* Satır 2: Sesli Meal Kaynağı + Hız + Tekrar + Sunum */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(audioPrefs.mode !== 'ar' || audioState.activePhase === 'meal') &&
                  mealSources.length > 0 && (
                    <div
                      className="flex items-center p-0.5 rounded-xl"
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
                            className="min-h-[32px] px-2.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap"
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
                  title="Oynatma hızı"
                  className="min-h-[34px] px-2.5 rounded-xl border font-bold tabular-nums cursor-pointer"
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
                  title="Ayet tekrarı (1x · 2x · 3x · 5x · 10x)"
                  className="min-h-[34px] px-2.5 rounded-xl border font-bold tabular-nums flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor:
                      audioPrefs.repeatCount !== 1
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                    borderColor:
                      audioPrefs.repeatCount !== 1 ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color:
                      audioPrefs.repeatCount !== 1
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-primary)',
                  }}
                >
                  <Repeat1 className="w-3.5 h-3.5 shrink-0" />
                  <span>Ayet {formatLoopShort(audioPrefs.repeatCount)}</span>
                </button>

                <button
                  type="button"
                  onClick={cycleQueueLoop}
                  title="Bölüm / Liste döngüsü (1x · 2x · 3x · 5x · 10x · ∞)"
                  className="min-h-[34px] px-2.5 rounded-xl border font-bold tabular-nums flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor:
                      (audioPrefs.queueLoop ?? 1) !== 1
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface)',
                    borderColor:
                      (audioPrefs.queueLoop ?? 1) !== 1
                        ? 'var(--brand-accent)'
                        : 'var(--border-subtle)',
                    color:
                      (audioPrefs.queueLoop ?? 1) !== 1
                        ? 'var(--brand-accent-text)'
                        : 'var(--text-primary)',
                  }}
                >
                  <Repeat className="w-3.5 h-3.5 shrink-0" />
                  <span>Liste {formatLoopShort(audioPrefs.queueLoop ?? 1)}</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleOpenListeningDrawer}
                  title="Dinleme kapsamı, döngü ve çalma listeleri"
                  className="min-h-[34px] px-2.5 rounded-xl border font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <ListMusic className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Liste &amp; Kapsam</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenPresentation}
                  title="Tam ekran Sunum Modunu aç"
                  className="min-h-[34px] px-2.5 rounded-xl border font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                  <span>Sunum</span>
                </button>
              </div>
            </div>

            {/* Satır 3: Okunan Metni Ekranda Göster + Metne Git */}
            <div
              className="flex items-center justify-between gap-2 pt-2 border-t"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                role="switch"
                aria-checked={audioPrefs.showTextOnStart}
                onClick={() => {
                  sfxService.play('click');
                  updateAudioPrefs({ showTextOnStart: !audioPrefs.showTextOnStart });
                }}
                className="flex items-center gap-2 text-left min-w-0 cursor-pointer"
                title="Dinleme başlatınca Okuma ekranını otomatik aç"
              >
                <span
                  className="w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                  style={{
                    backgroundColor: audioPrefs.showTextOnStart
                      ? 'var(--brand-primary)'
                      : 'var(--border-strong)',
                  }}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
                      audioPrefs.showTextOnStart ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </span>
                <span className="text-[11px] font-bold truncate" style={{ color: 'var(--text-secondary)' }}>
                  Okunan metni ekranda göster
                </span>
              </button>

              {audioState.currentSurah && audioState.currentAyah && (
                <button
                  type="button"
                  onClick={handleJumpToPlayingText}
                  className="min-h-[30px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Metne Git</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tek Satır İnce Mini Oynatıcı Barı (h-14) */}
        <div
          className="h-14 rounded-2xl border backdrop-blur-md shadow-xl px-2.5 sm:px-3.5 flex items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-strong)',
          }}
        >
          {/* Sol: Sure:Ayet + Okuyucu (Tek dokunuşla detayları aç/kapa) */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsExpanded(!isExpanded);
            }}
            className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
            title="Ses ayarlarını aç/kapat"
          >
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
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

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs sm:text-sm font-extrabold truncate tabular-nums leading-tight">
                  {audioState.currentSurahName} : {audioState.currentAyah}
                </p>
                {activeLoopBadge && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                    title="Aktif döngü / tekrar"
                  >
                    <Repeat className="w-2.5 h-2.5" />
                    <span>{activeLoopBadge}</span>
                  </span>
                )}
              </div>
              <p
                className="text-[11px] font-medium truncate leading-tight mt-0.5"
                style={{
                  color: audioState.errorMessage
                    ? audioState.missingMealAudio
                      ? 'var(--brand-accent-text)'
                      : '#EF4444'
                    : 'var(--text-muted)',
                }}
              >
                {compactSubtitle}
              </p>
            </div>
          </button>

          {/* Sağ: (📖 Metne Git) ⏮ ▶/⏸ ⏭ ▴ ✕ */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {isAwayFromPlayingText && (
              <button
                type="button"
                onClick={handleJumpToPlayingText}
                aria-label="Okunan metne git"
                title={`Okuma ekranında aç (${audioState.currentSurahName} ${audioState.currentAyah})`}
                className="h-8 sm:h-9 px-2 sm:px-2.5 rounded-xl border flex items-center justify-center gap-1 text-[11px] font-extrabold transition-colors cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Metne Git</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => audioQueueService.prevVerse()}
              disabled={!audioState.canGoPrev}
              aria-label="Önceki ayet"
              className="w-8 sm:w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-35 cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => audioQueueService.togglePlayPause()}
              disabled={audioState.missingMealAudio}
              aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-45"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => audioQueueService.nextVerse()}
              disabled={!audioState.canGoNext}
              aria-label="Sonraki ayet"
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-35 cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsExpanded(!isExpanded);
              }}
              aria-label={isExpanded ? 'Ses ayarlarını gizle' : 'Ses ayarlarını göster'}
              aria-expanded={showDetailsPanel}
              title={isExpanded ? 'Ayarları gizle' : 'Okuyucu, akış ve hız ayarları'}
              className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: showDetailsPanel
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: showDetailsPanel ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color: showDetailsPanel ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              }}
            >
              {showDetailsPanel ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => audioQueueService.stopAndReset(true)}
              aria-label="Oynatıcıyı kapat"
              className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer"
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
      </div>
    </div>
  );
};
