import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  FastForward,
  Headphones,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Star,
  Timer,
} from 'lucide-react';
import { findReciterById } from '../../config/recitersConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { audioQueueService } from '../../services/audioQueueService';
import { dataService } from '../../services/dataService';
import { memorizationAudioController } from '../../services/memorizationAudioController';
import {
  findClusterStartIndex,
  generateSessionSteps,
  getVaslOpeningHint,
  splitFirstArabicWord,
} from '../../services/memorizationEngine';
import { memorizationStorage } from '../../services/memorizationStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  ActiveSessionSnapshot,
  MemorizationPrefs,
  MemorizationUnit,
  PauseMultiplier,
  RetentionStage,
  VisibilityMask,
} from '../../types/memorization';
import {
  parseVerseKey,
  RETENTION_STAGE_META,
  TEACHER_RECITER_IDS,
} from '../../types/memorization';
import type { CombinedVerse } from '../../types/quran';

interface ZenSessionViewProps {
  unit: MemorizationUnit;
  prefs: MemorizationPrefs;
  initialSnapshot: ActiveSessionSnapshot | null;
  onChangePrefs: (patch: Partial<MemorizationPrefs>) => void;
  onUpdateUnit: (updated: MemorizationUnit) => void;
  onExit: () => void;
}

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicNumeral(n: number): string {
  return String(n)
    .split('')
    .map((ch) => ARABIC_INDIC[Number(ch)] ?? ch)
    .join('');
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const MASK_LABELS: Record<VisibilityMask, string> = {
  open: 'Açık',
  first_word: 'İlk Kelime',
  hidden: 'Tam Gizli',
};

const NEXT_MASK: Record<VisibilityMask, VisibilityMask> = {
  open: 'first_word',
  first_word: 'hidden',
  hidden: 'open',
};

export const ZenSessionView: React.FC<ZenSessionViewProps> = ({
  unit,
  prefs,
  initialSnapshot,
  onChangePrefs,
  onUpdateUnit,
  onExit,
}) => {
  const {
    settings,
    audioPrefs,
    manifest,
    meta,
    setIsMemorizationZenActive,
    openReciterSelector,
    isReciterSelectorOpen,
  } = useAppStore();

  const audioSnap = useSyncExternalStore(
    memorizationAudioController.subscribe,
    memorizationAudioController.getSnapshot,
  );

  // Oturum yapılandırmasını başlangıçta sabitle (kaldığı yerden devam ediliyorsa snapshot'ı koru)
  const [sessionConfig] = useState(() => ({
    method: initialSnapshot?.method ?? prefs.method,
    profile: initialSnapshot?.profile ?? prefs.profile,
    customConfig: initialSnapshot?.customConfig ?? prefs.customConfig,
  }));

  const steps = useMemo(
    () =>
      generateSessionSteps(
        unit.verseKeys,
        sessionConfig.method,
        sessionConfig.profile,
        sessionConfig.customConfig,
      ),
    [unit.verseKeys, sessionConfig],
  );

  const [stepIndex, setStepIndex] = useState(() => {
    if (initialSnapshot && initialSnapshot.unitId === unit.id) {
      return Math.max(0, Math.min(steps.length - 1, initialSnapshot.stepIndex));
    }
    return 0;
  });
  const [completedReps, setCompletedReps] = useState(initialSnapshot?.completedReps ?? 0);
  const [elapsedSec, setElapsedSec] = useState(initialSnapshot?.elapsedSec ?? 0);
  const [mask, setMask] = useState<VisibilityMask>(
    initialSnapshot?.mask ?? steps[0]?.suggestedMask ?? 'open',
  );
  const [isPeeking, setIsPeeking] = useState(false);
  const [showMealHint, setShowMealHint] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [showDesktopRail, setShowDesktopRail] = useState(true);
  const [isFinished, setIsFinished] = useState(false);

  // Veri yükleme (yalnızca bu birimde geçen sureler)
  const uniqueSurahs = useMemo(() => {
    const s = new Set<number>();
    for (const r of unit.ranges) s.add(r.surah);
    return Array.from(s).sort((a, b) => a - b);
  }, [unit.ranges]);

  const [verseMap, setVerseMap] = useState<Map<string, CombinedVerse>>(new Map());
  const [isLoadingVerses, setIsLoadingVerses] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { primaryMeal, getPrimaryVerse } = useActiveMeals(uniqueSurahs);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );
  const isTeacherReciter = TEACHER_RECITER_IDS.has(activeReciter.id);

  const surahNameLookup = useCallback(
    (surahNo: number) =>
      meta?.surahs.find((s) => s.no === surahNo)?.nameTr ?? `${surahNo}. Sure`,
    [meta],
  );

  // Zen oturum bayrağını ve ses çakışma korumasını yönet
  useEffect(() => {
    setIsMemorizationZenActive(true);
    audioQueueService.pause();
    return () => {
      memorizationAudioController.stop();
      setIsMemorizationZenActive(false);
    };
  }, [setIsMemorizationZenActive]);

  // Ayet verilerini yükle
  useEffect(() => {
    let cancelled = false;
    setIsLoadingVerses(true);
    setLoadError(null);

    Promise.all(uniqueSurahs.map((s) => dataService.getSurahBundle(s)))
      .then((bundles) => {
        if (cancelled) return;
        const map = new Map<string, CombinedVerse>();
        for (const b of bundles) {
          for (const v of b.verses) {
            map.set(`${v.surah}:${v.ayah}`, v);
          }
        }
        setVerseMap(map);
        setIsLoadingVerses(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Ayet metinleri yüklenemedi. İnternet bağlantınızı kontrol edin.');
        setIsLoadingVerses(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uniqueSurahs]);

  // Oturum süresi sayacı
  useEffect(() => {
    if (isFinished) return;
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isFinished]);

  const currentStep = steps[stepIndex] ?? null;

  // Adım değiştikçe otomatik kademeli maske önerisini uygula
  useEffect(() => {
    if (!currentStep) return;
    if (prefs.autoProgressiveHide) {
      setMask(currentStep.suggestedMask);
    }
  }, [stepIndex, currentStep, prefs.autoProgressiveHide]);

  const elapsedSecRef = useRef(elapsedSec);
  elapsedSecRef.current = elapsedSec;

  // Aktif oturum durumunu kalıcı olarak kaydet (sayfa yenilenirse kaldığı yerden devam)
  useEffect(() => {
    if (isFinished || steps.length === 0) return;
    const snap: ActiveSessionSnapshot = {
      unitId: unit.id,
      unitTitle: unit.title,
      method: sessionConfig.method,
      profile: sessionConfig.profile,
      customConfig: sessionConfig.customConfig,
      stepIndex,
      totalSteps: steps.length,
      elapsedSec: elapsedSecRef.current,
      completedReps,
      mask,
      updatedAt: Date.now(),
    };
    void memorizationStorage.saveActiveSession(snap);
  }, [
    isFinished,
    unit.id,
    unit.title,
    sessionConfig,
    stepIndex,
    steps.length,
    completedReps,
    mask,
  ]);

  // Canlı ses ayarlarını senkronize et
  useEffect(() => {
    memorizationAudioController.updateLiveSettings({
      playbackRate: prefs.playbackRate,
      listenRepeatPauseEnabled: prefs.listenRepeatPauseEnabled,
      pauseMultiplier: prefs.pauseMultiplier,
    });
  }, [prefs.playbackRate, prefs.listenRepeatPauseEnabled, prefs.pauseMultiplier]);

  const completeSession = useCallback(() => {
    memorizationAudioController.stop();
    setIsFinished(true);
    sfxService.play('correct');
    void memorizationStorage.saveActiveSession(null);

    const addedMinutes = Math.max(1, Math.round(elapsedSec / 60));
    const updated: MemorizationUnit = {
      ...unit,
      completedSessions: unit.completedSessions + 1,
      totalMinutes: unit.totalMinutes + addedMinutes,
      lastPracticedAt: Date.now(),
    };
    onUpdateUnit(updated);
  }, [elapsedSec, unit, onUpdateUnit]);

  const playStepAtIndex = useCallback(
    (targetIdx: number) => {
      const target = steps[targetIdx];
      if (!target) {
        completeSession();
        return;
      }
      if (target.phase === 'checkpoint') {
        memorizationAudioController.stop();
        return;
      }

      const next = steps[targetIdx + 1] ?? null;
      memorizationAudioController.playStep({
        step: target,
        nextStep: next,
        reciter: activeReciter,
        playbackRate: prefs.playbackRate,
        listenRepeatPauseEnabled: prefs.listenRepeatPauseEnabled,
        pauseMultiplier: prefs.pauseMultiplier,
        unitTitle: unit.title,
        surahNameLookup,
        onStepComplete: () => {
          setCompletedReps((r) => r + 1);
          const nextIdx = targetIdx + 1;
          if (nextIdx >= steps.length) {
            completeSession();
            return;
          }
          setStepIndex(nextIdx);
          const upcoming = steps[nextIdx];
          if (upcoming && upcoming.phase !== 'checkpoint') {
            playStepAtIndexRef.current(nextIdx);
          } else {
            memorizationAudioController.stop();
          }
        },
        onMediaPrev: () => {
          const prevIdx = Math.max(0, targetIdx - 1);
          setStepIndex(prevIdx);
          playStepAtIndexRef.current(prevIdx);
        },
        onMediaNext: () => {
          const nextIdx = targetIdx + 1;
          if (nextIdx < steps.length) {
            setStepIndex(nextIdx);
            playStepAtIndexRef.current(nextIdx);
          }
        },
      });
    },
    [
      steps,
      activeReciter,
      prefs.playbackRate,
      prefs.listenRepeatPauseEnabled,
      prefs.pauseMultiplier,
      unit.title,
      surahNameLookup,
      completeSession,
    ],
  );

  const playStepAtIndexRef = useRef(playStepAtIndex);
  playStepAtIndexRef.current = playStepAtIndex;

  // Kurrâ oturum ortasında değişirse aktif çalan adımı yeni kurrâ ile tazele
  const prevReciterIdRef = useRef(activeReciter.id);
  useEffect(() => {
    if (prevReciterIdRef.current !== activeReciter.id) {
      prevReciterIdRef.current = activeReciter.id;
      if (
        audioSnap.status === 'playing' ||
        audioSnap.status === 'loading' ||
        audioSnap.status === 'waiting_pause'
      ) {
        playStepAtIndex(stepIndex);
      }
    }
  }, [activeReciter.id, audioSnap.status, playStepAtIndex, stepIndex]);

  const handleTogglePlay = useCallback(() => {
    if (!currentStep) return;
    if (currentStep.phase === 'checkpoint') {
      // Kontrol noktasında sonraki adıma geç ve başlat
      const nextIdx = stepIndex + 1;
      if (nextIdx >= steps.length) {
        completeSession();
      } else {
        setStepIndex(nextIdx);
        playStepAtIndex(nextIdx);
      }
      return;
    }

    if (
      audioSnap.status === 'playing' ||
      audioSnap.status === 'loading' ||
      audioSnap.status === 'waiting_pause'
    ) {
      memorizationAudioController.pause();
    } else if (audioSnap.status === 'paused') {
      memorizationAudioController.resume();
    } else {
      playStepAtIndex(stepIndex);
    }
  }, [currentStep, stepIndex, steps.length, audioSnap.status, playStepAtIndex, completeSession]);

  const handleGoPrev = useCallback(() => {
    sfxService.play('click');
    const prevIdx = Math.max(0, stepIndex - 1);
    setStepIndex(prevIdx);
    const wasActive =
      audioSnap.status === 'playing' ||
      audioSnap.status === 'loading' ||
      audioSnap.status === 'waiting_pause';
    if (wasActive && steps[prevIdx]?.phase !== 'checkpoint') {
      playStepAtIndex(prevIdx);
    } else {
      memorizationAudioController.stop();
    }
  }, [stepIndex, audioSnap.status, steps, playStepAtIndex]);

  const handleGoNext = useCallback(() => {
    sfxService.play('click');
    const nextIdx = stepIndex + 1;
    if (nextIdx >= steps.length) {
      completeSession();
      return;
    }
    setStepIndex(nextIdx);
    const wasActive =
      audioSnap.status === 'playing' ||
      audioSnap.status === 'loading' ||
      audioSnap.status === 'waiting_pause';
    if (wasActive && steps[nextIdx]?.phase !== 'checkpoint') {
      playStepAtIndex(nextIdx);
    } else {
      memorizationAudioController.stop();
    }
  }, [stepIndex, steps, audioSnap.status, playStepAtIndex, completeSession]);

  const handleReplayStep = useCallback(() => {
    sfxService.play('click');
    if (currentStep?.phase === 'checkpoint') {
      const startIdx = findClusterStartIndex(steps, currentStep.clusterIndex);
      setStepIndex(startIdx);
      playStepAtIndex(startIdx);
      return;
    }
    playStepAtIndex(stepIndex);
  }, [currentStep, steps, stepIndex, playStepAtIndex]);

  // Masaüstü klavye kısayolları (Space, Sol/Sağ ok, H, I, R, M)
  const isReciterModalOpenRef = useRef(isReciterSelectorOpen);
  isReciterModalOpenRef.current = isReciterSelectorOpen;

  useEffect(() => {
    if (isFinished) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isReciterModalOpenRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleGoPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleGoNext();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setMask((m) => NEXT_MASK[m]);
      } else if (e.key === 'i' || e.key === 'I') {
        if (!e.repeat) {
          e.preventDefault();
          setIsPeeking(true);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReplayStep();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setShowMealHint((v) => !v);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') {
        setIsPeeking(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isFinished, handleTogglePlay, handleGoPrev, handleGoNext, handleReplayStep]);

  const toggleStarVerse = (verseKey: string) => {
    sfxService.play('click');
    const exists = unit.starredVerseKeys.includes(verseKey);
    const nextStars = exists
      ? unit.starredVerseKeys.filter((k) => k !== verseKey)
      : [...unit.starredVerseKeys, verseKey];
    onUpdateUnit({ ...unit, starredVerseKeys: nextStars });
  };

  const effectiveMask: VisibilityMask = isPeeking ? 'open' : mask;

  // Aktif odak ayeti & Vasıl (sonraki ayet) kancası
  const activeStepKeys = currentStep?.verseKeys ?? [];
  const highlightedVerseKey =
    audioSnap.activeVerseKey && activeStepKeys.includes(audioSnap.activeVerseKey)
      ? audioSnap.activeVerseKey
      : activeStepKeys[0] ?? unit.verseKeys[0] ?? null;

  const nextVaslVerse = useMemo(() => {
    if (!highlightedVerseKey) return null;
    const idx = unit.verseKeys.indexOf(highlightedVerseKey);
    if (idx < 0 || idx + 1 >= unit.verseKeys.length) return null;
    const nextKey = unit.verseKeys[idx + 1];
    return verseMap.get(nextKey) ?? null;
  }, [highlightedVerseKey, unit.verseKeys, verseMap]);

  const vaslHintText = useMemo(() => getVaslOpeningHint(nextVaslVerse), [nextVaslVerse]);

  const renderMaskedArabic = (verse: CombinedVerse) => {
    if (effectiveMask === 'open') {
      return <span>{verse.ar.t}</span>;
    }
    if (effectiveMask === 'first_word') {
      const { firstWord, restText } = splitFirstArabicWord(verse);
      return (
        <>
          <span>{firstWord}</span>
          {restText && (
            <span
              className="blur-md select-none opacity-45 transition-[filter,opacity] duration-150"
              aria-hidden="true"
            >
              {restText}
            </span>
          )}
        </>
      );
    }
    return (
      <span
        className="blur-md select-none opacity-35 transition-[filter,opacity] duration-150"
        aria-hidden="true"
      >
        {verse.ar.t}
      </span>
    );
  };

  const progressPct =
    steps.length > 0 ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0;

  const isPlayingOrLoading =
    audioSnap.status === 'playing' ||
    audioSnap.status === 'loading' ||
    audioSnap.status === 'waiting_pause';

  // ============================================================================
  // OTURUM SONU SAKİN ÖZET EKRANI
  // ============================================================================
  if (isFinished) {
    return (
      <div
        className="fixed inset-0 z-[75] flex items-center justify-center p-4 overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-canvas)' }}
      >
        <div
          className="w-full max-w-lg rounded-3xl border p-6 sm:p-8 shadow-xl space-y-6 my-auto"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="text-center space-y-2">
            <div
              className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold">
              Allah Mübarek Etsin, Oturum Tamamlandı
            </h2>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              {unit.title} çalışmasını huzurla tamamladınız.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div
              className="p-3 rounded-2xl border text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-lg font-extrabold tabular-nums">{unit.verseKeys.length}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Çalışılan Ayet
              </p>
            </div>
            <div
              className="p-3 rounded-2xl border text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-lg font-extrabold tabular-nums">
                {Math.max(1, completedReps)}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Tamamlanan Adım
              </p>
            </div>
            <div
              className="p-3 rounded-2xl border text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-lg font-extrabold tabular-nums">{formatClock(elapsedSec)}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Süre
              </p>
            </div>
          </div>

          {unit.starredVerseKeys.length > 0 && (
            <div
              className="p-3.5 rounded-2xl border space-y-1.5"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'rgba(217, 119, 6, 0.35)',
              }}
            >
              <p
                className="text-xs font-extrabold flex items-center gap-1.5"
                style={{ color: 'var(--brand-accent-text)' }}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>Zorlandığınız Ayetler ({unit.starredVerseKeys.length})</span>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {unit.starredVerseKeys
                  .map((k) => {
                    const { surah, ayah } = parseVerseKey(k);
                    return `${surahNameLookup(surah)} ${ayah}`;
                  })
                  .join(' · ')}
              </p>
            </div>
          )}

          {/* Pekiştirme Aşaması Güncelleme */}
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-center" style={{ color: 'var(--text-secondary)' }}>
              Bu birimin mevcut durumunu nasıl hissediyorsunuz?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['raw', 'fresh', 'solid'] as RetentionStage[]).map((stageId) => {
                const metaInfo = RETENTION_STAGE_META[stageId];
                const active = unit.stage === stageId;
                return (
                  <button
                    key={stageId}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onUpdateUnit({ ...unit, stage: stageId });
                    }}
                    className="p-2.5 rounded-2xl border text-center cursor-pointer transition-all"
                    style={{
                      backgroundColor: active ? metaInfo.badgeBg : 'var(--bg-surface-soft)',
                      borderColor: active ? metaInfo.badgeBorder : 'var(--border-subtle)',
                      color: active ? metaInfo.badgeColor : 'var(--text-primary)',
                    }}
                  >
                    <p className="text-xs sm:text-sm font-extrabold">{metaInfo.shortLabel}</p>
                    <p className="text-[10px] opacity-80 mt-0.5 line-clamp-1">
                      {stageId === 'raw'
                        ? 'Çalışılıyor'
                        : stageId === 'fresh'
                          ? 'Pekiştirme'
                          : 'Muhafaza'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setStepIndex(0);
                setCompletedReps(0);
                setElapsedSec(0);
                setIsFinished(false);
              }}
              className="flex-1 min-h-[44px] px-4 rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Tekrar Çalış</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onExit();
              }}
              className="flex-1 min-h-[44px] px-4 rounded-2xl text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <span>Ezber Merkezine Dön</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // ZEN ÇALIŞMA ALANI (TAM EKRAN)
  // ============================================================================
  return (
    <div
      className="fixed inset-0 z-[75] flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
    >
      {/* Üst Sakin Bar */}
      <header
        className="h-14 px-3 sm:px-5 border-b flex items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              memorizationAudioController.stop();
              onExit();
            }}
            className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Çıkış</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDesktopRail((v) => !v)}
            title={showDesktopRail ? 'Adım listesini gizle' : 'Adım listesini göster'}
            className="hidden lg:inline-flex w-9 h-9 rounded-xl border items-center justify-center cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {showDesktopRail ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>

          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-extrabold truncate">{unit.title}</h1>
            <p className="text-[11px] truncate tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {currentStep?.shortLabel ?? ''} · {stepIndex + 1}/{steps.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Görünüm Değiştirici: Odak Kartı <-> Mushaf */}
          <div
            className="p-0.5 rounded-xl border inline-flex items-center"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onChangePrefs({ viewMode: 'focus' });
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors"
              style={{
                backgroundColor:
                  prefs.viewMode === 'focus' ? 'var(--brand-primary)' : 'transparent',
                color: prefs.viewMode === 'focus' ? '#FFFFFF' : 'var(--text-secondary)',
              }}
            >
              Odak
            </button>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onChangePrefs({ viewMode: 'mushaf' });
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors"
              style={{
                backgroundColor:
                  prefs.viewMode === 'mushaf' ? 'var(--brand-primary)' : 'transparent',
                color: prefs.viewMode === 'mushaf' ? '#FFFFFF' : 'var(--text-secondary)',
              }}
            >
              Mushaf
            </button>
          </div>

          {/* Kurrâ Seçici Hapı */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              openReciterSelector('memorize');
            }}
            className="hidden sm:inline-flex min-h-[36px] max-w-[165px] px-2.5 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title={`Aktif Kurrâ: ${activeReciter.label}`}
          >
            <Headphones className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
            <span className="truncate">{activeReciter.shortLabel}</span>
          </button>

          {/* Hızlı Ayarlar */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setShowQuickSettings((v) => !v);
            }}
            aria-label="Oturum ayarları"
            className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: showQuickSettings
                ? 'var(--brand-primary-soft)'
                : 'var(--bg-surface-soft)',
              borderColor: showQuickSettings ? 'var(--brand-primary)' : 'var(--border-subtle)',
              color: showQuickSettings ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
            }}
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* İnce Üst İlerleme Şeridi */}
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: 'var(--border-subtle)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${progressPct}%`,
            backgroundColor: 'var(--brand-primary)',
          }}
        />
      </div>

      {/* Açılır Hızlı Oturum Ayarları Çekmecesi */}
      {showQuickSettings && (
        <div
          className="px-4 py-3 border-b shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-3 text-xs">
            {/* Kurrâ (mobilde kolay erişim) */}
            <button
              type="button"
              onClick={() => openReciterSelector('memorize')}
              className="sm:hidden px-3 py-1.5 rounded-xl border font-bold inline-flex items-center gap-1.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{activeReciter.shortLabel}</span>
            </button>

            {/* Hız */}
            <div className="flex items-center gap-1">
              <span className="font-bold mr-1" style={{ color: 'var(--text-muted)' }}>
                Hız:
              </span>
              {([0.75, 1, 1.25, 1.5] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => onChangePrefs({ playbackRate: rate })}
                  className="px-2 py-1 rounded-lg border font-bold tabular-nums cursor-pointer"
                  style={{
                    backgroundColor:
                      prefs.playbackRate === rate ? 'var(--brand-primary)' : 'var(--bg-surface)',
                    borderColor:
                      prefs.playbackRate === rate
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                    color: prefs.playbackRate === rate ? '#FFFFFF' : 'var(--text-primary)',
                  }}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Otomatik Kademeli Gizle */}
            <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.autoProgressiveHide}
                onChange={(e) => onChangePrefs({ autoProgressiveHide: e.target.checked })}
                className="accent-[var(--brand-primary)]"
              />
              <span>Otomatik Kademeli Gizle</span>
            </label>

            {/* Vasıl Kancası */}
            <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.showVaslHook}
                onChange={(e) => onChangePrefs({ showVaslHook: e.target.checked })}
                className="accent-[var(--brand-primary)]"
              />
              <span>Vasıl Geçiş İpucu</span>
            </label>

            {/* Dinle & Tekrar Et Boşluğu */}
            {!isTeacherReciter ? (
              <div className="flex items-center gap-1.5">
                <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.listenRepeatPauseEnabled}
                    onChange={(e) =>
                      onChangePrefs({ listenRepeatPauseEnabled: e.target.checked })
                    }
                    className="accent-[var(--brand-primary)]"
                  />
                  <span>Tekrar Boşluğu</span>
                </label>
                {prefs.listenRepeatPauseEnabled &&
                  ([0.8, 1, 1.2] as PauseMultiplier[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onChangePrefs({ pauseMultiplier: m })}
                      className="px-2 py-0.5 rounded-lg border font-bold tabular-nums cursor-pointer"
                      style={{
                        backgroundColor:
                          prefs.pauseMultiplier === m
                            ? 'var(--brand-accent)'
                            : 'var(--bg-surface)',
                        borderColor:
                          prefs.pauseMultiplier === m
                            ? 'var(--brand-accent)'
                            : 'var(--border-subtle)',
                        color: prefs.pauseMultiplier === m ? '#FFFFFF' : 'var(--text-primary)',
                      }}
                    >
                      {m.toFixed(1)}x
                    </button>
                  ))}
              </div>
            ) : (
              <span
                className="px-2.5 py-1 rounded-lg font-semibold"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                Muallim kaydında doğal tekrar boşluğu aktif
              </span>
            )}
          </div>
        </div>
      )}

      {/* Ana 2 Sütunlu Gövde (Masaüstünde sol açılır/kapanır adım listesi + ferah merkez sahne) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Masaüstü Sol Adım / Küme Rayı */}
        {showDesktopRail && (
          <aside
            className="hidden lg:flex w-72 shrink-0 border-r flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div
              className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Oturum Akışı
              </span>
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                {formatClock(elapsedSec)}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
              {steps.map((s) => {
                const isCurrent = s.index === stepIndex;
                const isDone = s.index < stepIndex;
                return (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setStepIndex(s.index);
                      if (s.phase !== 'checkpoint' && isPlayingOrLoading) {
                        playStepAtIndex(s.index);
                      } else {
                        memorizationAudioController.stop();
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer flex items-center gap-2 border"
                    style={{
                      backgroundColor: isCurrent
                        ? 'var(--brand-primary-soft)'
                        : 'transparent',
                      borderColor: isCurrent ? 'var(--brand-primary)' : 'transparent',
                      color: isCurrent
                        ? 'var(--brand-primary-text)'
                        : isDone
                          ? 'var(--text-muted)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    <span className="w-5 text-[11px] font-extrabold tabular-nums shrink-0">
                      {isDone ? '✓' : `${s.index + 1}.`}
                    </span>
                    <span className={`truncate ${isCurrent ? 'font-extrabold' : 'font-semibold'}`}>
                      {s.stepLabel}
                    </span>
                    <span className="ml-auto text-[10px] tabular-nums opacity-75 shrink-0">
                      {s.repeatIndex}/{s.totalRepeats}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="px-4 py-2.5 border-t text-[11px] leading-relaxed"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              Kısayollar: <strong>Boşluk</strong> Oynat · <strong>H</strong> Maske ·{' '}
              <strong>I</strong> Basılı Tut Göster · <strong>R</strong> Tekrar ·{' '}
              <strong>M</strong> Meal
            </div>
          </aside>
        )}

        {/* Merkez Çalışma Sahnesi */}
        <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
          <div className="max-w-3xl mx-auto space-y-4 pb-6">
            {/* Aktif Adım Bilgi & Maske Seçici Şeridi */}
            {currentStep && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="px-3 py-1 rounded-xl text-xs font-extrabold"
                    style={{
                      backgroundColor:
                        currentStep.phase === 'checkpoint'
                          ? 'var(--brand-accent-soft)'
                          : 'var(--brand-primary-soft)',
                      color:
                        currentStep.phase === 'checkpoint'
                          ? 'var(--brand-accent-text)'
                          : 'var(--brand-primary-text)',
                    }}
                  >
                    {currentStep.stepLabel}
                  </span>
                  {currentStep.totalRepeats > 1 && (
                    <span
                      className="px-2.5 py-1 rounded-xl border text-xs font-bold tabular-nums"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Tekrar {currentStep.repeatIndex} / {currentStep.totalRepeats}
                    </span>
                  )}
                </div>

                {/* 3 Kademeli Maske Hapları */}
                <div
                  className="p-0.5 rounded-xl border inline-flex items-center gap-0.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {(['open', 'first_word', 'hidden'] as VisibilityMask[]).map((mId) => {
                    const active = mask === mId;
                    return (
                      <button
                        key={mId}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setMask(mId);
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--brand-primary)' : 'transparent',
                          color: active ? '#FFFFFF' : 'var(--text-secondary)',
                        }}
                      >
                        {MASK_LABELS[mId]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dinle & Tekrar Et (Akıllı Sekte) Sakin İlerleme Çubuğu */}
            {audioSnap.status === 'waiting_pause' && (
              <div
                className="p-3.5 rounded-2xl border space-y-2"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'rgba(217, 119, 6, 0.35)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs sm:text-sm font-extrabold flex items-center gap-2"
                    style={{ color: 'var(--brand-accent-text)' }}
                  >
                    <Timer className="w-4 h-4 animate-pulse" />
                    <span>Şimdi Ezberden Tekrarla...</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-extrabold tabular-nums"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      {Math.ceil(audioSnap.pauseRemainingMs / 1000)} sn
                    </span>
                    <button
                      type="button"
                      onClick={() => memorizationAudioController.skipWaitPause()}
                      className="px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer inline-flex items-center gap-1"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      <FastForward className="w-3.5 h-3.5" />
                      <span>Geç</span>
                    </button>
                  </div>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'rgba(217, 119, 6, 0.18)' }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-75"
                    style={{
                      width: `${Math.round(audioSnap.pauseProgress * 100)}%`,
                      backgroundColor: 'var(--brand-accent)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Hata Bildirimi */}
            {(loadError || audioSnap.status === 'error') && (
              <div
                className="p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.35)',
                  color: '#B91C1C',
                }}
              >
                <span>{loadError || audioSnap.errorMessage}</span>
                {audioSnap.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => playStepAtIndex(stepIndex)}
                    className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold cursor-pointer shrink-0"
                  >
                    Tekrar Dene
                  </button>
                )}
              </div>
            )}

            {/* KÜME KONTROL NOKTASI KARTI */}
            {currentStep?.phase === 'checkpoint' ? (
              <div
                className="rounded-3xl border p-6 sm:p-8 text-center space-y-5 shadow-sm"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div
                  className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg sm:text-xl font-extrabold">{currentStep.stepLabel}</h2>
                  <p className="text-xs sm:text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
                    Bu kümedeki ayetleri zihninizden baştan sona bir kez gözden geçirin. Hazır hissediyorsanız bir sonraki adıma geçebilir veya bu kümeyi tekrarlayabilirsiniz.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      const startIdx = findClusterStartIndex(steps, currentStep.clusterIndex);
                      setStepIndex(startIdx);
                      playStepAtIndex(startIdx);
                    }}
                    className="min-h-[46px] px-5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Zorlandım → Bu Kümeyi Tekrarla</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('correct');
                      const nextIdx = stepIndex + 1;
                      if (nextIdx >= steps.length) {
                        completeSession();
                      } else {
                        setStepIndex(nextIdx);
                        playStepAtIndex(nextIdx);
                      }
                    }}
                    className="min-h-[46px] px-5 rounded-2xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {stepIndex + 1 >= steps.length
                        ? 'Bu Küme Sağlam → Oturumu Bitir'
                        : 'Bu Küme Sağlam → Sonraki Adıma Geç'}
                    </span>
                  </button>
                </div>
              </div>
            ) : isLoadingVerses ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2
                  className="w-7 h-7 animate-spin"
                  style={{ color: 'var(--brand-primary)' }}
                />
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Ayetler hazırlanıyor...
                </p>
              </div>
            ) : prefs.viewMode === 'focus' ? (
              /* ODAK KARTI GÖRÜNÜMÜ */
              <div className="space-y-3">
                {activeStepKeys.map((key) => {
                  const verse = verseMap.get(key);
                  if (!verse) return null;
                  const isActiveAudio = audioSnap.activeVerseKey === key;
                  const isStarred = unit.starredVerseKeys.includes(key);
                  const mealVerse = showMealHint ? getPrimaryVerse(verse) : null;

                  return (
                    <div
                      key={key}
                      onPointerDown={() => {
                        if (mask !== 'open') setIsPeeking(true);
                      }}
                      onPointerUp={() => setIsPeeking(false)}
                      onPointerLeave={() => setIsPeeking(false)}
                      onPointerCancel={() => setIsPeeking(false)}
                      className="rounded-3xl border p-5 sm:p-7 transition-all select-none touch-manipulation"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: isActiveAudio
                          ? 'var(--brand-primary)'
                          : 'var(--border-subtle)',
                        boxShadow: isActiveAudio
                          ? '0 0 0 2px rgba(15, 118, 110, 0.22), var(--shadow-card)'
                          : 'var(--shadow-card)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <span
                          className="px-2.5 py-1 rounded-xl text-xs font-extrabold tabular-nums"
                          style={{
                            backgroundColor: isActiveAudio
                              ? 'var(--brand-primary)'
                              : 'var(--bg-surface-soft)',
                            color: isActiveAudio ? '#FFFFFF' : 'var(--brand-primary-text)',
                          }}
                        >
                          {surahNameLookup(verse.surah)} · {verse.ayah}. Ayet
                        </span>

                        <div className="flex items-center gap-1.5">
                          {mask !== 'open' && (
                            <span
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                              style={{
                                backgroundColor: 'var(--bg-surface-soft)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {isPeeking ? 'Gösteriliyor' : 'Görmek için basılı tut'}
                            </span>
                          )}
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStarVerse(key);
                            }}
                            title={
                              isStarred ? 'Zorlandığım ayetlerden çıkar' : 'Zorlandığım ayet olarak işaretle'
                            }
                            aria-label="Zorlandığım ayet işaretle"
                            className="w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer"
                            style={{
                              backgroundColor: isStarred
                                ? 'var(--brand-accent-soft)'
                                : 'var(--bg-surface-soft)',
                              borderColor: isStarred
                                ? 'var(--brand-accent)'
                                : 'var(--border-subtle)',
                              color: isStarred ? 'var(--brand-accent-text)' : 'var(--text-muted)',
                            }}
                          >
                            <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {audioSnap.isBesmele && isActiveAudio && (
                        <p
                          dir="rtl"
                          className="arabic-text text-center mb-3 px-3 py-1.5 rounded-xl border"
                          style={{
                            fontSize: `${Math.max(20, settings.arabicFontSize - 4)}px`,
                            backgroundColor: 'var(--brand-primary-soft)',
                            borderColor: 'rgba(15, 118, 110, 0.35)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                        </p>
                      )}

                      <p
                        dir="rtl"
                        className="arabic-text text-right leading-[2.35]"
                        style={{
                          fontSize: `${Math.max(24, settings.arabicFontSize + 2)}px`,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {renderMaskedArabic(verse)}
                        <span
                          className="inline-flex items-center justify-center mx-2 px-2 py-0.5 rounded-full text-[0.55em] font-sans font-extrabold align-middle border"
                          style={{
                            backgroundColor: isActiveAudio
                              ? 'var(--brand-primary)'
                              : 'var(--bg-surface-soft)',
                            borderColor: isActiveAudio
                              ? 'var(--brand-primary)'
                              : 'var(--border-strong)',
                            color: isActiveAudio ? '#FFFFFF' : 'var(--brand-primary-text)',
                          }}
                        >
                          ﴿{toArabicNumeral(verse.ayah)}﴾
                        </span>
                      </p>

                      {showMealHint && mealVerse?.t && (
                        <div
                          className="mt-4 pt-3 border-t space-y-1"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <p
                            className="text-[11px] font-extrabold"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            Meal İpucu · {primaryMeal.shortLabel}
                          </p>
                          <p
                            className="turkish-reading text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {mealVerse.t}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* MUSHAF GÖRÜNÜMÜ (SATIR MİZANPAJINI BOZMAYAN MASKELEME) */
              <div
                onPointerDown={() => {
                  if (mask !== 'open') setIsPeeking(true);
                }}
                onPointerUp={() => setIsPeeking(false)}
                onPointerLeave={() => setIsPeeking(false)}
                onPointerCancel={() => setIsPeeking(false)}
                className="rounded-3xl border-2 p-5 sm:p-8 shadow-sm select-none touch-manipulation space-y-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div className="flex items-center justify-between text-xs pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="font-extrabold" style={{ color: 'var(--brand-primary-text)' }}>
                    Mushaf Görünümü · {unit.title}
                  </span>
                  {mask !== 'open' && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {isPeeking ? 'Açık gösteriliyor' : 'Görmek için basılı tutun'}
                    </span>
                  )}
                </div>

                <div
                  dir="rtl"
                  className="arabic-text text-justify leading-[2.45]"
                  style={{
                    fontSize: `${settings.arabicFontSize}px`,
                    color: 'var(--text-primary)',
                  }}
                >
                  {unit.verseKeys.map((key) => {
                    const verse = verseMap.get(key);
                    if (!verse) return null;
                    const inStep = activeStepKeys.includes(key);
                    const isActiveAudio = audioSnap.activeVerseKey === key;

                    return (
                      <span
                        key={key}
                        className="inline rounded-xl px-1 transition-colors"
                        style={{
                          backgroundColor: isActiveAudio
                            ? 'var(--brand-primary-soft)'
                            : inStep
                              ? 'rgba(15, 118, 110, 0.08)'
                              : 'transparent',
                          opacity: inStep ? 1 : 0.42,
                        }}
                      >
                        {inStep ? renderMaskedArabic(verse) : verse.ar.t}
                        <span
                          className="inline-flex items-center justify-center mx-1.5 px-2 py-0.5 rounded-full text-[0.55em] font-sans font-extrabold align-middle border"
                          style={{
                            backgroundColor: isActiveAudio
                              ? 'var(--brand-primary)'
                              : 'var(--bg-surface-soft)',
                            borderColor: isActiveAudio
                              ? 'var(--brand-primary)'
                              : 'var(--border-strong)',
                            color: isActiveAudio ? '#FFFFFF' : 'var(--brand-primary-text)',
                          }}
                        >
                          ﴿{toArabicNumeral(verse.ayah)}﴾
                        </span>{' '}
                      </span>
                    );
                  })}
                </div>

                {showMealHint && highlightedVerseKey && verseMap.get(highlightedVerseKey) && (
                  <div
                    className="pt-3 border-t space-y-1"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <p
                      className="text-[11px] font-extrabold"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Aktif Ayet Meal İpucu · {primaryMeal.shortLabel}
                    </p>
                    <p className="turkish-reading text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {getPrimaryVerse(verseMap.get(highlightedVerseKey)!)?.t ?? ''}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Vasıl (Sonraki Ayete Geçiş) Kancası */}
            {prefs.showVaslHook &&
              currentStep?.phase !== 'checkpoint' &&
              nextVaslVerse &&
              vaslHintText && (
                <div
                  className="px-4 py-2.5 rounded-2xl border flex items-center justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                    Sonraki ayete geçiş (Vasıl · {nextVaslVerse.ayah}. ayet):
                  </span>
                  <span
                    dir="rtl"
                    className="arabic-text font-bold"
                    style={{
                      fontSize: `${Math.min(24, Math.max(18, settings.arabicFontSize - 6))}px`,
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    {vaslHintText} ...
                  </span>
                </div>
              )}
          </div>
        </main>
      </div>

      {/* Başparmak Erişimli Alt Kontrol Çubuğu (Mobil & Masaüstü) */}
      <footer
        className="px-3 sm:px-5 py-2.5 border-t shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-5 items-center gap-1.5 sm:gap-2">
          {/* 1. Maske Döngüsü */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setMask((m) => NEXT_MASK[m]);
            }}
            className="min-h-[46px] px-1.5 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            style={{
              backgroundColor:
                mask !== 'open' ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
              borderColor: mask !== 'open' ? 'var(--brand-primary)' : 'var(--border-subtle)',
              color: mask !== 'open' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
            }}
          >
            {mask === 'open' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="text-[10px] font-extrabold truncate max-w-full">
              {MASK_LABELS[mask]}
            </span>
          </button>

          {/* 2. Önceki Adım */}
          <button
            type="button"
            disabled={stepIndex <= 0}
            onClick={handleGoPrev}
            className="min-h-[46px] px-1.5 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-35"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <SkipBack className="w-4 h-4" />
            <span className="text-[10px] font-bold">Önceki</span>
          </button>

          {/* 3. Büyük Oynat / Duraklat */}
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={isPlayingOrLoading ? 'Duraklat' : 'Oynat'}
            className="min-h-[52px] rounded-2xl text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {audioSnap.status === 'loading' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlayingOrLoading ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* 4. Sonraki Adım */}
          <button
            type="button"
            onClick={handleGoNext}
            className="min-h-[46px] px-1.5 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <SkipForward className="w-4 h-4" />
            <span className="text-[10px] font-bold">
              {stepIndex + 1 >= steps.length ? 'Bitir' : 'Sonraki'}
            </span>
          </button>

          {/* 5. Meal İpucu (Odak Kilidi: varsayılan kapalı) */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setShowMealHint((v) => !v);
            }}
            className="min-h-[46px] px-1.5 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            style={{
              backgroundColor: showMealHint
                ? 'var(--brand-accent-soft)'
                : 'var(--bg-surface-soft)',
              borderColor: showMealHint ? 'var(--brand-accent)' : 'var(--border-subtle)',
              color: showMealHint ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
            }}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] font-bold truncate max-w-full">Meal İpucu</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
