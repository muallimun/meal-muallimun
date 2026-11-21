import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BookOpen,
  ChevronRight,
  Headphones,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import { findReciterById } from '../config/recitersConfig';
import { useActiveMeals } from '../hooks/useActiveMeals';
import { audioQueueService } from '../services/audioQueueService';
import { SAJDAH_AYAH_IDS } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type {
  AudioPlayMode,
  BesmeleInfo,
  CombinedVerse,
  PlaybackRateOption,
  SurahMeta,
} from '../types/quran';
import { formatSafeArabicTitle, formatSurahTitle } from '../utils/arabicUtils';

type PresentationContentMode = 'both' | 'ar' | 'meal';
type PresentationTheme = 'dark' | 'emerald' | 'cream';

const DEFAULT_BESMELE: BesmeleInfo = {
  ayahId: 1001,
  audioCode: '001001',
  ar: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  tdv: "Rahmân ve Rahîm olan Allah'ın adıyla.",
  dib: "Rahmân ve Rahîm olan Allah'ın adıyla.",
  excludeSurahs: [1, 9],
};

interface PresentationModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  verses: CombinedVerse[];
  activeVerse: CombinedVerse | null;
  surahMap: Map<number, SurahMeta>;
  besmele?: BesmeleInfo;
  onStartAudioFromActive?: (verse: CombinedVerse) => void;
}

const RATES: readonly PlaybackRateOption[] = [0.75, 1, 1.25, 1.5];

const THEME_PALETTES: Record<
  PresentationTheme,
  {
    label: string;
    bg: string;
    surface: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentSoft: string;
    arabicColor: string;
  }
