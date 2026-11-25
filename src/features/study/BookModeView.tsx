import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  BookMarked,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  GripHorizontal,
  Headphones,
  Info,
  Layers,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pin,
  Play,
  Repeat,
  Scale,
  Share2,
  Star,
  StickyNote,
  Volume2,
  X,
} from 'lucide-react';
import {
  AyahEndMarker,
  ENDS_WITH_ARABIC_AYAH_MARKER,
} from '../../components/AyahEndMarker';
import { ResponsiveActionMenu } from '../../components/ResponsiveActionMenu';
import {
  MEALS_CATALOG,
  getMealTextPresentation,
  resolveMealBesmelePresentation,
  resolveSpokenMealInfo,
} from '../../config/mealsConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { useMutashabihatData, useRukusData } from '../../hooks/useStudyReferenceData';
import { useTajweedData } from '../../hooks/useTajweedData';
import { audioQueueService } from '../../services/audioQueueService';
import {
  hasActiveBackStackEntries,
  useBackButtonGuard,
} from '../../services/backStackService';
import { BookScrollRail } from './BookScrollRail';
import { DraggableVerseInspector } from './DraggableVerseInspector';
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
  BookContentMode,
  CombinedVerse,
  SurahBundle,
  SurahMeta,
} from '../../types/quran';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import {
  formatSafeArabicTitle,
  formatSurahTitle,
  getArabicDensityMetrics,
} from '../../utils/arabicUtils';

interface BookModeViewProps {
  bundle: SurahBundle;
  besmeleAr: string;
  playingAyahId: number | null;
  isAudioPlaying: boolean;
  onPlayFromAyah: (ayahIndex: number, modeOverride?: 'ar' | 'meal') => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenSurahInfo: (surah: SurahMeta) => void;
  onSelectPrevSurah: () => void;
  onSelectNextSurah: () => void;
  onOpenLocationPicker?: () => void;
  onToggleMobileImmersive?: () => void;
}

