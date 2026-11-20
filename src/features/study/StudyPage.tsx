import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookMarked,
  BookOpen,
  BookText,
  ChevronDown,
  ChevronUp,
  Columns2,
  Eye,
  Headphones,
  Languages,
  LayoutList,
  MonitorPlay,
  Pause,
  RefreshCw,
  SlidersHorizontal,
  Square,
  Star,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import { PresentationModeOverlay } from '../../components/PresentationModeOverlay';
import { VerseShareModal } from '../../components/VerseShareModal';
import {
  getDynamicArabicAudioSources,
  getDynamicMealAudioSources,
  mealHasAudio,
} from '../../config/assetsConfig';
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
  CombinedVerse,
  PageBundle,
  PageLayoutMode,
  PreferredMeal,
  StudyViewMode,
  SurahBundle,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { buildSurahQuestionCountMap, getSurahMap } from '../../utils/poolUtils';
import { BookModeView } from './BookModeView';
import { MushafPageView } from './MushafPageView';
import { SurahInfoModal } from './SurahInfoModal';
import { SurahPickerModal } from './SurahPickerModal';
import { VerseCardsView } from './VerseCardsView';

export const StudyPage: React.FC = () => {
  const {
    settings,
    updateSettings,
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
  const arabicAudioSources = useMemo(() => getDynamicArabicAudioSources(manifest), [manifest]);
  const mealAudioSources = useMemo(() => getDynamicMealAudioSources(manifest), [manifest]);

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

  const [isSurahPickerOpen, setIsSurahPickerOpen] = useState(false);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [infoModalSurah, setInfoModalSurah] = useState<SurahMeta | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    verse: CombinedVerse;
    surahMeta: SurahMeta;
  } | null>(null);
  const [pageInput, setPageInput] = useState<string>(String(initialPageNo));

  const viewMode = studyPrefs.viewMode;
  const isDoubleMushafPref = studyPrefs.pageLayout === 'double_mushaf';
  const bookmarkedSet = useMemo(
    () => new Set(studyProgress.bookmarkedAyahIds),
    [studyProgress.bookmarkedAyahIds],
  );

  // Dışarıdan (Ana Sayfa / Sınav) gelen doğrudan navigasyon hedeflerini işle
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
    setPageInput(String(targetPage));
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
          setPageInput(String(bundle.pageNo));

          // Sonraki sayfayı sessizce önbelleğe al (sunum modu ve sesli akışta 0 kırpışma)
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
            setPageInput(String(activeVerse.page));
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
      setPageInput(String(nextBundle.pageNo));
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

  // Aktif çalan ayete otomatik senkronizasyon ve yumuşak kaydırma (Mushaf, Kartlar ve Kitap Modu)
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
          const el = document.getElementById(`mushaf-ayah-${onThisPage.id}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Sesli meal seçiliyken seçilen mealin seslendirmesi var mı kontrol et
  const selectedMealAudioAvailable = useMemo(() => {
    if (settings.preferredMeal === 'both') return true;
    return mealHasAudio(settings.preferredMeal, manifest);
  }, [settings.preferredMeal, manifest]);

  const handleSelectSurah = useCallback(
    (surahNo: number) => {
      if (!meta) return;
      const firstPage = findPageForSurahAyah(meta, surahNo, 1);
      setCurrentSurahNo(surahNo);
      setCurrentPageNo(firstPage);
      setPageInput(String(firstPage));
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
      setPageInput(String(loc.page));
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
      setPageInput(String(clamped));
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
      setPageInput(String(targetPage));
      setJumpToAyahNo(ayahNo);
      setJumpNonce((n) => n + 1);
    },
    [meta, currentSurahNo],
  );

  const handleSwitchViewMode = (mode: StudyViewMode) => {
    if (mode === viewMode) return;
    sfxService.play('click');
    updateStudyPrefs({ viewMode: mode });
  };

  const handleChangePageLayout = useCallback(
    (layout: PageLayoutMode) => {
      sfxService.play('click');
      updateStudyPrefs({ pageLayout: layout });
    },
    [updateStudyPrefs],
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
      setPageInput(String(pageNo));
      updateStudyPrefs({ viewMode: 'mushaf' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [updateStudyPrefs],
  );

  const handleShareVerse = useCallback((verse: CombinedVerse, surahMeta: SurahMeta) => {
    setShareTarget({ verse, surahMeta });
  }, []);

  const handlePageInputCommit = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      handleChangePage(parsed);
    } else {
      setPageInput(String(currentPageNo));
    }
  };

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

  // Kompakt üst çubuk özet etiketi
  const filterSummaryText = useMemo(() => {
    const mealTag =
      settings.preferredMeal === 'both'
        ? 'Çift Meal'
        : settings.preferredMeal === 'm2'
          ? 'DİB'
          : 'TDV';
    const audioTag =
      audioPrefs.mode === 'ar' ? 'AR' : audioPrefs.mode === 'meal' ? 'Sesli Meal' : 'AR+Meal';
    return `${mealTag} · ${audioTag}`;
  }, [settings.preferredMeal, audioPrefs.mode]);

  const extraBottomSpace = audioState.isVisible ? 'pb-40 lg:pb-32' : 'pb-6';

  return (
    <div className={`space-y-3.5 sm:space-y-4 ${extraBottomSpace}`}>
      {/* ====================================================================
          A. Kompakt Üst Navigasyon ve Açılır Çalışma Araçları Çubuğu
          ==================================================================== */}
      <section
        aria-label="Okuma kontrolleri"
        className="surface-card rounded-2xl p-2.5 sm:p-3 space-y-2.5"
      >
        {/* Tek Kompakt Ana Şerit: Görünüm Modları + Hızlı Konum + Dinle + Sunum + Filtreler */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 3 Modlu Görünüm Anahtarı: Mushaf | Kartlar | Kitap */}
          <div
            className="grid grid-cols-3 gap-1 p-1 rounded-xl shrink-0 w-full sm:w-auto"
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
                  className="min-h-[38px] px-2.5 sm:px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Orta: Kompakt Sure / Cüz / Sayfa / Ayet Seçicileri */}
          <div className="flex flex-wrap items-center gap-1.5 flex-1 sm:justify-center lg:justify-start">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsSurahPickerOpen(true);
              }}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer max-w-[165px] sm:max-w-[195px]"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <BookMarked
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span className="truncate">
                {activeSurahMeta
                  ? `${activeSurahMeta.no}. ${activeSurahMeta.shortNameTr}`
                  : 'Sure Seç'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
            </button>

            <label className="sr-only" htmlFor="study-juz-select">
              Cüz seç
            </label>
            <select
              id="study-juz-select"
              value={activeJuzNo}
              onChange={(e) => handleSelectJuz(Number(e.target.value))}
              className="min-h-[38px] px-2 rounded-xl border text-xs font-bold cursor-pointer tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/40"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {(meta?.juzs ?? Array.from({ length: 30 }, (_, i) => ({ no: i + 1 }))).map((j) => (
                <option key={j.no} value={j.no}>
                  {j.no}. Cüz
                </option>
              ))}
            </select>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePageInputCommit();
              }}
              className="flex items-center rounded-xl border px-2 min-h-[38px] gap-1"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <label
                htmlFor="study-page-input"
                className="text-[11px] font-semibold whitespace-nowrap"
                style={{ color: 'var(--text-muted)' }}
              >
                S.
              </label>
              <input
                id="study-page-input"
                type="number"
                min={pageBounds.minPage}
                max={pageBounds.maxPage}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={handlePageInputCommit}
                className="w-10 bg-transparent text-xs font-extrabold tabular-nums text-center focus:outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </form>

            {activeSurahMeta && (
              <>
                <label className="sr-only" htmlFor="study-ayah-select">
                  Ayete git
                </label>
                <select
                  id="study-ayah-select"
                  value={activeAyahNumber}
                  onChange={(e) => handleJumpAyah(Number(e.target.value))}
                  className="min-h-[38px] px-2 rounded-xl border text-xs font-bold cursor-pointer tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/40"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {Array.from({ length: activeSurahMeta.ayahCount }, (_, idx) => idx + 1).map(
                    (ayahNo) => (
                      <option key={ayahNo} value={ayahNo}>
                        {ayahNo}. Ayet
                      </option>
                    ),
                  )}
                </select>
              </>
            )}
          </div>

          {/* Sağ: Hızlı Aksiyonlar (Dinle · Sunum · Favoriler · Filtreler Aç/Kapa) */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleHeaderListen}
              className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isAudioOnCurrentView ? (
                <>
                  <Pause className="w-3.5 h-3.5 shrink-0" />
                  <span>Duraklat</span>
                </>
              ) : (
                <>
                  <Headphones className="w-3.5 h-3.5 shrink-0" />
                  <span>Dinle</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={openPresentationMode}
              title="Tam ekran TV / Projeksiyon Sunum Modu"
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sunum</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsFavoritesDrawerOpen(true);
              }}
              title="Favori ayetlerim"
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor:
                  bookmarkedItems.length > 0 ? 'var(--brand-accent-soft)' : 'var(--bg-surface-soft)',
                borderColor:
                  bookmarkedItems.length > 0 ? 'var(--brand-accent)' : 'var(--border-subtle)',
                color:
                  bookmarkedItems.length > 0
                    ? 'var(--brand-accent-text)'
                    : 'var(--text-secondary)',
              }}
            >
              <Star
                className={`w-3.5 h-3.5 shrink-0 ${bookmarkedItems.length > 0 ? 'fill-current' : ''}`}
              />
              <span className="tabular-nums">{bookmarkedItems.length}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsToolbarExpanded((v) => !v);
              }}
              aria-expanded={isToolbarExpanded}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: isToolbarExpanded
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: isToolbarExpanded ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color: isToolbarExpanded ? 'var(--brand-primary-text)' : 'var(--text-primary)',
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">{filterSummaryText}</span>
              <span className="md:hidden">Filtre</span>
              {isToolbarExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* Açılır Gelişmiş Filtre, Meal, Kelime ve Ses Paneli */}
        {isToolbarExpanded && (
          <div
            className="pt-2.5 border-t space-y-2.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {/* Satır A: Meal + Kelime Meali + Masaüstü Çift Sayfa + Sure Sınavı */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Meal Seçici */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Meal:
                </span>
                <div
                  className="flex items-center p-0.5 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {(
                    [
                      { id: 'm1', label: 'TDV' },
                      { id: 'm2', label: 'DİB' },
                      { id: 'both', label: 'Çift Meal' },
                    ] as { id: PreferredMeal; label: string }[]
                  ).map((opt) => {
                    const active = settings.preferredMeal === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ preferredMeal: opt.id });
                        }}
                        className="min-h-[34px] px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
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

              {/* Kelime Meali (sadece wordByWordEnabled açıkken göster) */}
              {viewMode !== 'book' && settings.wordByWordEnabled && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs font-semibold flex items-center gap-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Kelime:</span>
                  </span>
                  <div
                    className="flex items-center p-0.5 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {(
                      [
                        { id: 'off', label: 'Kapalı' },
                        { id: 'visible', label: 'Kartlar' },
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
                          className="min-h-[34px] px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
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

              {/* Masaüstü 3'lü Sayfa Düzeni Seçici (Tek / 2 Sayfa Mushaf / Sağ Mushaf · Sol Meal) */}
              {viewMode === 'mushaf' && (
                <div
                  className="hidden lg:flex items-center p-0.5 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {(
                    [
                      { id: 'single', label: 'Tek Sayfa', icon: Square },
                      { id: 'double_mushaf', label: '2 Sayfa Mushaf', icon: Columns2 },
                      { id: 'double_meal', label: 'Mushaf + Meal', icon: BookOpen },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = studyPrefs.pageLayout === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleChangePageLayout(opt.id)}
                        className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sure Sınav Kısayolu */}
              {activeSurahMeta && activeSurahQuestionCount > 0 && (
                <button
                  type="button"
                  onClick={() => navigateToExam({ surahNo: activeSurahMeta.no })}
                  className="min-h-[34px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    borderColor: 'var(--brand-accent)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  <Trophy className="w-3.5 h-3.5 shrink-0" />
                  <span>Bu Sureden Test ({activeSurahQuestionCount})</span>
                </button>
              )}
            </div>

            {/* Satır B: Dinleme Modu + Dinamik Okuyucu + Sesli Meal Seçici + Odaklı Akış */}
            <div
              className="pt-2 border-t flex flex-wrap items-center justify-between gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="text-xs font-semibold flex items-center gap-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Dinleme:</span>
                </span>
                <div
                  className="flex items-center p-0.5 rounded-xl flex-wrap"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  {(
                    [
                      { id: 'ar_then_meal', label: 'AR + Meal' },
                      { id: 'ar', label: 'Sadece AR' },
                      { id: 'meal', label: 'Sadece Sesli Meal' },
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
                        className="min-h-[34px] px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                          color:
                            active && opt.id === 'meal'
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

                {/* Sadece Sesli Meal modunda Odaklı Meal Görünümü */}
                {audioPrefs.mode === 'meal' && viewMode === 'cards' && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      updateStudyPrefs({ mealAudioFocusOnly: !studyPrefs.mealAudioFocusOnly });
                    }}
                    className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: studyPrefs.mealAudioFocusOnly
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface)',
                      borderColor: studyPrefs.mealAudioFocusOnly
                        ? 'var(--brand-accent)'
                        : 'var(--border-subtle)',
                      color: studyPrefs.mealAudioFocusOnly
                        ? 'var(--brand-accent-text)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Odaklı Sesli Meal</span>
                  </button>
                )}
              </div>

              {/* Dinamik Okuyucu ve Sesli Meal Seçicileri */}
              <div className="flex items-center gap-2 flex-wrap">
                {arabicAudioSources.length > 1 && audioPrefs.mode !== 'meal' && (
                  <select
                    aria-label="Arapça okuyucu seç"
                    value={audioPrefs.arabicAudioSource}
                    onChange={(e) => {
                      sfxService.play('click');
                      updateAudioPrefs({ arabicAudioSource: e.target.value });
                    }}
                    className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {arabicAudioSources.map((src) => (
                      <option key={src.id} value={src.id}>
                        Tilavet: {src.shortLabel}
                      </option>
                    ))}
                  </select>
                )}

                {audioPrefs.mode !== 'ar' && mealAudioSources.length > 0 && (
                  <div
                    className="flex items-center p-0.5 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {mealAudioSources.map((src) => {
                      const active = audioPrefs.mealAudioSource === src.id;
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateAudioPrefs({ mealAudioSource: src.id });
                          }}
                          className="min-h-[34px] px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                            color: active ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                            boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          {src.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Seslendirmesi olmayan meal için zarif bilgilendirme */}
            {audioPrefs.mode !== 'ar' && !selectedMealAudioAvailable && (
              <div
                className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  Seçili okuma mealinin seslendirmesi bulunmuyor; sesli meal akışında TDV veya DİB
                  seslendirmesi kullanılır.
                </span>
              </div>
            )}
          </div>
        )}
      </section>

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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-pulse">
          <div
            className="lg:col-span-7 h-96 rounded-3xl border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          />
          <div
            className="lg:col-span-5 h-72 rounded-2xl border"
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
          besmele={meta.besmele}
          settings={settings}
          wordMode={studyPrefs.wordMode}
          selectedVerseId={selectedAyahId}
          playingAyahId={
            audioState.status === 'playing' || audioState.status === 'loading'
              ? audioState.currentAyahId
              : null
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
        />
      ) : viewMode === 'cards' && surahBundle ? (
        <VerseCardsView
          surahBundle={surahBundle}
          besmele={meta.besmele}
          settings={settings}
          wordMode={studyPrefs.wordMode}
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
        />
      ) : null}

      {/* Favori Ayetlerim Çekmecesi */}
      {isFavoritesDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Favori ayetlerim"
          className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
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
                        setPageInput(String(item.pageNo));
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

      {/* Sure Seçici, Sure Bilgisi, Ayet Paylaşım Kartı ve Sunum Modu */}
      <SurahPickerModal
        isOpen={isSurahPickerOpen}
        currentSurahNo={currentSurahNo}
        onSelectSurah={handleSelectSurah}
        onClose={() => setIsSurahPickerOpen(false)}
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
        onStartAudioFromActive={(v) => handlePlayFromVerse(v, false)}
      />
    </div>
  );
};