> = {
  dark: {
    label: 'Gece',
    bg: '#070F10',
    surface: 'rgba(18, 33, 35, 0.90)',
    border: 'rgba(255, 255, 255, 0.12)',
    text: '#F4F8F7',
    muted: '#9AB3B0',
    accent: '#2DD4BF',
    accentSoft: 'rgba(45, 212, 191, 0.15)',
    arabicColor: '#F8FAFC',
  },
  emerald: {
    label: 'Zümrüt',
    bg: '#082624',
    surface: 'rgba(12, 54, 50, 0.90)',
    border: 'rgba(255, 255, 255, 0.15)',
    text: '#F7FAF9',
    muted: '#A8D3CE',
    accent: '#FBBF24',
    accentSoft: 'rgba(251, 191, 36, 0.16)',
    arabicColor: '#FFFFFF',
  },
  cream: {
    label: 'Mushaf',
    bg: '#F8F2E4',
    surface: 'rgba(255, 252, 245, 0.94)',
    border: 'rgba(15, 118, 110, 0.18)',
    text: '#1B1710',
    muted: '#645946',
    accent: '#0F766E',
    accentSoft: 'rgba(15, 118, 110, 0.12)',
    arabicColor: '#17130D',
  },
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const PresentationModeOverlay: React.FC<PresentationModeOverlayProps> = ({
  isOpen,
  onClose,
  verses,
  activeVerse,
  surahMap,
  besmele = DEFAULT_BESMELE,
  onStartAudioFromActive,
}) => {
  const {
    settings,
    audioPrefs,
    updateAudioPrefs,
    manifest,
    isReciterSelectorOpen,
    openReciterSelector,
    isMealSelectorOpen,
    openMealSelector,
  } = useAppStore();
  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const visibleSurahNos = useMemo(
    () => (isOpen ? Array.from(new Set(verses.map((v) => v.surah))) : []),
    [isOpen, verses],
  );
  const { primaryMeal, getPrimaryVerse } = useActiveMeals(visibleSurahNos);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );

  const [contentMode, setContentMode] = useState<PresentationContentMode>('both');
  const [presTheme, setPresTheme] = useState<PresentationTheme>('emerald');
  const [manualIndex, setManualIndex] = useState<number>(0);
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSettingsPopoverOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        settingsPopoverRef.current &&
        !settingsPopoverRef.current.contains(e.target as Node)
      ) {
        setIsSettingsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isSettingsPopoverOpen]);
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 760,
  }));

  // Keep previous valid verse rendered across page/audio transitions (zero flicker / zero blank frame)
  const lastValidVerseRef = useRef<CombinedVerse | null>(null);
  const audioStatusRef = useRef(audioState.status);
  const versesLenRef = useRef(verses.length);
  const onCloseRef = useRef(onClose);
  const isReciterSelectorOpenRef = useRef(isReciterSelectorOpen);
  const isMealSelectorOpenRef = useRef(isMealSelectorOpen);

  audioStatusRef.current = audioState.status;
  versesLenRef.current = verses.length;
  onCloseRef.current = onClose;
  isReciterSelectorOpenRef.current = isReciterSelectorOpen;
  isMealSelectorOpenRef.current = isMealSelectorOpen;

  // Sunum açıldığında aktif ayet indeksini senkronize et (sadece açılışta)
  useEffect(() => {
    if (!isOpen) return;
    if (activeVerse) {
      const idx = verses.findIndex((v) => v.id === activeVerse.id);
      if (idx >= 0) setManualIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Body scroll kilidi ve fullscreen durum takibi — SADECE isOpen'a bağlı!
  // Ses durumu veya ayet/sayfa değişiminde asla fullscreen'den çıkmaz.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };

    setIsFullscreen(Boolean(document.fullscreenElement));
    onResize();

    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen]);

  // Klavye kısayolları — ref'lerle çalışır, ses geçişlerinde yeniden bağlanmaz
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Okuyucu veya meal seçici modalı açıkken Sunum klavye kısayollarını duraklat (tam ekrandan çıkma!)
      if (isReciterSelectorOpenRef.current || isMealSelectorOpenRef.current) return;

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        } else {
          onCloseRef.current();
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (audioStatusRef.current !== 'idle') {
          audioQueueService.nextVerse();
        } else {
          setManualIndex((i) => Math.min(Math.max(0, versesLenRef.current - 1), i + 1));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (audioStatusRef.current !== 'idle') {
          audioQueueService.prevVerse();
        } else {
          setManualIndex((i) => Math.max(0, i - 1));
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        if (audioStatusRef.current !== 'idle') {
          audioQueueService.togglePlayPause();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Canlı çalan ayeti bul; yükleme/geçiş anında önceki geçerli ayeti koru (ıpıl ıpıl sıfır kırpışma)
  const resolvedVerse = useMemo<CombinedVerse | null>(() => {
    if (audioState.status !== 'idle' && audioState.currentAyahId !== null) {
      const byAudio = verses.find((v) => v.id === audioState.currentAyahId);
      if (byAudio) return byAudio;
      // Sayfa henüz yeni yükleniyorsa önceki ayeti tut
      if (lastValidVerseRef.current) return lastValidVerseRef.current;
    }
    if (verses[manualIndex]) return verses[manualIndex];
    if (activeVerse) return activeVerse;
    return verses[0] ?? lastValidVerseRef.current ?? null;
  }, [audioState.status, audioState.currentAyahId, verses, manualIndex, activeVerse]);

  if (resolvedVerse) {
    lastValidVerseRef.current = resolvedVerse;
  }
  const displayedVerse = resolvedVerse ?? lastValidVerseRef.current;

  const surahMeta = displayedVerse ? surahMap.get(displayedVerse.surah) : undefined;
  const resolvedPrimaryMealVerse = displayedVerse ? getPrimaryVerse(displayedVerse) : null;
  const mealText =
    resolvedPrimaryMealVerse?.t || displayedVerse?.m1?.t || displayedVerse?.m2?.t || '';
  const arabicText = displayedVerse?.ar.t || '';
  const showBesmele = Boolean(
    displayedVerse &&
      displayedVerse.ayah === 1 &&
      displayedVerse.surah !== 1 &&
      displayedVerse.surah !== 9,
  );
  const isSajdah = Boolean(
    displayedVerse &&
      SAJDAH_AYAH_IDS.has(displayedVerse.id) &&
      settings.highlightSajdah,
  );

  // Deterministik Tek Geçişli Otomatik Punto Hesabı (DOM ölçüm/reflow olmadan)
  const fontMetrics = useMemo(() => {
    const arLen = arabicText.length;
    const trLen = mealText.length;
    const hFactor = clamp(viewport.h / 820, 0.72, 1.25);
    const wFactor = clamp(viewport.w / 1280, 0.68, 1.18);
    const baseScale = Math.min(hFactor, wFactor);
    const scale = showBesmele && contentMode === 'both' ? baseScale * 0.91 : baseScale;

    let arPx = 46;
    let arLine = 2.02;
    let trPx = 26;
    let trLine = 1.62;

    if (contentMode === 'ar') {
      if (arLen > 620) {
        arPx = 24;
        arLine = 1.82;
      } else if (arLen > 400) {
        arPx = 30;
        arLine = 1.9;
      } else if (arLen > 220) {
        arPx = 38;
        arLine = 1.96;
      } else if (arLen > 100) {
        arPx = 48;
        arLine = 2.04;
      } else {
        arPx = 60;
        arLine = 2.1;
      }
    } else if (contentMode === 'meal') {
      if (trLen > 650) {
        trPx = 20;
        trLine = 1.5;
      } else if (trLen > 420) {
        trPx = 24;
        trLine = 1.56;
      } else if (trLen > 220) {
        trPx = 30;
        trLine = 1.6;
      } else if (trLen > 110) {
        trPx = 36;
        trLine = 1.58;
      } else {
        trPx = 44;
        trLine = 1.52;
      }
    } else {
      // 'both' — Arapça + Türkçe birlikte tek ekrana dengeli sığar
      const total = arLen * 1.15 + trLen;
      if (total > 820) {
        arPx = 22;
        arLine = 1.8;
        trPx = 16;
        trLine = 1.46;
      } else if (total > 560) {
        arPx = 27;
        arLine = 1.86;
        trPx = 18;
        trLine = 1.52;
      } else if (total > 360) {
        arPx = 33;
        arLine = 1.94;
        trPx = 21;
        trLine = 1.56;
      } else if (total > 200) {
        arPx = 40;
        arLine = 2.0;
        trPx = 24;
        trLine = 1.6;
      } else {
        arPx = 48;
        arLine = 2.05;
        trPx = 28;
        trLine = 1.62;
      }
    }

    return {
      arSize: `${Math.round(clamp(arPx * scale, 18, 66))}px`,
      arLine,
      trSize: `${Math.round(clamp(trPx * scale, 14, 46))}px`,
      trLine,
      besmeleArSize: `${Math.round(clamp(34 * baseScale, 20, 42))}px`,
      besmeleTrSize: `${Math.round(clamp(20 * baseScale, 14, 26))}px`,
    };
  }, [arabicText.length, mealText.length, contentMode, viewport.w, viewport.h, showBesmele]);

  if (!isOpen) return null;

  const palette = THEME_PALETTES[presTheme];
  const isAudioRunning = audioState.status !== 'idle';
  const isPlaying = audioState.status === 'playing';
  const isLoading = audioState.status === 'loading';
  const isAudioActiveOnVerse =
    (isPlaying || isLoading) &&
    displayedVerse !== null &&
    audioState.currentAyahId === displayedVerse.id;
  const isBesmelePhase = audioState.activePhase === 'besmele';
  const isBesmeleHighlighted = isAudioActiveOnVerse && isBesmelePhase;
  const isArabicHighlighted = isAudioActiveOnVerse && audioState.activePhase === 'ar';
  const isMealHighlighted = isAudioActiveOnVerse && audioState.activePhase === 'meal';
  const besmeleTrText = primaryMeal.id === 'm2' ? besmele.dib : besmele.tdv;

  const currentIdx = displayedVerse ? verses.findIndex((v) => v.id === displayedVerse.id) : -1;
  const canPrev = isAudioRunning ? audioState.canGoPrev : currentIdx > 0;
  const canNext = isAudioRunning
    ? audioState.canGoNext
    : currentIdx >= 0 && currentIdx < verses.length - 1;

  const handlePrev = () => {
    sfxService.play('click');
    if (isAudioRunning) {
      audioQueueService.prevVerse();
    } else if (currentIdx > 0) {
      setManualIndex(currentIdx - 1);
    }
  };

  const handleNext = () => {
    sfxService.play('click');
    if (isAudioRunning) {
      audioQueueService.nextVerse();
    } else if (currentIdx >= 0 && currentIdx < verses.length - 1) {
      setManualIndex(currentIdx + 1);
    }
  };

  const handlePlayPause = () => {
    sfxService.play('click');
    if (isAudioRunning) {
      audioQueueService.togglePlayPause();
    } else if (displayedVerse && onStartAudioFromActive) {
      onStartAudioFromActive(displayedVerse);
    }
  };

  const handleToggleFullscreen = async () => {
    sfxService.play('click');
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // iFrame/tarayıcı tam ekran kısıtlamasını sessizce geç
    }
  };

  const cycleRate = () => {
    sfxService.play('click');
    const idx = RATES.indexOf(audioPrefs.playbackRate);
    updateAudioPrefs({ playbackRate: RATES[(idx + 1) % RATES.length] });
  };

  const handleAudioModeChange = (mode: AudioPlayMode) => {
    sfxService.play('click');
    updateAudioPrefs({ mode });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hatim ve Dinleme Sunum Modu"
      className="fixed inset-0 z-[85] flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundColor: palette.bg,
        color: palette.text,
      }}
    >
      {/* Tek İnce Üst Şerit */}
      <header
        className="h-14 px-3 sm:px-6 border-b flex items-center justify-between gap-2 shrink-0 backdrop-blur-md relative z-20"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
      >
        {/* Sol: Sure & Ayet Başlığı (Tek satır, taşmasız) */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
          >
            <MonitorPlay className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
              {displayedVerse
                ? `${formatSurahTitle(surahMeta?.nameTr, displayedVerse.surah)} · ${displayedVerse.ayah}. Ayet`
                : 'Sunum Modu'}
            </h2>
            {surahMeta?.nameAr && (
              <span
                className="arabic-title text-base hidden md:inline shrink-0"
                style={{ color: palette.accent }}
                dir="rtl"
              >
                {formatSafeArabicTitle(surahMeta.nameAr)}
              </span>
            )}
          </div>
        </div>

        {/* Sağ: ⚙ Görünüm & Ses Popover + Tam Ekran + Çıkış */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div ref={settingsPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsSettingsPopoverOpen((v) => !v);
              }}
              aria-expanded={isSettingsPopoverOpen}
              aria-label="Görünüm ve ses ayarları"
              className="min-h-[36px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              style={{
                borderColor: isSettingsPopoverOpen ? palette.accent : palette.border,
                backgroundColor: isSettingsPopoverOpen ? palette.accentSoft : 'rgba(0,0,0,0.14)',
                color: isSettingsPopoverOpen ? palette.accent : palette.text,
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">Görünüm &amp; Ses</span>
            </button>

            {isSettingsPopoverOpen && (
              <>
                {/* Arka Plan (Mobilde karartılmış bottom-sheet örtüsü, masaüstünde şeffaf dış tıklama kapatıcı) */}
                <div
                  aria-hidden="true"
                  onClick={() => setIsSettingsPopoverOpen(false)}
                  className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none"
                />
                <div
                  role="dialog"
                  aria-label="Görünüm ve ses ayarları"
                  className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl max-h-[82vh] overflow-y-auto p-4 pb-6 border-t shadow-2xl space-y-3.5 text-left md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-11 md:w-[320px] md:max-w-[calc(100vw-2rem)] md:max-h-[80vh] md:rounded-2xl md:border md:p-3.5"
                  style={{
                    backgroundColor: palette.bg,
                    borderColor: palette.border,
                    color: palette.text,
                    paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  {/* Mobil Bottom Sheet Tutamak ve Başlık */}
                  <div className="md:hidden pb-2 border-b space-y-2" style={{ borderColor: palette.border }}>
                    <div className="w-10 h-1 rounded-full mx-auto opacity-35 bg-current" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold">Görünüm &amp; Ses Ayarları</span>
                      <button
                        type="button"
                        onClick={() => setIsSettingsPopoverOpen(false)}
                        aria-label="Ayarları kapat"
                        className="w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer"
                        style={{
                          borderColor: palette.border,
                          backgroundColor: palette.surface,
                          color: palette.muted,
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Okuyucu & Meal */}
                  <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: palette.muted }}>
                    Tilavet &amp; Meal
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsSettingsPopoverOpen(false);
                      openReciterSelector();
                    }}
                    className="w-full min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
                    style={{
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                      color: palette.text,
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Headphones className="w-3.5 h-3.5 shrink-0" style={{ color: palette.accent }} />
                      <span className="truncate">{activeReciter.shortLabel}</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-65" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsSettingsPopoverOpen(false);
                      openMealSelector('primary');
                    }}
                    className="w-full min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
                    style={{
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                      color: palette.text,
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: palette.accent }} />
                      <span className="truncate">{primaryMeal.shortLabel}</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-65" />
                  </button>
                </div>

                {/* Metin Görünümü */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: palette.muted }}>
                    Metin Görünümü
                  </p>
                  <div
                    className="grid grid-cols-3 gap-1 p-1 rounded-xl border text-[11px]"
                    style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                  >
                    {(
                      [
                        { id: 'both', label: 'AR + Meal' },
                        { id: 'ar', label: 'Sadece AR' },
                        { id: 'meal', label: 'Sadece Meal' },
                      ] as const
                    ).map((item) => {
                      const active = contentMode === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setContentMode(item.id);
                            updateAudioPrefs({
                              mode:
                                item.id === 'ar'
                                  ? 'ar'
                                  : item.id === 'meal'
                                    ? 'meal'
                                    : 'ar_then_meal',
                            });
                          }}
                          className="min-h-[32px] px-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? palette.accent : 'transparent',
                            color: active ? '#071413' : palette.text,
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ses Akışı */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: palette.muted }}>
                    Ses Akışı
                  </p>
                  <div
                    className="grid grid-cols-3 gap-1 p-1 rounded-xl border text-[11px]"
                    style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                  >
                    {(
                      [
                        { id: 'ar', label: 'AR' },
                        { id: 'meal', label: 'Meal' },
                        { id: 'ar_then_meal', label: 'AR+Meal' },
                      ] as { id: AudioPlayMode; label: string }[]
                    ).map((m) => {
                      const active = audioPrefs.mode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleAudioModeChange(m.id)}
                          className="min-h-[32px] px-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? palette.accentSoft : 'transparent',
                            color: active ? palette.accent : palette.muted,
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sunum Teması */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: palette.muted }}>
                    Sunum Teması
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['emerald', 'dark', 'cream'] as PresentationTheme[]).map((t) => {
                      const active = presTheme === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setPresTheme(t);
                          }}
                          className="min-h-[34px] px-2 rounded-xl border text-xs font-bold cursor-pointer"
                          style={{
                            borderColor: active ? palette.accent : palette.border,
                            backgroundColor: active ? palette.accentSoft : palette.surface,
                            color: active ? palette.accent : palette.muted,
                          }}
                        >
                          {THEME_PALETTES[t].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                </div>
              </>
            )}
          </div>

          {/* Tam Ekran Butonu */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
            aria-label={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
            className="min-w-[36px] min-h-[36px] rounded-xl border flex items-center justify-center cursor-pointer"
            style={{
              borderColor: isFullscreen ? palette.accent : palette.border,
              backgroundColor: isFullscreen ? palette.accentSoft : 'transparent',
              color: isFullscreen ? palette.accent : palette.text,
            }}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Kapat / Çıkış */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onClose();
            }}
            className="min-h-[36px] px-2.5 sm:px-3 rounded-xl border font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            style={{
              borderColor: palette.border,
              backgroundColor: 'rgba(239, 68, 68, 0.14)',
              color: presTheme === 'cream' ? '#B91C1C' : '#FCA5A5',
            }}
          >
            <X className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">Çıkış</span>
          </button>
        </div>
      </header>

      {/* Orta Sahne: Kırpışmasız, Deterministik Ölçeklenen Geniş Ayet & Meal Alanı */}
      <main className="flex-1 min-h-0 flex items-center justify-center px-5 sm:px-12 lg:px-20 py-4 overflow-y-auto">
        {displayedVerse ? (
          <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center gap-4 sm:gap-6 text-center transition-opacity duration-200">
            {/* Yalnızca Tilâvet Secdesi veya Aktif Ses Fazı Rozeti (Mükerrer sure:ayet rozeti yok) */}
            {(isSajdah || isPlaying || isLoading) && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {isSajdah && (
                  <span
                    className="px-3.5 py-1 rounded-full text-xs sm:text-sm font-extrabold flex items-center gap-1.5 border shadow-sm"
                    style={{
                      backgroundColor:
                        presTheme === 'cream'
                          ? 'rgba(217, 119, 6, 0.16)'
                          : 'rgba(251, 191, 36, 0.22)',
                      borderColor:
                        presTheme === 'cream'
                          ? 'rgba(180, 83, 9, 0.45)'
                          : 'rgba(251, 191, 36, 0.6)',
                      color: presTheme === 'cream' ? '#92400E' : '#FDE68A',
                    }}
                  >
                    <span className="text-base leading-none">۩</span>
                    <span>Tilâvet Secdesi Ayeti</span>
                  </span>
                )}

                {(isPlaying || isLoading) && (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border"
                    style={{
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                      color: palette.muted,
                    }}
                  >
                    <Volume2 className="w-3.5 h-3.5" style={{ color: palette.accent }} />
                    {isBesmelePhase
                      ? 'Besmele okunuyor'
                      : audioState.activePhase === 'meal'
                        ? 'Sesli Meal akıyor'
                        : 'Arapça Tilavet akıyor'}
                  </span>
                )}
              </div>
            )}

            {/* Sure Başı Besmelesi (1. Ayette — Fâtiha ve Tevbe hariç) */}
            {showBesmele && (contentMode === 'both' || contentMode === 'ar') && (
              <div
                className="w-full max-w-3xl mx-auto rounded-2xl px-5 py-2.5 sm:py-3 border transition-all duration-200"
                style={{
                  backgroundColor: isBesmeleHighlighted ? palette.accentSoft : 'transparent',
                  borderColor: isBesmeleHighlighted ? palette.accent : palette.border,
                  boxShadow: isBesmeleHighlighted
                    ? `0 0 0 2px ${palette.accentSoft}, 0 8px 24px -10px rgba(0,0,0,0.35)`
                    : 'none',
                }}
              >
                <p
                  dir="rtl"
                  lang="ar"
                  className="arabic-text text-center leading-relaxed"
                  style={{
                    fontSize: fontMetrics.besmeleArSize,
                    color: isBesmeleHighlighted ? palette.accent : palette.arabicColor,
                  }}
                >
                  {besmele.ar}
                </p>
              </div>
            )}

            {showBesmele && contentMode === 'meal' && (
              <div
                className="w-full max-w-3xl mx-auto rounded-2xl px-5 py-2 border transition-all duration-200"
                style={{
                  backgroundColor: isBesmeleHighlighted ? palette.accentSoft : 'transparent',
                  borderColor: isBesmeleHighlighted ? palette.accent : palette.border,
                }}
              >
                <p
                  className="turkish-reading italic font-semibold text-center"
                  style={{
                    fontSize: fontMetrics.besmeleTrSize,
                    color: isBesmeleHighlighted ? palette.accent : palette.muted,
                  }}
                >
                  {besmeleTrText}
                </p>
              </div>
            )}

            {/* Arapça Metin */}
            {(contentMode === 'both' || contentMode === 'ar') && (
              <div
                dir="rtl"
                lang="ar"
                className={`arabic-text w-full text-center px-4 py-2 rounded-2xl border transition-all duration-200 ${
                  isBesmeleHighlighted ? 'opacity-70' : 'opacity-100'
                }`}
                style={{
                  fontSize: fontMetrics.arSize,
                  lineHeight: fontMetrics.arLine,
                  color: palette.arabicColor,
                  backgroundColor: isArabicHighlighted ? palette.accentSoft : 'transparent',
                  borderColor: isArabicHighlighted ? palette.accent : 'transparent',
                }}
              >
                {displayedVerse.ar.t}
                {isSajdah && (
                  <span
                    title="Tilâvet Secdesi Ayeti"
                    className="inline-flex items-center justify-center mx-1.5 text-[0.62em] font-extrabold px-2 py-0.5 rounded-lg align-middle border"
                    style={{
                      backgroundColor:
                        presTheme === 'cream'
                          ? 'rgba(217, 119, 6, 0.16)'
                          : 'rgba(251, 191, 36, 0.22)',
                      borderColor:
                        presTheme === 'cream'
                          ? 'rgba(180, 83, 9, 0.45)'
                          : 'rgba(251, 191, 36, 0.55)',
                      color: presTheme === 'cream' ? '#92400E' : '#FDE68A',
                      fontFamily: 'var(--font-turkish)',
                    }}
                  >
                    ۩
                  </span>
                )}
                <span
                  className="inline-flex items-center justify-center mx-2.5 text-[0.56em] font-bold tabular-nums px-2.5 py-0.5 rounded-full align-middle"
                  style={{
                    backgroundColor: palette.accentSoft,
                    color: palette.accent,
                    fontFamily: 'var(--font-turkish)',
                  }}
                >
                  ﴿{displayedVerse.ayah}﴾
                </span>
              </div>
            )}

            {/* İnce Ayırıcı (AR+Meal modunda) */}
            {contentMode === 'both' && (
              <div
                className="w-24 h-0.5 rounded-full opacity-45"
                style={{ backgroundColor: palette.accent }}
              />
            )}

            {/* Türkçe Meal */}
            {(contentMode === 'both' || contentMode === 'meal') && (
              <div
                className={`w-full max-w-4xl mx-auto px-4 py-2.5 rounded-2xl border transition-all duration-200 ${
                  isBesmeleHighlighted ? 'opacity-70' : 'opacity-100'
                }`}
                style={{
                  backgroundColor: isMealHighlighted ? palette.accentSoft : 'transparent',
                  borderColor: isMealHighlighted ? palette.accent : 'transparent',
                }}
              >
                <p
                  className="turkish-reading font-medium text-center"
                  style={{
                    fontSize: fontMetrics.trSize,
                    lineHeight: fontMetrics.trLine,
                    color: palette.text,
                  }}
                >
                  {mealText}
                </p>
                <p
                  className="mt-2.5 text-xs sm:text-sm font-semibold"
                  style={{ color: palette.muted }}
                >
                  {primaryMeal.label}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-base font-semibold" style={{ color: palette.muted }}>
            Sunum için görüntülenecek ayet bulunamadı.
          </p>
        )}
      </main>

      {/* Sade Alt Kontrol Barı: Yalnızca İlerleme, ⏮ ▶/⏸ ⏭ ve Hız (1x) */}
      <footer
        className="h-16 px-4 sm:px-6 border-t flex items-center justify-between gap-2 shrink-0 backdrop-blur-md"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
      >
        {/* Sol: İlerleme Bilgisi */}
        <div className="text-xs font-bold tabular-nums min-w-[64px]" style={{ color: palette.muted }}>
          {currentIdx >= 0 ? `${currentIdx + 1} / ${verses.length}` : 'Hazır'}
        </div>

        {/* Orta: Oynatma Kontrolleri */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={!canPrev}
            aria-label="Önceki ayet"
            className="w-10 h-10 rounded-xl border flex items-center justify-center disabled:opacity-35 cursor-pointer"
            style={{ borderColor: palette.border, color: palette.text }}
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
            className="h-10 px-5 rounded-xl font-extrabold flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-transform active:scale-95"
            style={{
              backgroundColor: palette.accent,
              color: '#071413',
            }}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
            <span className="text-xs sm:text-sm">{isPlaying ? 'Duraklat' : 'Dinle'}</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext}
            aria-label="Sonraki ayet"
            className="w-10 h-10 rounded-xl border flex items-center justify-center disabled:opacity-35 cursor-pointer"
            style={{ borderColor: palette.border, color: palette.text }}
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Sağ: Yalnızca Oynatma Hızı */}
        <div className="min-w-[64px] flex justify-end">
          <button
            type="button"
            onClick={cycleRate}
            title="Oynatma hızı"
            className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold tabular-nums cursor-pointer"
            style={{ borderColor: palette.border, color: palette.text }}
          >
            {audioPrefs.playbackRate}x
          </button>
        </div>
      </footer>
    </div>
  );
};
