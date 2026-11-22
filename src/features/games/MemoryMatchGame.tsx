import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  shuffleArray,
} from './gameTypes';

interface MemoryCardItem {
  id: string;
  pairId: number;
  side: 'surah' | 'clue';
  surah: EnrichedGameSurah;
  clueTitle: string;
  clueArabic?: string;
  clueTag: string;
}

const PREVIEW_SECONDS = 2;

function useIsCompactViewport(): boolean {
  const [compact, setCompact] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
}

/**
 * Her çiftin ipucu metninin tahtada tamamen benzersiz olmasını garantileyerek
 * Kademe 4 (Özel Gruplar) dahil tüm kademelerde adil hafıza kartı destesi oluşturur.
 */
function buildMemoryDeck(
  tierSurahs: EnrichedGameSurah[],
  tierId: GameComponentProps['tierId'],
  pairCount: number,
): MemoryCardItem[] {
  const shuffledPool = shuffleArray(tierSurahs);
  const chosen: { surah: EnrichedGameSurah; clueTitle: string; clueArabic?: string; clueTag: string }[] = [];
  const usedClueKeys = new Set<string>();

  for (const surah of shuffledPool) {
    if (chosen.length >= pairCount) break;

    let clueTitle = surah.meaningTr;
    let clueArabic: string | undefined;
    let clueTag = 'Anlamı';

    if (tierId === 'kademe_4' && surah.primaryTrait) {
      const traitKey = `${surah.primaryTrait.badge}:${surah.primaryTrait.arabic ?? ''}`;
      if (!usedClueKeys.has(traitKey)) {
        clueTitle = surah.primaryTrait.label;
        clueArabic = surah.primaryTrait.arabic;
        clueTag = surah.primaryTrait.badge;
        usedClueKeys.add(traitKey);
      } else {
        // Aynı gruptan ikinci bir sure gelirse anlamını da ekleyerek çakışmayı önle
        const comboKey = `meaning:${surah.meaningTr}`;
        if (usedClueKeys.has(comboKey)) continue;
        clueTitle = `${surah.meaningTr}`;
        clueArabic = surah.primaryTrait.arabic;
        clueTag = surah.primaryTrait.badge;
        usedClueKeys.add(comboKey);
      }
    } else {
      const meaningKey = `meaning:${surah.meaningTr.toLowerCase()}`;
      if (usedClueKeys.has(meaningKey)) continue;
      usedClueKeys.add(meaningKey);
      if (surah.mukattaa) {
        clueTag = `Anlamı · ${surah.mukattaa.arabic}`;
      }
    }

    chosen.push({ surah, clueTitle, clueArabic, clueTag });
  }

  const cards: MemoryCardItem[] = [];
  for (const item of chosen) {
    cards.push({
      id: `s-${item.surah.no}`,
      pairId: item.surah.no,
      side: 'surah',
      surah: item.surah,
      clueTitle: item.clueTitle,
      clueArabic: item.clueArabic,
      clueTag: item.clueTag,
    });
    cards.push({
      id: `c-${item.surah.no}`,
      pairId: item.surah.no,
      side: 'clue',
      surah: item.surah,
      clueTitle: item.clueTitle,
      clueArabic: item.clueArabic,
      clueTag: item.clueTag,
    });
  }

  return shuffleArray(cards);
}

