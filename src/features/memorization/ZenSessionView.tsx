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
  ArrowLeftRight,
  BookOpen,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FastForward,
  Headphones,
  Loader2,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Star,
  Target,
  Timer,
  Trash2,
} from 'lucide-react';
import { AyahEndMarker } from '../../components/AyahEndMarker';
import { findReciterById } from '../../config/recitersConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { useMutashabihatData } from '../../hooks/useStudyReferenceData';
import { claimAudioFocus, registerAudioOwner } from '../../services/audioFocusCoordinator';
import { useBackButtonGuard } from '../../services/backStackService';
import { dataService } from '../../services/dataService';
import { memorizationAudioController } from '../../services/memorizationAudioController';
import {
  findClusterStartIndex,
  generateSessionSteps,
  getVaslOpeningHint,
  splitFirstArabicWord,
  tokenizeArabicWordsPreserveLayout,
} from '../../services/memorizationEngine';
import { applySelfEvaluation, memorizationStorage } from '../../services/memorizationStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  ActiveSessionSnapshot,
  MemorizationPrefs,
  MemorizationUnit,
  PauseMultiplier,
  SelfEvaluationRating,
  SessionStep,
  VisibilityMask,
  ZenSessionLaunchOptions,
  ZenSessionMode,
} from '../../types/memorization';
import {
  parseVerseKey,
  RETENTION_STAGE_META,
  REVIEW_INTERVAL_DAYS,
  TEACHER_RECITER_IDS,
} from '../../types/memorization';
import { PLAYBACK_RATE_OPTIONS, type CombinedVerse } from '../../types/quran';

interface ZenSessionViewProps {
  unit: MemorizationUnit;
  prefs: MemorizationPrefs;
  initialSnapshot: ActiveSessionSnapshot | null;
  launchOptions?: ZenSessionLaunchOptions;
  isAdHoc?: boolean;
  onSessionComplete?: () => void;
  onChangePrefs: (patch: Partial<MemorizationPrefs>) => void;
  onUpdateUnit: (updated: MemorizationUnit) => void;
  onExit: () => void;
}

