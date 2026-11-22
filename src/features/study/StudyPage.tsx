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
  BookOpen,
  BookText,
  ChevronDown,
  Columns2,
  Headphones,
  Languages,
  LayoutList,
  Menu,
  Minus,
  MonitorPlay,
  Palette,
  Pause,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
  Type,
  X,
} from 'lucide-react';
import { PresentationModeOverlay } from '../../components/PresentationModeOverlay';
import { VerseShareModal } from '../../components/VerseShareModal';
import { ARABIC_FONTS } from '../../config/assetsConfig';
import { findMealById } from '../../config/mealsConfig';
import { audioQueueService } from '../../services/audioQueueService';
import {
  dataService,
  findFirstLocationForJuz,
  findPageForSurahAyah,
  getPageBounds,
} from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  AudioPlayMode,
  BookContentMode,
  CombinedVerse,
  PageBundle,
  PageLayoutMode,
  StudyViewMode,
  SurahBundle,
  SurahMeta,
  ThemeMode,
  WordMealMode,
} from '../../types/quran';
import { formatSurahTitle } from '../../utils/arabicUtils';
import { buildSurahQuestionCountMap, getSurahMap } from '../../utils/poolUtils';
import { useTajweedData } from '../../hooks/useTajweedData';
import { BookModeView } from './BookModeView';
import { LocationPickerModal, type LocationPickerTab } from './LocationPickerModal';
import { MobileReaderDrawer } from './MobileReaderDrawer';
import { MushafPageView } from './MushafPageView';
import { SurahInfoModal } from './SurahInfoModal';
import { TajweedLegendBar } from './TajweedLegendBar';
import { VerseCardsView } from './VerseCardsView';

