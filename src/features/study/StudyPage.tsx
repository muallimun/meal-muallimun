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
  AlertTriangle,
  AudioLines,
  Bookmark,
  BookOpen,
  BookText,
  ChevronDown,
  ChevronRight,
  Columns2,
  Headphones,
  Info,
  Languages,
  LayoutList,
  ListMusic,
  Menu,
  Minimize2,
  Minus,
  MonitorPlay,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Type,
  Volume2,
  X,
} from 'lucide-react';
import { PresentationModeOverlay } from '../../components/PresentationModeOverlay';
import { VerseShareModal } from '../../components/VerseShareModal';
import { ARABIC_FONTS, getDynamicMealAudioSources } from '../../config/assetsConfig';
import { findMealById } from '../../config/mealsConfig';
import { findReciterById } from '../../config/recitersConfig';
import { audioQueueService } from '../../services/audioQueueService';
import {
  dataService,
  findFirstLocationForJuz,
  findPageForSurahAyah,
  getPageBounds,
} from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import {
  PLAYBACK_RATE_OPTIONS,
  type AudioPlayMode,
  type CombinedVerse,
  type DesktopCombinedLayout,
  type DesktopPageLayout,
  type PageBundle,
  type ReaderContentMode,
  type RepeatCountOption,
  type StudyViewMode,
  type SurahBundle,
  type SurahMeta,
  type ThemeMode,
  type WordMealMode,
} from '../../types/quran';
import { useBackButtonGuard } from '../../services/backStackService';
import {
  ARABIC_LINE_HEIGHT_OPTIONS,
  ARABIC_TEXT_DENSITY_OPTIONS,
} from '../../utils/arabicUtils';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import { buildSurahQuestionCountMap, getSurahMap } from '../../utils/poolUtils';
import { useTajweedData } from '../../hooks/useTajweedData';
import { BookModeView } from './BookModeView';
import {
  LocationPickerModal,
  type LocationPickerTab,
  type SelectedRukuInfo,
} from './LocationPickerModal';
import { MobileReaderDrawer } from './MobileReaderDrawer';
import { MushafPageView } from './MushafPageView';
import { SurahInfoModal } from './SurahInfoModal';
import { TAJWEED_DIACRITIC_NOTE, TajweedLegendBar } from './TajweedLegendBar';
import { VerseCardsView } from './VerseCardsView';

const EMPTY_TAJWEED_SURAH_NOS: readonly number[] = [];

type ActiveSelectionScope =
  | { kind: 'default' }
  | { kind: 'surah'; surahNo: number }
  | { kind: 'page'; pageNo: number }
  | { kind: 'juz'; juzNo: number }
  | ({ kind: 'ruku' } & SelectedRukuInfo);

type StageLayoutIconKind = 'single' | 'dual' | 'side_by_side' | 'rahle_dual';

