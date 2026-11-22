import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Puzzle, RotateCcw, Trophy } from 'lucide-react';
import { audioQueueService } from '../../services/audioQueueService';
import { dataService } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  ExamConfig,
  ExamResultSummary,
  ExamSessionState,
} from '../../types/quran';
import {
  clearActiveExamSession,
  getQuestionUid,
  loadActiveExamSession,
  saveActiveExamSession,
  selectAndPrepareExamQuestions,
} from '../../utils/examUtils';
import { formatNumberTr } from '../../utils/poolUtils';
import { GamesHubTab } from '../games/GamesHubTab';
import { MistakeCampPage } from '../mistakes/MistakeCampPage';
import { ActiveExamView } from './ActiveExamView';
import { ExamHubPage } from './ExamHubPage';
import { ExamResultView } from './ExamResultView';

type ExamPhase = 'hub' | 'active' | 'result';
type ExamHubSubTab = 'builder' | 'games' | 'mistakes';

export const ExamCenterPage: React.FC = () => {
  const {
    questionIndex,
    gamification,
    questionAudit,
    recordExamResult,
    examNavTarget,
    clearExamNavTarget,
    setIsExamActive,
  } = useAppStore();

  const [phase, setPhase] = useState<ExamPhase>('hub');
  const [hubSubTab, setHubSubTab] = useState<ExamHubSubTab>('builder');
  const [activeSession, setActiveSession] = useState<ExamSessionState | null>(null);
  const [resumableSession, setResumableSession] = useState<ExamSessionState | null>(() =>
    loadActiveExamSession(),
  );
  const [resultSummary, setResultSummary] = useState<ExamResultSummary | null>(null);
  const [initialSurahFilter, setInitialSurahFilter] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Aktif sınav durumunu AppShell'e (mobil alt bar gizleme) bildir
  useEffect(() => {
    setIsExamActive(phase === 'active');
    return () => setIsExamActive(false);
  }, [phase, setIsExamActive]);

  // Aktif sınav oturumunu her değişiklikte sessionStorage'a kaydet
  useEffect(() => {
    if (phase === 'active' && activeSession) {
      saveActiveExamSession(activeSession);
    }
  }, [phase, activeSession]);

  const startExamFromConfig = useCallback(
    async (config: ExamConfig) => {
      setIsStarting(true);
      setStartError(null);

      try {
        const surahsToLoad =
          config.surahs.length > 0
            ? config.surahs
            : (questionIndex?.availableSurahs ?? []);

        const rawQuestions = await dataService.getQuestionsForSurahs(surahsToLoad);
        const eligibleQuestions = questionAudit.skipReportedInExams
          ? rawQuestions.filter((q) => {
              const uid = getQuestionUid(q);
              return !questionAudit.reports[uid] && !questionAudit.reports[q.id];
            })
          : rawQuestions;

        const prepared = selectAndPrepareExamQuestions({
          allQuestions: eligibleQuestions,
          surahs: config.surahs,
          difficulty: config.difficulty,
          mealBasis: config.mealBasis,
          questionCount: config.questionCount,
          prioritizeUnsolved: config.prioritizeUnsolved,
          solvedQuestionUids: gamification.solvedQuestionUids,
          customQuestionUids: config.customQuestionUids,
        });

        if (prepared.length === 0) {
          setStartError(
            rawQuestions.length > 0 && eligibleQuestions.length < rawQuestions.length
              ? 'Seçilen kriterlerdeki sorular hatalı olarak işaretlendiği için atlandı. Hata Bildirimleri panelinden ayarı değiştirebilirsiniz.'
              : 'Seçilen kriterlere uygun soru bulunamadı.',
          );
          return;
        }

        // Arka planda ses çalıyorsa duraklat ve başlangıç SFX çal
        audioQueueService.pause();
        sfxService.play('start');

        const mockTotalSec = Math.max(60, Math.round(prepared.length * 90));
        const newSession: ExamSessionState = {
          sessionId: `exam_${Date.now()}`,
          config,
          questions: prepared,
          currentIndex: 0,
          answers: {},
          flaggedUids: [],
          eliminatedOptionsByUid: {},
          hintRevealedUids: [],
          livesRemaining: 3,
          currentStreak: 0,
          maxStreak: 0,
          jokers: {
            fiftyFiftyUsed: false,
            verseHintUsed: false,
            extraTimeUsed: false,
          },
          startedAt: Date.now(),
          elapsedSec: 0,
          questionRemainingSec: config.arenaTimePerQuestion,
          totalRemainingSec: mockTotalSec,
        };

        saveActiveExamSession(newSession);
        setActiveSession(newSession);
        setResumableSession(null);
        setResultSummary(null);
        setPhase('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        setStartError(
          err instanceof Error ? err.message : 'Soru bankası yüklenirken bir hata oluştu.',
        );
      } finally {
        setIsStarting(false);
      }
    },
    [
      questionIndex?.availableSurahs,
      gamification.solvedQuestionUids,
      questionAudit.skipReportedInExams,
      questionAudit.reports,
    ],
  );

  // Dışarıdan (Ana Sayfa, Okuma Ekranı, Hata Kampı) gelen sınav yönlendirmelerini işle
  const handledTargetNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!examNavTarget) return;
    if (handledTargetNonceRef.current === examNavTarget.nonce) return;
    handledTargetNonceRef.current = examNavTarget.nonce;

    if (examNavTarget.autoStartMistakeCamp && gamification.wrongQuestionIds.length > 0) {
      const limit = examNavTarget.mistakeLimit ?? 10;
      void startExamFromConfig({
        mode: 'practice',
        surahs: questionIndex?.availableSurahs ?? [],
        difficulty: 'all',
        mealBasis: 'all',
        questionCount: limit,
        prioritizeUnsolved: false,
        arenaTimePerQuestion: 45,
        isMistakeCamp: true,
        customQuestionUids: gamification.wrongQuestionIds,
        title: 'Hata Kampı Telafi Sınavı',
      });
    } else if (examNavTarget.openMistakeCamp) {
      setHubSubTab('mistakes');
      setPhase('hub');
    } else {
      setHubSubTab('builder');
      if (examNavTarget.surahNo !== undefined) {
        setInitialSurahFilter(examNavTarget.surahNo);
      } else {
        setInitialSurahFilter(null);
      }
      setPhase('hub');
    }

    clearExamNavTarget();
  }, [
    examNavTarget,
    gamification.wrongQuestionIds,
    questionIndex?.availableSurahs,
    startExamFromConfig,
    clearExamNavTarget,
  ]);

  const handleResumeSession = () => {
    if (!resumableSession) return;
    audioQueueService.pause();
    sfxService.play('start');
    setActiveSession(resumableSession);
    setResumableSession(null);
    setPhase('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDiscardResumable = () => {
    sfxService.play('click');
    clearActiveExamSession();
    setResumableSession(null);
  };

  const handleUpdateSession = useCallback(
    (updater: (prev: ExamSessionState) => ExamSessionState) => {
      setActiveSession((prev) => (prev ? updater(prev) : prev));
    },
    [],
  );

  const handleCompleteExam = useCallback(
    (finalSession: ExamSessionState, endedByNoLives = false) => {
      clearActiveExamSession();

      const correctUids: string[] = [];
      const wrongUids: string[] = [];
      let blankCount = 0;

      for (const q of finalSession.questions) {
        const ans = finalSession.answers[q.uid];
        if (!ans) {
          blankCount += 1;
        } else if (ans.isCorrect) {
          correctUids.push(q.uid);
        } else {
          wrongUids.push(q.uid);
        }
      }

      const surahsUsed = Array.from(
        new Set(finalSession.questions.map((q) => q.question.surah)),
      ).sort((a, b) => a - b);

      const durationSec = Math.max(
        finalSession.elapsedSec,
        Math.round((Date.now() - finalSession.startedAt) / 1000),
      );

      const { earnedXp, newlyMasteredCount, scorePct } = recordExamResult({
        id: finalSession.sessionId,
        mode: finalSession.config.mode,
        surahs: surahsUsed,
        totalQuestions: finalSession.questions.length,
        correctUids,
        wrongUids,
        blankCount,
        durationSec,
        maxStreak: finalSession.maxStreak,
        isMistakeCamp: finalSession.config.isMistakeCamp,
      });

      const summary: ExamResultSummary = {
        sessionId: finalSession.sessionId,
        config: finalSession.config,
        questions: finalSession.questions,
        answers: finalSession.answers,
        totalQuestions: finalSession.questions.length,
        correct: correctUids.length,
        wrong: wrongUids.length,
        blank: blankCount,
        scorePct,
        earnedXp,
        durationSec,
        maxStreak: finalSession.maxStreak,
        newlyMasteredCount,
        endedByNoLives,
        completedAt: new Date().toISOString(),
      };

      setResultSummary(summary);
      setActiveSession(null);
      setResumableSession(null);
      setPhase('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [recordExamResult],
  );

  const handleExitKeepSession = () => {
    sfxService.play('click');
    if (activeSession) {
      saveActiveExamSession(activeSession);
      setResumableSession(activeSession);
    }
    setActiveSession(null);
    setPhase('hub');
  };

  const handleExitDiscardSession = () => {
    sfxService.play('click');
    clearActiveExamSession();
    setActiveSession(null);
    setResumableSession(null);
    setPhase('hub');
  };

  const handleStartWrongMiniTest = (wrongUids: string[], surahs: number[]) => {
    void startExamFromConfig({
      mode: 'practice',
      surahs: surahs.length > 0 ? surahs : (questionIndex?.availableSurahs ?? []),
      difficulty: 'all',
      mealBasis: 'all',
      questionCount: 0,
      prioritizeUnsolved: false,
      arenaTimePerQuestion: 45,
      isMistakeCamp: true,
      customQuestionUids: wrongUids,
      title: 'Yanlışlardan Mini Telafi Testi',
    });
  };

  if (phase === 'active' && activeSession) {
    return (
      <ActiveExamView
        session={activeSession}
        onUpdateSession={handleUpdateSession}
        onCompleteExam={handleCompleteExam}
        onExitKeepSession={handleExitKeepSession}
        onExitDiscardSession={handleExitDiscardSession}
      />
    );
  }

  if (phase === 'result' && resultSummary) {
    return (
      <ExamResultView
        result={resultSummary}
        onStartWrongMiniTest={handleStartWrongMiniTest}
        onNewExam={() => {
          sfxService.play('click');
          setResultSummary(null);
          setPhase('hub');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  const wrongCount = gamification.wrongQuestionIds.length;

  return (
    <div className="space-y-4">
      {/* Sınav Merkezi Alt Sekmeleri: Sınav Oluştur | Eğitsel Oyunlar | Hata Kampı (X) */}
      <div
        role="tablist"
        aria-label="Sınav Merkezi alt sekmeleri"
        className="grid grid-cols-3 sm:inline-flex p-1 rounded-2xl border gap-1 w-full sm:w-auto"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={hubSubTab === 'builder'}
          onClick={() => {
            sfxService.play('click');
            setHubSubTab('builder');
          }}
          className="min-h-[40px] px-2 sm:px-5 rounded-xl text-[11px] sm:text-sm font-extrabold inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: hubSubTab === 'builder' ? 'var(--bg-surface)' : 'transparent',
            color: hubSubTab === 'builder' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
            boxShadow: hubSubTab === 'builder' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>Sınav Oluştur</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={hubSubTab === 'games'}
          onClick={() => {
            sfxService.play('click');
            setHubSubTab('games');
          }}
          className="min-h-[40px] px-2 sm:px-5 rounded-xl text-[11px] sm:text-sm font-extrabold inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: hubSubTab === 'games' ? 'var(--bg-surface)' : 'transparent',
            color: hubSubTab === 'games' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
            boxShadow: hubSubTab === 'games' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <Puzzle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>Eğitsel Oyunlar</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={hubSubTab === 'mistakes'}
          onClick={() => {
            sfxService.play('click');
            setHubSubTab('mistakes');
          }}
          className="min-h-[40px] px-2 sm:px-5 rounded-xl text-[11px] sm:text-sm font-extrabold inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: hubSubTab === 'mistakes' ? 'var(--bg-surface)' : 'transparent',
            color:
              hubSubTab === 'mistakes'
                ? wrongCount > 0
                  ? '#DC2626'
                  : 'var(--brand-primary-text)'
                : 'var(--text-secondary)',
            boxShadow: hubSubTab === 'mistakes' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>Hata Kampı</span>
          <span
            className="px-1 sm:px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-extrabold tabular-nums leading-none"
            style={{
              backgroundColor:
                wrongCount > 0 ? 'rgba(239, 68, 68, 0.14)' : 'var(--bg-surface)',
              color: wrongCount > 0 ? '#DC2626' : 'var(--text-muted)',
            }}
          >
            {formatNumberTr(wrongCount)}
          </span>
        </button>
      </div>

      {hubSubTab === 'games' ? (
        <GamesHubTab />
      ) : hubSubTab === 'mistakes' ? (
        <MistakeCampPage />
      ) : (
        <ExamHubPage
          initialSurahFilter={initialSurahFilter}
          resumableSession={resumableSession}
          isStarting={isStarting}
          startError={startError}
          onStartExam={(cfg) => {
            void startExamFromConfig(cfg);
          }}
          onResumeSession={handleResumeSession}
          onDiscardResumable={handleDiscardResumable}
        />
      )}
    </div>
  );
};
