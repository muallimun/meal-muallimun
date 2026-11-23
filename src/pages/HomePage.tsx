import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Headphones,
  Layers,
  ListMusic,
  Play,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Star,
  StickyNote,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { PwaInstallControl } from '../components/PwaInstallControl';
import {
  findMealById,
  getMealTextPresentation,
} from '../config/mealsConfig';
import { findReciterById } from '../config/recitersConfig';
import {
  applyStudyDeskProfile,
  countEnabledDeskRows,
  getStudyDeskProfileLabel,
  STUDY_DESK_PROFILES,
  STUDY_DESK_TOGGLES,
  toggleStudyDeskRow,
} from '../config/studyDeskConfig';
import { TajweedText } from '../features/study/TajweedText';
import { useTajweedData } from '../hooks/useTajweedData';
import { audioQueueService } from '../services/audioQueueService';
import { dataService, resolvePlaylistItemStartLocation } from '../services/dataService';
import { computeHatimSummary, hatimStorage } from '../services/hatimStorage';
import { isUnitDueForReview, memorizationStorage } from '../services/memorizationStorage';
import { researchStorage } from '../services/researchStorage';
import { sfxService } from '../services/sfxService';
import { verseNotesStorage } from '../services/verseNotesStorage';
import { useAppStore } from '../store/useAppStore';
import type {
  ActiveSessionSnapshot,
  ClassicalHifzPlan,
  MemorizationUnit,
} from '../types/memorization';
import { RETENTION_STAGE_META } from '../types/memorization';
import type { AudioPlaylistItem } from '../types/quran';
import { formatSurahTitle } from '../utils/arabicUtils';
import {
  computeClassicalStats,
  resolveCurrentTurnLesson,
  TOTAL_MUSHAF_PAGES,
} from '../utils/classicalHifzUtils';
import {
  formatNumberTr,
  getSurahMap,
} from '../utils/poolUtils';

interface AyahPreviewData {
  surahNo: number;
  surahNameTr: string;
  surahNameAr: string;
  ayahNo: number;
  cuzNo: number;
  pageNo: number;
  arabicText: string;
  primaryMealId: string;
  primaryMealLabel: string;
  primaryMealText: string;
  secondaryMealId: string | null;
  secondaryMealLabel: string | null;
  secondaryMealText: string;
}

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

function toArabicIndicDigits(value: number): string {
  return String(value).replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)] ?? d);
}

const REFLECTION_VERSES = {
  kamer: {
    id: 'kamer' as const,
    tabLabel: 'İlahî Müjde · Kamer 17',
    kicker: 'İlahî Kolaylık ve Öğüt Çağrısı',
    arabic: 'وَلَقَدْ يَسَّرْنَا الْقُرْاٰنَ لِلذِّكْرِ فَهَلْ مِنْ مُدَّكِرٍ',
    meal: "Andolsun biz Kur'an'ı öğüt alınsın diye kolaylaştırdık. Ondan öğüt alan yok mu?",
    refShort: 'Kamer 54/17',
    contextNote: 'Surede 4 kez tekrarlanır',
    surah: 54,
    ayah: 17,
  },
  furkan: {
    id: 'furkan' as const,
    tabLabel: 'Nebevî Uyarı · Furkan 30',
    kicker: 'Mehcûr Bırakmama Bilinci',
    arabic: 'وَقَالَ الرَّسُولُ يَا رَبِّ اِنَّ قَوْمِي اتَّخَذُوا هٰذَا الْقُرْاٰنَ مَهْجُورًا',
    meal: "Peygamber der ki: Ey Rabbim! Kavmim bu Kur'an'ı büsbütün terk ettiler.",
    refShort: 'Furkan 25/30',
    contextNote: "Kur'an ile canlı bağ bilinci",
    surah: 25,
    ayah: 30,
  },
};

