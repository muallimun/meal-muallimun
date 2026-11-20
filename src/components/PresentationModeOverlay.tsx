import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ChevronDown,
  Headphones,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import { findReciterById } from '../config/recitersConfig';
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
import { formatSafeArabicTitle } from '../utils/arabicUtils';

type PresentationContentMode = 'both' | 'ar' | 'meal';
type PresentationTheme = 'dark' | 'emerald' | 'cream';
type PresentationMealChoice = 'm1' | 'm2';

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
  } = useAppStore();
  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );

  const [contentMode, setContentMode] = useState<PresentationContentMode>('both');
  const [presTheme, setPresTheme] = useState<PresentationTheme>('emerald');
  const [mealChoice, setMealChoice] = useState<PresentationMealChoice>(
    settings.preferredMeal === 'm2' ? 'm2' : 'm1',
  );
  const [manualIndex, setManualIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
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

  audioStatusRef.current = audioState.status;
  versesLenRef.current = verses.length;
  onCloseRef.current = onClose;
  isReciterSelectorOpenRef.current = isReciterSelectorOpen;

  // Sunum açıldığında başlangıç mealini ve aktif ayet indeksini senkronize et (sadece açılışta)
  useEffect(() => {
    if (!isOpen) return;
    setMealChoice(settings.preferredMeal === 'm2' ? 'm2' : 'm1');
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
      // Okuyucu seçici modalı açıkken Sunum klavye kısayollarını duraklat (tam ekrandan çıkma!)
      if (isReciterSelectorOpenRef.current) return;

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
  const mealText =
    mealChoice === 'm2'
      ? displayedVerse?.m2?.t || displayedVerse?.m1?.t || ''
      : displayedVerse?.m1?.t || displayedVerse?.m2?.t || '';
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
  const besmeleTrText = mealChoice === 'm2' ? besmele.dib : besmele.tdv;

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
      {/* Üst Kontrol Şeridi */}
      <header
        className="px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 backdrop-blur-md"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
      >
        {/* Sol: Sure & Ayet Konum Rozeti */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
          >
            <MonitorPlay className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                {displayedVerse
                  ? `${surahMeta?.nameTr ?? `Sure ${displayedVerse.surah}`} · ${displayedVerse.ayah}. Ayet`
                  : 'Sunum Modu'}
              </h2>
              {surahMeta?.nameAr && (
                <span
                  className="arabic-title text-base hidden sm:inline"
                  style={{ color: palette.accent }}
                  dir="rtl"
                >
                  {formatSafeArabicTitle(surahMeta.nameAr)}
                </span>
              )}
            </div>
            <p className="text-[11px] truncate tabular-nums" style={{ color: palette.muted }}>
              {displayedVerse
                ? `Sayfa ${displayedVerse.page} · ${displayedVerse.cuz}. Cüz`
                : 'Ayet bekleniyor'}
              {isAudioRunning && audioState.activePhase === 'meal' && audioState.activeReciterLabel
                ? ` · Sesli Meal: ${audioState.activeReciterLabel}`
                : ''}
            </p>
          </div>
        </div>

        {/* Orta / Sağ: Okuyucu Seçici + İçerik Modu + Meal + Tema + Tam Ekran + Çıkış */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Tıklanabilir Okuyucu Butonu (Tam ekrandan çıkmadan ReciterSelectorModal açar) */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              openReciterSelector();
            }}
            title={`Kur'an Okuyucu: ${activeReciter.label} (Değiştirmek için tıklayın)`}
            className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer max-w-[185px] sm:max-w-[230px] transition-colors"
            style={{
              borderColor: palette.border,
              backgroundColor: palette.accentSoft,
              color: palette.accent,
            }}
          >
            <Headphones className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              <span className="hidden sm:inline opacity-85">Tilavet: </span>
              {activeReciter.shortLabel}
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-80" />
          </button>
          {/* İçerik Seçici */}
          <div
            className="flex items-center p-0.5 rounded-xl border text-xs"
            style={{ borderColor: palette.border, backgroundColor: 'rgba(0,0,0,0.14)' }}
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
                  }}
                  className="min-h-[32px] px-2.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap"
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

          {/* Meal Seçici */}
          {contentMode !== 'ar' && (
            <div
              className="flex items-center p-0.5 rounded-xl border text-xs"
              style={{ borderColor: palette.border, backgroundColor: 'rgba(0,0,0,0.14)' }}
            >
              {(
                [
                  { id: 'm1', label: 'TDV' },
                  { id: 'm2', label: 'DİB' },
                ] as const
              ).map((m) => {
                const active = mealChoice === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setMealChoice(m.id);
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg font-bold cursor-pointer"
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
          )}

          {/* Sunum Teması */}
          <div className="hidden md:flex items-center gap-1">
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
                  className="min-h-[32px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                  style={{
                    borderColor: active ? palette.accent : palette.border,
                    backgroundColor: active ? palette.accentSoft : 'transparent',
                    color: active ? palette.accent : palette.muted,
                  }}
                >
                  {THEME_PALETTES[t].label}
                </button>
              );
            })}
          </div>

          {/* Tam Ekran Butonu (document.documentElement — ses geçişinde bozulmaz) */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran (TV / Projeksiyon)'}
            className="min-w-[38px] min-h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
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
            className="min-h-[38px] px-3 rounded-xl border font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            style={{
              borderColor: palette.border,
              backgroundColor: 'rgba(239, 68, 68, 0.14)',
              color: presTheme === 'cream' ? '#B91C1C' : '#FCA5A5',
            }}
          >
            <X className="w-4 h-4" />
            <span>Çıkış</span>
          </button>
        </div>
      </header>

      {/* Orta Sahne: Kırpışmasız, Deterministik Ölçeklenen Geniş Ayet & Meal Alanı */}
      <main className="flex-1 min-h-0 flex items-center justify-center px-5 sm:px-12 lg:px-20 py-4 overflow-y-auto">
        {displayedVerse ? (
          <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center gap-4 sm:gap-6 text-center transition-opacity duration-200">
            {/* Canlı Durum / Tilâvet Secdesi / Besmele Şeridi */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span
                className="px-3.5 py-1 rounded-full text-xs sm:text-sm font-extrabold tracking-wide tabular-nums border"
                style={{
                  backgroundColor: palette.accentSoft,
                  borderColor: palette.border,
                  color: palette.accent,
                }}
              >
                {surahMeta?.nameTr ?? `Sure ${displayedVerse.surah}`} · {displayedVerse.surah}:
                {displayedVerse.ayah}
              </span>

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
                  {mealChoice === 'm2' ? 'DİB Yeni Meali' : 'TDV Meali'}
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

      {/* Alt Kontrol Barı: Canlı Ses Akışı & Gezinme */}
      <footer
        className="px-4 sm:px-6 py-2.5 border-t flex flex-wrap items-center justify-between gap-2.5 shrink-0 backdrop-blur-md"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
      >
        {/* Sol: İlerleme Bilgisi */}
        <div className="text-xs font-semibold tabular-nums" style={{ color: palette.muted }}>
          {currentIdx >= 0 ? `${currentIdx + 1} / ${verses.length} ayet` : 'Hazır'}
          <span className="hidden sm:inline ml-2 opacity-75">
            · Yön tuşları ile geç · Boşluk ile duraklat · ESC ile çık
          </span>
        </div>

        {/* Orta: Oynatma Kontrolleri */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={!canPrev}
            aria-label="Önceki ayet"
            className="min-w-[42px] min-h-[42px] rounded-xl border flex items-center justify-center disabled:opacity-35 cursor-pointer"
            style={{ borderColor: palette.border, color: palette.text }}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
            className="min-w-[56px] min-h-[44px] px-5 rounded-xl font-extrabold flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-transform active:scale-95"
            style={{
              backgroundColor: palette.accent,
              color: '#071413',
            }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
            <span className="text-sm">{isPlaying ? 'Duraklat' : 'Dinle'}</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext}
            aria-label="Sonraki ayet"
            className="min-w-[42px] min-h-[42px] rounded-xl border flex items-center justify-center disabled:opacity-35 cursor-pointer"
            style={{ borderColor: palette.border, color: palette.text }}
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Sağ: Ses Modu & Hız */}
        <div className="flex items-center gap-1.5 text-xs">
          <div
            className="flex items-center p-0.5 rounded-lg border"
            style={{ borderColor: palette.border }}
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
                  className="min-h-[32px] px-2.5 rounded-md font-bold cursor-pointer whitespace-nowrap"
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

          <button
            type="button"
            onClick={cycleRate}
            className="min-h-[34px] px-2.5 rounded-lg border font-bold tabular-nums cursor-pointer"
            style={{ borderColor: palette.border, color: palette.text }}
          >
            {audioPrefs.playbackRate}x
          </button>
        </div>
      </footer>
    </div>
  );
};