const MAX_RECORDING_SEC = 90;

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function shuffleStrings(arr: readonly string[]): string[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const MASK_LABELS: Record<VisibilityMask, string> = {
  open: 'Açık',
  first_word: 'İlk Kelime',
  word_reveal: 'Kelime Kelime',
  hidden: 'Tam Gizli',
};

const NEXT_MASK: Record<VisibilityMask, VisibilityMask> = {
  open: 'first_word',
  first_word: 'word_reveal',
  word_reveal: 'hidden',
  hidden: 'open',
};

const MASK_ORDER: readonly VisibilityMask[] = ['open', 'first_word', 'word_reveal', 'hidden'];

function buildSelfTestSteps(keys: readonly string[], isShuffled: boolean): SessionStep[] {
  return keys.map((key, idx) => {
    const { ayah } = parseVerseKey(key);
    return {
      index: idx,
      phase: 'encode',
      clusterIndex: 0,
      totalClusters: 1,
      verseKeys: [key],
      repeatIndex: 1,
      totalRepeats: 1,
      suggestedMask: 'hidden',
      stepLabel: `${isShuffled ? 'Karışık Öz-Sınav' : 'Sıralı Öz-Sınav'} · ${ayah}. Ayet`,
      shortLabel: `Öz-Sınav · ${ayah}. Ayet`,
    };
  });
}

export const ZenSessionView: React.FC<ZenSessionViewProps> = ({
  unit,
  prefs,
  initialSnapshot,
  launchOptions,
  isAdHoc = false,
  onSessionComplete,
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
    openMutashabihat,
  } = useAppStore();

  const { getCount: getMutashabihatCount } = useMutashabihatData(true);

  const audioSnap = useSyncExternalStore(
    memorizationAudioController.subscribe,
    memorizationAudioController.getSnapshot,
  );

  // Oturum yapılandırmasını ve hedef ayet listesini başlangıçta sabitle
  const [sessionConfig] = useState<{
    method: MemorizationPrefs['method'];
    profile: MemorizationPrefs['profile'];
    customConfig: MemorizationPrefs['customConfig'];
    mode: ZenSessionMode;
    sessionVerseKeys: string[];
  }>(() => {
    const mode: ZenSessionMode =
      initialSnapshot?.sessionMode ?? launchOptions?.mode ?? 'standard';

    let sessionVerseKeys: string[];
    if (initialSnapshot?.overrideVerseKeys && initialSnapshot.overrideVerseKeys.length > 0) {
      sessionVerseKeys = initialSnapshot.overrideVerseKeys;
    } else if (mode === 'starred_only') {
      const starredSet = new Set(unit.starredVerseKeys);
      const filtered = unit.verseKeys.filter((k) => starredSet.has(k));
      sessionVerseKeys = filtered.length > 0 ? filtered : [...unit.verseKeys];
    } else if (mode === 'self_test_shuffled') {
      sessionVerseKeys = shuffleStrings(unit.verseKeys);
    } else {
      sessionVerseKeys = [...unit.verseKeys];
    }

    return {
      method: initialSnapshot?.method ?? prefs.method,
      profile: initialSnapshot?.profile ?? prefs.profile,
      customConfig: initialSnapshot?.customConfig ?? prefs.customConfig,
      mode,
      sessionVerseKeys,
    };
  });

  const isSelfTest =
    sessionConfig.mode === 'self_test_ordered' || sessionConfig.mode === 'self_test_shuffled';

  const steps = useMemo(() => {
    if (isSelfTest) {
      return buildSelfTestSteps(
        sessionConfig.sessionVerseKeys,
        sessionConfig.mode === 'self_test_shuffled',
      );
    }
    return generateSessionSteps(
      sessionConfig.sessionVerseKeys,
      sessionConfig.method,
      sessionConfig.profile,
      sessionConfig.customConfig,
    );
  }, [isSelfTest, sessionConfig]);

  const [stepIndex, setStepIndex] = useState(() => {
    if (initialSnapshot && initialSnapshot.unitId === unit.id) {
      return Math.max(0, Math.min(steps.length - 1, initialSnapshot.stepIndex));
    }
    return 0;
  });
  const [completedReps, setCompletedReps] = useState(initialSnapshot?.completedReps ?? 0);
  const [elapsedSec, setElapsedSec] = useState(initialSnapshot?.elapsedSec ?? 0);
  const [mask, setMask] = useState<VisibilityMask>(
    initialSnapshot?.mask ?? (isSelfTest ? 'hidden' : steps[0]?.suggestedMask ?? 'open'),
  );
  const [isPeeking, setIsPeeking] = useState(false);
  const [showMealHint, setShowMealHint] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [showDesktopRail, setShowDesktopRail] = useState(true);
  const [isFinished, setIsFinished] = useState(false);

  // Kelime Kelime Açma durumu: her ayet için açık kelime sayısı (varsayılan 1)
  const [revealedWordCounts, setRevealedWordCounts] = useState<Record<string, number>>({});
  const peekHoldTimerRef = useRef<number | null>(null);
  const didLongPressPeekRef = useRef(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const railListRef = useRef<HTMLDivElement | null>(null);

  // Öz-Sınav puan özeti
  const [selfTestStats, setSelfTestStats] = useState<{ remembered: number; hard: number }>({
    remembered: 0,
    hard: 0,
  });

  // Oturum sonu 3 butonlu öz-değerlendirme durumu
  const [selectedSelfEval, setSelectedSelfEval] = useState<SelfEvaluationRating | null>(null);
  const [scheduledEvalDays, setScheduledEvalDays] = useState<number | null>(null);

  // ============================================================================
  // Tarayıcı İçi "Sesini Kaydet & Karî ile Kıyasla" Durumu (RAM-only Blob URL)
  // ============================================================================
  const canRecordAudio = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const [isComparePanelOpen, setIsComparePanelOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [recordedDurationSec, setRecordedDurationSec] = useState(0);
  const [voicePlaybackState, setVoicePlaybackState] = useState<
    'idle' | 'playing_user' | 'comparing_user' | 'comparing_reciter'
  >('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSecRef = useRef(0);
  const recordingRequestIdRef = useRef(0);
  const isRecordingRef = useRef(false);
  const isRequestingMicRef = useRef(false);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isRequestingMicRef.current = isRequestingMic;
  }, [isRequestingMic]);

  const stopRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const stopMicTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
  }, []);

  const stopUserAudioPlayback = useCallback(() => {
    if (userAudioRef.current) {
      try {
        userAudioRef.current.onended = null;
        userAudioRef.current.onerror = null;
        userAudioRef.current.pause();
        userAudioRef.current.removeAttribute('src');
        userAudioRef.current.load();
      } catch {
        // ignore
      }
      userAudioRef.current = null;
    }
    setVoicePlaybackState('idle');
  }, []);

  const clearRecordedVoice = useCallback(() => {
    recordingRequestIdRef.current += 1;
    setIsRequestingMic(false);
    stopRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    stopMicTracks();
    stopUserAudioPlayback();

    if (recordedUrlRef.current) {
      try {
        URL.revokeObjectURL(recordedUrlRef.current);
      } catch {
        // ignore
      }
      recordedUrlRef.current = null;
    }
    setRecordedBlobUrl(null);
    setRecordedDurationSec(0);
    setIsRecording(false);
    setRecordingSec(0);
    setRecordingError(null);
    setRecordingNotice(null);
  }, [stopRecordingTimer, stopMicTracks, stopUserAudioPlayback]);

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

  useBackButtonGuard('zen_session_view', true, () => {
    memorizationAudioController.stop();
    clearRecordedVoice();
    onExit();
  });

  // Zen oturum bayrağını, ses çakışma korumasını ve mikrofon/Blob bellek temizliğini yönet
  useEffect(() => {
    setIsMemorizationZenActive(true);
    claimAudioFocus('activity_scene');
    return () => {
      recordingRequestIdRef.current += 1;
      memorizationAudioController.stop();
      clearRecordedVoice();
      if (peekHoldTimerRef.current !== null) {
        window.clearTimeout(peekHoldTimerRef.current);
      }
      setIsMemorizationZenActive(false);
    };
  }, [setIsMemorizationZenActive, clearRecordedVoice]);

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

  // Adım değiştiğinde maske önerisini uygula, kelime sayacını ve geçici ses kaydını sıfırla
  useEffect(() => {
    setRevealedWordCounts({});
    clearRecordedVoice();
    if (!currentStep) return;
    if (isSelfTest) {
      setMask('hidden');
    } else if (prefs.autoProgressiveHide) {
      setMask(currentStep.suggestedMask);
    }
  }, [stepIndex, currentStep, prefs.autoProgressiveHide, isSelfTest, clearRecordedVoice]);

  const elapsedSecRef = useRef(elapsedSec);
  elapsedSecRef.current = elapsedSec;

  // Aktif oturum durumunu kalıcı olarak kaydet
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
      sessionMode: sessionConfig.mode,
      overrideVerseKeys:
        sessionConfig.mode !== 'standard' ? sessionConfig.sessionVerseKeys : undefined,
    };
    if (!isAdHoc) {
      void memorizationStorage.saveActiveSession(snap);
    }
  }, [
    isAdHoc,
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
    clearRecordedVoice();
    setIsFinished(true);
    setSelectedSelfEval(null);
    setScheduledEvalDays(null);
    sfxService.play('correct');
    if (!isAdHoc) {
      void memorizationStorage.saveActiveSession(null);
    }

    const addedMinutes = Math.max(1, Math.round(elapsedSecRef.current / 60));
    const updated: MemorizationUnit = {
      ...unit,
      completedSessions: unit.completedSessions + 1,
      totalMinutes: unit.totalMinutes + addedMinutes,
      lastPracticedAt: Date.now(),
    };
    onUpdateUnit(updated);
    onSessionComplete?.();
  }, [unit, isAdHoc, onUpdateUnit, onSessionComplete, clearRecordedVoice]);

  const playStepAtIndex = useCallback(
    (targetIdx: number) => {
      stopUserAudioPlayback();
      const target = steps[targetIdx];
      if (!target) {
        completeSession();
        return;
      }
      if (target.phase === 'checkpoint') {
        memorizationAudioController.stop();
        return;
      }

      const next = isSelfTest ? null : steps[targetIdx + 1] ?? null;
      memorizationAudioController.playStep({
        step: target,
        nextStep: next,
        reciter: activeReciter,
        playbackRate: prefs.playbackRate,
        listenRepeatPauseEnabled: isSelfTest ? false : prefs.listenRepeatPauseEnabled,
        pauseMultiplier: prefs.pauseMultiplier,
        unitTitle: unit.title,
        surahNameLookup,
        onStepComplete: () => {
          if (isSelfTest) {
            // Öz-sınavda tek ayet dinletisi bittiğinde kullanıcı değerlendirmesini bekle
            memorizationAudioController.stop();
            return;
          }
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
      isSelfTest,
      activeReciter,
      prefs.playbackRate,
      prefs.listenRepeatPauseEnabled,
      prefs.pauseMultiplier,
      unit.title,
      surahNameLookup,
      completeSession,
      stopUserAudioPlayback,
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
    stopUserAudioPlayback();
    if (currentStep.phase === 'checkpoint') {
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
  }, [
    currentStep,
    stepIndex,
    steps.length,
    audioSnap.status,
    playStepAtIndex,
    completeSession,
    stopUserAudioPlayback,
  ]);

  const handleGoPrev = useCallback(() => {
    sfxService.play('click');
    const prevIdx = Math.max(0, stepIndex - 1);
    setStepIndex(prevIdx);
    const wasActive =
      !isSelfTest &&
      (audioSnap.status === 'playing' ||
        audioSnap.status === 'loading' ||
        audioSnap.status === 'waiting_pause');
    if (wasActive && steps[prevIdx]?.phase !== 'checkpoint') {
      playStepAtIndex(prevIdx);
    } else {
      memorizationAudioController.stop();
    }
  }, [stepIndex, isSelfTest, audioSnap.status, steps, playStepAtIndex]);

  const handleGoNext = useCallback(() => {
    sfxService.play('click');
    const nextIdx = stepIndex + 1;
    if (nextIdx >= steps.length) {
      completeSession();
      return;
    }
    setStepIndex(nextIdx);
    const wasActive =
      !isSelfTest &&
      (audioSnap.status === 'playing' ||
        audioSnap.status === 'loading' ||
        audioSnap.status === 'waiting_pause');
    if (wasActive && steps[nextIdx]?.phase !== 'checkpoint') {
      playStepAtIndex(nextIdx);
    } else {
      memorizationAudioController.stop();
    }
  }, [stepIndex, steps, isSelfTest, audioSnap.status, playStepAtIndex, completeSession]);

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

  // Aktif odak ayeti & Vasıl (sonraki ayet) kancası
  const activeStepKeys = useMemo(() => currentStep?.verseKeys ?? [], [currentStep]);
  const activeStepKeysRef = useRef(activeStepKeys);
  activeStepKeysRef.current = activeStepKeys;

  const highlightedVerseKey =
    audioSnap.activeVerseKey && activeStepKeys.includes(audioSnap.activeVerseKey)
      ? audioSnap.activeVerseKey
      : activeStepKeys[0] ?? unit.verseKeys[0] ?? null;

  // Seslendirilen aktif ayeti (veya adım/görünüm değişiminde ilk ayeti) ekran ortasına yumuşakça odakla
  useEffect(() => {
    if (isFinished || isLoadingVerses) return;
    const stepKeys = activeStepKeysRef.current;
    const isAudioInCurrentStep =
      Boolean(audioSnap.activeVerseKey) && stepKeys.includes(audioSnap.activeVerseKey!);
    const targetKey = isAudioInCurrentStep ? audioSnap.activeVerseKey! : stepKeys[0] ?? null;

    const rafId = window.requestAnimationFrame(() => {
      const container = mainScrollRef.current;
      if (!container) return;

      if (!targetKey) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (prefs.viewMode !== 'mushaf' && stepKeys.length <= 1) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const targetEl = container.querySelector<HTMLElement>(
        `[data-zen-verse-key="${targetKey}"]`,
      );
      if (!targetEl) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const targetCenterInScroll =
        targetRect.top - containerRect.top + container.scrollTop + targetRect.height / 2;
      const targetScrollTop = targetCenterInScroll - container.clientHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [audioSnap.activeVerseKey, stepIndex, prefs.viewMode, isFinished, isLoadingVerses]);

  // Masaüstü sol "Oturum Akışı" listesinde aktif adımı görünür alanda tut
  useEffect(() => {
    if (isFinished || !showDesktopRail) return;
    const rafId = window.requestAnimationFrame(() => {
      const rail = railListRef.current;
      if (!rail) return;
      const activeBtn = rail.querySelector<HTMLElement>('[data-zen-step-active="true"]');
      activeBtn?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [stepIndex, showDesktopRail, isFinished]);

  // Kelime Kelime Açma yardımcısı (+1 kelime açar)
  const revealNextWordForVerse = useCallback(
    (verseKey: string) => {
      const verse = verseMap.get(verseKey);
      if (!verse) return;
      const { totalWords } = tokenizeArabicWordsPreserveLayout(verse.ar.t);
      if (totalWords === 0) return;

      if (mask !== 'word_reveal') {
        setMask('word_reveal');
        setRevealedWordCounts((prev) => ({
          ...prev,
          [verseKey]: Math.min(totalWords, 1),
        }));
        return;
      }

      setRevealedWordCounts((prev) => {
        const current = prev[verseKey] ?? 1;
        const nextVal = Math.min(totalWords, current + 1);
        return { ...prev, [verseKey]: nextVal };
      });
    },
    [verseMap, mask],
  );

  // Masaüstü klavye kısayolları (Space, Sol/Sağ ok, H, W, I, R, M)
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
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (highlightedVerseKey) {
          revealNextWordForVerse(highlightedVerseKey);
        }
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
  }, [
    isFinished,
    handleTogglePlay,
    handleGoPrev,
    handleGoNext,
    handleReplayStep,
    highlightedVerseKey,
    revealNextWordForVerse,
  ]);

  // ============================================================================
  // Mikrofon Kaydı & Karî Kıyaslama Aksiyonları
  // ============================================================================
  const stopVoiceRecording = useCallback(() => {
    recordingRequestIdRef.current += 1;
    setIsRequestingMic(false);
    stopRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        stopMicTracks();
        setIsRecording(false);
      }
    } else {
      stopMicTracks();
      setIsRecording(false);
    }
  }, [stopRecordingTimer, stopMicTracks]);

  const stopVoiceRecordingRef = useRef(stopVoiceRecording);
  stopVoiceRecordingRef.current = stopVoiceRecording;
  const stopUserAudioPlaybackRef = useRef(stopUserAudioPlayback);
  stopUserAudioPlaybackRef.current = stopUserAudioPlayback;

  // Merkezi ses odak koordinatörü kaydı ('zen_user_voice' ve 'zen_mic')
  useEffect(() => {
    const unregisterUserVoice = registerAudioOwner('zen_user_voice', () => {
      stopUserAudioPlaybackRef.current();
    });
    const unregisterMic = registerAudioOwner('zen_mic', () => {
      if (isRecordingRef.current || isRequestingMicRef.current) {
        stopVoiceRecordingRef.current();
      }
    });
    return () => {
      unregisterUserVoice();
      unregisterMic();
    };
  }, []);

  // Sekme gizlendiğinde veya sayfa kapatılırken açık mikrofon izlerini güvenle kapat
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'hidden' &&
        (isRecordingRef.current || isRequestingMicRef.current)
      ) {
        stopVoiceRecordingRef.current();
      }
    };
    const handlePageHide = () => {
      if (isRecordingRef.current || isRequestingMicRef.current) {
        stopVoiceRecordingRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (isRecording || isRequestingMic) return;
    if (!canRecordAudio) {
      setRecordingError('Tarayıcınız ses kaydını desteklemiyor.');
      return;
    }

    sfxService.play('click');
    setRecordingError(null);
    setRecordingNotice(null);

    const reqId = ++recordingRequestIdRef.current;
    setIsRequestingMic(true);
    claimAudioFocus('zen_mic');
    stopUserAudioPlayback();

    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
      setRecordedBlobUrl(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Gecikmeli izin yarış koruması: kullanıcı iptal ettiyse veya Zen ekranından çıktıysa izleri anında kapat
      if (reqId !== recordingRequestIdRef.current) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
        return;
      }

      setIsRequestingMic(false);
      mediaStreamRef.current = stream;

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const supportedMime = mimeCandidates.find(
        (m) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m),
      );

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stopRecordingTimer();
        stopMicTracks();
        setIsRecording(false);
        const chunks = recordedChunksRef.current;
        if (chunks.length > 0) {
          const blob = new Blob(chunks, {
            type: recorder.mimeType || 'audio/webm',
          });
          const url = URL.createObjectURL(blob);
          if (recordedUrlRef.current) {
            URL.revokeObjectURL(recordedUrlRef.current);
          }
          recordedUrlRef.current = url;
          setRecordedBlobUrl(url);
          setRecordedDurationSec(Math.max(1, recordingSecRef.current));
        }
      };

      recorder.onerror = () => {
        stopRecordingTimer();
        stopMicTracks();
        setIsRecording(false);
        setRecordingError('Kayıt sırasında beklenmedik bir hata oluştu.');
      };

      recordingSecRef.current = 0;
      setRecordingSec(0);
      setIsRecording(true);
      recorder.start();

      recordingTimerRef.current = window.setInterval(() => {
        recordingSecRef.current += 1;
        setRecordingSec(recordingSecRef.current);
        if (recordingSecRef.current >= MAX_RECORDING_SEC) {
          setRecordingNotice(
            'Maksimum 1:30 kayıt süresine ulaşıldı; kaydınızı dinleyebilir veya kurrâ ile kıyaslayabilirsiniz.',
          );
          stopVoiceRecording();
        }
      }, 1000);
    } catch (err) {
      if (reqId !== recordingRequestIdRef.current) return;
      setIsRequestingMic(false);
      stopMicTracks();
      setIsRecording(false);

      const errName =
        err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setRecordingError(
          'Mikrofon izni verilmedi. Tarayıcı adres çubuğundaki izin simgesinden (iPhone/iPad için Ayarlar → Safari → Mikrofon) izin verip tekrar deneyin.',
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setRecordingError('Cihazınızda kullanılabilir bir mikrofon bulunamadı.');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setRecordingError('Mikrofon şu anda başka bir uygulama tarafından kullanılıyor.');
      } else {
        setRecordingError('Mikrofon izni alınamadı. Tarayıcı izinlerini kontrol edip tekrar deneyin.');
      }
    }
  }, [
    isRecording,
    isRequestingMic,
    canRecordAudio,
    stopRecordingTimer,
    stopMicTracks,
    stopUserAudioPlayback,
    stopVoiceRecording,
  ]);

  const playUserVoice = useCallback(
    (compareWithReciter: boolean) => {
      if (!recordedBlobUrl) return;
      sfxService.play('click');

      if (voicePlaybackState !== 'idle') {
        stopUserAudioPlayback();
        memorizationAudioController.stop();
        return;
      }

      const startUserPlayback = (stateLabel: 'playing_user' | 'comparing_user') => {
        claimAudioFocus('zen_user_voice');
        const audio = new Audio(recordedBlobUrl);
        userAudioRef.current = audio;
        setVoicePlaybackState(stateLabel);

        audio.onended = () => {
          userAudioRef.current = null;
          setVoicePlaybackState('idle');
        };

        audio.onerror = () => {
          userAudioRef.current = null;
          setVoicePlaybackState('idle');
          setRecordingError('Ses kaydı oynatılamadı.');
        };

        audio.play().catch(() => {
          userAudioRef.current = null;
          setVoicePlaybackState('idle');
        });
      };

      // Kıyasla (Kurrâ -> Ben): Önce seçili kurrâyı, bitince otomatik olarak kullanıcının kaydını çal
      if (compareWithReciter && highlightedVerseKey) {
        const compareStep: SessionStep = {
          index: stepIndex,
          phase: 'encode',
          clusterIndex: currentStep?.clusterIndex ?? 0,
          totalClusters: currentStep?.totalClusters ?? 1,
          verseKeys: [highlightedVerseKey],
          repeatIndex: 1,
          totalRepeats: 1,
          suggestedMask: mask,
          stepLabel: 'Kurrâ Kıyaslama',
          shortLabel: 'Kurrâ Kıyaslama',
        };
        memorizationAudioController.playStep({
          step: compareStep,
          nextStep: null,
          reciter: activeReciter,
          playbackRate: prefs.playbackRate,
          listenRepeatPauseEnabled: false,
          pauseMultiplier: prefs.pauseMultiplier,
          unitTitle: unit.title,
          surahNameLookup,
          onStepComplete: () => {
            memorizationAudioController.stop();
            startUserPlayback('comparing_user');
          },
        });
        setVoicePlaybackState('comparing_reciter');
        return;
      }

      startUserPlayback('playing_user');
    },
    [
      recordedBlobUrl,
      voicePlaybackState,
      stopUserAudioPlayback,
      highlightedVerseKey,
      stepIndex,
      currentStep,
      mask,
      activeReciter,
      prefs.playbackRate,
      prefs.pauseMultiplier,
      unit.title,
      surahNameLookup,
    ],
  );

  // Yıldızlama ve Öz-Sınav yanıtları
  const toggleStarVerse = (verseKey: string) => {
    sfxService.play('click');
    const exists = unit.starredVerseKeys.includes(verseKey);
    const nextStars = exists
      ? unit.starredVerseKeys.filter((k) => k !== verseKey)
      : [...unit.starredVerseKeys, verseKey];
    onUpdateUnit({ ...unit, starredVerseKeys: nextStars });
  };

  const handleSelfTestAnswer = (verseKey: string, remembered: boolean) => {
    sfxService.play(remembered ? 'correct' : 'click');
    memorizationAudioController.stop();
    setCompletedReps((r) => r + 1);
    setSelfTestStats((prev) => ({
      remembered: prev.remembered + (remembered ? 1 : 0),
      hard: prev.hard + (remembered ? 0 : 1),
    }));

    const isStarred = unit.starredVerseKeys.includes(verseKey);
    if (!remembered && !isStarred) {
      onUpdateUnit({ ...unit, starredVerseKeys: [...unit.starredVerseKeys, verseKey] });
    } else if (remembered && isStarred) {
      onUpdateUnit({
        ...unit,
        starredVerseKeys: unit.starredVerseKeys.filter((k) => k !== verseKey),
      });
    }

    const nextIdx = stepIndex + 1;
    if (nextIdx >= steps.length) {
      completeSession();
    } else {
      setStepIndex(nextIdx);
    }
  };

  const handleApplyFinalSelfEval = (rating: SelfEvaluationRating) => {
    sfxService.play(rating === 'hard' ? 'click' : 'correct');
    const { updated, scheduledDays } = applySelfEvaluation(unit, rating);
    onUpdateUnit(updated);
    setSelectedSelfEval(rating);
    setScheduledEvalDays(scheduledDays);
  };

  // Pointer etkileşimi: word_reveal modunda kısa dokunuş +1 kelime açar, basılı tutma (320ms) geçici tüm metni gösterir
  const handleCardPointerDown = () => {
    if (mask === 'open') return;
    didLongPressPeekRef.current = false;
    if (mask === 'word_reveal') {
      if (peekHoldTimerRef.current !== null) {
        window.clearTimeout(peekHoldTimerRef.current);
      }
      peekHoldTimerRef.current = window.setTimeout(() => {
        didLongPressPeekRef.current = true;
        setIsPeeking(true);
      }, 320);
    } else {
      setIsPeeking(true);
    }
  };

  const handleCardPointerEnd = (verseKeyForWordReveal?: string, isCancel = false) => {
    if (peekHoldTimerRef.current !== null) {
      window.clearTimeout(peekHoldTimerRef.current);
      peekHoldTimerRef.current = null;
    }
    const wasLongPress = didLongPressPeekRef.current;
    setIsPeeking(false);
    didLongPressPeekRef.current = false;

    if (!isCancel && !wasLongPress && mask === 'word_reveal' && verseKeyForWordReveal) {
      sfxService.play('click');
      revealNextWordForVerse(verseKeyForWordReveal);
    }
  };

  const effectiveMask: VisibilityMask = isPeeking ? 'open' : mask;

  const nextVaslVerse = useMemo(() => {
    if (isSelfTest || !highlightedVerseKey) return null;
    const idx = unit.verseKeys.indexOf(highlightedVerseKey);
    if (idx < 0 || idx + 1 >= unit.verseKeys.length) return null;
    const nextKey = unit.verseKeys[idx + 1];
    return verseMap.get(nextKey) ?? null;
  }, [isSelfTest, highlightedVerseKey, unit.verseKeys, verseMap]);

  const vaslHintText = useMemo(() => getVaslOpeningHint(nextVaslVerse), [nextVaslVerse]);

  const renderMaskedArabic = (verse: CombinedVerse, verseKey: string) => {
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
    if (effectiveMask === 'word_reveal') {
      const { tokens } = tokenizeArabicWordsPreserveLayout(verse.ar.t);
      const revealedCount = revealedWordCounts[verseKey] ?? 1;
      return (
        <>
          {tokens.map((tok, idx) => {
            if (!tok.isWord) {
              return <React.Fragment key={idx}>{tok.text}</React.Fragment>;
            }
            const isVisible = tok.wordIndex < revealedCount;
            return (
              <span
                key={idx}
                className={
                  isVisible
                    ? 'transition-[filter,opacity] duration-150'
                    : 'blur-md select-none opacity-40 transition-[filter,opacity] duration-150'
                }
                aria-hidden={isVisible ? undefined : 'true'}
              >
                {tok.text}
              </span>
            );
          })}
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

  // Önizleme için bir sonraki 'good' / 'easy' gün hesapları
  const previewGoodDays =
    REVIEW_INTERVAL_DAYS[
      Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length - 1, (unit.reviewStep ?? 0)))
    ];
  const previewEasyDays =
    REVIEW_INTERVAL_DAYS[
      Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length - 1, (unit.reviewStep ?? 0) + 1))
    ];

  // ============================================================================
  // OTURUM SONU SAKİN ÖZET & ARALIKLI TEKRAR ÖZ-DEĞERLENDİRME EKRANI
  // ============================================================================
  if (isFinished) {
    const currentStageMeta = RETENTION_STAGE_META[unit.stage];
    return (
      <div
        className="fixed inset-0 z-[75] flex items-center justify-center p-4 overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-canvas)' }}
      >
        <div
          className="w-full max-w-lg rounded-3xl border p-5 sm:p-7 shadow-xl space-y-5 my-auto"
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

          <div className="grid grid-cols-3 gap-2">
            <div
              className="p-3 rounded-2xl border text-center"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-lg font-extrabold tabular-nums">
                {sessionConfig.sessionVerseKeys.length}
              </p>
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
                {isSelfTest
                  ? `${selfTestStats.remembered}/${sessionConfig.sessionVerseKeys.length}`
                  : Math.max(1, completedReps)}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {isSelfTest ? 'Hatırlanan' : 'Tamamlanan Adım'}
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

          {/* Üç Aşamalı Aralıklı Tekrar Öz-Değerlendirmesi */}
          <div className="space-y-2.5">
            <div className="text-center space-y-0.5">
              <p className="text-xs sm:text-sm font-extrabold">
                Bu bölümü nasıl hatırladınız?
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Seçiminize göre bir sonraki pekiştirme tekrar gününüz otomatik planlanır
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'hard' as SelfEvaluationRating,
                    label: 'Zorlandım',
                    sub: 'Yarın tekrar (+1 gün)',
                    accentBg: 'var(--brand-accent-soft)',
                    accentBorder: 'rgba(217, 119, 6, 0.45)',
                    accentColor: 'var(--brand-accent-text)',
                  },
                  {
                    id: 'good' as SelfEvaluationRating,
                    label: 'İyiydi',
                    sub: `${previewGoodDays} gün sonra`,
                    accentBg: 'rgba(14, 165, 233, 0.14)',
                    accentBorder: 'rgba(14, 165, 233, 0.45)',
                    accentColor: '#0369A1',
                  },
                  {
                    id: 'easy' as SelfEvaluationRating,
                    label: 'Su Gibi',
                    sub: `${previewEasyDays} gün sonra`,
                    accentBg: 'var(--brand-primary-soft)',
                    accentBorder: 'var(--brand-primary)',
                    accentColor: 'var(--brand-primary-text)',
                  },
                ] as const
              ).map((opt) => {
                const active = selectedSelfEval === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleApplyFinalSelfEval(opt.id)}
                    className="p-2.5 sm:p-3 rounded-2xl border text-center cursor-pointer transition-all"
                    style={{
                      backgroundColor: active ? opt.accentBg : 'var(--bg-surface-soft)',
                      borderColor: active ? opt.accentBorder : 'var(--border-subtle)',
                      color: active ? opt.accentColor : 'var(--text-primary)',
                    }}
                  >
                    <p className="text-xs sm:text-sm font-extrabold">{opt.label}</p>
                    <p className="text-[10px] opacity-80 mt-0.5 leading-tight">{opt.sub}</p>
                  </button>
                );
              })}
            </div>

            {selectedSelfEval && scheduledEvalDays !== null && (
              <div
                className="px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'rgba(15, 118, 110, 0.3)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Check className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {scheduledEvalDays === 1
                      ? 'Yarın için pekiştirme tekrarı planlandı'
                      : `${scheduledEvalDays} gün sonrası için tekrar planlandı`}
                  </span>
                </span>
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                  style={{
                    backgroundColor: currentStageMeta.badgeBg,
                    color: currentStageMeta.badgeColor,
                  }}
                >
                  {currentStageMeta.shortLabel}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setStepIndex(0);
                setCompletedReps(0);
                setElapsedSec(0);
                setSelfTestStats({ remembered: 0, hard: 0 });
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
        className="h-14 px-2.5 sm:px-5 border-b flex items-center justify-between gap-1.5 sm:gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              memorizationAudioController.stop();
              clearRecordedVoice();
              onExit();
            }}
            className="min-h-[36px] px-2 sm:px-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
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

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Görünüm Değiştirici: Odak Kartı <-> Mushaf (Öz-sınavda sade odak) */}
          {!isSelfTest && (
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
                className="px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors"
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
                className="px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors"
                style={{
                  backgroundColor:
                    prefs.viewMode === 'mushaf' ? 'var(--brand-primary)' : 'transparent',
                  color: prefs.viewMode === 'mushaf' ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                Mushaf
              </button>
            </div>
          )}

          {/* Kurrâ Seçici Hapı */}
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              openReciterSelector('memorize');
            }}
            className="hidden sm:inline-flex min-h-[36px] max-w-[150px] px-2.5 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title={`Aktif Kurrâ: ${activeReciter.label}`}
          >
            <Headphones
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: 'var(--brand-primary-text)' }}
            />
            <span className="truncate">{activeReciter.shortLabel}</span>
          </button>

          {/* Oturumu Bitir & Değerlendir */}
          <button
            type="button"
            onClick={() => completeSession()}
            title="Oturumu bitir ve tekrar takvimini güncelle"
            className="min-h-[36px] px-2 sm:px-2.5 rounded-xl border text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              borderColor: 'rgba(15, 118, 110, 0.3)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline sm:inline">Bitir</span>
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold mr-0.5" style={{ color: 'var(--text-muted)' }}>
                Hız:
              </span>
              <div className="grid grid-cols-4 sm:flex sm:flex-wrap items-center gap-1">
                {PLAYBACK_RATE_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onChangePrefs({ playbackRate: rate })}
                    className="px-2 py-1 rounded-lg border font-bold tabular-nums cursor-pointer text-center"
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
            </div>

            {!isSelfTest && (
              <>
                <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.autoProgressiveHide}
                    onChange={(e) => onChangePrefs({ autoProgressiveHide: e.target.checked })}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span>Otomatik Kademeli Gizle</span>
                </label>

                <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.showVaslHook}
                    onChange={(e) => onChangePrefs({ showVaslHook: e.target.checked })}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span>Vasıl Geçiş İpucu</span>
                </label>

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
                      <span>Gölge Tekrar Boşluğu</span>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Ana 2 Sütunlu Gövde */}
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
              <span
                className="text-xs font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {isSelfTest ? 'Öz-Sınav Ayetleri' : 'Oturum Akışı'}
              </span>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {formatClock(elapsedSec)}
              </span>
            </div>
            <div ref={railListRef} className="flex-1 overflow-y-auto p-2.5 space-y-1">
              {steps.map((s) => {
                const isCurrent = s.index === stepIndex;
                const isDone = s.index < stepIndex;
                return (
                  <button
                    key={s.index}
                    type="button"
                    data-zen-step-active={isCurrent ? 'true' : undefined}
                    onClick={() => {
                      sfxService.play('click');
                      setStepIndex(s.index);
                      if (!isSelfTest && s.phase !== 'checkpoint' && isPlayingOrLoading) {
                        playStepAtIndex(s.index);
                      } else {
                        memorizationAudioController.stop();
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer flex items-center gap-2 border"
                    style={{
                      backgroundColor: isCurrent ? 'var(--brand-primary-soft)' : 'transparent',
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
                    {!isSelfTest && (
                      <span className="ml-auto text-[10px] tabular-nums opacity-75 shrink-0">
                        {s.repeatIndex}/{s.totalRepeats}
                      </span>
                    )}
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
              <strong>W</strong> +1 Kelime · <strong>I</strong> Göster · <strong>R</strong> Tekrar ·{' '}
              <strong>M</strong> Meal
            </div>
          </aside>
        )}

        {/* Merkez Çalışma Sahnesi */}
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
          <div className="max-w-3xl mx-auto space-y-4 pb-24 sm:pb-28">
            {/* Özel Mod Rozeti (Zorlanılan Ayetler veya Öz-Sınav) */}
            {sessionConfig.mode !== 'standard' && (
              <div
                className="px-3.5 py-2 rounded-2xl border text-xs font-extrabold flex items-center justify-between gap-2"
                style={{
                  backgroundColor:
                    sessionConfig.mode === 'starred_only'
                      ? 'var(--brand-accent-soft)'
                      : 'var(--brand-primary-soft)',
                  borderColor:
                    sessionConfig.mode === 'starred_only'
                      ? 'rgba(217, 119, 6, 0.35)'
                      : 'rgba(15, 118, 110, 0.3)',
                  color:
                    sessionConfig.mode === 'starred_only'
                      ? 'var(--brand-accent-text)'
                      : 'var(--brand-primary-text)',
                }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {sessionConfig.mode === 'starred_only' ? (
                    <Star className="w-3.5 h-3.5 fill-current shrink-0" />
                  ) : (
                    <Target className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {sessionConfig.mode === 'starred_only'
                      ? `Zorlanılan Ayetler Odak Turu (${sessionConfig.sessionVerseKeys.length} ayet)`
                      : sessionConfig.mode === 'self_test_shuffled'
                        ? 'Ezber Kontrolü · Karışık Öz-Sınav'
                        : 'Ezber Kontrolü · Sıralı Öz-Sınav'}
                  </span>
                </span>
                {isSelfTest && (
                  <span className="tabular-nums shrink-0">
                    ✓ {selfTestStats.remembered} · ★ {selfTestStats.hard}
                  </span>
                )}
              </div>
            )}

            {/* Aktif Adım Bilgi & 4 Kademeli Maske Seçici Şeridi */}
            {currentStep && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
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

                {/* 4 Kademeli Maske Hapları (360px taşmasız flex-wrap) */}
                <div
                  className="p-0.5 rounded-xl border flex flex-wrap items-center gap-0.5 max-w-full"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {MASK_ORDER.map((mId) => {
                    const active = mask === mId;
                    return (
                      <button
                        key={mId}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setMask(mId);
                          if (mId === 'word_reveal') {
                            setRevealedWordCounts({});
                          }
                        }}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap"
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
                    <span>Şimdi ezberden tekrar edin...</span>
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
                      <span>Atla</span>
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
                  backgroundColor: 'var(--state-danger-bg)',
                  borderColor: 'rgba(239, 68, 68, 0.35)',
                  color: 'var(--state-danger-text)',
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
                  <p
                    className="text-xs sm:text-sm max-w-md mx-auto"
                    style={{ color: 'var(--text-secondary)' }}
                  >
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
            ) : isSelfTest || prefs.viewMode === 'focus' ? (
              /* ODAK KARTI & ÖZ-SINAV GÖRÜNÜMÜ */
              <div className="space-y-3">
                {activeStepKeys.map((key) => {
                  const verse = verseMap.get(key);
                  if (!verse) return null;
                  const isActiveAudio = audioSnap.activeVerseKey === key;
                  const isStarred = unit.starredVerseKeys.includes(key);
                  const mealVerse = showMealHint ? getPrimaryVerse(verse) : null;
                  const { totalWords } = tokenizeArabicWordsPreserveLayout(verse.ar.t);
                  const revealedCount = revealedWordCounts[key] ?? 1;
                  const canRevealMore =
                    mask === 'hidden' || (mask === 'word_reveal' && revealedCount < totalWords);
                  const mutashabihatCount = getMutashabihatCount(verse.surah, verse.ayah);

                  return (
                    <div
                      key={key}
                      data-zen-verse-key={key}
                      onPointerDown={handleCardPointerDown}
                      onPointerUp={() => handleCardPointerEnd(key, false)}
                      onPointerLeave={() => handleCardPointerEnd(undefined, true)}
                      onPointerCancel={() => handleCardPointerEnd(undefined, true)}
                      className="rounded-3xl border p-4 sm:p-7 transition-all select-none touch-manipulation"
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
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
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

                          {mutashabihatCount > 0 && (
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                sfxService.play('click');
                                openMutashabihat(verse.surah, verse.ayah);
                              }}
                              title="Bu ayetin benzer (müteşâbih) ayetlerini karşılaştır"
                              className="min-h-[28px] px-2.5 py-0.5 rounded-xl border text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors"
                              style={{
                                backgroundColor: 'var(--brand-accent-soft)',
                                borderColor: 'rgba(217, 119, 6, 0.35)',
                                color: 'var(--brand-accent-text)',
                              }}
                            >
                              <ArrowLeftRight className="w-3 h-3 shrink-0" />
                              <span>Müteşâbih Uyarı ({mutashabihatCount})</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {canRevealMore && (
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                sfxService.play('click');
                                revealNextWordForVerse(key);
                              }}
                              className="min-h-[30px] px-2.5 rounded-xl border text-[11px] font-extrabold cursor-pointer"
                              style={{
                                backgroundColor: 'var(--brand-primary-soft)',
                                borderColor: 'rgba(15, 118, 110, 0.3)',
                                color: 'var(--brand-primary-text)',
                              }}
                            >
                              +1 Kelime Aç
                              {mask === 'word_reveal' ? ` (${revealedCount}/${totalWords})` : ''}
                            </button>
                          )}

                          {mask !== 'open' && !canRevealMore && (
                            <span
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-lg"
                              style={{
                                backgroundColor: 'var(--bg-surface-soft)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {isPeeking ? 'Gösteriliyor' : 'Basılı tut: Tamamını gör'}
                            </span>
                          )}

                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStarVerse(key);
                            }}
                            title={
                              isStarred
                                ? 'Zorlandığım ayetlerden çıkar'
                                : 'Zorlandığım ayet olarak işaretle'
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

                      {mask === 'word_reveal' && (
                        <p
                          className="text-[11px] mb-2 font-medium"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Sıradaki kelimeyi açmak için ayete dokunun · Tamamını görmek için basılı tutun
                        </p>
                      )}

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
                        {renderMaskedArabic(verse, key)}
                        <AyahEndMarker
                          ayahNo={verse.ayah}
                          isPlaying={isActiveAudio}
                          highlightPlayingBg={isActiveAudio}
                          theme={settings.theme}
                          size="card"
                          title={`${verse.ayah}. Ayet`}
                        />
                      </p>

                      {/* Öz-Sınav Alt Değerlendirme Butonları */}
                      {isSelfTest && (
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          className="mt-5 pt-4 border-t space-y-2.5"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sfxService.play('click');
                              setMask((m) => (m === 'open' ? 'hidden' : 'open'));
                            }}
                            className="w-full min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              borderColor: 'var(--border-strong)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {mask === 'open' ? (
                              <>
                                <EyeOff className="w-4 h-4" />
                                <span>Metni Tekrar Gizle</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-4 h-4" />
                                <span>Metni Aç &amp; Kontrol Et</span>
                              </>
                            )}
                          </button>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelfTestAnswer(key, false);
                              }}
                              className="min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                              style={{
                                backgroundColor: 'var(--brand-accent-soft)',
                                borderColor: 'rgba(217, 119, 6, 0.4)',
                                color: 'var(--brand-accent-text)',
                              }}
                            >
                              <Star className="w-4 h-4 fill-current shrink-0" />
                              <span>Zorlandım (Yıldızla)</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelfTestAnswer(key, true);
                              }}
                              className="min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                              style={{ backgroundColor: 'var(--brand-primary)' }}
                            >
                              <Check className="w-4 h-4 shrink-0" />
                              <span>Hatırladım</span>
                            </button>
                          </div>
                        </div>
                      )}

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
                onPointerDown={handleCardPointerDown}
                onPointerUp={() => handleCardPointerEnd(highlightedVerseKey ?? undefined, false)}
                onPointerLeave={() => handleCardPointerEnd(undefined, true)}
                onPointerCancel={() => handleCardPointerEnd(undefined, true)}
                className="rounded-3xl border-2 p-5 sm:p-8 shadow-sm select-none touch-manipulation space-y-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-2 text-xs pb-2 border-b"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span className="font-extrabold" style={{ color: 'var(--brand-primary-text)' }}>
                    Mushaf Görünümü · {unit.title}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {highlightedVerseKey && (() => {
                      const parsed = parseVerseKey(highlightedVerseKey);
                      const mCount = getMutashabihatCount(parsed.surah, parsed.ayah);
                      if (mCount <= 0) return null;
                      return (
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            sfxService.play('click');
                            openMutashabihat(parsed.surah, parsed.ayah);
                          }}
                          title="Aktif ayetin benzer (müteşâbih) ayetlerini karşılaştır"
                          className="px-2.5 py-1 rounded-lg border text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
                          style={{
                            backgroundColor: 'var(--brand-accent-soft)',
                            borderColor: 'rgba(217, 119, 6, 0.35)',
                            color: 'var(--brand-accent-text)',
                          }}
                        >
                          <ArrowLeftRight className="w-3 h-3 shrink-0" />
                          <span>Müteşâbih Uyarı ({mCount})</span>
                        </button>
                      );
                    })()}
                    {(mask === 'word_reveal' || mask === 'hidden') && highlightedVerseKey && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          sfxService.play('click');
                          revealNextWordForVerse(highlightedVerseKey);
                        }}
                        className="px-2.5 py-1 rounded-lg border text-[11px] font-extrabold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          borderColor: 'rgba(15, 118, 110, 0.3)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        +1 Kelime Aç
                      </button>
                    )}
                    {mask !== 'open' && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {isPeeking
                          ? 'Açık gösteriliyor'
                          : mask === 'word_reveal'
                            ? 'Dokun: +1 kelime · Basılı tut: Gör'
                            : 'Görmek için basılı tutun'}
                      </span>
                    )}
                  </div>
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
                        data-zen-verse-key={key}
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
                        {inStep ? renderMaskedArabic(verse, key) : verse.ar.t}
                        <AyahEndMarker
                          ayahNo={verse.ayah}
                          isPlaying={isActiveAudio}
                          highlightPlayingBg={isActiveAudio}
                          theme={settings.theme}
                          size="mushaf"
                          title={`${verse.ayah}. Ayet`}
                        />{' '}
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
                    <p
                      className="turkish-reading text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
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

            {/* Gölge Tekrar (Shadowing) Hızlı Anahtarı + Sesli Öz-Denetim Barı (RAM-only) */}
            {currentStep?.phase !== 'checkpoint' && (
              <div className="space-y-2.5">
                {!isSelfTest && !isTeacherReciter && (
                  <div
                    className="rounded-2xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: prefs.listenRepeatPauseEnabled
                        ? 'var(--brand-accent)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Timer
                        className="w-4 h-4 shrink-0"
                        style={{
                          color: prefs.listenRepeatPauseEnabled
                            ? 'var(--brand-accent-text)'
                            : 'var(--text-muted)',
                        }}
                      />
                      <span className="text-xs font-extrabold truncate">
                        Gölge Tekrar Boşluğu
                      </span>
                    </div>

                    <div
                      className="inline-flex items-center p-0.5 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          onChangePrefs({ listenRepeatPauseEnabled: false });
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors"
                        style={{
                          backgroundColor: !prefs.listenRepeatPauseEnabled
                            ? 'var(--bg-surface)'
                            : 'transparent',
                          color: !prefs.listenRepeatPauseEnabled
                            ? 'var(--text-primary)'
                            : 'var(--text-muted)',
                        }}
                      >
                        Kapalı
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          onChangePrefs({ listenRepeatPauseEnabled: true, pauseMultiplier: 1 });
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors"
                        style={{
                          backgroundColor: prefs.listenRepeatPauseEnabled
                            ? 'var(--brand-accent)'
                            : 'transparent',
                          color: prefs.listenRepeatPauseEnabled
                            ? '#FFFFFF'
                            : 'var(--text-muted)',
                        }}
                      >
                        1x Ayet Süresi Bekle
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor:
                      isComparePanelOpen || isRecording || recordedBlobUrl
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                  }}
                >
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setIsComparePanelOpen((v) => !v);
                      }}
                      className="flex items-center gap-2 text-left min-w-0 cursor-pointer flex-1"
                    >
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: isRecording
                            ? 'rgba(239, 68, 68, 0.14)'
                            : 'var(--brand-primary-soft)',
                          color: isRecording ? '#DC2626' : 'var(--brand-primary-text)',
                        }}
                      >
                        <Mic className={`w-4 h-4 ${isRecording ? 'animate-pulse' : ''}`} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold truncate">
                          Sesli Öz-Denetim (Kaydet &amp; Kıyasla)
                        </p>
                        <p
                          className="text-[11px] truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {!canRecordAudio
                            ? 'Bu tarayıcı mikrofon kaydını desteklemiyor'
                            : isRequestingMic
                              ? 'Mikrofon izni bekleniyor...'
                              : isRecording
                                ? `Kaydediliyor · ${formatClock(recordingSec)} / 1:30`
                                : recordedBlobUrl
                                  ? `Kayıt hazır (${formatClock(recordedDurationSec)}) · Sadece cihaz belleğinde`
                                  : 'Sesiniz sunucuya gönderilmez; Kurrâ → Ben sırasıyla kıyaslayın'}
                        </p>
                      </div>
                    </button>

                    {canRecordAudio && !isComparePanelOpen && !isRecording && !recordedBlobUrl && (
                      <button
                        type="button"
                        disabled={isRecording || isRequestingMic}
                        onClick={() => {
                          setIsComparePanelOpen(true);
                          void startVoiceRecording();
                        }}
                        className="min-h-[36px] px-3 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>{isRequestingMic ? 'İzin Bekleniyor...' : 'Oku & Kaydet'}</span>
                      </button>
                    )}
                  </div>

                  {(isComparePanelOpen || isRecording || isRequestingMic || recordedBlobUrl) && (
                    <div
                      className="px-3.5 pb-3 pt-2 border-t space-y-2.5"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {recordingError && (
                        <p
                          role="alert"
                          className="text-xs font-semibold leading-snug text-red-600 dark:text-red-400"
                        >
                          {recordingError}
                        </p>
                      )}

                      {recordingNotice && !recordingError && (
                        <p
                          role="status"
                          className="text-xs font-semibold leading-snug px-2.5 py-1.5 rounded-lg border"
                          style={{
                            backgroundColor: 'var(--brand-accent-soft)',
                            borderColor: 'rgba(217, 119, 6, 0.35)',
                            color: 'var(--brand-accent-text)',
                          }}
                        >
                          {recordingNotice}
                        </p>
                      )}

                      {!canRecordAudio ? (
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          Tarayıcınız MediaRecorder ses kaydını desteklemiyor. Kurrâ tilavetini
                          dinleyip Gölge Tekrar boşluğuyla çalışmaya devam edebilirsiniz.
                        </p>
                      ) : isRequestingMic ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div
                            className="flex items-center gap-2 text-xs font-bold"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>Mikrofon izni bekleniyor...</span>
                          </div>
                          <button
                            type="button"
                            onClick={stopVoiceRecording}
                            className="min-h-[36px] px-3 rounded-xl border text-xs font-bold cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            İptal
                          </button>
                        </div>
                      ) : isRecording ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-red-600 dark:text-red-400 tabular-nums">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                            <span>Kayıt sürüyor · {formatClock(recordingSec)} / 1:30</span>
                            {MAX_RECORDING_SEC - recordingSec <= 15 && (
                              <span
                                className="px-2 py-0.5 rounded-md text-[11px] font-extrabold border"
                                style={{
                                  backgroundColor: 'rgba(217, 119, 6, 0.16)',
                                  borderColor: 'rgba(217, 119, 6, 0.45)',
                                  color: '#B45309',
                                }}
                              >
                                Son {Math.max(0, MAX_RECORDING_SEC - recordingSec)} sn
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={stopVoiceRecording}
                            className="min-h-[38px] px-4 rounded-xl bg-red-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>Durdur</span>
                          </button>
                        </div>
                      ) : recordedBlobUrl ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => playUserVoice(false)}
                            className="flex-1 min-w-[120px] min-h-[38px] px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            style={{
                              backgroundColor:
                                voicePlaybackState === 'playing_user'
                                  ? 'var(--brand-primary)'
                                  : 'var(--bg-surface)',
                              borderColor: 'var(--brand-primary)',
                              color:
                                voicePlaybackState === 'playing_user'
                                  ? '#FFFFFF'
                                  : 'var(--brand-primary-text)',
                            }}
                          >
                            {voicePlaybackState === 'playing_user' ? (
                              <>
                                <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                                <span>Durdur</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                                <span>Kaydımı Dinle</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => playUserVoice(true)}
                            className="flex-1 min-w-[165px] min-h-[38px] px-3 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            <Repeat className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {voicePlaybackState === 'comparing_reciter'
                                ? '1/2 Kurrâ Okuyor...'
                                : voicePlaybackState === 'comparing_user'
                                  ? '2/2 Sizin Kaydınız...'
                                  : 'Kıyasla (Kurrâ → Ben)'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              clearRecordedVoice();
                            }}
                            title="Kaydı sil ve yeniden kaydet"
                            aria-label="Kaydı sil"
                            className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer text-red-500"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Sil</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Aktif ayeti okuyun, ardından Kurrâ → Ben sırasıyla peş peşe kıyaslayın.
                          </span>
                          <button
                            type="button"
                            disabled={isRecording || isRequestingMic}
                            onClick={() => void startVoiceRecording()}
                            className="min-h-[38px] px-4 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>Oku &amp; Kaydet</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Başparmak Erişimli Alt Kontrol Çubuğu (Mobil & Masaüstü) */}
      <footer
        className="px-2.5 sm:px-5 py-2.5 border-t shrink-0"
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
            className="min-h-[46px] px-1 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer"
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
            className="min-h-[46px] px-1 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-35"
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
            className="min-h-[46px] px-1 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer"
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
            className="min-h-[46px] px-1 rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer"
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
