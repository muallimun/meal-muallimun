import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AlertTriangle,
  BookOpen,
  BookText,
  Bookmark,
  ChevronDown,
  Columns2,
  Eye,
  Headphones,
  LayoutList,
  Menu,
  Minus,
  MonitorPlay,
  Palette,
  Pause,
  Plus,
  RefreshCw,
  SlidersHorizontal,
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
} from '../../types/quran';
import { formatSurahTitle } from '../../utils/arabicUtils';
import { buildSurahQuestionCountMap, getSurahMap } from '../../utils/poolUtils';
import { BookModeView } from './BookModeView';
import { LocationPickerModal, type LocationPickerTab } from './LocationPickerModal';
import { MobileReaderDrawer } from './MobileReaderDrawer';
import { MushafPageView } from './MushafPageView';
import { SurahInfoModal } from './SurahInfoModal';
import { VerseCardsView } from './VerseCardsView';

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
    isMobileReaderImmersive,
    setIsMobileReaderImmersive,
    isAudioBarExpanded,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
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

  const [pageBundle, setPageBundle] = useState<PageBundle | null>(null);
  const [secondPageBundle, setSecondPageBundle] = useState<PageBundle | null>(null);
  const [surahBundle, setSurahBundle] = useState<SurahBundle | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(true);
  const [viewError, setViewError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Yeni Sade Arayüz Popover & Çekmece Durumları
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [locationPickerTab, setLocationPickerTab] = useState<LocationPickerTab>('surah');
  const [isViewPopoverOpen, setIsViewPopoverOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState(false);
  const [infoModalSurah, setInfoModalSurah] = useState<SurahMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    verse: CombinedVerse;
    surahMeta: SurahMeta;
  } | null>(null);

  const viewPopoverRef = useRef<HTMLDivElement | null>(null);

  const viewMode = studyPrefs.viewMode;
  const isDoubleMushafPref = studyPrefs.pageLayout === 'double_mushaf';
  const bookmarkedSet = useMemo(
    () => new Set(studyProgress.bookmarkedAyahIds),
    [studyProgress.bookmarkedAyahIds],
  );

  // Masaüstü Görünüm popover dışına tıklanınca kapat
  useEffect(() => {
    if (!isViewPopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (viewPopoverRef.current && !viewPopoverRef.current.contains(e.target as Node)) {
        setIsViewPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isViewPopoverOpen]);

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
    if (!audioState.currentAyahId || audioState.status === 'idle') return;

    if (viewMode === 'mushaf' && pageBundle) {
      const combined = secondPageBundle
        ? [...pageBundle.verses, ...secondPageBundle.verses]
        : pageBundle.verses;
      const onThisPage = combined.find((v) => v.id === audioState.currentAyahId);
      if (onThisPage) {
        setSelectedAyahId(onThisPage.id);
        setCurrentSurahNo(onThisPage.surah);
        setLastRead({
          surah: onThisPage.surah,
          ayah: onThisPage.ayah,
          page: onThisPage.page,
          viewMode: 'mushaf',
        });
        if (audioPrefs.autoScroll) {
          const isDesktopDualSpread =
            (studyPrefs.pageLayout === 'double_meal' ||
              studyPrefs.pageLayout === 'double_mushaf') &&
            typeof window !== 'undefined' &&
            window.innerWidth >= 1024;
          if (!isDesktopDualSpread) {
            if (studyPrefs.pageLayout === 'meal_only') {
              const mealEl = document.querySelector<HTMLElement>(
                `[data-meal-ayahs~="${onThisPage.id}"]`,
              );
              mealEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              const el = document.getElementById(`mushaf-ayah-${onThisPage.id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
      }
    } else if ((viewMode === 'cards' || viewMode === 'book') && surahBundle) {
      const inThisSurah = surahBundle.verses.find((v) => v.id === audioState.currentAyahId);
      if (inThisSurah) {
        setSelectedAyahId(inThisSurah.id);
        setLastRead({
          surah: inThisSurah.surah,
          ayah: inThisSurah.ayah,
          page: inThisSurah.page,
          viewMode,
        });
        if (audioPrefs.autoScroll) {
          const elId =
            viewMode === 'book' ? `book-ayah-${inThisSurah.id}` : `verse-card-${inThisSurah.id}`;
          const el = document.getElementById(elId);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [
    audioState.currentAyahId,
    audioState.status,
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
    ? `${activeSurahMeta.no}. ${activeSurahMeta.shortNameTr} · S. ${currentPageNo} · ${activeJuzNo}. Cüz`
    : `Sayfa ${currentPageNo} · ${activeJuzNo}. Cüz`;

  const mobileLocationLabel = activeSurahMeta
    ? `${activeSurahMeta.no}. ${activeSurahMeta.shortNameTr} · S. ${currentPageNo}`
    : `Sayfa ${currentPageNo}`;

  const mealButtonLabel = isDualMeal
    ? `${primaryMealDef.shortLabel} + ${secondaryMealDef.shortLabel}`
    : primaryMealDef.shortLabel;

  const isPureMobileView = viewMode === 'mushaf' || viewMode === 'book';
  const bookmarkCount = studyProgress.pageBookmarks.length;

  return (
    <div className="space-y-2.5 lg:space-y-3 pb-4">
      {/* ====================================================================
          A1. MASAÜSTÜ (>= 1024px) — TEK SATIR KOMUT ŞERİDİ (h-11 / 44px)
          ==================================================================== */}
      <section
        aria-label="Masaüstü okuma komut şeridi"
        className="hidden lg:flex h-11 surface-card rounded-2xl px-2 items-center justify-between gap-1.5 xl:gap-2 relative z-20"
      >
        {/* Sol Grup: Mod Segmenti [Mushaf | Kartlar | Kitap] + Birleşik Konum Seçici */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="flex items-center p-0.5 rounded-xl shrink-0"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
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
                  <Icon className="w-3.5 h-3.5 shrink-0 hidden xl:block" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => openLocationPicker('surah')}
            title="Sure, Sayfa, Cüz veya Ayet seç"
            className="h-8 px-2 xl:px-2.5 rounded-xl border text-[11px] xl:text-xs font-extrabold flex items-center gap-1 cursor-pointer min-w-0 max-w-[165px] xl:max-w-[230px] 2xl:max-w-[270px] transition-colors hover:border-teal-600/50"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="truncate tabular-nums">{desktopLocationLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65" />
          </button>
        </div>

        {/* Orta Grup: Moda Duyarlı Tek Düzen Kontrolü (Mushaf: 4 seçenek | Kartlar/Kitap: 3 seçenek) */}
        <div
          className="flex items-center p-0.5 rounded-xl shrink-0"
          style={{ backgroundColor: 'var(--bg-surface-soft)' }}
        >
          {viewMode === 'mushaf'
            ? (
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
                    className="h-8 px-2 xl:px-2.5 rounded-lg text-[11px] xl:text-xs font-bold cursor-pointer whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })
            : (
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
                    className="h-8 px-2 xl:px-2.5 rounded-lg text-[11px] xl:text-xs font-bold cursor-pointer whitespace-nowrap transition-colors"
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

        {/* Sağ Grup: Tek Meal Seçici · Görünüm ▾ Popover · 🎧 Dinle · 📺 Sunum · 🏆 Test */}
        <div className="flex items-center gap-1 xl:gap-1.5 shrink-0">
          {/* Tek Meal Seçici (24 Meal + Tek/Çift Meal anahtarı modal içinde) */}
          <button
            type="button"
            onClick={() => openMealSelector('primary')}
            title={`Aktif Meal: ${primaryMealDef.label}${isDualMeal ? ` + ${secondaryMealDef.label}` : ''}`}
            className="h-8 px-2 xl:px-2.5 rounded-xl border text-[11px] xl:text-xs font-bold flex items-center gap-1 cursor-pointer max-w-[115px] xl:max-w-[155px]"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              borderColor: 'var(--brand-primary)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{mealButtonLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-75" />
          </button>

          {/* Görünüm ▾ Yüzen Popover (Sayfayı Aşağı İtmez!) */}
          <div ref={viewPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsViewPopoverOpen((v) => !v);
              }}
              aria-expanded={isViewPopoverOpen}
              title="Yazı Boyutu, Arapça Yazı Tipi ve Tema Ayarları"
              className="h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
              style={{
                backgroundColor: isViewPopoverOpen
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: isViewPopoverOpen ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color: isViewPopoverOpen ? 'var(--brand-primary-text)' : 'var(--text-primary)',
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">Görünüm</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
            </button>

            {isViewPopoverOpen && (
              <div
                className="absolute right-0 top-10 z-40 w-[296px] rounded-2xl border shadow-2xl p-3.5 space-y-3.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                {/* Hızlı Yazı Boyutu (Arapça & Meal) */}
                <div className="space-y-2">
                  <span
                    className="block text-[11px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Yazı Boyutu
                  </span>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">Arapça Metin ({settings.arabicFontSize}px)</span>
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
                    <span className="text-xs font-bold">Meal Metni ({settings.turkishFontSize}px)</span>
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

                {/* Hızlı Arapça Yazı Tipi Seçimi */}
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
                </div>

                {/* Hızlı Tema Seçici (Açık / Krem / Gece) */}
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

                {/* Kitap Modu Sütun Düzeni */}
                {viewMode === 'book' && (
                  <div
                    className="pt-3 border-t"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateStudyPrefs({
                          pageLayout: studyPrefs.pageLayout === 'single' ? 'double_mushaf' : 'single',
                        });
                      }}
                      className="w-full h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Columns2 className="w-3.5 h-3.5" />
                      <span>{studyPrefs.pageLayout === 'single' ? 'Çift Sütun' : 'Tek Sütun'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 🎧 Dinle */}
          <button
            type="button"
            onClick={handleHeaderListen}
            title={isAudioOnCurrentView ? 'Dinlemeyi duraklat' : 'Bu sayfayı / sureyi dinle'}
            className="h-8 px-2.5 xl:px-3 rounded-xl text-[11px] xl:text-xs font-bold text-white flex items-center gap-1.5 transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'var(--brand-primary)' }}
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

          {/* 📺 Sunum */}
          <button
            type="button"
            onClick={openPresentationMode}
            title="Tam ekran TV / Projeksiyon Sunum Modu"
            className="h-8 px-2 xl:px-2.5 rounded-xl border text-[11px] xl:text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden 2xl:inline">Sunum</span>
          </button>

          {/* 🏆 Test (Soru varsa kompakt rozet) */}
          {activeSurahMeta && activeSurahQuestionCount > 0 && (
            <button
              type="button"
              onClick={() => navigateToExam({ surahNo: activeSurahMeta.no })}
              title={`${formatSurahTitle(activeSurahMeta.nameTr, activeSurahMeta.no)}nden Test Çöz (${activeSurahQuestionCount} Soru)`}
              className="h-8 px-2 xl:px-2.5 rounded-xl border text-[11px] xl:text-xs font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap tabular-nums"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'var(--brand-accent)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden 2xl:inline">Test</span>
              <span>({activeSurahQuestionCount})</span>
            </button>
          )}
        </div>
      </section>

      {/* ====================================================================
          A2. MOBİL (< 1024px) — "SAF MUSHAF & KİTAP" ULTRA-İNCE 40px BAR / %100 SAF MOD
          ==================================================================== */}
      {isPureMobileView && isMobileReaderImmersive ? (
        /* %100 Saf Sayfa Modu: Yalnızca sol üstte yarı saydam küçük ☰ butonu */
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            setIsMobileDrawerOpen(true);
          }}
          aria-label="Okuma menüsünü aç"
          title="Menüyü aç"
          className="lg:hidden fixed top-2.5 left-2.5 z-40 w-9 h-9 rounded-xl border backdrop-blur-md shadow-md flex items-center justify-center opacity-75 hover:opacity-100 active:scale-95 transition-all cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <Menu className="w-4 h-4" />
        </button>
      ) : (
        /* Ultra-ince 40px (h-10) Tek Satır Mobil Okuma Şeridi */
        <header
          aria-label="Mobil okuma şeridi"
          className={`lg:hidden h-10 ${
            isPureMobileView
              ? 'sticky top-0 z-30 -mx-1.5 px-2 border-b backdrop-blur-md'
              : 'rounded-xl border px-2'
          } flex items-center justify-between gap-1.5`}
          style={{
            backgroundColor: isPureMobileView ? 'var(--bg-nav)' : 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Sol: ☰ Hamburger Menü */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsMobileDrawerOpen(true);
            }}
            aria-label="Okuma menüsünü aç"
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Orta: Tıklanabilir Konum Başlığı (24. Nûr · S. 349 ▾) */}
          <button
            type="button"
            onClick={() => openLocationPicker('surah')}
            className="flex-1 min-w-0 h-8 px-2 rounded-lg flex items-center justify-center gap-1 text-xs font-extrabold cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="truncate tabular-nums">{mobileLocationLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-65" />
          </button>

          {/* Sağ: 🎧 Dinle · 🔖 Ayraç · 👁 Saf Sayfa (Mushaf/Kitap) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleHeaderListen}
              aria-label={isAudioOnCurrentView ? 'Duraklat' : 'Dinle'}
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: isAudioOnCurrentView
                  ? 'var(--brand-primary)'
                  : 'var(--brand-primary-soft)',
                color: isAudioOnCurrentView ? '#FFFFFF' : 'var(--brand-primary-text)',
              }}
            >
              {isAudioOnCurrentView ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Headphones className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openBookmarksDrawer();
              }}
              aria-label="Sayfa ayraçlarım"
              className="relative w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor:
                  bookmarkCount > 0 ? 'var(--brand-accent-soft)' : 'var(--bg-surface-soft)',
                color: bookmarkCount > 0 ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
              }}
            >
              <Bookmark className={`w-3.5 h-3.5 ${bookmarkCount > 0 ? 'fill-current' : ''}`} />
            </button>

            {isPureMobileView && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsMobileReaderImmersive(true);
                }}
                aria-label="Saf sayfa odak modu"
                title="Tam odak (barları gizle)"
                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>
      )}

      {/* ====================================================================
          B. Ana İçerik Alanı (Mushaf / Ayet Kartları / Kitap Modu)
          ==================================================================== */}
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
          onToggleBookmark={toggleBookmarkAyah}
          onChangeWordMode={(mode) => updateStudyPrefs({ wordMode: mode })}
          onPlayFromVerse={(v) => handlePlayFromVerse(v, false)}
          onPlayMealFromVerse={handlePlayMealFromVerse}
          onShareVerse={handleShareVerse}
          onOpenPageInMushaf={handleOpenPageInMushaf}
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

      {/* Birleşik Hızlı Konum Seçici (Sure / Sayfa / Cüz / Ayet) */}
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
