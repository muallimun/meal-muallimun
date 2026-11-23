import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Headphones,
  Layers,
  ListMusic,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  StickyNote,
  Target,
  Trophy,
  Type,
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
import type { AudioPlaylistItem, SurahMeta } from '../types/quran';
import { formatSafeArabicTitle } from '../utils/arabicUtils';
import {
  computeClassicalStats,
  resolveCurrentTurnLesson,
  TOTAL_MUSHAF_PAGES,
} from '../utils/classicalHifzUtils';
import {
  buildSurahQuestionCountMap,
  formatNumberTr,
  getSurahMap,
} from '../utils/poolUtils';
import { normalizeTurkish } from '../utils/textNormalize';

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

const MAX_HOME_QUIZ_CARDS = 4;

const REFLECTION_VERSES = {
  kamer: {
    id: 'kamer' as const,
    tabLabel: 'İlahî Müjde · Kamer 17',
    kicker: 'İlahî Kolaylık ve Öğüt Çağrısı',
    arabic: 'وَلَقَدْ يَسَّرْنَا الْقُرْاٰنَ لِلذِّكْرِ فَهَلْ مِنْ مُدَّكِرٍ',
    meal: "Andolsun biz Kur'an'ı öğüt alınsın diye kolaylaştırdık. (Ondan) öğüt alan yok mu?",
    refLabel: 'Kamer 54/17 (Surede 4 kez tekrarlanır)',
    surah: 54,
    ayah: 17,
  },
  furkan: {
    id: 'furkan' as const,
    tabLabel: 'Nebevî Uyarı · Furkan 30',
    kicker: 'Mehcûr Bırakmama Bilinci',
    arabic: 'وَقَالَ الرَّسُولُ يَا رَبِّ اِنَّ قَوْمِي اتَّخَذُوا هٰذَا الْقُرْاٰنَ مَهْجُورًا',
    meal: "Peygamber der ki: Ey Rabbim! Kavmim bu Kur'an'ı büsbütün terk ettiler.",
    refLabel: 'Furkan 25/30',
    surah: 25,
    ayah: 30,
  },
};