const StageLayoutIcon: React.FC<{ kind: StageLayoutIconKind; active?: boolean }> = ({
  kind,
  active = false,
}) => {
  const stroke = active ? 'currentColor' : 'var(--text-muted)';
  if (kind === 'single') {
    return (
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="3.5" y="1" width="9" height="12" rx="1.5" stroke={stroke} strokeWidth="1.3" />
        <path d="M5.75 4.25h4.5M5.75 7h4.5M5.75 9.75h3" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'dual') {
    return (
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="7" height="12" rx="1.2" stroke={stroke} strokeWidth="1.25" />
        <rect x="8" y="1" width="7" height="12" rx="1.2" stroke={stroke} strokeWidth="1.25" />
        <path
          d="M2.8 4.5h3.4M2.8 7h3.4M2.8 9.5h2.4M9.8 4.5h3.4M9.8 7h3.4M9.8 9.5h2.4"
          stroke={stroke}
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'side_by_side') {
    return (
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="7" height="12" rx="1.2" stroke={stroke} strokeWidth="1.25" />
        <rect
          x="8"
          y="1"
          width="7"
          height="12"
          rx="1.2"
          stroke={stroke}
          strokeWidth="1.25"
          fill="currentColor"
          fillOpacity={active ? '0.14' : '0.07'}
        />
        <path d="M2.7 4.25h3.6M2.7 6.8h3.6M2.7 9.35h2.6" stroke={stroke} strokeWidth="1" strokeLinecap="round" />
        <path d="M9.8 4.5h3.4M9.8 7.2h3.4M10.8 9.7h2.4" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="7" height="12" rx="1.2" stroke={stroke} strokeWidth="1.2" />
      <rect x="8" y="1" width="7" height="12" rx="1.2" stroke={stroke} strokeWidth="1.2" />
      <path d="M2.8 4.2h3.4M2.8 6.5h2.5M9.8 4.2h3.4M9.8 6.5h3.4" stroke={stroke} strokeWidth="1" strokeLinecap="round" />
      <rect x="5" y="7.8" width="6.5" height="4.8" rx="1.1" fill="var(--bg-surface)" stroke={stroke} strokeWidth="1.2" />
      <path d="M6.6 10.2h3.3" stroke={stroke} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
};

export const StudyPage: React.FC = () => {
  const {
    settings,
    updateSettings,
    setMealDisplayMode,
    studyPrefs,
    updateStudyPrefs,
    studyProgress,
    setLastRead,
    toggleBookmarkAyah,
    audioPrefs,
    updateAudioPrefs,
    poolStats,
    manifest,
    meta,
    questionIndex,
    studyNavTarget,
    clearStudyNavTarget,
    navigateToExam,
    isPresentationOpen,
    openPresentationMode,
    closePresentationMode,
    openMealSelector,
    openReciterSelector,
    openBookmarksDrawer,
    openSearchModal,
    openSettingsModal,
    openListeningDrawer,
    openWaqfGuide,
    isMobileReaderImmersive,
    setIsMobileReaderImmersive,
    setActiveTab,
    isAudioBarExpanded,
    isAudioBarMinimized,
    selectedVerseKey,
    setSelectedVerseKey,
    registerReaderSmartPlay,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  // Yalnızca Renkli Tecvit açıkken meta.json (renk anahtarı) tembel olarak yüklenir
  const { rules: tajweedMetaRules, isLoading: isLoadingTajweedMeta } = useTajweedData(
    EMPTY_TAJWEED_SURAH_NOS,
    settings.tajweedEnabled,
  );

  const pageBounds = useMemo(
    () => (meta ? getPageBounds(meta) : { minPage: 1, maxPage: 604 }),
    [meta],
  );
  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const primaryMealDef = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const secondaryMealDef = useMemo(
    () => findMealById(settings.secondaryMealId, manifest),
    [settings.secondaryMealId, manifest],
  );
  const isDualMeal = settings.mealDisplayMode === 'dual' || settings.preferredMeal === 'both';

  // İlk açılış konumu: studyNavTarget > lastRead > havuzun ilk suresi > 49 (Hucurat)
  const initialSurahNo = useMemo(() => {
    if (studyNavTarget?.surah) return studyNavTarget.surah;
    if (studyProgress.lastRead?.surah) return studyProgress.lastRead.surah;
    return poolStats.effectiveSurahs[0] ?? 49;
  }, [studyNavTarget?.surah, studyProgress.lastRead?.surah, poolStats.effectiveSurahs]);

  const initialPageNo = useMemo(() => {
    if (studyNavTarget?.page) return studyNavTarget.page;
    if (meta && studyNavTarget?.surah) {
      return findPageForSurahAyah(meta, studyNavTarget.surah, studyNavTarget.ayah ?? 1);
    }
    if (studyProgress.lastRead?.page) return studyProgress.lastRead.page;
    if (meta) return findPageForSurahAyah(meta, initialSurahNo, 1);
    return pageBounds.minPage;
  }, [
    studyNavTarget?.page,
    studyNavTarget?.surah,
    studyNavTarget?.ayah,
    studyProgress.lastRead?.page,
    meta,
    initialSurahNo,
    pageBounds.minPage,
  ]);

  const [currentSurahNo, setCurrentSurahNo] = useState<number>(initialSurahNo);
  const [currentPageNo, setCurrentPageNo] = useState<number>(initialPageNo);
  const [selectedAyahId, setSelectedAyahId] = useState<number | null>(
    studyProgress.lastRead
      ? studyProgress.lastRead.surah * 1000 + studyProgress.lastRead.ayah
      : null,
  );
  const selectedAyahIdRef = useRef<number | null>(selectedAyahId);
  selectedAyahIdRef.current = selectedAyahId;

  const [activeSelectionScope, setActiveSelectionScope] = useState<ActiveSelectionScope>({
    kind: 'default',
  });
  const activeSelectionScopeRef = useRef<ActiveSelectionScope>(activeSelectionScope);
  activeSelectionScopeRef.current = activeSelectionScope;
  const [activeRukuVerses, setActiveRukuVerses] = useState<CombinedVerse[]>([]);

  const [jumpToAyahNo, setJumpToAyahNo] = useState<number | null>(null);
  const [jumpNonce, setJumpNonce] = useState(0);
  const [navResetNonce, setNavResetNonce] = useState(0);

  const [pageBundle, setPageBundle] = useState<PageBundle | null>(null);
  const [secondPageBundle, setSecondPageBundle] = useState<PageBundle | null>(null);
  const [surahBundle, setSurahBundle] = useState<SurahBundle | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(true);
  const [viewError, setViewError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const lastSyncedAudioAyahRef = useRef<number | null>(null);
  const lastScrolledAudioAyahRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const pendingPausedSyncRef = useRef(false);
  const pendingPageEdgeSelectionRef = useRef<'first' | 'last' | null>(null);
  const lastLocationPickerTabRef = useRef<LocationPickerTab | null>(null);

  // Yeni Sade Arayüz Popover & Çekmece Durumları
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [locationPickerTab, setLocationPickerTab] = useState<LocationPickerTab>('surah');
  const [isViewPopoverOpen, setIsViewPopoverOpen] = useState(false);
  const [isListenPopoverOpen, setIsListenPopoverOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isMobileBarHidden, setIsMobileBarHidden] = useState(false);
  const [topbarPortalSlot, setTopbarPortalSlot] = useState<HTMLElement | null>(null);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState(false);

  useBackButtonGuard('favorites_drawer', isFavoritesDrawerOpen, () => {
    setIsFavoritesDrawerOpen(false);
  });

  useBackButtonGuard(
    'mobile_reader_immersive',
    (studyPrefs.viewMode === 'mushaf' || studyPrefs.viewMode === 'book') &&
      isMobileReaderImmersive,
    () => {
      setIsMobileReaderImmersive(false);
    },
  );

  useEffect(() => {
    if (!isFavoritesDrawerOpen) return;
    return acquireBodyScrollLock();
  }, [isFavoritesDrawerOpen]);
  const [infoModalSurah, setInfoModalSurah] = useState<SurahMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    verse: CombinedVerse;
    surahMeta: SurahMeta;
  } | null>(null);

  const viewPopoverRef = useRef<HTMLDivElement | null>(null);
  const listenPopoverRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef<number>(0);
  const selectedVerseKeyRef = useRef<string | null>(selectedVerseKey);

  useEffect(() => {
    selectedVerseKeyRef.current = selectedVerseKey;
  }, [selectedVerseKey]);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );
  const mealAudioSources = useMemo(() => getDynamicMealAudioSources(manifest), [manifest]);

  const [isDesktopLg, setIsDesktopLg] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktopLg(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const viewMode = studyPrefs.viewMode;
  const activeMushafLayout = settings.mushafLayout;
  const readerContentMode = settings.readerContentMode;
  const isMealOnlyContent = readerContentMode === 'meal_only';
  const isArOnlyContent = readerContentMode === 'ar_only';
  const isDualLeafMushaf =
    activeMushafLayout === 'dual' ||
    activeMushafLayout === 'rahle_dual' ||
    activeMushafLayout === 'meal_dual';
  const isEffectiveDualLeaf = isDualLeafMushaf && isDesktopLg;
  const bookmarkedSet = useMemo(
    () => new Set(studyProgress.bookmarkedAyahIds),
    [studyProgress.bookmarkedAyahIds],
  );

  // Masaüstü Birleşik Üst Bar Portal Yuvasını yakala
  useLayoutEffect(() => {
    const slot = document.getElementById('app-topbar-context-slot');
    if (slot) setTopbarPortalSlot(slot);
  }, []);

  // Masaüstü Görünüm popover dışına tıklanınca kapat
  useEffect(() => {
    if (!isViewPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (viewPopoverRef.current && !viewPopoverRef.current.contains(e.target as Node)) {
        setIsViewPopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsViewPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isViewPopoverOpen]);

  // Masaüstü Dinle ▾ popover dışına tıklanınca veya Escape ile kapat (geçmiş/history kullanmaz)
  useEffect(() => {
    if (!isListenPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (listenPopoverRef.current && !listenPopoverRef.current.contains(e.target as Node)) {
        setIsListenPopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsListenPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isListenPopoverOpen]);

  // Mobilde Kartlar, Kitap ve Tam Ekran modlarında aşağı kaydırırken üst şeridi akıllıca gizle, yukarıda göster
  useEffect(() => {
    setIsMobileBarHidden(false);
    lastScrollYRef.current = typeof window !== 'undefined' ? window.scrollY : 0;

    const shouldAutoHideOnScroll =
      viewMode === 'cards' ||
      viewMode === 'book' ||
      ((viewMode === 'mushaf' || viewMode === 'book') && isMobileReaderImmersive);

    if (!shouldAutoHideOnScroll) return;

    const handleScroll = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileBarHidden(false);
        return;
      }
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;

      if (currentY <= 24) {
        setIsMobileBarHidden(false);
      } else if (delta > 10 && currentY > 56) {
        setIsMobileBarHidden(true);
      } else if (delta < -6) {
        setIsMobileBarHidden(false);
      }
      lastScrollYRef.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [viewMode, currentSurahNo, currentPageNo, isMobileReaderImmersive]);

  useEffect(() => {
    if (isMobileDrawerOpen || isLocationPickerOpen) {
      setIsMobileBarHidden(false);
    }
  }, [isMobileDrawerOpen, isLocationPickerOpen]);

  // Dışarıdan (Ana Sayfa / Sınav / Arama) gelen doğrudan navigasyon hedeflerini işle
  const handledTargetNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!studyNavTarget || !meta) return;
    if (handledTargetNonceRef.current === studyNavTarget.nonce) return;
    handledTargetNonceRef.current = studyNavTarget.nonce;

    const targetSurah = studyNavTarget.surah ?? currentSurahNo;
    const targetAyah = studyNavTarget.ayah ?? 1;
    const targetPage =
      studyNavTarget.page ?? findPageForSurahAyah(meta, targetSurah, targetAyah);
    const targetAyahId = targetSurah * 1000 + targetAyah;

    selectedAyahIdRef.current = targetAyahId;
    pendingPageEdgeSelectionRef.current = null;
    setActiveSelectionScope({ kind: 'default' });
    setCurrentSurahNo(targetSurah);
    setCurrentPageNo(targetPage);
    setSelectedAyahId(targetAyahId);
    setSelectedVerseKey(studyNavTarget.ayah ? `${targetSurah}:${targetAyah}` : null);
    setJumpToAyahNo(targetAyah);
    setJumpNonce((n) => n + 1);
    setNavResetNonce((n) => n + 1);
    clearStudyNavTarget();
  }, [studyNavTarget, meta, currentSurahNo, clearStudyNavTarget, setSelectedVerseKey]);

  // Aktif Rükû kapsamı seçiliyse ilgili surenin rükû ayet dilimini (startAyah..endAyah) arka planda hazır tut
  useEffect(() => {
    if (activeSelectionScope.kind !== 'ruku') {
      setActiveRukuVerses([]);
      return;
    }
    const rukuScope = activeSelectionScope;
    let cancelled = false;

    const resolveRukuVerses = async () => {
      try {
        const bundle =
          surahBundle && surahBundle.surahMeta.no === rukuScope.surah
            ? surahBundle
            : await dataService.getSurahBundle(rukuScope.surah);
        if (cancelled) return;
        const slice = bundle.verses.filter(
          (v) => v.ayah >= rukuScope.startAyah && v.ayah <= rukuScope.endAyah,
        );
        setActiveRukuVerses(slice);

        if (pendingPausedSyncRef.current && slice.length > 0) {
          const snap = audioQueueService.getSnapshot();
          if (snap.status === 'paused' || snap.status === 'error') {
            pendingPausedSyncRef.current = false;
            const target =
              slice.find((v) => v.id === selectedAyahIdRef.current) ?? slice[0];
            audioQueueService.syncPausedSelection(target, meta, slice, {
              replaceQueue: true,
              context: 'custom',
              contextKey: `ruku:${rukuScope.no}`,
              queueTitle: `${bundle.surahMeta.shortNameTr} · ${rukuScope.surahRuku}. Rükû (${rukuScope.startAyah}–${rukuScope.endAyah})`,
            });
          }
        }
      } catch {
        if (!cancelled) setActiveRukuVerses([]);
      }
    };

    void resolveRukuVerses();
    return () => {
      cancelled = true;
    };
  }, [activeSelectionScope, surahBundle, meta]);

  // Sayfa (Tek veya Çift) ya da Sure verisini yükle + sonraki sayfayı arka planda önbelleğe al
  useEffect(() => {
    if (!meta) return;
    let cancelled = false;

    async function loadContent() {
      setIsLoadingView(true);
      setViewError(null);
      try {
        if (viewMode === 'mushaf') {
          const firstPageNo =
            isEffectiveDualLeaf && currentPageNo >= pageBounds.maxPage
              ? Math.max(pageBounds.minPage, pageBounds.maxPage - 1)
              : currentPageNo;
          const shouldLoadSecond = isEffectiveDualLeaf && firstPageNo < pageBounds.maxPage;
          const [bundle, nextBundle] = await Promise.all([
            dataService.getPageBundle(firstPageNo),
            shouldLoadSecond ? dataService.getPageBundle(firstPageNo + 1) : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setPageBundle(bundle);
          setSecondPageBundle(nextBundle);

          const preloadPage = shouldLoadSecond ? firstPageNo + 2 : firstPageNo + 1;
          if (preloadPage <= pageBounds.maxPage) {
            dataService.getPageBundle(preloadPage).catch(() => {});
          }

          const combinedVerses = nextBundle
            ? [...bundle.verses, ...nextBundle.verses]
            : bundle.verses;

          if (combinedVerses.length > 0) {
            const curKey = selectedVerseKeyRef.current;
            if (curKey && !combinedVerses.some((v) => `${v.surah}:${v.ayah}` === curKey)) {
              setSelectedVerseKey(null);
            }
            const edgePref = pendingPageEdgeSelectionRef.current;
            pendingPageEdgeSelectionRef.current = null;
            const targetId = selectedAyahIdRef.current;
            const matched =
              edgePref === 'last'
                ? combinedVerses[combinedVerses.length - 1]
                : edgePref === 'first'
                  ? combinedVerses[0]
                  : combinedVerses.find((v) => v.id === targetId);
            const activeVerse = matched ?? combinedVerses[0];
            selectedAyahIdRef.current = activeVerse.id;
            setSelectedAyahId(activeVerse.id);
            setCurrentSurahNo(activeVerse.surah);
            setLastRead({
              surah: activeVerse.surah,
              ayah: activeVerse.ayah,
              page: bundle.pageNo,
              viewMode: 'mushaf',
            });

            if (pendingPausedSyncRef.current && activeSelectionScopeRef.current.kind !== 'ruku') {
              pendingPausedSyncRef.current = false;
              const snap = audioQueueService.getSnapshot();
              if (snap.status === 'paused' || snap.status === 'error') {
                audioQueueService.syncPausedSelection(activeVerse, meta, combinedVerses, {
                  replaceQueue: true,
                  context: 'page',
                  contextKey: `page:${bundle.pageNo}`,
                  queueTitle: `Sayfa ${bundle.pageNo}`,
                });
              }
            }
          }
        } else {
          setSecondPageBundle(null);
          const bundle = await dataService.getSurahBundle(currentSurahNo);
          if (cancelled) return;
          setSurahBundle(bundle);

          if (bundle.verses.length > 0) {
            const curKey = selectedVerseKeyRef.current;
            if (curKey && !bundle.verses.some((v) => `${v.surah}:${v.ayah}` === curKey)) {
              setSelectedVerseKey(null);
            }
            pendingPageEdgeSelectionRef.current = null;
            const targetId = selectedAyahIdRef.current;
            const matched = bundle.verses.find((v) => v.id === targetId);
            const activeVerse = matched ?? bundle.verses[0];
            selectedAyahIdRef.current = activeVerse.id;
            setSelectedAyahId(activeVerse.id);
            setCurrentPageNo(activeVerse.page);
            setLastRead({
              surah: bundle.surahMeta.no,
              ayah: activeVerse.ayah,
              page: activeVerse.page,
              viewMode,
            });

            if (pendingPausedSyncRef.current && activeSelectionScopeRef.current.kind !== 'ruku') {
              pendingPausedSyncRef.current = false;
              const snap = audioQueueService.getSnapshot();
              if (snap.status === 'paused' || snap.status === 'error') {
                audioQueueService.syncPausedSelection(activeVerse, meta, bundle.verses, {
                  replaceQueue: true,
                  context: 'surah',
                  contextKey: `surah:${bundle.surahMeta.no}`,
                  queueTitle: bundle.surahMeta.nameTr,
                });
              }
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        setViewError(
          err instanceof Error ? err.message : 'Okuma verisi yüklenirken bir hata oluştu.',
        );
      } finally {
        if (!cancelled) {
          setIsLoadingView(false);
        }
      }
    }

    loadContent();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, viewMode, currentPageNo, currentSurahNo, isEffectiveDualLeaf, reloadNonce]);

  // Mushaf modunda sayfanın son ayeti bitince otomatik sonraki sayfaya geçiş sağlayıcısı
  useEffect(() => {
    if (viewMode !== 'mushaf' || !meta) {
      audioQueueService.registerNextPageProvider(null);
      return;
    }

    audioQueueService.registerNextPageProvider(
      async (nextPageNo: number, isSessionActive: () => boolean) => {
        if (nextPageNo > pageBounds.maxPage) return null;
        const firstPageNo =
          isEffectiveDualLeaf && nextPageNo >= pageBounds.maxPage
            ? Math.max(pageBounds.minPage, pageBounds.maxPage - 1)
            : nextPageNo;
        const shouldLoadSecond = isEffectiveDualLeaf && firstPageNo < pageBounds.maxPage;
        const [nextBundle, secondBundle] = await Promise.all([
          dataService.getPageBundle(firstPageNo),
          shouldLoadSecond ? dataService.getPageBundle(firstPageNo + 1) : Promise.resolve(null),
        ]);
        if (!isSessionActive() || nextBundle.verses.length === 0) return null;

        const combinedVerses = secondBundle
          ? [...nextBundle.verses, ...secondBundle.verses]
          : nextBundle.verses;
        const targetStartVerse =
          combinedVerses.find((v) => v.page >= nextPageNo) ?? nextBundle.verses[0];

        setCurrentPageNo(nextBundle.pageNo);
        setPageBundle(nextBundle);
        setSecondPageBundle(secondBundle);
        setSelectedAyahId(targetStartVerse.id);
        setCurrentSurahNo(targetStartVerse.surah);

        const preloadTarget = shouldLoadSecond ? firstPageNo + 2 : firstPageNo + 1;
        if (preloadTarget <= pageBounds.maxPage) {
          dataService.getPageBundle(preloadTarget).catch(() => {});
        }

        return {
          verses: combinedVerses,
          contextKey: `page:${nextBundle.pageNo}`,
        };
      },
    );

    return () => {
      audioQueueService.registerNextPageProvider(null);
    };
  }, [viewMode, meta, pageBounds.minPage, pageBounds.maxPage, isEffectiveDualLeaf]);

  // Aktif çalan ayete otomatik senkronizasyon ve yumuşak kaydırma
  useEffect(() => {
    if (!audioState.currentAyahId || audioState.status === 'idle') {
      lastSyncedAudioAyahRef.current = null;
      lastScrolledAudioAyahRef.current = null;
      return;
    }

    const isActivelyPlaying =
      audioState.status === 'playing' || audioState.status === 'loading';
    const isNewAudioAyah = audioState.currentAyahId !== lastSyncedAudioAyahRef.current;
    const needsScroll = audioState.currentAyahId !== lastScrolledAudioAyahRef.current;

    if (viewMode === 'mushaf') {
      const combined = pageBundle
        ? secondPageBundle
          ? [...pageBundle.verses, ...secondPageBundle.verses]
          : pageBundle.verses
        : [];
      const onThisPage = combined.find((v) => v.id === audioState.currentAyahId);
      if (onThisPage) {
        if (!isActivelyPlaying && !isNewAudioAyah) return;
        lastSyncedAudioAyahRef.current = onThisPage.id;
        setSelectedAyahId(onThisPage.id);
        setCurrentSurahNo(onThisPage.surah);
        setLastRead({
          surah: onThisPage.surah,
          ayah: onThisPage.ayah,
          page: onThisPage.page,
          viewMode: 'mushaf',
        });
        if (audioPrefs.autoScroll && needsScroll) {
          lastScrolledAudioAyahRef.current = onThisPage.id;
          const isDesktopDualSpread =
            (activeMushafLayout === 'mushaf_meal' || isDualLeafMushaf) && isDesktopLg;
          if (!isDesktopDualSpread) {
            const targetId = onThisPage.id;
            const isMealView = readerContentMode === 'meal_only';
            if (autoScrollRafRef.current !== null) {
              window.cancelAnimationFrame(autoScrollRafRef.current);
            }
            autoScrollRafRef.current = window.requestAnimationFrame(() => {
              autoScrollRafRef.current = null;
              if (isMealView) {
                const mealEl = document.querySelector<HTMLElement>(
                  `[data-meal-ayahs~="${targetId}"]`,
                );
                mealEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else {
                const el = document.getElementById(`mushaf-ayah-${targetId}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          }
        }
      } else if (
        audioPrefs.autoScroll &&
        isActivelyPlaying &&
        isNewAudioAyah &&
        audioState.currentPage &&
        audioState.currentPage !== pageBundle?.pageNo &&
        audioState.currentPage !== secondPageBundle?.pageNo &&
        audioState.currentPage !== currentPageNo
      ) {
        lastSyncedAudioAyahRef.current = audioState.currentAyahId;
        lastScrolledAudioAyahRef.current = null;
        setCurrentPageNo(audioState.currentPage);
        if (audioState.currentSurah) {
          setCurrentSurahNo(audioState.currentSurah);
        }
        setSelectedAyahId(audioState.currentAyahId);
      }
    } else if (viewMode === 'cards' || viewMode === 'book') {
      const inThisSurah = surahBundle?.verses.find((v) => v.id === audioState.currentAyahId);
      if (inThisSurah) {
        if (!isActivelyPlaying && !isNewAudioAyah) return;
        lastSyncedAudioAyahRef.current = inThisSurah.id;
        setSelectedAyahId(inThisSurah.id);
        setLastRead({
          surah: inThisSurah.surah,
          ayah: inThisSurah.ayah,
          page: inThisSurah.page,
          viewMode,
        });
        if (audioPrefs.autoScroll && needsScroll) {
          lastScrolledAudioAyahRef.current = inThisSurah.id;
          const elId =
            viewMode === 'book' ? `book-ayah-${inThisSurah.id}` : `verse-card-${inThisSurah.id}`;
          if (autoScrollRafRef.current !== null) {
            window.cancelAnimationFrame(autoScrollRafRef.current);
          }
          autoScrollRafRef.current = window.requestAnimationFrame(() => {
            autoScrollRafRef.current = null;
            const el = document.getElementById(elId);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        }
      } else if (
        audioPrefs.autoScroll &&
        isActivelyPlaying &&
        isNewAudioAyah &&
        audioState.currentSurah &&
        audioState.currentSurah !== currentSurahNo
      ) {
        lastSyncedAudioAyahRef.current = audioState.currentAyahId;
        lastScrolledAudioAyahRef.current = null;
        setCurrentSurahNo(audioState.currentSurah);
        if (audioState.currentPage) {
          setCurrentPageNo(audioState.currentPage);
        }
        setSelectedAyahId(audioState.currentAyahId);
      }
    }

    return () => {
      if (autoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    };
  }, [
    audioState.currentAyahId,
    audioState.currentPage,
    audioState.currentSurah,
    audioState.status,
    currentPageNo,
    currentSurahNo,
    viewMode,
    activeMushafLayout,
    isDualLeafMushaf,
    isDesktopLg,
    readerContentMode,
    pageBundle,
    secondPageBundle,
    surahBundle,
    audioPrefs.autoScroll,
    setLastRead,
  ]);

  const activeSurahMeta = useMemo(() => {
    if (!meta) return null;
    return meta.surahs.find((s) => s.no === currentSurahNo) ?? meta.surahs[0] ?? null;
  }, [meta, currentSurahNo]);

  const questionCountBySurah = useMemo(
    () => buildSurahQuestionCountMap(questionIndex),
    [questionIndex],
  );
  const activeSurahQuestionCount = activeSurahMeta
    ? (questionCountBySurah.get(activeSurahMeta.no) ?? 0)
    : 0;

  const activeViewVerses = useMemo<CombinedVerse[]>(() => {
    if (viewMode === 'mushaf' && pageBundle) {
      return secondPageBundle
        ? [...pageBundle.verses, ...secondPageBundle.verses]
        : pageBundle.verses;
    }
    return surahBundle?.verses ?? [];
  }, [viewMode, pageBundle, secondPageBundle, surahBundle]);

  const activeSelectedVerse = useMemo<CombinedVerse | null>(() => {
    return activeViewVerses.find((v) => v.id === selectedAyahId) ?? activeViewVerses[0] ?? null;
  }, [activeViewVerses, selectedAyahId]);

  const activeJuzNo = useMemo(() => {
    if (activeSelectedVerse) {
      if (
        typeof activeSelectedVerse.cuz === 'number' &&
        activeSelectedVerse.cuz >= 1 &&
        activeSelectedVerse.cuz <= 30
      ) {
        return activeSelectedVerse.cuz;
      }
      if (meta?.juzs && meta.juzs.length > 0) {
        const key = activeSelectedVerse.surah * 1000 + activeSelectedVerse.ayah;
        const matched = meta.juzs.find((j) => {
          const startKey = j.start.s * 1000 + j.start.a;
          const endKey = j.end.s * 1000 + j.end.a;
          return key >= startKey && key <= endKey;
        });
        if (matched) return matched.no;
      }
    }
    if (viewMode === 'mushaf' && pageBundle && pageBundle.cuzs.length > 0) {
      return pageBundle.cuzs[0];
    }
    if (activeSurahMeta && activeSurahMeta.cuzs.length > 0) {
      return activeSurahMeta.cuzs[0];
    }
    return 1;
  }, [activeSelectedVerse, meta, viewMode, pageBundle, activeSurahMeta]);

  const activeAyahNumber = activeSelectedVerse?.ayah ?? 1;
  const hasActiveRukuScope = activeSelectionScope.kind === 'ruku' && activeRukuVerses.length > 0;
  const activeRukuLabel = useMemo(() => {
    if (activeSelectionScope.kind !== 'ruku') return undefined;
    const sMeta = surahMap.get(activeSelectionScope.surah);
    const surahTitle = sMeta?.shortNameTr ?? `${activeSelectionScope.surah}. Sure`;
    return `${surahTitle} · ${activeSelectionScope.surahRuku}. Rükû (${activeSelectionScope.startAyah}–${activeSelectionScope.endAyah})`;
  }, [activeSelectionScope, surahMap]);

  const presentationVerses = useMemo<CombinedVerse[]>(
    () => (hasActiveRukuScope ? activeRukuVerses : activeViewVerses),
    [hasActiveRukuScope, activeRukuVerses, activeViewVerses],
  );

  const presentationActiveVerse = useMemo<CombinedVerse | null>(() => {
    return (
      presentationVerses.find((v) => v.id === selectedAyahId) ??
      presentationVerses[0] ??
      activeSelectedVerse
    );
  }, [presentationVerses, selectedAyahId, activeSelectedVerse]);

  const preparePausedAudioForNavigation = useCallback(
    (
      targetAyahId: number | null,
      options?: {
        replaceQueue?: boolean;
        queueVerses?: CombinedVerse[];
        context?: 'page' | 'surah' | 'custom';
        contextKey?: string;
        queueTitle?: string;
      },
    ) => {
      const snap = audioQueueService.getSnapshot();
      // Sunum Modu içinden konum değiştirildiğinde çalan ses varsa duraklat ki yeni konum hemen yansısın
      if (isPresentationOpen && (snap.status === 'playing' || snap.status === 'loading')) {
        audioQueueService.pause();
      }
      const nextSnap = audioQueueService.getSnapshot();
      if (nextSnap.status !== 'paused' && nextSnap.status !== 'error') {
        pendingPausedSyncRef.current = false;
        return;
      }

      const candidatePool = options?.queueVerses ?? activeViewVerses;
      const found =
        targetAyahId !== null ? candidatePool.find((v) => v.id === targetAyahId) : null;
      if (found) {
        pendingPausedSyncRef.current = false;
        audioQueueService.syncPausedSelection(found, meta, candidatePool, {
          replaceQueue: options?.replaceQueue,
          context: options?.context,
          contextKey: options?.contextKey,
          queueTitle: options?.queueTitle,
        });
      } else {
        pendingPausedSyncRef.current = true;
      }
    },
    [isPresentationOpen, activeViewVerses, meta],
  );

  const openLocationPicker = useCallback(
    (explicitTab?: LocationPickerTab) => {
      sfxService.play('click');
      const resolvedTab: LocationPickerTab =
        explicitTab ??
        (activeSelectionScope.kind === 'ruku'
          ? 'ruku'
          : lastLocationPickerTabRef.current ??
            (activeSelectionScope.kind === 'juz'
              ? 'juz'
              : viewMode === 'mushaf'
                ? 'page'
                : 'surah'));
      setLocationPickerTab(resolvedTab);
      setIsLocationPickerOpen(true);
    },
    [activeSelectionScope.kind, viewMode],
  );

  const handleSelectSurah = useCallback(
    (surahNo: number) => {
      if (!meta) return;
      const firstPage = findPageForSurahAyah(meta, surahNo, 1);
      const targetAyahId = surahNo * 1000 + 1;
      selectedAyahIdRef.current = targetAyahId;
      pendingPageEdgeSelectionRef.current = null;
      setActiveSelectionScope({ kind: 'surah', surahNo });
      setCurrentSurahNo(surahNo);
      setCurrentPageNo(firstPage);
      setSelectedAyahId(targetAyahId);
      setSelectedVerseKey(`${surahNo}:1`);
      setJumpToAyahNo(1);
      setJumpNonce((n) => n + 1);
      preparePausedAudioForNavigation(targetAyahId, {
        replaceQueue: true,
        context: viewMode === 'mushaf' ? 'page' : 'surah',
        contextKey: viewMode === 'mushaf' ? `page:${firstPage}` : `surah:${surahNo}`,
        queueTitle:
          viewMode === 'mushaf'
            ? `Sayfa ${firstPage}`
            : surahMap.get(surahNo)?.nameTr ?? `${surahNo}. Sure`,
      });
    },
    [meta, setSelectedVerseKey, preparePausedAudioForNavigation, viewMode, surahMap],
  );

  const handleSelectJuz = useCallback(
    (juzNo: number) => {
      if (!meta) return;
      sfxService.play('click');
      const loc = findFirstLocationForJuz(meta, juzNo);
      const targetAyahId = loc.surah * 1000 + loc.ayah;
      selectedAyahIdRef.current = targetAyahId;
      pendingPageEdgeSelectionRef.current = null;
      setActiveSelectionScope({ kind: 'juz', juzNo });
      setCurrentSurahNo(loc.surah);
      setCurrentPageNo(loc.page);
      setSelectedAyahId(targetAyahId);
      setSelectedVerseKey(`${loc.surah}:${loc.ayah}`);
      setJumpToAyahNo(loc.ayah);
      setJumpNonce((n) => n + 1);
      preparePausedAudioForNavigation(targetAyahId, {
        replaceQueue: true,
        context: viewMode === 'mushaf' ? 'page' : 'surah',
        contextKey: viewMode === 'mushaf' ? `page:${loc.page}` : `surah:${loc.surah}`,
        queueTitle:
          viewMode === 'mushaf'
            ? `${juzNo}. Cüz · Sayfa ${loc.page}`
            : surahMap.get(loc.surah)?.nameTr ?? `${loc.surah}. Sure`,
      });
    },
    [meta, setSelectedVerseKey, preparePausedAudioForNavigation, viewMode, surahMap],
  );

  const handleSelectRuku = useCallback(
    (ruku: SelectedRukuInfo) => {
      if (!meta) return;
      sfxService.play('click');
      const targetPage = findPageForSurahAyah(meta, ruku.surah, ruku.startAyah);
      const targetAyahId = ruku.surah * 1000 + ruku.startAyah;
      selectedAyahIdRef.current = targetAyahId;
      pendingPageEdgeSelectionRef.current = null;
      setActiveSelectionScope({ kind: 'ruku', ...ruku });
      setCurrentSurahNo(ruku.surah);
      setCurrentPageNo(targetPage);
      setSelectedAyahId(targetAyahId);
      setSelectedVerseKey(`${ruku.surah}:${ruku.startAyah}`);
      setJumpToAyahNo(ruku.startAyah);
      setJumpNonce((n) => n + 1);

      const snap = audioQueueService.getSnapshot();
      if (isPresentationOpen && (snap.status === 'playing' || snap.status === 'loading')) {
        audioQueueService.pause();
      }
      const nextSnap = audioQueueService.getSnapshot();
      if (nextSnap.status === 'paused' || nextSnap.status === 'error') {
        pendingPausedSyncRef.current = true;
      }
    },
    [meta, setSelectedVerseKey, isPresentationOpen],
  );

  const handleChangePage = useCallback(
    (nextPage: number) => {
      const clamped = Math.max(pageBounds.minPage, Math.min(pageBounds.maxPage, nextPage));
      selectedAyahIdRef.current = null;
      pendingPageEdgeSelectionRef.current = 'first';
      setActiveSelectionScope((prev) =>
        prev.kind === 'juz' ? prev : { kind: 'page', pageNo: clamped },
      );
      setSelectedVerseKey(null);
      setCurrentPageNo(clamped);
      if (viewMode !== 'mushaf') {
        updateStudyPrefs({ viewMode: 'mushaf' });
      }
      preparePausedAudioForNavigation(null, {
        replaceQueue: true,
        context: 'page',
        contextKey: `page:${clamped}`,
        queueTitle: `Sayfa ${clamped}`,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [
      pageBounds.minPage,
      pageBounds.maxPage,
      viewMode,
      updateStudyPrefs,
      setSelectedVerseKey,
      preparePausedAudioForNavigation,
    ],
  );

  const handleJumpAyah = useCallback(
    (ayahNo: number) => {
      if (!meta) return;
      sfxService.play('click');
      const targetPage = findPageForSurahAyah(meta, currentSurahNo, ayahNo);
      const ayahId = currentSurahNo * 1000 + ayahNo;
      selectedAyahIdRef.current = ayahId;
      pendingPageEdgeSelectionRef.current = null;
      setActiveSelectionScope((prev) => {
        if (
          prev.kind === 'ruku' &&
          prev.surah === currentSurahNo &&
          ayahNo >= prev.startAyah &&
          ayahNo <= prev.endAyah
        ) {
          return prev;
        }
        return { kind: 'default' };
      });
      setSelectedAyahId(ayahId);
      setSelectedVerseKey(`${currentSurahNo}:${ayahNo}`);
      setCurrentPageNo(targetPage);
      setJumpToAyahNo(ayahNo);
      setJumpNonce((n) => n + 1);
      preparePausedAudioForNavigation(ayahId, {
        replaceQueue: false,
      });
    },
    [meta, currentSurahNo, setSelectedVerseKey, preparePausedAudioForNavigation],
  );

  const canPresentationNextPage =
    viewMode === 'mushaf' &&
    !hasActiveRukuScope &&
    (isEffectiveDualLeaf
      ? (secondPageBundle?.pageNo ?? currentPageNo) < pageBounds.maxPage
      : currentPageNo < pageBounds.maxPage);

  const canPresentationPrevPage =
    viewMode === 'mushaf' && !hasActiveRukuScope && currentPageNo > pageBounds.minPage;

  const handlePresentationNextPage = useCallback(() => {
    if (!canPresentationNextPage) return;
    const nextPage = Math.min(
      pageBounds.maxPage,
      isEffectiveDualLeaf ? (secondPageBundle?.pageNo ?? currentPageNo) + 1 : currentPageNo + 1,
    );
    selectedAyahIdRef.current = null;
    pendingPageEdgeSelectionRef.current = 'first';
    setSelectedVerseKey(null);
    setCurrentPageNo(nextPage);
  }, [
    canPresentationNextPage,
    pageBounds.maxPage,
    isEffectiveDualLeaf,
    secondPageBundle?.pageNo,
    currentPageNo,
    setSelectedVerseKey,
  ]);

  const handlePresentationPrevPage = useCallback(() => {
    if (!canPresentationPrevPage) return;
    const prevPage = Math.max(
      pageBounds.minPage,
      currentPageNo - (isEffectiveDualLeaf ? 2 : 1),
    );
    selectedAyahIdRef.current = null;
    pendingPageEdgeSelectionRef.current = 'last';
    setSelectedVerseKey(null);
    setCurrentPageNo(prevPage);
  }, [
    canPresentationPrevPage,
    pageBounds.minPage,
    currentPageNo,
    isEffectiveDualLeaf,
    setSelectedVerseKey,
  ]);

  const handleSwitchViewMode = useCallback(
    (mode: StudyViewMode) => {
      if (mode === viewMode) return;
      sfxService.play('click');
      updateStudyPrefs({ viewMode: mode });
    },
    [viewMode, updateStudyPrefs],
  );

  const handleSelectReaderContentMode = useCallback(
    (mode: ReaderContentMode) => {
      sfxService.play('click');
      updateSettings({ readerContentMode: mode });
    },
    [updateSettings],
  );

  const handleSelectDesktopPageLayout = useCallback(
    (layout: DesktopPageLayout) => {
      sfxService.play('click');
      updateSettings({ desktopPageLayout: layout });
    },
    [updateSettings],
  );

  const handleSelectDesktopCombinedLayout = useCallback(
    (layout: DesktopCombinedLayout) => {
      sfxService.play('click');
      updateSettings({ desktopCombinedLayout: layout });
    },
    [updateSettings],
  );

  // Merkezi Akıllı Odak & Birleşik Dinleme Motoru
  const currentContextKey =
    hasActiveRukuScope && activeSelectionScope.kind === 'ruku'
      ? `ruku:${activeSelectionScope.no}`
      : viewMode === 'mushaf'
        ? `page:${currentPageNo}`
        : `surah:${currentSurahNo}`;

  const explicitSelectedVerse = useMemo<CombinedVerse | null>(() => {
    const pool = hasActiveRukuScope ? activeRukuVerses : activeViewVerses;
    if (!selectedVerseKey || pool.length === 0) return null;
    return pool.find((v) => `${v.surah}:${v.ayah}` === selectedVerseKey) ?? null;
  }, [selectedVerseKey, hasActiveRukuScope, activeRukuVerses, activeViewVerses]);

  const playingVerseKey =
    audioState.currentSurah !== null && audioState.currentAyah !== null
      ? `${audioState.currentSurah}:${audioState.currentAyah}`
      : null;

  const isAudioActivelyPlaying =
    audioState.isVisible &&
    (audioState.status === 'playing' || audioState.status === 'loading');

  const hasDifferentSelectedWhilePlaying =
    isAudioActivelyPlaying &&
    explicitSelectedVerse !== null &&
    selectedVerseKey !== null &&
    selectedVerseKey !== playingVerseKey;

  const handlePlayFromVerse = useCallback(
    (verse: CombinedVerse, singleAyahOnly = false, modeOverride?: AudioPlayMode) => {
      if (!manifest || !meta) return;

      const useRukuQueue =
        activeSelectionScope.kind === 'ruku' &&
        activeRukuVerses.length > 0 &&
        activeRukuVerses.some((v) => v.id === verse.id);
      const targetVerses = useRukuQueue ? activeRukuVerses : activeViewVerses;
      if (targetVerses.length === 0) return;

      const idx = targetVerses.findIndex((v) => v.id === verse.id);
      selectedAyahIdRef.current = verse.id;
      setSelectedAyahId(verse.id);
      setSelectedVerseKey(`${verse.surah}:${verse.ayah}`);
      audioQueueService.startQueue({
        verses: targetVerses,
        startIndex: Math.max(0, idx),
        context: useRukuQueue ? 'custom' : viewMode === 'mushaf' ? 'page' : 'surah',
        contextKey: useRukuQueue
          ? `ruku:${activeSelectionScope.no}`
          : viewMode === 'mushaf'
            ? `page:${currentPageNo}`
            : `surah:${currentSurahNo}`,
        queueTitle: useRukuQueue ? activeRukuLabel : undefined,
        manifest,
        meta,
        prefs: audioPrefs,
        singleAyahOnly,
        modeOverride,
      });
    },
    [
      manifest,
      meta,
      activeSelectionScope,
      activeRukuVerses,
      activeRukuLabel,
      activeViewVerses,
      viewMode,
      currentPageNo,
      currentSurahNo,
      audioPrefs,
      setSelectedVerseKey,
    ],
  );

  const executeSmartReaderPlay = useCallback(
    (options?: { forceSwitchToSelected?: boolean }): boolean => {
      const defaultPool = hasActiveRukuScope ? activeRukuVerses : activeViewVerses;
      if (!manifest || !meta || defaultPool.length === 0) return false;

      // 0. Ses aktif çalıyorsa
      if (audioState.isVisible && (audioState.status === 'playing' || audioState.status === 'loading')) {
        if (
          options?.forceSwitchToSelected &&
          explicitSelectedVerse &&
          selectedVerseKey &&
          selectedVerseKey !== playingVerseKey
        ) {
          handlePlayFromVerse(explicitSelectedVerse, false);
          return true;
        }
        audioQueueService.pause();
        return true;
      }

      // Öncelik 1: Kullanıcının açıkça seçtiği bir ayet varsa kesinlikle oradan başlat/devam et
      if (explicitSelectedVerse) {
        if (
          audioQueueService.canResumeExactVerse(
            explicitSelectedVerse.surah,
            explicitSelectedVerse.ayah,
          )
        ) {
          audioQueueService.togglePlayPause();
        } else {
          handlePlayFromVerse(explicitSelectedVerse, false);
        }
        return true;
      }

      // Öncelik 2: Duraklatılmış ses o an açık sayfa/sure/rükû içindeyse kaldığı saniyeden devam et
      if (
        audioState.isVisible &&
        audioState.status === 'paused' &&
        audioState.currentAyahId !== null &&
        defaultPool.some((v) => v.id === audioState.currentAyahId)
      ) {
        audioQueueService.togglePlayPause();
        return true;
      }

      // Öncelik 3: Açık Mushaf sayfasının / aktif surenin / rükûnun ilk ayetinden kesintisiz başlat
      handlePlayFromVerse(defaultPool[0], false);
      return true;
    },
    [
      manifest,
      meta,
      hasActiveRukuScope,
      activeRukuVerses,
      activeViewVerses,
      audioState.isVisible,
      audioState.status,
      audioState.currentAyahId,
      explicitSelectedVerse,
      selectedVerseKey,
      playingVerseKey,
      handlePlayFromVerse,
    ],
  );

  useEffect(() => {
    registerReaderSmartPlay(executeSmartReaderPlay);
    return () => {
      registerReaderSmartPlay(null);
    };
  }, [registerReaderSmartPlay, executeSmartReaderPlay]);

  const handleHeaderListen = () => {
    sfxService.play('click');
    executeSmartReaderPlay({ forceSwitchToSelected: true });
  };

  const handleStartFromCurrentPageTop = () => {
    if (activeViewVerses.length === 0) return;
    sfxService.play('click');
    setIsListenPopoverOpen(false);
    handlePlayFromVerse(activeViewVerses[0], false);
  };

  const handleStartFromSurahBeginning = async () => {
    if (!manifest || !meta) return;
    sfxService.play('click');
    setIsListenPopoverOpen(false);
    try {
      const bundle =
        viewMode !== 'mushaf' && surahBundle && surahBundle.surahMeta.no === currentSurahNo
          ? surahBundle
          : await dataService.getSurahBundle(currentSurahNo);
      if (bundle.verses.length === 0) return;
      const firstVerse = bundle.verses[0];
      setSelectedAyahId(firstVerse.id);
      setSelectedVerseKey(`${firstVerse.surah}:${firstVerse.ayah}`);
      audioQueueService.startQueue({
        verses: bundle.verses,
        startIndex: 0,
        context: 'surah',
        contextKey: `surah:${currentSurahNo}`,
        queueTitle: bundle.surahMeta.nameTr,
        manifest,
        meta,
        prefs: audioPrefs,
        singleAyahOnly: false,
      });
    } catch {
      // ignore load errors
    }
  };

  const handleToggleCurrentScopeLoop = () => {
    sfxService.play('click');
    const isCurrentlyLooping = audioPrefs.queueLoop === 'infinite';
    const nextLoop = isCurrentlyLooping ? 1 : ('infinite' as const);
    updateAudioPrefs({ queueLoop: nextLoop });
    if (nextLoop === 'infinite' && (!audioState.isVisible || audioState.status === 'idle') && manifest && meta) {
      const startVerse = explicitSelectedVerse ?? activeViewVerses[0];
      if (startVerse) {
        const idx = Math.max(
          0,
          activeViewVerses.findIndex((v) => v.id === startVerse.id),
        );
        audioQueueService.startQueue({
          verses: activeViewVerses,
          startIndex: idx,
          context: viewMode === 'mushaf' ? 'page' : 'surah',
          contextKey: currentContextKey,
          manifest,
          meta,
          prefs: { ...audioPrefs, queueLoop: 'infinite' },
          singleAyahOnly: false,
        });
      }
    }
  };

  const handlePlayMealFromVerse = useCallback(
    (verse: CombinedVerse) => {
      sfxService.play('click');
      handlePlayFromVerse(verse, false, 'meal');
    },
    [handlePlayFromVerse],
  );

  const handleOpenPageInMushaf = useCallback(
    (pageNo: number, ayahId: number) => {
      setSelectedAyahId(ayahId);
      setCurrentPageNo(pageNo);
      updateStudyPrefs({ viewMode: 'mushaf' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [updateStudyPrefs],
  );

  const handleShareVerse = useCallback((verse: CombinedVerse, surahMeta: SurahMeta) => {
    setShareTarget({ verse, surahMeta });
  }, []);

  // Favori ayetlerin sure/ayet/sayfa bilgilerini çöz
  const bookmarkedItems = useMemo(() => {
    return studyProgress.bookmarkedAyahIds
      .map((ayahId) => {
        const surahNo = Math.floor(ayahId / 1000);
        const ayahNo = ayahId % 1000;
        const sMeta = surahMap.get(surahNo);
        const pageNo = meta ? findPageForSurahAyah(meta, surahNo, ayahNo) : 1;
        return {
          ayahId,
          surahNo,
          ayahNo,
          pageNo,
          surahName: sMeta?.shortNameTr ?? `${surahNo}. Sure`,
        };
      })
      .reverse();
  }, [studyProgress.bookmarkedAyahIds, surahMap, meta]);

  const desktopLocationLabel = activeSurahMeta
    ? `${activeSurahMeta.no}. ${activeSurahMeta.shortNameTr} · S.${currentPageNo} · Cüz ${activeJuzNo}`
    : `Sayfa ${currentPageNo} · Cüz ${activeJuzNo}`;

  const mobileLocationLabel = activeSurahMeta
    ? `${activeSurahMeta.no}. ${activeSurahMeta.shortNameTr} · S.${currentPageNo}`
    : `Sayfa ${currentPageNo}`;

  const mealButtonLabel = isDualMeal
    ? `${primaryMealDef.shortLabel} + 1`
    : primaryMealDef.shortLabel;

  const isPureMobileView = viewMode === 'mushaf' || viewMode === 'book';
  const bookmarkCount = studyProgress.pageBookmarks.length;

  const viewToolbarLabel = useMemo(() => {
    if (viewMode === 'mushaf') {
      switch (activeMushafLayout) {
        case 'single':
          return 'Görünüm · AR';
        case 'dual':
          return 'Görünüm · 2 Sayfa';
        case 'mushaf_meal':
          return 'Görünüm · AR+Meal';
        case 'rahle_dual':
          return 'Görünüm · Rahle';
        case 'meal_only':
          return 'Görünüm · Meal';
        case 'meal_dual':
          return 'Görünüm · 2s Meal';
      }
    }
    if (readerContentMode === 'ar_only') return 'Görünüm · AR';
    if (readerContentMode === 'meal_only') return 'Görünüm · Meal';
    return 'Görünüm · AR+Meal';
  }, [viewMode, activeMushafLayout, readerContentMode]);

  const desktopUnifiedToolbar = (
    <div
      role="toolbar"
      aria-label="Masaüstü okuma araç çubuğu"
      className="w-full flex items-center justify-center gap-1.5 min-w-0"
    >
      {/* 1. Mod Segmenti [Mushaf | Kartlar | Kitap] */}
      <div
        className="flex items-center h-9 p-0.5 rounded-xl border shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {(
          [
            { id: 'mushaf', label: 'Mushaf', icon: BookOpen },
            { id: 'cards', label: 'Kartlar', icon: LayoutList },
            { id: 'book', label: 'Kitap', icon: BookText },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = viewMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSwitchViewMode(tab.id)}
              className="h-8 px-2 xl:px-2.5 rounded-lg text-[11px] xl:text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <Icon className="w-3.5 h-3.5 shrink-0 hidden 2xl:block" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Birleşik Konum Seçici */}
      <button
        type="button"
        onClick={() => openLocationPicker()}
        title={`${desktopLocationLabel} — Sure, Sayfa, Cüz, Rükû veya Ayet seç`}
        className="h-9 px-2.5 rounded-xl border text-[11px] xl:text-xs font-extrabold flex items-center gap-1 cursor-pointer min-w-0 max-w-[140px] xl:max-w-[205px] 2xl:max-w-[245px] transition-colors hover:border-teal-600/50"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        <span className="truncate tabular-nums">{desktopLocationLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65" />
      </button>

      {/* 3. Tek / Çift Meal Seçici */}
      <button
        type="button"
        onClick={() => openMealSelector('primary')}
        title={`Aktif Meal: ${primaryMealDef.label}${isDualMeal ? ` + ${secondaryMealDef.label}` : ''}`}
        className="h-9 px-2 xl:px-2.5 rounded-xl border text-[11px] xl:text-xs font-bold flex items-center gap-1 cursor-pointer max-w-[92px] xl:max-w-[130px] 2xl:max-w-[165px] shrink-0 transition-colors hover:opacity-90"
        style={{
          backgroundColor: 'var(--brand-primary-soft)',
          borderColor: 'var(--brand-primary)',
          color: 'var(--brand-primary-text)',
        }}
      >
        <BookOpen className="w-3.5 h-3.5 shrink-0 hidden xl:block" />
        <span className="truncate">{mealButtonLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-75" />
      </button>

      {/* 4. Görünüm & Okuma Tercihleri Popover (İki Aşamalı İçerik + Sahne Düzeni, Bağlama Duyarlı) */}
      <div ref={viewPopoverRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            setIsListenPopoverOpen(false);
            setIsViewPopoverOpen((v) => !v);
          }}
          aria-expanded={isViewPopoverOpen}
          aria-label="Görünüm, içerik ve okuma tercihleri"
          title={viewToolbarLabel}
          className="h-9 w-9 xl:w-auto xl:px-2.5 rounded-xl border text-[11px] xl:text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          style={{
            backgroundColor: isViewPopoverOpen ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
            borderColor: isViewPopoverOpen ? 'var(--brand-primary)' : 'var(--border-subtle)',
            color: isViewPopoverOpen ? 'var(--brand-primary-text)' : 'var(--text-primary)',
          }}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="hidden xl:inline">{viewToolbarLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65 hidden xl:inline" />
        </button>

        {isViewPopoverOpen && (
          <div
            className="absolute right-0 top-11 z-50 w-[332px] max-w-[calc(100vw-1.5rem)] max-h-[82dvh] overflow-y-auto rounded-2xl border shadow-2xl p-3.5 space-y-3.5 text-left"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {/* Aşama 1 — İÇERİK (Tüm okuma modlarında geçerli) */}
            <div className="space-y-2">
              <span
                className="block text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                İçerik
              </span>

              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {(
                  [
                    { id: 'ar_only', label: 'Sadece Arapça' },
                    { id: 'ar_meal', label: 'Arapça + Meal' },
                    { id: 'meal_only', label: 'Sadece Meal' },
                  ] as { id: ReaderContentMode; label: string }[]
                ).map((opt) => {
                  const active = readerContentMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectReaderContentMode(opt.id)}
                      className="h-8 px-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aşama 2 — SAYFA DÜZENİ (Masaüstü · lg+ · Sadece Mushaf Modunda) */}
            {viewMode === 'mushaf' && (
              <div
                className="hidden lg:block pt-3 border-t space-y-2"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span
                  className="block text-[11px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Sayfa Düzeni (Masaüstü)
                </span>

                {readerContentMode === 'ar_only' && (
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: 'single', label: 'Tek Sayfa', icon: 'single' },
                        { id: 'dual', label: '2 Sayfa (Açık Mushaf)', icon: 'dual' },
                      ] as const
                    ).map((opt) => {
                      const active = settings.desktopPageLayout === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectDesktopPageLayout(opt.id)}
                          className="w-full h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-2.5 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface-soft)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          }}
                        >
                          <StageLayoutIcon kind={opt.icon} active={active} />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {readerContentMode === 'meal_only' && (
                  <div className="space-y-1.5">
                    {(
                      [
                        { id: 'single', label: 'Tek Sayfa Meal', icon: 'single' },
                        { id: 'dual', label: '2 Sayfa (Açık Kitap)', icon: 'dual' },
                      ] as const
                    ).map((opt) => {
                      const active = settings.desktopPageLayout === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectDesktopPageLayout(opt.id)}
                          className="w-full h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-2.5 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface-soft)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          }}
                        >
                          <StageLayoutIcon kind={opt.icon} active={active} />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {readerContentMode === 'ar_meal' && (
                  <div className="space-y-1.5">
                    {(
                      [
                        {
                          id: 'side_by_side',
                          label: 'Karşılıklı (Mushaf + Meal)',
                          icon: 'side_by_side',
                        },
                        {
                          id: 'rahle_dual',
                          label: '2 Sayfa Rahle (Tıklanan Meal)',
                          icon: 'rahle_dual',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = settings.desktopCombinedLayout === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectDesktopCombinedLayout(opt.id)}
                          className="w-full h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-2.5 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface-soft)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          }}
                        >
                          <StageLayoutIcon kind={opt.icon} active={active} />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                    {settings.desktopCombinedLayout === 'rahle_dual' && (
                      <p
                        className="text-[11px] leading-snug px-1 pt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Ayete dokunarak mealini, sesli okunuşunu ve analizini inceleyebilirsiniz.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Kitap Modu Sütun Düzeni (Masaüstü) */}
            {viewMode === 'book' && (
              <div
                className="hidden lg:block pt-3 border-t space-y-2"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span
                  className="block text-[11px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Sütun Düzeni (Masaüstü)
                </span>
                <div
                  className="grid grid-cols-2 gap-1 p-1 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {(
                    [
                      { id: 'single', label: 'Tek Sütun' },
                      { id: 'dual', label: 'Çift Sütun' },
                    ] as const
                  ).map((colOpt) => {
                    const active = settings.desktopPageLayout === colOpt.id;
                    return (
                      <button
                        key={colOpt.id}
                        type="button"
                        onClick={() => handleSelectDesktopPageLayout(colOpt.id)}
                        className="h-8 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        {colOpt.id === 'dual' && <Columns2 className="w-3.5 h-3.5 shrink-0" />}
                        <span>{colOpt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Kelime Meali (Yalnızca Kartlar modunda ve Arapça görünürken) */}
            {settings.wordByWordEnabled && viewMode === 'cards' && !isMealOnlyContent && (
              <div
                className="pt-3 border-t space-y-1.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span
                  className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>Kelime Meali</span>
                </span>
                <div
                  className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {(
                    [
                      { id: 'off', label: 'Kapalı' },
                      { id: 'visible', label: 'Açık' },
                      { id: 'quiz', label: 'Kendini Dene' },
                    ] as { id: WordMealMode; label: string }[]
                  ).map((opt) => {
                    const active = studyPrefs.wordMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateStudyPrefs({ wordMode: opt.id });
                        }}
                        className="h-8 px-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color:
                            active && opt.id === 'quiz'
                              ? 'var(--brand-accent-text)'
                              : active
                                ? 'var(--brand-primary-text)'
                                : 'var(--text-secondary)',
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2b. Okuma Yardımcıları (Tecvit, Karaoke, Rükû, Secâvend — bağlama duyarlı) */}
            <div
              className="pt-3 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {!isMealOnlyContent && (
                <>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.tajweedEnabled}
                    onClick={() => {
                      sfxService.play('click');
                      updateSettings({ tajweedEnabled: !settings.tajweedEnabled });
                    }}
                    className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <span
                        className="text-xs font-extrabold flex items-center gap-1.5"
                        style={{
                          color: settings.tajweedEnabled
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-primary)',
                        }}
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Renkli Tecvit</span>
                      </span>
                      <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Renkli harflere dokunarak kuralları inceleyin
                      </span>
                    </div>
                    <span
                      className="w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                      style={{
                        backgroundColor: settings.tajweedEnabled
                          ? 'var(--brand-primary)'
                          : 'var(--border-strong)',
                      }}
                    >
                      <span
                        className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                          settings.tajweedEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </button>

                  {settings.tajweedEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({ showTajweedLegend: !settings.showTajweedLegend });
                      }}
                      className="w-full h-8 px-2.5 rounded-lg border text-[11px] font-bold flex items-center justify-between cursor-pointer transition-colors"
                      style={{
                        backgroundColor: settings.showTajweedLegend
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface-soft)',
                        borderColor: settings.showTajweedLegend
                          ? 'var(--brand-primary)'
                          : 'var(--border-subtle)',
                        color: settings.showTajweedLegend
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-secondary)',
                      }}
                    >
                      <span>Tecvit Renk Şeridini Göster</span>
                      <span>{settings.showTajweedLegend ? 'Açık' : 'Gizli'}</span>
                    </button>
                  )}

                  <div
                    className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 flex items-start gap-2"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <Info
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <p
                      className="w-full max-w-full min-w-0 flex-1 whitespace-normal break-words text-xs leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {TAJWEED_DIACRITIC_NOTE}
                    </p>
                  </div>

                  {/* Kelime Takibi (Karaoke) */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.wordSyncEnabled}
                    onClick={() => {
                      sfxService.play('click');
                      updateSettings({ wordSyncEnabled: !settings.wordSyncEnabled });
                    }}
                    className="w-full pt-2 border-t flex items-center justify-between gap-2 text-left cursor-pointer"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="min-w-0">
                      <span
                        className="text-xs font-extrabold flex items-center gap-1.5"
                        style={{
                          color: settings.wordSyncEnabled
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-primary)',
                        }}
                      >
                        <AudioLines className="w-3.5 h-3.5 shrink-0" />
                        <span>Kelime Takibi (Karaoke)</span>
                      </span>
                      <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Okunan kelimeyi sesle eşzamanlı vurgula
                      </span>
                    </div>
                    <span
                      className="w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                      style={{
                        backgroundColor: settings.wordSyncEnabled
                          ? 'var(--brand-primary)'
                          : 'var(--border-strong)',
                      }}
                    >
                      <span
                        className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                          settings.wordSyncEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </button>
                </>
              )}

              {/* Rükû (ع) İşaretleri + Secâvend Durak Rehberi */}
              <div
                className={!isMealOnlyContent ? 'pt-2 border-t space-y-2' : 'space-y-2'}
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showRukuMarkers}
                  onClick={() => {
                    sfxService.play('click');
                    updateSettings({ showRukuMarkers: !settings.showRukuMarkers });
                  }}
                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <span
                      className="text-xs font-extrabold flex items-center gap-1.5"
                      style={{
                        color: settings.showRukuMarkers
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-primary)',
                      }}
                    >
                      <span className="arabic-title text-sm leading-none">ع</span>
                      <span>Rükû (ع) İşaretleri</span>
                    </span>
                    <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      556 konu bölümü sonunda tıklanabilir rozet göster
                    </span>
                  </div>
                  <span
                    className="w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                    style={{
                      backgroundColor: settings.showRukuMarkers
                        ? 'var(--brand-primary)'
                        : 'var(--border-strong)',
                    }}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        settings.showRukuMarkers ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>

                {!isMealOnlyContent && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsViewPopoverOpen(false);
                      openWaqfGuide();
                    }}
                    className="w-full h-8 px-2.5 rounded-lg border text-[11px] font-bold flex items-center justify-between cursor-pointer transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary-text)' }} />
                      <span>Secâvend Durak Rehberi</span>
                    </span>
                    <span className="text-[10px] font-extrabold" style={{ color: 'var(--brand-primary-text)' }}>
                      8 İşaret →
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* 3. Hızlı Yazı Boyutu (Bağlama Duyarlı: Arapça & Meal) */}
            <div
              className="pt-3 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="block text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Yazı Boyutu
              </span>

              {!isMealOnlyContent && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">
                    Arapça Metin ({settings.arabicFontSize}px)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({
                          arabicFontSize: Math.max(20, settings.arabicFontSize - 2),
                        });
                      }}
                      aria-label="Arapça yazı boyutunu küçült"
                      title="Arapça yazı boyutunu küçült"
                      className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-extrabold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({
                          arabicFontSize: Math.min(44, settings.arabicFontSize + 2),
                        });
                      }}
                      aria-label="Arapça yazı boyutunu büyüt"
                      title="Arapça yazı boyutunu büyüt"
                      className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-extrabold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {!isArOnlyContent && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">
                    Meal Metni ({settings.turkishFontSize}px)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({
                          turkishFontSize: Math.max(14, settings.turkishFontSize - 1),
                        });
                      }}
                      aria-label="Meal yazı boyutunu küçült"
                      title="Meal yazı boyutunu küçült"
                      className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-extrabold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({
                          turkishFontSize: Math.min(24, settings.turkishFontSize + 1),
                        });
                      }}
                      aria-label="Meal yazı boyutunu büyüt"
                      title="Meal yazı boyutunu büyüt"
                      className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-extrabold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {!isMealOnlyContent && (
                <div className="pt-1.5 space-y-2.5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">Kelime Sıklığı</span>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                        Kelime aralığı
                      </span>
                    </div>
                    <div
                      className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                      style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                      role="group"
                      aria-label="Arapça kelime sıklığı"
                    >
                      {ARABIC_TEXT_DENSITY_OPTIONS.map((opt) => {
                        const active = (settings.arabicTextDensity ?? 'balanced') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={active}
                            title={opt.description}
                            onClick={() => {
                              sfxService.play('click');
                              updateSettings({ arabicTextDensity: opt.id });
                            }}
                            className="h-8 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                            style={{
                              backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                              color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">Satır Aralığı</span>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                        Satır yüksekliği
                      </span>
                    </div>
                    <div
                      className="grid grid-cols-4 gap-1 p-1 rounded-xl"
                      style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                      role="group"
                      aria-label="Arapça satır aralığı"
                    >
                      {ARABIC_LINE_HEIGHT_OPTIONS.map((opt) => {
                        const active = (settings.arabicLineHeight ?? 'balanced') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={active}
                            title={opt.description}
                            onClick={() => {
                              sfxService.play('click');
                              updateSettings({ arabicLineHeight: opt.id });
                            }}
                            className="h-8 px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                            style={{
                              backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                              color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Hızlı Arapça Yazı Tipi Seçimi (Yalnızca Arapça görünürken) */}
            {!isMealOnlyContent && (
              <div
                className="pt-3 border-t space-y-1.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <label
                  htmlFor="quick-arabic-font-select"
                  className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>Arapça Mushaf Hattı</span>
                </label>
                <select
                  id="quick-arabic-font-select"
                  value={settings.arabicFont}
                  onChange={(e) => {
                    sfxService.play('click');
                    updateSettings({ arabicFont: e.target.value });
                  }}
                  className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-600/40"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {ARABIC_FONTS.map((font) => (
                    <option key={font.id} value={font.label}>
                      {font.label}
                    </option>
                  ))}
                </select>
                {settings.tajweedEnabled && (
                  <p className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                    Tecvit açıkken harf birleşmeleri için Uthmani OpenType hattı kullanılır.
                  </p>
                )}
              </div>
            )}

            {/* 5. Hızlı Tema Seçici (Açık / Krem / Gece) */}
            <div
              className="pt-3 border-t space-y-1.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Tema</span>
              </span>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {(
                  [
                    { id: 'light', label: 'Açık', swatch: '#FFFFFF' },
                    { id: 'cream', label: 'Krem', swatch: '#FAF6EE' },
                    { id: 'dark', label: 'Gece', swatch: '#0B1314' },
                  ] as { id: ThemeMode; label: string; swatch: string }[]
                ).map((opt) => {
                  const active = settings.theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({ theme: opt.id });
                      }}
                      className="h-8 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full border shrink-0"
                        style={{
                          backgroundColor: opt.swatch,
                          borderColor: 'var(--border-strong)',
                        }}
                      />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. [ 🎧 Dinle | ▾ ] — Akıllı Bölünmüş Dinleme Butonu & Hızlı Dinleme Menüsü */}
      <div ref={listenPopoverRef} className="relative shrink-0">
        <div
          className="inline-flex items-center h-9 rounded-xl overflow-hidden shrink-0"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <button
            type="button"
            onClick={handleHeaderListen}
            title={
              hasDifferentSelectedWhilePlaying && explicitSelectedVerse
                ? `Seçili ayetten (${explicitSelectedVerse.surah}:${explicitSelectedVerse.ayah}) dinlemeye geç`
                : isAudioActivelyPlaying
                  ? 'Dinlemeyi duraklat'
                  : explicitSelectedVerse
                    ? `Seçili ayetten (${explicitSelectedVerse.surah}:${explicitSelectedVerse.ayah}) dinle`
                    : viewMode === 'mushaf'
                      ? 'Bu sayfayı dinle'
                      : 'Bu sureyi dinle'
            }
            className="h-full pl-2.5 pr-2 xl:pl-3 xl:pr-2.5 text-xs font-bold text-white flex items-center gap-1.5 transition-opacity hover:opacity-95 active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            {hasDifferentSelectedWhilePlaying && explicitSelectedVerse ? (
              <>
                <Play className="w-3.5 h-3.5 shrink-0 fill-current" />
                <span className="hidden xl:inline tabular-nums">
                  {explicitSelectedVerse.ayah}. Ayete Geç
                </span>
              </>
            ) : isAudioActivelyPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline tabular-nums">
                  Duraklat{playingVerseKey ? ` · ${playingVerseKey}` : ''}
                </span>
              </>
            ) : explicitSelectedVerse ? (
              <>
                <Play className="w-3.5 h-3.5 shrink-0 fill-current" />
                <span className="hidden xl:inline tabular-nums">
                  {explicitSelectedVerse.ayah}. Ayetten Dinle
                </span>
              </>
            ) : (
              <>
                <Headphones className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline">
                  {viewMode === 'mushaf' ? 'Sayfayı Dinle' : 'Dinle'}
                </span>
              </>
            )}
          </button>
          <span className="w-px h-4 bg-white/25" aria-hidden="true" />
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsViewPopoverOpen(false);
              setIsListenPopoverOpen((v) => !v);
            }}
            aria-expanded={isListenPopoverOpen}
            aria-label="Hızlı dinleme ayarları ve kapsam seçenekleri"
            title="Dinleme türü, okuyucu, başlangıç ve tekrar ayarları"
            className="h-full px-1.5 text-white/95 hover:bg-black/15 flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isListenPopoverOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {isListenPopoverOpen && (
          <div
            className="absolute right-0 top-11 z-50 w-[328px] max-w-[calc(100vw-1.5rem)] max-h-[82dvh] overflow-y-auto rounded-2xl border shadow-2xl p-3.5 space-y-3.5 text-left"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {/* 1. Dinleme Türü */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Dinleme Türü
                </span>
                {isMealOnlyContent && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    Meal görünümü aktif
                  </span>
                )}
              </div>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {(
                  [
                    { id: 'ar', label: 'Arapça Tilavet' },
                    { id: 'meal', label: 'Sesli Meal' },
                    { id: 'ar_then_meal', label: 'AR + Meal' },
                  ] as { id: AudioPlayMode; label: string }[]
                ).map((opt) => {
                  const active = audioPrefs.mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateAudioPrefs({ mode: opt.id });
                      }}
                      className="h-8 px-1.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Okuyucu & Meal Kaynağı */}
            <div
              className="pt-3 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="block text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Okuyucu &amp; Meal Kaynağı
              </span>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsListenPopoverOpen(false);
                  openReciterSelector();
                }}
                className="w-full h-9 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors hover:border-teal-600/40"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
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

              {mealAudioSources.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-bold flex items-center gap-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Volume2 className="w-3.5 h-3.5 opacity-75" />
                    <span>Sesli Meal:</span>
                  </span>
                  <div
                    className="inline-flex items-center p-0.5 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {mealAudioSources.map((src) => {
                      const active = audioPrefs.mealAudioSource === src.id;
                      const short =
                        src.id === 'tdv' ? 'TDV' : src.id === 'dib' ? 'DİB' : src.shortLabel;
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateAudioPrefs({ mealAudioSource: src.id });
                          }}
                          className="h-7 px-2.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors"
                          style={{
                            backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                            color: active ? 'var(--brand-accent-text)' : 'var(--text-muted)',
                            boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                          }}
                        >
                          {short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Nereden Başlatılsın? */}
            <div
              className="pt-3 border-t space-y-1.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="block text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Nereden Başlatılsın?
              </span>

              {explicitSelectedVerse && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setIsListenPopoverOpen(false);
                    handlePlayFromVerse(explicitSelectedVerse, false);
                  }}
                  className="w-full min-h-[34px] px-2.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-colors text-left"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 shrink-0 fill-current" />
                  <span className="truncate tabular-nums">
                    Seçili Ayetten Başlat ({explicitSelectedVerse.surah}:
                    {explicitSelectedVerse.ayah})
                  </span>
                </button>
              )}

              {viewMode === 'mushaf' && pageBundle && (
                <button
                  type="button"
                  onClick={handleStartFromCurrentPageTop}
                  className="w-full min-h-[34px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors text-left hover:border-teal-600/40"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                  <span className="truncate tabular-nums">
                    Bu Sayfanın Başından Başlat (Sayfa {pageBundle.pageNo})
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleStartFromSurahBeginning()}
                className="w-full min-h-[34px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors text-left hover:border-teal-600/40"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Play className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                <span className="truncate">
                  Surenin Başından Başlat ({activeSurahMeta?.nameTr ?? 'Sure'} · 1. Ayet)
                </span>
              </button>
            </div>

            {/* 4. Hız & Tekrar Özeti */}
            <div
              className="pt-3 border-t space-y-2.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
                    Okuma Hızı
                  </span>
                  <span
                    className="text-[11px] font-extrabold tabular-nums"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    {audioPrefs.playbackRate}x
                  </span>
                </div>
                <div
                  className="grid grid-cols-4 gap-1 p-1 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {PLAYBACK_RATE_OPTIONS.map((rate) => {
                    const active = audioPrefs.playbackRate === rate;
                    return (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateAudioPrefs({ playbackRate: rate });
                        }}
                        className="h-7 px-1.5 rounded-md text-[11px] font-bold tabular-nums cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        {rate}x
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
                  Ayet Tekrarı
                </span>
                <div
                  className="inline-flex items-center p-0.5 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {([1, 2, 3, 'infinite'] as RepeatCountOption[]).map((rep) => {
                    const active = audioPrefs.repeatCount === rep;
                    return (
                      <button
                        key={String(rep)}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateAudioPrefs({ repeatCount: rep });
                        }}
                        className="h-7 px-2 rounded-md text-[11px] font-bold tabular-nums cursor-pointer transition-colors"
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

              <button
                type="button"
                onClick={handleToggleCurrentScopeLoop}
                className="w-full h-8 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors"
                style={{
                  backgroundColor:
                    audioPrefs.queueLoop === 'infinite'
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface-soft)',
                  borderColor:
                    audioPrefs.queueLoop === 'infinite'
                      ? 'var(--brand-accent)'
                      : 'var(--border-subtle)',
                  color:
                    audioPrefs.queueLoop === 'infinite'
                      ? 'var(--brand-accent-text)'
                      : 'var(--text-secondary)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {viewMode === 'mushaf' ? 'Bu Sayfayı Döngüye Al' : 'Bu Sureyi Döngüye Al'}
                  </span>
                </span>
                <span className="font-extrabold">
                  {audioPrefs.queueLoop === 'infinite' ? 'Açık (∞)' : 'Normal Akış'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsListenPopoverOpen(false);
                  openListeningDrawer({
                    initialTab: 'playlists',
                    scope: viewMode === 'mushaf' ? 'page' : 'surah',
                    surah: currentSurahNo,
                    page: currentPageNo,
                    startAyah: explicitSelectedVerse?.ayah ?? activeAyahNumber,
                    endAyah: explicitSelectedVerse?.ayah ?? activeAyahNumber,
                  });
                }}
                className="w-full pt-2 border-t flex items-center justify-between gap-2 text-xs font-extrabold cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <ListMusic className="w-3.5 h-3.5 shrink-0" />
                  <span>Çalma Listeleri &amp; Gelişmiş Kapsam</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Sunum Modu — Yalnızca İkon (w-9 h-9) */}
      <button
        type="button"
        onClick={openPresentationMode}
        title="Sunum Modu (TV / Projeksiyon)"
        aria-label="Sunum Modu"
        className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0 transition-colors hover:border-teal-600/50"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--brand-primary-text)',
        }}
      >
        <MonitorPlay className="w-4 h-4 shrink-0" />
      </button>
    </div>
  );

  const isAnyAudioBarActive = audioState.isVisible && audioState.status !== 'idle';
  const isFullAudioBarDocked = isAnyAudioBarActive && !isAudioBarMinimized;
  const isTajweedLegendVisible = Boolean(
    settings.tajweedEnabled &&
      settings.showTajweedLegend &&
      !isMealOnlyContent &&
      !isMobileReaderImmersive &&
      !viewError,
  );
  const needsBottomPlayerClearance =
    isFullAudioBarDocked && !(viewMode === 'mushaf' && isEffectiveDualLeaf);

  return (
    <div
      className={`space-y-2.5 lg:space-y-3 ${
        needsBottomPlayerClearance
          ? 'pb-[calc(var(--bottom-nav-h)+5.5rem)] lg:pb-24'
          : isFullAudioBarDocked
            ? 'pb-[calc(var(--bottom-nav-h)+5.5rem)] lg:pb-0'
            : isAnyAudioBarActive
              ? isMobileReaderImmersive
                ? 'pb-24 lg:pb-6'
                : 'pb-[calc(var(--bottom-nav-h)+4.5rem)] lg:pb-6'
              : isMobileReaderImmersive
                ? 'pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:pb-6'
                : 'pb-[calc(var(--bottom-nav-h)+1.75rem)] lg:pb-6'
      }`}
    >
      {/* ====================================================================
          A1. MASAÜSTÜ (>= 1024px) — BİRLEŞİK ÜST BAR PORTALI (AppShell <header>)
          ==================================================================== */}
      {topbarPortalSlot && createPortal(desktopUnifiedToolbar, topbarPortalSlot)}

      {/* ====================================================================
          A2. MOBİL (< 1024px) — TÜM 3 MOD İÇİN TEK İNCE h-12 (48px) OKUMA BAR
          ==================================================================== */}
      {isPureMobileView && isMobileReaderImmersive ? (
        /* Tam Ekran Odak Yüzen Üst Kontrol Şeridi (Metni örtmez; aşağı kaydırmada yumuşakça gizlenir) */
        <div
          role="region"
          aria-label="Tam ekran okuma kontrolleri"
          className={`lg:hidden fixed top-0 inset-x-0 z-40 px-2 pt-[max(0.375rem,env(safe-area-inset-top,0px))] pb-1.5 border-b backdrop-blur-md flex items-center justify-between gap-2 transition-all duration-200 ${
            isMobileBarHidden
              ? 'opacity-0 pointer-events-none -translate-y-2'
              : 'opacity-100 translate-y-0'
          }`}
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsMobileDrawerOpen(true);
              }}
              aria-label="Okuma menüsünü aç"
              title="Okuma menüsünü aç"
              className="h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-extrabold cursor-pointer shrink-0 active:scale-95 transition-transform"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <Menu className="w-3.5 h-3.5 shrink-0" />
              <span>Menü</span>
            </button>
            <span
              className="text-[11px] font-bold truncate tabular-nums min-w-0"
              style={{ color: 'var(--text-secondary)' }}
              title={mobileLocationLabel}
            >
              {mobileLocationLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsMobileReaderImmersive(false);
            }}
            aria-label="Tam ekrandan çık"
            title="Tam ekrandan çık ve navigasyonu göster"
            className="h-8 px-2.5 rounded-xl border flex items-center gap-1.5 text-[11px] font-extrabold cursor-pointer shrink-0 active:scale-95 transition-transform whitespace-nowrap"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              borderColor: 'var(--brand-primary)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <Minimize2 className="w-3.5 h-3.5 shrink-0" />
            <span>Tam Ekrandan Çık</span>
          </button>
        </div>
      ) : (
        /* Birleşik Mobil Okuma Şeridi — Mushaf, Kartlar ve Kitap'ta ortak; Kartlar & Kitap'ta aşağı kaydırmada gizlenir */
        <header
          aria-label="Mobil okuma şeridi"
          className={`lg:hidden sticky top-0 z-30 max-w-full overflow-x-clip ${
            viewMode === 'cards' ? '-mx-2.5 sm:-mx-4 px-2 sm:px-3.5' : '-mx-1.5 sm:-mx-3 px-2 sm:px-3'
          } border-b backdrop-blur-md flex flex-col transition-transform duration-200 will-change-transform ${
            isMobileBarHidden ? '-translate-y-full' : 'translate-y-0'
          }`}
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* 1. Satır (h-12): Konum Seçici + Tablet 3'lü segment + Dinle + Hızlı Ara + Ayraçlar + Okuma Menüsü */}
          <div className="h-12 flex items-center justify-between gap-1.5">
            {/* Sol: Ferah Konum Seçici (17. İsrâ · S.281 ▾) */}
            <button
              type="button"
              onClick={() => openLocationPicker()}
              title="Sure, Sayfa, Cüz, Rükû veya Ayet seç"
              className="flex-1 min-w-0 h-9 px-2.5 rounded-xl border flex items-center gap-1 text-xs font-extrabold cursor-pointer text-left"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="truncate tabular-nums">{mobileLocationLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65 ml-auto" />
            </button>

            {/* Sağ: Tablet 3'lü segment + Dinle + Hızlı Ara + Ayraçlar + Görünüm (Okuma Menüsü) */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Geniş mobil / Tablet (640px–1023px): 3'lü segment */}
              <div
                className="hidden sm:flex items-center h-9 p-0.5 rounded-xl border shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {(
                  [
                    { id: 'mushaf', label: 'Mushaf' },
                    { id: 'cards', label: 'Kartlar' },
                    { id: 'book', label: 'Kitap' },
                  ] as const
                ).map((tab) => {
                  const active = viewMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSwitchViewMode(tab.id)}
                      className="h-8 px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* 🎧 Dinle / Duraklat */}
              <button
                type="button"
                onClick={handleHeaderListen}
                aria-label={
                  hasDifferentSelectedWhilePlaying && explicitSelectedVerse
                    ? `${explicitSelectedVerse.ayah}. ayetten dinle`
                    : isAudioActivelyPlaying
                      ? 'Dinlemeyi duraklat'
                      : explicitSelectedVerse
                        ? `${explicitSelectedVerse.ayah}. ayetten dinle`
                        : 'Dinle'
                }
                title={
                  hasDifferentSelectedWhilePlaying && explicitSelectedVerse
                    ? `Seçili ayetten (${explicitSelectedVerse.surah}:${explicitSelectedVerse.ayah}) dinlemeye geç`
                    : isAudioActivelyPlaying
                      ? 'Dinlemeyi duraklat'
                      : explicitSelectedVerse
                        ? `${explicitSelectedVerse.ayah}. ayetten dinle`
                        : 'Bu sayfayı / sureyi dinle'
                }
                className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors shrink-0"
                style={{
                  backgroundColor:
                    isAudioActivelyPlaying || explicitSelectedVerse
                      ? 'var(--brand-primary)'
                      : 'var(--brand-primary-soft)',
                  color:
                    isAudioActivelyPlaying || explicitSelectedVerse
                      ? '#FFFFFF'
                      : 'var(--brand-primary-text)',
                }}
              >
                {hasDifferentSelectedWhilePlaying ? (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                ) : isAudioActivelyPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : explicitSelectedVerse ? (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                ) : (
                  <Headphones className="w-4 h-4" />
                )}
              </button>

              {/* 🔍 Hızlı Ara */}
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  openSearchModal();
                }}
                aria-label="Hızlı Ara"
                title="Hızlı Ara"
                className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Search className="w-4 h-4" />
              </button>

              {/* 🔖 Sayfa Ayraçları & Hatim */}
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  openBookmarksDrawer();
                }}
                aria-label="Sayfa Ayraçları"
                title={bookmarkCount > 0 ? `Sayfa Ayraçları (${bookmarkCount})` : 'Sayfa Ayraçları'}
                className="relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
                style={{
                  backgroundColor:
                    bookmarkCount > 0 ? 'var(--brand-accent-soft)' : 'var(--bg-surface)',
                  borderColor:
                    bookmarkCount > 0 ? 'rgba(217, 119, 6, 0.35)' : 'var(--border-subtle)',
                  color: bookmarkCount > 0 ? 'var(--brand-accent-text)' : 'var(--text-primary)',
                }}
              >
                <Bookmark className={`w-4 h-4 ${bookmarkCount > 0 ? 'fill-current' : ''}`} />
                {bookmarkCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full text-[9px] font-extrabold tabular-nums flex items-center justify-center text-white dark:text-[#0b1314] leading-none pointer-events-none"
                    style={{
                      backgroundColor: 'var(--brand-accent-text)',
                      boxShadow: '0 0 0 1.5px var(--bg-nav)',
                    }}
                  >
                    {bookmarkCount > 99 ? '99+' : bookmarkCount}
                  </span>
                )}
              </button>

              {/* ⚙️ Görünüm / Okuma Menüsü Çekmecesi */}
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsMobileDrawerOpen(true);
                }}
                aria-label="Görünüm ve Okuma Menüsü"
                title="Görünüm ve Okuma Menüsü"
                className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. Satır (< 640px Telefonlar): Tek Dokunuşla Mushaf | Kartlar | Kitap Seçici */}
          <div className="sm:hidden pb-1.5">
            <div
              className="grid grid-cols-3 gap-1 p-0.5 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
              role="tablist"
              aria-label="Okuma görünümü"
            >
              {(
                [
                  { id: 'mushaf', label: 'Mushaf', icon: BookOpen },
                  { id: 'cards', label: 'Kartlar', icon: LayoutList },
                  { id: 'book', label: 'Kitap', icon: BookText },
                ] as const
              ).map((tab) => {
                const active = viewMode === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSwitchViewMode(tab.id)}
                    className="min-h-[36px] px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap touch-manipulation"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>
      )}

      {/* ====================================================================
          B. Ana İçerik Alanı (Mushaf / Ayet Kartları / Kitap Modu)
          ==================================================================== */}
      {settings.tajweedEnabled &&
        settings.showTajweedLegend &&
        !isMealOnlyContent &&
        !isMobileReaderImmersive &&
        !viewError && (
          <TajweedLegendBar
            rules={tajweedMetaRules}
            theme={settings.theme}
            isLoading={isLoadingTajweedMeta}
            onDismiss={() => updateSettings({ showTajweedLegend: false })}
          />
        )}

      {/* Aktif Rükû Kapsam Rozeti (Seçili rükû dilimini net gösterir, tek tıkla dinleme/sunum/kaldırma sunar) */}
      {activeSelectionScope.kind === 'ruku' && !isMobileReaderImmersive && !viewError && (
        <div
          role="region"
          aria-label="Seçili rükû kapsamı"
          className="max-w-5xl mx-auto px-3 py-2 rounded-2xl border flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            borderColor: 'var(--brand-primary)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: '#FFFFFF',
              }}
            >
              <span className="arabic-title leading-none">ع</span>
            </span>
            <div className="min-w-0">
              <p
                className="text-xs sm:text-sm font-extrabold truncate tabular-nums"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {surahMap.get(activeSelectionScope.surah)?.shortNameTr ??
                  `${activeSelectionScope.surah}. Sure`}{' '}
                · {activeSelectionScope.surahRuku}. Rükû ({activeSelectionScope.startAyah}–
                {activeSelectionScope.endAyah}. Ayetler)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                if (activeRukuVerses.length > 0) {
                  handlePlayFromVerse(activeRukuVerses[0], false);
                }
              }}
              disabled={activeRukuVerses.length === 0}
              className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openPresentationMode();
              }}
              disabled={activeRukuVerses.length === 0}
              className="min-h-[32px] px-2.5 rounded-lg border text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <MonitorPlay className="w-3.5 h-3.5" />
              <span>Sunum</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setActiveSelectionScope({ kind: 'default' });
              }}
              aria-label="Rükû kapsamını kaldır"
              title="Rükû kapsamını kaldır"
              className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {viewError ? (
        <div className="surface-card rounded-2xl p-6 sm:p-8 text-center max-w-lg mx-auto">
          <div
            className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' }}
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold mb-1.5">Okuma Verisi Yüklenemedi</h3>
          <p className="text-xs sm:text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            {viewError}
          </p>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="min-h-[44px] px-5 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2 cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Tekrar Dene</span>
          </button>
        </div>
      ) : !meta ||
        (viewMode === 'mushaf' && !pageBundle) ||
        (viewMode !== 'mushaf' && !surahBundle) ? (
        <div className="max-w-3xl mx-auto animate-pulse">
          <div
            className="h-[520px] rounded-3xl border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          />
        </div>
      ) : viewMode === 'mushaf' && pageBundle ? (
        <MushafPageView
          pageBundle={pageBundle}
          secondPageBundle={isEffectiveDualLeaf ? secondPageBundle : null}
          mushafLayout={activeMushafLayout}
          besmele={meta.besmele}
          settings={settings}
          wordMode={studyPrefs.wordMode}
          selectedVerseId={selectedAyahId}
          playingAyahId={
            audioState.status === 'playing' || audioState.status === 'loading'
              ? audioState.currentAyahId
              : null
          }
          autoScroll={audioPrefs.autoScroll}
          isAudioBarVisible={isFullAudioBarDocked}
          isAudioBarExpanded={
            isFullAudioBarDocked && (isAudioBarExpanded || audioState.missingMealAudio)
          }
          isTajweedLegendVisible={isTajweedLegendVisible}
          bookmarkedSet={bookmarkedSet}
          isRefreshing={isLoadingView}
          onSelectVerse={(verse) => {
            selectedAyahIdRef.current = verse.id;
            setSelectedAyahId(verse.id);
            setCurrentSurahNo(verse.surah);
            setLastRead({
              surah: verse.surah,
              ayah: verse.ayah,
              page: verse.page,
              viewMode: 'mushaf',
            });
          }}
          onChangePage={handleChangePage}
          onPlayFromVerse={handlePlayFromVerse}
          onPlayMealFromVerse={handlePlayMealFromVerse}
          onToggleBookmark={toggleBookmarkAyah}
          onShareVerse={handleShareVerse}
          onOpenSurahInfo={(surah) => setInfoModalSurah(surah)}
          onOpenLocationPicker={(tab) => openLocationPicker(tab)}
          onToggleMobileImmersive={() => setIsMobileReaderImmersive(!isMobileReaderImmersive)}
        />
      ) : viewMode === 'cards' && surahBundle ? (
        <VerseCardsView
          surahBundle={surahBundle}
          besmele={meta.besmele}
          settings={settings}
          wordMode={studyPrefs.wordMode}
          contentMode={studyPrefs.bookContentMode}
          mealAudioFocusOnly={audioPrefs.mode === 'meal' && studyPrefs.mealAudioFocusOnly}
          bookmarkedSet={bookmarkedSet}
          playingAyahId={
            audioState.status === 'playing' || audioState.status === 'loading'
              ? audioState.currentAyahId
              : null
          }
          jumpToAyahNo={jumpToAyahNo}
          jumpNonce={jumpNonce}
          navResetNonce={navResetNonce}
          onToggleBookmark={toggleBookmarkAyah}
          onChangeWordMode={(mode) => updateStudyPrefs({ wordMode: mode })}
          onPlayFromVerse={(v) => handlePlayFromVerse(v, false)}
          onPlayMealFromVerse={handlePlayMealFromVerse}
          onShareVerse={handleShareVerse}
          onOpenPageInMushaf={handleOpenPageInMushaf}
          onOpenSurahInfo={(surah) => setInfoModalSurah(surah)}
        />
      ) : viewMode === 'book' && surahBundle ? (
        <BookModeView
          bundle={surahBundle}
          besmeleAr={meta.besmele.ar}
          playingAyahId={
            audioState.status === 'playing' || audioState.status === 'loading'
              ? audioState.currentAyahId
              : null
          }
          isAudioPlaying={audioState.status === 'playing'}
          onPlayFromAyah={(ayahIdx, modeOverride) => {
            const target = surahBundle.verses[ayahIdx];
            if (target) handlePlayFromVerse(target, false, modeOverride);
          }}
          onShareVerse={handleShareVerse}
          onOpenSurahInfo={(surah) => setInfoModalSurah(surah)}
          onSelectPrevSurah={() => {
            if (currentSurahNo > 1) handleSelectSurah(currentSurahNo - 1);
          }}
          onSelectNextSurah={() => {
            if (currentSurahNo < 114) handleSelectSurah(currentSurahNo + 1);
          }}
          onOpenLocationPicker={() => openLocationPicker()}
          onToggleMobileImmersive={() => setIsMobileReaderImmersive(!isMobileReaderImmersive)}
        />
      ) : null}

      {/* Favori Ayetlerim Çekmecesi */}
      {isFavoritesDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Favori ayetlerim"
          className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFavoritesDrawerOpen(false);
          }}
        >
          <div
            className="w-full sm:max-w-md max-h-[82dvh] rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div
              className="px-5 py-4 border-b flex items-center justify-between gap-2 shrink-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 fill-current" style={{ color: 'var(--brand-accent)' }} />
                <h2 className="text-base font-extrabold">
                  Favori Ayetlerim ({bookmarkedItems.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFavoritesDrawerOpen(false)}
                aria-label="Favori ayetler penceresini kapat"
                title="Kapat"
                className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {bookmarkedItems.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  Henüz yıldızladığınız bir ayet bulunmuyor. Ayetlerin yanındaki yıldız simgesine
                  dokunarak favori listenizi oluşturabilirsiniz.
                </p>
              ) : (
                bookmarkedItems.map((item) => (
                  <div
                    key={item.ayahId}
                    className="p-3 rounded-xl border flex items-center justify-between gap-2"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        selectedAyahIdRef.current = item.ayahId;
                        pendingPageEdgeSelectionRef.current = null;
                        setActiveSelectionScope({ kind: 'default' });
                        setCurrentSurahNo(item.surahNo);
                        setCurrentPageNo(item.pageNo);
                        setSelectedAyahId(item.ayahId);
                        setSelectedVerseKey(`${item.surahNo}:${item.ayahNo}`);
                        setJumpToAyahNo(item.ayahNo);
                        setJumpNonce((n) => n + 1);
                        setIsFavoritesDrawerOpen(false);
                      }}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <p className="text-sm font-extrabold truncate">
                        {item.surahName} · {item.ayahNo}. Ayet
                      </p>
                      <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        Sayfa {item.pageNo} · Git →
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBookmarkAyah(item.ayahId)}
                      aria-label="Favorilerden çıkar"
                      title="Favorilerden çıkar"
                      className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Birleşik Hızlı Konum Seçici (Sure / Sayfa / Cüz / Rükû / Ayet) */}
      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        initialTab={locationPickerTab}
        meta={meta}
        currentSurahNo={currentSurahNo}
        currentPageNo={currentPageNo}
        currentJuzNo={activeJuzNo}
        currentAyahNo={activeAyahNumber}
        minPage={pageBounds.minPage}
        maxPage={pageBounds.maxPage}
        onSelectSurah={handleSelectSurah}
        onSelectPage={handleChangePage}
        onSelectJuz={handleSelectJuz}
        onSelectRuku={handleSelectRuku}
        onSelectAyah={handleJumpAyah}
        onTabChange={(tab) => {
          lastLocationPickerTabRef.current = tab;
        }}
        onClose={() => setIsLocationPickerOpen(false)}
      />

      {/* Mobil Okuma Menüsü Çekmecesi (☰ Bottom Sheet) */}
      <MobileReaderDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        viewMode={viewMode}
        onSwitchViewMode={handleSwitchViewMode}
        onOpenPresentation={openPresentationMode}
        primaryMeal={primaryMealDef}
        secondaryMeal={secondaryMealDef}
        isDualMeal={isDualMeal}
        onOpenMealSelector={() => openMealSelector('primary')}
        onSetMealDisplayMode={setMealDisplayMode}
        readerContentMode={readerContentMode}
        onChangeReaderContentMode={handleSelectReaderContentMode}
        wordMode={studyPrefs.wordMode}
        onChangeWordMode={(mode) => updateStudyPrefs({ wordMode: mode })}
        settings={settings}
        onUpdateSettings={updateSettings}
        isImmersive={isMobileReaderImmersive}
        onToggleImmersive={() => setIsMobileReaderImmersive(!isMobileReaderImmersive)}
        onOpenSearch={openSearchModal}
        activeSurahQuestionCount={activeSurahQuestionCount}
        onStartSurahExam={() => {
          if (activeSurahMeta) navigateToExam({ surahNo: activeSurahMeta.no });
        }}
        bookmarkCount={bookmarkCount}
        onOpenBookmarks={openBookmarksDrawer}
        favoritesCount={bookmarkedItems.length}
        onOpenFavorites={() => setIsFavoritesDrawerOpen(true)}
        onOpenListeningDrawer={() =>
          openListeningDrawer({
            initialTab: 'quick',
            scope: viewMode === 'mushaf' ? 'page' : 'surah',
            surah: currentSurahNo,
            page: currentPageNo,
            startAyah: activeAyahNumber,
            endAyah: activeAyahNumber,
          })
        }
        onOpenWaqfGuide={openWaqfGuide}
        onOpenSettings={openSettingsModal}
        onNavigateTab={(tab) => {
          setIsMobileReaderImmersive(false);
          setIsMobileDrawerOpen(false);
          setActiveTab(tab);
        }}
      />

      <SurahInfoModal surah={infoModalSurah} onClose={() => setInfoModalSurah(null)} />

      <VerseShareModal
        verse={shareTarget?.verse ?? null}
        surahMeta={shareTarget?.surahMeta ?? null}
        onClose={() => setShareTarget(null)}
      />

      <PresentationModeOverlay
        isOpen={isPresentationOpen}
        onClose={closePresentationMode}
        verses={presentationVerses}
        activeVerse={presentationActiveVerse}
        surahMap={surahMap}
        besmele={meta?.besmele}
        scopeMode={hasActiveRukuScope ? 'ruku' : viewMode === 'mushaf' ? 'page' : 'surah'}
        scopeLabel={activeRukuLabel}
        canGoNextPage={canPresentationNextPage}
        canGoPrevPage={canPresentationPrevPage}
        onRequestNextPage={handlePresentationNextPage}
        onRequestPrevPage={handlePresentationPrevPage}
        onOpenLocationPicker={() => openLocationPicker()}
        isLocationPickerOpen={isLocationPickerOpen}
        onStartAudioFromActive={(v) => handlePlayFromVerse(v, false)}
        onStartMealAudioFromActive={handlePlayMealFromVerse}
      />
    </div>
  );
};