export const BookModeView: React.FC<BookModeViewProps> = ({
  bundle,
  besmeleAr,
  playingAyahId,
  isAudioPlaying,
  onPlayFromAyah,
  onShareVerse,
  onOpenSurahInfo,
  onSelectPrevSurah,
  onSelectNextSurah,
  onOpenLocationPicker,
  onToggleMobileImmersive,
}) => {
  const {
    settings,
    studyPrefs,
    studyProgress,
    toggleBookmarkAyah,
    moveHatimBookmark,
    openMealCompare,
    openMutashabihat,
    openQuickMemorize,
    openQuickResearch,
    openVerseNoteModal,
    openListeningDrawer,
    manifest,
    meta,
    audioPrefs,
    selectedVerseKey,
    setSelectedVerseKey,
    isMobileReaderImmersive,
  } = useAppStore();

  const { getCount: getMutashabihatCount } = useMutashabihatData(true);
  const { getRukuEndingAt } = useRukusData(settings.showRukuMarkers);
  const verseNotesMap = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getMapSnapshot,
  );

  const bookSurahNos = useMemo(() => [bundle.surahMeta.no], [bundle.surahMeta.no]);
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(bookSurahNos);

  const {
    rules: tjRules,
    besmele: tjBesmele,
    getVerseWords: getTjVerseWords,
  } = useTajweedData(bookSurahNos, settings.tajweedEnabled);

  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [openMenuAyahId, setOpenMenuAyahId] = useState<number | null>(null);
  const [openFootnoteAyahId, setOpenFootnoteAyahId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [inspectorVerse, setInspectorVerse] = useState<CombinedVerse | null>(null);
  const [isArPopoverOpen, setIsArPopoverOpen] = useState(false);
  const [isArPopoverMoreOpen, setIsArPopoverMoreOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  const [arPopoverPos, setArPopoverPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [isDraggingArPopover, setIsDraggingArPopover] = useState(false);
  const activeMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const arPopoverRef = useRef<HTMLDivElement | null>(null);
  const arClickPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasManualDragPositionRef = useRef(false);
  const arDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const [isDesktopRailVisible, setIsDesktopRailVisible] = useState(false);

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
        if (selectedVerseKey) {
          setSelectedVerseKey(null);
        }
        return;
      }

      const isLtrReading = settings.readerContentMode === 'meal_only';
      if (e.key === 'ArrowLeft') {
        if (isLtrReading) {
          if (bundle.surahMeta.no > 1) {
            e.preventDefault();
            onSelectPrevSurah();
          }
        } else if (bundle.surahMeta.no < 114) {
          e.preventDefault();
          onSelectNextSurah();
        }
      } else if (e.key === 'ArrowRight') {
        if (isLtrReading) {
          if (bundle.surahMeta.no < 114) {
            e.preventDefault();
            onSelectNextSurah();
          }
        } else if (bundle.surahMeta.no > 1) {
          e.preventDefault();
          onSelectPrevSurah();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedVerseKey,
    setSelectedVerseKey,
    settings.readerContentMode,
    bundle.surahMeta.no,
    onSelectPrevSurah,
    onSelectNextSurah,
  ]);

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const isAnyAudioVisible = audioState.isVisible && audioState.status !== 'idle';
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

  const bookMode: BookContentMode =
    settings.readerContentMode === 'ar_only'
      ? 'ar_only'
      : settings.readerContentMode === 'meal_only'
        ? 'meal_only'
        : 'interleaved';
  const isDoubleBookLayout = settings.desktopPageLayout === 'dual';
  const useRtlDoubleGrid = isDoubleBookLayout && bookMode !== 'meal_only';
  const isHatimOnSurahStart = studyProgress.pageBookmarks.some(
    (b) => b.isHatim && b.page === bundle.surahMeta.pageStart,
  );
  const bookmarkedSet = useMemo(
    () => new Set(studyProgress.bookmarkedAyahIds),
    [studyProgress.bookmarkedAyahIds],
  );

  const favoriteCountInSurah = useMemo(
    () => bundle.verses.filter((v) => bookmarkedSet.has(v.id)).length,
    [bundle.verses, bookmarkedSet],
  );

  const visibleVerses = useMemo(() => {
    if (!onlyFavorites) return bundle.verses;
    return bundle.verses.filter((v) => bookmarkedSet.has(v.id));
  }, [bundle.verses, onlyFavorites, bookmarkedSet]);

  const verseIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    bundle.verses.forEach((v, idx) => map.set(v.id, idx));
    return map;
  }, [bundle.verses]);

  const selectedArabicVerse = useMemo(() => {
    if (!selectedVerseKey) return null;
    const [sStr, aStr] = selectedVerseKey.split(':');
    const s = Number(sStr);
    const a = Number(aStr);
    if (s !== bundle.surahMeta.no || !Number.isFinite(a)) return null;
    return bundle.verses.find((v) => v.ayah === a) ?? null;
  }, [bundle.surahMeta.no, bundle.verses, selectedVerseKey]);

  const isArPopoverVisible =
    bookMode === 'ar_only' && Boolean(selectedArabicVerse) && isArPopoverOpen;

  const closeArPopover = useCallback(() => {
    hasManualDragPositionRef.current = false;
    arDragOffsetRef.current = null;
    setIsDraggingArPopover(false);
    setIsArPopoverOpen(false);
    setIsArPopoverMoreOpen(false);
    setSelectedVerseKey(null);
  }, [setSelectedVerseKey]);

  // Ekran boyutu (< 640px mobil alt çekmece / >= 640px yüzen popover) takibi
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Mod veya sure değiştiğinde ar_only popover'ı temiz kapat
  useEffect(() => {
    if (bookMode !== 'ar_only' || !selectedArabicVerse) {
      hasManualDragPositionRef.current = false;
      arDragOffsetRef.current = null;
      setIsDraggingArPopover(false);
      setIsArPopoverOpen(false);
      setIsArPopoverMoreOpen(false);
    }
  }, [bookMode, selectedArabicVerse]);

  useBackButtonGuard('book_ar_popover', isArPopoverVisible, closeArPopover);

  // Masaüstü / Tablet yüzen popover konum hesabı ve kesin viewport clamping
  const updateArPopoverPosition = useCallback(() => {
    if (typeof window === 'undefined' || !selectedArabicVerse) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      setArPopoverPos(null);
      return;
    }

    const edgeMargin = 12;
    const bottomMargin = isAnyAudioVisible ? 88 : 16;
    const popEl = arPopoverRef.current;
    const popW =
      popEl && popEl.offsetWidth > 0
        ? popEl.offsetWidth
        : Math.min(416, vw - edgeMargin * 2);
    const popH = popEl && popEl.offsetHeight > 0 ? popEl.offsetHeight : 300;
    const maxLeft = Math.max(edgeMargin, vw - popW - edgeMargin);
    const maxTop = Math.max(edgeMargin, vh - popH - bottomMargin);
    const clampLeft = (x: number) => Math.round(Math.min(Math.max(edgeMargin, x), maxLeft));
    const clampTop = (y: number) => Math.round(Math.min(Math.max(edgeMargin, y), maxTop));

    // Kullanıcı pencereyi sürükleyip konumlandırdıysa pozisyonu koru, yalnızca ekran dışına taşmasını engelle
    if (hasManualDragPositionRef.current) {
      setArPopoverPos((prev) => {
        if (!prev) {
          return {
            left: clampLeft((vw - popW) / 2),
            top: clampTop(vh * 0.2),
          };
        }
        const nextLeft = clampLeft(prev.left);
        const nextTop = clampTop(prev.top);
        if (nextLeft === prev.left && nextTop === prev.top) return prev;
        return { left: nextLeft, top: nextTop };
      });
      return;
    }

    const el = document.getElementById(`book-ayah-${selectedArabicVerse.id}`);
    const clickPt = arClickPointRef.current;

    if (!el) {
      const fallback = {
        left: clampLeft((vw - popW) / 2),
        top: clampTop(vh * 0.25),
      };
      setArPopoverPos((prev) =>
        prev && prev.left === fallback.left && prev.top === fallback.top ? prev : fallback,
      );
      return;
    }

    const rect = el.getBoundingClientRect();
    const anchorX = clickPt ? clickPt.x : rect.left + rect.width / 2;
    const left = clampLeft(anchorX - popW / 2);

    const belowTop = rect.bottom + 10;
    const aboveTop = rect.top - popH - 10;
    let candidateTop: number;

    if (belowTop + popH <= vh - bottomMargin) {
      candidateTop = belowTop;
    } else if (aboveTop >= edgeMargin && aboveTop + popH <= vh - bottomMargin) {
      candidateTop = aboveTop;
    } else {
      const spaceBelow = vh - bottomMargin - rect.bottom;
      const spaceAbove = rect.top - edgeMargin;
      candidateTop = spaceAbove > spaceBelow ? aboveTop : belowTop;
    }

    const nextPos = {
      left,
      top: clampTop(candidateTop),
    };
    setArPopoverPos((prev) =>
      prev && prev.left === nextPos.left && prev.top === nextPos.top ? prev : nextPos,
    );
  }, [selectedArabicVerse, isAnyAudioVisible]);

  // Boyama öncesi senkron ölçüm + ResizeObserver ile yükseklik değişiminde anında clamp
  useLayoutEffect(() => {
    if (!isArPopoverVisible || isMobileViewport) return;
    updateArPopoverPosition();

    const popEl = arPopoverRef.current;
    if (!popEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      updateArPopoverPosition();
    });
    ro.observe(popEl);
    return () => ro.disconnect();
  }, [
    isArPopoverVisible,
    isMobileViewport,
    selectedArabicVerse?.id,
    isArPopoverMoreOpen,
    isAnyAudioVisible,
    updateArPopoverPosition,
  ]);

  useEffect(() => {
    if (!isArPopoverVisible) return;

    const onScrollOrResize = () => updateArPopoverPosition();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeArPopover();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (window.innerWidth < 640) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (arPopoverRef.current?.contains(target)) return;
      if (target.closest('[data-book-ar-verse="true"]')) return;
      closeArPopover();
    };

    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);

    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isArPopoverVisible, updateArPopoverPosition, closeArPopover]);

  const handleArHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isMobileViewport || e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) return;
      const popEl = arPopoverRef.current;
      if (!popEl) return;

      const rect = popEl.getBoundingClientRect();
      arDragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      hasManualDragPositionRef.current = true;
      setIsDraggingArPopover(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore synthetic pointer capture errors
      }
      e.preventDefault();
    },
    [isMobileViewport],
  );

  const handleArHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const dragOffset = arDragOffsetRef.current;
      if (!dragOffset || isMobileViewport || typeof window === 'undefined') return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const edgeMargin = 12;
      const bottomMargin = isAnyAudioVisible ? 88 : 16;
      const popEl = arPopoverRef.current;
      const popW = popEl && popEl.offsetWidth > 0 ? popEl.offsetWidth : Math.min(416, vw - 24);
      const popH = popEl && popEl.offsetHeight > 0 ? popEl.offsetHeight : 300;
      const maxLeft = Math.max(edgeMargin, vw - popW - edgeMargin);
      const maxTop = Math.max(edgeMargin, vh - popH - bottomMargin);
      const left = Math.round(Math.min(Math.max(edgeMargin, e.clientX - dragOffset.x), maxLeft));
      const top = Math.round(Math.min(Math.max(edgeMargin, e.clientY - dragOffset.y), maxTop));
      setArPopoverPos({ left, top });
    },
    [isMobileViewport, isAnyAudioVisible],
  );

  const handleArHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!arDragOffsetRef.current) return;
    arDragOffsetRef.current = null;
    setIsDraggingArPopover(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore synthetic pointer release errors
    }
  }, []);

  // Mobil alt çekmece açıkken arka plan kaydırmasını kilitle
  useEffect(() => {
    if (!isArPopoverVisible || !isMobileViewport) return;
    return acquireBodyScrollLock();
  }, [isArPopoverVisible, isMobileViewport]);

  const handleToggleSelectVerse = (
    verse: CombinedVerse,
    event?: React.MouseEvent<HTMLElement>,
  ) => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : '';
    if (sel) return;
    sfxService.play('click');
    const key = `${verse.surah}:${verse.ayah}`;
    if (selectedVerseKey === key && (bookMode !== 'ar_only' || isArPopoverOpen)) {
      hasManualDragPositionRef.current = false;
      arDragOffsetRef.current = null;
      setIsDraggingArPopover(false);
      setSelectedVerseKey(null);
      setIsArPopoverOpen(false);
      setIsArPopoverMoreOpen(false);
      return;
    }
    hasManualDragPositionRef.current = false;
    arDragOffsetRef.current = null;
    setIsDraggingArPopover(false);
    if (event) {
      arClickPointRef.current = { x: event.clientX, y: event.clientY };
    } else {
      arClickPointRef.current = null;
    }
    setSelectedVerseKey(key);
    setIsArPopoverMoreOpen(false);
    if (bookMode === 'ar_only') {
      setIsArPopoverOpen(true);
    }
    audioQueueService.syncPausedSelection(verse, meta);
  };

  const handleCopyVerse = async (verse: CombinedVerse) => {
    const pVerse = getPrimaryVerse(verse);
    const sVerse = isDual ? getSecondaryVerse(verse) : null;
    const mealLines: string[] = [];
    if (pVerse?.t) {
      mealLines.push(isDual ? `${primaryMeal.shortLabel}: ${pVerse.t}` : pVerse.t);
    }
    if (isDual && sVerse?.t) {
      mealLines.push(`${secondaryMeal.shortLabel}: ${sVerse.t}`);
    }
    const mealText = mealLines.join('\n') || verse.m1?.t || verse.m2?.t || '';
    const surahTitle = formatSurahTitle(bundle.surahMeta.nameTr, bundle.surahMeta.no);
    const text =
      bookMode === 'ar_only'
        ? `${verse.ar.t}\n— ${surahTitle}, ${verse.ayah}. Ayet`
        : bookMode === 'meal_only'
          ? `${mealText}\n— ${surahTitle}, ${verse.ayah}. Ayet (${primaryMeal.shortLabel})`
          : `${verse.ar.t}\n\n${mealText}\n— ${surahTitle}, ${verse.ayah}. Ayet (${primaryMeal.shortLabel})`;

    try {
      await navigator.clipboard.writeText(text);
      sfxService.play('click');
      setCopiedId(verse.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === verse.id ? null : prev)), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const renderVerseActionMenu = (
    verse: CombinedVerse,
    isSelected: boolean,
    isPlaying: boolean,
  ) => {
    const originalIdx = verseIndexMap.get(verse.id) ?? 0;
    const isBookmarked = bookmarkedSet.has(verse.id);
    const isMenuOpen = openMenuAyahId === verse.id;

    return (
      <div
        className="relative flex items-center gap-1 ml-auto shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            setSelectedVerseKey(`${verse.surah}:${verse.ayah}`);
            onPlayFromAyah(originalIdx);
          }}
          title="Bu ayetten itibaren kesintisiz dinle"
          aria-label={`${verse.ayah}. ayetten itibaren dinle`}
          className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-colors cursor-pointer ${
            isPlaying
              ? 'bg-[var(--brand-primary)] text-white shadow-xs hover:opacity-90'
              : isSelected
                ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary-text)] hover:opacity-90'
                : 'text-[var(--text-muted)] hover:bg-[var(--brand-primary-soft)] hover:text-[var(--brand-primary-text)]'
          }`}
        >
          <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => toggleBookmarkAyah(verse.id)}
          title={isBookmarked ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          aria-label={isBookmarked ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-colors cursor-pointer ${
            isBookmarked
              ? 'text-[var(--brand-accent-text)] bg-[var(--brand-accent-soft)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-soft)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
        </button>

        <button
          ref={isMenuOpen ? activeMenuTriggerRef : undefined}
          type="button"
          onClick={() => {
            sfxService.play('click');
            setOpenMenuAyahId((prev) => (prev === verse.id ? null : verse.id));
          }}
          title="Diğer işlemler"
          aria-label="Ayet işlem menüsü"
          aria-expanded={isMenuOpen}
          className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-soft)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        <ResponsiveActionMenu
          isOpen={isMenuOpen}
          onClose={() => setOpenMenuAyahId(null)}
          title={`${verse.surah}:${verse.ayah} · Ayet İşlemleri`}
          triggerRef={activeMenuTriggerRef}
        >
            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                setSelectedVerseKey(`${verse.surah}:${verse.ayah}`);
                onPlayFromAyah(originalIdx, 'meal');
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Headphones className="w-4 h-4 text-[var(--brand-accent-text)]" />
              <span>Sesli Mealini Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                setInspectorVerse(verse);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Kelime Analizi &amp; Detay</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openQuickMemorize(verse.surah, verse.ayah, verse.page);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <BookMarked className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Buradan Ezber Başlat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openMealCompare(verse.surah, verse.ayah);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Scale className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Mealleri Karşılaştır ({MEALS_CATALOG.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                openVerseNoteModal(verse.surah, verse.ayah, verse.page);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-[var(--brand-primary-text)]" />
                <span>
                  {verseNotesMap.has(makeVerseNoteKey(verse.surah, verse.ayah))
                    ? 'Ayet Notumu Düzenle'
                    : 'Ayet Notu Ekle'}
                </span>
              </span>
              {(() => {
                const existing = verseNotesMap.get(makeVerseNoteKey(verse.surah, verse.ayah));
                if (!existing) return null;
                return (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: VERSE_NOTE_COLOR_STYLES[existing.color].dot }}
                  />
                );
              })()}
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openQuickResearch(verse.surah, verse.ayah, verse.ayah, verse.page);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Pin className="w-4 h-4 text-[var(--brand-accent-text)]" />
              <span>Araştırmaya Ekle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                if (manifest && meta) {
                  void audioQueueService.startSegmentQueue({
                    items: [
                      {
                        id: `loop_${verse.id}`,
                        type: 'ayah_range',
                        label: `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`,
                        surah: verse.surah,
                        startAyah: verse.ayah,
                        endAyah: verse.ayah,
                      },
                    ],
                    title: `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`,
                    context: 'single',
                    contextKey: `single:${verse.id}`,
                    manifest,
                    meta,
                    prefs: audioPrefs,
                    queueLoopOverride: 'infinite',
                  });
                }
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Repeat className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Bu Ayeti Döngüde Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openListeningDrawer({
                  initialTab: 'playlists',
                  pendingAddItem: {
                    type: 'ayah_range',
                    label: `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`,
                    surah: verse.surah,
                    startAyah: verse.ayah,
                    endAyah: verse.ayah,
                  },
                });
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Çalma Listesine Ekle</span>
            </button>

            {getMutashabihatCount(verse.surah, verse.ayah) > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuAyahId(null);
                  openMutashabihat(verse.surah, verse.ayah);
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4 text-[var(--brand-accent-text)]" />
                <span>
                  Benzer Ayetler ({getMutashabihatCount(verse.surah, verse.ayah)})
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                onShareVerse(verse, bundle.surahMeta);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-[var(--brand-accent-text)]" />
              <span>Paylaşım Kartı Oluştur</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                void handleCopyVerse(verse);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              {copiedId === verse.id ? (
                <>
                  <Check className="w-4 h-4 text-[var(--state-success)]" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>Metni Kopyala</span>
                </>
              )}
            </button>
        </ResponsiveActionMenu>
      </div>
    );
  };

  const handleContainerTap = (e: React.MouseEvent<HTMLElement>) => {
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

  return (
    <div
      className={`space-y-3 ${isAnyAudioVisible ? 'pb-24 lg:pb-0' : 'pb-3 lg:pb-0'}`}
      onClick={handleContainerTap}
    >
      {/* Kitap Sayfası Çerçevesi + Masaüstü Kitap Kenarı Akıllı Kaydırma Rayı */}
      <div className="flex items-start justify-center gap-3">
        {isDesktopRailVisible && (
          <div aria-hidden="true" className="hidden xl:block w-10 shrink-0" />
        )}
        <article
          ref={articleRef}
          className={`${
            isDoubleBookLayout ? 'max-w-6xl' : 'max-w-3xl'
          } w-full flex-1 min-w-0 surface-card rounded-2xl sm:rounded-3xl border border-[var(--border-strong)]/80 overflow-hidden shadow-md transition-all`}
        >
        {/* Kitap Serlevha Başlığı */}
        <header className="book-serlevha-header px-4 py-3.5 sm:px-8 sm:py-5 border-b border-[var(--border-subtle)] text-center">
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onOpenLocationPicker?.();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] hover:border-[var(--brand-primary)] cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--brand-primary-text)]" />
              <span>
                {bundle.surahMeta.no}. Sure • {bundle.surahMeta.type}
              </span>
            </button>

            <div className="flex items-center gap-1.5">
              {(favoriteCountInSurah > 0 || onlyFavorites) && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setOnlyFavorites((v) => !v);
                  }}
                  title="Sadece favori ayetleri filtrele"
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: onlyFavorites
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface)',
                    borderColor: onlyFavorites ? 'var(--brand-accent)' : 'var(--border-subtle)',
                    color: onlyFavorites ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
                  <span className="tabular-nums">{favoriteCountInSurah}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  moveHatimBookmark({
                    page: bundle.surahMeta.pageStart,
                    surah: bundle.surahMeta.no,
                    ayah: 1,
                  })
                }
                title="Hatim ayracını bu surenin sayfasına taşı"
                className="min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: isHatimOnSurahStart
                    ? 'var(--brand-primary)'
                    : 'var(--bg-surface)',
                  borderColor: isHatimOnSurahStart
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: isHatimOnSurahStart ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                <Bookmark className={`w-3.5 h-3.5 ${isHatimOnSurahStart ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">
                  {isHatimOnSurahStart ? 'Hatim Ayracı' : 'Ayraç Koy'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenSurahInfo(bundle.surahMeta)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--brand-primary-text)] hover:border-[var(--brand-primary)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sure Bilgisi</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onOpenLocationPicker?.();
            }}
            className="inline-flex flex-col items-center cursor-pointer hover:opacity-85 transition-opacity"
          >
            <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
              {formatSurahTitle(bundle.surahMeta.nameTr, bundle.surahMeta.no)}
            </h2>
            <p className="arabic-title text-xl sm:text-2xl text-[var(--brand-primary-text)] mt-1">
              {formatSafeArabicTitle(bundle.surahMeta.nameAr)}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {bundle.surahMeta.ayahCount} Ayet • Sayfa {bundle.surahMeta.pageStart}–
              {bundle.surahMeta.pageEnd}
            </p>
            {bookMode !== 'ar_only' && (
              <span
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>{primaryMeal.label}</span>
                {isDual && (
                  <>
                    <span aria-hidden="true" className="opacity-50">
                      ·
                    </span>
                    <span>{secondaryMeal.shortLabel}</span>
                  </>
                )}
              </span>
            )}
          </button>

          {bundle.hasBesmele && !onlyFavorites && (() => {
            const isBesmelePlaying = Boolean(
              playingAyahId &&
                bundle.verses[0]?.id === playingAyahId &&
                audioState.activePhase === 'besmele',
            );
            const softPlayingBg =
              settings.theme === 'dark'
                ? 'rgba(45, 212, 191, 0.13)'
                : 'rgba(13, 148, 136, 0.10)';
            return (
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]/70">
                {bookMode !== 'meal_only' && (
                  <p
                    className={`${settings.tajweedEnabled && tjBesmele ? 'arabic-tajweed' : 'arabic-text'} text-center text-[var(--text-primary)] rounded-xl px-2 py-0.5 transition-colors`}
                    style={{
                      fontSize: `${Math.max(22, settings.arabicFontSize - 2)}px`,
                      backgroundColor:
                        isBesmelePlaying && !audioState.isWordSyncActive
                          ? softPlayingBg
                          : 'transparent',
                    }}
                  >
                    <SyncedVerseArabic
                      text={besmeleAr}
                      surahNo={bundle.surahMeta.no}
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
                )}
                {bookMode === 'meal_only' && (() => {
                  const besmeleInfo = meta?.besmele ?? {
                    ayahId: 1001,
                    audioCode: '001001',
                    excludeSurahs: [1, 9],
                    ar: besmeleAr,
                    tdv: 'Rahmân ve Rahîm olan Allah’ın adıyla.',
                    dib: 'Rahmân ve Rahîm olan Allah’ın adıyla.',
                  };
                  const mealBesmele = resolveMealBesmelePresentation(primaryMeal, besmeleInfo);
                  return (
                    <p
                      dir={mealBesmele.dir}
                      lang={mealBesmele.isArabic ? 'ar' : primaryMeal.lang ?? 'tr'}
                      className={`${
                        mealBesmele.isArabic
                          ? 'arabic-text text-lg sm:text-xl leading-[2.0] text-[var(--text-primary)]'
                          : 'turkish-reading text-sm font-semibold italic text-[var(--text-secondary)]'
                      } text-center rounded-lg px-2 py-1 transition-colors`}
                      style={{
                        backgroundColor: isBesmelePlaying ? softPlayingBg : 'transparent',
                      }}
                    >
                      {mealBesmele.text}
                    </p>
                  );
                })()}
              </div>
            );
          })()}
        </header>

        {/* Kitap İçeriği */}
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          {visibleVerses.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <Star className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Bu surede henüz favori ayetiniz bulunmuyor.
              </p>
              <button
                type="button"
                onClick={() => setOnlyFavorites(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-bold cursor-pointer"
              >
                Tüm Ayetleri Göster
              </button>
            </div>
          ) : bookMode === 'ar_only' ? (
            /* 1. SADECE ARAPÇA KİTAP AKIŞI */
            <div className="space-y-5">
              {(() => {
                const hasTajweedInBook =
                  settings.tajweedEnabled &&
                  visibleVerses.some((v) => Boolean(getTjVerseWords(v.surah, v.ayah)?.length));
                const arabicDensity = getArabicDensityMetrics(
                  settings.arabicTextDensity,
                  settings.arabicLineHeight,
                );
                return (
                  <div
                    dir="rtl"
                    className={`${hasTajweedInBook ? 'arabic-tajweed' : 'arabic-text'} text-justify text-[var(--text-primary)] ${
                      isDoubleBookLayout ? 'lg:columns-2 lg:gap-10' : ''
                    }`}
                    style={{
                      fontSize: `${settings.arabicFontSize}px`,
                      lineHeight: hasTajweedInBook
                        ? arabicDensity.tajweedLineHeight
                        : arabicDensity.mushafLineHeight,
                      wordSpacing: arabicDensity.wordSpacing,
                    }}
                  >
                    {visibleVerses.map((verse) => {
                      const isPlaying =
                        playingAyahId === verse.id && audioState.activePhase !== 'besmele';
                      const isSelected = selectedArabicVerse?.id === verse.id;
                      const isBookmarked = bookmarkedSet.has(verse.id);
                      const isSajdah = SAJDAH_AYAH_IDS.has(verse.id) && settings.highlightSajdah;
                      const rukuEnd = settings.showRukuMarkers
                        ? getRukuEndingAt(verse.surah, verse.ayah)
                        : null;
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
                      return (
                        <span
                          key={verse.id}
                          id={`book-ayah-${verse.id}`}
                          data-book-ar-verse="true"
                          role="button"
                          tabIndex={0}
                          title={
                            isSajdah
                              ? `Tilâvet Secdesi Ayeti — ${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`
                              : `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`
                          }
                          onClick={(e) => {
                            const target = e.target as HTMLElement | null;
                            if (
                              target?.closest('[data-tajweed-rule], [data-waqf-sign], [data-ruku-badge]')
                            ) {
                              return;
                            }
                            e.stopPropagation();
                            handleToggleSelectVerse(verse, e);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleSelectVerse(verse);
                            }
                          }}
                          className={`inline rounded-xl px-[0.02em] py-[0.04em] transition-colors cursor-pointer ${
                            isPlaying
                              ? 'text-[var(--text-primary)] ring-1 ring-emerald-500/30'
                              : isSelected
                                ? 'bg-amber-500/[0.14] ring-1 ring-amber-500/40'
                                : isSajdah
                                  ? 'bg-amber-500/12 underline decoration-amber-500/65 decoration-dotted underline-offset-[10px]'
                                  : 'hover:bg-[var(--bg-surface-soft)]'
                          }`}
                          style={{
                            ...(isPlaying
                              ? {
                                  backgroundColor: audioState.isWordSyncActive
                                    ? softWordSyncPlayingBg
                                    : softPlayingBg,
                                }
                              : {}),
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
                          {isSajdah && (
                            <span
                              title="Tilâvet Secdesi Ayeti"
                              aria-label="Tilâvet Secdesi Ayeti"
                              className="inline-flex items-center justify-center mx-[0.14em] px-[0.22em] py-0.5 rounded-md border text-[0.6em] font-sans font-extrabold align-middle leading-none"
                              style={{
                                backgroundColor: 'var(--brand-accent-soft)',
                                borderColor: 'rgba(217, 119, 6, 0.5)',
                                color: 'var(--brand-accent-text)',
                              }}
                            >
                              ۩
                            </span>
                          )}
                          {(useVerseTajweed || !ENDS_WITH_ARABIC_AYAH_MARKER.test(verse.ar.t)) && (
                            <AyahEndMarker
                              ayahNo={verse.ayah}
                              isPlaying={isPlaying}
                              isWordSyncActive={audioState.isWordSyncActive}
                              isHighlighted={isSelected || isBookmarked || isSajdah}
                              theme={settings.theme}
                              size="mushaf"
                              title={
                                isSajdah
                                  ? `Tilâvet Secdesi · ${bundle.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                  : `${bundle.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                              }
                            />
                          )}
                          {rukuEnd && (
                            <RukuMarkerBadge
                              ruku={rukuEnd}
                              surahNameTr={bundle.surahMeta.nameTr}
                              page={verse.page}
                              variant="inline"
                            />
                          )}{' '}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : (
            /* 2. SADECE TÜRKÇE MEAL veya 3. ARAPÇA + MEAL KİTAP AKIŞI */
            <div
              dir={useRtlDoubleGrid ? 'rtl' : 'ltr'}
              className={
                isDoubleBookLayout
                  ? 'grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8 gap-y-2'
                  : 'divide-y divide-[var(--border-subtle)]/70'
              }
            >
              {visibleVerses.map((verse) => {
                const isPlaying =
                  playingAyahId === verse.id && audioState.activePhase !== 'besmele';
                const isSajdah = SAJDAH_AYAH_IDS.has(verse.id) && settings.highlightSajdah;
                const rukuEnd = settings.showRukuMarkers
                  ? getRukuEndingAt(verse.surah, verse.ayah)
                  : null;
                const mutashabihatCount = getMutashabihatCount(verse.surah, verse.ayah);
                const verseNote = verseNotesMap.get(makeVerseNoteKey(verse.surah, verse.ayah));
                const verseNoteStyle = verseNote ? VERSE_NOTE_COLOR_STYLES[verseNote.color] : null;
                const primaryVerse = getPrimaryVerse(verse);
                const secondaryVerse = isDual ? getSecondaryVerse(verse) : null;
                const fnList = settings.showFootnotes
                  ? [
                      ...(primaryVerse?.fn
                        ? primaryVerse.fn.map((t) => ({ src: primaryMeal.shortLabel, text: t }))
                        : []),
                      ...(isDual && secondaryVerse?.fn
                        ? secondaryVerse.fn.map((t) => ({
                            src: secondaryMeal.shortLabel,
                            text: t,
                          }))
                        : []),
                    ]
                  : [];
                const isFnOpen = openFootnoteAyahId === verse.id;
                const softPlayingBg =
                  settings.theme === 'dark'
                    ? 'rgba(16, 185, 129, 0.14)'
                    : 'rgba(16, 185, 129, 0.10)';
                const softWordSyncPlayingBg =
                  settings.theme === 'dark'
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'rgba(16, 185, 129, 0.06)';
                const suppressSectionFill =
                  isPlaying && audioState.isWordSyncActive && bookMode === 'interleaved';

                const isSelected = selectedVerseKey === `${verse.surah}:${verse.ayah}`;

                return (
                  <section
                    key={verse.id}
                    id={`book-ayah-${verse.id}`}
                    dir="ltr"
                    onClick={(e) => {
                      const target = e.target as HTMLElement | null;
                      if (
                        target?.closest(
                          'button, a, [role="button"], input, select, [data-tajweed-rule], [data-waqf-sign], [data-ruku-badge]',
                        )
                      ) {
                        return;
                      }
                      e.stopPropagation();
                      handleToggleSelectVerse(verse);
                    }}
                    className={`group text-left py-4 sm:py-5 transition-all rounded-2xl px-2.5 sm:px-3.5 cursor-pointer ${
                      isDoubleBookLayout
                        ? 'border-b border-[var(--border-subtle)]/70'
                        : 'first:pt-1 last:pb-1 -mx-2.5 sm:-mx-3.5'
                    } ${
                      isPlaying
                        ? 'ring-1 ring-emerald-500/35 shadow-xs'
                        : isSelected
                          ? 'bg-amber-500/[0.13] ring-1 ring-amber-500/40 my-1'
                          : isSajdah
                            ? 'bg-amber-500/[0.07] ring-1 ring-amber-500/45 my-1.5'
                            : 'hover:bg-[var(--bg-surface-soft)]/45'
                    }`}
                    style={
                      isPlaying
                        ? {
                            backgroundColor: suppressSectionFill
                              ? softWordSyncPlayingBg
                              : softPlayingBg,
                          }
                        : undefined
                    }
                  >
                    {/* Ayet Üst Satır */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[34px] h-7 px-2 rounded-lg text-xs font-extrabold ${
                            isPlaying
                              ? 'bg-[var(--brand-primary)] text-white'
                              : isSelected
                                ? 'bg-[var(--brand-accent)] text-white'
                                : isSajdah
                                  ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] border border-[var(--brand-accent)]/50'
                                  : 'bg-[var(--bg-surface-soft)] text-[var(--brand-primary-text)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {verse.surah}:{verse.ayah}
                        </span>

                        {isSelected && !isPlaying && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-extrabold"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            Seçili
                          </span>
                        )}

                        {isSajdah && (
                          <span
                            title="Diyanet / Hanefî standardına göre Tilâvet Secdesi ayeti"
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-extrabold whitespace-nowrap"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              borderColor: 'rgba(217, 119, 6, 0.5)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            <span className="text-sm leading-none">۩</span>
                            <span>Tilâvet Secdesi</span>
                          </span>
                        )}

                        {rukuEnd && (
                          <RukuMarkerBadge
                            ruku={rukuEnd}
                            surahNameTr={bundle.surahMeta.nameTr}
                            page={verse.page}
                            variant="pill"
                          />
                        )}

                        {mutashabihatCount > 0 && (
                          <button
                            type="button"
                            onClick={() => openMutashabihat(verse.surah, verse.ayah)}
                            title={`Benzer ayetleri karşılaştır (${mutashabihatCount})`}
                            className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-opacity hover:opacity-85"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              borderColor: 'rgba(217, 119, 6, 0.38)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            <ArrowLeftRight className="w-3 h-3 shrink-0" />
                            <span className="hidden sm:inline">Benzer ({mutashabihatCount})</span>
                            <span className="sm:hidden tabular-nums">{mutashabihatCount}</span>
                          </button>
                        )}

                        {isPlaying && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--brand-primary)] text-white">
                            <Volume2
                              className={`w-3.5 h-3.5 ${isAudioPlaying ? 'animate-pulse' : ''}`}
                            />
                            <span>{isAudioPlaying ? 'Okunuyor' : 'Duraklatıldı'}</span>
                          </span>
                        )}

                        {primaryVerse?.mg && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-surface-soft)] text-[var(--text-muted)]">
                            <Link2 className="w-3 h-3" />
                            {primaryMeal.shortLabel} {primaryVerse.mg[0]}–{primaryVerse.mg[1]}
                          </span>
                        )}

                        {verseNote && verseNoteStyle && (
                          <button
                            type="button"
                            onClick={() => openVerseNoteModal(verse.surah, verse.ayah, verse.page)}
                            title="Kişisel ayet notunu düzenle"
                            className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-opacity hover:opacity-85"
                            style={{
                              backgroundColor: verseNoteStyle.softBg,
                              borderColor: verseNoteStyle.border,
                              color: verseNoteStyle.badgeText,
                            }}
                          >
                            <StickyNote className="w-3 h-3 shrink-0" />
                            <span>Notum</span>
                          </button>
                        )}
                      </div>

                      {renderVerseActionMenu(verse, isSelected, isPlaying)}
                    </div>

                    {/* Arapça Ayet (Yalnızca interleaved modda) */}
                    {bookMode === 'interleaved' &&
                      (() => {
                        const tjWords = settings.tajweedEnabled
                          ? getTjVerseWords(verse.surah, verse.ayah)
                          : null;
                        const useVerseTajweed = Boolean(tjWords && tjWords.length > 0);
                        const arabicDensity = getArabicDensityMetrics(
                          settings.arabicTextDensity,
                          settings.arabicLineHeight,
                        );
                        return (
                          <p
                            dir="rtl"
                            className={`${useVerseTajweed ? 'arabic-tajweed' : 'arabic-text'} text-right text-[var(--text-primary)] mb-3.5`}
                            style={{
                              fontSize: `${settings.arabicFontSize}px`,
                              lineHeight: useVerseTajweed
                                ? arabicDensity.tajweedLineHeight
                                : arabicDensity.lineHeight,
                              wordSpacing: arabicDensity.wordSpacing,
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
                            {isSajdah && (
                              <span
                                title="Tilâvet Secdesi Ayeti"
                                aria-label="Tilâvet Secdesi Ayeti"
                                className="inline-flex items-center justify-center mx-[0.16em] px-[0.22em] py-0.5 rounded-md border text-[0.6em] font-sans font-extrabold align-middle leading-none"
                                style={{
                                  backgroundColor: 'var(--brand-accent-soft)',
                                  borderColor: 'rgba(217, 119, 6, 0.5)',
                                  color: 'var(--brand-accent-text)',
                                }}
                              >
                                ۩
                              </span>
                            )}
                            {(useVerseTajweed || !ENDS_WITH_ARABIC_AYAH_MARKER.test(verse.ar.t)) && (
                              <AyahEndMarker
                                ayahNo={verse.ayah}
                                isPlaying={isPlaying}
                                isHighlighted={isSajdah}
                                theme={settings.theme}
                                size="card"
                              />
                            )}
                          </p>
                        );
                      })()}

                    {/* Türkçe Meal Bloğu */}
                    <div className="space-y-2.5">
                      {(() => {
                        const showSpokenMismatchOnPrimary =
                          isPlaying &&
                          isMealAudioFlowActive &&
                          Boolean(activeSpokenMeal) &&
                          activeSpokenMeal!.mealId !== primaryMeal.id &&
                          (!isDual || activeSpokenMeal!.mealId !== secondaryMeal.id);
                        const showPrimaryHeader =
                          isDual || primaryMeal.id !== 'm1' || showSpokenMismatchOnPrimary;
                        return (
                          <div className="space-y-1">
                            {showPrimaryHeader && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-[var(--brand-primary-text)]">
                                  {primaryMeal.label}
                                </span>
                                {showSpokenMismatchOnPrimary && activeSpokenMeal && (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap"
                                    style={{
                                      backgroundColor: 'var(--bg-surface-soft)',
                                      borderColor: 'var(--border-subtle)',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    <Volume2 className="w-3 h-3 shrink-0" />
                                    <span>Ses: {activeSpokenMeal.label}</span>
                                  </span>
                                )}
                              </div>
                            )}
                            {primaryVerse?.t ? (
                              (() => {
                                const pres = getMealTextPresentation(
                                  primaryMeal,
                                  settings.turkishFontSize,
                                );
                                return (
                                  <p
                                    dir={pres.dir}
                                    lang={pres.lang}
                                    className={`${
                                      pres.isRtl ? pres.className : `${pres.className} text-left`
                                    } text-[var(--text-primary)]`}
                                    style={{
                                      fontSize: `${pres.fontSizePx}px`,
                                      fontFamily: pres.fontFamily,
                                    }}
                                  >
                                    {primaryVerse.t}
                                  </p>
                                );
                              })()
                            ) : isLoadingExtra ? (
                              <div className="h-4 w-4/5 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                            ) : null}
                          </div>
                        );
                      })()}

                      {isDual && (
                        <div className="space-y-1 pt-2 border-t border-dashed border-[var(--border-subtle)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-[var(--brand-accent-text)]">
                              {secondaryMeal.label}
                            </span>
                            {isPlaying &&
                              isMealAudioFlowActive &&
                              activeSpokenMeal &&
                              activeSpokenMeal.mealId === secondaryMeal.id && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap"
                                  style={{
                                    backgroundColor: 'var(--brand-primary-soft)',
                                    borderColor: 'var(--brand-primary)',
                                    color: 'var(--brand-primary-text)',
                                  }}
                                >
                                  <Volume2 className="w-3 h-3 shrink-0" />
                                  <span>Ses: {activeSpokenMeal.label}</span>
                                </span>
                              )}
                          </div>
                          {secondaryVerse?.t ? (
                            (() => {
                              const pres = getMealTextPresentation(
                                secondaryMeal,
                                settings.turkishFontSize,
                              );
                              return (
                                <p
                                  dir={pres.dir}
                                  lang={pres.lang}
                                  className={`${
                                    pres.isRtl ? pres.className : `${pres.className} text-left`
                                  } text-[var(--text-primary)]`}
                                  style={{
                                    fontSize: `${pres.fontSizePx}px`,
                                    fontFamily: pres.fontFamily,
                                  }}
                                >
                                  {secondaryVerse.t}
                                </p>
                              );
                            })()
                          ) : isLoadingExtra ? (
                            <div className="h-4 w-4/5 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Dipnot Açılır Çekmecesi */}
                    {fnList.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setOpenFootnoteAyahId((prev) => (prev === verse.id ? null : verse.id));
                          }}
                          aria-expanded={isFnOpen}
                          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--brand-accent-text)] bg-[var(--brand-accent-soft)]/70 hover:bg-[var(--brand-accent-soft)] cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            {isFnOpen ? 'Dipnotu Gizle' : `Dipnot (${fnList.length})`}
                          </span>
                        </button>

                        {isFnOpen && (
                          <div className="mt-2 rounded-xl bg-[var(--bg-surface-soft)] border border-[var(--border-subtle)] p-3 space-y-2 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                            {fnList.map((fn, idx) => (
                              <p key={idx}>
                                <strong className="text-[var(--text-primary)]">{fn.src}: </strong>
                                {fn.text}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Kişisel Tefekkür Notum */}
                    {verseNote && verseNoteStyle && (
                      <button
                        type="button"
                        onClick={() => openVerseNoteModal(verse.surah, verse.ayah, verse.page)}
                        className="mt-3 w-full text-left rounded-xl border px-3 py-2.5 transition-opacity hover:opacity-95 cursor-pointer space-y-1"
                        style={{
                          backgroundColor: verseNoteStyle.softBg,
                          borderColor: verseNoteStyle.border,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-extrabold"
                            style={{ color: verseNoteStyle.badgeText }}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: verseNoteStyle.dot }}
                            />
                            <StickyNote className="w-3 h-3 shrink-0" />
                            <span>Kişisel Notum</span>
                          </span>
                          <span
                            className="text-[11px] font-bold underline underline-offset-2"
                            style={{ color: verseNoteStyle.badgeText }}
                          >
                            Düzenle
                          </span>
                        </div>
                        {verseNote.text && (
                          <p
                            className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap line-clamp-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {verseNote.text}
                          </p>
                        )}
                        {verseNote.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            {verseNote.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  color: verseNoteStyle.badgeText,
                                }}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Alt Sure Geçiş Çubuğu */}
        <footer className="px-4 py-3.5 sm:px-8 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-soft)]/70 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={bundle.surahMeta.no <= 1}
            onClick={onSelectPrevSurah}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm font-bold text-[var(--text-primary)] hover:border-[var(--brand-primary)] disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Önceki Sure</span>
          </button>

          <span className="text-xs font-bold text-[var(--text-muted)]">
            {bundle.surahMeta.no} / 114
          </span>

          <button
            type="button"
            disabled={bundle.surahMeta.no >= 114}
            onClick={onSelectNextSurah}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm font-bold text-[var(--text-primary)] hover:border-[var(--brand-primary)] disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>Sonraki Sure</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </footer>
      </article>
        <BookScrollRail
          articleRef={articleRef}
          verses={visibleVerses}
          totalAyahs={bundle.surahMeta.ayahCount}
          theme={settings.theme}
          isAnyAudioVisible={isAnyAudioVisible}
          isMobileImmersive={isMobileReaderImmersive}
          layoutKey={`${bundle.surahMeta.no}:${bookMode}:${isDoubleBookLayout ? 'dual' : 'single'}:${settings.arabicFontSize}:${settings.turkishFontSize}:${onlyFavorites ? 'fav' : 'all'}:${visibleVerses.length}`}
          onDesktopRailVisibilityChange={setIsDesktopRailVisible}
        />
      </div>

      {/* ====================================================================
          SADECE ARAPÇA (ar_only) BAĞLAMSAL MEAL & HIZLI İŞLEM POPOVER / ALT ÇEKMECE
          ==================================================================== */}
      {isArPopoverVisible &&
        selectedArabicVerse &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const v = selectedArabicVerse;
            const originalIdx = verseIndexMap.get(v.id) ?? 0;
            const isPlaying = playingAyahId === v.id && audioState.activePhase !== 'besmele';
            const isBookmarked = bookmarkedSet.has(v.id);
            const isSajdah = SAJDAH_AYAH_IDS.has(v.id) && settings.highlightSajdah;
            const mutashabihatCount = getMutashabihatCount(v.surah, v.ayah);
            const existingNote = verseNotesMap.get(makeVerseNoteKey(v.surah, v.ayah));
            const pVerse = getPrimaryVerse(v);
            const sVerse = isDual ? getSecondaryVerse(v) : null;
            const pPres = getMealTextPresentation(
              primaryMeal,
              Math.max(13, Math.min(settings.turkishFontSize, 16)),
            );
            const sPres = isDual
              ? getMealTextPresentation(
                  secondaryMeal,
                  Math.max(13, Math.min(settings.turkishFontSize, 16)),
                )
              : null;

            const popoverContent = (
              <div
                ref={arPopoverRef}
                role="dialog"
                aria-label={`${formatSurahTitle(bundle.surahMeta.nameTr, bundle.surahMeta.no)} ${v.ayah}. Ayet özeti ve hızlı işlemler`}
                onClick={(e) => e.stopPropagation()}
                className={
                  isMobileViewport
                    ? 'fixed inset-x-0 bottom-0 z-[100] rounded-t-2xl border-t shadow-2xl flex flex-col max-h-[82dvh] overflow-hidden'
                    : 'fixed z-[100] w-[min(26rem,calc(100vw-1.5rem))] rounded-2xl border shadow-2xl flex flex-col max-h-[min(480px,calc(100vh-24px))] overflow-hidden'
                }
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                  ...(isMobileViewport
                    ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }
                    : {
                        maxHeight: 'min(480px, calc(100dvh - 24px))',
                        left: arPopoverPos ? `${arPopoverPos.left}px` : '12px',
                        top: arPopoverPos ? `${arPopoverPos.top}px` : '12px',
                        visibility: arPopoverPos ? 'visible' : 'hidden',
                      }),
                }}
              >
                {/* Mobil Tutamak */}
                {isMobileViewport && (
                  <div className="pt-2 pb-0.5 flex justify-center shrink-0">
                    <span
                      aria-hidden="true"
                      className="w-10 h-1 rounded-full opacity-35"
                      style={{ backgroundColor: 'var(--text-muted)' }}
                    />
                  </div>
                )}

                {/* Üst Başlık Şeridi: Sol Tutamak + Künye (Masaüstünde Sürüklenebilir) + Sağ 4 Yalın İkon Butonu */}
                <div
                  onPointerDown={handleArHeaderPointerDown}
                  onPointerMove={handleArHeaderPointerMove}
                  onPointerUp={handleArHeaderPointerUp}
                  onPointerCancel={handleArHeaderPointerUp}
                  className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 select-none ${
                    isMobileViewport
                      ? ''
                      : isDraggingArPopover
                        ? 'cursor-grabbing touch-none'
                        : 'sm:cursor-grab sm:active:cursor-grabbing touch-none'
                  }`}
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 min-w-0"
                    title={isMobileViewport ? undefined : 'Taşımak için başlık çubuğundan sürükleyin'}
                  >
                    {!isMobileViewport && (
                      <GripHorizontal
                        className="hidden sm:block w-3.5 h-3.5 shrink-0 opacity-60"
                        style={{ color: 'var(--text-muted)' }}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className="text-xs font-extrabold truncate tabular-nums"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      {formatSurahTitle(bundle.surahMeta.nameTr, bundle.surahMeta.no)} · {v.ayah}.
                      Ayet
                    </span>
                    {isSajdah && (
                      <span
                        title="Tilâvet Secdesi Ayeti"
                        aria-label="Tilâvet Secdesi Ayeti"
                        className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md border text-[11px] font-extrabold leading-none shrink-0"
                        style={{
                          backgroundColor: 'var(--brand-accent-soft)',
                          borderColor: 'rgba(217, 119, 6, 0.5)',
                          color: 'var(--brand-accent-text)',
                        }}
                      >
                        ۩
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onPlayFromAyah(originalIdx, 'ar');
                      }}
                      title="Bu ayetten itibaren Arapça tilaveti dinle"
                      aria-label="Bu ayetten itibaren Arapça tilaveti dinle"
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                      style={
                        isPlaying
                          ? { backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }
                          : {
                              backgroundColor: 'var(--brand-primary-soft)',
                              color: 'var(--brand-primary-text)',
                            }
                      }
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        toggleBookmarkAyah(v.id);
                      }}
                      title={isBookmarked ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                      aria-label={isBookmarked ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                      style={
                        isBookmarked
                          ? {
                              backgroundColor: 'var(--brand-accent-soft)',
                              color: 'var(--brand-accent-text)',
                            }
                          : {
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-muted)',
                            }
                      }
                    >
                      <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setIsArPopoverMoreOpen((prev) => !prev);
                      }}
                      title={isArPopoverMoreOpen ? 'Meal önizlemesine dön' : 'Diğer işlemler'}
                      aria-label={
                        isArPopoverMoreOpen
                          ? 'Meal önizlemesine dön'
                          : 'Diğer işlemler menüsünü aç'
                      }
                      aria-expanded={isArPopoverMoreOpen}
                      className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer"
                      style={
                        isArPopoverMoreOpen
                          ? {
                              backgroundColor: 'var(--brand-primary-soft)',
                              borderColor: 'var(--brand-primary)',
                              color: 'var(--brand-primary-text)',
                            }
                          : {
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }
                      }
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        closeArPopover();
                      }}
                      title="Kapat"
                      aria-label="Ayet özetini kapat"
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-[var(--bg-surface)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Orta Gövde: Meal Önizlemesi <-> Kompakt 2 Sütunlu Ayet İşlemleri Geçişi */}
                <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3">
                  {!isArPopoverMoreOpen ? (
                    <div className="space-y-3">
                      <div className="space-y-2.5">
                        <div className="space-y-1">
                          <span
                            className="inline-block text-[10.5px] font-extrabold uppercase tracking-wider"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            {primaryMeal.shortLabel}
                          </span>
                          {pVerse?.t ? (
                            <p
                              dir={pPres.dir}
                              lang={pPres.lang}
                              className={`${
                                pPres.isRtl ? pPres.className : `${pPres.className} text-left`
                              } leading-relaxed`}
                              style={{
                                fontSize: `${pPres.fontSizePx}px`,
                                fontFamily: pPres.fontFamily,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {pVerse.t}
                            </p>
                          ) : isLoadingExtra ? (
                            <div className="h-4 w-4/5 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                          ) : (
                            <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                              Meal metni yüklenemedi.
                            </p>
                          )}
                        </div>

                        {isDual && sPres && (
                          <div
                            className="pt-2 border-t border-dashed space-y-1"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <span
                              className="inline-block text-[10.5px] font-extrabold uppercase tracking-wider"
                              style={{ color: 'var(--brand-accent-text)' }}
                            >
                              {secondaryMeal.shortLabel}
                            </span>
                            {sVerse?.t ? (
                              <p
                                dir={sPres.dir}
                                lang={sPres.lang}
                                className={`${
                                  sPres.isRtl ? sPres.className : `${sPres.className} text-left`
                                } leading-relaxed`}
                                style={{
                                  fontSize: `${sPres.fontSizePx}px`,
                                  fontFamily: sPres.fontFamily,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {sVerse.t}
                              </p>
                            ) : isLoadingExtra ? (
                              <div className="h-4 w-3/4 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* Zarif Kelime Analizi & Ayet Detayı Satırı */}
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setInspectorVerse(v);
                          setIsArPopoverOpen(false);
                          setIsArPopoverMoreOpen(false);
                        }}
                        className="w-full min-h-[38px] px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-2 transition-colors cursor-pointer hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          borderColor: 'var(--brand-primary)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Layers className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Kelime Analizi &amp; Ayet Detayı</span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Panel Üstü: Ayet İşlemleri + ← Meale Dön */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[10.5px] font-extrabold uppercase tracking-wider"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Ayet İşlemleri
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setIsArPopoverMoreOpen(false);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)]"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                          <span>Meale Dön</span>
                        </button>
                      </div>

                      {/* 2 Sütunlu Kompakt Aksiyon Izgarası */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            onPlayFromAyah(originalIdx, 'meal');
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <Headphones className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">Sesli Mealini Dinle</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setInspectorVerse(v);
                            setIsArPopoverOpen(false);
                            setIsArPopoverMoreOpen(false);
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <Layers className="w-3.5 h-3.5 text-[var(--brand-primary-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">Kelime Analizi &amp; Detay</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            openMealCompare(v.surah, v.ayah);
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <Scale className="w-3.5 h-3.5 text-[var(--brand-primary-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">
                            Mealleri Karşılaştır ({MEALS_CATALOG.length})
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            openQuickMemorize(v.surah, v.ayah, v.page);
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <BookMarked className="w-3.5 h-3.5 text-[var(--brand-primary-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">Buradan Ezber Başlat</span>
                        </button>

                        {mutashabihatCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              closeArPopover();
                              openMutashabihat(v.surah, v.ayah);
                            }}
                            className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" />
                            <span className="min-w-0 line-clamp-2">
                              Benzer Ayetler ({mutashabihatCount})
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            openVerseNoteModal(v.surah, v.ayah, v.page);
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center justify-between gap-1.5 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <StickyNote className="w-3.5 h-3.5 text-[var(--brand-primary-text)] shrink-0" />
                            <span className="min-w-0 line-clamp-2">
                              {existingNote ? 'Ayet Notunu Düzenle' : 'Ayet Notu Ekle'}
                            </span>
                          </span>
                          {existingNote && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: VERSE_NOTE_COLOR_STYLES[existingNote.color].dot,
                              }}
                            />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            openQuickResearch(v.surah, v.ayah, v.ayah, v.page);
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <Pin className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">Araştırmaya Ekle</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            if (manifest && meta) {
                              void audioQueueService.startSegmentQueue({
                                items: [
                                  {
                                    id: `loop_${v.id}`,
                                    type: 'ayah_range',
                                    label: `${bundle.surahMeta.nameTr} ${v.ayah}. Ayet`,
                                    surah: v.surah,
                                    startAyah: v.ayah,
                                    endAyah: v.ayah,
                                  },
                                ],
                                title: `${bundle.surahMeta.nameTr} ${v.ayah}. Ayet`,
                                context: 'single',
                                contextKey: `single:${v.id}`,
                                manifest,
                                meta,
                                prefs: audioPrefs,
                                queueLoopOverride: 'infinite',
                              });
                            }
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <Repeat className="w-3.5 h-3.5 text-[var(--brand-primary-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">Döngüde Dinle</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            openListeningDrawer({
                              initialTab: 'playlists',
                              pendingAddItem: {
                                type: 'ayah_range',
                                label: `${bundle.surahMeta.nameTr} ${v.ayah}. Ayet`,
                                surah: v.surah,
                                startAyah: v.ayah,
                                endAyah: v.ayah,
                              },
                            });
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <ListPlus className="w-3.5 h-3.5 text-[var(--brand-primary-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">Çalma Listesine Ekle</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            closeArPopover();
                            onShareVerse(v, bundle.surahMeta);
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <Share2 className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" />
                          <span className="min-w-0 line-clamp-2">Paylaşım Kartı Oluştur</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void handleCopyVerse(v);
                          }}
                          className="min-h-[40px] px-2.5 py-2 rounded-xl border text-left text-[11.5px] font-bold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 transition-colors cursor-pointer"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          {copiedId === v.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[var(--state-success)] shrink-0" />
                              <span className="min-w-0 line-clamp-2">Kopyalandı</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                              <span className="min-w-0 line-clamp-2">Metni Kopyala</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );

            return (
              <>
                {isMobileViewport && (
                  <div
                    aria-hidden="true"
                    onClick={closeArPopover}
                    className="fixed inset-0 z-[99] bg-black/45 backdrop-blur-[1px]"
                  />
                )}
                {popoverContent}
              </>
            );
          })(),
          document.body,
        )}

      {/* ====================================================================
          TAŞINABİLİR KOMPAKT AYET İNCELEME PENCERESİ (Kelime Analizi & Dipnot)
          ==================================================================== */}
      <DraggableVerseInspector
        isOpen={Boolean(inspectorVerse)}
        verse={inspectorVerse}
        surahMeta={bundle.surahMeta}
        settings={settings}
        wordMode={studyPrefs.wordMode}
        isBookmarked={Boolean(inspectorVerse && bookmarkedSet.has(inspectorVerse.id))}
        isPlaying={Boolean(inspectorVerse && playingAyahId === inspectorVerse.id)}
        onClose={() => setInspectorVerse(null)}
        onPlayFromVerse={(v) => {
          setSelectedVerseKey(`${v.surah}:${v.ayah}`);
          onPlayFromAyah(verseIndexMap.get(v.id) ?? 0, 'ar');
        }}
        onPlayMealFromVerse={(v) => {
          setSelectedVerseKey(`${v.surah}:${v.ayah}`);
          onPlayFromAyah(verseIndexMap.get(v.id) ?? 0, 'meal');
        }}
        onToggleBookmark={toggleBookmarkAyah}
        onShareVerse={onShareVerse}
        onOpenSurahInfo={onOpenSurahInfo}
      />
    </div>
  );
};
