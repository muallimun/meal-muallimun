import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  ListPlus,
  LocateFixed,
  PanelRightClose,
  Play,
  Repeat,
  Scale,
  Sparkles,
  Star,
  StickyNote,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { AyahEndMarker } from '../../components/AyahEndMarker';
import { BOOKMARK_COLOR_STYLES } from '../../components/PageBookmarksDrawer';
import {
  MEALS_CATALOG,
  getMealTextPresentation,
  resolveMealBesmelePresentation,
  resolveSpokenMealInfo,
} from '../../config/mealsConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { useRukusData } from '../../hooks/useStudyReferenceData';
import { useTajweedData } from '../../hooks/useTajweedData';
import { audioQueueService } from '../../services/audioQueueService';
import { hasActiveBackStackEntries } from '../../services/backStackService';
import { hatimStorage } from '../../services/hatimStorage';
import { RukuMarkerBadge } from './StudyPopovers';
import { SyncedVerseArabic } from './SyncedArabicText';
import { SAJDAH_AYAH_IDS } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import {
  VERSE_NOTE_COLOR_STYLES,
  makeVerseNoteKey,
  verseNotesStorage,
} from '../../services/verseNotesStorage';
import { useAppStore } from '../../store/useAppStore';
import type {
  AppSettings,
  BesmeleInfo,
  CombinedVerse,
  MealVerse,
  MushafLayout,
  PageBundle,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import {
  formatSafeArabicTitle,
  formatSurahTitle,
  getArabicDensityMetrics,
} from '../../utils/arabicUtils';
import { DraggableVerseInspector } from './DraggableVerseInspector';
import type { LocationPickerTab } from './LocationPickerModal';

interface MushafPageViewProps {
  pageBundle: PageBundle;
  secondPageBundle?: PageBundle | null;
  mushafLayout?: MushafLayout;
  besmele: BesmeleInfo;
  settings: AppSettings;
  wordMode: WordMealMode;
  selectedVerseId: number | null;
  playingAyahId: number | null;
  autoScroll?: boolean;
  isAudioBarVisible?: boolean;
  isAudioBarExpanded?: boolean;
  isTajweedLegendVisible?: boolean;
  bookmarkedSet: Set<number>;
  isRefreshing?: boolean;
  onSelectVerse: (verse: CombinedVerse) => void;
  onChangePage: (nextPage: number) => void;
  onPlayFromVerse: (verse: CombinedVerse, singleAyahOnly?: boolean) => void;
  onPlayMealFromVerse: (verse: CombinedVerse) => void;
  onToggleBookmark: (ayahId: number) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenSurahInfo: (surah: SurahMeta) => void;
  onOpenLocationPicker?: (tab?: LocationPickerTab) => void;
  onToggleMobileImmersive?: () => void;
}

const ENDS_WITH_ARABIC_NUMERAL = /[\u0660-\u0669]\s*$/;

interface ScrollPaneOptions {
  bottomReservePx?: number;
  focusRatio?: number;
  behavior?: ScrollBehavior;
}

/**
 * Bağımsız kaydırılabilir panel içinde hedef öğeyi üstten ~%35 odaklı konuma
 * dış pencereyi sıçratmadan ve diğer panelin animasyonunu iptal etmeden kaydırır.
 */
function scrollTargetIntoPane(
  paneEl: HTMLElement | null,
  targetEl: HTMLElement | null,
  options?: ScrollPaneOptions,
): boolean {
  if (!paneEl || !targetEl) return false;
  const maxScroll = paneEl.scrollHeight - paneEl.clientHeight;
  if (maxScroll <= 2) return false;

  const bottomReserve = options?.bottomReservePx ?? 24;
  const focusRatio = options?.focusRatio ?? 0.35;
  const paneRect = paneEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const targetTopInPane = targetRect.top - paneRect.top + paneEl.scrollTop;
  const effectiveHeight = Math.max(120, paneEl.clientHeight - bottomReserve);
  const desiredTop = Math.max(
    16,
    effectiveHeight * focusRatio - Math.min(targetRect.height, effectiveHeight * 0.5) * 0.25,
  );
  const nextScrollTop = Math.max(0, Math.min(maxScroll, targetTopInPane - desiredTop));

  if (Math.abs(paneEl.scrollTop - nextScrollTop) < 6) {
    return true;
  }

  paneEl.scrollTo({
    top: nextScrollTop,
    behavior: options?.behavior ?? 'smooth',
  });
  return true;
}

function normalizeMealText(text?: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

interface SecondaryMealEntry {
  ayahLabel: string;
  text: string;
}

interface MealVerseGroup {
  key: string;
  verses: CombinedVerse[];
  startAyah: number;
  endAyah: number;
  mgRange: [number, number] | null;
  primaryText: string;
  secondaryEntries: SecondaryMealEntry[];
  primaryFootnotes: string[];
  secondaryFootnotes: string[];
  hasSajdah: boolean;
}

function groupSegmentMealVerses(
  verses: CombinedVerse[],
  getPrimaryVerse: (v: CombinedVerse) => MealVerse | null,
  getSecondaryVerse: (v: CombinedVerse) => MealVerse | null,
  isDual: boolean,
  showFootnotes: boolean,
  highlightSajdah: boolean,
): MealVerseGroup[] {
  const rawGroups: CombinedVerse[][] = [];

  for (const verse of verses) {
    const pVerse = getPrimaryVerse(verse);
    const pNorm = normalizeMealText(pVerse?.t);
    const prevGroup = rawGroups[rawGroups.length - 1];

    if (prevGroup) {
      const anchor = prevGroup[0];
      const anchorP = getPrimaryVerse(anchor);
      const anchorNorm = normalizeMealText(anchorP?.t);

      const sameMg = Boolean(
        anchorP?.mg &&
          pVerse?.mg &&
          anchorP.mg[0] === pVerse.mg[0] &&
          anchorP.mg[1] === pVerse.mg[1],
      );
      const sameText = anchorNorm.length > 0 && anchorNorm === pNorm;

      if (sameMg || sameText) {
        prevGroup.push(verse);
        continue;
      }
    }

    rawGroups.push([verse]);
  }

  return rawGroups.map((groupVerses) => {
    const first = groupVerses[0];
    const last = groupVerses[groupVerses.length - 1];
    const firstP = getPrimaryVerse(first);
    const primaryText = firstP?.t ?? '';

    const primaryFnSet = new Set<string>();
    const secondaryFnSet = new Set<string>();
    let hasSajdah = false;

    for (const v of groupVerses) {
      if (highlightSajdah && SAJDAH_AYAH_IDS.has(v.id)) {
        hasSajdah = true;
      }
      if (showFootnotes) {
        const pv = getPrimaryVerse(v);
        if (pv?.fn) {
          for (const fn of pv.fn) {
            const clean = fn.trim();
            if (clean) primaryFnSet.add(clean);
          }
        }
        if (isDual) {
          const sv = getSecondaryVerse(v);
          if (sv?.fn) {
            for (const fn of sv.fn) {
              const clean = fn.trim();
              if (clean) secondaryFnSet.add(clean);
            }
          }
        }
      }
    }

    const secondaryEntries: SecondaryMealEntry[] = [];
    if (isDual) {
      // İkinci mealde ardışık aynı metinleri birleştir; tüm grup tek metinse etiketsiz göster
      const secRuns: Array<{ start: number; end: number; text: string; norm: string }> = [];
      for (const v of groupVerses) {
        const sv = getSecondaryVerse(v);
        const text = sv?.t ?? '';
        const norm = normalizeMealText(text);
        if (!norm) continue;
        const lastRun = secRuns[secRuns.length - 1];
        if (lastRun && lastRun.norm === norm) {
          lastRun.end = v.ayah;
        } else {
          secRuns.push({ start: v.ayah, end: v.ayah, text, norm });
        }
      }

      if (secRuns.length === 1) {
        secondaryEntries.push({ ayahLabel: '', text: secRuns[0].text });
      } else {
        for (const run of secRuns) {
          const label =
            run.start === run.end ? `(${run.start})` : `(${run.start}–${run.end})`;
          secondaryEntries.push({ ayahLabel: label, text: run.text });
        }
      }
    }

    return {
      key: `${first.surah}-${first.ayah}-${last.ayah}`,
      verses: groupVerses,
      startAyah: first.ayah,
      endAyah: last.ayah,
      mgRange: firstP?.mg ?? null,
      primaryText,
      secondaryEntries,
      primaryFootnotes: Array.from(primaryFnSet),
      secondaryFootnotes: Array.from(secondaryFnSet),
      hasSajdah,
    };
  });
}

/** Özgün, telifsiz geometrik köşe süslemesi (SVG) */
const CornerOrnament: React.FC<{ position: 'tl' | 'tr' | 'bl' | 'br' }> = ({ position }) => {
  const rotation =
    position === 'tl'
      ? ''
      : position === 'tr'
        ? 'scale-x-[-1]'
        : position === 'bl'
          ? 'scale-y-[-1]'
          : 'scale-[-1]';
  const placement =
    position === 'tl'
      ? 'top-1.5 left-1.5'
      : position === 'tr'
        ? 'top-1.5 right-1.5'
        : position === 'bl'
          ? 'bottom-1.5 left-1.5'
          : 'bottom-1.5 right-1.5';

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 28"
      className={`w-5 h-5 sm:w-6 sm:h-6 absolute pointer-events-none opacity-55 ${placement} ${rotation}`}
      fill="none"
    >
      <path
        d="M2 24V6C2 3.79 3.79 2 6 2H24"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        style={{ color: 'var(--brand-primary)' }}
      />
      <path
        d="M6 18V8C6 6.9 6.9 6 8 6H18"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        style={{ color: 'var(--brand-accent)' }}
      />
      <path
        d="M9.5 9.5L12.5 8L11 11L9.5 9.5Z"
        fill="currentColor"
        style={{ color: 'var(--brand-accent)' }}
      />
    </svg>
  );
};

export const MushafPageView: React.FC<MushafPageViewProps> = ({
  pageBundle,
  secondPageBundle = null,
  mushafLayout,
  besmele,
  settings,
  wordMode,
  selectedVerseId,
  playingAyahId,
  autoScroll = true,
  isAudioBarVisible = false,
  isAudioBarExpanded = false,
  isTajweedLegendVisible = false,
  bookmarkedSet,
  isRefreshing = false,
  onSelectVerse,
  onChangePage,
  onPlayFromVerse,
  onPlayMealFromVerse,
  onToggleBookmark,
  onShareVerse,
  onOpenSurahInfo,
  onOpenLocationPicker,
  onToggleMobileImmersive,
}) => {
  const {
    updateSettings,
    studyProgress,
    upsertPageBookmark,
    moveHatimBookmark,
    removePageBookmark,
    openBookmarksDrawer,
    openMealCompare,
    openMealSelector,
    openVerseNoteModal,
    openListeningDrawer,
    manifest,
    meta,
    audioPrefs,
    selectedVerseKey,
    setSelectedVerseKey,
  } = useAppStore();

  const { getRukuEndingAt } = useRukusData(settings.showRukuMarkers);
  const verseNotesMap = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getMapSnapshot,
  );

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const isMealAudioFlowActive =
    (audioState.status === 'playing' || audioState.status === 'loading') &&
    (audioState.activePhase === 'meal' ||
      audioPrefs.mode === 'meal' ||
      audioPrefs.mode === 'ar_then_meal');
  const activeSpokenMeal = useMemo(
    () =>
      resolveSpokenMealInfo(
        audioState.activePhase === 'meal' ? audioState.activeSourceKey : audioPrefs.mealAudioSource,
        manifest,
      ),
    [audioState.activePhase, audioState.activeSourceKey, audioPrefs.mealAudioSource, manifest],
  );

  const [openRibbonPage, setOpenRibbonPage] = useState<number | null>(null);
  const [isVerseDrawerOpen, setIsVerseDrawerOpen] = useState<boolean>(false);
  const [openFootnoteKey, setOpenFootnoteKey] = useState<string | null>(null);
  const [detachedPanes, setDetachedPanes] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollUntilRef = useRef<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });
  const manualOverrideVerseRef = useRef<{ left: number | null; right: number | null }>({
    left: null,
    right: null,
  });
  const prevPlayingAyahIdRef = useRef<number | null>(null);

  const [isDesktopLg, setIsDesktopLg] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

  const arabicDensity = useMemo(
    () => getArabicDensityMetrics(settings.arabicTextDensity, settings.arabicLineHeight),
    [settings.arabicTextDensity, settings.arabicLineHeight],
  );

  useEffect(() => {
    if (openRibbonPage === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenRibbonPage(null);
      }
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-ribbon-menu-root="1"]')) return;
      setOpenRibbonPage(null);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [openRibbonPage]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktopLg(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const effectiveLayout: MushafLayout = mushafLayout ?? settings.mushafLayout;
  const isLtrBook = settings.readerContentMode === 'meal_only';
  const isArOnly = settings.readerContentMode === 'ar_only';
  const isMealMode = effectiveLayout === 'meal_only' || effectiveLayout === 'meal_dual';
  const isMealDual = effectiveLayout === 'meal_dual' && isDesktopLg && Boolean(secondPageBundle);
  const isDualArabic =
    (effectiveLayout === 'dual' || effectiveLayout === 'rahle_dual') &&
    isDesktopLg &&
    Boolean(secondPageBundle);
  const isDoubleMeal =
    effectiveLayout === 'mushaf_meal' || (effectiveLayout === 'rahle_dual' && !isDesktopLg);
  const isAnyDualPages = isDualArabic || isMealDual;
  const isBookSpread = isDesktopLg && (isAnyDualPages || isDoubleMeal);

  const allVisibleVerses = useMemo(() => {
    if (isAnyDualPages && secondPageBundle) {
      return [...pageBundle.verses, ...secondPageBundle.verses];
    }
    return pageBundle.verses;
  }, [isAnyDualPages, pageBundle.verses, secondPageBundle]);

  const surahMetaByNo = useMemo(() => {
    const map = new Map<number, SurahMeta>();
    for (const seg of pageBundle.segments) {
      map.set(seg.surahMeta.no, seg.surahMeta);
    }
    if (secondPageBundle) {
      for (const seg of secondPageBundle.segments) {
        map.set(seg.surahMeta.no, seg.surahMeta);
      }
    }
    return map;
  }, [pageBundle.segments, secondPageBundle]);

  const visibleSurahNos = useMemo(
    () => Array.from(surahMetaByNo.keys()),
    [surahMetaByNo],
  );
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(visibleSurahNos);

  const {
    rules: tjRules,
    besmele: tjBesmele,
    getVerseWords: getTjVerseWords,
  } = useTajweedData(visibleSurahNos, settings.tajweedEnabled);

  const explicitSelectedVerse = useMemo(() => {
    if (!selectedVerseKey) return null;
    const [sStr, aStr] = selectedVerseKey.split(':');
    const s = Number(sStr);
    const a = Number(aStr);
    if (!Number.isFinite(s) || !Number.isFinite(a)) return null;
    return allVisibleVerses.find((v) => v.surah === s && v.ayah === a) ?? null;
  }, [selectedVerseKey, allVisibleVerses]);

  const inspectorVerse =
    explicitSelectedVerse ??
    allVisibleVerses.find((v) => v.id === selectedVerseId) ??
    allVisibleVerses[0] ??
    null;

  const selectedSurahMeta = inspectorVerse
    ? surahMetaByNo.get(inspectorVerse.surah) ?? pageBundle.segments[0]?.surahMeta ?? null
    : pageBundle.segments[0]?.surahMeta ?? null;

  const handleSelectOrToggleVerse = useCallback(
    (verse: CombinedVerse, source: 'arabic' | 'meal') => {
      const selText =
        typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : '';
      if (selText) return;

      sfxService.play('click');
      const verseKey = `${verse.surah}:${verse.ayah}`;
      const isAlreadySelected = selectedVerseKey === verseKey;

      if (source === 'arabic' && effectiveLayout === 'rahle_dual') {
        setSelectedVerseKey(verseKey);
        onSelectVerse(verse);
        audioQueueService.syncPausedSelection(verse, meta);
        setIsVerseDrawerOpen(true);
        return;
      }

      if (isAlreadySelected && !isVerseDrawerOpen) {
        setSelectedVerseKey(null);
        return;
      }

      setSelectedVerseKey(verseKey);
      onSelectVerse(verse);
      audioQueueService.syncPausedSelection(verse, meta);

      if (isDoubleMeal) {
        if (source === 'arabic') {
          syncLeftMealToVerse(verse.id);
        } else {
          syncRightMushafToVerse(verse.id);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedVerseKey, effectiveLayout, isVerseDrawerOpen, isDoubleMeal, meta, onSelectVerse, setSelectedVerseKey],
  );

  const bottomReservePx = isAudioBarExpanded ? 112 : isAudioBarVisible ? 32 : 20;

  const findTargetInPane = useCallback(
    (side: 'left' | 'right', ayahId: number): HTMLElement | null => {
      const paneEl = side === 'left' ? leftPaneRef.current : rightPaneRef.current;
      if (!paneEl) return null;
      if (isMealDual || (isDoubleMeal && side === 'left')) {
        return paneEl.querySelector<HTMLElement>(`[data-meal-ayahs~="${ayahId}"]`);
      }
      return paneEl.querySelector<HTMLElement>(`[data-ayah-id="${ayahId}"]`);
    },
    [isMealDual, isDoubleMeal],
  );

  const scrollPaneProgrammatically = useCallback(
    (side: 'left' | 'right', targetEl: HTMLElement | null, behavior: ScrollBehavior = 'smooth') => {
      const paneEl = side === 'left' ? leftPaneRef.current : rightPaneRef.current;
      if (!paneEl || !targetEl) return false;
      programmaticScrollUntilRef.current[side] = Date.now() + 850;
      return scrollTargetIntoPane(paneEl, targetEl, {
        bottomReservePx,
        focusRatio: 0.35,
        behavior,
      });
    },
    [bottomReservePx],
  );

  const handlePaneUserScrollGesture = useCallback(
    (side: 'left' | 'right') => {
      if (!playingAyahId || !isBookSpread) return;
      const paneEl = side === 'left' ? leftPaneRef.current : rightPaneRef.current;
      if (!paneEl || paneEl.scrollHeight - paneEl.clientHeight <= 2) return;
      manualOverrideVerseRef.current[side] = playingAyahId;
      setDetachedPanes((prev) => (prev[side] ? prev : { ...prev, [side]: true }));
    },
    [playingAyahId, isBookSpread],
  );

  const handlePaneScroll = useCallback(
    (side: 'left' | 'right') => {
      if (!playingAyahId || !isBookSpread) return;
      if (Date.now() <= programmaticScrollUntilRef.current[side]) return;
      const paneEl = side === 'left' ? leftPaneRef.current : rightPaneRef.current;
      if (!paneEl || paneEl.scrollHeight - paneEl.clientHeight <= 2) return;
      manualOverrideVerseRef.current[side] = playingAyahId;
      setDetachedPanes((prev) => (prev[side] ? prev : { ...prev, [side]: true }));
    },
    [playingAyahId, isBookSpread],
  );

  const handleJumpToActiveVerse = useCallback(() => {
    if (!playingAyahId || !isBookSpread) return;
    manualOverrideVerseRef.current = { left: null, right: null };
    setDetachedPanes({ left: false, right: false });
    scrollPaneProgrammatically('right', findTargetInPane('right', playingAyahId));
    scrollPaneProgrammatically('left', findTargetInPane('left', playingAyahId));
  }, [playingAyahId, isBookSpread, scrollPaneProgrammatically, findTargetInPane]);

  const syncLeftMealToVerse = useCallback(
    (ayahId: number) => {
      if (!isDoubleMeal) return;
      manualOverrideVerseRef.current.left = null;
      setDetachedPanes((prev) => (prev.left ? { ...prev, left: false } : prev));
      scrollPaneProgrammatically('left', findTargetInPane('left', ayahId));
    },
    [isDoubleMeal, scrollPaneProgrammatically, findTargetInPane],
  );

  const syncRightMushafToVerse = useCallback(
    (ayahId: number) => {
      if (!isDoubleMeal) return;
      manualOverrideVerseRef.current.right = null;
      setDetachedPanes((prev) => (prev.right ? { ...prev, right: false } : prev));
      scrollPaneProgrammatically('right', findTargetInPane('right', ayahId));
    },
    [isDoubleMeal, scrollPaneProgrammatically, findTargetInPane],
  );

  // Sayfa veya düzen değişince açık kurdele menüsünü kapat ve bağımsız panelleri başa al
  useEffect(() => {
    setOpenRibbonPage(null);
    manualOverrideVerseRef.current = { left: null, right: null };
    setDetachedPanes({ left: false, right: false });

    const hasPlayingOnThisSpread = Boolean(
      playingAyahId && allVisibleVerses.some((v) => v.id === playingAyahId),
    );
    if (!hasPlayingOnThisSpread) {
      programmaticScrollUntilRef.current = {
        left: Date.now() + 250,
        right: Date.now() + 250,
      };
      leftPaneRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      rightPaneRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageBundle.pageNo, secondPageBundle?.pageNo, effectiveLayout]);

  // Sesli okuma sırasında her iki bağımsız paneli çakışmasız (pane.scrollTo) olarak aktif ayete ortala
  useEffect(() => {
    if (!playingAyahId) {
      prevPlayingAyahIdRef.current = null;
      manualOverrideVerseRef.current = { left: null, right: null };
      setDetachedPanes((prev) =>
        prev.left || prev.right ? { left: false, right: false } : prev,
      );
      return;
    }

    const isNewVerse = prevPlayingAyahIdRef.current !== playingAyahId;
    prevPlayingAyahIdRef.current = playingAyahId;

    if (isNewVerse) {
      // Bir sonraki ayete geçildiğinde manuel kaydırma engelini sıfırla
      manualOverrideVerseRef.current = { left: null, right: null };
      setDetachedPanes((prev) =>
        prev.left || prev.right ? { left: false, right: false } : prev,
      );
    }

    if (!isBookSpread || !autoScroll) return;

    const rafId = window.requestAnimationFrame(() => {
      if (manualOverrideVerseRef.current.right !== playingAyahId) {
        const rightTarget = findTargetInPane('right', playingAyahId);
        if (rightTarget) {
          scrollPaneProgrammatically('right', rightTarget);
        }
      }
      if (manualOverrideVerseRef.current.left !== playingAyahId) {
        const leftTarget = findTargetInPane('left', playingAyahId);
        if (leftTarget) {
          scrollPaneProgrammatically('left', leftTarget);
        }
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [
    playingAyahId,
    isBookSpread,
    autoScroll,
    pageBundle.pageNo,
    secondPageBundle?.pageNo,
    findTargetInPane,
    scrollPaneProgrammatically,
  ]);

  // Akıllı Okuma Yönü Motoru:
  // - Sadece Meal (LTR): Sol = Önceki Sayfa, Sağ = Sonraki Sayfa
  // - Arapça / Arapça + Meal (RTL): Sol = Sonraki Sayfa, Sağ = Önceki Sayfa
  const pageStep = isAnyDualPages ? 2 : 1;
  const canGoPrev = pageBundle.pageNo > pageBundle.minPage;
  const canGoNext =
    (isAnyDualPages && secondPageBundle ? secondPageBundle.pageNo : pageBundle.pageNo) <
    pageBundle.maxPage;
  const prevTargetPage = Math.max(pageBundle.minPage, pageBundle.pageNo - pageStep);
  const nextTargetPage = Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep);

  const leftActionDisabled = isLtrBook ? !canGoPrev : !canGoNext;
  const leftActionTarget = isLtrBook ? prevTargetPage : nextTargetPage;
  const leftActionLabel = isLtrBook
    ? isAnyDualPages
      ? 'Önceki 2 Sayfa'
      : 'Önceki Sayfa'
    : isAnyDualPages
      ? 'Sonraki 2 Sayfa'
      : 'Sonraki Sayfa';
  const leftActionDisabledTitle = isLtrBook ? 'İlk sayfadasınız' : 'Son sayfadasınız';

  const rightActionDisabled = isLtrBook ? !canGoNext : !canGoPrev;
  const rightActionTarget = isLtrBook ? nextTargetPage : prevTargetPage;
  const rightActionLabel = isLtrBook
    ? isAnyDualPages
      ? 'Sonraki 2 Sayfa'
      : 'Sonraki Sayfa'
    : isAnyDualPages
      ? 'Önceki 2 Sayfa'
      : 'Önceki Sayfa';
  const rightActionDisabledTitle = isLtrBook ? 'Son sayfadasınız' : 'İlk sayfadasınız';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || hasActiveBackStackEntries()) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (isVerseDrawerOpen) {
          setIsVerseDrawerOpen(false);
        } else if (selectedVerseKey) {
          setSelectedVerseKey(null);
        }
        return;
      }

      if (e.key === 'ArrowLeft' && !leftActionDisabled) {
        e.preventDefault();
        onChangePage(leftActionTarget);
      } else if (e.key === 'ArrowRight' && !rightActionDisabled) {
        e.preventDefault();
        onChangePage(rightActionTarget);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isVerseDrawerOpen,
    selectedVerseKey,
    setSelectedVerseKey,
    leftActionDisabled,
    leftActionTarget,
    rightActionDisabled,
    rightActionTarget,
    onChangePage,
  ]);

  // Mobilde yatay parmak kaydırma ile sayfa çevirme (LTR / RTL uyumlu)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (isLtrBook) {
      // LTR Türkçe Kitap: Sola kaydır -> sonraki sayfa, Sağa kaydır -> önceki sayfa
      if (dx < 0 && canGoNext) {
        sfxService.play('click');
        onChangePage(nextTargetPage);
      } else if (dx > 0 && canGoPrev) {
        sfxService.play('click');
        onChangePage(prevTargetPage);
      }
    } else {
      // RTL Mushaf: Sağa kaydır -> sonraki sayfa, Sola kaydır -> önceki sayfa
      if (dx > 0 && canGoNext) {
        sfxService.play('click');
        onChangePage(nextTargetPage);
      } else if (dx < 0 && canGoPrev) {
        sfxService.play('click');
        onChangePage(prevTargetPage);
      }
    }
  };

  const handleMobileEmptySpaceTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onToggleMobileImmersive || typeof window === 'undefined' || window.innerWidth >= 1024) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'button, a, [role="button"], input, select, [data-tajweed-rule], [data-waqf-sign], [data-ruku-badge]',
      )
    ) {
      return;
    }
    onToggleMobileImmersive();
  };

  // Kurdele Sayfa Ayracı Bileşeni (Her Mushaf Yaprağının Üst Köşesinde)
  const renderRibbonBookmark = (bundle: PageBundle) => {
    const firstVerse = bundle.verses[0];
    const firstSurah = bundle.segments[0]?.surahMeta;
    const hatimOnPage = studyProgress.pageBookmarks.find(
      (b) => b.isHatim && b.page === bundle.pageNo,
    );
    const customOnPage = studyProgress.pageBookmarks.find(
      (b) => !b.isHatim && b.page === bundle.pageNo,
    );
    const activeBookmark = hatimOnPage ?? customOnPage ?? null;
    const ribbonColor = activeBookmark
      ? BOOKMARK_COLOR_STYLES[activeBookmark.color]?.bg ?? '#0F766E'
      : null;
    const isMenuOpen = openRibbonPage === bundle.pageNo;

    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            setOpenRibbonPage((prev) => (prev === bundle.pageNo ? null : bundle.pageNo));
          }}
          title={
            activeBookmark
              ? `${activeBookmark.label} (Sayfa ${bundle.pageNo})`
              : `Sayfa ${bundle.pageNo} için ayraç ekle`
          }
          aria-label={`Sayfa ${bundle.pageNo} ayracı`}
          aria-expanded={isMenuOpen}
          data-ribbon-menu-root="1"
          className="relative flex items-center justify-center w-9 h-9 -mt-2 rounded-b-lg border-x border-b shadow-xs transition-transform hover:translate-y-0.5 cursor-pointer"
          style={{
            backgroundColor: ribbonColor ?? 'var(--bg-surface-soft)',
            borderColor: ribbonColor ? 'transparent' : 'var(--border-strong)',
            color: ribbonColor ? '#FFFFFF' : 'var(--text-muted)',
          }}
        >
          <Bookmark className={`w-4 h-4 ${activeBookmark ? 'fill-current' : ''}`} />
        </button>

        {isMenuOpen && firstVerse && (
          <div
            data-ribbon-menu-root="1"
            className="absolute left-0 top-9 z-30 w-60 max-w-[calc(100vw-1.5rem)] rounded-2xl border shadow-xl p-2 space-y-1 text-left"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div
              className="px-2.5 py-1.5 border-b text-[11px] font-bold flex items-center justify-between"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              <span>Sayfa {bundle.pageNo} Ayracı</span>
              {activeBookmark && (
                <span style={{ color: 'var(--brand-primary-text)' }}>{activeBookmark.label}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                moveHatimBookmark({
                  page: bundle.pageNo,
                  surah: firstVerse.surah,
                  ayah: firstVerse.ayah,
                });
                if (hatimStorage.getSnapshot().activePlan) {
                  hatimStorage.markPagesReadUpTo(bundle.pageNo);
                }
                setOpenRibbonPage(null);
              }}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {hatimOnPage ? 'Hatim Ayracım Burada ✓' : 'Hatim Ayracımı Buraya Taşı'}
              </span>
            </button>

            {customOnPage ? (
              <button
                type="button"
                onClick={() => {
                  removePageBookmark(customOnPage.id);
                  setOpenRibbonPage(null);
                }}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-red-500/10 cursor-pointer"
                style={{ color: '#DC2626' }}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Sayfa Ayracını Kaldır</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  upsertPageBookmark({
                    page: bundle.pageNo,
                    surah: firstVerse.surah,
                    ayah: firstVerse.ayah,
                    label: firstSurah
                      ? `${firstSurah.shortNameTr} · S.${bundle.pageNo}`
                      : `Sayfa ${bundle.pageNo}`,
                    color: 'amber',
                  });
                  setOpenRibbonPage(null);
                }}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                <Bookmark className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-accent-text)' }} />
                <span>Bu Sayfayı Ayraçlara Ekle</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpenRibbonPage(null);
                openBookmarksDrawer();
              }}
              className="w-full min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold text-center border-t mt-1 pt-1.5 hover:underline cursor-pointer"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              Tüm Sayfa Ayraçlarım ({studyProgress.pageBookmarks.length})
            </button>
          </div>
        )}
      </div>
    );
  };

  // Arapça Mushaf Yaprağı (Tek Sayfa, Sağ Yaprak veya Sol Yaprak)
  const renderMushafLeaf = (
    bundle: PageBundle,
    leafPosition: 'single' | 'right' | 'left',
  ) => {
    const firstSegmentStartsSurah = Boolean(bundle.segments[0]?.startsAtAyah1);
    const surahTitlesTr = bundle.segments.map((s) => s.surahMeta.shortNameTr).join(' · ');
    const surahTitlesAr = bundle.segments
      .map((s) => formatSafeArabicTitle(s.surahMeta.nameAr))
      .slice(0, 2)
      .join(' · ');

    const paperClass =
      leafPosition === 'right'
        ? 'mushaf-paper-right rounded-2xl lg:rounded-l-none lg:rounded-r-2xl'
        : leafPosition === 'left'
          ? 'mushaf-paper-left rounded-2xl lg:rounded-r-none lg:rounded-l-2xl'
          : 'mushaf-paper-single rounded-2xl';

    const compactPadding = leafPosition !== 'single';
    const isDualPane = leafPosition !== 'single';
    const paneSide: 'left' | 'right' | null =
      leafPosition === 'left' ? 'left' : leafPosition === 'right' ? 'right' : null;
    const paneScrollPadding = isAudioBarExpanded
      ? 'lg:pb-8'
      : isAudioBarVisible
        ? 'lg:pb-5'
        : 'lg:pb-3';
    const showJumpChip = Boolean(
      paneSide && playingAyahId && detachedPanes[paneSide] && bundle.verses.some((v) => v.id === playingAyahId),
    );
    const pageHasSajdah =
      settings.highlightSajdah && bundle.verses.some((v) => SAJDAH_AYAH_IDS.has(v.id));

    return (
      <div
        key={`mushaf-leaf-${bundle.pageNo}`}
        className={`${paperClass} p-1 sm:p-2.5 transition-opacity duration-200 flex flex-col h-full ${
          isDualPane ? 'lg:h-full lg:min-h-0' : ''
        } ${isRefreshing ? 'opacity-80' : 'opacity-100'}`}
      >
        <div
          className={`mushaf-cetvel-outer rounded-xl p-0.5 sm:p-1 flex-1 flex flex-col ${
            isDualPane ? 'lg:h-full lg:min-h-0' : ''
          }`}
        >
          <div
            className={`mushaf-cetvel-inner rounded-[10px] relative flex-1 flex flex-col ${
              isDualPane ? 'lg:h-full lg:min-h-0' : 'justify-between'
            } ${
              compactPadding ? 'px-2.5 py-3 sm:px-5 sm:py-4' : 'px-2.5 py-3 sm:px-8 md:px-10 sm:py-5'
            }`}
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            {/* 4 Özgün Geometrik Köşe Süsü */}
            <CornerOrnament position="tl" />
            <CornerOrnament position="tr" />
            <CornerOrnament position="bl" />
            <CornerOrnament position="br" />

            {/* Klasik Mushaf Üst Şeridi: Sabit Başlık + Kurdele Ayraç + Aktif Ayete Git */}
            <div
              className="pb-2.5 mb-3 border-b flex items-center justify-between gap-1 sm:gap-2 text-xs shrink-0 min-w-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {renderRibbonBookmark(bundle)}
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('page');
                    }}
                    title="Sayfa değiştir"
                    className="font-extrabold tabular-nums hover:underline cursor-pointer"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    Sayfa {bundle.pageNo}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('juz');
                    }}
                    title="Cüz seç"
                    className="font-bold tabular-nums text-center px-2.5 py-0.5 rounded-lg text-[11px] hover:opacity-80 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {bundle.cuzs.map((c) => `${c}. Cüz`).join(' / ')}
                  </button>
                  {pageHasSajdah && (
                    <span
                      title="Bu sayfada Tilâvet Secdesi ayeti bulunmaktadır"
                      className="font-extrabold px-2 py-0.5 rounded-lg border text-[11px] inline-flex items-center gap-1 whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        borderColor: 'rgba(217, 119, 6, 0.45)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      <span>۩</span>
                      <span className="hidden xs:inline sm:inline">Secde</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 min-w-0 justify-end">
                  {showJumpChip && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sfxService.play('click');
                        handleJumpToActiveVerse();
                      }}
                      title="Aktif okunan ayete geri dön"
                      className="h-6 px-2 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: 'var(--brand-primary)',
                        color: '#FFFFFF',
                      }}
                    >
                      <LocateFixed className="w-3 h-3 shrink-0" />
                      <span>Aktif Ayete Git</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('surah');
                    }}
                    title="Sure seç"
                    className={`text-right min-w-0 items-center gap-1.5 justify-end hover:opacity-80 cursor-pointer ${
                      firstSegmentStartsSurah ? 'hidden sm:flex' : 'flex'
                    }`}
                  >
                    <span
                      className="text-xs font-bold truncate hidden sm:inline"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {surahTitlesTr}
                    </span>
                    {!firstSegmentStartsSurah && surahTitlesTr && surahTitlesAr && (
                      <span
                        aria-hidden="true"
                        className="hidden sm:inline text-xs font-bold opacity-45 shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        ·
                      </span>
                    )}
                    {!firstSegmentStartsSurah && (
                      <span
                        className="arabic-title text-base sm:text-lg leading-none truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {surahTitlesAr}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Bağımsız Kaydırılabilir Mushaf Gövdesi (lg+ ikili görünümde) */}
              <div
                ref={paneSide === 'left' ? leftPaneRef : paneSide === 'right' ? rightPaneRef : undefined}
                onWheel={paneSide ? () => handlePaneUserScrollGesture(paneSide) : undefined}
                onTouchMove={paneSide ? () => handlePaneUserScrollGesture(paneSide) : undefined}
                onScroll={paneSide ? () => handlePaneScroll(paneSide) : undefined}
                className={`flex-1 flex flex-col justify-between ${
                  isDualPane
                    ? `lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain mushaf-leaf-scroll lg:pr-1.5 ${paneScrollPadding}`
                    : ''
                }`}
              >
                {/* Sayfa Bölümleri (Sure Başlıkları + Besmele + Kesintisiz Ayet Akışı) */}
                <div className="space-y-3.5">
                {bundle.segments.map((segment) => (
                  <div key={`seg-${bundle.pageNo}-${segment.surahMeta.no}`} className="space-y-2.5">
                    {segment.startsAtAyah1 && (
                      <div
                        className="rounded-xl border px-3 py-1.5 relative overflow-hidden"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'rgba(217, 119, 6, 0.36)',
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                              {segment.surahMeta.no}. {segment.surahMeta.nameTr}
                            </h3>
                            <p
                              className="text-[11px] tabular-nums"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {segment.surahMeta.type} · {segment.surahMeta.ayahCount} Ayet
                            </p>
                          </div>

                          <span
                            className="arabic-title text-xl sm:text-2xl leading-none"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            {formatSafeArabicTitle(segment.surahMeta.nameAr)}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              onOpenSurahInfo(segment.surahMeta);
                            }}
                            className="min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            <Info className="w-3.5 h-3.5 shrink-0" />
                            <span>Bilgi</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {segment.showBesmele && (() => {
                      const isBesmelePlaying = Boolean(
                        playingAyahId &&
                          segment.verses[0]?.id === playingAyahId &&
                          audioState.activePhase === 'besmele',
                      );
                      const softPlayingBg =
                        settings.theme === 'dark'
                          ? 'rgba(45, 212, 191, 0.13)'
                          : 'rgba(13, 148, 136, 0.10)';
                      return (
                        <p
                          className={`${settings.tajweedEnabled && tjBesmele ? 'arabic-tajweed' : 'arabic-text'} text-center py-0.5 px-2 rounded-lg transition-colors`}
                          style={{
                            fontSize: `${Math.max(20, settings.arabicFontSize - 2)}px`,
                            color: 'var(--brand-primary-text)',
                            backgroundColor:
                              isBesmelePlaying && !audioState.isWordSyncActive
                                ? softPlayingBg
                                : 'transparent',
                          }}
                        >
                          <SyncedVerseArabic
                            text={besmele.ar}
                            surahNo={segment.surahMeta.no}
                            ayahNo={1}
                            isPlaying={isBesmelePlaying}
                            wordSyncEnabled={settings.wordSyncEnabled}
                            useTajweed={Boolean(settings.tajweedEnabled && tjBesmele)}
                            tajweedWords={tjBesmele}
                            tajweedRules={tjRules}
                            theme={settings.theme}
                            isBesmele
                          />
                        </p>
                      );
                    })()}

                    {/* Kesintisiz Mushaf Ayet Akışı */}
                    {(() => {
                      const hasTajweedOnSegment =
                        settings.tajweedEnabled &&
                        segment.verses.some((v) =>
                          Boolean(getTjVerseWords(v.surah, v.ayah)?.length),
                        );
                      return (
                        <div
                          dir="rtl"
                          className={hasTajweedOnSegment ? 'arabic-tajweed' : 'arabic-text'}
                          style={{
                            fontSize: `${settings.arabicFontSize}px`,
                            lineHeight: hasTajweedOnSegment
                              ? arabicDensity.tajweedLineHeight
                              : arabicDensity.mushafLineHeight,
                            wordSpacing: arabicDensity.wordSpacing,
                            textAlign: 'justify',
                            textAlignLast: 'center',
                          }}
                        >
                          {segment.verses.map((verse) => {
                            const isSelected = explicitSelectedVerse?.id === verse.id;
                            const isPlaying =
                              playingAyahId === verse.id && audioState.activePhase !== 'besmele';
                            const isSajdah = SAJDAH_AYAH_IDS.has(verse.id);
                            const highlightSajdah = isSajdah && settings.highlightSajdah;
                            const hasDigitsAtEnd = ENDS_WITH_ARABIC_NUMERAL.test(verse.ar.t);
                            const tjWords = settings.tajweedEnabled
                              ? getTjVerseWords(verse.surah, verse.ayah)
                              : null;
                            const useVerseTajweed = Boolean(tjWords && tjWords.length > 0);
                            const softPlayingBg =
                              settings.theme === 'dark'
                                ? 'rgba(16, 185, 129, 0.14)'
                                : 'rgba(16, 185, 129, 0.11)';
                            const softWordSyncPlayingBg =
                              settings.theme === 'dark'
                                ? 'rgba(16, 185, 129, 0.08)'
                                : 'rgba(16, 185, 129, 0.06)';

                            const highlightBg = isPlaying
                              ? audioState.isWordSyncActive
                                ? softWordSyncPlayingBg
                                : softPlayingBg
                              : isSelected
                                ? 'rgba(245, 158, 11, 0.14)'
                                : highlightSajdah
                                  ? 'rgba(217, 119, 6, 0.10)'
                                  : 'transparent';

                            const highlightRing = isPlaying
                              ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.28)'
                              : isSelected
                                ? 'inset 0 0 0 1px rgba(245, 158, 11, 0.36)'
                                : undefined;

                            return (
                              <span
                                key={verse.id}
                                id={`mushaf-ayah-${verse.id}`}
                                data-ayah-id={verse.id}
                                onClick={() => handleSelectOrToggleVerse(verse, 'arabic')}
                                role="button"
                                tabIndex={0}
                                title={
                                  highlightSajdah
                                    ? `Tilâvet Secdesi Ayeti — ${segment.surahMeta.nameTr} ${verse.ayah}. Ayet`
                                    : `${segment.surahMeta.nameTr} ${verse.ayah}. Ayet`
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleSelectOrToggleVerse(verse, 'arabic');
                                  }
                                }}
                                className={`inline rounded-lg px-[0.02em] py-[0.04em] transition-colors cursor-pointer hover:bg-teal-600/10 focus-visible:outline-2 focus-visible:outline-teal-600 ${
                                  highlightSajdah
                                    ? 'underline decoration-amber-500/65 decoration-dotted underline-offset-[10px]'
                                    : ''
                                }`}
                                style={{
                                  backgroundColor: highlightBg,
                                  boxShadow: highlightRing,
                                  boxDecorationBreak: 'clone',
                                  WebkitBoxDecorationBreak: 'clone',
                                }}
                              >
                                <SyncedVerseArabic
                                  text={verse.ar.t}
                                  surahNo={verse.surah}
                                  ayahNo={verse.ayah}
                                  isPlaying={isPlaying}
                                  wordSyncEnabled={settings.wordSyncEnabled}
                                  useTajweed={useVerseTajweed}
                                  tajweedWords={tjWords}
                                  tajweedRules={tjRules}
                                  theme={settings.theme}
                                />
                                {highlightSajdah && (
                                  <span
                                    title="Tilâvet Secdesi Ayeti"
                                    aria-label="Tilâvet Secdesi Ayeti"
                                    className="inline-flex items-center justify-center mx-[0.14em] px-[0.22em] py-0.5 rounded-md border text-[0.64em] font-extrabold align-middle leading-none select-none"
                                    style={{
                                      backgroundColor: 'var(--brand-accent-soft)',
                                      borderColor: 'rgba(217, 119, 6, 0.5)',
                                      color: 'var(--brand-accent-text)',
                                    }}
                                  >
                                    ۩
                                  </span>
                                )}
                                {(useVerseTajweed || !hasDigitsAtEnd) && (
                                  <AyahEndMarker
                                    ayahNo={verse.ayah}
                                    isPlaying={isPlaying}
                                    isWordSyncActive={audioState.isWordSyncActive}
                                    isHighlighted={isSelected || highlightSajdah}
                                    theme={settings.theme}
                                    size="mushaf"
                                    title={
                                      highlightSajdah
                                        ? `Tilâvet Secdesi · ${segment.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                        : `${segment.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                    }
                                  />
                                )}
                                {settings.showRukuMarkers &&
                                  (() => {
                                    const rukuEnd = getRukuEndingAt(verse.surah, verse.ayah);
                                    return rukuEnd ? (
                                      <RukuMarkerBadge
                                        ruku={rukuEnd}
                                        surahNameTr={segment.surahMeta.nameTr}
                                        page={bundle.pageNo}
                                        variant="inline"
                                      />
                                    ) : null;
                                  })()}{' '}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
                {/* Alt Klasik Sayfa Numarası */}
                <div
                  className="mt-4 pt-2 pb-1.5 lg:pb-0 border-t flex items-center justify-center text-xs font-bold tabular-nums shrink-0"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    — {bundle.pageNo} / {bundle.maxPage} —
                  </span>
                </div>
              </div>
          </div>
        </div>
      </div>
    );
  };

  // Mushaf Çerçeveli Türkçe Meal Yaprağı (Karşılıklı Meal, Tek Sayfa Meal ve 2 Sayfa Açık Kitap Meal modları)
  const renderFacingMealLeaf = (
    bundle: PageBundle,
    side: 'single' | 'right' | 'left' = 'left',
  ) => {
    const mealTitle = isDual
      ? `${primaryMeal.shortLabel} & ${secondaryMeal.shortLabel}`
      : primaryMeal.label;

    const surahTitlesTr = Array.from(
      new Set(bundle.segments.map((s) => formatSurahTitle(s.surahMeta.nameTr, s.surahMeta.no))),
    ).join(' · ');

    const pageHasSajdah =
      settings.highlightSajdah && bundle.verses.some((v) => SAJDAH_AYAH_IDS.has(v.id));

    const paperClass =
      side === 'right'
        ? 'mushaf-paper-right rounded-2xl lg:rounded-l-none lg:rounded-r-2xl'
        : side === 'left'
          ? 'mushaf-paper-left rounded-2xl lg:rounded-r-none lg:rounded-l-2xl'
          : 'mushaf-paper-single rounded-2xl';

    const isDualPane = side !== 'single' && isBookSpread;
    const paneSide: 'left' | 'right' | null =
      isDualPane ? (side === 'left' ? 'left' : 'right') : null;
    const paneScrollPadding = isAudioBarExpanded
      ? 'lg:pb-8'
      : isAudioBarVisible
        ? 'lg:pb-5'
        : 'lg:pb-3';
    const showJumpChip = Boolean(
      paneSide && playingAyahId && detachedPanes[paneSide] && bundle.verses.some((v) => v.id === playingAyahId),
    );

    return (
      <div
        className={`${paperClass} p-1.5 sm:p-2.5 transition-opacity duration-200 flex flex-col h-full ${
          isDualPane ? 'lg:h-full lg:min-h-0' : ''
        } ${isRefreshing ? 'opacity-80' : 'opacity-100'}`}
      >
        <div
          className={`mushaf-cetvel-outer rounded-xl p-1 flex-1 flex flex-col ${
            isDualPane ? 'lg:h-full lg:min-h-0' : ''
          }`}
        >
          <div
            className={`mushaf-cetvel-inner rounded-[10px] relative flex-1 flex flex-col px-4 py-3.5 sm:px-5 sm:py-4 ${
              isDualPane ? 'lg:h-full lg:min-h-0' : 'justify-between'
            }`}
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            <CornerOrnament position="tl" />
            <CornerOrnament position="tr" />
            <CornerOrnament position="bl" />
            <CornerOrnament position="br" />

            {/* Meal Yaprağı Sabit Üst Şeridi */}
            {isMealMode ? (
              <div
                className="pb-2.5 mb-3 border-b flex items-center justify-between gap-2 text-xs shrink-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 shrink-0">
                  {renderRibbonBookmark(bundle)}
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('page');
                    }}
                    title="Sayfa değiştir"
                    className="font-extrabold tabular-nums hover:underline cursor-pointer"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    Sayfa {bundle.pageNo}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('juz');
                    }}
                    title="Cüz seç"
                    className="font-bold tabular-nums text-center px-2.5 py-0.5 rounded-lg text-[11px] hover:opacity-80 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {bundle.cuzs.map((c) => `${c}. Cüz`).join(' / ')}
                  </button>
                  {pageHasSajdah && (
                    <span
                      title="Bu sayfada Tilâvet Secdesi ayeti bulunmaktadır"
                      className="font-extrabold px-2 py-0.5 rounded-lg border text-[11px] inline-flex items-center gap-1 whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        borderColor: 'rgba(217, 119, 6, 0.45)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      <span>۩</span>
                      <span className="hidden sm:inline">Secde</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 min-w-0 justify-end">
                  {showJumpChip && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sfxService.play('click');
                        handleJumpToActiveVerse();
                      }}
                      title="Aktif okunan ayete geri dön"
                      className="h-6 px-2 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: 'var(--brand-primary)',
                        color: '#FFFFFF',
                      }}
                    >
                      <LocateFixed className="w-3 h-3 shrink-0" />
                      <span>Aktif Ayete Git</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('surah');
                    }}
                    title="Sure seç"
                    className="text-right min-w-0 font-bold truncate hover:underline cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {surahTitlesTr}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="pb-2.5 mb-3 border-b flex items-center justify-between gap-2 text-xs shrink-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openMealSelector('primary');
                    }}
                    title={`${MEALS_CATALOG.length} meal ve tefsir arasından değiştir`}
                    className="font-extrabold truncate hover:underline text-left cursor-pointer"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    {mealTitle}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {showJumpChip && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sfxService.play('click');
                        handleJumpToActiveVerse();
                      }}
                      title="Aktif okunan ayete geri dön"
                      className="h-6 px-2 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--brand-primary)',
                        color: '#FFFFFF',
                      }}
                    >
                      <LocateFixed className="w-3 h-3 shrink-0" />
                      <span>Aktif Ayete Git</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('page');
                    }}
                    title="Sayfa değiştir"
                    className="font-bold tabular-nums px-2 py-0.5 rounded-lg text-[11px] hover:opacity-80 cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Sayfa {bundle.pageNo} Meali
                  </button>
                  {isDoubleMeal && side === 'left' && (
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({ readerContentMode: 'ar_only' });
                      }}
                      title="Meal sayfasını kapat (Sadece Arapça)"
                      aria-label="Meal sayfasını kapat"
                      className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer transition-colors hover:opacity-85"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <PanelRightClose className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bağımsız Kaydırılabilir Meal Gövdesi (lg+ ikili görünümde) */}
            <div
              ref={paneSide === 'left' ? leftPaneRef : paneSide === 'right' ? rightPaneRef : undefined}
              onWheel={paneSide ? () => handlePaneUserScrollGesture(paneSide) : undefined}
              onTouchMove={paneSide ? () => handlePaneUserScrollGesture(paneSide) : undefined}
              onScroll={paneSide ? () => handlePaneScroll(paneSide) : undefined}
              className={`flex-1 flex flex-col justify-between ${
                isDualPane
                  ? `lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain mushaf-leaf-scroll lg:pr-1.5 ${paneScrollPadding}`
                  : ''
              }`}
            >
              {/* Kitap Düzeninde Süslü Numaralı Meal Akışı (Birleşik Ayet Gruplaması + Tam Genişlik Metin) */}
              <div className="space-y-3.5">
                {bundle.segments.map((segment) => {
                  const mealGroups = groupSegmentMealVerses(
                    segment.verses,
                    getPrimaryVerse,
                    getSecondaryVerse,
                    isDual,
                    settings.showFootnotes,
                    settings.highlightSajdah,
                  );

                  return (
                    <div key={`meal-seg-${bundle.pageNo}-${segment.surahMeta.no}`} className="space-y-2">
                      {segment.startsAtAyah1 && (
                        <div
                          className="rounded-xl border px-3 py-1.5 flex items-center justify-between gap-2"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <span className="text-xs font-extrabold truncate">
                            {segment.surahMeta.no}. {formatSurahTitle(segment.surahMeta.nameTr, segment.surahMeta.no)}
                          </span>
                          <span className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>
                            {segment.surahMeta.ayahCount} Ayet
                          </span>
                        </div>
                      )}

                      {segment.showBesmele && (() => {
                        const isBesmeleMealPlaying = Boolean(
                          playingAyahId &&
                            segment.verses[0]?.id === playingAyahId &&
                            audioState.activePhase === 'besmele',
                        );
                        const softPlayingBg =
                          settings.theme === 'dark'
                            ? 'rgba(45, 212, 191, 0.13)'
                            : 'rgba(13, 148, 136, 0.10)';
                        const mealBesmele = resolveMealBesmelePresentation(primaryMeal, besmele);
                        return (
                          <p
                            dir={mealBesmele.dir}
                            lang={mealBesmele.isArabic ? 'ar' : primaryMeal.lang ?? 'tr'}
                            className={`${
                              mealBesmele.isArabic
                                ? 'arabic-text text-lg sm:text-xl leading-[2.0]'
                                : 'turkish-reading text-xs sm:text-sm italic font-semibold'
                            } text-center py-1 px-2 rounded-lg transition-colors`}
                            style={{
                              color: 'var(--brand-primary-text)',
                              backgroundColor: isBesmeleMealPlaying ? softPlayingBg : 'transparent',
                            }}
                          >
                            {mealBesmele.text}
                          </p>
                        );
                      })()}

                      <div className="space-y-2">
                        {mealGroups.map((group) => {
                          const isMerged = group.verses.length > 1;
                          const playingVerseInGroup =
                            audioState.activePhase !== 'besmele'
                              ? (group.verses.find((v) => v.id === playingAyahId) ?? null)
                              : null;
                          const selectedVerseInGroup =
                            group.verses.find((v) => v.id === explicitSelectedVerse?.id) ?? null;
                          const targetVerse =
                            playingVerseInGroup ?? selectedVerseInGroup ?? group.verses[0];
                          const isGroupPlaying = Boolean(playingVerseInGroup);
                          const isGroupSelected = Boolean(selectedVerseInGroup);
                          const isFav = bookmarkedSet.has(targetVerse.id);
                          const isSajdah = group.hasSajdah;
                          const totalFootnotes =
                            group.primaryFootnotes.length + group.secondaryFootnotes.length;
                          const isFootnoteOpen = openFootnoteKey === group.key;
                          const rangeLabel = isMerged
                            ? `(${group.startAyah}–${group.endAyah})`
                            : `(${group.startAyah})`;
                          const ayahIdsAttr = group.verses.map((v) => v.id).join(' ');
                          const groupNotes = group.verses
                            .map((v) => ({
                              verse: v,
                              note: verseNotesMap.get(makeVerseNoteKey(v.surah, v.ayah)),
                            }))
                            .filter(
                              (
                                item,
                              ): item is {
                                verse: CombinedVerse;
                                note: NonNullable<typeof item.note>;
                              } => Boolean(item.note),
                            );
                          const primaryGroupNote = groupNotes[0] ?? null;
                          const primaryGroupNoteStyle = primaryGroupNote
                            ? VERSE_NOTE_COLOR_STYLES[primaryGroupNote.note.color]
                            : null;

                          const handleSelectGroupCard = () => {
                            handleSelectOrToggleVerse(targetVerse, 'meal');
                          };

                          return (
                            <div
                              key={`facing-meal-${group.key}`}
                              id={`facing-meal-ayah-${group.verses[0].id}`}
                              data-meal-ayahs={ayahIdsAttr}
                              role="button"
                              tabIndex={0}
                              onClick={handleSelectGroupCard}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSelectGroupCard();
                                }
                              }}
                              className="group rounded-xl px-3 py-2.5 transition-colors cursor-pointer border"
                              style={{
                                backgroundColor: isGroupPlaying
                                  ? 'var(--brand-primary-soft)'
                                  : isGroupSelected
                                    ? 'rgba(217, 119, 6, 0.12)'
                                    : isSajdah
                                      ? 'rgba(217, 119, 6, 0.07)'
                                      : 'transparent',
                                borderColor: isGroupPlaying
                                  ? 'var(--brand-primary)'
                                  : isGroupSelected
                                    ? 'rgba(217, 119, 6, 0.4)'
                                    : isSajdah
                                      ? 'rgba(217, 119, 6, 0.38)'
                                      : 'var(--border-subtle)',
                              }}
                            >
                              <div className="flex flex-col gap-2 w-full">
                                {/* Üst Başlık Satırı: Sol (1–5) / (12) ayet rozeti + alt ayet seçiciler, Sağ aksiyon butonları */}
                                <div className="flex flex-wrap items-center justify-between w-full gap-x-2 gap-y-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap min-w-fit max-w-full">
                                    <span
                                      title={
                                        group.mgRange &&
                                        (group.mgRange[0] !== group.startAyah ||
                                          group.mgRange[1] !== group.endAyah)
                                          ? `Birleşik meal: ${group.mgRange[0]}–${group.mgRange[1]}. ayetler`
                                          : isMerged
                                            ? `${group.startAyah}–${group.endAyah}. ayetler (birleşik meal)`
                                            : `${group.startAyah}. ayet`
                                      }
                                      className="inline-flex items-center justify-center min-w-[30px] h-6 px-1.5 rounded-lg text-[11px] font-extrabold tabular-nums shrink-0"
                                      style={{
                                        backgroundColor: isGroupPlaying
                                          ? 'var(--brand-primary)'
                                          : isGroupSelected || isSajdah
                                            ? 'var(--brand-accent)'
                                            : 'var(--bg-surface-soft)',
                                        color:
                                          isGroupPlaying || isGroupSelected || isSajdah
                                            ? '#FFFFFF'
                                            : 'var(--brand-primary-text)',
                                      }}
                                    >
                                      {rangeLabel}
                                    </span>

                                    {isMerged && (
                                      <div
                                        className="flex items-center gap-1 flex-wrap"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {group.verses.map((v) => {
                                          const chipPlaying =
                                            playingAyahId === v.id &&
                                            audioState.activePhase !== 'besmele';
                                          const chipSelected = explicitSelectedVerse?.id === v.id;
                                          return (
                                            <button
                                              key={`chip-${v.id}`}
                                              type="button"
                                              onClick={() => handleSelectOrToggleVerse(v, 'meal')}
                                              title={`${v.ayah}. ayeti Mushaf'ta göster`}
                                              className="min-w-[22px] h-5 px-1 rounded-md text-[10px] font-extrabold tabular-nums transition-colors cursor-pointer border"
                                              style={{
                                                backgroundColor: chipPlaying
                                                  ? 'var(--brand-primary)'
                                                  : chipSelected
                                                    ? 'var(--brand-accent)'
                                                    : 'var(--bg-surface-soft)',
                                                borderColor: chipPlaying
                                                  ? 'var(--brand-primary)'
                                                  : chipSelected
                                                    ? 'var(--brand-accent)'
                                                    : 'var(--border-subtle)',
                                                color:
                                                  chipPlaying || chipSelected
                                                    ? '#FFFFFF'
                                                    : 'var(--text-secondary)',
                                              }}
                                            >
                                              {v.ayah}
                                            </button>
                                          );
                                        })}
                                        {playingVerseInGroup && (
                                          <span
                                            className="inline-flex items-center px-1.5 h-5 rounded-md text-[10px] font-bold whitespace-nowrap"
                                            style={{
                                              backgroundColor: 'var(--bg-surface)',
                                              color: 'var(--brand-primary-text)',
                                            }}
                                          >
                                            Okunan: {playingVerseInGroup.ayah}. Ayet
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {isSajdah && (
                                      <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-extrabold whitespace-nowrap"
                                        style={{
                                          backgroundColor: 'var(--brand-accent-soft)',
                                          borderColor: 'rgba(217, 119, 6, 0.45)',
                                          color: 'var(--brand-accent-text)',
                                        }}
                                      >
                                        <span>۩</span>
                                        <span>Tilâvet Secdesi</span>
                                      </span>
                                    )}

                                    {settings.showRukuMarkers &&
                                      (() => {
                                        const groupRukuEnd =
                                          group.verses
                                            .map((v) => getRukuEndingAt(v.surah, v.ayah))
                                            .find((r) => Boolean(r)) ?? null;
                                        return groupRukuEnd ? (
                                          <RukuMarkerBadge
                                            ruku={groupRukuEnd}
                                            surahNameTr={segment.surahMeta.nameTr}
                                            page={bundle.pageNo}
                                            variant="pill"
                                          />
                                        ) : null;
                                      })()}

                                    {isGroupPlaying &&
                                      isMealAudioFlowActive &&
                                      activeSpokenMeal &&
                                      activeSpokenMeal.mealId !== primaryMeal.id &&
                                      (!isDual || activeSpokenMeal.mealId !== secondaryMeal.id) && (
                                        <span
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap"
                                          style={{
                                            backgroundColor: 'var(--bg-surface)',
                                            borderColor: 'var(--border-subtle)',
                                            color: 'var(--text-muted)',
                                          }}
                                        >
                                          <Volume2 className="w-3 h-3 shrink-0" />
                                          <span>Ses: {activeSpokenMeal.label}</span>
                                        </span>
                                      )}

                                    {primaryGroupNote && primaryGroupNoteStyle && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openVerseNoteModal(
                                            primaryGroupNote.verse.surah,
                                            primaryGroupNote.verse.ayah,
                                            bundle.pageNo,
                                          );
                                        }}
                                        title="Kişisel ayet notunu görüntüle veya düzenle"
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10.5px] font-extrabold whitespace-nowrap cursor-pointer hover:opacity-85"
                                        style={{
                                          backgroundColor: primaryGroupNoteStyle.softBg,
                                          borderColor: primaryGroupNoteStyle.border,
                                          color: primaryGroupNoteStyle.badgeText,
                                        }}
                                      >
                                        <StickyNote className="w-3 h-3 shrink-0" />
                                        <span>
                                          Not{groupNotes.length > 1 ? ` (${groupNotes.length})` : ''}
                                        </span>
                                      </button>
                                    )}
                                  </div>

                                  <div
                                    className="flex items-center gap-0.5 ml-auto shrink-0 opacity-85 group-hover:opacity-100"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedVerseKey(
                                          `${targetVerse.surah}:${targetVerse.ayah}`,
                                        );
                                        onSelectVerse(targetVerse);
                                        onPlayFromVerse(targetVerse, false);
                                      }}
                                      title={`${targetVerse.ayah}. ayetten dinle`}
                                      aria-label={`${targetVerse.ayah}. ayetten dinle`}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                      style={{ color: 'var(--brand-primary-text)' }}
                                    >
                                      <Play className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sfxService.play('click');
                                        if (manifest && meta) {
                                          const sName =
                                            meta.surahs.find((s) => s.no === targetVerse.surah)
                                              ?.nameTr ?? `${targetVerse.surah}. Sure`;
                                          void audioQueueService.startSegmentQueue({
                                            items: [
                                              {
                                                id: `loop_${targetVerse.id}`,
                                                type: 'ayah_range',
                                                label: `${sName} ${targetVerse.ayah}. Ayet`,
                                                surah: targetVerse.surah,
                                                startAyah: targetVerse.ayah,
                                                endAyah: targetVerse.ayah,
                                              },
                                            ],
                                            title: `${sName} ${targetVerse.ayah}. Ayet`,
                                            context: 'single',
                                            contextKey: `single:${targetVerse.id}`,
                                            manifest,
                                            meta,
                                            prefs: audioPrefs,
                                            queueLoopOverride: 'infinite',
                                          });
                                        }
                                      }}
                                      title={`${targetVerse.ayah}. ayeti döngüde dinle`}
                                      aria-label={`${targetVerse.ayah}. ayeti döngüde dinle`}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                      style={{ color: 'var(--brand-primary-text)' }}
                                    >
                                      <Repeat className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sfxService.play('click');
                                        const sName =
                                          meta?.surahs.find((s) => s.no === targetVerse.surah)
                                            ?.nameTr ?? `${targetVerse.surah}. Sure`;
                                        openListeningDrawer({
                                          initialTab: 'playlists',
                                          pendingAddItem: {
                                            type: 'ayah_range',
                                            label: `${sName} ${targetVerse.ayah}. Ayet`,
                                            surah: targetVerse.surah,
                                            startAyah: targetVerse.ayah,
                                            endAyah: targetVerse.ayah,
                                          },
                                        });
                                      }}
                                      title={`${targetVerse.ayah}. ayeti çalma listesine ekle`}
                                      aria-label={`${targetVerse.ayah}. ayeti çalma listesine ekle`}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      <ListPlus className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sfxService.play('click');
                                        openMealCompare(targetVerse.surah, targetVerse.ayah);
                                      }}
                                      title={`${targetVerse.ayah}. ayeti ${MEALS_CATALOG.length} meal ve tefsirde karşılaştır`}
                                      aria-label={`${targetVerse.ayah}. ayeti ${MEALS_CATALOG.length} meal ve tefsirde karşılaştır`}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                      style={{ color: 'var(--brand-primary-text)' }}
                                    >
                                      <Scale className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onToggleBookmark(targetVerse.id)}
                                      title={
                                        isFav
                                          ? `${targetVerse.ayah}. ayeti favorilerden çıkar`
                                          : `${targetVerse.ayah}. ayeti favorile`
                                      }
                                      aria-label={isFav ? 'Favorilerden çıkar' : 'Favorile'}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-amber-500/15 cursor-pointer"
                                      style={{
                                        color: isFav
                                          ? 'var(--brand-accent-text)'
                                          : 'var(--text-muted)',
                                      }}
                                    >
                                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openVerseNoteModal(
                                          targetVerse.surah,
                                          targetVerse.ayah,
                                          bundle.pageNo,
                                        )
                                      }
                                      title={
                                        primaryGroupNote
                                          ? `${targetVerse.ayah}. ayet notunu düzenle`
                                          : `${targetVerse.ayah}. ayete kişisel not ekle`
                                      }
                                      aria-label={`${targetVerse.ayah}. ayet notu`}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                      style={{
                                        color: primaryGroupNoteStyle
                                          ? primaryGroupNoteStyle.dot
                                          : 'var(--text-muted)',
                                      }}
                                    >
                                      <StickyNote className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sfxService.play('click');
                                        setSelectedVerseKey(
                                          `${targetVerse.surah}:${targetVerse.ayah}`,
                                        );
                                        onSelectVerse(targetVerse);
                                        audioQueueService.syncPausedSelection(targetVerse, meta);
                                        setIsVerseDrawerOpen(true);
                                      }}
                                      title={`${targetVerse.ayah}. ayet detayı, dipnot ve kelime meali`}
                                      aria-label={`${targetVerse.ayah}. ayet detayını aç`}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      <Info className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Alt Metin Alanı: Birleşik ayetler tekrar etmeden tek kartta tam genişlikte */}
                                <div className="w-full space-y-1.5">
                                  {group.primaryText ? (
                                    (() => {
                                      const primaryPres = getMealTextPresentation(
                                        primaryMeal,
                                        settings.turkishFontSize,
                                      );
                                      return (
                                        <div className="w-full">
                                          {isDual && primaryPres.isRtl && (
                                            <span
                                              className="block font-extrabold mb-0.5 text-xs"
                                              style={{ color: 'var(--brand-primary-text)' }}
                                            >
                                              {primaryMeal.shortLabel}
                                            </span>
                                          )}
                                          <p
                                            dir={primaryPres.dir}
                                            lang={primaryPres.lang}
                                            className={
                                              primaryPres.isRtl
                                                ? `${primaryPres.className} w-full`
                                                : `${primaryPres.className} w-full leading-relaxed`
                                            }
                                            style={{
                                              fontSize: `${primaryPres.fontSizePx}px`,
                                              fontFamily: primaryPres.fontFamily,
                                              color: 'var(--text-primary)',
                                            }}
                                          >
                                            {isDual && !primaryPres.isRtl && (
                                              <span
                                                className="font-extrabold mr-1.5 text-xs"
                                                style={{ color: 'var(--brand-primary-text)' }}
                                              >
                                                {primaryMeal.shortLabel}:
                                              </span>
                                            )}
                                            {group.primaryText}
                                          </p>
                                        </div>
                                      );
                                    })()
                                  ) : isLoadingExtra ? (
                                    <div className="h-4 w-4/5 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                                  ) : null}

                                  {isDual &&
                                    (group.secondaryEntries.length > 0 ? (
                                      (() => {
                                        const secondaryPres = getMealTextPresentation(
                                          secondaryMeal,
                                          settings.turkishFontSize,
                                        );
                                        return (
                                          <div className="space-y-1">
                                            {secondaryPres.isRtl && (
                                              <span
                                                className="block font-extrabold text-xs"
                                                style={{ color: 'var(--brand-accent-text)' }}
                                              >
                                                {secondaryMeal.shortLabel}
                                              </span>
                                            )}
                                            {group.secondaryEntries.map((entry, idx) => (
                                              <p
                                                key={`sec-${group.key}-${idx}`}
                                                dir={secondaryPres.dir}
                                                lang={secondaryPres.lang}
                                                className={
                                                  secondaryPres.isRtl
                                                    ? `${secondaryPres.className} w-full`
                                                    : `${secondaryPres.className} w-full leading-relaxed`
                                                }
                                                style={{
                                                  fontSize: `${secondaryPres.fontSizePx}px`,
                                                  fontFamily: secondaryPres.fontFamily,
                                                  color: 'var(--text-secondary)',
                                                }}
                                              >
                                                {idx === 0 && !secondaryPres.isRtl && (
                                                  <span
                                                    className="font-extrabold mr-1.5 text-xs"
                                                    style={{ color: 'var(--brand-accent-text)' }}
                                                  >
                                                    {secondaryMeal.shortLabel}:
                                                  </span>
                                                )}
                                                {entry.ayahLabel && (
                                                  <span
                                                    dir="ltr"
                                                    className={`font-bold text-xs tabular-nums ${
                                                      secondaryPres.isRtl ? 'ml-1.5' : 'mr-1'
                                                    }`}
                                                    style={{ color: 'var(--brand-accent-text)' }}
                                                  >
                                                    {entry.ayahLabel}
                                                  </span>
                                                )}
                                                {entry.text}
                                              </p>
                                            ))}
                                          </div>
                                        );
                                      })()
                                    ) : isLoadingExtra ? (
                                      <div className="h-4 w-3/4 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                                    ) : null)}

                                  {totalFootnotes > 0 && (
                                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          sfxService.play('click');
                                          setOpenFootnoteKey((prev) =>
                                            prev === group.key ? null : group.key,
                                          );
                                        }}
                                        aria-expanded={isFootnoteOpen}
                                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors"
                                        style={{
                                          backgroundColor: isFootnoteOpen
                                            ? 'var(--brand-primary-soft)'
                                            : 'var(--bg-surface-soft)',
                                          borderColor: isFootnoteOpen
                                            ? 'var(--brand-primary)'
                                            : 'var(--border-subtle)',
                                          color: 'var(--brand-primary-text)',
                                        }}
                                      >
                                        <FileText className="w-3.5 h-3.5 shrink-0" />
                                        <span>
                                          {isFootnoteOpen
                                            ? 'Dipnotu Gizle'
                                            : `Dipnot (${totalFootnotes})`}
                                        </span>
                                      </button>

                                      {isFootnoteOpen && (
                                        <div
                                          className="mt-1.5 w-full rounded-xl border p-2.5 space-y-1.5 text-xs leading-relaxed"
                                          style={{
                                            backgroundColor: 'var(--bg-surface-soft)',
                                            borderColor: 'var(--border-subtle)',
                                            color: 'var(--text-secondary)',
                                          }}
                                        >
                                          {group.primaryFootnotes.map((fn, idx) => (
                                            <p key={`pfn-${group.key}-${idx}`}>
                                              <span
                                                className="font-extrabold mr-1"
                                                style={{ color: 'var(--brand-primary-text)' }}
                                              >
                                                [{primaryMeal.shortLabel} {idx + 1}]
                                              </span>
                                              {fn}
                                            </p>
                                          ))}
                                          {group.secondaryFootnotes.map((fn, idx) => (
                                            <p key={`sfn-${group.key}-${idx}`}>
                                              <span
                                                className="font-extrabold mr-1"
                                                style={{ color: 'var(--brand-accent-text)' }}
                                              >
                                                [{secondaryMeal.shortLabel} {idx + 1}]
                                              </span>
                                              {fn}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {groupNotes.length > 0 && (
                                    <div className="pt-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                      {groupNotes.map(({ verse: nv, note: vn }) => {
                                        const st = VERSE_NOTE_COLOR_STYLES[vn.color];
                                        return (
                                          <button
                                            key={`mushaf-note-${vn.key}`}
                                            type="button"
                                            onClick={() =>
                                              openVerseNoteModal(nv.surah, nv.ayah, bundle.pageNo)
                                            }
                                            className="w-full text-left rounded-lg border px-2.5 py-1.5 text-xs space-y-0.5 cursor-pointer hover:opacity-95"
                                            style={{
                                              backgroundColor: st.softBg,
                                              borderColor: st.border,
                                            }}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span
                                                className="inline-flex items-center gap-1 text-[10.5px] font-extrabold"
                                                style={{ color: st.badgeText }}
                                              >
                                                <StickyNote className="w-3 h-3 shrink-0" />
                                                <span>
                                                  Notum
                                                  {isMerged ? ` (${nv.ayah}. Ayet)` : ''}
                                                </span>
                                              </span>
                                              <span
                                                className="text-[10px] font-bold underline"
                                                style={{ color: st.badgeText }}
                                              >
                                                Düzenle
                                              </span>
                                            </div>
                                            {vn.text && (
                                              <p
                                                className="text-xs leading-snug whitespace-pre-wrap line-clamp-2"
                                                style={{ color: 'var(--text-primary)' }}
                                              >
                                                {vn.text}
                                              </p>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Alt Bilgi */}
              <div
                className="mt-4 pt-2 border-t flex items-center justify-between gap-2 text-[11px] font-semibold shrink-0"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                {isMealMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openMealSelector('primary');
                      }}
                      title={`${MEALS_CATALOG.length} meal ve tefsir arasından değiştir`}
                      className="truncate hover:underline text-left cursor-pointer font-bold"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      {mealTitle}
                    </button>
                    <span className="tabular-nums shrink-0 font-bold">
                      — {bundle.pageNo} / {bundle.maxPage} —
                    </span>
                  </>
                ) : (
                  <>
                    <span>Senkronize Meal Sayfası</span>
                    <span className="tabular-nums">Sayfa {bundle.pageNo}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const isAudioSessionActive = audioState.isVisible && audioState.status !== 'idle';
  const isSelectedSameAsPlaying = Boolean(
    explicitSelectedVerse && playingAyahId && explicitSelectedVerse.id === playingAyahId,
  );
  const desktopSpreadHeightClass =
    isAudioBarVisible && isTajweedLegendVisible
      ? 'lg:h-[calc(100dvh-14.25rem)] lg:min-h-[380px]'
      : isAudioBarVisible
        ? 'lg:h-[calc(100dvh-10.75rem)] lg:min-h-[420px]'
        : isTajweedLegendVisible
          ? 'lg:h-[calc(100dvh-8.75rem)] lg:min-h-[480px]'
          : 'lg:h-[calc(100dvh-5.25rem)] lg:min-h-[540px]';

  return (
    <div className="space-y-3" onClick={handleMobileEmptySpaceTap}>
      {/* ====================================================================
          ANA ALAN: 6 Modlu İki Aşamalı Mushaf & Meal Kitap Sahnesi
          - single: Tek Sayfa Arapça Mushaf
          - dual: 2 Sayfa Açık Mushaf (RTL: Sağ N, Sol N+1)
          - mushaf_meal: Karşılıklı (Sağ Mushaf · Sol Senkronize Meal)
          - rahle_dual: 2 Sayfa Rahle (RTL 2 Sayfa Mushaf + Tıklanan Ayet İnceleyici)
          - meal_only: Tek Sayfa Türkçe Meal
          - meal_dual: 2 Sayfa Açık Kitap Meal (LTR: Sol N, Sağ N+1)
          ==================================================================== */}
      <div
        className={
          isBookSpread
            ? `space-y-2.5 lg:flex lg:flex-col lg:gap-0 lg:space-y-0 lg:overflow-visible ${desktopSpreadHeightClass}`
            : `max-w-[54rem] mx-auto w-full space-y-2 ${isAudioBarVisible ? 'pb-32 lg:pb-24' : ''}`
        }
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Masaüstü (lg+) Sağ/Sol Dış Kenar Sayfa Çevirme Okları + Kitap Çerçevesi (Akıllı LTR/RTL Yönü) */}
        <div
          className={`flex items-stretch justify-center gap-0 lg:gap-3 ${
            isBookSpread ? 'lg:flex-1 lg:min-h-0' : ''
          }`}
        >
          {/* Sol Dış Kenar Oku (LTR: Önceki Sayfa | RTL: Sonraki Sayfa) */}
          <div
            className={`hidden lg:flex flex-col items-center shrink-0 w-11 ${
              isBookSpread ? 'justify-center' : 'justify-start'
            }`}
          >
            <button
              type="button"
              disabled={leftActionDisabled}
              onClick={() => {
                sfxService.play('click');
                onChangePage(leftActionTarget);
              }}
              title={
                !leftActionDisabled
                  ? `${leftActionLabel} (Sayfa ${leftActionTarget})`
                  : leftActionDisabledTitle
              }
              aria-label={leftActionLabel}
              className={`${
                isBookSpread ? '' : 'sticky top-1/2 -translate-y-1/2'
              } w-11 py-3 rounded-2xl border flex flex-col items-center justify-center gap-1 opacity-55 hover:opacity-100 focus-visible:opacity-100 transition-all cursor-pointer disabled:opacity-15 disabled:cursor-not-allowed shadow-xs hover:border-[var(--brand-primary)]`}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ChevronLeft className="w-5 h-5 shrink-0" />
              {!leftActionDisabled && (
                <span
                  className="text-[10px] font-extrabold tabular-nums leading-none"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {leftActionTarget}
                </span>
              )}
            </button>
          </div>

          {/* Orta: Yaprak Çerçevesi */}
          <div
            className={`flex-1 min-w-0 ${
              isBookSpread ? 'lg:flex lg:flex-col lg:min-h-0' : 'max-w-3xl mx-auto w-full'
            }`}
          >
            {isMealMode ? (
              isMealDual && secondPageBundle ? (
                /* 2 SAYFA AÇIK KİTAP MEAL (LTR Türkçe Kitap Yönü — SOLDA pageNo, SAĞDA pageNo+1) */
                <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
                  <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-0 items-stretch lg:flex-1 lg:min-h-0">
                    <div
                      aria-hidden="true"
                      className="hidden lg:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
                    />
                    <div className="lg:h-full lg:min-h-0">
                      {renderFacingMealLeaf(pageBundle, 'left')}
                    </div>
                    <div className="lg:h-full lg:min-h-0">
                      {renderFacingMealLeaf(secondPageBundle, 'right')}
                    </div>
                  </div>
                </div>
              ) : (
                /* TEK SAYFA MEAL (Odaklı ortalanmış Türkçe Meal yaprağı) */
                <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
                  {renderFacingMealLeaf(pageBundle, 'single')}
                </div>
              )
            ) : isDualArabic && secondPageBundle ? (
              /* AÇIK MUSHAF / 2 SAYFA RAHLE (Gerçek RTL kitap açılımı — SAĞDA pageNo, SOLDA pageNo+1) */
              <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
                <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-0 items-stretch lg:flex-1 lg:min-h-0">
                  <div
                    aria-hidden="true"
                    className="hidden lg:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
                  />
                  <div className="order-2 lg:order-1 lg:h-full lg:min-h-0">
                    {renderMushafLeaf(secondPageBundle, 'left')}
                  </div>
                  <div className="order-1 lg:order-2 lg:h-full lg:min-h-0">
                    {renderMushafLeaf(pageBundle, 'right')}
                  </div>
                </div>
              </div>
            ) : isDoubleMeal ? (
              /* SAĞ MUSHAF · SOL MEAL AÇIK KİTAP YAYILIMI (Mobilde üstte Mushaf, altta Meal) */
              <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
                <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-0 items-stretch lg:flex-1 lg:min-h-0">
                  <div
                    aria-hidden="true"
                    className="hidden lg:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
                  />
                  <div className="order-2 lg:order-1 lg:h-full lg:min-h-0">
                    {renderFacingMealLeaf(pageBundle, 'left')}
                  </div>
                  <div className="order-1 lg:order-2 lg:h-full lg:min-h-0">
                    {renderMushafLeaf(pageBundle, 'right')}
                  </div>
                </div>
              </div>
            ) : (
              /* TEK SAYFA MUSHAF (Katmanlı Yaprak Kenarlı Cilt Çerçevesi) */
              <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
                {renderMushafLeaf(pageBundle, 'single')}
              </div>
            )}
          </div>

          {/* Sağ Dış Kenar Oku (LTR: Sonraki Sayfa | RTL: Önceki Sayfa) */}
          <div
            className={`hidden lg:flex flex-col items-center shrink-0 w-11 ${
              isBookSpread ? 'justify-center' : 'justify-start'
            }`}
          >
            <button
              type="button"
              disabled={rightActionDisabled}
              onClick={() => {
                sfxService.play('click');
                onChangePage(rightActionTarget);
              }}
              title={
                !rightActionDisabled
                  ? `${rightActionLabel} (Sayfa ${rightActionTarget})`
                  : rightActionDisabledTitle
              }
              aria-label={rightActionLabel}
              className={`${
                isBookSpread ? '' : 'sticky top-1/2 -translate-y-1/2'
              } w-11 py-3 rounded-2xl border flex flex-col items-center justify-center gap-1 opacity-55 hover:opacity-100 focus-visible:opacity-100 transition-all cursor-pointer disabled:opacity-15 disabled:cursor-not-allowed shadow-xs hover:border-[var(--brand-primary)]`}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ChevronRight className="w-5 h-5 shrink-0" />
              {!rightActionDisabled && (
                <span
                  className="text-[10px] font-extrabold tabular-nums leading-none"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {rightActionTarget}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Entegre Rahle Alt Kontrol Kapsülü (Tüm Sayfa & Seçili Ayet Aksiyonları Korunur) */}
        <div
          className="relative z-20 -mt-2 lg:-mt-2.5 mx-auto w-fit max-w-full min-h-[36px] px-1.5 sm:px-2 py-1 rounded-full border shadow-md backdrop-blur-md flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 shrink-0"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <button
            type="button"
            disabled={leftActionDisabled}
            onClick={() => {
              sfxService.play('click');
              onChangePage(leftActionTarget);
            }}
            title={
              !leftActionDisabled
                ? `${leftActionLabel} (Sayfa ${leftActionTarget})`
                : leftActionDisabledTitle
            }
            className="min-h-[32px] sm:min-h-[30px] px-2.5 sm:px-3 rounded-full text-[11.5px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)] disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap"
            style={{ color: 'var(--text-primary)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
            <span>{leftActionLabel}</span>
          </button>

          <span
            aria-hidden="true"
            className="h-4 w-px shrink-0"
            style={{ backgroundColor: 'var(--border-subtle)' }}
          />

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onOpenLocationPicker?.('page');
            }}
            title="Sayfa seçiciyi aç"
            className="min-h-[30px] px-2 sm:px-2.5 rounded-full text-[11.5px] sm:text-xs font-extrabold tabular-nums transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)] whitespace-nowrap"
            style={{ color: 'var(--text-secondary)' }}
          >
            {isAnyDualPages && secondPageBundle
              ? `Sayfa ${pageBundle.pageNo}–${secondPageBundle.pageNo}`
              : `Sayfa ${pageBundle.pageNo}`}
          </button>

          {explicitSelectedVerse ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-px shrink-0"
                style={{ backgroundColor: 'var(--border-subtle)' }}
              />
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSelectedVerseKey(null);
                  setIsVerseDrawerOpen(false);
                }}
                title="Ayet seçimini temizle (Esc)"
                className="min-h-[30px] px-2 rounded-full text-[11px] sm:text-xs font-extrabold tabular-nums inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <span>
                  Seçili: {explicitSelectedVerse.surah}:{explicitSelectedVerse.ayah}
                </span>
                <X className="w-3 h-3 shrink-0 opacity-75" />
              </button>
              {(!isAudioSessionActive || !isSelectedSameAsPlaying) && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onPlayFromVerse(explicitSelectedVerse, false);
                  }}
                  title={`${explicitSelectedVerse.surah}:${explicitSelectedVerse.ayah} ayetinden itibaren kesintisiz dinle`}
                  className="min-h-[30px] px-2.5 rounded-full text-[11px] sm:text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Play className="w-3 h-3 fill-current shrink-0" />
                  <span>
                    {isAudioSessionActive
                      ? `${explicitSelectedVerse.ayah}. Ayete Geç`
                      : 'Dinle'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsVerseDrawerOpen((prev) => !prev);
                }}
                aria-pressed={isVerseDrawerOpen}
                className="min-h-[30px] px-2.5 rounded-full border text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isVerseDrawerOpen
                    ? 'var(--brand-primary)'
                    : 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                  color: isVerseDrawerOpen ? '#FFFFFF' : 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3 h-3 shrink-0" />
                <span>
                  {isVerseDrawerOpen
                    ? 'Kapat'
                    : isAudioSessionActive
                      ? 'Meal'
                      : 'Meal & Analiz'}
                </span>
              </button>
            </>
          ) : (
            inspectorVerse && (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-px shrink-0"
                  style={{ backgroundColor: 'var(--border-subtle)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setIsVerseDrawerOpen((prev) => !prev);
                  }}
                  aria-pressed={isVerseDrawerOpen}
                  className="min-h-[30px] px-2.5 rounded-full border text-[11.5px] sm:text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor: isVerseDrawerOpen
                      ? 'var(--brand-primary)'
                      : 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: isVerseDrawerOpen ? '#FFFFFF' : 'var(--brand-primary-text)',
                  }}
                >
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span>
                    {isVerseDrawerOpen
                      ? 'Kapat'
                      : isArOnly || isDualArabic
                        ? 'Meal'
                        : 'Ayet İncele'}
                  </span>
                </button>
              </>
            )
          )}

          <span
            aria-hidden="true"
            className="h-4 w-px shrink-0"
            style={{ backgroundColor: 'var(--border-subtle)' }}
          />

          <button
            type="button"
            disabled={rightActionDisabled}
            onClick={() => {
              sfxService.play('click');
              onChangePage(rightActionTarget);
            }}
            title={
              !rightActionDisabled
                ? `${rightActionLabel} (Sayfa ${rightActionTarget})`
                : rightActionDisabledTitle
            }
            className="min-h-[32px] sm:min-h-[30px] px-2.5 sm:px-3 rounded-full text-[11.5px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)] disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap"
            style={{ color: 'var(--text-primary)' }}
          >
            <span>{rightActionLabel}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAŞINABİLİR KOMPAKT AYET İNCELEME PENCERESİ (Arka Planı Karartmaz/Kilitlemez)
          ==================================================================== */}
      <DraggableVerseInspector
        isOpen={isVerseDrawerOpen}
        verse={inspectorVerse}
        surahMeta={selectedSurahMeta}
        settings={settings}
        wordMode={wordMode}
        isBookmarked={Boolean(inspectorVerse && bookmarkedSet.has(inspectorVerse.id))}
        isPlaying={Boolean(inspectorVerse && playingAyahId === inspectorVerse.id)}
        onClose={() => setIsVerseDrawerOpen(false)}
        onPlayFromVerse={(v) => {
          setSelectedVerseKey(`${v.surah}:${v.ayah}`);
          onPlayFromVerse(v, false);
        }}
        onPlayMealFromVerse={(v) => {
          setSelectedVerseKey(`${v.surah}:${v.ayah}`);
          onPlayMealFromVerse(v);
        }}
        onToggleBookmark={onToggleBookmark}
        onShareVerse={onShareVerse}
        onOpenSurahInfo={onOpenSurahInfo}
      />
    </div>
  );
};