export const HomePage: React.FC = () => {
  const {
    settings,
    updateSettings,
    studyPool,
    studyProgress,
    audioPrefs,
    audioPlaylists,
    gamification,
    manifest,
    meta,
    isLoadingCore,
    coreError,
    retryCoreLoad,
    activateDemoData,
    poolStats,
    setActiveTab,
    navigateToStudy,
    navigateToExam,
    navigateToFihrist,
    navigateToMemorizeUnit,
    openPoolModal,
    openBookmarksDrawer,
    openHatimModal,
    openListeningDrawer,
    openVerseNoteModal,
    setSelectedVerseKey,
  } = useAppStore();

  const deskPrefs = settings.deskPrefs;
  const enabledDeskRowCount = useMemo(() => countEnabledDeskRows(deskPrefs), [deskPrefs]);
  const [isDeskCustomizeOpen, setIsDeskCustomizeOpen] = useState(false);

  const hatimState = useSyncExternalStore(hatimStorage.subscribe, hatimStorage.getSnapshot);
  const hatimSummary = useMemo(
    () => (hatimState.activePlan ? computeHatimSummary(hatimState.activePlan) : null),
    [hatimState.activePlan],
  );
  const personalVerseNotes = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getSnapshot,
  );
  const researchTopics = useSyncExternalStore(
    researchStorage.subscribe,
    researchStorage.getSnapshot,
  );
  const latestPersonalNote = personalVerseNotes[0] ?? null;

  // Tefekkür çerçevesi (mobilde kompakt sekme + tüm ekranlarda isteğe bağlı daraltma)
  const [activeReflectionTab, setActiveReflectionTab] = useState<'kamer' | 'furkan'>('kamer');
  const [isReflectionCollapsed, setIsReflectionCollapsed] = useState(false);
  // Mobilde (< lg) Odak Surelerim tek satırlık akordeon olarak açılır
  const [isMobileFocusSurahsOpen, setIsMobileFocusSurahsOpen] = useState(false);

  // Ezber durumu (Çalışma Masam için canlı okuma)
  const [memUnits, setMemUnits] = useState<MemorizationUnit[]>(() =>
    memorizationStorage.readUnitsSync(),
  );
  const [memActiveSession, setMemActiveSession] = useState<ActiveSessionSnapshot | null>(() =>
    memorizationStorage.readActiveSessionSync(),
  );
  const [classicalPlan, setClassicalPlan] = useState<ClassicalHifzPlan | null>(() =>
    memorizationStorage.readClassicalPlanSync(),
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      memorizationStorage.loadUnits(),
      memorizationStorage.loadActiveSession(),
      memorizationStorage.loadClassicalPlan(),
    ])
      .then(([units, session, plan]) => {
        if (!cancelled) {
          setMemUnits(units);
          setMemActiveSession(session);
          setClassicalPlan(plan);
        }
      })
      .catch(() => {
        // Senkron önbellek zaten yüklü
      });
    const unsubscribe = memorizationStorage.subscribe(() => {
      if (!cancelled) {
        setMemUnits(memorizationStorage.readUnitsSync());
        setMemActiveSession(memorizationStorage.readActiveSessionSync());
        setClassicalPlan(memorizationStorage.readClassicalPlanSync());
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Rastgele ayet önizleme durumu
  const [previewAyah, setPreviewAyah] = useState<AyahPreviewData | null>(null);
  const [isLoadingAyah, setIsLoadingAyah] = useState(false);
  const [ayahError, setAyahError] = useState<string | null>(null);
  const lastAyahIdRef = useRef<number | null>(null);

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const classicalStats = useMemo(
    () => (classicalPlan?.isActive ? computeClassicalStats(classicalPlan) : null),
    [classicalPlan],
  );

  // En güncel / aktif ezber kaydı özeti + SRS bugün tekrar sayısı
  const memorizationSummary = useMemo(() => {
    const dueUnits = memUnits.filter((u) => isUnitDueForReview(u));
    const dueAyahCount = dueUnits.reduce((sum, u) => sum + u.verseKeys.length, 0);

    if (memActiveSession) {
      const pct =
        memActiveSession.totalSteps > 0
          ? Math.min(
              100,
              Math.round(((memActiveSession.stepIndex + 1) / memActiveSession.totalSteps) * 100),
            )
          : 0;
      return {
        title: memActiveSession.unitTitle,
        detail: `Devam eden oturum · Adım ${memActiveSession.stepIndex + 1}/${memActiveSession.totalSteps} (%${pct})`,
        hasProgress: true,
        dueAyahCount,
        dueUnitCount: dueUnits.length,
        openClassicalTab: false,
      };
    }

    if (classicalPlan?.isActive) {
      const lesson = resolveCurrentTurnLesson(classicalPlan);
      const stats = computeClassicalStats(classicalPlan);
      return {
        title: lesson.isAllCompleted
          ? 'Klasik Hafızlık · 604 Sayfa Tamamlandı'
          : `Klasik Hafızlık · ${lesson.round}. Tur · ${lesson.juz}. Cüz (Sayfa ${lesson.hamPage})`,
        detail: `Has: ${stats.hasCount}/${TOTAL_MUSHAF_PAGES} Sayfa (%${stats.percent})${
          lesson.juzHasPages.length > 0
            ? ` · ${lesson.juz}. Cüzde ${lesson.juzHasPages.length} Has sayfa`
            : ''
        }`,
        hasProgress: true,
        dueAyahCount,
        dueUnitCount: dueUnits.length,
        openClassicalTab: true,
      };
    }

    if (memUnits.length > 0) {
      const sorted = [...memUnits].sort(
        (a, b) => (b.lastPracticedAt ?? b.createdAt) - (a.lastPracticedAt ?? a.createdAt),
      );
      const top = sorted[0];
      const stageLabel = RETENTION_STAGE_META[top.stage]?.label ?? top.stage;
      return {
        title: top.title,
        detail: `${top.verseKeys.length} ayet · ${stageLabel}${
          dueAyahCount > 0 ? ` · Bugün ${dueAyahCount} ayet tekrar zamanı` : ''
        }`,
        hasProgress: true,
        dueAyahCount,
        dueUnitCount: dueUnits.length,
        openClassicalTab: false,
      };
    }

    return {
      title: 'Ezber Çalışması',
      detail: 'Klasik 30 Cüz hafızlık veya sure/rükû bazlı ezber başlatın',
      hasProgress: false,
      dueAyahCount: 0,
      dueUnitCount: 0,
      openClassicalTab: false,
    };
  }, [memActiveSession, memUnits, classicalPlan]);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );

  const accuracyPercent = useMemo(() => {
    if (gamification.solvedCount <= 0) return null;
    return Math.round((gamification.correctCount / gamification.solvedCount) * 100);
  }, [gamification.solvedCount, gamification.correctCount]);

  const activePrimaryMealId = settings.primaryMealId || 'm1';
  const activeSecondaryMealId = settings.secondaryMealId || 'm2';
  const isDualMealActive =
    settings.mealDisplayMode === 'dual' || settings.preferredMeal === 'both';

  const previewTajweedSurahs = useMemo(
    () => (previewAyah ? [previewAyah.surahNo] : []),
    [previewAyah],
  );
  const {
    rules: previewTjRules,
    getVerseWords: getPreviewTjVerseWords,
  } = useTajweedData(previewTajweedSurahs, settings.tajweedEnabled);

  const resolveMealTextForAyah = useCallback(
    async (surahNo: number, ayahNo: number, mealId: string): Promise<string> => {
      if (mealId === 'm1' || mealId === 'm2') {
        const file = await dataService.getMealSurah(mealId, surahNo);
        return file.verses.find((v) => v.a === ayahNo)?.t ?? '';
      }
      await dataService.loadExtraMealsForSurah(surahNo);
      const extraVerse = dataService.getMealVerse(surahNo, ayahNo, mealId);
      if (extraVerse?.t) return extraVerse.t;
      const fallbackFile = await dataService.getMealSurah('m1', surahNo);
      return fallbackFile.verses.find((v) => v.a === ayahNo)?.t ?? '';
    },
    [],
  );

  // Havuzdan rastgele bir ayet seç ve aktif 27 meal tercihine göre yükle
  const fetchRandomAyahFromPool = useCallback(
    async (playSound = false) => {
      if (!meta) return;
      if (playSound) sfxService.play('click');

      const candidateSurahs =
        poolStats.effectiveSurahs.length > 0 ? poolStats.effectiveSurahs : [49, 31, 24, 17];
      const chosenSurahNo =
        candidateSurahs[Math.floor(Math.random() * candidateSurahs.length)] ?? 49;
      const surahInfo = surahMap.get(chosenSurahNo);

      setIsLoadingAyah(true);
      setAyahError(null);

      try {
        const primaryDef = findMealById(activePrimaryMealId, manifest);
        const secondaryDef = isDualMealActive
          ? findMealById(activeSecondaryMealId, manifest)
          : null;

        const arFile = await dataService.getArabicSurah(chosenSurahNo);
        if (!arFile.verses.length) {
          throw new Error('Bu surede görüntülenecek ayet bulunamadı.');
        }

        const readablePool = arFile.verses.filter(
          (v) => !v.mq && v.id !== lastAyahIdRef.current,
        );
        const poolToPick = readablePool.length > 0 ? readablePool : arFile.verses;
        const pickedAr = poolToPick[Math.floor(Math.random() * poolToPick.length)];

        const effectiveSecondaryDef =
          secondaryDef && secondaryDef.id !== primaryDef.id ? secondaryDef : null;

        const [primaryMealText, secondaryMealText] = await Promise.all([
          resolveMealTextForAyah(chosenSurahNo, pickedAr.a, primaryDef.id),
          effectiveSecondaryDef
            ? resolveMealTextForAyah(chosenSurahNo, pickedAr.a, effectiveSecondaryDef.id)
            : Promise.resolve(''),
        ]);

        lastAyahIdRef.current = pickedAr.id;
        setPreviewAyah({
          surahNo: chosenSurahNo,
          surahNameTr: surahInfo?.nameTr ?? `${chosenSurahNo}. Sure`,
          surahNameAr: surahInfo?.nameAr ?? '',
          ayahNo: pickedAr.a,
          cuzNo: pickedAr.c,
          pageNo: pickedAr.p,
          arabicText: pickedAr.t,
          primaryMealId: primaryDef.id,
          primaryMealLabel: primaryDef.label,
          primaryMealText,
          secondaryMealId: effectiveSecondaryDef ? effectiveSecondaryDef.id : null,
          secondaryMealLabel: effectiveSecondaryDef ? effectiveSecondaryDef.label : null,
          secondaryMealText,
        });
      } catch (err) {
        setAyahError(
          err instanceof Error ? err.message : 'Rastgele ayet yüklenirken bir hata oluştu.',
        );
      } finally {
        setIsLoadingAyah(false);
      }
    },
    [
      meta,
      manifest,
      poolStats.effectiveSurahs,
      surahMap,
      activePrimaryMealId,
      activeSecondaryMealId,
      isDualMealActive,
      resolveMealTextForAyah,
    ],
  );

  // Kullanıcı ayarlardan aktif meal veya tekli/ikili görünümü değiştirdiğinde mevcut önizleme ayetini senkronize et
  useEffect(() => {
    if (!previewAyah) return;
    const desiredPrimaryDef = findMealById(activePrimaryMealId, manifest);
    const desiredSecondaryDef = isDualMealActive
      ? findMealById(activeSecondaryMealId, manifest)
      : null;
    const desiredSecondaryId =
      desiredSecondaryDef && desiredSecondaryDef.id !== desiredPrimaryDef.id
        ? desiredSecondaryDef.id
        : null;

    if (
      previewAyah.primaryMealId === desiredPrimaryDef.id &&
      previewAyah.secondaryMealId === desiredSecondaryId
    ) {
      return;
    }

    let cancelled = false;
    const { surahNo, ayahNo } = previewAyah;

    Promise.all([
      resolveMealTextForAyah(surahNo, ayahNo, desiredPrimaryDef.id),
      desiredSecondaryId
        ? resolveMealTextForAyah(surahNo, ayahNo, desiredSecondaryId)
        : Promise.resolve(''),
    ])
      .then(([primaryMealText, secondaryMealText]) => {
        if (cancelled) return;
        setPreviewAyah((prev) => {
          if (!prev || prev.surahNo !== surahNo || prev.ayahNo !== ayahNo) return prev;
          return {
            ...prev,
            primaryMealId: desiredPrimaryDef.id,
            primaryMealLabel: desiredPrimaryDef.label,
            primaryMealText,
            secondaryMealId: desiredSecondaryId,
            secondaryMealLabel: desiredSecondaryId ? desiredSecondaryDef?.label ?? null : null,
            secondaryMealText,
          };
        });
      })
      .catch(() => {
        // sessizce koru
      });

    return () => {
      cancelled = true;
    };
  }, [
    activePrimaryMealId,
    activeSecondaryMealId,
    isDualMealActive,
    manifest,
    previewAyah,
    resolveMealTextForAyah,
  ]);

  const poolSignature = useMemo(
    () => poolStats.effectiveSurahs.join(','),
    [poolStats.effectiveSurahs],
  );

  useEffect(() => {
    if (!meta || isLoadingCore) return;
    fetchRandomAyahFromPool(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, isLoadingCore, poolSignature]);

  const handleStartExam = () => {
    navigateToExam();
  };

  const handleFocusSurahAction = (surahNo: number, targetTab: 'reader' | 'exam') => {
    if (targetTab === 'exam') {
      navigateToExam({ surahNo });
    } else {
      sfxService.play('click');
      navigateToStudy({
        surah: surahNo,
        ayah: 1,
        viewMode: 'cards',
        ensureMealVisible: true,
      });
    }
  };

  const handleOpenPoolReader = () => {
    sfxService.play('click');
    const last = studyProgress.lastRead;
    if (last && poolStats.effectiveSurahs.includes(last.surah)) {
      navigateToStudy({
        surah: last.surah,
        ayah: last.ayah,
        page: last.page,
        viewMode: last.viewMode,
        ...(last.viewMode === 'mushaf' ? { ensureArabicVisible: true } : {}),
      });
      return;
    }
    const firstSurah = poolStats.effectiveSurahs[0];
    if (firstSurah) {
      navigateToStudy({ surah: firstSurah, ayah: 1, ensureMealVisible: true });
    } else {
      setActiveTab('reader');
    }
  };

  const handleListenActivePool = () => {
    sfxService.play('click');
    if (!meta || !manifest || poolStats.effectiveSurahs.length === 0) {
      openListeningDrawer({ initialTab: 'quick' });
      return;
    }
    const items: AudioPlaylistItem[] = poolStats.effectiveSurahs.map((sNo) => ({
      id: `pool_s${sNo}`,
      type: 'surah',
      label: surahMap.get(sNo)?.nameTr ?? `${sNo}. Sure`,
      surah: sNo,
    }));
    if (audioPrefs.showTextOnStart && items[0]) {
      navigateToStudy(resolvePlaylistItemStartLocation(items[0], meta));
    }
    void audioQueueService.startSegmentQueue({
      items,
      title: `Aktif Çalışma Havuzu (${items.length} Sure)`,
      context: 'playlist',
      contextKey: `pool:${poolSignature}`,
      manifest,
      meta,
      prefs: audioPrefs,
    });
  };

  const handlePlayPreviewAyah = () => {
    if (!previewAyah || !manifest || !meta) return;
    sfxService.play('click');
    setSelectedVerseKey(`${previewAyah.surahNo}:${previewAyah.ayahNo}`);
    void audioQueueService.jumpToSurahAyah(
      previewAyah.surahNo,
      previewAyah.ayahNo,
      manifest,
      meta,
      audioPrefs,
    );
  };

  const previewAyahHasNote = useMemo(() => {
    if (!previewAyah) return false;
    return personalVerseNotes.some(
      (n) => n.surah === previewAyah.surahNo && n.ayah === previewAyah.ayahNo,
    );
  }, [personalVerseNotes, previewAyah]);

  // ============================================================================
  // Ağ Hatası Ekranı (+ Demo / Örnek Veri Seçeneği)
  // ============================================================================
  if (coreError && !meta) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <div className="surface-card rounded-2xl p-6 sm:p-8 text-center">
          <div
            className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#EF4444' }}
          >
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold mb-2">Veri Kaynağına Ulaşılamadı</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
            Kur&apos;an-ı Kerim ve soru bankası verileri şu anda yüklenemedi. İnternet bağlantınızı
            kontrol edip yeniden deneyebilir veya örnek veriyle platformu inceleyebilirsiniz.
          </p>
          <p
            className="text-xs px-3 py-2 rounded-lg mb-6 break-words"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-muted)',
            }}
          >
            {coreError}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={retryCoreLoad}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tekrar Dene</span>
            </button>
            <button
              type="button"
              onClick={activateDemoData}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <span>Örnek Veri ile Devam Et</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Yükleme İskeleti
  // ============================================================================
  if (isLoadingCore && !meta) {
    return (
      <div className="space-y-4 animate-pulse">
        <div
          className="h-44 rounded-2xl border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            className="h-80 rounded-2xl border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          />
          <div
            className="h-80 rounded-2xl border"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          />
        </div>
      </div>
    );
  }

  // Aktif havuzdaki seçili sure çipleri (ilk 6 sure + kalan)
  const activePoolSurahChips = poolStats.effectiveSurahs.slice(0, 6).map((no) => ({
    no,
    shortName: surahMap.get(no)?.shortNameTr ?? `${no}. Sure`,
  }));
  const remainingPoolSurahCount = Math.max(0, poolStats.effectiveSurahs.length - 6);

  const lastRead = studyProgress.lastRead;
  const lastSurahMeta = lastRead ? surahMap.get(lastRead.surah) : undefined;
  const lastReadModeLabel = lastRead
    ? lastRead.viewMode === 'mushaf'
      ? 'Mushaf'
      : lastRead.viewMode === 'book'
        ? 'Kitap'
        : 'Kartlar'
    : null;
  const hatimBookmark = studyProgress.pageBookmarks.find((b) => b.isHatim);

  const hasSecondaryDeskRows =
    deskPrefs.showHatimRow ||
    deskPrefs.showMemorizationRow ||
    deskPrefs.showListeningRow ||
    deskPrefs.showNotesRow;

  const renderReflectionVerseCard = (
    verse: typeof REFLECTION_VERSES.kamer | typeof REFLECTION_VERSES.furkan,
    tone: 'primary' | 'accent',
  ) => (
    <button
      type="button"
      onClick={() => {
        sfxService.play('click');
        navigateToStudy({
          surah: verse.surah,
          ayah: verse.ayah,
          viewMode: 'cards',
          ensureMealVisible: true,
        });
      }}
      className="w-full text-left rounded-xl border p-3 sm:p-4 flex flex-col justify-between gap-2 sm:gap-3 transition-all hover:border-[var(--brand-primary)]/45 cursor-pointer group"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 52%, var(--bg-surface))',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Üst Satır: Dingin Konu Etiketi + Sağda Ayet Künyesi */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className="font-bold tracking-tight truncate"
          style={{
            color:
              tone === 'primary' ? 'var(--brand-primary-text)' : 'var(--brand-accent-text)',
          }}
        >
          {verse.kicker}
        </span>
        <span
          className="font-bold tabular-nums whitespace-nowrap shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          {verse.refShort}
        </span>
      </div>

      {/* Orta Alan: Tam Ortalı Serlevha Arapça + Klasik Durak Gülü + Ortalı Meal */}
      <div className="py-0.5 sm:py-1.5 space-y-1.5 sm:space-y-2.5 text-center">
        <p
          dir="rtl"
          lang="ar"
          className="text-center leading-[1.95] sm:leading-[2.15] text-[18px] sm:text-[23px] break-words"
          style={{
            fontFamily: '"Scheherazade New", "Amiri Quran", serif',
            color: 'var(--text-primary)',
          }}
        >
          {verse.arabic}{' '}
          <span
            className="inline-block text-[0.82em] align-middle mx-0.5"
            style={{
              color:
                tone === 'primary' ? 'var(--brand-primary-text)' : 'var(--brand-accent-text)',
            }}
          >
            ﴿{toArabicIndicDigits(verse.ayah)}﴾
          </span>
        </p>

        <p
          className="text-[11.5px] sm:text-[13px] leading-snug sm:leading-relaxed text-center max-w-[46ch] mx-auto"
          style={{ color: 'var(--text-secondary)' }}
        >
          {verse.meal}
        </p>
      </div>

      {/* Eşit Alt Taban Satırı */}
      <div
        className="mt-auto pt-2 sm:pt-2.5 border-t flex items-center justify-between gap-2 text-[11px]"
        style={{
          borderColor: 'color-mix(in srgb, var(--border-subtle) 75%, transparent)',
          color: 'var(--text-muted)',
        }}
      >
        <span className="truncate font-medium">{verse.contextNote}</span>
        <span
          className="inline-flex items-center gap-1 font-bold whitespace-nowrap shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: 'var(--brand-primary-text)' }}
        >
          <span>Ayeti İncele</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </span>
      </div>
    </button>
  );

  const activeMobileVerse =
    activeReflectionTab === 'kamer' ? REFLECTION_VERSES.kamer : REFLECTION_VERSES.furkan;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ====================================================================
          1. Tefekkür & İlahî Çağrı — Mushaf Serlevha Kartı (50% / 50% Eksen)
          ==================================================================== */}
      <section aria-label="Tefekkür ve İlahî Çağrı">
        <div
          className="surface-card rounded-2xl overflow-hidden"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Çok hafif, tek tonlu zümrüt üst ışık dokunuşu */}
          <div
            aria-hidden="true"
            className="h-[1.5px] w-full"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 34%, transparent)',
            }}
          />

          <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3.5">
            {/* Kompakt Üst Başlık Satırı + Daralt / Aç İkonu */}
            <div className="flex items-center sm:items-start justify-between gap-2.5">
              <div className="min-w-0 space-y-0.5">
                <p
                  className="hidden sm:block text-[11px] font-bold tracking-tight"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  Muallimun Kur&apos;an, Meal &amp; Araştırma
                </p>
                <h2 className="text-sm sm:text-lg font-extrabold tracking-tight leading-snug text-balance">
                  Tefekkür &amp; İlahî Çağrı
                </h2>
                {!isReflectionCollapsed && (
                  <p
                    className="hidden sm:block text-xs sm:text-[13px] leading-relaxed max-w-4xl pt-0.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Kur&apos;an-ı Kerim, anlaşılması ve öğüt alınması kolaylaştırılmış bir hidayet
                    rehberidir; onu lafzı ve manasıyla hayatımızın merkezinde tutmak sorumluluğumuzdur.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsReflectionCollapsed((prev) => !prev);
                }}
                aria-expanded={!isReflectionCollapsed}
                aria-label={
                  isReflectionCollapsed
                    ? 'Tefekkür çerçevesini genişlet'
                    : 'Tefekkür çerçevesini daralt'
                }
                title={isReflectionCollapsed ? 'Tefekkür ayetlerini aç' : 'Tefekkür ayetlerini gizle'}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center cursor-pointer shrink-0 transition-colors hover:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {isReflectionCollapsed ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Ayet Kartları (Masaüstünde %50 / %50; mobilde kompakt 2'li sekme) */}
            {!isReflectionCollapsed && (
              <>
                <div className="hidden lg:grid lg:grid-cols-2 gap-4 items-stretch">
                  {renderReflectionVerseCard(REFLECTION_VERSES.kamer, 'primary')}
                  {renderReflectionVerseCard(REFLECTION_VERSES.furkan, 'accent')}
                </div>

                <div className="lg:hidden space-y-2">
                  <div
                    className="grid grid-cols-2 gap-1 p-0.5 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                    role="tablist"
                    aria-label="Tefekkür ayetleri"
                  >
                    {(
                      [
                        { id: 'kamer', label: REFLECTION_VERSES.kamer.tabLabel },
                        { id: 'furkan', label: REFLECTION_VERSES.furkan.tabLabel },
                      ] as const
                    ).map((tab) => {
                      const active = activeReflectionTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            sfxService.play('click');
                            setActiveReflectionTab(tab.id);
                          }}
                          className="min-h-[32px] px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate"
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

                  {renderReflectionVerseCard(
                    activeMobileVerse,
                    activeReflectionTab === 'kamer' ? 'primary' : 'accent',
                  )}
                </div>
              </>
            )}
          </div>

          {/* Alt 4'lü Ferah Özet Şeridi (Orta dikey çizgisi tam %50 merkezde) */}
          <div
            className="grid grid-cols-2 lg:grid-cols-4 border-t"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 32%, var(--bg-surface))',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div
              className="px-4 py-2.5 flex items-center justify-between gap-2 border-b lg:border-b-0 border-r"
              style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 80%, transparent)' }}
            >
              <span
                className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                <Flame
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--brand-accent-text)' }}
                />
                <span>Günlük Seri</span>
              </span>
              <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                {formatNumberTr(gamification.streakDays)} gün
              </span>
            </div>

            {deskPrefs.showPoolAndExamSection && gamification.solvedCount > 0 ? (
              <>
                <div
                  className="px-4 py-2.5 flex items-center justify-between gap-2 border-b lg:border-b-0 lg:border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 80%, transparent)' }}
                >
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Star
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Toplam Puan</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(gamification.totalXp)}
                  </span>
                </div>

                <div
                  className="px-4 py-2.5 flex items-center justify-between gap-2 border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 80%, transparent)' }}
                >
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <CheckCircle2
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Çözülen</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(gamification.solvedCount)} soru
                  </span>
                </div>

                <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Target
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Doğruluk</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                    {accuracyPercent !== null ? `%${accuracyPercent}` : '—'}
                  </span>
                </div>
              </>
            ) : !deskPrefs.showPoolAndExamSection && gamification.solvedCount > 0 ? (
              <>
                <div
                  className="px-4 py-2.5 flex items-center justify-between gap-2 border-b lg:border-b-0 lg:border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 80%, transparent)' }}
                >
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Star
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Toplam Puan</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(gamification.totalXp)}
                  </span>
                </div>

                <div
                  className="px-4 py-2.5 flex items-center justify-between gap-2 border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 80%, transparent)' }}
                >
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <BookOpenCheck
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Hatim</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                    {hatimSummary ? `%${hatimSummary.percent}` : 'Plan yok'}
                  </span>
                </div>

                <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <BookOpen
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Son Konum</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                    {lastRead ? `Sayfa ${lastRead.page}` : 'Hazır'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div
                  className="px-4 py-2.5 flex items-center justify-between gap-2 border-b lg:border-b-0 lg:border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 80%, transparent)' }}
                >
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <BookOpen
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Son Konum</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap truncate">
                    {lastRead
                      ? `${lastSurahMeta?.shortNameTr ?? ''} · s.${lastRead.page}`.replace(
                          /^\s*·\s*/,
                          '',
                        )
                      : 'İlk Okuma'}
                  </span>
                </div>

                <div
                  className="px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 80%, transparent)' }}
                >
                  {hatimSummary ? (
                    <>
                      <span
                        className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <BookOpenCheck
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: 'var(--brand-primary-text)' }}
                        />
                        <span>Hatim</span>
                      </span>
                      <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                        {formatNumberTr(hatimSummary.completedCount)}/604 Sayfa
                      </span>
                    </>
                  ) : classicalStats ? (
                    <>
                      <span
                        className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <BookMarked
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: 'var(--brand-primary-text)' }}
                        />
                        <span>Hafızlık</span>
                      </span>
                      <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                        {formatNumberTr(classicalStats.hasCount)}/604 Has
                      </span>
                    </>
                  ) : memUnits.length > 0 ? (
                    <>
                      <span
                        className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <BookMarked
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: 'var(--brand-primary-text)' }}
                        />
                        <span>Ezber</span>
                      </span>
                      <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                        {formatNumberTr(memUnits.length)} Bölüm
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <BookOpenCheck
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: 'var(--brand-primary-text)' }}
                        />
                        <span>Okuma Hedefi</span>
                      </span>
                      <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                        30 Cüz
                      </span>
                    </>
                  )}
                </div>

                <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold flex items-center gap-1.5 truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Bookmark
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-accent-text)' }}
                    />
                    <span>Not / Ayraç</span>
                  </span>
                  <span className="text-xs sm:text-[13px] font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(personalVerseNotes.length)} Not ·{' '}
                    {formatNumberTr(
                      studyProgress.pageBookmarks.length + studyProgress.bookmarkedAyahIds.length,
                    )}{' '}
                    Ayraç
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* PWA Kurulum Önerisi (Sadece kurulabilir tarayıcı / iOS'ta ve kapatılmadıysa görünür) */}
      <PwaInstallControl variant="banner" />

      {/* ====================================================================
          2. Simetrik %50 / %50 Ana Çalışma Izgarası
             Sol: Çalışma Masam · Sağ: Havuzdan Bir Ayet + Aktif Çalışma Havuzum
          ==================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* SOL SÜTUN (%50): Günlük Takip (Kişiselleştirilebilir Odak Satırları) */}
        <div className="surface-card rounded-2xl p-3.5 sm:p-5 flex flex-col gap-3 sm:gap-3.5">
          {/* Üst Başlık + Hata Kampı + Özelleştir */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 className="text-sm sm:text-lg font-extrabold tracking-tight truncate">
                    Günlük Takip
                  </h3>
                  {deskPrefs.profile !== 'all' && (
                    <span
                      className="text-[11px] font-bold whitespace-nowrap"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      · {getStudyDeskProfileLabel(deskPrefs.profile)}
                    </span>
                  )}
                </div>
                <p
                  className="hidden sm:block text-xs truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Kaldığınız okuma konumu ve kişisel ders rutininiz
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {deskPrefs.showPoolAndExamSection && gamification.wrongQuestionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setActiveTab('mistakes');
                  }}
                  className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderColor: 'rgba(239, 68, 68, 0.25)',
                    color: '#DC2626',
                  }}
                >
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  <span>Hata Kampı ({formatNumberTr(gamification.wrongQuestionIds.length)})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsDeskCustomizeOpen((prev) => !prev);
                }}
                aria-expanded={isDeskCustomizeOpen}
                aria-controls="study-desk-customizer"
                className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isDeskCustomizeOpen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isDeskCustomizeOpen
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: isDeskCustomizeOpen
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-secondary)',
                }}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>Özelleştir</span>
              </button>
            </div>
          </div>

          {/* Çalışma Masamı Kişiselleştir Paneli (4 Hazır Profil + 6 Modül Anahtarı) */}
          {isDeskCustomizeOpen && (
            <div
              id="study-desk-customizer"
              className="rounded-xl border p-3.5 space-y-3"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 55%, var(--bg-surface))',
                borderColor: 'color-mix(in srgb, var(--brand-primary) 40%, var(--border-subtle))',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs sm:text-sm font-extrabold">
                    Çalışma Masamı Kişiselleştir
                  </h4>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Hazır bir odak profili seçin veya görmek istediğiniz modülleri tek tek açıp
                    kapatın.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setIsDeskCustomizeOpen(false);
                  }}
                  aria-label="Özelleştirme panelini kapat"
                  className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 4 Hazır Profil */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {STUDY_DESK_PROFILES.map((prof) => {
                  const active = deskPrefs.profile === prof.id;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({ deskPrefs: applyStudyDeskProfile(prof.id) });
                      }}
                      title={prof.description}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-xl border text-[11px] font-bold text-center transition-colors cursor-pointer leading-snug"
                      style={{
                        backgroundColor: active
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface)',
                        borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                      }}
                    >
                      {prof.shortLabel}
                    </button>
                  );
                })}
              </div>

              {/* 6 Modül Aç/Kapat Anahtarı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {STUDY_DESK_TOGGLES.map((item) => {
                  const checked = deskPrefs[item.key];
                  const isLastActive = checked && enabledDeskRowCount <= 1;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      disabled={isLastActive}
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({
                          deskPrefs: toggleStudyDeskRow(deskPrefs, item.key),
                        });
                      }}
                      title={
                        isLastActive
                          ? 'En az bir modül açık kalmalıdır'
                          : item.description
                      }
                      className="min-h-[42px] px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer disabled:opacity-65 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: checked ? 'var(--bg-surface)' : 'transparent',
                        borderColor: checked
                          ? 'color-mix(in srgb, var(--brand-primary) 35%, var(--border-subtle))'
                          : 'var(--border-subtle)',
                      }}
                    >
                      <div className="min-w-0">
                        <span className="block text-xs font-bold truncate">{item.label}</span>
                        <span
                          className="block text-[10.5px] truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {item.description}
                        </span>
                      </div>
                      <span
                        className="w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                        style={{
                          backgroundColor: checked
                            ? 'var(--brand-primary)'
                            : 'var(--border-strong)',
                          justifyContent: checked ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 1. Birincil Odak Kartı: Okuma — Kaldığım Yer (Hafif Zümrüt Vurgulu Özel Kart) */}
          {deskPrefs.showReadingRow && (
            <div
              className="rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5.5%, var(--bg-surface))',
                borderColor: 'color-mix(in srgb, var(--brand-primary) 26%, var(--border-subtle))',
              }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: 'var(--brand-primary)',
                    color: '#FFFFFF',
                  }}
                >
                  <BookOpen className="w-4 h-4" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                    <span
                      className="font-bold tracking-tight"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Son Okuma Konumu
                    </span>
                    {!deskPrefs.showHatimRow && hatimSummary && (
                      <button
                        type="button"
                        onClick={openHatimModal}
                        title="30 Cüz Hatim Planlayıcısını aç"
                        className="font-bold tabular-nums hover:underline cursor-pointer"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        · Hatim %{hatimSummary.percent} ({hatimSummary.todayCompletedCount}/
                        {hatimSummary.todayTargetPages} s.)
                      </button>
                    )}
                  </div>
                  <p className="text-sm sm:text-[15px] font-extrabold tracking-tight truncate">
                    {lastRead
                      ? `${lastRead.surah}. ${formatSurahTitle(lastSurahMeta?.nameTr, lastRead.surah)}`
                      : 'Okumaya Başla'}
                  </p>
                  <p
                    className="text-xs tabular-nums leading-snug break-words"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {lastRead ? (
                      <>
                        {lastRead.ayah}. Ayet · S.{lastRead.page} · {lastReadModeLabel}
                        {hatimBookmark ? ` · Hatim S.${hatimBookmark.page}` : ''}
                      </>
                    ) : (
                      'Kaldığınız yer otomatik olarak burada kaydedilir'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openBookmarksDrawer}
                  className="min-h-[36px] px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Bookmark
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--brand-accent-text)' }}
                  />
                  <span>
                    Ayraçlar
                    {studyProgress.pageBookmarks.length > 0
                      ? ` (${studyProgress.pageBookmarks.length})`
                      : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    if (lastRead) {
                      navigateToStudy({
                        surah: lastRead.surah,
                        ayah: lastRead.ayah,
                        page: lastRead.page,
                        viewMode: lastRead.viewMode,
                        ...(lastRead.viewMode === 'mushaf' ? { ensureArabicVisible: true } : {}),
                      });
                    } else {
                      handleOpenPoolReader();
                    }
                  }}
                  className="flex-1 sm:flex-initial min-h-[36px] px-3.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap transition-opacity hover:opacity-95"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <span>Okumaya Devam Et</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            </div>
          )}

          {/* Diğer Odak Satırları — Temiz Yüzey Üzerinde İnce Çizgisel Ayırıcılarla (Kutu içinde kutu yok) */}
          {hasSecondaryDeskRows && (
            <div className="flex-1 flex flex-col justify-between divide-y divide-[var(--border-subtle)]/70">
              {/* Satır 2: 30 Cüz Hatim Planım */}
              {deskPrefs.showHatimRow && (
                <div className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <BookOpenCheck className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-xs sm:text-[13.5px] font-bold truncate">
                          {hatimSummary
                            ? `${hatimState.activePlan?.title || '30 Cüz Hatim'} · %${hatimSummary.percent}`
                            : '30 Cüz Hatim'}
                        </span>
                        {hatimSummary && (
                          <span
                            className="text-[11px] font-bold tabular-nums whitespace-nowrap"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            {hatimSummary.isTodayQuotaMet
                              ? '· Bugün tamam'
                              : `· ${hatimSummary.todayRemainingPages} s. kaldı`}
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[11.5px] tabular-nums truncate mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {hatimSummary ? (
                          <>
                            {hatimSummary.completedCount}/604 Sayfa ·{' '}
                            {hatimSummary.completedJuzCount}/30 Cüz · Bugün{' '}
                            {hatimSummary.todayCompletedCount}/{hatimSummary.todayTargetPages} s.
                          </>
                        ) : hatimState.history.length > 0 ? (
                          `Tamamlanan hatim: ${hatimState.history.length} · Yeni plan oluşturun`
                        ) : (
                          'Günlük sayfa hedefi veya serbest cüz takibiyle hatim planlayın'
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openHatimModal();
                    }}
                    className="min-w-[100px] min-h-[34px] px-3 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: hatimSummary
                        ? 'color-mix(in srgb, var(--brand-primary) 50%, var(--border-subtle))'
                        : 'var(--border-subtle)',
                      color: hatimSummary ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                    }}
                  >
                    <span>{hatimSummary ? 'Devam Et' : 'Planla'}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              )}

              {/* Satır 3: Ezber & Hafızlık */}
              {deskPrefs.showMemorizationRow && (
                <div className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <BookMarked className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-xs sm:text-[13.5px] font-bold truncate">
                          {memorizationSummary.hasProgress
                            ? memorizationSummary.title
                            : 'Ezber & Hafızlık'}
                        </span>
                        {memorizationSummary.dueAyahCount > 0 && (
                          <span
                            className="text-[11px] font-bold tabular-nums whitespace-nowrap"
                            style={{ color: 'var(--brand-accent-text)' }}
                          >
                            · {memorizationSummary.dueAyahCount} tekrar zamanı
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[11.5px] tabular-nums truncate mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {memorizationSummary.detail}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      if (memorizationSummary.openClassicalTab) {
                        navigateToMemorizeUnit(undefined, false, 'classical');
                      } else {
                        setActiveTab('memorize');
                      }
                    }}
                    className="min-w-[100px] min-h-[34px] px-3 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span>{memorizationSummary.hasProgress ? 'Devam Et' : 'Başla'}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              )}

              {/* Satır 4: Dinleme & Hızlı Çalma Listeleri */}
              {deskPrefs.showListeningRow && (
                <div className="py-3 first:pt-1 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <ListMusic className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="text-xs sm:text-[13.5px] font-bold">
                            Dinleme &amp; Listeler
                          </span>
                          <span
                            className="text-[11px] font-medium truncate"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            · {activeReciter?.shortLabel ?? 'Kurrâ'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openListeningDrawer({ initialTab: 'playlists' });
                      }}
                      className="min-w-[100px] min-h-[34px] px-3 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span>Listeler</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>

                  {meta && manifest && audioPlaylists.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:pl-11">
                      {audioPlaylists.slice(0, 4).map((playlist) => (
                        <button
                          key={playlist.id}
                          type="button"
                          disabled={playlist.items.length === 0}
                          onClick={() => {
                            if (!playlist.items.length) return;
                            sfxService.play('click');
                            if (audioPrefs.showTextOnStart) {
                              navigateToStudy(
                                resolvePlaylistItemStartLocation(playlist.items[0], meta),
                              );
                            }
                            void audioQueueService.startSegmentQueue({
                              items: playlist.items,
                              title: playlist.name,
                              context: 'playlist',
                              contextKey: `playlist:${playlist.id}`,
                              manifest,
                              meta,
                              prefs: audioPrefs,
                            });
                          }}
                          title={`${playlist.name} listesini dinle`}
                          className="min-w-0 min-h-[32px] px-2.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors hover:border-[var(--brand-primary)]/45 hover:bg-[var(--brand-primary-soft)]/60 disabled:opacity-45 text-left"
                          style={{
                            backgroundColor:
                              'color-mix(in srgb, var(--bg-surface-soft) 72%, var(--bg-surface))',
                            borderColor: 'color-mix(in srgb, var(--border-subtle) 85%, transparent)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Play
                            className="w-2.5 h-2.5 fill-current shrink-0"
                            style={{ color: 'var(--brand-primary-text)' }}
                          />
                          <span className="truncate">{playlist.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Satır 5: Son Kişisel Ayet Notlarım & Defterim */}
              {deskPrefs.showNotesRow && (
                <div className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <StickyNote className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-xs sm:text-[13.5px] font-bold truncate">
                          {latestPersonalNote
                            ? `${surahMap.get(latestPersonalNote.surah)?.nameTr ?? `${latestPersonalNote.surah}. Sure`} ${latestPersonalNote.ayah}. Ayet`
                            : 'Notlar & Defterim'}
                        </span>
                        <span
                          className="text-[11px] font-semibold tabular-nums whitespace-nowrap"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          · {formatNumberTr(personalVerseNotes.length)} Not ·{' '}
                          {formatNumberTr(researchTopics.length)} Konu
                        </span>
                      </div>
                      <p
                        className="text-[11.5px] truncate mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {latestPersonalNote
                          ? latestPersonalNote.text
                          : 'Okuma sırasında ayetlere kişisel tefekkür notları ekleyin'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      navigateToFihrist({
                        subTab: 'notebook',
                        notebookSubTab: personalVerseNotes.length > 0 ? 'notes' : 'topics',
                      });
                    }}
                    className="min-w-[100px] min-h-[34px] px-3 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span>Aç</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SAĞ SÜTUN (%50): Seçkiden Bir Ayet (Üst · flex-1) + Odak Surelerim (Alt) */}
        <div className="flex flex-col gap-3 sm:gap-4 h-full">
          {/* Üst Sağ Kart: Tam Donanımlı Seçkiden Bir Ayet */}
          <div className="surface-card rounded-2xl p-3.5 sm:p-5 flex-1 flex flex-col justify-between gap-3">
            {/* Üst Başlık Satırı */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-lg font-extrabold tracking-tight">
                  Seçkiden Bir Ayet
                </h3>
                {previewAyah && (
                  <p
                    className="text-xs tabular-nums truncate mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {previewAyah.surahNameTr} · {previewAyah.ayahNo}. Ayet · {previewAyah.cuzNo}.
                    Cüz
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchRandomAyahFromPool(true)}
                disabled={isLoadingAyah}
                aria-label="Havuzdan yeni rastgele ayet getir"
                className="min-h-[36px] px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer hover:border-[var(--brand-primary)] disabled:opacity-50 shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isLoadingAyah ? 'animate-spin' : ''}`}
                />
                <span className="whitespace-nowrap">Yeni Ayet</span>
              </button>
            </div>

            {/* Orta Sahne: Arapça + Meal Tek Zarif Mushaf Çerçevesinde Bütünlüklü */}
            <div className="flex-1 flex flex-col justify-center">
              {ayahError ? (
                <div
                  className="p-4 rounded-xl border text-sm text-center"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 50%, var(--bg-surface))',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {ayahError}
                </div>
              ) : !previewAyah ? (
                <div
                  className="rounded-xl border px-5 py-8 space-y-3 animate-pulse"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 50%, var(--bg-surface))',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div
                    className="h-7 rounded-lg w-4/5 mx-auto"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  />
                  <div
                    className="h-px w-12 mx-auto"
                    style={{ backgroundColor: 'var(--border-subtle)' }}
                  />
                  <div
                    className="h-4 rounded w-5/6 mx-auto"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  />
                  <div
                    className="h-4 rounded w-2/3 mx-auto"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  />
                </div>
              ) : (
                <div
                  className="rounded-xl border px-4 sm:px-5 py-5 flex flex-col items-center justify-center text-center"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 48%, var(--bg-surface))',
                    borderColor: 'color-mix(in srgb, var(--border-subtle) 85%, transparent)',
                  }}
                >
                  {/* Ortalı Arapça Ayet Metni + Klasik Mushaf Durak Gülü */}
                  {(() => {
                    const tjWords = settings.tajweedEnabled
                      ? getPreviewTjVerseWords(previewAyah.surahNo, previewAyah.ayahNo)
                      : null;
                    const arabicDisplaySize = Math.min(Math.max(settings.arabicFontSize, 22), 32);
                    const rosette = (
                      <span
                        className="inline-block text-[0.78em] align-middle mx-1"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        ﴿{toArabicIndicDigits(previewAyah.ayahNo)}﴾
                      </span>
                    );

                    if (tjWords && tjWords.length > 0 && previewTjRules) {
                      return (
                        <p
                          dir="rtl"
                          lang="ar"
                          className="arabic-tajweed text-center break-words max-w-full"
                          style={{
                            fontSize: `${arabicDisplaySize}px`,
                            lineHeight: 2.2,
                            color: 'var(--text-primary)',
                          }}
                        >
                          <TajweedText
                            words={tjWords}
                            rules={previewTjRules}
                            theme={settings.theme}
                            surahNo={previewAyah.surahNo}
                            ayahNo={previewAyah.ayahNo}
                          />
                          {rosette}
                        </p>
                      );
                    }
                    return (
                      <p
                        dir="rtl"
                        lang="ar"
                        className="arabic-text text-center break-words max-w-full"
                        style={{
                          fontSize: `${arabicDisplaySize}px`,
                          lineHeight: 2.15,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {previewAyah.arabicText}
                        {rosette}
                      </p>
                    );
                  })()}

                  {/* Zarif İnce Ayırıcı Çizgi */}
                  <div
                    aria-hidden="true"
                    className="w-12 h-px mx-auto my-3.5"
                    style={{ backgroundColor: 'var(--border-strong)' }}
                  />

                  {/* Meal Alanı (Tekli veya İkili Meal Destekli) */}
                  <div className="space-y-3 w-full max-w-[54ch] mx-auto">
                    {previewAyah.primaryMealText &&
                      (() => {
                        const pres = getMealTextPresentation(
                          findMealById(previewAyah.primaryMealId, manifest),
                          settings.turkishFontSize,
                        );
                        return (
                          <div className="space-y-1">
                            <p
                              className="text-[11px] font-bold"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              {previewAyah.primaryMealLabel}
                            </p>
                            <p
                              dir={pres.dir}
                              lang={pres.lang}
                              className={`${pres.className} text-center leading-relaxed`}
                              style={{
                                fontSize: `${Math.min(pres.fontSizePx, 16)}px`,
                                ...(pres.fontFamily ? { fontFamily: pres.fontFamily } : {}),
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {previewAyah.primaryMealText}
                            </p>
                          </div>
                        );
                      })()}

                    {previewAyah.secondaryMealId &&
                      previewAyah.secondaryMealLabel &&
                      previewAyah.secondaryMealText &&
                      (() => {
                        const pres = getMealTextPresentation(
                          findMealById(previewAyah.secondaryMealId, manifest),
                          settings.turkishFontSize,
                        );
                        return (
                          <div
                            className="pt-2.5 border-t space-y-1"
                            style={{
                              borderColor: 'color-mix(in srgb, var(--border-subtle) 75%, transparent)',
                            }}
                          >
                            <p
                              className="text-[11px] font-bold"
                              style={{ color: 'var(--brand-accent-text)' }}
                            >
                              {previewAyah.secondaryMealLabel}
                            </p>
                            <p
                              dir={pres.dir}
                              lang={pres.lang}
                              className={`${pres.className} text-center leading-relaxed`}
                              style={{
                                fontSize: `${Math.min(pres.fontSizePx, 15)}px`,
                                ...(pres.fontFamily ? { fontFamily: pres.fontFamily } : {}),
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {previewAyah.secondaryMealText}
                            </p>
                          </div>
                        );
                      })()}
                  </div>
                </div>
              )}
            </div>

            {/* Alt Aksiyon Çubuğu: ▶ Dinle · 📝 Not Ekle · Mushaf'ta Aç → */}
            <div
              className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--border-subtle) 75%, transparent)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!previewAyah}
                  onClick={handlePlayPreviewAyah}
                  className="min-h-[36px] px-3 rounded-xl border font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors hover:border-[var(--brand-primary)] disabled:opacity-45 whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Play
                    className="w-3.5 h-3.5 fill-current shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <span>Dinle</span>
                </button>

                <button
                  type="button"
                  disabled={!previewAyah}
                  onClick={() => {
                    if (!previewAyah) return;
                    sfxService.play('click');
                    openVerseNoteModal(previewAyah.surahNo, previewAyah.ayahNo, previewAyah.pageNo);
                  }}
                  className="min-h-[36px] px-3 rounded-xl border font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors hover:border-[var(--brand-primary)] disabled:opacity-45 whitespace-nowrap"
                  style={{
                    backgroundColor: previewAyahHasNote
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface)',
                    borderColor: previewAyahHasNote
                      ? 'color-mix(in srgb, var(--brand-accent) 45%, var(--border-subtle))'
                      : 'var(--border-subtle)',
                    color: previewAyahHasNote
                      ? 'var(--brand-accent-text)'
                      : 'var(--text-secondary)',
                  }}
                >
                  <StickyNote className="w-3.5 h-3.5 shrink-0" />
                  <span>{previewAyahHasNote ? 'Notu Gör' : 'Not Ekle'}</span>
                </button>
              </div>

              <button
                type="button"
                disabled={!previewAyah}
                onClick={() => {
                  if (!previewAyah) return;
                  sfxService.play('click');
                  setSelectedVerseKey(`${previewAyah.surahNo}:${previewAyah.ayahNo}`);
                  navigateToStudy({
                    surah: previewAyah.surahNo,
                    ayah: previewAyah.ayahNo,
                    page: previewAyah.pageNo,
                    viewMode: 'mushaf',
                    ensureMealVisible: true,
                    ensureArabicVisible: true,
                  });
                }}
                className="min-h-[36px] px-3.5 rounded-xl font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-45 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Mushaf&apos;ta Aç</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>

          {/* Alt Sağ Kart: Odak Surelerim (Mobilde kompakt akordeon, masaüstünde açık kart) */}
          {deskPrefs.showPoolAndExamSection && (
            <div className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-3">
              {/* Mobil (< lg) Tek Satırlık Akordeon Başlığı + Hızlı Test Butonu */}
              <div className="flex lg:hidden items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setIsMobileFocusSurahsOpen((prev) => !prev);
                  }}
                  aria-expanded={isMobileFocusSurahsOpen}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer py-0.5"
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Target className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-tight">
                      <span className="truncate">Odak Surelerim</span>
                      <span
                        className="text-[11px] font-semibold tabular-nums whitespace-nowrap shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        ({formatNumberTr(poolStats.surahCount)} Sure
                        {poolStats.questionCount > 0
                          ? ` · ${formatNumberTr(poolStats.questionCount)} Soru`
                          : ''}
                        )
                      </span>
                    </span>
                  </span>
                  {isMobileFocusSurahsOpen ? (
                    <ChevronUp
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    />
                  ) : (
                    <ChevronDown
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleStartExam}
                  className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-extrabold text-white inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Trophy className="w-3 h-3 shrink-0" />
                  <span>Test</span>
                </button>
              </div>

              {/* Masaüstü Başlık (lg+) */}
              <div className="hidden lg:flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h4 className="text-[15px] font-extrabold tracking-tight">Odak Surelerim</h4>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      · Seçkili okuma ve test grubunuz · {formatNumberTr(poolStats.surahCount)} Sure
                      {poolStats.questionCount > 0
                        ? ` · ${formatNumberTr(poolStats.questionCount)} Soru`
                        : ''}
                    </span>
                  </div>
                  {studyPool.selectedJuzs.length > 0 && (
                    <p
                      className="text-[11px] tabular-nums mt-0.5 truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Seçili Cüzler: {studyPool.selectedJuzs.map((j) => `${j}. Cüz`).join(' · ')}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={openPoolModal}
                  className="min-h-[34px] px-3 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 hover:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  <span>Sureleri Seç</span>
                </button>
              </div>

              {/* İçerik (Mobilde akordeon açıkken, masaüstünde her zaman görünür) */}
              <div className={`${isMobileFocusSurahsOpen ? 'space-y-3 pt-1' : 'hidden lg:block lg:space-y-3'}`}>
                <div className="flex lg:hidden items-center justify-between gap-2">
                  <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Seçkili okuma ve test grubunuz · {formatNumberTr(poolStats.surahCount)} Sure
                  </p>
                  <button
                    type="button"
                    onClick={openPoolModal}
                    className="min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <SlidersHorizontal className="w-3 h-3 shrink-0" />
                    <span>Sureleri Seç</span>
                  </button>
                </div>

                {/* Seçili Surelerin Zarif Etkileşimli Çipleri */}
                {activePoolSurahChips.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activePoolSurahChips.map((chip) => (
                      <button
                        key={chip.no}
                        type="button"
                        onClick={() => handleFocusSurahAction(chip.no, 'reader')}
                        title={`${chip.no}. ${chip.shortName} suresini aç`}
                        className="min-h-[30px] px-2.5 rounded-lg border text-[11.5px] font-semibold tabular-nums cursor-pointer transition-colors hover:border-[var(--brand-primary)]/45 hover:bg-[var(--brand-primary-soft)]/60"
                        style={{
                          backgroundColor:
                            'color-mix(in srgb, var(--bg-canvas) 55%, var(--bg-surface))',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {chip.no}. {chip.shortName}
                      </button>
                    ))}
                    {remainingPoolSurahCount > 0 && (
                      <button
                        type="button"
                        onClick={openPoolModal}
                        className="min-h-[30px] px-2.5 rounded-lg text-[11.5px] font-bold tabular-nums cursor-pointer hover:underline"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        +{formatNumberTr(remainingPoolSurahCount)} sure
                      </button>
                    )}
                  </div>
                )}

                {poolStats.questionCount === 0 && (
                  <p className="text-[11.5px] font-medium" style={{ color: 'var(--brand-accent-text)' }}>
                    Bu seçimde henüz hazır sınav sorusu yok; okuma ve dinleme yapabilir veya soru
                    bankası bulunan sureleri seçkinize ekleyebilirsiniz.
                  </p>
                )}

                {/* Kompakt Aksiyon Satırı: Hızlı Test Başlat · Sırayla Oku · Dinle */}
                <div
                  className="pt-2.5 border-t flex flex-wrap items-center gap-2"
                  style={{ borderColor: 'color-mix(in srgb, var(--border-subtle) 75%, transparent)' }}
                >
                  <button
                    type="button"
                    onClick={handleStartExam}
                    className="flex-1 min-w-[140px] min-h-[38px] px-3.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95 cursor-pointer whitespace-nowrap"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span>Hızlı Test Başlat</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenPoolReader}
                    className="min-h-[38px] px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap hover:border-[var(--brand-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>Sırayla Oku</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleListenActivePool}
                    className="min-h-[38px] px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap hover:border-[var(--brand-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Headphones className="w-3.5 h-3.5 shrink-0" />
                    <span>Dinle</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
