import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Eye, Sparkles } from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  getAiMemoryCapacity,
  shuffleArray,
} from './gameTypes';

interface MemoryCardItem {
  id: string;
  slotNo: number;
  pairId: number;
  side: 'surah' | 'clue';
  surah: EnrichedGameSurah;
  clueTitle: string;
  clueArabic?: string;
  clueTag: string;
}

const PREVIEW_SECONDS = 2;
const TURN_SECONDS = 15;

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

function buildMemoryDeck(
  tierSurahs: EnrichedGameSurah[],
  tierId: GameComponentProps['tierId'],
  pairCount: number,
): MemoryCardItem[] {
  const shuffledPool = shuffleArray(tierSurahs);
  const chosen: {
    surah: EnrichedGameSurah;
    clueTitle: string;
    clueArabic?: string;
    clueTag: string;
  }[] = [];
  const usedClueKeys = new Set<string>();

  for (const surah of shuffledPool) {
    if (chosen.length >= pairCount) break;

    let clueTitle = surah.meaningTr;
    let clueArabic: string | undefined;
    let clueTag = 'ANLAM · TÜRKÇE';

    if (tierId === 'kademe_4' && surah.primaryTrait) {
      const traitKey = `${surah.primaryTrait.badge}:${surah.primaryTrait.arabic ?? ''}`;
      if (!usedClueKeys.has(traitKey)) {
        clueTitle = surah.primaryTrait.label;
        clueArabic = surah.primaryTrait.arabic;
        clueTag = surah.primaryTrait.arabic ? 'MUKATTAA' : 'ÖZEL GRUP';
        usedClueKeys.add(traitKey);
      } else {
        const comboKey = `meaning:${surah.meaningTr}`;
        if (usedClueKeys.has(comboKey)) continue;
        clueTitle = surah.meaningTr;
        clueArabic = surah.primaryTrait.arabic;
        clueTag = surah.primaryTrait.badge.toUpperCase();
        usedClueKeys.add(comboKey);
      }
    } else {
      const meaningKey = `meaning:${surah.meaningTr.toLowerCase()}`;
      if (usedClueKeys.has(meaningKey)) continue;
      usedClueKeys.add(meaningKey);
      if (surah.mukattaa) {
        clueArabic = surah.mukattaa.arabic;
        clueTag = 'ANLAM · MUKATTAA';
      }
    }

    chosen.push({ surah, clueTitle, clueArabic, clueTag });
  }

  const rawCards: Omit<MemoryCardItem, 'slotNo'>[] = [];
  for (const item of chosen) {
    rawCards.push({
      id: `s-${item.surah.no}`,
      pairId: item.surah.no,
      side: 'surah',
      surah: item.surah,
      clueTitle: item.clueTitle,
      clueArabic: item.clueArabic,
      clueTag: item.clueTag,
    });
    rawCards.push({
      id: `c-${item.surah.no}`,
      pairId: item.surah.no,
      side: 'clue',
      surah: item.surah,
      clueTitle: item.clueTitle,
      clueArabic: item.clueArabic,
      clueTag: item.clueTag,
    });
  }

  return shuffleArray(rawCards).map((card, index) => ({
    ...card,
    slotNo: index + 1,
  }));
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
  const isVersus = playerMode === 'ai' || playerMode === 'duel';
  const pairCount = isCompact ? 6 : tierId === 'kademe_1' ? 6 : 8;
  const timedLimitSec = pairCount <= 6 ? 80 : 100;
  const aiMemoryCapacity = getAiMemoryCapacity(tierId);

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
  const [movesCount, setMovesCount] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // Karşılaşma (Yapay Zekâ / 2 Oyuncu) Durumu
  const [activePlayer, setActivePlayer] = useState<'p1' | 'p2'>('p1');
  const [aiThinking, setAiThinking] = useState<boolean>(false);
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);
  const [p1Correct, setP1Correct] = useState<number>(0);
  const [p2Correct, setP2Correct] = useState<number>(0);
  const [turnRemainingSec, setTurnRemainingSec] = useState<number>(TURN_SECONDS);

  // Canlı Bilgi Notu
  const [featuredSurah, setFeaturedSurah] = useState<EnrichedGameSurah | null>(null);
  const [featuredNote, setFeaturedNote] = useState<string | undefined>(undefined);

  // Yapay zekânın hatırladığı son N kart (gerçekçi insan hafızası)
  const aiMemoryRef = useRef<string[]>([]);
  const mistakenMapRef = useRef<Map<number, EnrichedGameSurah>>(new Map());
  const finishedRef = useRef<boolean>(false);

  const isPreview = previewLeft > 0;
  const useTurnTimer = isVersus || tempo === 'timed';

  const rememberCardForAi = useCallback(
    (cardId: string) => {
      const next = aiMemoryRef.current.filter((id) => id !== cardId);
      next.push(cardId);
      if (next.length > aiMemoryCapacity) {
        next.splice(0, next.length - aiMemoryCapacity);
      }
      aiMemoryRef.current = next;
    },
    [aiMemoryCapacity],
  );

  // 2 saniyelik açılış gözlemi
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
        tempo === 'timed' && playerMode === 'single'
          ? Math.max(0, timedLimitSec - finalStats.elapsedSec)
          : 0;
      const totalScore = playerMode === 'single' ? finalStats.score + timeBonus : finalStats.p1Score;
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
        duel: isVersus
          ? {
              p1Score: finalStats.p1Score,
              p2Score: finalStats.p2Score,
              p1Correct: finalStats.p1Correct,
              p2Correct: finalStats.p2Correct,
              p1Label: playerMode === 'ai' ? 'Sen' : '1. Oyuncu',
              p2Label: playerMode === 'ai' ? 'Yapay Zekâ' : '2. Oyuncu',
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
    [isVersus, onComplete, playerMode, tempo, tierId, timedLimitSec],
  );

  // Genel süre sayacı
  useEffect(() => {
    if (isPreview || finishedRef.current) return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isPreview]);

  // Tur geri sayımı (15s) — yalnızca insan sırası aktifken
  useEffect(() => {
    if (isPreview || finishedRef.current || !useTurnTimer) return;
    if (playerMode === 'ai' && activePlayer === 'p2') return;

    const interval = window.setInterval(() => {
      setTurnRemainingSec((prev) => {
        if (prev <= 1) {
          if (isVersus) {
            setFlippedIds([]);
            setIsLocked(false);
            gameAudioService.playTurnSwitch();
            setActivePlayer((cur) => (cur === 'p1' ? 'p2' : 'p1'));
          }
          return TURN_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activePlayer, isPreview, isVersus, playerMode, useTurnTimer]);

  // Zaman Yarışı (tek oyuncu) genel süre bitişi
  useEffect(() => {
    if (
      tempo === 'timed' &&
      playerMode === 'single' &&
      !isPreview &&
      elapsedSec >= timedLimitSec &&
      !finishedRef.current
    ) {
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
    playerMode,
    score,
    tempo,
    timedLimitSec,
  ]);

  // İki kart açıldığında eşleşme değerlendirmesi
  const evaluatePair = useCallback(
    (firstCard: MemoryCardItem, secondCard: MemoryCardItem, actor: 'p1' | 'p2') => {
      setIsLocked(true);
      setMovesCount((prev) => prev + 1);

      if (firstCard.pairId === secondCard.pairId && firstCard.side !== secondCard.side) {
        const nextCombo = actor === 'p1' ? combo + 1 : 0;
        const nextMaxCombo = Math.max(maxCombo, nextCombo);
        const earnedSinglePts = 12 + Math.min(12, Math.max(0, nextCombo - 1) * 4);
        const nextScore = playerMode === 'single' ? score + earnedSinglePts : score;
        const nextMatched = [...matchedPairIds, secondCard.pairId];

        const nextP1Score = actor === 'p1' ? p1Score + 10 : p1Score;
        const nextP2Score = actor === 'p2' ? p2Score + 10 : p2Score;
        const nextP1Correct = actor === 'p1' ? p1Correct + 1 : p1Correct;
        const nextP2Correct = actor === 'p2' ? p2Correct + 1 : p2Correct;
        const nextCorrectTotal = correctCount + (actor === 'p1' || playerMode === 'duel' ? 1 : 0);

        window.setTimeout(() => {
          gameAudioService.playMatch(Math.max(1, nextCombo));
          setMatchedPairIds(nextMatched);
          setMatchedOwner((prev) => ({ ...prev, [secondCard.pairId]: actor }));
          setScore(nextScore);
          setP1Score(nextP1Score);
          setP2Score(nextP2Score);
          setP1Correct(nextP1Correct);
          setP2Correct(nextP2Correct);
          setCombo(nextCombo);
          setMaxCombo(nextMaxCombo);
          setCorrectCount(nextCorrectTotal);
          setFeaturedSurah(secondCard.surah);
          setFeaturedNote(
            actor === 'p2' && playerMode === 'ai'
              ? `Yapay Zekâ eşleştirdi (+10p) · ${secondCard.surah.no}. ${secondCard.surah.shortNameTr}`
              : `${actor === 'p1' ? (playerMode === 'duel' ? '1. Oyuncu' : 'Sen') : '2. Oyuncu'} eşleştirdi (+10p)`,
          );
          setFlippedIds([]);
          setTurnRemainingSec(TURN_SECONDS);
          setIsLocked(false);
          setAiThinking(false);

          if (nextMatched.length >= deck.length / 2) {
            window.setTimeout(() => {
              finishGame({
                score: nextScore,
                maxCombo: nextMaxCombo,
                correctCount: nextCorrectTotal,
                mistakeCount,
                elapsedSec,
                p1Score: nextP1Score,
                p2Score: nextP2Score,
                p1Correct: nextP1Correct,
                p2Correct: nextP2Correct,
              });
            }, 420);
          }
        }, 280);
      } else {
        if (actor === 'p1' || playerMode === 'duel') {
          mistakenMapRef.current.set(firstCard.surah.no, firstCard.surah);
          mistakenMapRef.current.set(secondCard.surah.no, secondCard.surah);
          setMistakeCount((prev) => prev + 1);
        }
        setWrongIds([firstCard.id, secondCard.id]);
        if (actor === 'p1') setCombo(0);
        gameAudioService.playWrong();

        window.setTimeout(() => {
          setFlippedIds([]);
          setWrongIds([]);
          setIsLocked(false);
          setAiThinking(false);
          setTurnRemainingSec(TURN_SECONDS);
          if (isVersus) {
            gameAudioService.playTurnSwitch();
            setActivePlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
          }
        }, 720);
      }
    },
    [
      combo,
      correctCount,
      deck.length,
      elapsedSec,
      finishGame,
      isVersus,
      matchedPairIds,
      maxCombo,
      mistakeCount,
      p1Correct,
      p1Score,
      p2Correct,
      p2Score,
      playerMode,
      score,
    ],
  );

  // Yapay Zekâ Hamle Motoru (Sıra YZ'de olduğunda gerçekçi hafızayla oynar)
  useEffect(() => {
    if (
      playerMode !== 'ai' ||
      activePlayer !== 'p2' ||
      isPreview ||
      isLocked ||
      finishedRef.current
    ) {
      return;
    }

    const unmatchedCards = deck.filter((c) => !matchedPairIds.includes(c.pairId));
    if (unmatchedCards.length < 2) return;

    setAiThinking(true);
    let cancelled = false;

    const pickTimeout = window.setTimeout(() => {
      if (cancelled || finishedRef.current) return;

      // 1. Hafızada bilinen eşleşen bir çift var mı?
      const memCards = aiMemoryRef.current
        .map((id) => unmatchedCards.find((c) => c.id === id))
        .filter((c): c is MemoryCardItem => Boolean(c));

      let firstPick: MemoryCardItem | null = null;
      let secondPick: MemoryCardItem | null = null;

      for (let i = 0; i < memCards.length && !firstPick; i += 1) {
        for (let j = i + 1; j < memCards.length; j += 1) {
          if (memCards[i].pairId === memCards[j].pairId) {
            firstPick = memCards[i];
            secondPick = memCards[j];
            break;
          }
        }
      }

      if (!firstPick) {
        // Önce hafızasında olmayan bir kartı keşfet
        const unseen = unmatchedCards.filter((c) => !aiMemoryRef.current.includes(c.id));
        const pool = unseen.length > 0 ? unseen : unmatchedCards;
        firstPick = pool[Math.floor(Math.random() * pool.length)];
      }

      gameAudioService.playFlip();
      rememberCardForAi(firstPick.id);
      setFlippedIds([firstPick.id]);

      const secondTimeout = window.setTimeout(() => {
        if (cancelled || finishedRef.current || !firstPick) return;

        if (!secondPick) {
          // İlk açtığı kartın eşi hafızasında var mı?
          const mateInMem = memCards.find(
            (c) => c.pairId === firstPick!.pairId && c.id !== firstPick!.id,
          );
          if (mateInMem) {
            secondPick = mateInMem;
          } else {
            const others = unmatchedCards.filter((c) => c.id !== firstPick!.id);
            secondPick = others[Math.floor(Math.random() * others.length)];
          }
        }

        gameAudioService.playFlip();
        rememberCardForAi(secondPick.id);
        setFlippedIds([firstPick.id, secondPick.id]);
        evaluatePair(firstPick, secondPick, 'p2');
      }, 650);

      return () => window.clearTimeout(secondTimeout);
    }, 850);

    return () => {
      cancelled = true;
      window.clearTimeout(pickTimeout);
    };
  }, [
    activePlayer,
    deck,
    evaluatePair,
    isLocked,
    isPreview,
    matchedPairIds,
    playerMode,
    rememberCardForAi,
  ]);

  // HUD senkronizasyonu (Sağ panel & Mobil bar)
  useEffect(() => {
    const remaining = Math.max(0, timedLimitSec - elapsedSec);
    const statusMessage = isPreview
      ? `Kartları gözlemleyin... (${previewLeft} sn)`
      : playerMode === 'ai' && activePlayer === 'p2'
        ? 'Yapay zekâ hamlesini yapıyor...'
        : playerMode === 'duel'
          ? activePlayer === 'p1'
            ? '1. Oyuncu sırada: iki kart çevir.'
            : '2. Oyuncu sırada: iki kart çevir.'
          : 'Sıra sende: iki kart çevir ve eşleştir.';

    onHudUpdate({
      score: playerMode === 'single' ? score : p1Score,
      p1Score: playerMode === 'single' ? score : p1Score,
      p2Score,
      activeTurn: playerMode === 'single' ? 'p1' : activePlayer,
      aiThinking: playerMode === 'ai' && aiThinking,
      combo,
      movesCount,
      progressLabel: `${matchedPairIds.length}/${deck.length / 2}`,
      elapsedSec,
      timerText:
        tempo === 'timed' && playerMode === 'single'
          ? formatClock(remaining)
          : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && playerMode === 'single' && remaining <= 12,
      turnRemainingSec: useTurnTimer && !isPreview ? turnRemainingSec : null,
      turnDurationSec: TURN_SECONDS,
      statusMessage,
      featuredSurah,
      featuredNote,
    });
  }, [
    activePlayer,
    aiThinking,
    combo,
    deck.length,
    elapsedSec,
    featuredNote,
    featuredSurah,
    isPreview,
    matchedPairIds.length,
    movesCount,
    onHudUpdate,
    p1Score,
    p2Score,
    playerMode,
    previewLeft,
    score,
    tempo,
    timedLimitSec,
    turnRemainingSec,
    useTurnTimer,
  ]);

  const handleCardTap = (card: MemoryCardItem) => {
    if (isPreview || isLocked || finishedRef.current) return;
    if (playerMode === 'ai' && activePlayer === 'p2') return;
    if (matchedPairIds.includes(card.pairId)) return;
    if (flippedIds.includes(card.id)) return;

    gameAudioService.playFlip();
    rememberCardForAi(card.id);

    const nextFlipped = [...flippedIds, card.id];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length < 2) return;

    const firstCard = deck.find((c) => c.id === nextFlipped[0]);
    if (!firstCard) return;
    evaluatePair(firstCard, card, playerMode === 'single' ? 'p1' : activePlayer);
  };

  const gridClasses =
    pairCount <= 6
      ? 'grid-cols-3 grid-rows-4 sm:grid-cols-4 sm:grid-rows-3 gap-2 sm:gap-3'
      : 'grid-cols-4 grid-rows-4 gap-2 sm:gap-3';

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      {/* Açılış Gözlem Şeridi (Zümrüt Masa Üstünde Zarif Şerit) */}
      {isPreview && (
        <div className="shrink-0 rounded-xl px-3 py-1.5 flex items-center justify-center gap-2 text-xs sm:text-sm font-bold bg-amber-100/95 text-amber-950 border border-amber-300 shadow-sm">
          <Eye className="w-4 h-4 shrink-0" />
          <span>Kartları Gözlemleyin...</span>
          <span className="tabular-nums px-1.5 py-0.5 rounded bg-amber-900/15">
            {previewLeft} sn
          </span>
        </div>
      )}

      {/* 3B Kalınlıklı Numaralı Kart Izgarası */}
      <div className={`flex-1 min-h-0 grid ${gridClasses}`}>
        {deck.map((card) => {
          const isMatched = matchedPairIds.includes(card.pairId);
          const isFlipped = isPreview || isMatched || flippedIds.includes(card.id);
          const isWrong = wrongIds.includes(card.id);
          const owner = matchedOwner[card.pairId];
          const ownerBadge = isMatched
            ? owner === 'p2'
              ? playerMode === 'ai'
                ? 'YZ'
                : 'P2'
              : playerMode === 'duel'
                ? 'P1'
                : 'SEN'
            : null;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardTap(card)}
              disabled={isPreview || isMatched || (playerMode === 'ai' && activePlayer === 'p2')}
              aria-label={isFlipped ? `${card.surah.nameTr}` : `Kart #${card.slotNo}`}
              className={`game-card-perspective w-full h-full min-h-0 cursor-pointer select-none focus:outline-none ${
                isWrong ? 'game-shake' : ''
              }`}
            >
              <div className={`game-card-inner ${isFlipped ? 'is-flipped' : ''}`}>
                {/* KAPALI YÜZ — 3B Parşömen Kalınlık + Madalyon + #1..#16 Sıra Numarası */}
                <div className="game-card-face game-bevel-parchment rounded-xl sm:rounded-2xl flex items-center justify-center gap-1.5 sm:gap-2.5 p-2 transition-transform hover:brightness-[1.02]">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-amber-800/20 bg-amber-900/8 flex items-center justify-center shrink-0 text-teal-800">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <polygon points="12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9 12 2" />
                      <circle cx="12" cy="12" r="2.1" />
                    </svg>
                  </div>
                  <span className="text-sm sm:text-lg font-black tabular-nums tracking-tight text-slate-700">
                    #{card.slotNo}
                  </span>
                </div>

                {/* AÇIK / EŞLEŞMİŞ YÜZ — Koyu Zümrüt 3B Kart + İkon Kutusu + Etiketler */}
                <div
                  className={`game-card-face game-card-face-front rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 flex flex-col justify-between text-left overflow-hidden ${
                    isWrong
                      ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white'
                      : 'game-bevel-emerald'
                  }`}
                >
                  {/* Üst Etiket Satırı: Tip + SEN/YZ + Onay */}
                  <div className="flex items-center justify-between gap-1 shrink-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[8px] sm:text-[9px] font-extrabold tracking-wide uppercase px-1.5 py-0.5 rounded bg-white/12 text-amber-200 truncate">
                        {card.side === 'surah' ? 'SURE · عربي' : card.clueTag}
                      </span>
                      {ownerBadge && (
                        <span
                          className={`text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                            owner === 'p2'
                              ? 'bg-teal-200 text-teal-950'
                              : 'bg-amber-400 text-amber-950'
                          }`}
                        >
                          {ownerBadge}
                        </span>
                      )}
                    </div>
                    {isMatched && (
                      <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-400/25 text-emerald-200 inline-flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                  </div>

                  {/* Orta Gövde: Sol İkon Kutusu + Sağ Yüksek Kontrast Tipografi */}
                  <div className="flex-1 min-h-0 flex items-center gap-1.5 sm:gap-2.5 py-0.5">
                    <div className="hidden sm:flex w-8 h-8 rounded-lg bg-white/10 border border-white/15 items-center justify-center shrink-0 text-amber-300">
                      {card.side === 'surah' ? (
                        <BookOpen className="w-4 h-4" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      {card.side === 'surah' ? (
                        <>
                          <div
                            dir="rtl"
                            className="font-arabic text-base sm:text-xl leading-tight text-amber-200 line-clamp-1"
                          >
                            {card.surah.nameAr}
                          </div>
                          <div className="text-[11px] sm:text-sm font-extrabold leading-tight text-white line-clamp-1">
                            {card.surah.no}. {card.surah.shortNameTr}
                          </div>
                        </>
                      ) : (
                        <>
                          {card.clueArabic && (
                            <div
                              dir="rtl"
                              className="font-arabic text-sm sm:text-base font-bold leading-none text-amber-300 mb-0.5"
                            >
                              {card.clueArabic}
                            </div>
                          )}
                          <div className="text-[10px] sm:text-xs font-bold leading-snug text-white line-clamp-3">
                            {card.clueTitle}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
