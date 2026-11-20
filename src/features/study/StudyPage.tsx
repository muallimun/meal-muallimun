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
  BookMarked,
  BookOpen,
  ChevronDown,
  Headphones,
  Languages,
  LayoutList,
  Pause,
  RefreshCw,
  Trophy,
  Volume2,
} from 'lucide-react';
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
  MealAudioSourceId,
  PageBundle,
  PreferredMeal,
  StudyViewMode,
  SurahBundle,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { buildSurahQuestionCountMap } from '../../utils/poolUtils';
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
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const pageBounds = useMemo(
    () => (meta ? getPageBounds(meta) : { minPage: 1, maxPage: 604 }),
    [meta],
  );

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
  const [surahBundle, setSurahBundle] = useState<SurahBundle | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(true);
  const [viewError, setViewError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [isSurahPickerOpen, setIsSurahPickerOpen] = useState(false);
  const [infoModalSurah, setInfoModalSurah] = useState<SurahMeta | null>(null);
  const [pageInput, setPageInput] = useState<string>(String(initialPageNo));

  const viewMode = studyPrefs.viewMode;
  const bookmarkedSet = useMemo(
    () => new Set(studyProgress.bookmarkedAyahIds),
    [studyProgress.bookmarkedAyahIds],
  );

  // Dışarıdan (Ana Sayfa) gelen doğrudan navigasyon hedeflerini işle
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

  // Sayfa veya Sure verisini yükle
  useEffect(() => {
    if (!meta) return;
    let cancelled = false;

    async function loadContent() {
      setIsLoadingView(true);
      setViewError(null);
      try {
        if (viewMode === 'mushaf') {
          const bundle = await dataService.getPageBundle(currentPageNo);
          if (cancelled) return;
          setPageBundle(bundle);
          setPageInput(String(bundle.pageNo));

          if (bundle.verses.length > 0) {
            const matched = bundle.verses.find((v) => v.id === selectedAyahId);
            const activeVerse = matched ?? bundle.verses[0];
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
              viewMode: 'cards',
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
  }, [meta, viewMode, currentPageNo, currentSurahNo, reloadNonce]);

  // Mushaf modunda sayfanın son ayeti bitince otomatik sonraki sayfaya geçiş sağlayıcısı
  useEffect(() => {
    if (viewMode !== 'mushaf' || !meta) {
      audioQueueService.registerNextPageProvider(null);
      return;
    }

    audioQueueService.registerNextPageProvider(async (nextPageNo: number) => {
      if (nextPageNo > pageBounds.maxPage) return null;
      const nextBundle = await dataService.getPageBundle(nextPageNo);
      if (nextBundle.verses.length === 0) return null;

      setCurrentPageNo(nextBundle.pageNo);
      setPageBundle(nextBundle);
      setPageInput(String(nextBundle.pageNo));
      setSelectedAyahId(nextBundle.verses[0].id);
      setCurrentSurahNo(nextBundle.verses[0].surah);

      return {
        verses: nextBundle.verses,
        contextKey: `page:${nextBundle.pageNo}`,
      };
    });

    return () => {
      audioQueueService.registerNextPageProvider(null);
    };
  }, [viewMode, meta, pageBounds.maxPage]);

  // Aktif çalan ayete otomatik senkronizasyon ve yumuşak kaydırma
  useEffect(() => {
    if (!audioState.currentAyahId || audioState.status === 'idle') return;

    if (viewMode === 'mushaf' && pageBundle) {
      const onThisPage = pageBundle.verses.find((v) => v.id === audioState.currentAyahId);
      if (onThisPage) {
        setSelectedAyahId(onThisPage.id);
        setCurrentSurahNo(onThisPage.surah);
        setLastRead({
          surah: onThisPage.surah,
          ayah: onThisPage.ayah,
          page: pageBundle.pageNo,
          viewMode: 'mushaf',
        });
        if (audioPrefs.autoScroll) {
          const el = document.getElementById(`mushaf-ayah-${onThisPage.id}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } else if (viewMode === 'cards' && surahBundle) {
      const inThisSurah = surahBundle.verses.find((v) => v.id === audioState.currentAyahId);
      if (inThisSurah) {
        setSelectedAyahId(inThisSurah.id);
        setLastRead({
          surah: inThisSurah.surah,
          ayah: inThisSurah.ayah,
          page: inThisSurah.page,
          viewMode: 'cards',
        });
        if (audioPrefs.autoScroll) {
          const el = document.getElementById(`verse-card-${inThisSurah.id}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [
    audioState.currentAyahId,
    audioState.status,
    viewMode,
    pageBundle,
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

  const activeAyahNumber = useMemo(() => {
    if (viewMode === 'mushaf' && pageBundle) {
      const found = pageBundle.verses.find((v) => v.id === selectedAyahId);
      return found?.ayah ?? pageBundle.verses[0]?.ayah ?? 1;
    }
    if (surahBundle) {
      const found = surahBundle.verses.find((v) => v.id === selectedAyahId);
      return found?.ayah ?? 1;
    }
    return 1;
  }, [viewMode, pageBundle, surahBundle, selectedAyahId]);

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

  // Üstteki "Dinle" butonu: aktif sayfa/sureye göre taze başlatır veya mevcut aynı yeri oynat/duraklat yapar
  const currentContextKey =
    viewMode === 'mushaf' ? `page:${currentPageNo}` : `surah:${currentSurahNo}`;

  const isAudioOnCurrentView =
    audioState.isVisible &&
    audioState.contextKey === currentContextKey &&
    (audioState.status === 'playing' || audioState.status === 'loading');

  const handleHeaderListen = () => {
    if (!manifest || !meta) return;

    // Şu an tam olarak bu sayfa/sure çalıyorsa duraklat
    if (isAudioOnCurrentView) {
      audioQueueService.togglePlayPause();
      return;
    }

    // Aynı sayfa/surede duraklatılmışsa devam et; başka sayfa/sureye geçildiyse YENİ yerden başlat!
    if (
      audioState.isVisible &&
      audioState.contextKey === currentContextKey &&
      audioState.status === 'paused'
    ) {
      audioQueueService.togglePlayPause();
      return;
    }

    if (viewMode === 'mushaf' && pageBundle && pageBundle.verses.length > 0) {
      const startIdx = Math.max(
        0,
        pageBundle.verses.findIndex((v) => v.id === selectedAyahId),
      );
      audioQueueService.startQueue({
        verses: pageBundle.verses,
        startIndex: startIdx,
        context: 'page',
        contextKey: `page:${pageBundle.pageNo}`,
        manifest,
        meta,
        prefs: audioPrefs,
      });
    } else if (viewMode === 'cards' && surahBundle && surahBundle.verses.length > 0) {
      const startIdx = Math.max(
        0,
        surahBundle.verses.findIndex((v) => v.id === selectedAyahId),
      );
      audioQueueService.startQueue({
        verses: surahBundle.verses,
        startIndex: startIdx,
        context: 'surah',
        contextKey: `surah:${surahBundle.surahMeta.no}`,
        manifest,
        meta,
        prefs: audioPrefs,
      });
    }
  };

  const handlePlayFromVerse = useCallback(
    (verse: CombinedVerse, singleAyahOnly = false, modeOverride?: AudioPlayMode) => {
      if (!manifest || !meta) return;

      if (viewMode === 'mushaf' && pageBundle) {
        const idx = pageBundle.verses.findIndex((v) => v.id === verse.id);
        audioQueueService.startQueue({
          verses: pageBundle.verses,
          startIndex: Math.max(0, idx),
          context: 'page',
          contextKey: `page:${pageBundle.pageNo}`,
          manifest,
          meta,
          prefs: audioPrefs,
          singleAyahOnly,
          modeOverride,
        });
      } else if (surahBundle) {
        const idx = surahBundle.verses.findIndex((v) => v.id === verse.id);
        audioQueueService.startQueue({
          verses: surahBundle.verses,
          startIndex: Math.max(0, idx),
          context: 'surah',
          contextKey: `surah:${surahBundle.surahMeta.no}`,
          manifest,
          meta,
          prefs: audioPrefs,
          singleAyahOnly,
          modeOverride,
        });
      }
    },
    [manifest, meta, viewMode, pageBundle, surahBundle, audioPrefs],
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

  const handlePageInputCommit = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      handleChangePage(parsed);
    } else {
      setPageInput(String(currentPageNo));
    }
  };

  const listenButtonLabel =
    audioPrefs.mode === 'meal'
      ? 'Sesli Meal Dinle'
      : audioPrefs.mode === 'ar_then_meal'
        ? 'Arapça + Meal Dinle'
        : 'Hatim Dinle';

  const extraBottomSpace = audioState.isVisible ? 'pb-40 lg:pb-32' : 'pb-6';

  return (
    <div className={`space-y-4 sm:space-y-5 ${extraBottomSpace}`}>
      {/* ====================================================================
          A. Üst Navigasyon ve Çalışma Araçları Çubuğu (Sticky & Responsive)
          ==================================================================== */}
      <section
        aria-label="Okuma kontrolleri"
        className="surface-card rounded-2xl p-3 sm:p-4 space-y-3"
      >
        {/* Satır 1: Görünüm Anahtarı + Hızlı Geçiş Seçicileri + Dinle Butonu */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          {/* Görünüm Anahtarı: Mushaf Sayfa | Ayet & Meal */}
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-xl shrink-0"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <button
              type="button"
              onClick={() => handleSwitchViewMode('mushaf')}
              className="min-h-[42px] px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: viewMode === 'mushaf' ? 'var(--bg-surface)' : 'transparent',
                color:
                  viewMode === 'mushaf' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: viewMode === 'mushaf' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Mushaf Sayfa</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchViewMode('cards')}
              className="min-h-[42px] px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: viewMode === 'cards' ? 'var(--bg-surface)' : 'transparent',
                color:
                  viewMode === 'cards' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <LayoutList className="w-4 h-4 shrink-0" />
              <span>Ayet &amp; Meal</span>
            </button>
          </div>

          {/* Hızlı Geçiş Seçicileri (Sure, Cüz, Sayfa, Ayet) + Dinle */}
          <div className="flex flex-wrap items-center gap-2 flex-1 lg:justify-end">
            {/* 1. Sure Seçici Tetikleyici */}
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsSurahPickerOpen(true);
              }}
              className="min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer max-w-[200px] sm:max-w-[230px]"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <BookMarked
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span className="truncate">
                {activeSurahMeta
                  ? `${activeSurahMeta.no}. ${activeSurahMeta.shortNameTr}`
                  : 'Sure Seç'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
            </button>

            {/* 2. Cüz Seçici (1..30) */}
            <label className="sr-only" htmlFor="study-juz-select">
              Cüz seç
            </label>
            <select
              id="study-juz-select"
              value={activeJuzNo}
              onChange={(e) => handleSelectJuz(Number(e.target.value))}
              className="min-h-[42px] px-2.5 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/40"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {(meta?.juzs ?? Array.from({ length: 30 }, (_, i) => ({ no: i + 1 }))).map(
                (j) => (
                  <option key={j.no} value={j.no}>
                    {j.no}. Cüz
                  </option>
                ),
              )}
            </select>

            {/* 3. Sayfa Seçici (minPage..maxPage) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePageInputCommit();
              }}
              className="flex items-center rounded-xl border px-2.5 min-h-[42px] gap-1.5"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <label
                htmlFor="study-page-input"
                className="text-xs font-semibold whitespace-nowrap"
                style={{ color: 'var(--text-muted)' }}
              >
                Sayfa
              </label>
              <input
                id="study-page-input"
                type="number"
                min={pageBounds.minPage}
                max={pageBounds.maxPage}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={handlePageInputCommit}
                className="w-12 bg-transparent text-xs sm:text-sm font-extrabold tabular-nums text-center focus:outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </form>

            {/* 4. Ayet'e Git (1..ayahCount) */}
            {activeSurahMeta && (
              <>
                <label className="sr-only" htmlFor="study-ayah-select">
                  Ayete git
                </label>
                <select
                  id="study-ayah-select"
                  value={activeAyahNumber}
                  onChange={(e) => handleJumpAyah(Number(e.target.value))}
                  className="min-h-[42px] px-2.5 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/40"
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

            {/* 5. Dinle Butonu */}
            <button
              type="button"
              onClick={handleHeaderListen}
              className="min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center gap-2 transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isAudioOnCurrentView ? (
                <>
                  <Pause className="w-4 h-4 shrink-0" />
                  <span>Duraklat</span>
                </>
              ) : (
                <>
                  <Headphones className="w-4 h-4 shrink-0" />
                  <span>{listenButtonLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Satır 2: Çalışma Araçları — Meal Seçici & Kelime Meali Modu */}
        <div
          className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Meal Seçici: TDV | DİB | Çift Meal */}
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold hidden sm:inline"
              style={{ color: 'var(--text-muted)' }}
            >
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
                    className="min-h-[36px] px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
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

          {/* Kelime Meali Seçici: Kapalı | Kelime Kartları | Kendini Dene */}
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold hidden sm:flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>Kelime Meali:</span>
            </span>
            <div
              className="flex items-center p-0.5 rounded-xl"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {(
                [
                  { id: 'off', label: 'Kapalı' },
                  { id: 'visible', label: 'Kelime Kartları' },
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
                    className="min-h-[36px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
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

          {/* Bu Sureden Kendini Dene Kısayolu (Soru bankasında sorusu varsa) */}
          {activeSurahMeta && activeSurahQuestionCount > 0 && (
            <button
              type="button"
              onClick={() => navigateToExam({ surahNo: activeSurahMeta.no })}
              className="min-h-[38px] px-3.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'var(--brand-accent)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span>Bu Sureden Kendini Dene ({activeSurahQuestionCount} Soru)</span>
            </button>
          )}
        </div>

        {/* Satır 3: Sesli Dinleme Modu & Sesli Meal Okuyucu Seçicisi */}
        <div
          className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Dinleme Modu Seçicisi */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-semibold flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span>Dinleme Modu:</span>
            </span>
            <div
              className="flex items-center p-0.5 rounded-xl flex-wrap"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {(
                [
                  { id: 'ar_then_meal', label: 'Arapça + Sesli Meal' },
                  { id: 'ar', label: 'Sadece Arapça' },
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
                    className="min-h-[36px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
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
          </div>

          {/* Sesli Meal Okuyucu Seçicisi (Mod "Sadece Arapça" değilken doğrudan görünür) */}
          {audioPrefs.mode !== 'ar' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs font-semibold hidden sm:inline"
                style={{ color: 'var(--text-muted)' }}
              >
                Sesli Meal:
              </span>
              <div
                className="flex items-center p-0.5 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {(
                  [
                    { id: 'tdv', label: 'TDV Ses (Seyfullah Kartal)' },
                    { id: 'dib', label: 'DİB Ses (Mehmet Emin Ay)' },
                  ] as { id: MealAudioSourceId; label: string }[]
                ).map((src) => {
                  const active = audioPrefs.mealAudioSource === src.id;
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateAudioPrefs({ mealAudioSource: src.id });
                      }}
                      className="min-h-[36px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
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
            </div>
          )}
        </div>
      </section>

      {/* ====================================================================
          B. Ana İçerik Alanı (Yükleniyor / Hata / Mushaf Sayfa / Ayet Kartları)
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
      ) : isLoadingView || !meta ? (
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
          onSelectVerse={(verse) => {
            setSelectedAyahId(verse.id);
            setCurrentSurahNo(verse.surah);
            setLastRead({
              surah: verse.surah,
              ayah: verse.ayah,
              page: pageBundle.pageNo,
              viewMode: 'mushaf',
            });
          }}
          onChangePage={handleChangePage}
          onPlayFromVerse={handlePlayFromVerse}
          onPlayMealFromVerse={handlePlayMealFromVerse}
          onToggleBookmark={toggleBookmarkAyah}
          onOpenSurahInfo={(surah) => setInfoModalSurah(surah)}
        />
      ) : viewMode === 'cards' && surahBundle ? (
        <VerseCardsView
          surahBundle={surahBundle}
          besmele={meta.besmele}
          settings={settings}
          wordMode={studyPrefs.wordMode}
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
          onOpenPageInMushaf={handleOpenPageInMushaf}
        />
      ) : null}

      {/* Sure Seçici ve Sure Bilgisi Modalları */}
      <SurahPickerModal
        isOpen={isSurahPickerOpen}
        currentSurahNo={currentSurahNo}
        onSelectSurah={handleSelectSurah}
        onClose={() => setIsSurahPickerOpen(false)}
      />

      <SurahInfoModal surah={infoModalSurah} onClose={() => setInfoModalSurah(null)} />
    </div>
  );
};
