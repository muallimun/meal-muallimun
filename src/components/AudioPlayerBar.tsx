import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Headphones,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
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
  RepeatCountOption,
} from '../types/quran';

const PLAYBACK_RATES: readonly PlaybackRateOption[] = [0.75, 1, 1.25, 1.5];
const REPEAT_COUNTS: readonly RepeatCountOption[] = [1, 2, 3, 5, 'infinite'];

const COMPACT_MODE_OPTIONS: { id: AudioPlayMode; label: string }[] = [
  { id: 'ar', label: 'AR' },
  { id: 'meal', label: 'Meal' },
  { id: 'ar_then_meal', label: 'AR+Meal' },
];

const FULL_MODE_OPTIONS: { id: AudioPlayMode; label: string }[] = [
  { id: 'ar', label: 'Arapça Tilavet' },
  { id: 'meal', label: 'Sesli Meal' },
  { id: 'ar_then_meal', label: 'Sıralı (AR + Meal)' },
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
    studyProgress,
    navigateToStudy,
    openReciterSelector,
    openMealSelector,
    openListeningDrawer,
    manifest,
    meta,
    setSelectedVerseKey,
    triggerSmartReaderPlay,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  // Hızlı ayet atlama açılır seçicisi (useBackButtonGuard / history kullanmaz)
  const [isAyahPickerOpen, setIsAyahPickerOpen] = useState(false);
  const [ayahFilterText, setAyahFilterText] = useState('');
  const ayahPickerRef = useRef<HTMLDivElement | null>(null);

  // Genişletilmiş çekmece içi Ayet Aralığı Döngüsü
  const [showRangeLoopEditor, setShowRangeLoopEditor] = useState(false);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(5);

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

  const currentSurahMeta = useMemo(() => {
    if (!meta || !audioState.currentSurah) return null;
    return meta.surahs.find((s) => s.no === audioState.currentSurah) ?? null;
  }, [meta, audioState.currentSurah]);

  const maxAyahInSurah = currentSurahMeta?.ayahCount ?? Math.max(audioState.currentAyah ?? 1, 1);

  const ayahOptions = useMemo(() => {
    const query = ayahFilterText.trim();
    const list: number[] = [];
    for (let i = 1; i <= maxAyahInSurah; i += 1) {
      if (!query || String(i).includes(query)) {
        list.push(i);
      }
    }
    return list;
  }, [maxAyahInSurah, ayahFilterText]);

  const showUnvoicedMealBanner =
    !activePrimaryMeal.hasAudio &&
    (audioPrefs.mode !== 'ar' || audioState.activePhase === 'meal') &&
    !audioState.missingMealAudio;

  // Store'daki audioPrefs değişince ses motorunu anlık senkronize et
  useEffect(() => {
    audioQueueService.syncPrefs(audioPrefs);
  }, [audioPrefs]);

  // Oynatıcı kapanınca açılır panelleri sıfırla
  useEffect(() => {
    if (!audioState.isVisible || audioState.status === 'idle') {
      setIsExpanded(false);
      setIsAyahPickerOpen(false);
      setShowRangeLoopEditor(false);
    }
  }, [audioState.isVisible, audioState.status, setIsExpanded]);

  // Sure veya ayet değişince varsayılan aralık uçlarını güncel tut
  useEffect(() => {
    const start = audioState.currentAyah ?? 1;
    setRangeStart(start);
    setRangeEnd(Math.min(maxAyahInSurah, start + 4));
  }, [audioState.currentSurah, audioState.currentAyah, maxAyahInSurah]);

  // Mini ayet seçicisini dış tıklama veya Escape ile kapat
  useEffect(() => {
    if (!isAyahPickerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (ayahPickerRef.current && !ayahPickerRef.current.contains(e.target as Node)) {
        setIsAyahPickerOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAyahPickerOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isAyahPickerOpen]);

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

  const spokenMealForBar = resolveSpokenMealInfo(
    audioState.activePhase === 'meal' ? audioState.activeSourceKey : audioPrefs.mealAudioSource,
    manifest,
  );
  const spokenMealShort =
    spokenMealForBar?.shortTag ??
    (activeMealAudioSource?.id === 'tdv'
      ? 'TDV'
      : activeMealAudioSource?.id === 'dib'
        ? 'DİB'
        : activeMealAudioSource?.shortLabel ?? 'TDV');

  const compactSubtitle = audioState.errorMessage
    ? audioState.errorMessage
    : audioState.activePhase === 'besmele'
      ? `Besmele · ${resolvedReciterLabel}`
      : audioPrefs.mode === 'ar_then_meal'
        ? `Sıralı: Arapça + Sesli Meal (${spokenMealShort})`
        : audioPrefs.mode === 'meal' || audioState.activePhase === 'meal'
          ? `${spokenMealShort} · Sesli Meal`
          : `${activeReciter.shortLabel} · Arapça`;

  const handleModeChange = (mode: AudioPlayMode) => {
    sfxService.play('click');
    updateAudioPrefs({ mode });
  };

  const handleMealSourceChange = (mealAudioSource: MealAudioSourceId) => {
    sfxService.play('click');
    updateAudioPrefs({ mealAudioSource });
  };

  const handleMainPlayPause = () => {
    sfxService.play('click');
    if (activeTab === 'reader') {
      const handled = triggerSmartReaderPlay({ forceSwitchToSelected: false });
      if (handled) return;
    }
    audioQueueService.togglePlayPause();
  };

  const handleSelectQuickAyah = (ayahNo: number) => {
    if (!audioState.currentSurah || !manifest || !meta) return;
    sfxService.play('click');
    setIsAyahPickerOpen(false);
    setAyahFilterText('');
    setSelectedVerseKey(`${audioState.currentSurah}:${ayahNo}`);
    void audioQueueService.jumpToSurahAyah(
      audioState.currentSurah,
      ayahNo,
      manifest,
      meta,
      audioPrefs,
    );
  };

  const handleSetContinuousFlow = () => {
    sfxService.play('click');
    setShowRangeLoopEditor(false);
    updateAudioPrefs({ queueLoop: 1 });
  };

  const handleLoopCurrentPage = () => {
    sfxService.play('click');
    setShowRangeLoopEditor(false);
    updateAudioPrefs({ queueLoop: 'infinite' });
    if (audioState.currentPage && manifest && meta) {
      const pageNo = audioState.currentPage;
      if (audioState.context !== 'page' || audioState.contextKey !== `page:${pageNo}`) {
        void audioQueueService.startSegmentQueue({
          items: [
            {
              id: `loop-page-${pageNo}`,
              type: 'page_range',
              label: `Sayfa ${pageNo}`,
              startPage: pageNo,
              endPage: pageNo,
            },
          ],
          title: `Sayfa ${pageNo} Döngüsü`,
          context: 'page',
          contextKey: `page:${pageNo}`,
          manifest,
          meta,
          prefs: { ...audioPrefs, queueLoop: 'infinite' },
          queueLoopOverride: 'infinite',
        });
      }
    }
  };

  const handleStartRangeLoop = () => {
    if (!audioState.currentSurah || !manifest || !meta) return;
    const safeStart = Math.max(1, Math.min(maxAyahInSurah, Math.floor(rangeStart) || 1));
    const safeEnd = Math.max(safeStart, Math.min(maxAyahInSurah, Math.floor(rangeEnd) || safeStart));
    sfxService.play('click');
    setRangeStart(safeStart);
    setRangeEnd(safeEnd);
    setSelectedVerseKey(`${audioState.currentSurah}:${safeStart}`);
    updateAudioPrefs({ queueLoop: 'infinite' });
    void audioQueueService.startSegmentQueue({
      items: [
        {
          id: `range-${audioState.currentSurah}-${safeStart}-${safeEnd}`,
          type: 'ayah_range',
          label: `${audioState.currentSurahName} ${safeStart}–${safeEnd}`,
          surah: audioState.currentSurah,
          startAyah: safeStart,
          endAyah: safeEnd,
        },
      ],
      title: `${audioState.currentSurahName} (${safeStart}–${safeEnd})`,
      context: 'custom',
      contextKey: `range:${audioState.currentSurah}:${safeStart}-${safeEnd}`,
      manifest,
      meta,
      prefs: { ...audioPrefs, queueLoop: 'infinite' },
      queueLoopOverride: 'infinite',
    });
    setShowRangeLoopEditor(false);
  };

  const handleOpenListeningDrawer = () => {
    sfxService.play('click');
    setIsExpanded(false);
    setIsAyahPickerOpen(false);
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
    setIsAyahPickerOpen(false);
    setSelectedVerseKey(`${audioState.currentSurah}:${audioState.currentAyah}`);
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
    audioState.totalRepeats === 'infinite'
      ? '∞ Ayet'
      : audioState.totalQueueRounds !== 1
        ? audioState.totalQueueRounds === 'infinite'
          ? '∞'
          : `${audioState.currentQueueRound}/${audioState.totalQueueRounds}`
        : audioState.totalRepeats !== 1
          ? `${audioState.currentRepeat}/${audioState.totalRepeats}`
          : null;

  const isPageLoopActive =
    audioPrefs.queueLoop === 'infinite' &&
    audioState.context === 'page' &&
    !showRangeLoopEditor;
  const isRangeLoopActive =
    showRangeLoopEditor ||
    (audioState.context === 'custom' &&
      Boolean(audioState.contextKey?.startsWith('range:')) &&
      audioState.totalQueueRounds === 'infinite');
  const isContinuousFlowActive = !isPageLoopActive && !isRangeLoopActive;

  return (
    <div
      role="region"
      aria-label="Ses oynatıcı"
      className={`fixed ${isMobileReaderImmersive ? 'bottom-2.5' : 'bottom-16'} lg:bottom-4 left-0 right-0 ${
        isSidebarCollapsed ? 'lg:left-0' : 'lg:left-64 xl:left-68'
      } z-[35] px-2 sm:px-4 pointer-events-none`}
    >
      <div className="pointer-events-auto max-w-2xl mx-auto flex flex-col gap-1.5 relative">
        {/* ================================================================
            A. GENİŞLETİLMİŞ SES ÇEKMECESİ (Yalnızca ▴ ikonuyla açılır)
            ================================================================ */}
        {showDetailsPanel && (
          <div
            className="rounded-2xl border backdrop-blur-md shadow-2xl p-3.5 space-y-3 text-xs max-h-[70dvh] overflow-y-auto"
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
                <span className="font-semibold">Alternatif ses kaynağına geçebilirsiniz:</span>
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
                  <strong>{spokenMealShort}</strong>
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

            {/* 1. Dinleme Modu */}
            <div className="space-y-1.5">
              <span
                className="block text-[10px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Dinleme Modu
              </span>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {FULL_MODE_OPTIONS.map((item) => {
                  const active = audioPrefs.mode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleModeChange(item.id)}
                      className="min-h-[32px] px-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Okuyucu & Sesli Meal Kaynağı */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  openReciterSelector();
                }}
                title={`Kur'an okuyucu: ${activeReciter.label}`}
                className="min-h-[34px] px-2.5 rounded-xl border font-bold cursor-pointer flex-1 min-w-[180px] flex items-center justify-between gap-2"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Headphones
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <span className="truncate">{activeReciter.label}</span>
                </span>
                <span
                  className="text-[11px] font-extrabold flex items-center gap-0.5 shrink-0"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  <span>Değiştir</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </button>

              {mealSources.length > 0 && (
                <div
                  className="flex items-center p-0.5 rounded-xl border shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <span
                    className="px-2 text-[10px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Meal
                  </span>
                  {mealSources.map((src) => {
                    const active = audioPrefs.mealAudioSource === src.id;
                    const label =
                      src.id === 'tdv' ? 'TDV' : src.id === 'dib' ? 'DİB' : src.shortLabel;
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => handleMealSourceChange(src.id)}
                        className="min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
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
            </div>

            {/* 3. Okuma Hızı & Ayet Tekrarı */}
            <div
              className="pt-2.5 border-t grid grid-cols-1 sm:grid-cols-2 gap-2.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-bold whitespace-nowrap"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Okuma Hızı
                </span>
                <div
                  className="inline-flex items-center p-0.5 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {PLAYBACK_RATES.map((rate) => {
                    const active = audioPrefs.playbackRate === rate;
                    return (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateAudioPrefs({ playbackRate: rate });
                        }}
                        className="h-7 px-2 rounded-lg text-[11px] font-bold tabular-nums cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                        }}
                      >
                        {rate}x
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-bold whitespace-nowrap"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Ayet Tekrarı
                </span>
                <div
                  className="inline-flex items-center p-0.5 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {REPEAT_COUNTS.map((rep) => {
                    const active = audioPrefs.repeatCount === rep;
                    return (
                      <button
                        key={String(rep)}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateAudioPrefs({ repeatCount: rep });
                        }}
                        className="h-7 px-2 rounded-lg text-[11px] font-bold tabular-nums cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                        }}
                      >
                        {rep === 'infinite' ? '∞' : `${rep}x`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. Kapsam / Aralık Döngüsü */}
            <div
              className="pt-2.5 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="block text-[10px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Kapsam &amp; Aralık Döngüsü
              </span>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={handleSetContinuousFlow}
                  className="min-h-[32px] px-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isContinuousFlowActive
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface)',
                    borderColor: isContinuousFlowActive
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                    color: isContinuousFlowActive
                      ? 'var(--brand-primary-text)'
                      : 'var(--text-secondary)',
                  }}
                >
                  Sürekli İlerle
                </button>

                <button
                  type="button"
                  onClick={handleLoopCurrentPage}
                  className="min-h-[32px] px-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isPageLoopActive
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface)',
                    borderColor: isPageLoopActive
                      ? 'var(--brand-accent)'
                      : 'var(--border-subtle)',
                    color: isPageLoopActive
                      ? 'var(--brand-accent-text)'
                      : 'var(--text-secondary)',
                  }}
                >
                  Bu Sayfayı Tekrarla
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setShowRangeLoopEditor((v) => !v);
                  }}
                  className="min-h-[32px] px-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isRangeLoopActive
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface)',
                    borderColor: isRangeLoopActive
                      ? 'var(--brand-accent)'
                      : 'var(--border-subtle)',
                    color: isRangeLoopActive
                      ? 'var(--brand-accent-text)'
                      : 'var(--text-secondary)',
                  }}
                >
                  Ayet Aralığı Seç
                </button>
              </div>

              {showRangeLoopEditor && audioState.currentSurah && (
                <div
                  className="rounded-xl border p-2.5 flex flex-wrap items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[11px] font-extrabold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {audioState.currentSurahName}:
                    </span>
                    <label className="inline-flex items-center gap-1 text-[11px] font-semibold">
                      <span style={{ color: 'var(--text-muted)' }}>Başlangıç</span>
                      <input
                        type="number"
                        min={1}
                        max={maxAyahInSurah}
                        value={rangeStart}
                        onChange={(e) => setRangeStart(Number(e.target.value))}
                        className="w-14 h-7 px-1.5 rounded-lg border text-center font-bold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </label>
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <label className="inline-flex items-center gap-1 text-[11px] font-semibold">
                      <span style={{ color: 'var(--text-muted)' }}>Bitiş</span>
                      <input
                        type="number"
                        min={1}
                        max={maxAyahInSurah}
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(Number(e.target.value))}
                        className="w-14 h-7 px-1.5 rounded-lg border text-center font-bold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartRangeLoop}
                    className="h-8 px-3 rounded-lg text-[11px] font-extrabold text-white flex items-center gap-1.5 cursor-pointer shrink-0"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    <span>Aralığı Döngüde Başlat</span>
                  </button>
                </div>
              )}
            </div>

            {/* 5. Takip Satırı & Çalma Listeleri */}
            <div
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                role="switch"
                aria-checked={audioPrefs.autoScroll}
                onClick={() => {
                  sfxService.play('click');
                  const next = !audioPrefs.autoScroll;
                  updateAudioPrefs({ autoScroll: next, showTextOnStart: next });
                }}
                className="flex items-center gap-2 text-left cursor-pointer py-0.5"
                title="Okunan ayeti ekranda otomatik ortala ve sayfa değiştir"
              >
                <span
                  className="w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                  style={{
                    backgroundColor: audioPrefs.autoScroll
                      ? 'var(--brand-primary)'
                      : 'var(--border-strong)',
                  }}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
                      audioPrefs.autoScroll ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </span>
                <span
                  className="text-[11px] font-bold leading-snug"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Okunan Ayeti Ekranda Takip Et
                </span>
              </button>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {audioState.currentSurah && audioState.currentAyah && (
                  <button
                    type="button"
                    onClick={handleJumpToPlayingText}
                    className="min-h-[32px] px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>Okunan Ayete Git</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleOpenListeningDrawer}
                  className="min-h-[32px] px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <ListMusic
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <span>Çalma Listeleri</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            B. MİNİ YÜZEN OYNATICI ÇUBUĞU
            ================================================================ */}
        <div
          className="min-h-[58px] py-1.5 rounded-2xl border backdrop-blur-md shadow-xl px-2 sm:px-3 flex items-center justify-between gap-1.5 sm:gap-2"
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-strong)',
          }}
        >
          {/* Sol: Ses İkonu + Tıklanabilir Sure · Ayet ▾ Seçici + İkinci Satır Bilgisi */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsAyahPickerOpen(false);
                setIsExpanded(!isExpanded);
              }}
              title="Ses ayarlarını aç veya kapat"
              aria-label="Ses ayarlarını aç veya kapat"
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-opacity hover:opacity-85"
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
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {/* Tıklanabilir Sure · Ayet ▾ Hızlı Atlayıcı */}
                <div ref={ayahPickerRef} className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setAyahFilterText('');
                      setIsAyahPickerOpen((v) => !v);
                    }}
                    aria-expanded={isAyahPickerOpen}
                    title="Bu sure içinde başka bir ayete atla"
                    className="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 -ml-1.5 rounded-lg text-xs sm:text-sm font-extrabold tabular-nums leading-tight cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span className="truncate">
                      {audioState.currentSurahName} · {audioState.currentAyah}. Ayet
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 shrink-0 opacity-65 transition-transform ${
                        isAyahPickerOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isAyahPickerOpen && audioState.currentSurah && (
                    <div
                      className="absolute left-0 bottom-10 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl p-2.5 space-y-2"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[11px] font-extrabold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {audioState.currentSurahName} ({maxAyahInSurah} ayet)
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsAyahPickerOpen(false)}
                          aria-label="Ayet seçiciyi kapat"
                          className="w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {maxAyahInSurah > 20 && (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={ayahFilterText}
                          onChange={(e) => setAyahFilterText(e.target.value)}
                          placeholder="Ayet no ara..."
                          className="w-full h-8 px-2.5 rounded-xl border text-xs font-semibold outline-none"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      )}

                      <div className="grid grid-cols-5 gap-1 max-h-48 overflow-y-auto pr-0.5">
                        {ayahOptions.map((ayahNo) => {
                          const isCurrent = ayahNo === audioState.currentAyah;
                          return (
                            <button
                              key={ayahNo}
                              type="button"
                              onClick={() => handleSelectQuickAyah(ayahNo)}
                              className="h-8 rounded-lg text-xs font-bold tabular-nums cursor-pointer transition-colors"
                              style={{
                                backgroundColor: isCurrent
                                  ? 'var(--brand-primary)'
                                  : 'var(--bg-surface-soft)',
                                color: isCurrent ? '#FFFFFF' : 'var(--text-primary)',
                              }}
                            >
                              {ayahNo}
                            </button>
                          );
                        })}
                        {ayahOptions.length === 0 && (
                          <p
                            className="col-span-5 py-3 text-center text-[11px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Eşleşen ayet bulunamadı.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {activeLoopBadge && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                    title="Aktif döngü veya ayet tekrarı"
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
          </div>

          {/* Orta-Sağ (Masaüstü md+): Kompakt [ AR | Meal | AR+Meal ] Mod Anahtarı */}
          <div
            className="hidden md:flex items-center p-0.5 rounded-xl border shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {COMPACT_MODE_OPTIONS.map((item) => {
              const active = audioPrefs.mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleModeChange(item.id)}
                  className="h-7 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Sağ: (📖 Metne Git) ⏮ ▶/⏸ ⏭ ▴ ✕ */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {isAwayFromPlayingText && (
              <button
                type="button"
                onClick={handleJumpToPlayingText}
                aria-label="Okunan ayete git"
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
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-35 cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleMainPlayPause}
              disabled={audioState.missingMealAudio}
              aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-white shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-45"
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
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-35 cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsAyahPickerOpen(false);
                setIsExpanded(!isExpanded);
              }}
              aria-label={isExpanded ? 'Ses ayarlarını gizle' : 'Ses ayarlarını göster'}
              aria-expanded={showDetailsPanel}
              title={isExpanded ? 'Ayarları gizle' : 'Dinleme modu, okuyucu, hız ve döngü ayarları'}
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer"
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
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer"
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