export const HomePage: React.FC = () => {
  const {
    settings,
    updateSettings,
    studyPool,
    setStudyPool,
    studyProgress,
    audioPrefs,
    audioPlaylists,
    gamification,
    manifest,
    meta,
    questionIndex,
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
    openSettingsModal,
    openBookmarksDrawer,
    openHatimModal,
    openListeningDrawer,
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

  // Soru bankası vitrini anlık sure filtresi (114 sureye ölçeklenebilir)
  const [quizSurahQuery, setQuizSurahQuery] = useState('');

  // Rastgele ayet önizleme durumu
  const [previewAyah, setPreviewAyah] = useState<AyahPreviewData | null>(null);
  const [isLoadingAyah, setIsLoadingAyah] = useState(false);
  const [ayahError, setAyahError] = useState<string | null>(null);
  const lastAyahIdRef = useRef<number | null>(null);

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const questionCountBySurah = useMemo(
    () => buildSurahQuestionCountMap(questionIndex),
    [questionIndex],
  );

  const availableQuestionSurahs = useMemo<SurahMeta[]>(() => {
    if (!meta || !questionIndex) return [];
    return questionIndex.availableSurahs
      .map((sNo) => surahMap.get(sNo))
      .filter((s): s is SurahMeta => Boolean(s));
  }, [meta, questionIndex, surahMap]);

  // Akıllı önceliklendirme: Önce Aktif Çalışma Havuzu'ndakiler, sonra Mushaf sırası (en fazla 4 kart)
  const { visibleQuizSurahs, totalMatchedQuizSurahs } = useMemo(() => {
    const normQuery = normalizeTurkish(quizSurahQuery);
    const poolSet = new Set(poolStats.effectiveSurahs);

    const filtered = normQuery
      ? availableQuestionSurahs.filter((s) => {
          const hay = normalizeTurkish(`${s.no} ${s.nameTr} ${s.shortNameTr}`);
          return hay.includes(normQuery);
        })
      : availableQuestionSurahs;

    const prioritized = [...filtered].sort((a, b) => {
      const aInPool = poolSet.has(a.no) ? 0 : 1;
      const bInPool = poolSet.has(b.no) ? 0 : 1;
      if (aInPool !== bInPool) return aInPool - bInPool;
      return a.no - b.no;
    });

    return {
      visibleQuizSurahs: prioritized.slice(0, MAX_HOME_QUIZ_CARDS),
      totalMatchedQuizSurahs: prioritized.length,
    };
  }, [availableQuestionSurahs, poolStats.effectiveSurahs, quizSurahQuery]);

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

  const handleToggleSurahInPool = (surahNo: number) => {
    sfxService.play('click');
    const exists = studyPool.selectedSurahs.includes(surahNo);
    const nextSurahs = exists
      ? studyPool.selectedSurahs.filter((n) => n !== surahNo)
      : [...studyPool.selectedSurahs, surahNo];

    if (nextSurahs.length === 0 && studyPool.selectedJuzs.length === 0) {
      return;
    }
    setStudyPool({
      selectedSurahs: nextSurahs,
      selectedJuzs: studyPool.selectedJuzs,
    });
  };

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
      });
      return;
    }
    const firstSurah = poolStats.effectiveSurahs[0];
    if (firstSurah) {
      navigateToStudy({ surah: firstSurah, ayah: 1 });
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            className="lg:col-span-7 h-72 rounded-2xl border"
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
      </div>
    );
  }

  // Seçili surelerin okunaklı kısa özeti (ilk 5 sure + kalan)
  const activeSurahLabels = poolStats.effectiveSurahs
    .slice(0, 5)
    .map((no) => surahMap.get(no)?.shortNameTr ?? `${no}. Sure`);
  const remainingSurahCount = Math.max(0, poolStats.effectiveSurahs.length - 5);

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
      className="w-full text-left rounded-xl border p-3.5 sm:p-4 flex flex-col justify-between gap-2.5 transition-colors hover:border-[var(--brand-primary)] cursor-pointer group"
      style={{
        backgroundColor: 'var(--bg-surface-soft)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-bold tracking-tight"
            style={{
              color:
                tone === 'primary' ? 'var(--brand-primary-text)' : 'var(--brand-accent-text)',
            }}
          >
            {verse.kicker}
          </span>
          <ArrowRight
            className="w-3.5 h-3.5 shrink-0 opacity-55 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--brand-primary-text)' }}
          />
        </div>

        <p
          dir="rtl"
          lang="ar"
          className="text-right leading-[2.05] text-xl sm:text-[23px] break-words"
          style={{
            fontFamily: '"Scheherazade New", "Amiri Quran", serif',
            color: 'var(--text-primary)',
          }}
        >
          {verse.arabic}
        </p>

        <p
          className="text-xs sm:text-[13px] leading-relaxed italic"
          style={{ color: 'var(--text-secondary)' }}
        >
          &ldquo;{verse.meal}&rdquo;
        </p>
      </div>

      <div
        className="pt-2 border-t flex items-center justify-between gap-2 text-[11px] font-semibold"
        style={{
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <span className="truncate">{verse.refLabel}</span>
        <span
          className="font-bold whitespace-nowrap shrink-0"
          style={{ color: 'var(--brand-primary-text)' }}
        >
          Ayeti Aç
        </span>
      </div>
    </button>
  );

  const activeMobileVerse =
    activeReflectionTab === 'kamer' ? REFLECTION_VERSES.kamer : REFLECTION_VERSES.furkan;

  return (
    <div className="space-y-4">
      {/* ====================================================================
          1. Tefekkür & İlahî Çağrı Çerçevesi (Kamer 54/17 & Furkan 25/30)
          ==================================================================== */}
      <section aria-label="Tefekkür ve İlahî Çağrı">
        <div
          className="surface-card rounded-2xl overflow-hidden"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Üst İnce Zümrüt-Kehribar Çizgi Vurgusu */}
          <div
            aria-hidden="true"
            className="h-[3px] w-full"
            style={{
              background:
                'linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-accent) 50%, var(--brand-primary) 100%)',
            }}
          />

          <div className="p-4 sm:p-5 space-y-3.5">
            {/* Üst Başlık Satırı + Yalnızca Daralt / Genişlet Oku */}
            <div className="flex items-start sm:items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p
                  className="text-[11px] font-bold tracking-tight"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  Muallimun Kur&apos;an, Meal &amp; Araştırma
                </p>
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight leading-snug text-balance">
                  Tefekkür &amp; İlahî Çağrı
                </h2>
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
                className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer shrink-0 transition-colors hover:border-[var(--brand-primary)]"
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

            {/* Ortak Özlü Mesaj + Ayet Kartları */}
            {!isReflectionCollapsed && (
              <div className="space-y-3.5">
                <p
                  className="text-xs sm:text-sm leading-relaxed max-w-4xl"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Kur&apos;an-ı Kerim, anlaşılması ve öğüt alınması bizzat Yüce Allah tarafından
                  kolaylaştırılmış bir hidayet rehberidir. Onu yalnız lafzıyla değil, manası ve
                  mesajıyla da hayatımızın merkezinde tutmak mümin sorumluluğumuzdur.
                </p>

                {/* Masaüstü (lg+): İki Ayet Yan Yana */}
                <div className="hidden lg:grid lg:grid-cols-2 gap-4 items-stretch">
                  {renderReflectionVerseCard(REFLECTION_VERSES.kamer, 'primary')}
                  {renderReflectionVerseCard(REFLECTION_VERSES.furkan, 'accent')}
                </div>

                {/* Mobil (< lg): 2'li Geçiş Çipi + Tek Ferah Ayet Kartı */}
                <div className="lg:hidden space-y-2.5">
                  <div
                    className="grid grid-cols-2 gap-1 p-1 rounded-xl"
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
                          className="min-h-[36px] px-2 rounded-lg text-[11px] sm:text-xs font-bold transition-colors cursor-pointer truncate"
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
              </div>
            )}
          </div>

          {/* Kompakt Tek Satırlık Mini Özet Şeridi */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 border-t"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div
              className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b sm:border-b-0 border-r"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                <Flame className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-accent-text)' }} />
                <span>Günlük Seri</span>
              </span>
              <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                {formatNumberTr(gamification.streakDays)} gün
              </span>
            </div>

            {deskPrefs.showPoolAndExamSection && gamification.solvedCount > 0 ? (
              <>
                <div
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b sm:border-b-0 sm:border-r"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <Star className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Toplam Puan</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(gamification.totalXp)}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Çözülen</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(gamification.solvedCount)} soru
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <Target className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
                    <span>Doğruluk</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                    {accuracyPercent !== null ? `%${accuracyPercent}` : '—'}
                  </span>
                </div>
              </>
            ) : !deskPrefs.showPoolAndExamSection && gamification.solvedCount > 0 ? (
              <>
                <div
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b sm:border-b-0 sm:border-r"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <Star className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Toplam Puan</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(gamification.totalXp)}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <BookOpenCheck className="w-3.5 h-3.5 shrink-0" style={{ color: '#047857' }} />
                    <span>Hatim</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                    {hatimSummary ? `%${hatimSummary.percent}` : 'Plan yok'}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Son Konum</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                    {lastRead ? `Sayfa ${lastRead.page}` : 'Hazır'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b sm:border-b-0 sm:border-r"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Son Konum</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap truncate">
                    {lastRead
                      ? `${lastSurahMeta?.shortNameTr ?? ''} · s.${lastRead.page}`.replace(/^\s*·\s*/, '')
                      : 'İlk Okuma'}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Aktif Havuz</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                    {formatNumberTr(poolStats.surahCount)} Sure · {formatNumberTr(poolStats.ayahCount)} Ayet
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    <Bookmark className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-accent-text)' }} />
                    <span>Not / Ayraç</span>
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
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
          2. Ana 2-Sütunlu Alan: Çalışma Masam (Sol 7) + Havuzdan Bir Ayet (Sağ 5)
          ==================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* SOL (7 sütun): Birleşik Çalışma Masam Merkezi */}
        <div className="lg:col-span-7 surface-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4">
          {/* BÖLÜM A: Kaldığım Yer & Özelleştirilebilir Çalışma Satırları */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-primary)',
                    color: '#FFFFFF',
                  }}
                >
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                      Çalışma Masam
                    </h3>
                    {deskPrefs.profile !== 'all' && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-extrabold whitespace-nowrap"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {getStudyDeskProfileLabel(deskPrefs.profile)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    Çalışma profilinize göre kişiselleştirilebilir odak satırları
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
                    className="min-h-[34px] px-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
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
                      : 'var(--bg-surface-soft)',
                    borderColor: isDeskCustomizeOpen
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                    color: isDeskCustomizeOpen
                      ? 'var(--brand-primary-text)'
                      : 'var(--text-primary)',
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
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--brand-primary)',
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

                {/* 4 Hazır Profil Çipi */}
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
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[11px] font-extrabold text-center transition-colors cursor-pointer leading-snug"
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
                          backgroundColor: checked
                            ? 'var(--bg-surface)'
                            : 'transparent',
                          borderColor: checked
                            ? 'rgba(13, 148, 136, 0.35)'
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

            {/* Aktif Çalışma Satırları (Temiz Çizgisel Ayırıcılarla) */}
            {(deskPrefs.showReadingRow ||
              deskPrefs.showHatimRow ||
              deskPrefs.showMemorizationRow ||
              deskPrefs.showListeningRow ||
              deskPrefs.showNotesRow) && (
              <div
                className="rounded-xl border divide-y overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {/* Satır 1: Okuma */}
                {deskPrefs.showReadingRow && (
                  <div
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <BookOpen className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="text-xs font-extrabold" style={{ color: 'var(--brand-primary-text)' }}>
                            Okuma
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold truncate">
                            {lastRead
                              ? `${lastSurahMeta?.nameTr ?? `${lastRead.surah}. Sure`}`
                              : 'Okumaya Başla'}
                          </span>
                          {lastSurahMeta?.nameAr && (
                            <span
                              className="arabic-title text-sm leading-none hidden sm:inline"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {formatSafeArabicTitle(lastSurahMeta.nameAr)}
                            </span>
                          )}
                          {!deskPrefs.showHatimRow && hatimSummary && (
                            <button
                              type="button"
                              onClick={openHatimModal}
                              title="30 Cüz Hatim Planlayıcısını aç"
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums cursor-pointer hover:opacity-85"
                              style={{
                                backgroundColor: 'var(--brand-primary-soft)',
                                color: 'var(--brand-primary-text)',
                              }}
                            >
                              Hatim: %{hatimSummary.percent} · Bugün {hatimSummary.todayCompletedCount}/
                              {hatimSummary.todayTargetPages} s.
                            </button>
                          )}
                        </div>
                        <p
                          className="text-[11px] tabular-nums truncate mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {lastRead ? (
                            <>
                              {lastRead.ayah}. Ayet · Sayfa {lastRead.page} · {lastReadModeLabel}
                              {hatimBookmark ? ` · Hatim S.${hatimBookmark.page}` : ''}
                            </>
                          ) : (
                            'Kaldığınız yer otomatik olarak burada kaydedilir'
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={openBookmarksDrawer}
                        className="min-h-[36px] px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
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
                            });
                          } else {
                            handleOpenPoolReader();
                          }
                        }}
                        className="flex-1 sm:flex-initial min-h-[36px] px-3 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <span>Okumaya Devam Et</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Satır 2: 30 Cüz Hatim Planım */}
                {deskPrefs.showHatimRow && (
                  <div
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.14)',
                          color: '#047857',
                        }}
                      >
                        <BookOpenCheck className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="text-xs font-extrabold" style={{ color: '#047857' }}>
                            30 Cüz Hatim
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold truncate">
                            {hatimSummary
                              ? `${hatimState.activePlan?.title || 'Aktif Hatim'} · %${hatimSummary.percent}`
                              : '30 Cüz Hatim Planı Başlat'}
                          </span>
                          {hatimSummary && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums"
                              style={{
                                backgroundColor: hatimSummary.isTodayQuotaMet
                                  ? 'rgba(16, 185, 129, 0.14)'
                                  : 'var(--brand-primary-soft)',
                                color: hatimSummary.isTodayQuotaMet
                                  ? '#047857'
                                  : 'var(--brand-primary-text)',
                              }}
                            >
                              {hatimSummary.isTodayQuotaMet
                                ? 'Bugünkü hedef tamam'
                                : `Bugün ${hatimSummary.todayRemainingPages} s. kaldı`}
                            </span>
                          )}
                        </div>
                        <p
                          className="text-[11px] tabular-nums truncate mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {hatimSummary ? (
                            <>
                              {hatimSummary.completedCount}/604 Sayfa · {hatimSummary.completedJuzCount}/30 Cüz · Bugün{' '}
                              {hatimSummary.todayCompletedCount}/{hatimSummary.todayTargetPages} sayfa
                            </>
                          ) : hatimState.history.length > 0 ? (
                            `Tamamlanan hatim: ${hatimState.history.length} · Günlük sayfa veya hedef tarihle yeni plan oluşturun`
                          ) : (
                            'Günlük sayfa hedefi, bitiş tarihi veya serbest cüz takibiyle hatim planlayın'
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
                      className="min-h-[36px] px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: hatimSummary ? 'var(--brand-primary)' : 'var(--border-strong)',
                        color: hatimSummary ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                      }}
                    >
                      <span>
                        {hatimSummary ? 'Hatime Devam Et / Planla' : '30 Cüz Hatim Planı Başlat'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                )}

                {/* Satır 3: Ezber */}
                {deskPrefs.showMemorizationRow && (
                  <div
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--brand-accent-soft)',
                          color: 'var(--brand-accent-text)',
                        }}
                      >
                        <BookMarked className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="text-xs font-extrabold" style={{ color: 'var(--brand-accent-text)' }}>
                            Ezber
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold truncate">
                            {memorizationSummary.title}
                          </span>
                          {memorizationSummary.dueAyahCount > 0 && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums"
                              style={{
                                backgroundColor: 'var(--brand-primary-soft)',
                                color: 'var(--brand-primary-text)',
                              }}
                            >
                              Bugün Tekrar ({memorizationSummary.dueAyahCount} Ayet)
                            </span>
                          )}
                        </div>
                        <p
                          className="text-[11px] tabular-nums truncate mt-0.5"
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
                      className="min-h-[36px] px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span>{memorizationSummary.hasProgress ? 'Ezbere Devam Et' : 'Ezbere Başla'}</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                )}

                {/* Satır 4: Dinleme & Hızlı Çalma Listeleri */}
                {deskPrefs.showListeningRow && (
                  <div
                    className="p-3 space-y-2"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: 'var(--brand-primary-soft)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <ListMusic className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-xs font-extrabold" style={{ color: 'var(--brand-primary-text)' }}>
                              Dinleme &amp; Listeler
                            </span>
                            <span
                              className="text-[11px] font-semibold truncate"
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
                        className="min-h-[32px] px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <span>Listeler</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>

                    {meta && manifest && audioPlaylists.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
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
                            className="min-h-[32px] px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors hover:border-[var(--brand-primary)] disabled:opacity-45 whitespace-nowrap"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <Play
                              className="w-3 h-3 fill-current shrink-0"
                              style={{ color: 'var(--brand-primary-text)' }}
                            />
                            <span className="max-w-[165px] truncate">{playlist.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Satır 5: Son Kişisel Ayet Notlarım & Defterim */}
                {deskPrefs.showNotesRow && (
                  <div
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'rgba(14, 165, 233, 0.14)',
                          color: '#0369A1',
                        }}
                      >
                        <StickyNote className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="text-xs font-extrabold" style={{ color: '#0369A1' }}>
                            Notlar &amp; Defterim
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold truncate">
                            {latestPersonalNote
                              ? `${surahMap.get(latestPersonalNote.surah)?.nameTr ?? `${latestPersonalNote.surah}. Sure`} ${latestPersonalNote.ayah}. Ayet`
                              : 'Kişisel Ayet Notları'}
                          </span>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {formatNumberTr(personalVerseNotes.length)} Not ·{' '}
                            {formatNumberTr(researchTopics.length)} Konu
                          </span>
                        </div>
                        <p
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {latestPersonalNote
                            ? latestPersonalNote.text
                            : 'Okuma sırasında ayetlere renkli ve etiketli tefekkür notları ekleyin'}
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
                      className="min-h-[36px] px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span>Notlarım &amp; Defterim</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BÖLÜM B: Entegre Aktif Çalışma Havuzum Özeti & Aksiyonlar */}
          <div
            className="pt-3.5 border-t space-y-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h4 className="text-sm sm:text-base font-extrabold tracking-tight">
                    {studyPool.isCustomized
                      ? 'Aktif Çalışma Havuzum'
                      : `Önerilen Başlangıç Havuzu (${formatNumberTr(poolStats.surahCount)} Sure)`}
                  </h4>
                  {!studyPool.isCustomized && (
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-extrabold"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      Varsayılan
                    </span>
                  )}
                </div>
                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>
                    Seçili Sure:{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {formatNumberTr(poolStats.surahCount)}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Toplam Ayet:{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {formatNumberTr(poolStats.ayahCount)}
                    </strong>
                  </span>
                  {deskPrefs.showPoolAndExamSection && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Hazır Soru:{' '}
                        <strong style={{ color: 'var(--brand-primary-text)' }}>
                          {formatNumberTr(poolStats.questionCount)}
                        </strong>
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={openPoolModal}
                className="min-h-[38px] px-3.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>Havuzu Düzenle</span>
              </button>
            </div>

            {/* Kapsam Özeti */}
            <div className="space-y-1 text-xs sm:text-sm">
              <p style={{ color: 'var(--text-secondary)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Kapsam:{' '}
                </span>
                {activeSurahLabels.length > 0 ? (
                  <>
                    {activeSurahLabels.join(', ')}
                    {remainingSurahCount > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' '}
                        +{formatNumberTr(remainingSurahCount)} sure
                      </span>
                    )}
                  </>
                ) : (
                  <span>Henüz sure seçilmedi.</span>
                )}
              </p>
              {studyPool.selectedJuzs.length > 0 && (
                <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  Seçili Cüzler: {studyPool.selectedJuzs.map((j) => `${j}. Cüz`).join(' · ')}
                </p>
              )}
              {deskPrefs.showPoolAndExamSection && poolStats.questionCount === 0 && (
                <p className="text-xs font-medium" style={{ color: 'var(--brand-accent-text)' }}>
                  Bu seçimde henüz hazır sınav sorusu yok; okuma ve dinleme yapabilir veya soru
                  bankası bulunan sureleri havuza ekleyebilirsiniz.
                </p>
              )}
            </div>

            {/* Alt Aksiyon Satırı: Sınav Başlat (profilde açıksa) · Havuzu Oku · Havuzu Dinle */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {deskPrefs.showPoolAndExamSection && (
                <button
                  type="button"
                  onClick={handleStartExam}
                  className="flex-1 min-w-[140px] min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-1.5 transition-transform active:scale-[0.99] cursor-pointer whitespace-nowrap"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>Sınav Başlat</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenPoolReader}
                className={`${
                  deskPrefs.showPoolAndExamSection
                    ? 'min-h-[44px] px-3.5 py-2.5 border'
                    : 'flex-1 min-w-[140px] min-h-[44px] px-4 py-2.5 text-white'
                } rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap`}
                style={
                  deskPrefs.showPoolAndExamSection
                    ? {
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }
                    : {
                        backgroundColor: 'var(--brand-primary)',
                      }
                }
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>Havuzu Oku</span>
              </button>

              <button
                type="button"
                onClick={handleListenActivePool}
                className={`${
                  deskPrefs.showPoolAndExamSection ? '' : 'flex-1 min-w-[140px]'
                } min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap`}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Headphones className="w-4 h-4 shrink-0" />
                <span>Havuzu Dinle</span>
              </button>
            </div>
          </div>
        </div>

        {/* SAĞ (5 sütun): Havuzdan Rastgele Ayet Önizleme Kartı */}
        <div className="lg:col-span-5 surface-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold tracking-tight">Havuzdan Bir Ayet</h3>
                {previewAyah && (
                  <p className="text-xs tabular-nums truncate" style={{ color: 'var(--text-muted)' }}>
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
                className="min-h-[40px] min-w-[40px] px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw
                  className={`w-4 h-4 shrink-0 ${isLoadingAyah ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline whitespace-nowrap">Yeni Ayet</span>
              </button>
            </div>

            {ayahError ? (
              <div
                className="p-4 rounded-xl text-sm"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-secondary)',
                }}
              >
                {ayahError}
              </div>
            ) : !previewAyah ? (
              <div className="space-y-3 py-6 animate-pulse">
                <div
                  className="h-8 rounded-lg w-5/6 ml-auto"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                />
                <div
                  className="h-4 rounded w-full"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                />
                <div
                  className="h-4 rounded w-4/5"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className="p-4 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {(() => {
                    const tjWords = settings.tajweedEnabled
                      ? getPreviewTjVerseWords(previewAyah.surahNo, previewAyah.ayahNo)
                      : null;
                    if (tjWords && tjWords.length > 0 && previewTjRules) {
                      return (
                        <p
                          dir="rtl"
                          lang="ar"
                          className="arabic-tajweed text-right break-words"
                          style={{
                            fontSize: `${settings.arabicFontSize}px`,
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
                        </p>
                      );
                    }
                    return (
                      <p
                        dir="rtl"
                        lang="ar"
                        className="arabic-text text-right break-words"
                        style={{
                          fontSize: `${settings.arabicFontSize}px`,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {previewAyah.arabicText}
                      </p>
                    );
                  })()}
                </div>

                <div className="space-y-3">
                  {previewAyah.primaryMealText &&
                    (() => {
                      const pres = getMealTextPresentation(
                        findMealById(previewAyah.primaryMealId, manifest),
                        settings.turkishFontSize,
                      );
                      return (
                        <div>
                          <p
                            className="text-[11px] font-bold mb-1"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            {previewAyah.primaryMealLabel}
                          </p>
                          <p
                            dir={pres.dir}
                            lang={pres.lang}
                            className={pres.className}
                            style={{
                              fontSize: `${pres.fontSizePx}px`,
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
                          className="pt-3 border-t"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <p
                            className="text-[11px] font-bold mb-1"
                            style={{ color: 'var(--brand-accent-text)' }}
                          >
                            {previewAyah.secondaryMealLabel}
                          </p>
                          <p
                            dir={pres.dir}
                            lang={pres.lang}
                            className={pres.className}
                            style={{
                              fontSize: `${pres.fontSizePx}px`,
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

          {/* Alt Okuyucuda Aç & Yazı Tipi Kısayolları */}
          <div
            className="mt-5 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {previewAyah ? (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  navigateToStudy({
                    surah: previewAyah.surahNo,
                    ayah: previewAyah.ayahNo,
                    page: previewAyah.pageNo,
                    ensureMealVisible: true,
                  });
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">Okuyucuda Aç</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                {settings.arabicFont} · {settings.arabicFontSize}px
              </span>
            )}

            <button
              type="button"
              onClick={openSettingsModal}
              className="min-h-[40px] px-2.5 rounded-lg font-bold flex items-center gap-1.5 shrink-0 cursor-pointer hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <Type className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Yazı Tipi ({settings.arabicFontSize}px)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ====================================================================
          3. Soru Bankası Bulunan Sureler — 114 Sureye Ölçeklenebilir 4'lü Vitrin
          ==================================================================== */}
      {deskPrefs.showPoolAndExamSection && (
      <section aria-label="Soru bankası bulunan sureler" className="space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2.5">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold tracking-tight">
              Soru Bankası Bulunan Sureler
            </h3>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              Havuzunuzdaki sureler öncelikli olarak listelenir; tüm soru bankasına arama veya Sınav
              Merkezi üzerinden ulaşabilirsiniz.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Kompakt Anlık Sure Arama Kutusu */}
            <div className="relative flex-1 sm:flex-initial sm:w-48">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="search"
                value={quizSurahQuery}
                onChange={(e) => setQuizSurahQuery(e.target.value)}
                placeholder="Sure ara..."
                aria-label="Soru bankası bulunan surelerde ara"
                className="w-full h-9 pl-8 pr-7 rounded-xl border text-xs font-medium outline-none focus:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {quizSurahQuery && (
                <button
                  type="button"
                  onClick={() => setQuizSurahQuery('')}
                  aria-label="Sure filtresini temizle"
                  className="w-6 h-6 rounded-md flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleStartExam}
              className="min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors hover:border-[var(--brand-primary)]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <span className="tabular-nums">
                Tüm Soru Bankaları ({formatNumberTr(availableQuestionSurahs.length)} Sure ·{' '}
                {formatNumberTr(questionIndex?.items.length ?? 0)} Soru)
              </span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>

        {visibleQuizSurahs.length === 0 ? (
          <div
            className="surface-card rounded-2xl p-6 text-center space-y-2"
            style={{ color: 'var(--text-muted)' }}
          >
            <p className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
              &ldquo;{quizSurahQuery.trim()}&rdquo; ile eşleşen soru bankalı sure bulunamadı.
            </p>
            <button
              type="button"
              onClick={() => setQuizSurahQuery('')}
              className="text-xs font-bold underline underline-offset-4 cursor-pointer"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              Filtreyi Temizle
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1.5 -mx-1 px-1 no-scrollbar sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
              {visibleQuizSurahs.map((surah) => {
                const qCount = questionCountBySurah.get(surah.no) ?? surah.questionCount;
                const inPool = poolStats.effectiveSurahs.includes(surah.no);
                const directlySelected = studyPool.selectedSurahs.includes(surah.no);

                return (
                  <article
                    key={surah.no}
                    className="surface-card rounded-2xl p-4 flex flex-col justify-between transition-transform hover:-translate-y-0.5 min-w-[272px] w-[82vw] max-w-[310px] snap-start shrink-0 sm:min-w-0 sm:w-auto sm:max-w-none sm:shrink"
                  >
                    <div>
                      {/* Üst Satır: Sure No + Arapça İsim */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums shrink-0"
                          style={{
                            backgroundColor: 'var(--brand-primary-soft)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          {surah.no}
                        </span>

                        <span
                          className="arabic-title text-xl leading-none pt-0.5"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {formatSafeArabicTitle(surah.nameAr)}
                        </span>
                      </div>

                      {/* Sure Adı ve Yalın Metaveri */}
                      <h4 className="text-base font-extrabold tracking-tight mb-1">
                        {surah.nameTr}
                      </h4>
                      <p
                        className="text-xs tabular-nums mb-3"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {surah.type} · {formatNumberTr(surah.ayahCount)} Ayet ·{' '}
                        {surah.cuzs.join(', ')}. Cüz
                      </p>

                      {/* Soru Sayısı Vurgusu */}
                      <button
                        type="button"
                        onClick={() => handleFocusSurahAction(surah.no, 'exam')}
                        className="w-full py-2 px-3 rounded-xl flex items-center justify-between text-xs font-bold mb-4 cursor-pointer transition-opacity hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <span>Hazır Soru Bankası</span>
                        <span className="tabular-nums">{formatNumberTr(qCount)} Soru →</span>
                      </button>
                    </div>

                    {/* Kart Aksiyonları */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleFocusSurahAction(surah.no, 'exam')}
                          className="min-h-[42px] px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-95 cursor-pointer"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          <Trophy className="w-3.5 h-3.5 shrink-0" />
                          <span className="whitespace-nowrap">Sınava Gir</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleFocusSurahAction(surah.no, 'reader')}
                          className="min-h-[42px] px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span className="whitespace-nowrap">Meal Oku</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!directlySelected && inPool) {
                            sfxService.play('click');
                            openPoolModal();
                          } else {
                            handleToggleSurahInPool(surah.no);
                          }
                        }}
                        disabled={
                          directlySelected &&
                          studyPool.selectedSurahs.length === 1 &&
                          studyPool.selectedJuzs.length === 0
                        }
                        className="w-full min-h-[36px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        style={{
                          backgroundColor: inPool ? 'var(--brand-primary-soft)' : 'transparent',
                          color: inPool ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                        }}
                      >
                        {directlySelected ? (
                          <>
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>Çalışma Havuzunda</span>
                          </>
                        ) : inPool ? (
                          <>
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>Cüz ile Havuzda · Düzenle</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Havuza Ekle</span>
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {totalMatchedQuizSurahs > MAX_HOME_QUIZ_CARDS && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={handleStartExam}
                  className="text-xs font-bold inline-flex items-center gap-1.5 hover:underline cursor-pointer"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  <span>
                    +{formatNumberTr(totalMatchedQuizSurahs - MAX_HOME_QUIZ_CARDS)} sure daha var ·
                    Tümünü Sınav Merkezinde Gör
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </section>
      )}
    </div>
  );
};