export const MemoryMatchGame: React.FC<GameComponentProps> = ({
  tierId,
  tempo,
  playerMode,
  tierSurahs,
  onHudUpdate,
  onComplete,
}) => {
  const isCompact = useIsCompactViewport();
  const isDuel = playerMode === 'duel';
  const pairCount = isDuel ? 8 : isCompact ? 6 : 8;
  const timedLimitSec = pairCount <= 6 ? 75 : 95;

  const deck = useMemo(
    () => buildMemoryDeck(tierSurahs, tierId, pairCount),
    [tierSurahs, tierId, pairCount],
  );

  const [previewLeft, setPreviewLeft] = useState<number>(PREVIEW_SECONDS);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [matchedPairIds, setMatchedPairIds] = useState<number[]>([]);
  const [matchedOwner, setMatchedOwner] = useState<Record<number, 'p1' | 'p2'>>({});
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Skor & İstatistikler
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // İkili Düello Durumu (Sıralı: Bilen devam eder)
  const [activePlayer, setActivePlayer] = useState<'p1' | 'p2'>('p1');
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);
  const [p1Correct, setP1Correct] = useState<number>(0);
  const [p2Correct, setP2Correct] = useState<number>(0);

  const mistakenMapRef = useRef<Map<number, EnrichedGameSurah>>(new Map());
  const finishedRef = useRef<boolean>(false);

  const isPreview = previewLeft > 0;

  // 2 saniyelik açılış gözlem geri sayımı
  useEffect(() => {
    if (previewLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setPreviewLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [previewLeft]);

  const finishGame = useCallback(
    (finalStats: {
      score: number;
      maxCombo: number;
      correctCount: number;
      mistakeCount: number;
      elapsedSec: number;
      p1Score: number;
      p2Score: number;
      p1Correct: number;
      p2Correct: number;
    }) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      gameAudioService.playFanfare();

      const totalAttempts = Math.max(1, finalStats.correctCount + finalStats.mistakeCount);
      const accuracyPct = Math.round((finalStats.correctCount / totalAttempts) * 100);
      const timeBonus =
        tempo === 'timed' && !isDuel
          ? Math.max(0, timedLimitSec - finalStats.elapsedSec)
          : 0;
      const totalScore = finalStats.score + timeBonus;
      const stars = calculateGameStars(accuracyPct, totalScore);
      const earnedXp = calculateGameXp(totalScore, stars, finalStats.maxCombo);

      onComplete({
        gameId: 'memory',
        tierId,
        tempo,
        playerMode,
        score: totalScore,
        stars,
        maxCombo: finalStats.maxCombo,
        correctCount: finalStats.correctCount,
        mistakeCount: finalStats.mistakeCount,
        accuracyPct,
        durationSec: finalStats.elapsedSec,
        earnedXp,
        mistakenSurahs: Array.from(mistakenMapRef.current.values()),
        duel: isDuel
          ? {
              p1Score: finalStats.p1Score,
              p2Score: finalStats.p2Score,
              p1Correct: finalStats.p1Correct,
              p2Correct: finalStats.p2Correct,
              winner:
                finalStats.p1Score > finalStats.p2Score
                  ? 'p1'
                  : finalStats.p2Score > finalStats.p1Score
                    ? 'p2'
                    : 'draw',
            }
          : undefined,
      });
    },
    [isDuel, onComplete, playerMode, tempo, tierId, timedLimitSec],
  );

  // Zamanlayıcı (gözlem bittikten sonra başlar)
  useEffect(() => {
    if (isPreview || finishedRef.current) return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isPreview]);

  // Zaman Yarışı süre dolumu kontrolü
  useEffect(() => {
    if (tempo === 'timed' && !isPreview && elapsedSec >= timedLimitSec && !finishedRef.current) {
      finishGame({
        score,
        maxCombo,
        correctCount,
        mistakeCount,
        elapsedSec,
        p1Score,
        p2Score,
        p1Correct,
        p2Correct,
      });
    }
  }, [
    combo,
    correctCount,
    elapsedSec,
    finishGame,
    isPreview,
    maxCombo,
    mistakeCount,
    p1Correct,
    p1Score,
    p2Correct,
    p2Score,
    score,
    tempo,
    timedLimitSec,
  ]);

  // HUD senkronizasyonu
  useEffect(() => {
    const remaining = Math.max(0, timedLimitSec - elapsedSec);
    onHudUpdate({
      score: isDuel ? p1Score + p2Score : score,
      combo,
      progressLabel: `${matchedPairIds.length}/${deck.length / 2} Çift`,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 12,
    });
  }, [
    combo,
    deck.length,
    elapsedSec,
    isDuel,
    matchedPairIds.length,
    onHudUpdate,
    p1Score,
    p2Score,
    score,
    tempo,
    timedLimitSec,
  ]);

  const handleCardTap = (card: MemoryCardItem) => {
    if (isPreview || isLocked || finishedRef.current) return;
    if (matchedPairIds.includes(card.pairId)) return;
    if (flippedIds.includes(card.id)) return;

    gameAudioService.playFlip();
    const nextFlipped = [...flippedIds, card.id];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length < 2) return;

    const firstCard = deck.find((c) => c.id === nextFlipped[0]);
    const secondCard = card;
    if (!firstCard) return;

    setIsLocked(true);

    if (firstCard.pairId === secondCard.pairId && firstCard.side !== secondCard.side) {
      // Doğru Eşleşme!
      const nextCombo = combo + 1;
      const nextMaxCombo = Math.max(maxCombo, nextCombo);
      const earnedPts = isDuel ? 10 : 12 + Math.min(12, (nextCombo - 1) * 4);
      const nextScore = score + earnedPts;
      const nextMatched = [...matchedPairIds, card.pairId];
      const nextCorrect = correctCount + 1;

      const nextP1Score = isDuel && activePlayer === 'p1' ? p1Score + 10 : p1Score;
      const nextP2Score = isDuel && activePlayer === 'p2' ? p2Score + 10 : p2Score;
      const nextP1Correct = isDuel && activePlayer === 'p1' ? p1Correct + 1 : p1Correct;
      const nextP2Correct = isDuel && activePlayer === 'p2' ? p2Correct + 1 : p2Correct;

      window.setTimeout(() => {
        gameAudioService.playMatch(nextCombo);
        setMatchedPairIds(nextMatched);
        if (isDuel) {
          setMatchedOwner((prev) => ({ ...prev, [card.pairId]: activePlayer }));
          setP1Score(nextP1Score);
          setP2Score(nextP2Score);
          setP1Correct(nextP1Correct);
          setP2Correct(nextP2Correct);
        }
        setScore(nextScore);
        setCombo(nextCombo);
        setMaxCombo(nextMaxCombo);
        setCorrectCount(nextCorrect);
        setFlippedIds([]);
        setIsLocked(false);

        if (nextMatched.length >= deck.length / 2) {
          window.setTimeout(() => {
            finishGame({
              score: nextScore,
              maxCombo: nextMaxCombo,
              correctCount: nextCorrect,
              mistakeCount,
              elapsedSec,
              p1Score: nextP1Score,
              p2Score: nextP2Score,
              p1Correct: nextP1Correct,
              p2Correct: nextP2Correct,
            });
          }, 360);
        }
      }, 240);
    } else {
      // Hatalı Eşleşme
      mistakenMapRef.current.set(firstCard.surah.no, firstCard.surah);
      mistakenMapRef.current.set(secondCard.surah.no, secondCard.surah);
      setWrongIds(nextFlipped);
      setCombo(0);
      setMistakeCount((prev) => prev + 1);
      gameAudioService.playWrong();

      window.setTimeout(() => {
        setFlippedIds([]);
        setWrongIds([]);
        setIsLocked(false);
        if (isDuel) {
          gameAudioService.playTurnSwitch();
          setActivePlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
        }
      }, 680);
    }
  };

  const gridClasses =
    pairCount <= 6
      ? 'grid-cols-3 grid-rows-4 gap-2'
      : 'grid-cols-4 grid-rows-4 gap-2 sm:gap-3';

  return (
    <div className="flex-1 min-h-0 w-full max-w-4xl mx-auto px-2.5 sm:px-5 py-2 sm:py-3 flex flex-col gap-2 overflow-hidden">
      {/* Üst Bilgi Şeridi: Gözlem Geri Sayımı veya İkili Düello Sıra Barı */}
      {isPreview ? (
        <div
          className="shrink-0 rounded-xl border px-3 py-1.5 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold"
          style={{
            backgroundColor: 'var(--brand-accent-soft)',
            borderColor: 'rgba(217, 119, 6, 0.28)',
            color: 'var(--brand-accent-text)',
          }}
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span>Kartları Gözlemleyin...</span>
          <span className="tabular-nums px-1.5 py-0.5 rounded-md bg-black/10">
            {previewLeft} sn
          </span>
        </div>
      ) : isDuel ? (
        <div className="shrink-0 grid grid-cols-2 gap-2.5">
          <div
            className="rounded-xl border px-3.5 py-2 flex items-center justify-between transition-all"
            style={{
              backgroundColor:
                activePlayer === 'p1' ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
              borderColor:
                activePlayer === 'p1' ? 'var(--brand-primary)' : 'var(--border-subtle)',
              boxShadow:
                activePlayer === 'p1' ? '0 0 0 2px rgba(13, 148, 136, 0.18)' : 'none',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: '#0D9488' }}
              />
              <span className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                1. Oyuncu (Zümrüt)
              </span>
              {activePlayer === 'p1' && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                  style={{
                    backgroundColor: 'var(--brand-primary)',
                    color: '#FFFFFF',
                  }}
                >
                  Sıra Sende
                </span>
              )}
            </div>
            <span
              className="text-lg font-black tabular-nums"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              {p1Score}
            </span>
          </div>

          <div
            className="rounded-xl border px-3.5 py-2 flex items-center justify-between transition-all"
            style={{
              backgroundColor:
                activePlayer === 'p2' ? 'var(--brand-accent-soft)' : 'var(--bg-surface)',
              borderColor:
                activePlayer === 'p2' ? 'var(--brand-accent)' : 'var(--border-subtle)',
              boxShadow:
                activePlayer === 'p2' ? '0 0 0 2px rgba(217, 119, 6, 0.18)' : 'none',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: '#D97706' }}
              />
              <span className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                2. Oyuncu (Kehribar)
              </span>
              {activePlayer === 'p2' && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                  style={{
                    backgroundColor: '#D97706',
                    color: '#FFFFFF',
                  }}
                >
                  Sıra Sende
                </span>
              )}
            </div>
            <span
              className="text-lg font-black tabular-nums"
              style={{ color: 'var(--brand-accent-text)' }}
            >
              {p2Score}
            </span>
          </div>
        </div>
      ) : (
        <div
          className="shrink-0 flex items-center justify-between px-1 text-[11px] sm:text-xs font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          <span>Sure adı ile anlamını veya özel grup niteliğini eşleştirin.</span>
          <span className="inline-flex items-center gap-1 tabular-nums font-bold" style={{ color: 'var(--brand-primary-text)' }}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {matchedPairIds.length}/{deck.length / 2}
            </span>
          </span>
        </div>
      )}

      {/* Sıfır Kaydırmalı 3B Kart Izgarası */}
      <div className={`flex-1 min-h-0 grid ${gridClasses}`}>
        {deck.map((card) => {
          const isMatched = matchedPairIds.includes(card.pairId);
          const isFlipped = isPreview || isMatched || flippedIds.includes(card.id);
          const isWrong = wrongIds.includes(card.id);
          const owner = matchedOwner[card.pairId];

          const frontBorderColor = isWrong
            ? '#DC2626'
            : isMatched
              ? owner === 'p2'
                ? '#D97706'
                : '#0D9488'
              : card.side === 'surah'
                ? 'var(--brand-primary)'
                : 'var(--brand-accent)';

          const frontBgColor = isMatched
            ? owner === 'p2'
              ? 'var(--brand-accent-soft)'
              : 'var(--brand-primary-soft)'
            : 'var(--bg-surface)';

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardTap(card)}
              disabled={isPreview || isMatched}
              aria-label={isFlipped ? `${card.surah.nameTr}` : 'Kapalı hafıza kartı'}
              className={`game-card-perspective w-full h-full min-h-0 cursor-pointer select-none focus:outline-none ${
                isWrong ? 'game-shake' : ''
              }`}
            >
              <div className={`game-card-inner ${isFlipped ? 'is-flipped' : ''}`}>
                {/* Arka Yüz — Geometrik Desen */}
                <div
                  className="game-card-face game-card-back-pattern rounded-xl sm:rounded-2xl border flex items-center justify-center p-2 transition-shadow hover:shadow-md"
                  style={{
                    borderColor: 'var(--border-strong)',
                    boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div
                    className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl border flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5 sm:w-6 sm:h-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <polygon points="12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9 12 2" />
                      <circle cx="12" cy="12" r="2.2" />
                    </svg>
                  </div>
                </div>

                {/* Ön Yüz — Sure veya İpucu */}
                <div
                  className="game-card-face game-card-face-front rounded-xl sm:rounded-2xl border-2 px-1.5 sm:px-2.5 py-1.5 flex flex-col items-center justify-center text-center overflow-hidden"
                  style={{
                    backgroundColor: frontBgColor,
                    borderColor: frontBorderColor,
                    boxShadow: isMatched
                      ? 'inset 0 0 0 1px rgba(13, 148, 136, 0.14)'
                      : '0 4px 12px -4px rgba(15, 23, 42, 0.1)',
                  }}
                >
                  {card.side === 'surah' ? (
                    <div className="flex flex-col items-center justify-center gap-0.5 min-w-0 w-full">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {card.surah.no}. Sure
                      </span>
                      <span
                        dir="rtl"
                        className="font-arabic text-base sm:text-xl leading-tight line-clamp-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {card.surah.nameAr}
                      </span>
                      <span
                        className="text-xs sm:text-sm font-extrabold leading-tight line-clamp-1 w-full"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {card.surah.shortNameTr}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 min-w-0 w-full">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded line-clamp-1 max-w-full"
                        style={{
                          backgroundColor: 'var(--brand-accent-soft)',
                          color: 'var(--brand-accent-text)',
                        }}
                      >
                        {card.clueTag}
                      </span>
                      {card.clueArabic && (
                        <span
                          dir="rtl"
                          className="font-arabic text-base sm:text-lg font-bold leading-none"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {card.clueArabic}
                        </span>
                      )}
                      <span
                        className="text-[11px] sm:text-xs font-bold leading-snug line-clamp-3 w-full"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {card.clueTitle}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