const EMPTY_TAJWEED_SURAH_NOS: readonly number[] = [];

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
    openBookmarksDrawer,
    openSearchModal,
    openSettingsModal,
    openListeningDrawer,
    openWaqfGuide,
    isMobileReaderImmersive,
    setIsMobileReaderImmersive,
    isAudioBarExpanded,
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

  // Yeni Sade Arayüz Popover & Çekmece Durumları
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [locationPickerTab, setLocationPickerTab] = useState<LocationPickerTab>('surah');
  const [isViewPopoverOpen, setIsViewPopoverOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isMobileModeMenuOpen, setIsMobileModeMenuOpen] = useState(false);
  const [isMobileBarHidden, setIsMobileBarHidden] = useState(false);
  const [topbarPortalSlot, setTopbarPortalSlot] = useState<HTMLElement | null>(null);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState(false);
  const [infoModalSurah, setInfoModalSurah] = useState<SurahMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    verse: CombinedVerse;
    surahMeta: SurahMeta;
  } | null>(null);

  const viewPopoverRef = useRef<HTMLDivElement | null>(null);
  const mobileModeMenuRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef<number>(0);

  const viewMode = studyPrefs.viewMode;
  const isDoubleMushafPref = studyPrefs.pageLayout === 'double_mushaf';
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

  // Mobil mod seçici dropdown dışına tıklanınca kapat
  useEffect(() => {
    if (!isMobileModeMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (mobileModeMenuRef.current && !mobileModeMenuRef.current.contains(e.target as Node)) {
        setIsMobileModeMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileModeMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isMobileModeMenuOpen]);

  // Mobilde Kartlar & Kitap modlarında aşağı kaydırırken üst şeridi akıllıca gizle, yukarıda göster
  useEffect(() => {
    setIsMobileBarHidden(false);
    lastScrollYRef.current = typeof window !== 'undefined' ? window.scrollY : 0;

    if (viewMode !== 'cards' && viewMode !== 'book') return;

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
        setIsMobileModeMenuOpen(false);
      } else if (delta < -6) {
        setIsMobileBarHidden(false);
      }
      lastScrollYRef.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [viewMode, currentSurahNo]);

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

    setCurrentSurahNo(targetSurah);
    setCurrentPageNo(targetPage);
    setSelectedAyahId(targetSurah * 1000 + targetAyah);
    setJumpToAyahNo(targetAyah);
    setJumpNonce((n) => n + 1);
    setNavResetNonce((n) => n + 1);
    clearStudyNavTarget();
  }, [studyNavTarget, meta, currentSurahNo, clearStudyNavTarget]);

  // Sayfa (Tek veya Çift) ya da Sure verisini yükle + sonraki sayfayı arka planda önbelleğe al
  useEffect(() => {
    if (!meta) return;
    let cancelled = false;

    async function loadContent() {
      setIsLoadingView(true);
      setViewError(null);
      try {
        if (viewMode === 'mushaf') {
          const shouldLoadSecond = isDoubleMushafPref && currentPageNo < pageBounds.maxPage;
          const [bundle, nextBundle] = await Promise.all([
            dataService.getPageBundle(currentPageNo),
            shouldLoadSecond ? dataService.getPageBundle(currentPageNo + 1) : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setPageBundle(bundle);
          setSecondPageBundle(nextBundle);

          const preloadPage = shouldLoadSecond ? currentPageNo + 2 : currentPageNo + 1;
          if (preloadPage <= pageBounds.maxPage) {
            dataService.getPageBundle(preloadPage).catch(() => {});
          }

          const combinedVerses = nextBundle
            ? [...bundle.verses, ...nextBundle.verses]
            : bundle.verses;

          if (combinedVerses.length > 0) {
            const matched = combinedVerses.find((v) => v.id === selectedAyahId);
            const activeVerse = matched ?? combinedVerses[0];
            setSelectedAyahId(activeVerse.id);
            setCurrentSurahNo(activeVerse.surah);
            setLastRead({
              surah: activeVerse.surah,
              ayah: activeVerse.ayah,
              page: bundle.pageNo,
              viewMode: 'mushaf',
            });
          }
        } else {
          setSecondPageBundle(null);
          const bundle = await dataService.getSurahBundle(currentSurahNo);
          if (cancelled) return;
          setSurahBundle(bundle);

          if (bundle.verses.length > 0) {
            const matched = bundle.verses.find((v) => v.id === selectedAyahId);
            const activeVerse = matched ?? bundle.verses[0];
            setSelectedAyahId(activeVerse.id);
            setCurrentPageNo(activeVerse.page);
            setLastRead({
              surah: bundle.surahMeta.no,
              ayah: activeVerse.ayah,
              page: activeVerse.page,
              viewMode,
            });
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
  }, [meta, viewMode, currentPageNo, currentSurahNo, isDoubleMushafPref, reloadNonce]);

  // Mushaf modunda sayfanın son ayeti bitince otomatik sonraki sayfaya geçiş sağlayıcısı
  useEffect(() => {
    if (viewMode !== 'mushaf' || !meta) {
      audioQueueService.registerNextPageProvider(null);
      return;
    }

    audioQueueService.registerNextPageProvider(async (nextPageNo: number) => {
      if (nextPageNo > pageBounds.maxPage) return null;
      const shouldLoadSecond = isDoubleMushafPref && nextPageNo < pageBounds.maxPage;
      const [nextBundle, secondBundle] = await Promise.all([
        dataService.getPageBundle(nextPageNo),
        shouldLoadSecond ? dataService.getPageBundle(nextPageNo + 1) : Promise.resolve(null),
      ]);
      if (nextBundle.verses.length === 0) return null;

      setCurrentPageNo(nextBundle.pageNo);
      setPageBundle(nextBundle);
      setSecondPageBundle(secondBundle);
      setSelectedAyahId(nextBundle.verses[0].id);
      setCurrentSurahNo(nextBundle.verses[0].surah);

      const preloadTarget = shouldLoadSecond ? nextPageNo + 2 : nextPageNo + 1;
      if (preloadTarget <= pageBounds.maxPage) {
        dataService.getPageBundle(preloadTarget).catch(() => {});
      }

      const combinedVerses = secondBundle
        ? [...nextBundle.verses, ...secondBundle.verses]
        : nextBundle.verses;

      return {
        verses: combinedVerses,
        contextKey: `page:${nextBundle.pageNo}`,
      };
    });

    return () => {
      audioQueueService.registerNextPageProvider(null);
    };
  }, [viewMode, meta, pageBounds.maxPage, isDoubleMushafPref]);

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
            (studyPrefs.pageLayout === 'double_meal' ||
              studyPrefs.pageLayout === 'double_mushaf') &&
            typeof window !== 'undefined' &&
            window.innerWidth >= 1024;
          if (!isDesktopDualSpread) {
            const targetId = onThisPage.id;
            const layout = studyPrefs.pageLayout;
            if (autoScrollRafRef.current !== null) {
              window.cancelAnimationFrame(autoScrollRafRef.current);
            }
            autoScrollRafRef.current = window.requestAnimationFrame(() => {
              autoScrollRafRef.current = null;
              if (layout === 'meal_only') {
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
        audioState.currentPage !== currentPageNo &&
        audioState.currentPage !== secondPageBundle?.pageNo
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
    studyPrefs.pageLayout,
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

  const activeJuzNo = useMemo(() => {
    if (viewMode === 'mushaf' && pageBundle && pageBundle.cuzs.length > 0) {
      return pageBundle.cuzs[0];
    }
    if (activeSurahMeta && activeSurahMeta.cuzs.length > 0) {
      return activeSurahMeta.cuzs[0];
    }
    return 1;
  }, [viewMode, pageBundle, activeSurahMeta]);

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

  const activeAyahNumber = activeSelectedVerse?.ayah ?? 1;

  const openLocationPicker = useCallback((tab: LocationPickerTab = 'surah') => {
    sfxService.play('click');
    setLocationPickerTab(tab);
    setIsLocationPickerOpen(true);
  }, []);

  const handleSelectSurah = useCallback(
    (surahNo: number) => {
      if (!meta) return;
      const firstPage = findPageForSurahAyah(meta, surahNo, 1);
      setCurrentSurahNo(surahNo);
      setCurrentPageNo(firstPage);
      setSelectedAyahId(surahNo * 1000 + 1);
      setJumpToAyahNo(1);
      setJumpNonce((n) => n + 1);
    },
    [meta],
  );

  const handleSelectJuz = useCallback(
    (juzNo: number) => {
      if (!meta) return;
      sfxService.play('click');
      const loc = findFirstLocationForJuz(meta, juzNo);
      setCurrentSurahNo(loc.surah);
      setCurrentPageNo(loc.page);
      setSelectedAyahId(loc.surah * 1000 + loc.ayah);
      setJumpToAyahNo(loc.ayah);
      setJumpNonce((n) => n + 1);
    },
    [meta],
  );

  const handleSelectRuku = useCallback(
    (surahNo: number, startAyah: number) => {
      if (!meta) return;
      sfxService.play('click');
      const targetPage = findPageForSurahAyah(meta, surahNo, startAyah);
      setCurrentSurahNo(surahNo);
      setCurrentPageNo(targetPage);
      setSelectedAyahId(surahNo * 1000 + startAyah);
      setJumpToAyahNo(startAyah);
      setJumpNonce((n) => n + 1);
    },
    [meta],
  );

  const handleChangePage = useCallback(
    (nextPage: number) => {
      const clamped = Math.max(pageBounds.minPage, Math.min(pageBounds.maxPage, nextPage));
      setCurrentPageNo(clamped);
      if (viewMode !== 'mushaf') {
        updateStudyPrefs({ viewMode: 'mushaf' });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [pageBounds.minPage, pageBounds.maxPage, viewMode, updateStudyPrefs],
  );

  const handleJumpAyah = useCallback(
    (ayahNo: number) => {
      if (!meta) return;
      sfxService.play('click');
      const targetPage = findPageForSurahAyah(meta, currentSurahNo, ayahNo);
      const ayahId = currentSurahNo * 1000 + ayahNo;
      setSelectedAyahId(ayahId);
      setCurrentPageNo(targetPage);
      setJumpToAyahNo(ayahNo);
      setJumpNonce((n) => n + 1);
    },
    [meta, currentSurahNo],
  );

  const handleSwitchViewMode = useCallback(
    (mode: StudyViewMode) => {
      if (mode === viewMode) return;
      sfxService.play('click');
      updateStudyPrefs({ viewMode: mode });
    },
    [viewMode, updateStudyPrefs],
  );

  const handleChangePageLayout = useCallback(
    (layout: PageLayoutMode) => {
      sfxService.play('click');
      updateStudyPrefs({
        pageLayout: layout,
        mushafSidePanelOpen: false,
      });
    },
    [updateStudyPrefs],
  );

  const mobileDrawerContentMode: BookContentMode =
    viewMode === 'mushaf'
      ? studyPrefs.pageLayout === 'double_meal'
        ? 'interleaved'
        : studyPrefs.pageLayout === 'meal_only'
          ? 'meal_only'
          : 'ar_only'
      : studyPrefs.bookContentMode;

  const handleMobileDrawerContentMode = useCallback(
    (mode: BookContentMode) => {
      if (viewMode === 'mushaf') {
        const nextLayout: PageLayoutMode =
          mode === 'interleaved'
            ? 'double_meal'
            : mode === 'meal_only'
              ? 'meal_only'
              : 'single';
        updateStudyPrefs({
          pageLayout: nextLayout,
          mushafSidePanelOpen: false,
        });
      } else {
        updateStudyPrefs({ bookContentMode: mode });
      }
    },
    [viewMode, updateStudyPrefs],
  );

  // Üstteki "Dinle" butonu
  const currentContextKey =
    viewMode === 'mushaf' ? `page:${currentPageNo}` : `surah:${currentSurahNo}`;

  const isAudioOnCurrentView =
    audioState.isVisible &&
    audioState.contextKey === currentContextKey &&
    (audioState.status === 'playing' || audioState.status === 'loading');

  const handleHeaderListen = () => {
    if (!manifest || !meta) return;

    if (isAudioOnCurrentView) {
      audioQueueService.togglePlayPause();
      return;
    }

    if (
      audioState.isVisible &&
      audioState.contextKey === currentContextKey &&
      audioState.status === 'paused'
    ) {
      audioQueueService.togglePlayPause();
      return;
    }

    if (activeViewVerses.length > 0) {
      const startIdx = Math.max(
        0,
        activeViewVerses.findIndex((v) => v.id === selectedAyahId),
      );
      audioQueueService.startQueue({
        verses: activeViewVerses,
        startIndex: startIdx,
        context: viewMode === 'mushaf' ? 'page' : 'surah',
        contextKey: currentContextKey,
        manifest,
        meta,
        prefs: audioPrefs,
      });
    }
  };

  const handlePlayFromVerse = useCallback(
    (verse: CombinedVerse, singleAyahOnly = false, modeOverride?: AudioPlayMode) => {
      if (!manifest || !meta || activeViewVerses.length === 0) return;

      const idx = activeViewVerses.findIndex((v) => v.id === verse.id);
      audioQueueService.startQueue({
        verses: activeViewVerses,
        startIndex: Math.max(0, idx),
        context: viewMode === 'mushaf' ? 'page' : 'surah',
        contextKey: currentContextKey,
        manifest,
        meta,
        prefs: audioPrefs,
        singleAyahOnly,
        modeOverride,
      });
    },
    [manifest, meta, activeViewVerses, viewMode, currentContextKey, audioPrefs],
  );

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

  const activeModeShortLabel =
    viewMode === 'mushaf' ? 'Mushaf' : viewMode === 'cards' ? 'Kart' : 'Kitap';

  const activeLayoutSummary =
    viewMode === 'mushaf'
      ? studyPrefs.pageLayout === 'double_mushaf'
        ? '2 Sayfa'
        : studyPrefs.pageLayout === 'double_meal'
          ? 'Mushaf + Meal'
          : studyPrefs.pageLayout === 'meal_only'
            ? 'Sadece Meal'
            : 'Tek Sayfa'
      : (() => {
          const contentLabel =
            studyPrefs.bookContentMode === 'ar_only'
              ? 'Sadece AR'
              : studyPrefs.bookContentMode === 'meal_only'
                ? 'Sadece Meal'
                : 'AR + Meal';
          if (viewMode === 'book') {
            return `${contentLabel} · ${studyPrefs.pageLayout === 'single' ? 'Tek' : 'Çift'}`;
          }
          return contentLabel;
        })();

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
        onClick={() => openLocationPicker('surah')}
        title={`${desktopLocationLabel} — Sure, Sayfa, Cüz veya Ayet seç`}
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

      {/* 4. Görünüm & Okuma Tercihleri Popover (Düzen, Kelime Meali, Yazı Boyutu, Yazı Tipi, Tema) */}
      <div ref={viewPopoverRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            setIsViewPopoverOpen((v) => !v);
          }}
          aria-expanded={isViewPopoverOpen}
          aria-label="Görünüm, içerik ve kelime meali ayarları"
          title={`Görünüm & Tercihler (${activeLayoutSummary})`}
          className="h-9 w-9 2xl:w-auto 2xl:px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          style={{
            backgroundColor: isViewPopoverOpen ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
            borderColor: isViewPopoverOpen ? 'var(--brand-primary)' : 'var(--border-subtle)',
            color: isViewPopoverOpen ? 'var(--brand-primary-text)' : 'var(--text-primary)',
          }}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="hidden 2xl:inline">Görünüm</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65 hidden 2xl:inline" />
        </button>

        {isViewPopoverOpen && (
          <div
            className="absolute right-0 top-11 z-50 w-[320px] max-w-[calc(100vw-1.5rem)] max-h-[82dvh] overflow-y-auto rounded-2xl border shadow-2xl p-3.5 space-y-3.5 text-left"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            {/* 1. Moda Duyarlı Sayfa / İçerik / Sütun Düzeni */}
            <div className="space-y-2">
              <span
                className="block text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {viewMode === 'mushaf'
                  ? 'Sayfa & İçerik Düzeni'
                  : viewMode === 'book'
                    ? 'İçerik & Sütun Düzeni'
                    : 'İçerik Görünümü'}
              </span>

              {viewMode === 'mushaf' ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'single', label: 'Tek Sayfa' },
                      { id: 'double_mushaf', label: '2 Sayfa' },
                      { id: 'double_meal', label: 'Mushaf + Meal' },
                      { id: 'meal_only', label: 'Sadece Meal' },
                    ] as const
                  ).map((opt) => {
                    const active = studyPrefs.pageLayout === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleChangePageLayout(opt.id)}
                        className="h-9 px-2.5 rounded-xl border text-xs font-bold cursor-pointer whitespace-nowrap transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {(
                      [
                        { id: 'interleaved', label: 'AR + Meal' },
                        { id: 'ar_only', label: 'Sadece AR' },
                        { id: 'meal_only', label: 'Sadece Meal' },
                      ] as { id: BookContentMode; label: string }[]
                    ).map((opt) => {
                      const active = studyPrefs.bookContentMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateStudyPrefs({ bookContentMode: opt.id });
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

                  {viewMode === 'book' && (
                    <div
                      className="grid grid-cols-2 gap-1 p-1 rounded-xl"
                      style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                    >
                      {(
                        [
                          { id: 'single', label: 'Tek Sütun' },
                          { id: 'double_mushaf', label: 'Çift Sütun' },
                        ] as const
                      ).map((colOpt) => {
                        const active =
                          colOpt.id === 'single'
                            ? studyPrefs.pageLayout === 'single'
                            : studyPrefs.pageLayout !== 'single';
                        return (
                          <button
                            key={colOpt.id}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              updateStudyPrefs({ pageLayout: colOpt.id });
                            }}
                            className="h-8 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                            style={{
                              backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                              color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                            }}
                          >
                            {colOpt.id === 'double_mushaf' && (
                              <Columns2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{colOpt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Kelime Meali (Kapalı | Açık | Kendini Dene) */}
            {settings.wordByWordEnabled && (
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

            {/* 2b. Renkli Tecvit (Etkileşimli Dokun-Öğren) */}
            <div
              className="pt-3 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
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
                    Renkli harflere dokunarak kuralları öğren
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

              {/* Rükû (ع) İşaretleri + Durak Rehberi */}
              <div
                className="pt-2 border-t space-y-2"
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
              </div>
            </div>

            {/* 3. Hızlı Yazı Boyutu (Arapça & Meal) */}
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
                    aria-label="Arapça yazı boyutunu büyült"
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
                    aria-label="Meal yazı boyutunu büyült"
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
            </div>

            {/* 4. Hızlı Arapça Yazı Tipi Seçimi */}
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
                <span>Arapça Yazı Tipi</span>
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

      {/* 5. 🎧 Dinle | ▾ (Bölünmüş Dinleme & Çalma Listesi Butonu) */}
      <div
        className="inline-flex items-center h-9 rounded-xl overflow-hidden shrink-0"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      >
        <button
          type="button"
          onClick={handleHeaderListen}
          title={isAudioOnCurrentView ? 'Dinlemeyi duraklat' : 'Bu sayfayı / sureyi dinle'}
          className="h-full pl-2.5 pr-2 xl:pl-3 xl:pr-2.5 text-xs font-bold text-white flex items-center gap-1.5 transition-opacity hover:opacity-95 active:scale-[0.98] cursor-pointer whitespace-nowrap"
        >
          {isAudioOnCurrentView ? (
            <>
              <Pause className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">Duraklat</span>
            </>
          ) : (
            <>
              <Headphones className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">Dinle</span>
            </>
          )}
        </button>
        <span className="w-px h-4 bg-white/25" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            openListeningDrawer({
              initialTab: 'quick',
              scope: viewMode === 'mushaf' ? 'page' : 'surah',
              surah: currentSurahNo,
              page: currentPageNo,
              startAyah: activeAyahNumber,
              endAyah: activeAyahNumber,
            });
          }}
          aria-label="Dinleme kapsamı, döngü ve çalma listeleri"
          title="Dinleme kapsamı, döngü ve çalma listeleri"
          className="h-full px-1.5 text-white/95 hover:bg-black/15 flex items-center justify-center cursor-pointer transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
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

      {/* 7. Sure Testi — Kompakt İkon + Mini Sayaç (Soru varsa) */}
      {activeSurahMeta && activeSurahQuestionCount > 0 && (
        <button
          type="button"
          onClick={() => navigateToExam({ surahNo: activeSurahMeta.no })}
          title={`${formatSurahTitle(activeSurahMeta.nameTr, activeSurahMeta.no)}nden Test Çöz (${activeSurahQuestionCount} Soru)`}
          aria-label={`${activeSurahMeta.nameTr} Suresi Testi (${activeSurahQuestionCount} Soru)`}
          className="relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0 transition-colors hover:opacity-90"
          style={{
            backgroundColor: 'var(--brand-accent-soft)',
            borderColor: 'rgba(217, 119, 6, 0.35)',
            color: 'var(--brand-accent-text)',
          }}
        >
          <Trophy className="w-4 h-4 shrink-0" />
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-extrabold tabular-nums flex items-center justify-center text-white leading-none pointer-events-none"
            style={{
              backgroundColor: 'var(--brand-accent)',
              boxShadow: '0 0 0 1.5px var(--bg-nav)',
            }}
          >
            {activeSurahQuestionCount > 99 ? '99+' : activeSurahQuestionCount}
          </span>
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2.5 lg:space-y-3 pb-4">
      {/* ====================================================================
          A1. MASAÜSTÜ (>= 1024px) — BİRLEŞİK ÜST BAR PORTALI (AppShell <header>)
          ==================================================================== */}
      {topbarPortalSlot && createPortal(desktopUnifiedToolbar, topbarPortalSlot)}

      {/* ====================================================================
          A2. MOBİL (< 1024px) — TÜM 3 MOD İÇİN TEK İNCE h-12 (48px) OKUMA BAR
          ==================================================================== */}
      {isPureMobileView && isMobileReaderImmersive ? (
        /* %100 Saf Sayfa Modu (Mushaf / Kitap dokunmatik odak): Sol üstte zarif yarı saydam buton */
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            setIsMobileDrawerOpen(true);
          }}
          aria-label="Okuma menüsünü aç"
          title="Menüyü aç"
          className="lg:hidden fixed top-2.5 left-2.5 z-40 w-9 h-9 rounded-xl border backdrop-blur-md shadow-md flex items-center justify-center opacity-80 hover:opacity-100 active:scale-95 transition-all cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <Menu className="w-4 h-4" />
        </button>
      ) : (
        /* Birleşik h-12 (48px) Mobil Okuma Şeridi — Mushaf, Kartlar ve Kitap'ta ortak; Kartlar & Kitap'ta aşağı kaydırmada gizlenir */
        <header
          aria-label="Mobil okuma şeridi"
          className={`lg:hidden sticky top-0 z-30 h-12 ${
            viewMode === 'cards' ? '-mx-2.5 sm:-mx-4 px-2 sm:px-3.5' : '-mx-1.5 sm:-mx-3 px-2 sm:px-3'
          } border-b backdrop-blur-md flex items-center justify-between gap-1.5 transition-transform duration-200 will-change-transform ${
            isMobileBarHidden && !isMobileModeMenuOpen ? '-translate-y-full' : 'translate-y-0'
          }`}
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Sol: Kompakt Konum Seçici (1. Fatiha · S.1 ▾) */}
          <button
            type="button"
            onClick={() => openLocationPicker('surah')}
            title="Sure, Sayfa, Cüz veya Ayet seç"
            className="flex-1 min-w-0 h-9 px-2 rounded-xl border flex items-center gap-1 text-xs font-extrabold cursor-pointer text-left"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="truncate tabular-nums">{mobileLocationLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65 ml-auto" />
          </button>

          {/* Sağ: Mod Değiştirici + Dinle + Hızlı Ara + Okuma Ayarları */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Dar mobil (< 640px): Tek dokunuşlu kompakt mod seçici dropdown (360px sıfır taşma) */}
            <div ref={mobileModeMenuRef} className="sm:hidden relative">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsMobileModeMenuOpen((v) => !v);
                }}
                aria-expanded={isMobileModeMenuOpen}
                aria-label="Okuma modunu değiştir"
                className="h-9 px-2 rounded-xl border text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: isMobileModeMenuOpen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isMobileModeMenuOpen
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <span>{activeModeShortLabel}</span>
                <ChevronDown className="w-3 h-3 shrink-0 opacity-75" />
              </button>

              {isMobileModeMenuOpen && (
                <div
                  className="absolute right-0 top-11 z-50 w-40 rounded-2xl border shadow-2xl p-1.5 space-y-0.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                  }}
                >
                  {(
                    [
                      { id: 'mushaf', label: 'Mushaf Sayfa', icon: BookOpen },
                      { id: 'cards', label: 'Ayet Kartları', icon: LayoutList },
                      { id: 'book', label: 'Kitap Modu', icon: BookText },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = viewMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setIsMobileModeMenuOpen(false);
                          handleSwitchViewMode(opt.id);
                        }}
                        className="w-full min-h-[38px] px-2.5 rounded-xl flex items-center gap-2 text-xs font-bold cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

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
              aria-label={isAudioOnCurrentView ? 'Dinlemeyi duraklat' : 'Dinle'}
              title={isAudioOnCurrentView ? 'Dinlemeyi duraklat' : 'Bu sayfayı / sureyi dinle'}
              className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors shrink-0"
              style={{
                backgroundColor: isAudioOnCurrentView
                  ? 'var(--brand-primary)'
                  : 'var(--brand-primary-soft)',
                color: isAudioOnCurrentView ? '#FFFFFF' : 'var(--brand-primary-text)',
              }}
            >
              {isAudioOnCurrentView ? (
                <Pause className="w-4 h-4" />
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

            {/* ⚙️ Okuma Ayarları Çekmecesi (Meal, Kelime Meali, Font, Ayraçlar, Odak, Ayarlar) */}
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsMobileDrawerOpen(true);
              }}
              aria-label="Okuma ayarları ve menü"
              title="Okuma ayarları"
              className="relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {bookmarkCount > 0 && (
                <span
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full pointer-events-none"
                  style={{ backgroundColor: 'var(--brand-accent)' }}
                />
              )}
            </button>
          </div>
        </header>
      )}

      {/* ====================================================================
          B. Ana İçerik Alanı (Mushaf / Ayet Kartları / Kitap Modu)
          ==================================================================== */}
      {settings.tajweedEnabled &&
        settings.showTajweedLegend &&
        !isMobileReaderImmersive &&
        !viewError && (
          <TajweedLegendBar
            rules={tajweedMetaRules}
            theme={settings.theme}
            isLoading={isLoadingTajweedMeta}
            onDismiss={() => updateSettings({ showTajweedLegend: false })}
          />
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
          secondPageBundle={isDoubleMushafPref ? secondPageBundle : null}
          pageLayout={studyPrefs.pageLayout}
          onChangePageLayout={handleChangePageLayout}
          contentMode={studyPrefs.bookContentMode}
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
          isAudioBarVisible={audioState.isVisible && audioState.status !== 'idle'}
          isAudioBarExpanded={
            audioState.isVisible &&
            audioState.status !== 'idle' &&
            (isAudioBarExpanded || audioState.missingMealAudio)
          }
          bookmarkedSet={bookmarkedSet}
          isRefreshing={isLoadingView}
          onSelectVerse={(verse) => {
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
          onOpenLocationPicker={(tab) => openLocationPicker(tab ?? 'surah')}
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
          onOpenLocationPicker={() => openLocationPicker('surah')}
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
                aria-label="Kapat"
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
                        setCurrentSurahNo(item.surahNo);
                        setCurrentPageNo(item.pageNo);
                        setSelectedAyahId(item.ayahId);
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
        onClose={() => setIsLocationPickerOpen(false)}
      />

      {/* Mobil Okuma Menüsü Çekmecesi (☰ Bottom Sheet) */}
      <MobileReaderDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        viewMode={viewMode}
        onSwitchViewMode={handleSwitchViewMode}
        onOpenPresentation={openPresentationMode}
        locationLabel={desktopLocationLabel}
        onOpenLocationPicker={() => openLocationPicker('surah')}
        primaryMeal={primaryMealDef}
        secondaryMeal={secondaryMealDef}
        isDualMeal={isDualMeal}
        onOpenMealSelector={() => openMealSelector('primary')}
        onSetMealDisplayMode={setMealDisplayMode}
        contentMode={mobileDrawerContentMode}
        onChangeContentMode={handleMobileDrawerContentMode}
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
        verses={activeViewVerses}
        activeVerse={activeSelectedVerse}
        surahMap={surahMap}
        besmele={meta?.besmele}
        onStartAudioFromActive={(v) => handlePlayFromVerse(v, false)}
      />
    </div>
  );
};
