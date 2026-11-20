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
  Scissors,
  Star,
  Timer,
  X,
  XCircle,
} from 'lucide-react';
import { QuestionReportModal } from '../../components/QuestionReportModal';
import { audioQueueService } from '../../services/audioQueueService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { ExamAnswerRecord, ExamSessionState } from '../../types/quran';
import {
  OPTION_LETTERS,
  formatClockTimer,
  formatPremiseItem,
  formatSourceRefLabel,
  getDifficultyInfo,
  getMealBasisLabel,
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

  const isCompletingRef = useRef(false);

  // Sınav açıldığında arka plandaki tilavet/meal sesini duraklat
  useEffect(() => {
    audioQueueService.pause();
  }, []);

  const currentQuestion = session.questions[session.currentIndex];
  const currentAnswer = currentQuestion ? session.answers[currentQuestion.uid] : undefined;
  const isMock = session.config.mode === 'mock';
  const isArena = session.config.mode === 'arena';
  const isPractice = session.config.mode === 'practice';

  const isAnswered = Boolean(currentAnswer);
  const isLocked = !isMock && isAnswered;
  const isOutOfLives = isArena && session.livesRemaining <= 0;

  const surahMeta = useMemo(() => {
    if (!meta || !currentQuestion) return null;
    return meta.surahs.find((s) => s.no === currentQuestion.question.surah) ?? null;
  }, [meta, currentQuestion]);

  const diffInfo = getDifficultyInfo(currentQuestion?.question.difficulty);
  const mealLabel = getMealBasisLabel(currentQuestion?.question.mealBasis);
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

  // İleri / Geri soru geçişleri
  const handleGoToQuestion = useCallback(
    (targetIdx: number) => {
      const clamped = Math.max(0, Math.min(session.questions.length - 1, targetIdx));
      if (clamped === session.currentIndex) return;
      sfxService.play('click');
      onUpdateSession((prev) => ({
        ...prev,
        currentIndex: clamped,
        questionRemainingSec: prev.config.arenaTimePerQuestion,
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [session.questions.length, session.currentIndex, onUpdateSession],
  );

  const handleNextOrFinish = useCallback(() => {
    if (isOutOfLives) {
      triggerComplete(session, true);
      return;
    }

    const isLast = session.currentIndex >= session.questions.length - 1;
    if (isLast) {
      if (isMock) {
        sfxService.play('click');
        setShowFinishModal(true);
      } else {
        triggerComplete(session, false);
      }
      return;
    }

    handleGoToQuestion(session.currentIndex + 1);
  }, [isOutOfLives, session, isMock, triggerComplete, handleGoToQuestion]);

  // Yarışma Arenası 3 Joker
  const handleUseFiftyFifty = () => {
    if (!isArena || isAnswered || session.jokers.fiftyFiftyUsed || !currentQuestion) return;
    const wrongIndices = currentQuestion.options
      .map((_, idx) => idx)
      .filter((idx) => idx !== currentQuestion.correctDisplayIndex);

    if (wrongIndices.length < 2) return;
    sfxService.play('click');

    // Rastgele 2 yanlış şıkkı ele
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

  // Masaüstü klavye kısayolları: 1-4 / A-D ve Enter
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

      if (e.key === 'Enter') {
        if (isMock || isAnswered) {
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
    isMock,
    isAnswered,
    handleSelectOption,
    handleNextOrFinish,
  ]);

  if (!currentQuestion) return null;

  const totalCount = session.questions.length;
  const answeredCount = Object.keys(session.answers).length;
  const progressPct = Math.round(((session.currentIndex + 1) / totalCount) * 100);
  const isLastQuestion = session.currentIndex >= totalCount - 1;

  const timerValue = isArena
    ? session.questionRemainingSec
    : isMock
      ? session.totalRemainingSec
      : session.elapsedSec;
  const isTimerUrgent =
    (isArena && session.questionRemainingSec <= 10) ||
    (isMock && session.totalRemainingSec <= 60);

  const hasTwoColSplit =
    currentQuestion.question.premises.length > 0 || currentQuestion.question.stem.length > 155;
  const areShortOptions =
    !hasTwoColSplit && currentQuestion.options.every((o) => o.length <= 55);

  const arenaJokersNode =
    isArena && !isAnswered ? (
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={session.jokers.fiftyFiftyUsed || currentQuestion.options.length < 3}
          onClick={handleUseFiftyFifty}
          className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <Scissors className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-accent-text)' }} />
          <span className="truncate whitespace-nowrap">%50 Ele</span>
        </button>

        <button
          type="button"
          disabled={session.jokers.verseHintUsed}
          onClick={handleUseVerseHint}
          className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
          <span className="truncate whitespace-nowrap">Ayet İpucu</span>
        </button>

        <button
          type="button"
          disabled={session.jokers.extraTimeUsed}
          onClick={handleUseExtraTime}
          className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <Timer className="w-3.5 h-3.5 shrink-0" style={{ color: '#059669' }} />
          <span className="truncate whitespace-nowrap">+30 Sn</span>
        </button>
      </div>
    ) : null;

  const optionsListNode = (
    <div
      className={
        areShortOptions ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : 'space-y-2'
      }
    >
      {currentQuestion.options.map((optText, idx) => {
        const isEliminated = eliminatedSet.has(idx);
        const isSelected = currentAnswer?.selectedIndex === idx;
        const isCorrectOption = idx === currentQuestion.correctDisplayIndex;

        let borderColor = 'var(--border-subtle)';
        let bgColor = 'var(--bg-surface)';
        let indicatorBg = 'var(--bg-surface-soft)';
        let indicatorColor = 'var(--text-secondary)';

        if (isMock) {
          if (isSelected) {
            borderColor = 'var(--brand-primary)';
            bgColor = 'var(--brand-primary-soft)';
            indicatorBg = 'var(--brand-primary)';
            indicatorColor = '#FFFFFF';
          }
        } else if (isLocked) {
          if (isCorrectOption) {
            borderColor = '#10B981';
            bgColor = 'rgba(16, 185, 129, 0.12)';
            indicatorBg = '#10B981';
            indicatorColor = '#FFFFFF';
          } else if (isSelected && !isCorrectOption) {
            borderColor = '#EF4444';
            bgColor = 'rgba(239, 68, 68, 0.12)';
            indicatorBg = '#EF4444';
            indicatorColor = '#FFFFFF';
          }
        }

        return (
          <button
            key={idx}
            type="button"
            disabled={isEliminated || isLocked}
            onClick={() => handleSelectOption(idx)}
            className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border-2 text-left flex items-start gap-2.5 transition-all ${
              isEliminated
                ? 'opacity-35 line-through cursor-not-allowed'
                : isLocked
                  ? 'cursor-default'
                  : 'cursor-pointer hover:border-teal-600/50 active:scale-[0.995]'
            }`}
            style={{
              borderColor,
              backgroundColor: bgColor,
            }}
          >
            {/* Harf rozeti veya modern seçim halkası */}
            {settings.showOptionLettersInApp ? (
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5"
                style={{
                  backgroundColor: indicatorBg,
                  color: indicatorColor,
                }}
              >
                {OPTION_LETTERS[idx] ?? idx + 1}
              </span>
            ) : (
              <span
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  borderColor:
                    isSelected || (isLocked && isCorrectOption)
                      ? borderColor
                      : 'var(--border-strong)',
                  backgroundColor:
                    isSelected || (isLocked && isCorrectOption) ? indicatorBg : 'transparent',
                  color: indicatorColor,
                }}
              >
                {isLocked && isCorrectOption ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : isLocked && isSelected && !isCorrectOption ? (
                  <XCircle className="w-3.5 h-3.5" />
                ) : isSelected ? (
                  <span className="w-2 h-2 rounded-full bg-white" />
                ) : null}
              </span>
            )}

            <span
              className="flex-1 turkish-reading leading-snug"
              style={{
                fontSize: `${settings.turkishFontSize}px`,
                color: 'var(--text-primary)',
              }}
            >
              {optText}
            </span>

            {isLocked && isCorrectOption && (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
            )}
            {isLocked && isSelected && !isCorrectOption && (
              <XCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className={`${hasTwoColSplit ? 'max-w-5xl' : 'max-w-3xl'} mx-auto space-y-3 pb-8 transition-[max-width] duration-200`}
    >
      {/* ====================================================================
          1. Kompakt Üst Durum Şeridi (Çıkış, Sayaç, Metaveri, Süre/Can/Seri)
          ==================================================================== */}
      <div className="surface-card rounded-2xl p-2.5 sm:p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Sol: Çıkış + Soru Sayacı + Masaüstü Metaveri */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowExitModal(true);
              }}
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span>Çıkış</span>
            </button>

            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-xs sm:text-sm font-extrabold tabular-nums whitespace-nowrap">
                Soru {session.currentIndex + 1} / {totalCount}
              </p>
              {session.config.isMistakeCamp && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  Hata Kampı
                </span>
              )}
            </div>

            {/* Masaüstünde tek satırda Sure · Zorluk · Meal */}
            <div className="hidden md:flex items-center gap-1.5 text-[11px] pl-1 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
              <span
                className="font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                {surahMeta?.nameTr ?? `${currentQuestion.question.surah}. Sure`}
              </span>
              <span
                className="font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{ backgroundColor: diffInfo.bg, color: diffInfo.color }}
              >
                {diffInfo.label}
              </span>
              <span
                className="font-semibold px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-secondary)',
                }}
              >
                {mealLabel}
              </span>
            </div>
          </div>

          {/* Sağ: Mod Göstergeleri (Canlar, Seri, Süre, Palet, Yıldız, Bildir) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Arena Canlar */}
            {isArena && (
              <div
                className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl"
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

            {/* Seri (Combo) Rozeti */}
            {!isMock && session.currentStreak >= 2 && (
              <div
                className="px-2 py-1.5 rounded-xl text-xs font-extrabold tabular-nums flex items-center gap-1"
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
              className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold tabular-nums flex items-center gap-1.5 ${
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

            {isMock && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setShowPaletteModal(true);
                }}
                className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Grid className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  Palet ({answeredCount}/{totalCount})
                </span>
                <span className="sm:hidden tabular-nums">
                  {answeredCount}/{totalCount}
                </span>
              </button>
            )}

            {/* Soruyu Yıldızla */}
            <button
              type="button"
              onClick={() => toggleBookmarkQuestion(currentQuestion.uid)}
              aria-label={isBookmarked ? 'Soruyu yıldızlılardan çıkar' : 'Soruyu yıldızla'}
              className="min-w-[38px] min-h-[38px] rounded-xl border flex items-center justify-center cursor-pointer transition-colors"
              style={{
                backgroundColor: isBookmarked
                  ? 'var(--brand-accent-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: isBookmarked ? 'var(--brand-accent)' : 'var(--border-subtle)',
                color: isBookmarked ? 'var(--brand-accent-text)' : 'var(--text-muted)',
              }}
            >
              <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>

            {/* Soruyu Hatalı / Gözden Geçirilecek Olarak İşaretle */}
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowReportModal(true);
              }}
              title="Soruyu hatalı / gözden geçirilecek olarak işaretle"
              aria-label="Soruyu hatalı olarak işaretle"
              className="min-w-[38px] min-h-[38px] px-2 rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              style={{
                backgroundColor: isIssueReported
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'var(--bg-surface-soft)',
                borderColor: isIssueReported ? '#EF4444' : 'var(--border-subtle)',
                color: isIssueReported ? '#DC2626' : 'var(--text-muted)',
              }}
            >
              <AlertOctagon className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline text-xs font-bold whitespace-nowrap">
                {isIssueReported ? 'İşaretli' : 'Bildir'}
              </span>
            </button>
          </div>
        </div>

        {/* İlerleme Çubuğu */}
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface-soft)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPct}%`,
              backgroundColor: 'var(--brand-primary)',
            }}
          />
        </div>

        {/* Mobil Metaveri Şeridi */}
        <div className="flex md:hidden flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className="font-bold px-2 py-0.5 rounded-md"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              color: 'var(--brand-primary-text)',
            }}
          >
            {surahMeta?.nameTr ?? `${currentQuestion.question.surah}. Sure`}
          </span>
          <span
            className="font-bold px-2 py-0.5 rounded-md"
            style={{ backgroundColor: diffInfo.bg, color: diffInfo.color }}
          >
            {diffInfo.label}
          </span>
          <span
            className="font-semibold px-2 py-0.5 rounded-md"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-secondary)',
            }}
          >
            {mealLabel}
          </span>
        </div>
      </div>

      {/* ====================================================================
          2. Soru Gövdesi ve Şık Kartları (Masaüstünde Akıllı 2-Sütunlu Düzen)
          ==================================================================== */}
      <article className="surface-card rounded-2xl p-4 sm:p-5 space-y-4">
        {hasTwoColSplit ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Sol Sütun (7/12): Öncüller + Soru Kökü + Arena Ayet İpucu */}
            <div className="lg:col-span-7 space-y-3">
              {currentQuestion.question.premises.length > 0 && (
                <div
                  className="rounded-xl border p-3 space-y-1.5"
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

              <FormattedStem
                text={currentQuestion.question.stem}
                className="turkish-reading font-semibold leading-snug"
                style={{
                  fontSize: `${Math.min(22, settings.turkishFontSize + 1)}px`,
                  color: 'var(--text-primary)',
                }}
              />

              {isArena && isHintRevealed && !isAnswered && (
                <RelatedVerseDrawer question={currentQuestion.question} hintOnly defaultOpen />
              )}
            </div>

            {/* Sağ Sütun (5/12): Arena Jokerleri + Şık Kartları */}
            <div className="lg:col-span-5 space-y-2.5">
              {arenaJokersNode}
              {optionsListNode}
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {arenaJokersNode}
            {isArena && isHintRevealed && !isAnswered && (
              <RelatedVerseDrawer question={currentQuestion.question} hintOnly defaultOpen />
            )}
            <FormattedStem
              text={currentQuestion.question.stem}
              className="turkish-reading font-semibold leading-relaxed"
              style={{
                fontSize: `${Math.min(22, settings.turkishFontSize + 1)}px`,
                color: 'var(--text-primary)',
              }}
            />
            {optionsListNode}
          </div>
        )}

        {/* ================================================================
            4. Anında Dönüt, Çözüm Açıklaması & İlgili Ayet (Antrenman & Arena)
            ================================================================ */}
        {!isMock && isAnswered && currentAnswer && (
          <div className="pt-3.5 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
            {/* Sonuç Şeridi */}
            <div
              className="rounded-xl p-3 flex items-start gap-3"
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
                  className="text-sm font-extrabold"
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
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
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

            {/* İlgili Ayeti ve Meali Gör Çekmecesi */}
            <RelatedVerseDrawer question={currentQuestion.question} />

            {/* Sonraki Soru / Sınavı Bitir */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleNextOrFinish}
                className="w-full sm:w-auto min-h-[44px] px-6 rounded-xl text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
                style={{
                  backgroundColor: isOutOfLives ? '#DC2626' : 'var(--brand-primary)',
                }}
              >
                <span>
                  {isOutOfLives
                    ? 'Canlar Bitti — Karneyi Gör'
                    : isLastQuestion
                      ? 'Sınavı Tamamla ve Karneyi Gör'
                      : 'Sonraki Soru'}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================
            5. Deneme Sınavı Alt Gezinme Çubuğu
            ================================================================ */}
        {isMock && (
          <div
            className="pt-3.5 border-t flex flex-wrap items-center justify-between gap-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={session.currentIndex === 0}
                onClick={() => handleGoToQuestion(session.currentIndex - 1)}
                className="min-h-[40px] px-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Önceki</span>
              </button>

              <button
                type="button"
                onClick={handleToggleFlag}
                className="min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
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
                  className="min-h-[40px] px-2.5 rounded-xl text-xs font-semibold cursor-pointer hover:underline whitespace-nowrap"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Boş Bırak
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isLastQuestion ? (
                <button
                  type="button"
                  onClick={() => handleGoToQuestion(session.currentIndex + 1)}
                  className="min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <span>Sonraki</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setShowFinishModal(true);
                }}
                className="min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: isLastQuestion
                    ? 'var(--brand-primary)'
                    : 'var(--brand-accent)',
                  color: '#FFFFFF',
                }}
              >
                <span>Sınavı Bitir</span>
              </button>
            </div>
          </div>
        )}
      </article>

      {/* Masaüstü klavye kısayolu ipucu */}
      <p
        className="hidden sm:block text-center text-[11px]"
        style={{ color: 'var(--text-muted)' }}
      >
        Kısayollar: Şık seçmek için <kbd className="font-bold">1–4</kbd> veya{' '}
        <kbd className="font-bold">A–D</kbd>, ilerlemek için <kbd className="font-bold">Enter</kbd>{' '}
        tuşlarını kullanabilirsin.
        {isPractice ? ' (Süresiz Antrenman)' : ''}
      </p>

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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-exam-title"
        >
          <div className="surface-card rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--brand-accent-soft)', color: 'var(--brand-accent-text)' }}
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
          Modal 2: Deneme Sınavı Bitir Onayı
          ==================================================================== */}
      {showFinishModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finish-exam-title"
        >
          <div className="surface-card rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 id="finish-exam-title" className="text-lg font-extrabold">
              Deneme Sınavını Bitir
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}
              >
                <p className="text-lg font-extrabold tabular-nums text-emerald-600">
                  {answeredCount}
                </p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Cevaplanan
                </p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <p className="text-lg font-extrabold tabular-nums">
                  {totalCount - answeredCount}
                </p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Boş
                </p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'var(--brand-accent-soft)' }}
              >
                <p
                  className="text-lg font-extrabold tabular-nums"
                  style={{ color: 'var(--brand-accent-text)' }}
                >
                  {session.flaggedUids.length}
                </p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Şüpheli
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              Sınavı sonlandırdığında tüm soruların doğruları, çözüm açıklamaları ve ilgili ayet
              mealleri karnende açılacak.
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
                Kontrole Dön
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
          Modal 3: Deneme Sınavı Soru Paleti
          ==================================================================== */}
      {showPaletteModal && isMock && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="palette-title"
          onClick={() => setShowPaletteModal(false)}
        >
          <div
            className="surface-card rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-w-lg w-full max-h-[80dvh] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id="palette-title" className="text-base font-extrabold">
                Soru Gezgini ({answeredCount}/{totalCount})
              </h3>
              <button
                type="button"
                onClick={() => setShowPaletteModal(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500" /> Cevaplandı
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded border" style={{ borderColor: 'var(--border-strong)' }} /> Boş
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500" /> Şüpheli
              </span>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 overflow-y-auto py-1">
              {session.questions.map((q, idx) => {
                const answered = Boolean(session.answers[q.uid]);
                const flagged = session.flaggedUids.includes(q.uid);
                const isCurrent = idx === session.currentIndex;

                return (
                  <button
                    key={q.uid}
                    type="button"
                    onClick={() => {
                      setShowPaletteModal(false);
                      handleGoToQuestion(idx);
                    }}
                    className="relative min-h-[44px] rounded-xl border-2 text-sm font-extrabold tabular-nums flex items-center justify-center cursor-pointer"
                    style={{
                      backgroundColor: answered
                        ? 'rgba(16, 185, 129, 0.16)'
                        : 'var(--bg-surface-soft)',
                      borderColor: isCurrent
                        ? 'var(--brand-primary)'
                        : flagged
                          ? '#F59E0B'
                          : 'transparent',
                      color: answered ? '#059669' : 'var(--text-primary)',
                    }}
                  >
                    {idx + 1}
                    {flagged && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
