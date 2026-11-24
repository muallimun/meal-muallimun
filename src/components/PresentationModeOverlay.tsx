import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  AudioLines,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Headphones,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  MonitorPlay,
  Palette,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  getMealTextPresentation,
  isDisplayedMealMatchingAudio,
  resolveSpokenMealInfo,
} from '../config/mealsConfig';
import { findReciterById } from '../config/recitersConfig';
import { useActiveMeals } from '../hooks/useActiveMeals';
import { useTajweedData } from '../hooks/useTajweedData';
import { audioQueueService } from '../services/audioQueueService';
import { useBackButtonGuard } from '../services/backStackService';
import { SAJDAH_AYAH_IDS, toArabicIndicDigits } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { wordAudioService } from '../services/wordAudioService';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import {
  PLAYBACK_RATE_OPTIONS,
  type AudioPlayMode,
  type BesmeleInfo,
  type CombinedVerse,
  type SurahMeta,
  type ThemeMode,
} from '../types/quran';
import { formatSafeArabicTitle, formatSurahTitle } from '../utils/arabicUtils';
import { splitTrailingWaqf, WaqfMarkSpan } from '../utils/waqfTextUtils';
import { mapQulWordIndexToDisplay, tokenizeArabicWithWaqf } from '../utils/wordSyncUtils';
import { useActiveWordSync } from '../features/study/SyncedArabicText';
import { TAJWEED_DIACRITIC_NOTE } from '../features/study/TajweedLegendBar';
import { TajweedText } from '../features/study/TajweedText';

type PresentationContentMode = 'both' | 'ar' | 'meal';
type PresentationTheme = 'emerald' | 'cream' | 'slate' | 'light';

const PRESENTATION_THEME_STORAGE_KEY = 'muallimun_presentation_theme_v1';
const PRESENTATION_THEME_ORDER: readonly PresentationTheme[] = [
  'emerald',
  'cream',
  'slate',
  'light',
];

function loadSavedPresentationTheme(): PresentationTheme {
  try {
    const raw = window.localStorage.getItem(PRESENTATION_THEME_STORAGE_KEY);
    if (raw === 'dark') return 'slate';
    if (raw === 'emerald' || raw === 'cream' || raw === 'slate' || raw === 'light') {
      return raw;
    }
  } catch {
    // localStorage erişilemezse varsayılan Zümrüt Salon temasına dön
  }
  return 'emerald';
}

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
  scopeMode?: 'page' | 'surah';
  onStartAudioFromActive?: (verse: CombinedVerse) => void;
  onStartMealAudioFromActive?: (verse: CombinedVerse) => void;
}

const RATES = PLAYBACK_RATE_OPTIONS;

const THEME_PALETTES: Record<
  PresentationTheme,
  {
    label: string;
    swatch: string;
    bg: string;
    popoverBg: string;
    surface: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    accentSoft: string;
    arabicColor: string;
    ayahMarkerColor: string;
  }
> = {
  emerald: {
    label: 'Zümrüt Salon',
    swatch: '#134E4A',
    bg: 'radial-gradient(circle at 50% 42%, #134E4A 0%, #0B2E2B 65%, #071F1D 100%)',
    popoverBg: '#0B2E2B',
    surface: 'rgba(11, 46, 43, 0.90)',
    border: 'rgba(255, 255, 255, 0.16)',
    text: '#FFFDF7',
    muted: '#A8D3CE',
    accent: '#FBBF24',
    accentText: '#071413',
    accentSoft: 'rgba(251, 191, 36, 0.16)',
    arabicColor: '#FFFDF7',
    ayahMarkerColor: '#FDE68A',
  },
  cream: {
    label: 'Krem Mushaf',
    swatch: '#FAF5E8',
    bg: '#FAF5E8',
    popoverBg: '#FAF5E8',
    surface: 'rgba(255, 252, 245, 0.94)',
    border: 'rgba(15, 118, 110, 0.20)',
    text: '#18181B',
    muted: '#645946',
    accent: '#0F766E',
    accentText: '#FFFFFF',
    accentSoft: 'rgba(15, 118, 110, 0.12)',
    arabicColor: '#18181B',
    ayahMarkerColor: '#0F766E',
  },
  slate: {
    label: 'Gece Antrasit',
    swatch: '#111827',
    bg: '#111827',
    popoverBg: '#111827',
    surface: 'rgba(24, 33, 47, 0.92)',
    border: 'rgba(255, 255, 255, 0.14)',
    text: '#F8FAFC',
    muted: '#94A3B8',
    accent: '#2DD4BF',
    accentText: '#071413',
    accentSoft: 'rgba(45, 212, 191, 0.15)',
    arabicColor: '#F8FAFC',
    ayahMarkerColor: '#5EEAD4',
  },
  light: {
    label: 'Ferah Beyaz',
    swatch: '#FFFFFF',
    bg: '#FFFFFF',
    popoverBg: '#FFFFFF',
    surface: 'rgba(248, 250, 252, 0.95)',
    border: 'rgba(15, 23, 42, 0.14)',
    text: '#0F172A',
    muted: '#475569',
    accent: '#0F766E',
    accentText: '#FFFFFF',
    accentSoft: 'rgba(15, 118, 110, 0.10)',
    arabicColor: '#0F172A',
    ayahMarkerColor: '#0F766E',
  },
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

const PRESENTATION_FONT_SCALE_STORAGE_KEY = 'muallimun_presentation_font_scale';
const PRESENTATION_FONT_SCALE_MIN = 0.85;
const PRESENTATION_FONT_SCALE_MAX = 1.3;
const PRESENTATION_FONT_SCALE_STEP = 0.05;

function normalizeFontScale(val: number): number {
  const clamped = clamp(val, PRESENTATION_FONT_SCALE_MIN, PRESENTATION_FONT_SCALE_MAX);
  return Math.round(clamped * 20) / 20;
}

function loadSavedPresentationFontScale(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = window.localStorage.getItem(PRESENTATION_FONT_SCALE_STORAGE_KEY);
    if (!raw) return 1;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 1;
    return normalizeFontScale(parsed);
  } catch {
    return 1;
  }
}

