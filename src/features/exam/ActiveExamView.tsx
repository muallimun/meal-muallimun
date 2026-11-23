import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Flag,
  Flame,
  Grid,
  Heart,
  Lock,
  Scissors,
  Star,
  Timer,
  X,
  XCircle,
} from 'lucide-react';
import { QuestionReportModal } from '../../components/QuestionReportModal';
import { audioQueueService } from '../../services/audioQueueService';
import { useBackButtonGuard } from '../../services/backStackService';
import { sfxService } from '../../services/sfxService';
import { wakeLockService } from '../../services/wakeLockService';
import { useAppStore } from '../../store/useAppStore';
import type { ExamAnswerRecord, ExamSessionState } from '../../types/quran';
import {
  OPTION_LETTERS,
  formatClockTimer,
  formatPremiseItem,
  formatSourceRefLabel,
  getDifficultyInfo,
} from '../../utils/examUtils';
import { FormattedStem } from './FormattedStem';
import { RelatedVerseDrawer } from './RelatedVerseDrawer';

interface ActiveExamViewProps {
  session: ExamSessionState;
  onUpdateSession: (updater: (prev: ExamSessionState) => ExamSessionState) => void;
  onCompleteExam: (finalSession: ExamSessionState, endedByNoLives?: boolean) => void;
  onExitKeepSession: () => void;
  onExitDiscardSession: () => void;
}

