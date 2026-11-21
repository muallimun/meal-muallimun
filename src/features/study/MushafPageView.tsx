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
  Trash2,
  Volume2,
} from 'lucide-react';
import { BOOKMARK_COLOR_STYLES } from '../../components/PageBookmarksDrawer';
import {
  MEALS_CATALOG,
  getMealTextPresentation,
  resolveSpokenMealInfo,
} from '../../config/mealsConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { useRukusData } from '../../hooks/useStudyReferenceData';
import { useTajweedData } from '../../hooks/useTajweedData';
import { audioQueueService } from '../../services/audioQueueService';
import { RukuMarkerBadge } from './StudyPopovers';
import { SyncedVerseArabic } from './SyncedArabicText';
import {
  SAJDAH_AYAH_IDS,
  toArabicIndicDigits,
} from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  AppSettings,
  BesmeleInfo,
  BookContentMode,
  CombinedVerse,
  MealVerse,
  PageBundle,
  PageLayoutMode,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { formatSafeArabicTitle, formatSurahTitle } from '../../utils/arabicUtils';
import { DraggableVerseInspector } from './DraggableVerseInspector';
import type { LocationPickerTab } from './LocationPickerModal';

interface MushafPageViewProps {
  pageBundle: PageBundle;
  secondPageBundle?: PageBundle | null;
  pageLayout?: PageLayoutMode;
  onChangePageLayout?: (layout: PageLayoutMode) => void;
  contentMode?: BookContentMode;
  besmele: BesmeleInfo;
  settings: AppSettings;
  wordMode: WordMealMode;
  selectedVerseId: number | null;
  playingAyahId: number | null;
  autoScroll?: boolean;
  isAudioBarVisible?: boolean;
  isAudioBarExpanded?: boolean;
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
  pageLayout = 'single',
  onChangePageLayout,
  contentMode = 'interleaved',
  besmele,
  settings,
  wordMode,
  selectedVerseId,
  playingAyahId,
  autoScroll = true,
  isAudioBarVisible = false,
  isAudioBarExpanded = false,
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
    studyProgress,
    upsertPageBookmark,
    moveHatimBookmark,
    removePageBookmark,
    openBookmarksDrawer,
    openMealCompare,
    openMealSelector,
    openListeningDrawer,
    manifest,
    meta,
    audioPrefs,
  } = useAppStore();

  const { getRukuEndingAt } = useRukusData(settings.showRukuMarkers);

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

  const isArOnly = contentMode === 'ar_only' || pageLayout === 'single';
  const isDoubleMushaf = pageLayout === 'double_mushaf' && Boolean(secondPageBundle);
  const isDoubleMeal = pageLayout === 'double_meal';
  const isMealOnly = pageLayout === 'meal_only';
  const isBookSpread = isDoubleMushaf || isDoubleMeal;

  const allVisibleVerses = useMemo(() => {
    if (isDoubleMushaf && secondPageBundle) {
      return [...pageBundle.verses, ...secondPageBundle.verses];
    }
    return pageBundle.verses;
  }, [isDoubleMushaf, pageBundle.verses, secondPageBundle]);

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

  const selectedVerse =
    allVisibleVerses.find((v) => v.id === selectedVerseId) ?? allVisibleVerses[0] ?? null;

  const selectedSurahMeta = selectedVerse
    ? surahMetaByNo.get(selectedVerse.surah) ?? pageBundle.segments[0]?.surahMeta ?? null
    : pageBundle.segments[0]?.surahMeta ?? null;

  const bottomReservePx = isAudioBarExpanded ? 112 : isAudioBarVisible ? 32 : 20;

  const findTargetInPane = useCallback(
    (side: 'left' | 'right', ayahId: number): HTMLElement | null => {
      const paneEl = side === 'left' ? leftPaneRef.current : rightPaneRef.current;
      if (!paneEl) return null;
      if (isDoubleMeal && side === 'left') {
        return paneEl.querySelector<HTMLElement>(`[data-meal-ayahs~="${ayahId}"]`);
      }
      return paneEl.querySelector<HTMLElement>(`[data-ayah-id="${ayahId}"]`);
    },
    [isDoubleMeal],
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
  }, [pageBundle.pageNo, secondPageBundle?.pageNo, pageLayout]);

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

  // Klavye sol/sağ ok tuşları (Mushaf yönü: Sol = Sonraki, Sağ = Önceki)
  const pageStep = isDoubleMushaf ? 2 : 1;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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

      if (e.key === 'ArrowLeft' && pageBundle.pageNo < pageBundle.maxPage) {
        e.preventDefault();
        onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
      } else if (e.key === 'ArrowRight' && pageBundle.pageNo > pageBundle.minPage) {
        e.preventDefault();
        onChangePage(Math.max(pageBundle.minPage, pageBundle.pageNo - pageStep));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageBundle.pageNo, pageBundle.minPage, pageBundle.maxPage, pageStep, onChangePage]);

  // Mobilde yatay parmak kaydırma ile sayfa çevirme
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
    // RTL Mushaf sayfa çevirme: Sağa kaydır -> sonraki sayfa, Sola kaydır -> önceki sayfa
    if (dx > 0 && pageBundle.pageNo < pageBundle.maxPage) {
      sfxService.play('click');
      onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
    } else if (dx < 0 && pageBundle.pageNo > pageBundle.minPage) {
      sfxService.play('click');
      onChangePage(Math.max(pageBundle.minPage, pageBundle.pageNo - pageStep));
    }
  };

  const canGoPrev = pageBundle.pageNo > pageBundle.minPage;
  const canGoNext =
    (isDoubleMushaf && secondPageBundle ? secondPageBundle.pageNo : pageBundle.pageNo) <
    pageBundle.maxPage;

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
          className="relative flex items-center justify-center w-8 h-9 -mt-2 rounded-b-lg border-x border-b shadow-xs transition-transform hover:translate-y-0.5 cursor-pointer"
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
            className="absolute left-0 top-9 z-30 w-60 rounded-2xl border shadow-xl p-2 space-y-1 text-left"
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
      ? 'lg:pb-44'
      : isAudioBarVisible
        ? 'lg:pb-24'
        : 'lg:pb-3';
    const showJumpChip = Boolean(
      paneSide && playingAyahId && detachedPanes[paneSide] && bundle.verses.some((v) => v.id === playingAyahId),
    );
    const pageHasSajdah =
      settings.highlightSajdah && bundle.verses.some((v) => SAJDAH_AYAH_IDS.has(v.id));

    return (
      <div
        key={`mushaf-leaf-${bundle.pageNo}`}
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
            className={`mushaf-cetvel-inner rounded-[10px] relative flex-1 flex flex-col ${
              isDualPane ? 'lg:h-full lg:min-h-0' : 'justify-between'
            } ${
              compactPadding ? 'px-3.5 py-3 sm:px-5 sm:py-4' : 'px-3.5 py-3.5 sm:px-6 sm:py-5'
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
                    className="text-right min-w-0 flex items-center gap-1.5 justify-end hover:opacity-80 cursor-pointer"
                  >
                    <span
                      className="text-xs font-bold truncate hidden sm:inline"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {surahTitlesTr}
                    </span>
                    <span
                      className="arabic-title text-base sm:text-lg leading-none truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {surahTitlesAr}
                    </span>
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
                    ? `lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain scrollbar-thin lg:pr-1.5 ${paneScrollPadding}`
                    : ''
                }`}
              >
                {/* Sayfa Bölümleri (Sure Başlıkları + Besmele + Kesintisiz Ayet Akışı) */}
                <div className="space-y-4">
                {bundle.segments.map((segment) => (
                  <div key={`seg-${bundle.pageNo}-${segment.surahMeta.no}`} className="space-y-3">
                    {segment.startsAtAyah1 && (
                      <div
                        className="rounded-xl border px-3.5 py-2 relative overflow-hidden"
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
                            lineHeight: 2.28,
                            textAlign: 'justify',
                            textAlignLast: 'center',
                          }}
                        >
                          {segment.verses.map((verse) => {
                            const isSelected = selectedVerse?.id === verse.id;
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
                                ? 'rgba(45, 212, 191, 0.13)'
                                : 'rgba(13, 148, 136, 0.10)';

                            const highlightBg = isPlaying
                              ? audioState.isWordSyncActive
                                ? 'transparent'
                                : softPlayingBg
                              : isSelected
                                ? 'rgba(217, 119, 6, 0.18)'
                                : highlightSajdah
                                  ? 'rgba(217, 119, 6, 0.10)'
                                  : 'transparent';

                            return (
                              <span
                                key={verse.id}
                                id={`mushaf-ayah-${verse.id}`}
                                data-ayah-id={verse.id}
                                onClick={() => {
                                  sfxService.play('click');
                                  onSelectVerse(verse);
                                  if (isDoubleMeal) {
                                    syncLeftMealToVerse(verse.id);
                                  }
                                  setIsVerseDrawerOpen(true);
                                }}
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
                                    sfxService.play('click');
                                    onSelectVerse(verse);
                                    if (isDoubleMeal) {
                                      syncLeftMealToVerse(verse.id);
                                    }
                                    setIsVerseDrawerOpen(true);
                                  }
                                }}
                                className={`inline rounded-lg px-1 py-0.5 transition-colors cursor-pointer hover:bg-teal-600/10 focus-visible:outline-2 focus-visible:outline-teal-600 ${
                                  highlightSajdah
                                    ? 'underline decoration-amber-500/65 decoration-dotted underline-offset-[10px]'
                                    : ''
                                }`}
                                style={{ backgroundColor: highlightBg }}
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
                                    className="inline-flex items-center justify-center mx-1 px-1.5 py-0.5 rounded-md border text-[0.64em] font-extrabold align-middle leading-none select-none"
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
                                  <span
                                    className="inline-block mx-1.5 text-[0.76em] select-none align-middle rounded-md transition-colors"
                                    style={{
                                      color:
                                        isPlaying && audioState.isWordSyncActive
                                          ? 'var(--brand-accent-text)'
                                          : isPlaying
                                            ? 'var(--brand-primary-text)'
                                            : isSelected || highlightSajdah
                                              ? 'var(--brand-accent-text)'
                                              : 'var(--brand-primary-text)',
                                      backgroundColor:
                                        isPlaying && audioState.isWordSyncActive
                                          ? settings.theme === 'dark'
                                            ? 'rgba(251, 191, 36, 0.16)'
                                            : 'rgba(245, 158, 11, 0.16)'
                                          : 'transparent',
                                      boxShadow:
                                        isPlaying && audioState.isWordSyncActive
                                          ? settings.theme === 'dark'
                                            ? '0 0 0 2px rgba(251, 191, 36, 0.16)'
                                            : '0 0 0 2px rgba(245, 158, 11, 0.16)'
                                          : 'none',
                                    }}
                                    title={
                                      highlightSajdah
                                        ? `Tilâvet Secdesi · ${segment.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                        : `${segment.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                    }
                                  >
                                    ﴿{toArabicIndicDigits(verse.ayah)}﴾
                                  </span>
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
                  className="mt-4 pt-2 border-t flex items-center justify-center text-xs font-bold tabular-nums shrink-0"
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

  // Mushaf Çerçeveli Türkçe Meal Yaprağı (Sağ Mushaf · Sol Meal VE Sadece Türkçe Meal modları)
  const renderFacingMealLeaf = (
    bundle: PageBundle,
    side: 'single' | 'right' | 'left' = 'left',
  ) => {
    const mealTitle = isDual
      ? `${primaryMeal.shortLabel} & ${secondaryMeal.shortLabel}`
      : primaryMeal.label;

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
      ? 'lg:pb-44'
      : isAudioBarVisible
        ? 'lg:pb-24'
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

            {/* Sol Meal Sayfası Sabit Üst Şeridi (+ Aktif Ayete Git + ◫ Kapat veya Mushaf'a Dön ikonu) */}
            <div
              className="pb-2.5 mb-3 border-b flex items-center justify-between gap-2 text-xs shrink-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isMealOnly && side === 'single' && renderRibbonBookmark(bundle)}
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
                {isMealOnly && onChangePageLayout && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onChangePageLayout('single');
                    }}
                    title="Arapça Mushaf sayfasına dön"
                    className="h-7 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors hover:opacity-85 whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      borderColor: 'var(--brand-primary)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <BookOpen className="w-3 h-3 shrink-0" />
                    <span className="hidden sm:inline">Mushaf</span>
                  </button>
                )}
                {isDoubleMeal && side === 'left' && onChangePageLayout && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onChangePageLayout('single');
                    }}
                    title="Meal sayfasını kapat (Tek Sayfa Mushaf)"
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

            {/* Bağımsız Kaydırılabilir Meal Gövdesi (lg+ ikili görünümde) */}
            <div
              ref={paneSide === 'left' ? leftPaneRef : paneSide === 'right' ? rightPaneRef : undefined}
              onWheel={paneSide ? () => handlePaneUserScrollGesture(paneSide) : undefined}
              onTouchMove={paneSide ? () => handlePaneUserScrollGesture(paneSide) : undefined}
              onScroll={paneSide ? () => handlePaneScroll(paneSide) : undefined}
              className={`flex-1 flex flex-col justify-between ${
                isDualPane
                  ? `lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain scrollbar-thin lg:pr-1.5 ${paneScrollPadding}`
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
                        return (
                          <p
                            className="turkish-reading text-xs sm:text-sm italic text-center font-semibold py-1 px-2 rounded-lg transition-colors"
                            style={{
                              color: 'var(--brand-primary-text)',
                              backgroundColor: isBesmeleMealPlaying ? softPlayingBg : 'transparent',
                            }}
                          >
                            {primaryMeal.id === 'm2' ? besmele.dib : besmele.tdv}
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
                            group.verses.find((v) => v.id === selectedVerse?.id) ?? null;
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

                          const handleSelectGroupCard = () => {
                            sfxService.play('click');
                            onSelectVerse(targetVerse);
                            if (isDoubleMeal) {
                              syncRightMushafToVerse(targetVerse.id);
                            }
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
                                <div className="flex items-start justify-between w-full gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
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
                                          const chipSelected = selectedVerse?.id === v.id;
                                          return (
                                            <button
                                              key={`chip-${v.id}`}
                                              type="button"
                                              onClick={() => {
                                                sfxService.play('click');
                                                onSelectVerse(v);
                                                if (isDoubleMeal) {
                                                  syncRightMushafToVerse(v.id);
                                                }
                                              }}
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
                                  </div>

                                  <div
                                    className="flex items-center gap-0.5 shrink-0 opacity-85 group-hover:opacity-100"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onPlayFromVerse(targetVerse, false)}
                                      title={`${targetVerse.ayah}. ayetten dinle`}
                                      aria-label={`${targetVerse.ayah}. ayetten dinle`}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
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
                                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
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
                                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
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
                                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
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
                                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-amber-500/15 cursor-pointer"
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
                                      onClick={() => {
                                        sfxService.play('click');
                                        onSelectVerse(targetVerse);
                                        setIsVerseDrawerOpen(true);
                                      }}
                                      title={`${targetVerse.ayah}. ayet detayı, dipnot ve kelime meali`}
                                      aria-label={`${targetVerse.ayah}. ayet detayını aç`}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
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
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors"
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
                                        <FileText className="w-3 h-3 shrink-0" />
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
                <span>Senkronize Meal Sayfası</span>
                <span className="tabular-nums">Sayfa {bundle.pageNo}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3" onClick={handleMobileEmptySpaceTap}>
      {/* ====================================================================
          ANA ALAN: Gerçekçi Mushaf Kitap Çerçevesi
          - Tek Sayfa: Odaklı ortalanmış Mushaf yaprağı (tıklanan ayet DraggableVerseInspector açar)
          - 2 Sayfa: Yan yana 2 bağımsız kaydırılabilir Arapça Mushaf yaprağı (lg+)
          - Mushaf + Meal: Sağ Mushaf · Sol Bağımsız Kaydırılabilir Senkronize Meal yaprağı (lg+)
          ==================================================================== */}
      <div
        className={
          isBookSpread
            ? `space-y-3 lg:flex lg:flex-col lg:gap-2.5 lg:space-y-0 lg:overflow-hidden ${
                isAudioBarVisible
                  ? 'lg:h-[calc(100dvh-13.25rem)] lg:min-h-[420px]'
                  : 'lg:h-[calc(100dvh-8.75rem)] lg:min-h-[480px]'
              }`
            : 'max-w-3xl mx-auto w-full space-y-3'
        }
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isMealOnly ? (
          isDoubleMushaf && secondPageBundle ? (
            <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-0 items-stretch lg:flex-1 lg:min-h-0">
                <div
                  aria-hidden="true"
                  className="hidden lg:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
                />
                <div className="lg:h-full lg:min-h-0">{renderFacingMealLeaf(pageBundle, 'left')}</div>
                <div className="lg:h-full lg:min-h-0">
                  {renderFacingMealLeaf(secondPageBundle, 'right')}
                </div>
              </div>
            </div>
          ) : (
            <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
              {renderFacingMealLeaf(pageBundle, 'single')}
            </div>
          )
        ) : isDoubleMushaf && secondPageBundle ? (
          /* AÇIK MUSHAF YAYILIMI (2 Sayfa Arapça): Gerçek RTL kitap açılımı — SAĞDA pageNo, SOLDA pageNo+1 */
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
          /* SAĞ MUSHAF · SOL MEAL AÇIK KİTAP YAYILIMI (Bağımsız Kaydırılabilir Paneller) */
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

        {/* Sade Sayfa Geçiş Kontrolleri + Ayet İncele Tetikleyicisi */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => {
              sfxService.play('click');
              onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
            }}
            className="flex-1 sm:flex-initial min-h-[40px] px-3.5 sm:px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">
              {isDoubleMushaf ? 'Sonraki 2 Sayfa' : 'Sonraki Sayfa'}
            </span>
          </button>

          <div className="flex items-center justify-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onOpenLocationPicker?.('page');
              }}
              className="hidden sm:inline-flex text-xs font-bold tabular-nums hover:underline cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              {isDoubleMushaf && secondPageBundle
                ? `Sayfa ${pageBundle.pageNo}–${secondPageBundle.pageNo}`
                : `Sayfa ${pageBundle.pageNo}`}
            </button>

            {selectedVerse && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsVerseDrawerOpen((prev) => !prev);
                }}
                aria-pressed={isVerseDrawerOpen}
                className="min-h-[36px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isVerseDrawerOpen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isVerseDrawerOpen ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isVerseDrawerOpen
                    ? `Kapat (${selectedVerse.ayah})`
                    : isArOnly || isDoubleMushaf
                      ? `Meal (${selectedVerse.ayah})`
                      : `Ayet (${selectedVerse.ayah})`}
                </span>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => {
              sfxService.play('click');
              onChangePage(Math.max(pageBundle.minPage, pageBundle.pageNo - pageStep));
            }}
            className="flex-1 sm:flex-initial min-h-[40px] px-3.5 sm:px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="whitespace-nowrap">
              {isDoubleMushaf ? 'Önceki 2 Sayfa' : 'Önceki Sayfa'}
            </span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAŞINABİLİR KOMPAKT AYET İNCELEME PENCERESİ (Arka Planı Karartmaz/Kilitlemez)
          ==================================================================== */}
      <DraggableVerseInspector
        isOpen={isVerseDrawerOpen}
        verse={selectedVerse}
        surahMeta={selectedSurahMeta}
        settings={settings}
        wordMode={wordMode}
        isBookmarked={Boolean(selectedVerse && bookmarkedSet.has(selectedVerse.id))}
        isPlaying={Boolean(selectedVerse && playingAyahId === selectedVerse.id)}
        onClose={() => setIsVerseDrawerOpen(false)}
        onPlayFromVerse={(v) => onPlayFromVerse(v, false)}
        onPlayMealFromVerse={onPlayMealFromVerse}
        onToggleBookmark={onToggleBookmark}
        onShareVerse={onShareVerse}
        onOpenSurahInfo={onOpenSurahInfo}
      />
    </div>
  );
};