export const PresentationModeOverlay: React.FC<PresentationModeOverlayProps> = ({
  isOpen,
  onClose,
  verses,
  activeVerse,
  surahMap,
  besmele = DEFAULT_BESMELE,
  scopeMode,
  onStartAudioFromActive,
  onStartMealAudioFromActive,
}) => {
  const {
    settings,
    updateSettings,
    audioPrefs,
    updateAudioPrefs,
    meta,
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
  const wordSync = useActiveWordSync(
    isOpen &&
      settings.wordSyncEnabled &&
      audioState.isWordSyncActive &&
      (audioState.status === 'playing' || audioState.status === 'loading'),
  );

  const visibleSurahNos = useMemo(
    () => (isOpen ? Array.from(new Set(verses.map((v) => v.surah))) : []),
    [isOpen, verses],
  );
  const { primaryMeal, secondaryMeal, isDual, getPrimaryVerse, getSecondaryVerse } =
    useActiveMeals(visibleSurahNos);
  const {
    rules: tjRules,
    besmele: tjBesmele,
    getVerseWords: getTjVerseWords,
  } = useTajweedData(visibleSurahNos, isOpen && settings.tajweedEnabled);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );

  const [contentMode, setContentMode] = useState<PresentationContentMode>('both');
  const [presTheme, setPresThemeState] = useState<PresentationTheme>(loadSavedPresentationTheme);
  const [presFontScale, setPresFontScaleState] = useState<number>(loadSavedPresentationFontScale);

  const setPresTheme = (next: PresentationTheme) => {
    setPresThemeState(next);
    try {
      window.localStorage.setItem(PRESENTATION_THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  const setPresFontScale = (next: number) => {
    const normalized = normalizeFontScale(next);
    setPresFontScaleState(normalized);
    try {
      window.localStorage.setItem(PRESENTATION_FONT_SCALE_STORAGE_KEY, String(normalized));
    } catch {
      // ignore storage errors
    }
  };

  const cyclePresTheme = () => {
    sfxService.play('click');
    const idx = PRESENTATION_THEME_ORDER.indexOf(presTheme);
    setPresTheme(PRESENTATION_THEME_ORDER[(idx + 1) % PRESENTATION_THEME_ORDER.length]);
  };
  const [manualIndex, setManualIndex] = useState<number>(0);
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [isAyahPickerOpen, setIsAyahPickerOpen] = useState(false);
  const [showDiacriticNote, setShowDiacriticNote] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const ayahPickerRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    if (!isAyahPickerOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        ayahPickerRef.current &&
        !ayahPickerRef.current.contains(e.target as Node)
      ) {
        setIsAyahPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isAyahPickerOpen]);

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
  const isAyahPickerOpenRef = useRef(isAyahPickerOpen);
  const isSettingsPopoverOpenRef = useRef(isSettingsPopoverOpen);

  audioStatusRef.current = audioState.status;
  versesLenRef.current = verses.length;
  onCloseRef.current = onClose;
  isReciterSelectorOpenRef.current = isReciterSelectorOpen;
  isMealSelectorOpenRef.current = isMealSelectorOpen;
  isAyahPickerOpenRef.current = isAyahPickerOpen;
  isSettingsPopoverOpenRef.current = isSettingsPopoverOpen;

  // Sunum açıldığında aktif ayet indeksini senkronize et (sadece açılışta)
  useEffect(() => {
    if (!isOpen) return;
    if (activeVerse) {
      const idx = verses.findIndex((v) => v.id === activeVerse.id);
      if (idx >= 0) setManualIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useBackButtonGuard('presentation_mode', isOpen, () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    onCloseRef.current();
  });

  // Body scroll kilidi ve fullscreen durum takibi — SADECE isOpen'a bağlı!
  // Ses durumu veya ayet/sayfa değişiminde asla fullscreen'den çıkmaz.
  useEffect(() => {
    if (!isOpen) return;
    const releaseScrollLock = acquireBodyScrollLock();

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
      releaseScrollLock();
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
        if (isAyahPickerOpenRef.current) {
          setIsAyahPickerOpen(false);
        } else if (isSettingsPopoverOpenRef.current) {
          setIsSettingsPopoverOpen(false);
        } else if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        } else {
          onCloseRef.current();
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const status = audioStatusRef.current;
        if (status === 'playing' || status === 'loading') {
          audioQueueService.nextVerse(true);
        } else if (status === 'paused' || status === 'error') {
          audioQueueService.nextVerse(false);
        } else {
          setManualIndex((i) => Math.min(Math.max(0, versesLenRef.current - 1), i + 1));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const status = audioStatusRef.current;
        if (status === 'playing' || status === 'loading') {
          audioQueueService.prevVerse(true);
        } else if (status === 'paused' || status === 'error') {
          audioQueueService.prevVerse(false);
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
      const fromQueue = audioQueueService.getCurrentVerse();
      if (fromQueue && fromQueue.id === audioState.currentAyahId) return fromQueue;
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

  const pickerVerses = useMemo<CombinedVerse[]>(() => {
    if (audioState.status !== 'idle' && displayedVerse) {
      if (verses.some((v) => v.id === displayedVerse.id)) return verses;
      const qVerses = audioQueueService.getQueueVerses();
      if (qVerses.length > 0 && qVerses.some((v) => v.id === displayedVerse.id)) {
        return qVerses;
      }
    }
    return verses;
  }, [audioState.status, displayedVerse, verses]);

  const pickerSurahGroups = useMemo(() => {
    const groups: Array<{ surahNo: number; verses: CombinedVerse[] }> = [];
    for (const v of pickerVerses) {
      const last = groups[groups.length - 1];
      if (last && last.surahNo === v.surah) {
        last.verses.push(v);
      } else {
        groups.push({ surahNo: v.surah, verses: [v] });
      }
    }
    return groups;
  }, [pickerVerses]);

  const surahMeta = displayedVerse ? surahMap.get(displayedVerse.surah) : undefined;
  const resolvedPrimaryMealVerse = displayedVerse ? getPrimaryVerse(displayedVerse) : null;
  const resolvedSecondaryMealVerse =
    displayedVerse && isDual ? getSecondaryVerse(displayedVerse) : null;
  const mealText =
    resolvedPrimaryMealVerse?.t || displayedVerse?.m1?.t || displayedVerse?.m2?.t || '';
  const secondaryMealText = resolvedSecondaryMealVerse?.t || '';
  const arabicText = displayedVerse?.ar.t || '';
  const showBesmele = Boolean(
    displayedVerse &&
      displayedVerse.ayah === 1 &&
      !(meta?.besmele?.excludeSurahs ?? besmele?.excludeSurahs ?? [1, 9]).includes(
        displayedVerse.surah,
      ),
  );
  const isSajdah = Boolean(
    displayedVerse &&
      SAJDAH_AYAH_IDS.has(displayedVerse.id) &&
      settings.highlightSajdah,
  );

  const besmelePlainTokens = useMemo(
    () => tokenizeArabicWithWaqf(besmele.ar),
    [besmele.ar],
  );
  const versePlainTokens = useMemo(
    () => tokenizeArabicWithWaqf(arabicText),
    [arabicText],
  );
  const displayedTjWords =
    settings.tajweedEnabled && displayedVerse
      ? getTjVerseWords(displayedVerse.surah, displayedVerse.ayah)
      : null;
  const useBesmeleTajweed = Boolean(
    settings.tajweedEnabled && tjBesmele && tjBesmele.length > 0 && Object.keys(tjRules).length > 0,
  );
  const useVerseTajweed = Boolean(
    settings.tajweedEnabled &&
      displayedTjWords &&
      displayedTjWords.length > 0 &&
      Object.keys(tjRules).length > 0,
  );

  // Deterministik Tek Geçişli Otomatik Punto Hesabı (Akıllı Tahta & Salon Tipografisi)
  const fontMetrics = useMemo(() => {
    const arLen = arabicText.length;
    const trLen = mealText.length;
    const hFactor = clamp(viewport.h / 740, 0.78, 1.32);
    const wFactor = clamp(viewport.w / 1220, 0.74, 1.28);
    const baseScale = Math.min(hFactor, wFactor);
    const scale = showBesmele && contentMode === 'both' ? baseScale * 0.92 : baseScale;

    let arPx = 50;
    let arLine = 1.94;
    let trPx = 24;
    let trLine = 1.54;

    if (contentMode === 'ar') {
      if (arLen <= 90) {
        arPx = 72;
        arLine = 1.98;
      } else if (arLen <= 160) {
        arPx = 62;
        arLine = 1.94;
      } else if (arLen <= 250) {
        arPx = 54;
        arLine = 1.9;
      } else if (arLen <= 380) {
        arPx = 44;
        arLine = 1.86;
      } else if (arLen <= 560) {
        arPx = 36;
        arLine = 1.82;
      } else {
        arPx = 29;
        arLine = 1.76;
      }
    } else if (contentMode === 'meal') {
      if (trLen > 650) {
        trPx = 21;
        trLine = 1.48;
      } else if (trLen > 420) {
        trPx = 25;
        trLine = 1.52;
      } else if (trLen > 220) {
        trPx = 31;
        trLine = 1.56;
      } else if (trLen > 110) {
        trPx = 38;
        trLine = 1.54;
      } else {
        trPx = 46;
        trLine = 1.5;
      }
    } else {
      // 'both' — Arapça öncelikli punto kademeleri (uzun mealde yalnızca hafif dikey denge katsayısı)
      if (arLen <= 90) {
        arPx = 58;
        arLine = 1.98;
      } else if (arLen <= 160) {
        arPx = 50;
        arLine = 1.94;
      } else if (arLen <= 250) {
        arPx = 44;
        arLine = 1.9;
      } else if (arLen <= 380) {
        arPx = 36;
        arLine = 1.86;
      } else if (arLen <= 560) {
        arPx = 30;
        arLine = 1.82;
      } else {
        arPx = 25;
        arLine = 1.76;
      }

      if (trLen > 560) {
        arPx *= 0.9;
      } else if (trLen > 380) {
        arPx *= 0.94;
      }

      if (trLen <= 110) {
        trPx = 27;
        trLine = 1.56;
      } else if (trLen <= 220) {
        trPx = 24;
        trLine = 1.54;
      } else if (trLen <= 380) {
        trPx = 21;
        trLine = 1.5;
      } else if (trLen <= 560) {
        trPx = 19;
        trLine = 1.46;
      } else {
        trPx = 17;
        trLine = 1.42;
      }
    }

    const arMaxPx = contentMode === 'ar' ? 92 : 80;
    const effectiveScale = scale * presFontScale;
    const effectiveBaseScale = baseScale * presFontScale;

    return {
      arSize: `${Math.round(clamp(arPx * effectiveScale, 20, arMaxPx))}px`,
      arLine,
      trSize: `${Math.round(clamp(trPx * effectiveScale, 14, 54))}px`,
      trLine,
      besmeleArSize: `${Math.round(clamp(38 * effectiveBaseScale, 22, 54))}px`,
      besmeleTrSize: `${Math.round(clamp(20 * effectiveBaseScale, 14, 30))}px`,
    };
  }, [
    arabicText.length,
    mealText.length,
    contentMode,
    viewport.w,
    viewport.h,
    showBesmele,
    presFontScale,
  ]);

  if (!isOpen) return null;

  const palette = THEME_PALETTES[presTheme];
  const isAudioRunning = audioState.status !== 'idle';
  const isPlaying = audioState.status === 'playing';
  const isLoading = audioState.status === 'loading';
  const isPaused = audioState.status === 'paused';
  const isAudioActive = isPlaying || isLoading;
  const isAudioActiveOnVerse =
    isAudioActive &&
    displayedVerse !== null &&
    audioState.currentAyahId === displayedVerse.id;
  const isBesmelePhase = audioState.activePhase === 'besmele';
  const isWordSyncActive = settings.wordSyncEnabled && audioState.isWordSyncActive;
  const isBesmeleHighlighted = isAudioActiveOnVerse && isBesmelePhase;
  const isArabicHighlighted = isAudioActiveOnVerse && audioState.activePhase === 'ar';
  const suppressBesmeleFill = isBesmeleHighlighted && isWordSyncActive;
  const suppressArabicFill = isArabicHighlighted && isWordSyncActive;
  const isLightTheme = presTheme === 'cream' || presTheme === 'light';
  const presTajweedTheme: ThemeMode =
    presTheme === 'cream' ? 'cream' : presTheme === 'light' ? 'light' : 'dark';
  const karaokeThemeClass = isLightTheme
    ? 'presentation-karaoke-light'
    : 'presentation-karaoke-dark';
  const softArabicPlayingBg = isLightTheme ? 'rgba(13, 148, 136, 0.10)' : palette.accentSoft;
  const darkArabicLegibilityShadow = !isLightTheme ? '0 1px 6px rgba(0, 0, 0, 0.38)' : undefined;

  const rawBesmeleWordIdx =
    isBesmeleHighlighted &&
    isWordSyncActive &&
    displayedVerse &&
    wordSync.activeWordIndex !== null &&
    wordSync.phase === 'besmele' &&
    wordSync.surah === displayedVerse.surah
      ? wordSync.activeWordIndex
      : null;

  const rawVerseWordIdx =
    isArabicHighlighted &&
    isWordSyncActive &&
    displayedVerse &&
    wordSync.activeWordIndex !== null &&
    wordSync.phase === 'ar' &&
    wordSync.surah === displayedVerse.surah &&
    wordSync.ayah === displayedVerse.ayah
      ? wordSync.activeWordIndex
      : null;
  const isMealAudioFlowActive =
    isAudioActiveOnVerse &&
    (audioState.activePhase === 'meal' ||
      audioPrefs.mode === 'meal' ||
      audioPrefs.mode === 'ar_then_meal');
  const activeSpokenMeal = resolveSpokenMealInfo(
    audioState.activePhase === 'meal' ? audioState.activeSourceKey : audioPrefs.mealAudioSource,
    manifest,
  );
  const isPrimaryMealHighlighted =
    isAudioActiveOnVerse &&
    isDisplayedMealMatchingAudio({
      displayedMealId: primaryMeal.id,
      activePhase: audioState.activePhase,
      activeSourceKey: audioState.activeSourceKey,
      manifest,
    });
  const isSecondaryMealHighlighted =
    isAudioActiveOnVerse &&
    isDual &&
    isDisplayedMealMatchingAudio({
      displayedMealId: secondaryMeal.id,
      activePhase: audioState.activePhase,
      activeSourceKey: audioState.activeSourceKey,
      manifest,
    });
  const besmeleTrText = primaryMeal.id === 'm2' ? besmele.dib : besmele.tdv;

  const currentIdx = displayedVerse ? verses.findIndex((v) => v.id === displayedVerse.id) : -1;
  const canPrev = isAudioRunning ? audioState.canGoPrev : currentIdx > 0;
  const canNext = isAudioRunning
    ? audioState.canGoNext
    : currentIdx >= 0 && currentIdx < verses.length - 1;

  const handlePrev = () => {
    sfxService.play('click');
    if (isAudioActive) {
      audioQueueService.prevVerse(true);
    } else if (isPaused || audioState.status === 'error') {
      audioQueueService.prevVerse(false);
    } else if (currentIdx > 0) {
      setManualIndex(currentIdx - 1);
    }
  };

  const handleNext = () => {
    sfxService.play('click');
    if (isAudioActive) {
      audioQueueService.nextVerse(true);
    } else if (isPaused || audioState.status === 'error') {
      audioQueueService.nextVerse(false);
    } else if (currentIdx >= 0 && currentIdx < verses.length - 1) {
      setManualIndex(currentIdx + 1);
    }
  };

  const handleSelectPickerVerse = (verse: CombinedVerse) => {
    sfxService.play('click');
    setIsAyahPickerOpen(false);
    const idxInProps = verses.findIndex((v) => v.id === verse.id);
    if (idxInProps >= 0) {
      setManualIndex(idxInProps);
    }

    if (audioState.status === 'idle') {
      return;
    }

    if (audioState.status === 'paused' || audioState.status === 'error') {
      audioQueueService.syncPausedSelection(verse, meta, pickerVerses);
      return;
    }

    if (onStartAudioFromActive) {
      onStartAudioFromActive(verse);
    } else if (manifest && meta) {
      void audioQueueService.jumpToSurahAyah(
        verse.surah,
        verse.ayah,
        manifest,
        meta,
        audioPrefs,
      );
    }
  };

  const handleMainTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1 || isAyahPickerOpen || isSettingsPopoverOpen) {
      swipeStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleMainTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0 && canNext) {
        handleNext();
      } else if (dx > 0 && canPrev) {
        handlePrev();
      }
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

  const handlePlayMealQuick = () => {
    sfxService.play('click');
    if (isAudioRunning && audioPrefs.mode === 'meal') {
      audioQueueService.togglePlayPause();
      return;
    }
    updateAudioPrefs({ mode: 'meal' });
    if (displayedVerse) {
      if (onStartMealAudioFromActive) {
        onStartMealAudioFromActive(displayedVerse);
      } else if (onStartAudioFromActive) {
        onStartAudioFromActive(displayedVerse);
      }
    }
  };

  const isPageScope =
    scopeMode === 'page' ||
    (scopeMode !== 'surah' && Boolean(surahMeta && verses.length < surahMeta.ayahCount));
  const footerLocationText =
    displayedVerse && currentIdx >= 0
      ? isPageScope
        ? `Sayfa ${displayedVerse.page} · ${currentIdx + 1}/${verses.length}${
            surahMeta ? ` (${surahMeta.shortNameTr} ${displayedVerse.ayah}/${surahMeta.ayahCount})` : ''
          }`
        : `${surahMeta?.shortNameTr ?? `${displayedVerse.surah}. Sure`} · ${displayedVerse.ayah} / ${
            surahMeta?.ayahCount ?? verses.length
          }. Ayet`
      : 'Hazır';

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
        background: palette.bg,
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
        {/* Sol: Sure & Ayet Hızlı Seçici Başlığı (Tek satır, taşmasız) */}
        <div ref={ayahPickerRef} className="relative flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <span
            className="w-8 h-8 rounded-xl hidden sm:flex items-center justify-center shrink-0"
            style={{ backgroundColor: palette.accentSoft, color: palette.accent }}
          >
            <MonitorPlay className="w-4 h-4" />
          </span>
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsSettingsPopoverOpen(false);
              setIsAyahPickerOpen((v) => !v);
            }}
            disabled={pickerVerses.length === 0}
            aria-expanded={isAyahPickerOpen}
            aria-haspopup="listbox"
            aria-label="Ayet seçiciyi aç"
            title="Hızlı ayet geçişi için dokunun"
            className="min-w-0 max-w-full min-h-[40px] px-2 -ml-1 rounded-xl border flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-colors touch-manipulation disabled:cursor-default"
            style={{
              borderColor: isAyahPickerOpen ? palette.accent : 'transparent',
              backgroundColor: isAyahPickerOpen ? palette.accentSoft : 'transparent',
              color: palette.text,
            }}
          >
            <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
              {displayedVerse
                ? `${formatSurahTitle(surahMeta?.nameTr, displayedVerse.surah)} · ${displayedVerse.ayah}. Ayet`
                : 'Sunum Modu'}
            </h2>
            {pickerVerses.length > 1 && (
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
                  isAyahPickerOpen ? 'rotate-180' : ''
                }`}
                style={{ color: palette.accent }}
              />
            )}
            {surahMeta?.nameAr && (
              <span
                className="arabic-title text-base hidden md:inline shrink-0"
                style={{ color: palette.accent }}
                dir="rtl"
              >
                {formatSafeArabicTitle(surahMeta.nameAr)}
              </span>
            )}
          </button>

          {isAyahPickerOpen && pickerVerses.length > 0 && (
            <>
              <div
                aria-hidden="true"
                onClick={() => setIsAyahPickerOpen(false)}
                className="fixed inset-0 z-40 bg-black/35 md:bg-transparent"
              />
              <div
                role="dialog"
                aria-label="Hızlı ayet seçici"
                className="fixed left-3 right-3 top-16 sm:absolute sm:left-0 sm:right-auto sm:top-12 sm:w-[360px] md:w-[400px] max-h-[60dvh] overflow-y-auto rounded-2xl border p-3.5 shadow-2xl z-50 space-y-3 text-left"
                style={{
                  backgroundColor: palette.popoverBg,
                  borderColor: palette.border,
                  color: palette.text,
                }}
              >
                <div
                  className="flex items-center justify-between gap-2 pb-2 border-b"
                  style={{ borderColor: palette.border }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold truncate">Hızlı Ayet Geçişi</p>
                    <p className="text-[11px] font-medium truncate" style={{ color: palette.muted }}>
                      {pickerVerses.length} ayet listeleniyor
                      {isPaused ? ' · Duraklatılmış konum' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAyahPickerOpen(false)}
                    aria-label="Ayet seçiciyi kapat"
                    className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer"
                    style={{
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                      color: palette.muted,
                    }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  {pickerSurahGroups.map((group) => {
                    const groupMeta = surahMap.get(group.surahNo);
                    return (
                      <div key={group.surahNo} className="space-y-1.5">
                        {pickerSurahGroups.length > 1 && (
                          <p
                            className="text-[11px] font-extrabold uppercase tracking-wider"
                            style={{ color: palette.muted }}
                          >
                            {formatSurahTitle(groupMeta?.nameTr, group.surahNo)}
                          </p>
                        )}
                        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                          {group.verses.map((v) => {
                            const isSelected = displayedVerse?.id === v.id;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => handleSelectPickerVerse(v)}
                                aria-current={isSelected ? 'true' : undefined}
                                aria-label={`${formatSurahTitle(groupMeta?.nameTr, v.surah)} ${v.ayah}. Ayet`}
                                className="min-h-[38px] rounded-xl border text-xs font-extrabold tabular-nums flex items-center justify-center cursor-pointer transition-all active:scale-95 touch-manipulation"
                                style={{
                                  backgroundColor: isSelected
                                    ? palette.accent
                                    : palette.surface,
                                  borderColor: isSelected ? palette.accent : palette.border,
                                  color: isSelected ? palette.accentText : palette.text,
                                }}
                              >
                                {v.ayah}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sağ: Renkli Tecvit + Kelime Takibi (md+) + Tema + ⚙ Görünüm & Ses Popover + Tam Ekran + Çıkış */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Hızlı Kontrol 1: Renkli Tecvit (Masaüstü/Tablet üst şerit; mobilde Görünüm & Ses çekmecesinde) */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.tajweedEnabled}
            aria-label="Renkli Tecvit"
            title={settings.tajweedEnabled ? 'Renkli Tecvit: Açık' : 'Renkli Tecvit: Kapalı'}
            onClick={() => {
              sfxService.play('click');
              const next = !settings.tajweedEnabled;
              updateSettings({ tajweedEnabled: next });
              if (!next) setShowDiacriticNote(false);
            }}
            className="hidden md:flex min-w-[40px] min-h-[40px] px-2 sm:px-2.5 rounded-xl border text-xs font-bold items-center justify-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
            style={{
              borderColor: settings.tajweedEnabled ? palette.accent : palette.border,
              backgroundColor: settings.tajweedEnabled ? palette.accentSoft : 'transparent',
              color: settings.tajweedEnabled ? palette.accent : palette.muted,
            }}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">Tecvit</span>
          </button>

          {/* Renkli Tecvit Harekeleme Bilgi Notu Aç/Kapa */}
          {settings.tajweedEnabled && (
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowDiacriticNote((v) => !v);
              }}
              aria-expanded={showDiacriticNote}
              aria-label="Medine Mushafı Harekeleme Notu"
              title="Medine Mushafı Harekeleme Notu"
              className="hidden md:flex min-w-[40px] min-h-[40px] px-2 sm:px-2.5 rounded-xl border text-xs font-bold items-center justify-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
              style={{
                borderColor: showDiacriticNote ? palette.accent : palette.border,
                backgroundColor: showDiacriticNote ? palette.accentSoft : 'transparent',
                color: showDiacriticNote ? palette.accent : palette.muted,
              }}
            >
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline whitespace-nowrap">Harekeleme Notu</span>
            </button>
          )}

          {/* Hızlı Kontrol 2: Kelime Takibi (Karaoke) (Masaüstü/Tablet üst şerit; mobilde çekmecede) */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.wordSyncEnabled}
            aria-label="Kelime Takibi"
            title={settings.wordSyncEnabled ? 'Kelime Takibi: Açık' : 'Kelime Takibi: Kapalı'}
            onClick={() => {
              sfxService.play('click');
              updateSettings({ wordSyncEnabled: !settings.wordSyncEnabled });
            }}
            className="hidden md:flex min-w-[40px] min-h-[40px] px-2 sm:px-2.5 rounded-xl border text-xs font-bold items-center justify-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
            style={{
              borderColor: settings.wordSyncEnabled ? palette.accent : palette.border,
              backgroundColor: settings.wordSyncEnabled ? palette.accentSoft : 'transparent',
              color: settings.wordSyncEnabled ? palette.accent : palette.muted,
            }}
          >
            <AudioLines className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">Kelime Takibi</span>
          </button>

          {/* Hızlı Kontrol 3: Sunum Teması Değiştirici */}
          <button
            type="button"
            onClick={cyclePresTheme}
            title={`Sunum Teması: ${palette.label} (Değiştirmek için dokunun)`}
            aria-label={`Sunum temasını değiştir (${palette.label})`}
            className="min-w-[40px] min-h-[40px] px-2 sm:px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
            style={{
              borderColor: palette.border,
              backgroundColor: 'transparent',
              color: palette.text,
            }}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" style={{ color: palette.accent }} />
            <span className="hidden xl:inline whitespace-nowrap">{palette.label}</span>
          </button>

          <div ref={settingsPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsAyahPickerOpen(false);
                setIsSettingsPopoverOpen((v) => !v);
              }}
              aria-expanded={isSettingsPopoverOpen}
              aria-label="Görünüm ve ses ayarları"
              className="min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
              style={{
                borderColor: isSettingsPopoverOpen ? palette.accent : palette.border,
                backgroundColor: isSettingsPopoverOpen
                  ? palette.accentSoft
                  : isLightTheme
                    ? 'rgba(15, 23, 42, 0.05)'
                    : 'rgba(0,0,0,0.14)',
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
                  className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl max-h-[82dvh] overflow-y-auto p-4 pb-6 border-t shadow-2xl space-y-3.5 text-left md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-11 md:w-[320px] md:max-w-[calc(100vw-2rem)] md:max-h-[80dvh] md:rounded-2xl md:border md:p-3.5"
                  style={{
                    backgroundColor: palette.popoverBg,
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

                  {/* Mobil Hızlı Anahtarlar: Renkli Tecvit & Kelime Takibi */}
                  <div className="md:hidden space-y-1.5">
                    <p
                      className="text-[10px] font-extrabold uppercase tracking-wider"
                      style={{ color: palette.muted }}
                    >
                      Hızlı Kontroller
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.tajweedEnabled}
                        onClick={() => {
                          sfxService.play('click');
                          const next = !settings.tajweedEnabled;
                          updateSettings({ tajweedEnabled: next });
                          if (!next) setShowDiacriticNote(false);
                        }}
                        className="min-h-[40px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
                        style={{
                          borderColor: settings.tajweedEnabled ? palette.accent : palette.border,
                          backgroundColor: settings.tajweedEnabled
                            ? palette.accentSoft
                            : palette.surface,
                          color: settings.tajweedEnabled ? palette.accent : palette.text,
                        }}
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Renkli Tecvit</span>
                      </button>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.wordSyncEnabled}
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ wordSyncEnabled: !settings.wordSyncEnabled });
                        }}
                        className="min-h-[40px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
                        style={{
                          borderColor: settings.wordSyncEnabled ? palette.accent : palette.border,
                          backgroundColor: settings.wordSyncEnabled
                            ? palette.accentSoft
                            : palette.surface,
                          color: settings.wordSyncEnabled ? palette.accent : palette.text,
                        }}
                      >
                        <AudioLines className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Kelime Takibi</span>
                      </button>
                    </div>

                    {settings.tajweedEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setShowDiacriticNote((v) => !v);
                          setIsSettingsPopoverOpen(false);
                        }}
                        className="w-full min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        style={{
                          borderColor: showDiacriticNote ? palette.accent : palette.border,
                          backgroundColor: showDiacriticNote
                            ? palette.accentSoft
                            : palette.surface,
                          color: showDiacriticNote ? palette.accent : palette.muted,
                        }}
                      >
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span>Medine Mushafı Harekeleme Notu</span>
                      </button>
                    )}
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
                            color: active ? palette.accentText : palette.text,
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sunum Yazı Ölçeği (%85 - %130) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="text-[10px] font-extrabold uppercase tracking-wider"
                      style={{ color: palette.muted }}
                    >
                      Sunum Yazı Ölçeği
                    </p>
                    {presFontScale !== 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setPresFontScale(1);
                        }}
                        className="text-[10px] font-bold cursor-pointer hover:underline"
                        style={{ color: palette.accent }}
                      >
                        Sıfırla
                      </button>
                    )}
                  </div>
                  <div
                    className="grid grid-cols-[40px_1fr_40px] gap-1 p-1 rounded-xl border"
                    style={{ borderColor: palette.border, backgroundColor: palette.surface }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setPresFontScale(presFontScale - PRESENTATION_FONT_SCALE_STEP);
                      }}
                      disabled={presFontScale <= PRESENTATION_FONT_SCALE_MIN}
                      aria-label="Sunum yazı ölçeğini küçült"
                      title="Yazıyı küçült"
                      className="min-h-[34px] rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-35 transition-colors touch-manipulation"
                      style={{ color: palette.text }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setPresFontScale(1);
                      }}
                      title="Varsayılan ölçeğe (%100) sıfırla"
                      aria-label={`Sunum yazı ölçeği yüzde ${Math.round(presFontScale * 100)} (sıfırlamak için dokunun)`}
                      className="min-h-[34px] rounded-lg text-xs font-extrabold tabular-nums flex items-center justify-center cursor-pointer transition-colors touch-manipulation"
                      style={{
                        backgroundColor:
                          presFontScale !== 1 ? palette.accentSoft : 'transparent',
                        color: presFontScale !== 1 ? palette.accent : palette.text,
                      }}
                    >
                      %{Math.round(presFontScale * 100)}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setPresFontScale(presFontScale + PRESENTATION_FONT_SCALE_STEP);
                      }}
                      disabled={presFontScale >= PRESENTATION_FONT_SCALE_MAX}
                      aria-label="Sunum yazı ölçeğini büyüt"
                      title="Yazıyı büyüt"
                      className="min-h-[34px] rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-35 transition-colors touch-manipulation"
                      style={{ color: palette.text }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
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

                {/* Sunum Teması (4 Sınıf & Akıllı Tahta Teması) */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: palette.muted }}>
                    Sunum Teması
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESENTATION_THEME_ORDER.map((t) => {
                      const active = presTheme === t;
                      const def = THEME_PALETTES[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setPresTheme(t);
                          }}
                          className="min-h-[36px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer inline-flex items-center gap-2 text-left"
                          style={{
                            borderColor: active ? palette.accent : palette.border,
                            backgroundColor: active ? palette.accentSoft : palette.surface,
                            color: active ? palette.accent : palette.text,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="w-3.5 h-3.5 rounded-full border shrink-0"
                            style={{
                              backgroundColor: def.swatch,
                              borderColor: 'rgba(148, 163, 184, 0.55)',
                            }}
                          />
                          <span className="truncate">{def.label}</span>
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
            className="min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center cursor-pointer touch-manipulation"
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
            className="min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
            style={{
              borderColor: palette.border,
              backgroundColor: 'rgba(239, 68, 68, 0.14)',
              color: isLightTheme ? '#B91C1C' : '#FCA5A5',
            }}
          >
            <X className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">Çıkış</span>
          </button>
        </div>
      </header>

      {/* Renkli Tecvit Açıkken Açılır/Kapanır Tam Genişlik Harekeleme Notu */}
      {settings.tajweedEnabled && showDiacriticNote && (
        <div
          className="w-full max-w-full min-w-0 px-4 sm:px-6 py-2.5 border-b shrink-0"
          style={{
            backgroundColor: palette.surface,
            borderColor: palette.border,
          }}
        >
          <div className="w-full max-w-5xl mx-auto min-w-0 flex items-start gap-2.5">
            <Info
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: palette.accent }}
            />
            <p
              className="w-full max-w-full min-w-0 flex-1 whitespace-normal break-words text-xs leading-relaxed text-left"
              style={{ color: palette.text }}
            >
              {TAJWEED_DIACRITIC_NOTE}
            </p>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowDiacriticNote(false);
              }}
              aria-label="Harekeleme notunu gizle"
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-opacity hover:opacity-80"
              style={{ color: palette.muted }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Orta Sahne: Kırpışmasız, Akıllı Tahta & Salon İçin Geniş Ayet & Meal Alanı (Yatay Kaydırma Destekli) */}
      <main
        onTouchStart={handleMainTouchStart}
        onTouchEnd={handleMainTouchEnd}
        className="flex-1 min-h-0 flex items-center justify-center px-4 sm:px-8 lg:px-10 xl:px-14 py-3 overflow-y-auto"
      >
        {displayedVerse ? (
          <div className="w-full max-w-6xl xl:max-w-[88vw] mx-auto flex flex-col items-center justify-center gap-3 sm:gap-4 text-center transition-opacity duration-200">
            {/* Yalnızca Tilâvet Secdesi, Aktif Ses Fazı, Duraklatıldı Bilgisi veya Ses Hata Bildirimi */}
            {(isSajdah || isPlaying || isLoading || isPaused || Boolean(audioState.errorMessage)) && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {isSajdah && (
                  <span
                    className="px-3.5 py-1 rounded-full text-xs sm:text-sm font-extrabold flex items-center gap-1.5 border shadow-sm"
                    style={{
                      backgroundColor: isLightTheme
                        ? 'rgba(217, 119, 6, 0.16)'
                        : 'rgba(251, 191, 36, 0.22)',
                      borderColor: isLightTheme
                        ? 'rgba(180, 83, 9, 0.45)'
                        : 'rgba(251, 191, 36, 0.6)',
                      color: isLightTheme ? '#92400E' : '#FDE68A',
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
                        ? `Ses: ${activeSpokenMeal?.label ?? 'Sesli Meal'}`
                        : 'Arapça Tilavet akıyor'}
                  </span>
                )}

                {isPaused && (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border"
                    style={{
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                      color: palette.muted,
                    }}
                  >
                    <Pause className="w-3.5 h-3.5 shrink-0" style={{ color: palette.accent }} />
                    <span>Duraklatıldı · Devam etmek için &apos;Devam Et&apos;e basın</span>
                  </span>
                )}

                {audioState.errorMessage && (
                  <span
                    role="alert"
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border max-w-xl text-left"
                    style={{
                      backgroundColor: 'var(--state-danger-bg)',
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      color: 'var(--state-danger-text)',
                    }}
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{audioState.errorMessage}</span>
                    <button
                      type="button"
                      onClick={() => audioQueueService.clearError()}
                      aria-label="Hata uyarısını kapat"
                      className="ml-1 opacity-75 hover:opacity-100 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Sure Başı Besmelesi (1. Ayette — Fâtiha ve Tevbe hariç) */}
            {showBesmele && (contentMode === 'both' || contentMode === 'ar') && (
              <div
                className={`w-fit max-w-full mx-auto rounded-2xl px-8 sm:px-12 py-2.5 border transition-all duration-200 ${karaokeThemeClass}`}
                style={{
                  backgroundColor:
                    isBesmeleHighlighted && !suppressBesmeleFill
                      ? softArabicPlayingBg
                      : 'transparent',
                  borderColor:
                    isBesmeleHighlighted && !suppressBesmeleFill
                      ? palette.accent
                      : palette.border,
                  boxShadow:
                    isBesmeleHighlighted && !suppressBesmeleFill
                      ? `0 0 0 2px ${palette.accentSoft}, 0 8px 24px -10px rgba(0,0,0,0.35)`
                      : 'none',
                }}
              >
                <p
                  dir="rtl"
                  lang="ar"
                  className={`${useBesmeleTajweed ? 'arabic-tajweed' : 'arabic-text'} text-center leading-relaxed`}
                  style={{
                    fontSize: fontMetrics.besmeleArSize,
                    color:
                      isBesmeleHighlighted && !suppressBesmeleFill
                        ? palette.accent
                        : palette.arabicColor,
                    textShadow: darkArabicLegibilityShadow,
                  }}
                >
                  {useBesmeleTajweed && tjBesmele ? (
                    <TajweedText
                      words={tjBesmele}
                      rules={tjRules}
                      theme={presTajweedTheme}
                      activeWordIndex={
                        rawBesmeleWordIdx !== null
                          ? mapQulWordIndexToDisplay(
                              rawBesmeleWordIdx,
                              wordSync.qulWordCount,
                              tjBesmele.length,
                            )
                          : null
                      }
                      surahNo={1}
                      ayahNo={1}
                      onWordClick={(wIdx, total) => {
                        sfxService.play('click');
                        wordAudioService.playWordAudio(1, 1, wIdx, total);
                      }}
                    />
                  ) : (
                    (() => {
                      const mappedBesmeleIdx =
                        rawBesmeleWordIdx !== null
                          ? mapQulWordIndexToDisplay(
                              rawBesmeleWordIdx,
                              wordSync.qulWordCount,
                              besmelePlainTokens.length,
                            )
                          : null;
                      return besmelePlainTokens.map((token, idx) => {
                        const { body, waqf } = splitTrailingWaqf(token);
                        const isActiveWord = mappedBesmeleIdx !== null && idx + 1 === mappedBesmeleIdx;
                        return (
                          <React.Fragment key={idx}>
                            <span
                              title="Kelimeyi dinlemek için dokunun"
                              onClick={(e) => {
                                e.stopPropagation();
                                sfxService.play('click');
                                wordAudioService.playWordAudio(
                                  1,
                                  1,
                                  idx + 1,
                                  besmelePlainTokens.length,
                                );
                              }}
                              className={
                                isActiveWord
                                  ? 'karaoke-word-active cursor-pointer'
                                  : 'cursor-pointer'
                              }
                            >
                              {body}
                            </span>
                            {waqf && <WaqfMarkSpan waqf={waqf} />}
                            {idx < besmelePlainTokens.length - 1 ? ' ' : null}
                          </React.Fragment>
                        );
                      });
                    })()
                  )}
                </p>
              </div>
            )}

            {showBesmele && contentMode === 'meal' && (
              <div
                className="w-fit max-w-full mx-auto rounded-2xl px-8 sm:px-12 py-2 border transition-all duration-200"
                style={{
                  backgroundColor: isBesmeleHighlighted ? softArabicPlayingBg : 'transparent',
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

            {/* Arapça Metin (Normal Mushaf Hattı veya Renkli Tecvit + Kelime Takibi + Dokun-Dinle) */}
            {(contentMode === 'both' || contentMode === 'ar') && (
              <div
                dir="rtl"
                lang="ar"
                className={`${useVerseTajweed ? 'arabic-tajweed' : 'arabic-text'} ${karaokeThemeClass} w-full text-center px-2 sm:px-4 py-1.5 rounded-2xl border transition-all duration-200 ${
                  isBesmeleHighlighted ? 'opacity-70' : 'opacity-100'
                }`}
                style={{
                  fontSize: fontMetrics.arSize,
                  lineHeight: fontMetrics.arLine,
                  color: palette.arabicColor,
                  textShadow: darkArabicLegibilityShadow,
                  backgroundColor:
                    isArabicHighlighted && !suppressArabicFill
                      ? softArabicPlayingBg
                      : 'transparent',
                  borderColor:
                    isArabicHighlighted && !suppressArabicFill ? palette.accent : 'transparent',
                }}
              >
                {useVerseTajweed && displayedTjWords ? (
                  <TajweedText
                    words={displayedTjWords}
                    rules={tjRules}
                    theme={presTajweedTheme}
                    activeWordIndex={
                      rawVerseWordIdx !== null
                        ? mapQulWordIndexToDisplay(
                            rawVerseWordIdx,
                            wordSync.qulWordCount,
                            displayedTjWords.length,
                          )
                        : null
                    }
                    surahNo={displayedVerse.surah}
                    ayahNo={displayedVerse.ayah}
                    onWordClick={(wIdx, total) => {
                      sfxService.play('click');
                      wordAudioService.playWordAudio(
                        displayedVerse.surah,
                        displayedVerse.ayah,
                        wIdx,
                        total,
                      );
                    }}
                  />
                ) : (
                  (() => {
                    const mappedVerseIdx =
                      rawVerseWordIdx !== null
                        ? mapQulWordIndexToDisplay(
                            rawVerseWordIdx,
                            wordSync.qulWordCount,
                            versePlainTokens.length,
                          )
                        : null;
                    return versePlainTokens.map((token, idx) => {
                      const { body, waqf } = splitTrailingWaqf(token);
                      const isActiveWord = mappedVerseIdx !== null && idx + 1 === mappedVerseIdx;
                      return (
                        <React.Fragment key={idx}>
                          <span
                            title="Kelimeyi dinlemek için dokunun"
                            onClick={(e) => {
                              e.stopPropagation();
                              sfxService.play('click');
                              wordAudioService.playWordAudio(
                                displayedVerse.surah,
                                displayedVerse.ayah,
                                idx + 1,
                                versePlainTokens.length,
                              );
                            }}
                            className={
                              isActiveWord
                                ? 'karaoke-word-active cursor-pointer'
                                : 'cursor-pointer'
                            }
                          >
                            {body}
                          </span>
                          {waqf && <WaqfMarkSpan waqf={waqf} />}
                          {idx < versePlainTokens.length - 1 ? ' ' : null}
                        </React.Fragment>
                      );
                    });
                  })()
                )}
                {isSajdah && (
                  <span
                    title="Tilâvet Secdesi Ayeti"
                    className="inline-flex items-center justify-center mx-1.5 text-[0.62em] font-extrabold px-2 py-0.5 rounded-lg align-middle border"
                    style={{
                      backgroundColor: isLightTheme
                        ? 'rgba(217, 119, 6, 0.16)'
                        : 'rgba(251, 191, 36, 0.22)',
                      borderColor: isLightTheme
                        ? 'rgba(180, 83, 9, 0.45)'
                        : 'rgba(251, 191, 36, 0.55)',
                      color: isLightTheme ? '#92400E' : '#FDE68A',
                      fontFamily: 'var(--font-turkish)',
                    }}
                  >
                    ۩
                  </span>
                )}
                <span
                  className="arabic-text inline-block mx-2.5 text-[0.82em] align-middle select-none font-normal"
                  style={{
                    backgroundColor: 'transparent',
                    color: palette.ayahMarkerColor,
                  }}
                >
                  {'\uFD3F'}
                  {toArabicIndicDigits(displayedVerse.ayah)}
                  {'\uFD3E'}
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

            {/* Türkçe Meal (Tek veya Çift Meal — Yalnızca Sesle Eşleşen Meal Vurgulanır) */}
            {(contentMode === 'both' || contentMode === 'meal') && (
              <div
                className={`w-full max-w-5xl mx-auto ${
                  isDual && secondaryMealText
                    ? 'grid grid-cols-1 md:grid-cols-2 gap-3 text-left'
                    : ''
                } ${isBesmeleHighlighted ? 'opacity-70' : 'opacity-100'}`}
              >
                {(() => {
                  const basePrimarySize =
                    isDual && secondaryMealText
                      ? Math.max(14, Math.round(parseInt(fontMetrics.trSize, 10) * 0.84))
                      : parseInt(fontMetrics.trSize, 10);
                  const primaryPres = getMealTextPresentation(primaryMeal, basePrimarySize);
                  return (
                    <div
                      className="px-4 py-2.5 rounded-2xl border transition-all duration-200"
                      style={{
                        backgroundColor: isPrimaryMealHighlighted ? palette.accentSoft : 'transparent',
                        borderColor: isPrimaryMealHighlighted
                          ? palette.accent
                          : isDual && secondaryMealText
                            ? palette.border
                            : 'transparent',
                      }}
                    >
                      <p
                        dir={primaryPres.dir}
                        lang={primaryPres.lang}
                        className={
                          primaryPres.isRtl
                            ? `${isDual && secondaryMealText ? 'text-right' : 'text-center'} leading-[2.0]`
                            : `turkish-reading font-medium ${
                                isDual && secondaryMealText ? 'text-left' : 'text-center'
                              }`
                        }
                        style={{
                          fontSize: `${primaryPres.fontSizePx}px`,
                          fontFamily: primaryPres.fontFamily,
                          lineHeight: primaryPres.isRtl ? 2.0 : fontMetrics.trLine,
                          color: palette.text,
                        }}
                      >
                        {mealText}
                      </p>
                      <p
                        className={`mt-2.5 text-xs sm:text-sm font-semibold ${
                          isDual && secondaryMealText
                            ? primaryPres.isRtl
                              ? 'text-right'
                              : 'text-left'
                            : 'text-center'
                        }`}
                        style={{ color: palette.muted }}
                      >
                        <span>{primaryMeal.label}</span>
                        {isMealAudioFlowActive &&
                          activeSpokenMeal &&
                          activeSpokenMeal.mealId !== primaryMeal.id &&
                          (!isDual || activeSpokenMeal.mealId !== secondaryMeal.id) && (
                            <span className="opacity-80 font-normal">
                              {' '}
                              · (Seslendirilen: {activeSpokenMeal.label})
                            </span>
                          )}
                      </p>
                    </div>
                  );
                })()}

                {isDual && secondaryMealText && (() => {
                  const baseSecondarySize = Math.max(
                    14,
                    Math.round(parseInt(fontMetrics.trSize, 10) * 0.84),
                  );
                  const secondaryPres = getMealTextPresentation(secondaryMeal, baseSecondarySize);
                  return (
                    <div
                      className="px-4 py-2.5 rounded-2xl border transition-all duration-200"
                      style={{
                        backgroundColor: isSecondaryMealHighlighted
                          ? palette.accentSoft
                          : 'transparent',
                        borderColor: isSecondaryMealHighlighted ? palette.accent : palette.border,
                      }}
                    >
                      <p
                        dir={secondaryPres.dir}
                        lang={secondaryPres.lang}
                        className={
                          secondaryPres.isRtl
                            ? 'text-right leading-[2.0]'
                            : 'turkish-reading font-medium text-left'
                        }
                        style={{
                          fontSize: `${secondaryPres.fontSizePx}px`,
                          fontFamily: secondaryPres.fontFamily,
                          lineHeight: secondaryPres.isRtl ? 2.0 : fontMetrics.trLine,
                          color: palette.text,
                        }}
                      >
                        {secondaryMealText}
                      </p>
                      <p
                        className={`mt-2.5 text-xs sm:text-sm font-semibold ${
                          secondaryPres.isRtl ? 'text-right' : 'text-left'
                        }`}
                        style={{ color: palette.muted }}
                      >
                        <span>{secondaryMeal.label}</span>
                        {isSecondaryMealHighlighted && activeSpokenMeal && (
                          <span className="opacity-85 font-normal"> · (Seslendirilen)</span>
                        )}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          <p className="text-base font-semibold" style={{ color: palette.muted }}>
            Sunum için görüntülenecek ayet bulunamadı.
          </p>
        )}
      </main>

      {/* Sade Alt Kontrol Barı: Konum, ⏮ ▶/⏸ Sesli Meal ⏭ ve Hız (1x) */}
      <footer
        className="min-h-16 py-2 px-3 sm:px-6 border-t flex items-center justify-between gap-2 shrink-0 backdrop-blur-md"
        style={{
          backgroundColor: palette.surface,
          borderColor: palette.border,
        }}
      >
        {/* Sol: Bağlam Duyarlı Konum ve İlerleme Bilgisi */}
        <div
          className="text-[11px] sm:text-xs font-bold tabular-nums min-w-0 max-w-[38%] sm:max-w-none truncate"
          style={{ color: palette.muted }}
          title={footerLocationText}
        >
          {footerLocationText}
        </div>

        {/* Orta: Oynatma Kontrolleri + Hızlı Sesli Meal */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
            aria-label={isPlaying ? 'Duraklat' : isPaused ? 'Devam Et' : 'Dinle'}
            className="h-10 px-4 sm:px-5 rounded-xl font-extrabold flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-transform active:scale-95"
            style={{
              backgroundColor: palette.accent,
              color: palette.accentText,
            }}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
            <span className="text-xs sm:text-sm">
              {isPlaying ? 'Duraklat' : isPaused ? 'Devam Et' : 'Dinle'}
            </span>
          </button>

          <button
            type="button"
            onClick={handlePlayMealQuick}
            disabled={!displayedVerse}
            title="Türkçe Sesli Meal ile dinle"
            aria-label="Sesli Meal dinle"
            aria-pressed={isMealAudioFlowActive && audioPrefs.mode === 'meal'}
            className="h-10 px-3 sm:px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40"
            style={{
              backgroundColor:
                isMealAudioFlowActive && audioPrefs.mode === 'meal'
                  ? palette.accentSoft
                  : 'transparent',
              borderColor:
                isMealAudioFlowActive && audioPrefs.mode === 'meal'
                  ? palette.accent
                  : palette.border,
              color:
                isMealAudioFlowActive && audioPrefs.mode === 'meal'
                  ? palette.accent
                  : palette.text,
            }}
          >
            <Headphones className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Sesli Meal</span>
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

        {/* Sağ: Oynatma Hızı */}
        <div className="min-w-[52px] flex justify-end shrink-0">
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