export const ActiveExamView: React.FC<ActiveExamViewProps> = ({
  session,
  onUpdateSession,
  onCompleteExam,
  onExitKeepSession,
  onExitDiscardSession,
}) => {
  const { settings, meta, gamification, questionAudit, toggleBookmarkQuestion } = useAppStore();

  const [showExitModal, setShowExitModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showPaletteModal, setShowPaletteModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [openPracticeVerseDrawer, setOpenPracticeVerseDrawer] = useState(false);
  const [backGuardNonce, setBackGuardNonce] = useState(0);

  // Mobil fiziksel/kaydırmalı Geri tuşunda sınavı aniden kaybetmeden çıkış onayı aç ve tekrar kur
  useBackButtonGuard(
    'active_exam_view',
    true,
    () => {
      if (showReportModal) {
        setShowReportModal(false);
      } else if (showPaletteModal) {
        setShowPaletteModal(false);
      } else if (showFinishModal) {
        setShowFinishModal(false);
      } else if (showExitModal) {
        setShowExitModal(false);
      } else {
        setShowExitModal(true);
      }
      setBackGuardNonce((n) => n + 1);
    },
    backGuardNonce,
  );

  const isCompletingRef = useRef(false);
  const feedbackSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileStripRef = useRef<HTMLDivElement | null>(null);
  // Yarışma Arenası'nda aktif sorudan geri dönülüp tekrar gelindiğinde sürenin sıfırlanmasını engeller
  const arenaStartedUidsRef = useRef<Set<string>>(
    new Set(
      session.questions[session.currentIndex]
        ? [session.questions[session.currentIndex].uid]
        : [],
    ),
  );

  // Sınav açıldığında arka plandaki tilavet/meal sesini duraklat ve ekran kilidini tazele
  useEffect(() => {
    audioQueueService.pause();
    wakeLockService.ensureLock();
  }, []);

  const currentQuestion = session.questions[session.currentIndex];
  const currentAnswer = currentQuestion ? session.answers[currentQuestion.uid] : undefined;
  const isMock = session.config.mode === 'mock';
  const isArena = session.config.mode === 'arena';
  const isPractice = session.config.mode === 'practice';

  const isAnswered = Boolean(currentAnswer);
  const isLocked = !isMock && isAnswered;
  const isOutOfLives = isArena && session.livesRemaining <= 0;

  // Soru değişince Antrenman ayet çekmecesini varsayılan kapalı konuma al ve mobil şeridi hizala
  useEffect(() => {
    setOpenPracticeVerseDrawer(false);
    if (currentQuestion && isArena && !session.answers[currentQuestion.uid]) {
      arenaStartedUidsRef.current.add(currentQuestion.uid);
    }
    const strip = mobileStripRef.current;
    if (strip) {
      const activeChip = strip.querySelector<HTMLElement>(
        `[data-nav-idx="${session.currentIndex}"]`,
      );
      if (activeChip) {
        const targetLeft =
          activeChip.offsetLeft - strip.clientWidth / 2 + activeChip.clientWidth / 2;
        strip.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      }
    }
  }, [session.currentIndex, currentQuestion, isArena, session.answers]);

  const surahMeta = useMemo(() => {
    if (!meta || !currentQuestion) return null;
    return meta.surahs.find((s) => s.no === currentQuestion.question.surah) ?? null;
  }, [meta, currentQuestion]);

  const diffInfo = getDifficultyInfo(currentQuestion?.question.difficulty);
  const isBookmarked = currentQuestion
    ? gamification.bookmarkedQuestionIds.includes(currentQuestion.uid)
    : false;
  const isFlagged = currentQuestion ? session.flaggedUids.includes(currentQuestion.uid) : false;
  const isIssueReported = currentQuestion
    ? Boolean(
        questionAudit.reports[currentQuestion.uid] ||
          questionAudit.reports[currentQuestion.question.id],
      )
    : false;
  const eliminatedSet = useMemo(
    () =>
      new Set(
        currentQuestion ? (session.eliminatedOptionsByUid[currentQuestion.uid] ?? []) : [],
      ),
    [currentQuestion, session.eliminatedOptionsByUid],
  );
  const isHintRevealed = currentQuestion
    ? session.hintRevealedUids.includes(currentQuestion.uid)
    : false;

  // İstatistik özetleri (Navigatör & Bitir Onay Modalı için)
  const { correctCount, wrongCount, answeredCount, blankCount } = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    for (const q of session.questions) {
      const ans = session.answers[q.uid];
      if (!ans) continue;
      if (ans.isCorrect) correct += 1;
      else wrong += 1;
    }
    const answered = correct + wrong;
    return {
      correctCount: correct,
      wrongCount: wrong,
      answeredCount: answered,
      blankCount: Math.max(0, session.questions.length - answered),
    };
  }, [session.questions, session.answers]);

  // Yarışma Arenası kilit/erişim sınırı: ilk cevaplanmamış soru aktif sınır sorusudur
  const arenaFrontierIndex = useMemo(() => {
    const firstUnanswered = session.questions.findIndex((q) => !session.answers[q.uid]);
    return firstUnanswered === -1 ? session.questions.length - 1 : firstUnanswered;
  }, [session.questions, session.answers]);

  const canAccessQuestion = useCallback(
    (idx: number): boolean => {
      if (idx < 0 || idx >= session.questions.length) return false;
      if (!isArena) return true;
      const q = session.questions[idx];
      if (session.answers[q.uid]) return true;
      if (isOutOfLives) return false;
      return idx === arenaFrontierIndex;
    },
    [session.questions, session.answers, isArena, isOutOfLives, arenaFrontierIndex],
  );

  // Süre sayacı (tüm modlarda elapsedSec; Arena'da soru geri sayımı; Deneme'de toplam geri sayım)
  const triggerComplete = useCallback(
    (finalSession: ExamSessionState, endedByNoLives = false) => {
      if (isCompletingRef.current) return;
      isCompletingRef.current = true;
      onCompleteExam(finalSession, endedByNoLives);
    },
    [onCompleteExam],
  );

  useEffect(() => {
    if (showExitModal || showFinishModal || showReportModal) return;

    const timer = window.setInterval(() => {
      onUpdateSession((prev) => {
        const q = prev.questions[prev.currentIndex];
        if (!q) return prev;
        const alreadyAnswered = Boolean(prev.answers[q.uid]);

        // Arena modunda soru cevaplanmışsa süreyi dondur
        if (prev.config.mode === 'arena' && alreadyAnswered) {
          return prev;
        }

        const nextElapsed = prev.elapsedSec + 1;

        if (prev.config.mode === 'arena') {
          const nextQSec = Math.max(0, prev.questionRemainingSec - 1);
          if (nextQSec === 0 && !alreadyAnswered) {
            sfxService.play('wrong');
            const timeoutRecord: ExamAnswerRecord = {
              questionUid: q.uid,
              selectedIndex: null,
              isCorrect: false,
              timedOut: true,
              answeredAt: new Date().toISOString(),
            };
            return {
              ...prev,
              elapsedSec: nextElapsed,
              questionRemainingSec: 0,
              livesRemaining: Math.max(0, prev.livesRemaining - 1),
              currentStreak: 0,
              answers: {
                ...prev.answers,
                [q.uid]: timeoutRecord,
              },
            };
          }
          return {
            ...prev,
            elapsedSec: nextElapsed,
            questionRemainingSec: nextQSec,
          };
        }

        if (prev.config.mode === 'mock') {
          const nextTotalSec = Math.max(0, prev.totalRemainingSec - 1);
          const updated = {
            ...prev,
            elapsedSec: nextElapsed,
            totalRemainingSec: nextTotalSec,
          };
          if (nextTotalSec === 0) {
            window.setTimeout(() => triggerComplete(updated, false), 0);
          }
          return updated;
        }

        return {
          ...prev,
          elapsedSec: nextElapsed,
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [onUpdateSession, showExitModal, showFinishModal, showReportModal, triggerComplete]);

  // Şık seçimi
  const handleSelectOption = useCallback(
    (optionIndex: number) => {
      if (!currentQuestion) return;
      if (eliminatedSet.has(optionIndex)) return;
      if (!isMock && isAnswered) return;

      const isCorrect = optionIndex === currentQuestion.correctDisplayIndex;

      if (isMock) {
        sfxService.play('click');
        onUpdateSession((prev) => ({
          ...prev,
          answers: {
            ...prev.answers,
            [currentQuestion.uid]: {
              questionUid: currentQuestion.uid,
              selectedIndex: optionIndex,
              isCorrect,
              answeredAt: new Date().toISOString(),
            },
          },
        }));
        return;
      }

      // Antrenman ve Yarışma Arenası: Anında dönüt + SFX
      sfxService.play(isCorrect ? 'correct' : 'wrong');

      onUpdateSession((prev) => {
        if (prev.answers[currentQuestion.uid]) return prev;
        const nextStreak = isCorrect ? prev.currentStreak + 1 : 0;
        const nextMaxStreak = Math.max(prev.maxStreak, nextStreak);
        const nextLives =
          prev.config.mode === 'arena' && !isCorrect
            ? Math.max(0, prev.livesRemaining - 1)
            : prev.livesRemaining;

        return {
          ...prev,
          currentStreak: nextStreak,
          maxStreak: nextMaxStreak,
          livesRemaining: nextLives,
          answers: {
            ...prev.answers,
            [currentQuestion.uid]: {
              questionUid: currentQuestion.uid,
              selectedIndex: optionIndex,
              isCorrect,
              answeredAt: new Date().toISOString(),
            },
          },
        };
      });
    },
    [currentQuestion, eliminatedSet, isMock, isAnswered, onUpdateSession],
  );

  // Deneme modunda seçimi temizle (boş bırak)
  const handleClearMockAnswer = () => {
    if (!isMock || !currentQuestion) return;
    sfxService.play('click');
    onUpdateSession((prev) => {
      const nextAnswers = { ...prev.answers };
      delete nextAnswers[currentQuestion.uid];
      return { ...prev, answers: nextAnswers };
    });
  };

  // Şüpheli işaretleme (Deneme modu)
  const handleToggleFlag = () => {
    if (!currentQuestion) return;
    sfxService.play('click');
    onUpdateSession((prev) => {
      const exists = prev.flaggedUids.includes(currentQuestion.uid);
      const nextFlags = exists
        ? prev.flaggedUids.filter((id) => id !== currentQuestion.uid)
        : [...prev.flaggedUids, currentQuestion.uid];
      return { ...prev, flaggedUids: nextFlags };
    });
  };

  // İleri / Geri ve Palet soru geçişleri (Mod kurallarına saygılı)
  const handleGoToQuestion = useCallback(
    (targetIdx: number) => {
      const clamped = Math.max(0, Math.min(session.questions.length - 1, targetIdx));
      if (clamped === session.currentIndex) return;
      if (!canAccessQuestion(clamped)) return;

      sfxService.play('click');
      onUpdateSession((prev) => {
        const targetQ = prev.questions[clamped];
        let nextQSec = prev.questionRemainingSec;

        if (prev.config.mode === 'arena' && targetQ) {
          const isFreshUnanswered =
            !prev.answers[targetQ.uid] && !arenaStartedUidsRef.current.has(targetQ.uid);
          if (isFreshUnanswered) {
            arenaStartedUidsRef.current.add(targetQ.uid);
            nextQSec = prev.config.arenaTimePerQuestion;
          }
        }

        return {
          ...prev,
          currentIndex: clamped,
          questionRemainingSec: nextQSec,
        };
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [session.questions.length, session.currentIndex, canAccessQuestion, onUpdateSession],
  );

  const handleRequestFinish = useCallback(() => {
    if (isOutOfLives) {
      triggerComplete(session, true);
      return;
    }
    if (!isMock && blankCount === 0) {
      triggerComplete(session, false);
      return;
    }
    sfxService.play('click');
    setShowFinishModal(true);
  }, [isOutOfLives, isMock, blankCount, session, triggerComplete]);

  const handleNextOrFinish = useCallback(() => {
    if (isOutOfLives) {
      triggerComplete(session, true);
      return;
    }

    const isLast = session.currentIndex >= session.questions.length - 1;
    if (isLast) {
      handleRequestFinish();
      return;
    }

    if (canAccessQuestion(session.currentIndex + 1)) {
      handleGoToQuestion(session.currentIndex + 1);
    }
  }, [
    isOutOfLives,
    session,
    triggerComplete,
    handleRequestFinish,
    canAccessQuestion,
    handleGoToQuestion,
  ]);

  // Yarışma Arenası 3 Joker
  const handleUseFiftyFifty = () => {
    if (!isArena || isAnswered || session.jokers.fiftyFiftyUsed || !currentQuestion) return;
    const wrongIndices = currentQuestion.options
      .map((_, idx) => idx)
      .filter((idx) => idx !== currentQuestion.correctDisplayIndex);

    if (wrongIndices.length < 2) return;
    sfxService.play('click');

    const shuffledWrong = [...wrongIndices].sort(() => Math.random() - 0.5);
    const toEliminate = shuffledWrong.slice(0, 2);

    onUpdateSession((prev) => ({
      ...prev,
      jokers: { ...prev.jokers, fiftyFiftyUsed: true },
      eliminatedOptionsByUid: {
        ...prev.eliminatedOptionsByUid,
        [currentQuestion.uid]: toEliminate,
      },
    }));
  };

  const handleUseVerseHint = () => {
    if (!isArena || isAnswered || session.jokers.verseHintUsed || !currentQuestion) return;
    sfxService.play('click');
    onUpdateSession((prev) => ({
      ...prev,
      jokers: { ...prev.jokers, verseHintUsed: true },
      hintRevealedUids: prev.hintRevealedUids.includes(currentQuestion.uid)
        ? prev.hintRevealedUids
        : [...prev.hintRevealedUids, currentQuestion.uid],
    }));
  };

  const handleUseExtraTime = () => {
    if (!isArena || isAnswered || session.jokers.extraTimeUsed) return;
    sfxService.play('click');
    onUpdateSession((prev) => ({
      ...prev,
      jokers: { ...prev.jokers, extraTimeUsed: true },
      questionRemainingSec: prev.questionRemainingSec + 30,
    }));
  };

  // Masaüstü klavye kısayolları: 1-4 / A-D, Enter, Sol/Sağ ok
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showExitModal || showFinishModal || showPaletteModal || showReportModal) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }

      if (!currentQuestion) return;

      const key = e.key.toLowerCase();
      const map: Record<string, number> = {
        '1': 0,
        a: 0,
        '2': 1,
        b: 1,
        '3': 2,
        c: 2,
        '4': 3,
        d: 3,
        '5': 4,
        e: 4,
      };

      if (key in map) {
        const idx = map[key];
        if (idx < currentQuestion.options.length) {
          e.preventDefault();
          handleSelectOption(idx);
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (canAccessQuestion(session.currentIndex - 1)) {
          e.preventDefault();
          handleGoToQuestion(session.currentIndex - 1);
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        if (canAccessQuestion(session.currentIndex + 1)) {
          e.preventDefault();
          handleGoToQuestion(session.currentIndex + 1);
        }
        return;
      }

      if (e.key === 'Enter') {
        if (isMock || isPractice || isAnswered) {
          e.preventDefault();
          handleNextOrFinish();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showExitModal,
    showFinishModal,
    showPaletteModal,
    showReportModal,
    currentQuestion,
    session.currentIndex,
    isMock,
    isPractice,
    isAnswered,
    canAccessQuestion,
    handleSelectOption,
    handleGoToQuestion,
    handleNextOrFinish,
  ]);

  if (!currentQuestion) return null;

  const totalCount = session.questions.length;
  const progressPct = Math.round(((session.currentIndex + 1) / totalCount) * 100);
  const isLastQuestion = session.currentIndex >= totalCount - 1;
  const canGoPrev = canAccessQuestion(session.currentIndex - 1);
  const canGoNext = !isLastQuestion && canAccessQuestion(session.currentIndex + 1);

  const timerValue = isArena
    ? session.questionRemainingSec
    : isMock
      ? session.totalRemainingSec
      : session.elapsedSec;
  const isTimerUrgent =
    (isArena && session.questionRemainingSec <= 10) ||
    (isMock && session.totalRemainingSec <= 60);

  // Çok kısa şıklar (örn. "Yalnız I", "I ve II") için 2x2 düzenli ızgara; normal şıklarda dikey tek sütun
  const areVeryShortOptions =
    currentQuestion.options.length <= 4 &&
    currentQuestion.options.every((o) => o.trim().length <= 38 && !o.includes('\n'));

  // Palet kutucuk stilini 3 mod için tutarlı üreten yardımcı
  const getPaletteTileVisual = (idx: number) => {
    const q = session.questions[idx];
    const ans = session.answers[q.uid];
    const flagged = isMock && session.flaggedUids.includes(q.uid);
    const isCurrent = idx === session.currentIndex;
    const accessible = canAccessQuestion(idx);

    let bgColor = 'var(--bg-surface-soft)';
    let borderColor = 'var(--border-subtle)';
    let textColor = 'var(--text-primary)';

    if (isMock) {
      if (ans) {
        bgColor = 'rgba(16, 185, 129, 0.16)';
        borderColor = 'rgba(16, 185, 129, 0.42)';
        textColor = '#059669';
      }
      if (flagged) {
        borderColor = '#F59E0B';
      }
    } else {
      if (ans?.isCorrect) {
        bgColor = 'rgba(16, 185, 129, 0.16)';
        borderColor = 'rgba(16, 185, 129, 0.45)';
        textColor = '#059669';
      } else if (ans && !ans.isCorrect) {
        bgColor = 'rgba(239, 68, 68, 0.14)';
        borderColor = 'rgba(239, 68, 68, 0.45)';
        textColor = '#DC2626';
      } else if (!accessible) {
        bgColor = 'var(--bg-surface-soft)';
        borderColor = 'transparent';
        textColor = 'var(--text-muted)';
      }
    }

    if (isCurrent) {
      borderColor = 'var(--brand-primary)';
      if (!ans) {
        bgColor = 'var(--brand-primary-soft)';
        textColor = 'var(--brand-primary-text)';
      }
    }

    return { bgColor, borderColor, textColor, flagged, isCurrent, accessible, ans };
  };

  const renderPaletteGrid = (closeOnSelect: boolean) => (
    <div className="grid grid-cols-5 gap-1.5">
      {session.questions.map((q, idx) => {
        const { bgColor, borderColor, textColor, flagged, isCurrent, accessible } =
          getPaletteTileVisual(idx);

        return (
          <button
            key={q.uid}
            type="button"
            disabled={!accessible}
            onClick={() => {
              if (!accessible) return;
              if (closeOnSelect) setShowPaletteModal(false);
              handleGoToQuestion(idx);
            }}
            aria-label={`Soru ${idx + 1}${!accessible ? ' (kilitli)' : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
            className={`relative h-9 rounded-lg border-2 text-xs font-extrabold tabular-nums flex items-center justify-center transition-all ${
              accessible
                ? 'cursor-pointer hover:opacity-90 active:scale-[0.97]'
                : 'opacity-45 cursor-not-allowed'
            }`}
            style={{
              backgroundColor: bgColor,
              borderColor,
              color: textColor,
              boxShadow: isCurrent ? '0 0 0 2px rgba(15, 118, 110, 0.18)' : undefined,
            }}
          >
            <span>{idx + 1}</span>
            {flagged && (
              <span
                className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"
                title="Şüpheli işaretli"
              />
            )}
            {!accessible && (
              <Lock className="w-2.5 h-2.5 absolute bottom-0.5 right-0.5 opacity-60" />
            )}
          </button>
        );
      })}
    </div>
  );

  const renderPaletteSummary = () =>
    isMock ? (
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="py-1.5 px-1 rounded-xl" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}>
          <p className="text-sm font-extrabold tabular-nums text-emerald-600">{answeredCount}</p>
          <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            Cevaplı
          </p>
        </div>
        <div className="py-1.5 px-1 rounded-xl" style={{ backgroundColor: 'var(--bg-surface-soft)' }}>
          <p className="text-sm font-extrabold tabular-nums">{blankCount}</p>
          <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            Boş
          </p>
        </div>
        <div className="py-1.5 px-1 rounded-xl" style={{ backgroundColor: 'var(--brand-accent-soft)' }}>
          <p
            className="text-sm font-extrabold tabular-nums"
            style={{ color: 'var(--brand-accent-text)' }}
          >
            {session.flaggedUids.length}
          </p>
          <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            Şüpheli
          </p>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="py-1.5 px-1 rounded-xl" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}>
          <p className="text-sm font-extrabold tabular-nums text-emerald-600">{correctCount}</p>
          <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            Doğru
          </p>
        </div>
        <div className="py-1.5 px-1 rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.10)' }}>
          <p className="text-sm font-extrabold tabular-nums text-red-500">{wrongCount}</p>
          <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            Yanlış
          </p>
        </div>
        <div className="py-1.5 px-1 rounded-xl" style={{ backgroundColor: 'var(--bg-surface-soft)' }}>
          <p className="text-sm font-extrabold tabular-nums">{blankCount}</p>
          <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            Kalan
          </p>
        </div>
      </div>
    );

  const renderPaletteLegend = () => (
    <div
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold"
      style={{ color: 'var(--text-muted)' }}
    >
      {isMock ? (
        <>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Cevaplandı
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> Şüpheli
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs border"
              style={{ borderColor: 'var(--border-strong)' }}
            />{' '}
            Boş
          </span>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Doğru
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-red-500" /> Yanlış
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs border-2"
              style={{ borderColor: 'var(--brand-primary)' }}
            />{' '}
            Aktif
          </span>
          {isArena && (
            <span className="inline-flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> Kilitli
            </span>
          )}
        </>
      )}
    </div>
  );

  const finishModalTitle = isMock
    ? 'Deneme Sınavını Bitir'
    : isArena
      ? 'Yarışmayı Bitir'
      : 'Antrenmanı Bitir';

  return (
    <div
      onPointerDown={() => wakeLockService.ensureLock()}
      onClick={() => wakeLockService.ensureLock()}
      className="max-w-6xl mx-auto space-y-2.5 pb-6"
    >
      {/* ====================================================================
          1. İnce Tek Şerit Aktif Sınav Üst Barı (Soru X/N · Sure · Zorluk · Süre)
          ==================================================================== */}
      <div className="surface-card rounded-2xl overflow-hidden">
        <div className="min-h-[46px] px-2.5 sm:px-3.5 py-1.5 flex items-center justify-between gap-2">
          {/* Sol: Çıkış + Soru Sayacı + Sade Metaveri (Meal Esası YOK) */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowExitModal(true);
              }}
              className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Çıkış</span>
            </button>

            <p className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap shrink-0">
              Soru {session.currentIndex + 1}/{totalCount}
            </p>

            {session.config.isMistakeCamp && (
              <span
                className="text-[11px] font-bold whitespace-nowrap shrink-0"
                style={{ color: 'var(--brand-accent-text)' }}
              >
                · Hata Kampı
              </span>
            )}

            {/* Masaüstü tek satır metaveri: Yalnızca Sure Adı ve Zorluk */}
            <div
              className="hidden md:flex items-center gap-1.5 text-xs pl-2 border-l min-w-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="font-bold truncate"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {surahMeta?.nameTr ?? `${currentQuestion.question.surah}. Sure`}
              </span>
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap shrink-0"
                style={{ backgroundColor: diffInfo.bg, color: diffInfo.color }}
              >
                {diffInfo.label}
              </span>
            </div>
          </div>

          {/* Sağ: Canlar, Seri, Süre, Mobil Palet (3 Modda da), Yıldız, Hatalı */}
          <div className="flex items-center gap-1 shrink-0">
            {isArena && (
              <div
                className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)' }}
                aria-label={`${session.livesRemaining} can kaldı`}
              >
                {[0, 1, 2].map((idx) => (
                  <Heart
                    key={idx}
                    className={`w-3.5 h-3.5 transition-transform ${
                      idx < session.livesRemaining ? 'fill-red-500 text-red-500' : 'text-red-300/40'
                    }`}
                  />
                ))}
              </div>
            )}

            {!isMock && session.currentStreak >= 2 && (
              <div
                className="px-2 py-1 rounded-lg text-xs font-extrabold tabular-nums flex items-center gap-0.5"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span>{session.currentStreak}x</span>
              </div>
            )}

            {/* Süre Sayacı */}
            <div
              className={`px-2 py-1 rounded-lg text-xs font-extrabold tabular-nums flex items-center gap-1 ${
                isTimerUrgent ? 'animate-pulse' : ''
              }`}
              style={{
                backgroundColor: isTimerUrgent
                  ? 'rgba(239, 68, 68, 0.14)'
                  : 'var(--bg-surface-soft)',
                color: isTimerUrgent ? '#DC2626' : 'var(--text-primary)',
              }}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{formatClockTimer(timerValue)}</span>
            </div>

            {/* Mobil Palet Tetikleyicisi (Tüm 3 sınav modunda aktif) */}
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowPaletteModal(true);
              }}
              aria-label="Soru paletini aç"
              className="lg:hidden min-h-[34px] px-2 rounded-lg border text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Grid className="w-3.5 h-3.5 shrink-0" />
              <span className="tabular-nums">
                {session.currentIndex + 1}/{totalCount}
              </span>
              <span className="hidden xs:inline sm:inline">Palet</span>
            </button>

            {/* Soruyu Yıldızla */}
            <button
              type="button"
              onClick={() => toggleBookmarkQuestion(currentQuestion.uid)}
              aria-label={isBookmarked ? 'Soruyu yıldızlılardan çıkar' : 'Soruyu yıldızla'}
              className="w-[34px] h-[34px] rounded-lg border flex items-center justify-center cursor-pointer transition-colors"
              style={{
                backgroundColor: isBookmarked
                  ? 'var(--brand-accent-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: isBookmarked ? 'var(--brand-accent)' : 'var(--border-subtle)',
                color: isBookmarked ? 'var(--brand-accent-text)' : 'var(--text-muted)',
              }}
            >
              <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>

            {/* Hatalı Soru Bildir */}
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowReportModal(true);
              }}
              title="Soruyu hatalı / gözden geçirilecek olarak işaretle"
              aria-label="Soruyu hatalı olarak işaretle"
              className="min-w-[34px] h-[34px] px-2 rounded-lg border flex items-center justify-center gap-1 cursor-pointer transition-colors"
              style={{
                backgroundColor: isIssueReported
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'var(--bg-surface-soft)',
                borderColor: isIssueReported ? '#EF4444' : 'var(--border-subtle)',
                color: isIssueReported ? '#DC2626' : 'var(--text-muted)',
              }}
            >
              <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline text-[11px] font-bold whitespace-nowrap">
                {isIssueReported ? 'İşaretli' : 'Hatalı'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobil Kompakt Tek Satır Metaveri: Yalnızca Sure Adı ve Zorluk */}
        <div className="flex md:hidden items-center justify-between gap-2 px-3 pb-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold truncate" style={{ color: 'var(--brand-primary-text)' }}>
              {surahMeta?.nameTr ?? `${currentQuestion.question.surah}. Sure`}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shrink-0"
              style={{ backgroundColor: diffInfo.bg, color: diffInfo.color }}
            >
              {diffInfo.label}
            </span>
          </div>
          <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
            {isMock
              ? `${answeredCount} cevap · ${blankCount} boş`
              : `${correctCount}D · ${wrongCount}Y`}
          </span>
        </div>

        {/* İnce Alt İlerleme Çizgisi */}
        <div
          className="h-[3px] w-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface-soft)' }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progressPct}%`,
              backgroundColor: 'var(--brand-primary)',
            }}
          />
        </div>
      </div>

      {/* ====================================================================
          2. Mobil Yatay Kaydırılabilir Kompakt Soru Şeridi (< 1024px)
          ==================================================================== */}
      <div
        ref={mobileStripRef}
        className="lg:hidden flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5 px-0.5 max-w-full"
        aria-label="Hızlı soru numaraları"
      >
        {session.questions.map((q, idx) => {
          const { bgColor, borderColor, textColor, flagged, isCurrent, accessible } =
            getPaletteTileVisual(idx);
          return (
            <button
              key={`mob-nav-${q.uid}`}
              data-nav-idx={idx}
              type="button"
              disabled={!accessible}
              onClick={() => handleGoToQuestion(idx)}
              className={`relative shrink-0 min-w-[34px] h-8 px-2 rounded-lg border-2 text-xs font-extrabold tabular-nums flex items-center justify-center transition-colors ${
                accessible ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
              style={{
                backgroundColor: bgColor,
                borderColor,
                color: textColor,
              }}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {idx + 1}
              {flagged && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* ====================================================================
          3. Ana 2 Sütunlu Masaüstü Düzeni: [Sol Ana Soru Kartı + Sağ Soru Navigatörü]
          ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_272px] gap-3.5 items-start">
        {/* SOL ANA SORU KARTI: Öncüller -> Soru Kökü -> (Arena Joker) -> A/B/C/D Seçenekler -> Alt Aksiyon Barı */}
        <article className="surface-card rounded-2xl p-4 sm:p-5 space-y-3.5 min-w-0">
          {/* Öncüller (Varsa I, II, III) */}
          {currentQuestion.question.premises.length > 0 && (
            <div
              className="rounded-xl border px-3.5 py-2.5 space-y-1"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {currentQuestion.question.premises.map((rawPremise, idx) => {
                const { roman, text } = formatPremiseItem(rawPremise, idx);
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-2 turkish-reading leading-snug"
                    style={{
                      fontSize: `${settings.turkishFontSize}px`,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span
                      className="font-extrabold shrink-0 min-w-[24px]"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      {roman}
                    </span>
                    <span>{text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Soru Kökü — Daima Seçeneklerin ÜSTÜNDE */}
          <FormattedStem
            text={currentQuestion.question.stem}
            className="turkish-reading font-semibold leading-snug"
            style={{
              fontSize: `${Math.min(21, settings.turkishFontSize + 1)}px`,
              color: 'var(--text-primary)',
            }}
          />

          {/* Yarışma Arenası İnce Joker Çubuğu (Soru Kökü ile A Şıkkı Arasında) */}
          {isArena && !isAnswered && (
            <div
              className="rounded-xl border px-2.5 py-2 flex flex-wrap items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <span
                className="text-[11px] font-extrabold uppercase tracking-wider px-1 hidden sm:inline"
                style={{ color: 'var(--text-muted)' }}
              >
                Jokerler
              </span>
              <div className="grid grid-cols-3 gap-1.5 flex-1 sm:flex-initial">
                <button
                  type="button"
                  disabled={session.jokers.fiftyFiftyUsed || currentQuestion.options.length < 3}
                  onClick={handleUseFiftyFifty}
                  className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Scissors
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--brand-accent-text)' }}
                  />
                  <span className="truncate whitespace-nowrap">%50 Ele</span>
                </button>

                <button
                  type="button"
                  disabled={session.jokers.verseHintUsed}
                  onClick={handleUseVerseHint}
                  className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <BookOpen
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <span className="truncate whitespace-nowrap">Ayet İpucu</span>
                </button>

                <button
                  type="button"
                  disabled={session.jokers.extraTimeUsed}
                  onClick={handleUseExtraTime}
                  className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Timer className="w-3.5 h-3.5 shrink-0" style={{ color: '#059669' }} />
                  <span className="truncate whitespace-nowrap">+30 Sn</span>
                </button>
              </div>
            </div>
          )}

          {/* Arena Ayet İpucu Açıldıysa */}
          {isArena && isHintRevealed && !isAnswered && (
            <RelatedVerseDrawer question={currentQuestion.question} hintOnly defaultOpen />
          )}

          {/* Seçenekler (A, B, C, D Harf Rozetli — Daima Soru Kökü Altında) */}
          <div
            className={
              areVeryShortOptions ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'space-y-2'
            }
          >
            {currentQuestion.options.map((optText, idx) => {
              const isEliminated = eliminatedSet.has(idx);
              const isSelected = currentAnswer?.selectedIndex === idx;
              const isCorrectOption = idx === currentQuestion.correctDisplayIndex;
              const letter = OPTION_LETTERS[idx] ?? String.fromCharCode(65 + idx);

              let borderColor = 'var(--border-subtle)';
              let bgColor = 'var(--bg-surface)';
              let badgeBg = 'var(--bg-surface-soft)';
              let badgeBorder = 'var(--border-subtle)';
              let badgeColor = 'var(--brand-primary-text)';

              if (isEliminated) {
                badgeColor = 'var(--text-muted)';
              } else if (isMock) {
                if (isSelected) {
                  borderColor = 'var(--brand-primary)';
                  bgColor = 'var(--brand-primary-soft)';
                  badgeBg = 'var(--brand-primary)';
                  badgeBorder = 'var(--brand-primary)';
                  badgeColor = '#FFFFFF';
                }
              } else if (isLocked) {
                if (isCorrectOption) {
                  borderColor = '#10B981';
                  bgColor = 'rgba(16, 185, 129, 0.12)';
                  badgeBg = '#10B981';
                  badgeBorder = '#10B981';
                  badgeColor = '#FFFFFF';
                } else if (isSelected && !isCorrectOption) {
                  borderColor = '#EF4444';
                  bgColor = 'rgba(239, 68, 68, 0.12)';
                  badgeBg = '#EF4444';
                  badgeBorder = '#EF4444';
                  badgeColor = '#FFFFFF';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isEliminated || isLocked}
                  onClick={() => handleSelectOption(idx)}
                  className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border-2 text-left flex items-start gap-2.5 transition-all ${
                    isEliminated
                      ? 'opacity-35 line-through cursor-not-allowed'
                      : isLocked
                        ? 'cursor-default'
                        : 'cursor-pointer hover:border-teal-600/55 active:scale-[0.995]'
                  }`}
                  style={{
                    borderColor,
                    backgroundColor: bgColor,
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-extrabold shrink-0"
                    style={{
                      backgroundColor: badgeBg,
                      borderColor: badgeBorder,
                      color: badgeColor,
                    }}
                  >
                    {letter}
                  </span>

                  <span
                    className="flex-1 turkish-reading leading-snug pt-0.5"
                    style={{
                      fontSize: `${settings.turkishFontSize}px`,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {optText}
                  </span>

                  {isLocked && isCorrectOption && (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-1" />
                  )}
                  {isLocked && isSelected && !isCorrectOption && (
                    <XCircle className="w-4 h-4 shrink-0 text-red-500 mt-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Anında Dönüt, Çözüm Açıklaması & İlgili Ayet (Antrenman & Arena) */}
          {!isMock && isAnswered && currentAnswer && (
            <div
              ref={feedbackSectionRef}
              className="pt-3 border-t space-y-2.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div
                className="rounded-xl p-3 flex items-start gap-2.5"
                style={{
                  backgroundColor: currentAnswer.isCorrect
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(239, 68, 68, 0.10)',
                }}
              >
                {currentAnswer.isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
                )}
                <div className="space-y-1 min-w-0 flex-1">
                  <p
                    className="text-xs sm:text-sm font-extrabold"
                    style={{ color: currentAnswer.isCorrect ? '#059669' : '#DC2626' }}
                  >
                    {currentAnswer.isCorrect
                      ? 'Tebrikler, doğru cevap!'
                      : currentAnswer.timedOut
                        ? 'Süre doldu!'
                        : 'Yanlış cevap, doğrusunu inceleyelim:'}
                  </p>
                  {currentQuestion.question.explanation && (
                    <p
                      className="text-xs sm:text-sm leading-relaxed"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {currentQuestion.question.explanation}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Kaynak: {formatSourceRefLabel(currentQuestion.question.sourceRef)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setShowReportModal(true);
                      }}
                      className="text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
                      style={{ color: isIssueReported ? '#DC2626' : 'var(--text-muted)' }}
                    >
                      <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isIssueReported
                          ? 'Hatalı soru bildirimi düzenle'
                          : 'Soruda mantık/dil hatası bildir'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <RelatedVerseDrawer
                question={currentQuestion.question}
                defaultOpen={openPracticeVerseDrawer}
              />
            </div>
          )}

          {/* ================================================================
              4. Birleşik Alt Gezinme ve Aksiyon Barı (Her 3 Sınav Tipinde de Mevcut)
              ================================================================ */}
          <div
            className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {/* Sol: Önceki */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!canGoPrev}
                onClick={() => handleGoToQuestion(session.currentIndex - 1)}
                className="min-h-[38px] px-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Önceki</span>
              </button>

              {/* Orta Aksiyon: Deneme -> Şüpheli İşaretle / Boş Bırak | Antrenman -> Ayet & Açıklama */}
              {isMock && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleFlag}
                    className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: isFlagged
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface)',
                      borderColor: isFlagged ? 'var(--brand-accent)' : 'var(--border-subtle)',
                      color: isFlagged ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                    }}
                  >
                    <Flag className={`w-3.5 h-3.5 shrink-0 ${isFlagged ? 'fill-current' : ''}`} />
                    <span className="hidden sm:inline">
                      {isFlagged ? 'İşaretli' : 'Şüpheli İşaretle'}
                    </span>
                  </button>

                  {isAnswered && (
                    <button
                      type="button"
                      onClick={handleClearMockAnswer}
                      className="min-h-[38px] px-2 rounded-xl text-xs font-semibold cursor-pointer hover:underline whitespace-nowrap"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Boş Bırak
                    </button>
                  )}
                </>
              )}

              {isPractice && isAnswered && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setOpenPracticeVerseDrawer((prev) => !prev);
                    feedbackSectionRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                    });
                  }}
                  className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: openPracticeVerseDrawer
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface)',
                    borderColor: openPracticeVerseDrawer
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Ayet &amp; Açıklama</span>
                  <span className="sm:hidden">Ayet</span>
                </button>
              )}

              {/* Mobil orta hızlı palet butonu */}
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setShowPaletteModal(true);
                }}
                className="lg:hidden min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Grid className="w-3.5 h-3.5 shrink-0" />
                <span>Palet</span>
              </button>
            </div>

            {/* Sağ: Sonraki + Sınavı Bitir */}
            <div className="flex items-center gap-1.5 ml-auto">
              {!isLastQuestion && (
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => handleGoToQuestion(session.currentIndex + 1)}
                  title={
                    !canGoNext && isArena
                      ? 'Sonraki soruya geçmek için önce bu soruyu cevaplayın'
                      : undefined
                  }
                  className="min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <span>Sonraki</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              )}

              <button
                type="button"
                onClick={handleRequestFinish}
                className="min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-transform active:scale-[0.98]"
                style={{
                  backgroundColor: isOutOfLives
                    ? '#DC2626'
                    : isLastQuestion
                      ? 'var(--brand-primary)'
                      : 'var(--brand-accent)',
                }}
              >
                <span>
                  {isOutOfLives
                    ? 'Karneyi Gör'
                    : isLastQuestion && !isMock && blankCount === 0
                      ? 'Sınavı Tamamla'
                      : 'Sınavı Bitir'}
                </span>
              </button>
            </div>
          </div>
        </article>

        {/* SAĞ MASAÜSTÜ SORU NAVİGATÖRÜ (Her 3 Sınav Modunda da Sabit & Zarif) */}
        <aside className="hidden lg:flex flex-col surface-card rounded-2xl p-3.5 space-y-3 sticky top-18">
          <div
            className="flex items-center justify-between gap-2 pb-2 border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Grid
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <h2 className="text-xs font-extrabold tracking-tight truncate">Soru Navigatörü</h2>
            </div>
            <span
              className="text-[11px] font-extrabold tabular-nums px-2 py-0.5 rounded-md shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              {answeredCount}/{totalCount}
            </span>
          </div>

          {/* İlerleme Özet Sayaçları */}
          {renderPaletteSummary()}

          {/* 5'li Optik Soru Izgarası */}
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin pr-0.5">
            {renderPaletteGrid(false)}
          </div>

          {/* Renk Açıklaması */}
          <div className="pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            {renderPaletteLegend()}
          </div>

          {/* Klavye Kısayol Özeti */}
          <p
            className="text-[10.5px] leading-relaxed rounded-xl px-2.5 py-2"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-muted)',
            }}
          >
            Kısayollar: <kbd className="font-extrabold">A–D</kbd> /{' '}
            <kbd className="font-extrabold">1–4</kbd> şık seç ·{' '}
            <kbd className="font-extrabold">←/→</kbd> veya{' '}
            <kbd className="font-extrabold">Enter</kbd> geç
          </p>

          {/* Alt Sınavı Bitir CTA */}
          <button
            type="button"
            onClick={handleRequestFinish}
            className="w-full min-h-[38px] rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95"
            style={{
              backgroundColor: isOutOfLives ? '#DC2626' : 'var(--brand-primary)',
            }}
          >
            <span>{isOutOfLives ? 'Canlar Bitti — Karneyi Gör' : 'Sınavı Bitir'}</span>
          </button>
        </aside>
      </div>

      {/* ====================================================================
          Modal 0: Hatalı Soru Bildirimi / Denetim İşaretleme
          ==================================================================== */}
      <QuestionReportModal
        question={showReportModal ? currentQuestion.question : null}
        onClose={() => setShowReportModal(false)}
      />

      {/* ====================================================================
          Modal 1: Çıkış Onayı
          ==================================================================== */}
      {showExitModal && (
        <div
          className="fixed inset-0 z-[92] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-exam-title"
        >
          <div className="surface-card rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="exit-exam-title" className="text-base font-extrabold">
                  Sınavdan çıkmak istediğinize emin misiniz?
                </h3>
                <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  İstersen ilerlemeni saklayıp sonra kaldığın yerden devam edebilir ya da sınavı
                  tamamen iptal edebilirsin.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setShowExitModal(false);
                }}
                className="min-h-[44px] w-full rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Sınava Devam Et
              </button>
              <button
                type="button"
                onClick={onExitKeepSession}
                className="min-h-[44px] w-full rounded-xl border text-sm font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                Kaydet ve Çık (Sonra Devam Et)
              </button>
              <button
                type="button"
                onClick={onExitDiscardSession}
                className="min-h-[40px] w-full rounded-xl text-xs font-bold cursor-pointer"
                style={{ color: '#DC2626' }}
              >
                Sınavı İptal Et ve Sıfırla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          Modal 2: Sınavı Bitir Onayı (Her 3 Mod İçin Uyarlanmış Özet)
          ==================================================================== */}
      {showFinishModal && (
        <div
          className="fixed inset-0 z-[92] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finish-exam-title"
        >
          <div className="surface-card rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 id="finish-exam-title" className="text-lg font-extrabold">
              {finishModalTitle}
            </h3>

            {renderPaletteSummary()}

            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              {blankCount > 0
                ? `Henüz cevaplanmamış ${blankCount} soru var. Yine de sınavı bitirip sonuç karneni ve çözüm açıklamalarını görmek istiyor musun?`
                : 'Sınavı sonlandırdığında tüm soruların doğruları, çözüm açıklamaları ve ilgili ayet mealleri karnende açılacak.'}
            </p>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setShowFinishModal(false);
                }}
                className="flex-1 min-h-[44px] rounded-xl border text-sm font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                Sınava Dön
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFinishModal(false);
                  triggerComplete(session, false);
                }}
                className="flex-1 min-h-[44px] rounded-xl text-sm font-extrabold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Bitir ve Değerlendir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          Modal 3: Mobil Soru Paleti Alt Çekmecesi (Her 3 Sınav Modunda da Aktif)
          ==================================================================== */}
      {showPaletteModal && (
        <div
          className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="palette-title"
          onClick={() => setShowPaletteModal(false)}
        >
          <div
            className="surface-card rounded-t-3xl sm:rounded-2xl p-5 max-w-md w-full max-h-[82dvh] flex flex-col gap-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                <h3 id="palette-title" className="text-base font-extrabold">
                  Soru Navigatörü ({answeredCount}/{totalCount})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaletteModal(false)}
                aria-label="Paleti kapat"
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renderPaletteSummary()}
            {renderPaletteLegend()}

            <div className="overflow-y-auto scrollbar-thin py-1">{renderPaletteGrid(true)}</div>

            <button
              type="button"
              onClick={() => {
                setShowPaletteModal(false);
                handleRequestFinish();
              }}
              className="w-full min-h-[42px] rounded-xl text-sm font-extrabold text-white cursor-pointer shrink-0"
              style={{
                backgroundColor: isOutOfLives ? '#DC2626' : 'var(--brand-primary)',
              }}
            >
              {isOutOfLives ? 'Canlar Bitti — Karneyi Gör' : 'Sınavı Bitir'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
