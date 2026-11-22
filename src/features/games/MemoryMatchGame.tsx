import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Eye, Sparkles } from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  shuffleArray,
} from './gameTypes';
import { StagePromptBanner } from './StagePromptBanner';
import { useManagedTimeouts } from './useManagedTimeouts';

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
const MISMATCH_FLIP_BACK_MS = 850;

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
  playerNames,
  tierSurahs,
  onHudUpdate,
  onComplete,
}) => {
  const isCompact = useIsCompactViewport();
  const isDuel = playerMode === 'duel';
  const p1Name = playerNames?.p1?.trim() || '1. Oyuncu';
  const p2Name = playerNames?.p2?.trim() || '2. Oyuncu';
  const pairCount = isCompact ? 6 : tierId === 'kademe_1' ? 6 : 8;
  const timedLimitSec = pairCount <= 6 ? 80 : 100;
  const { scheduleTimeout, cancelTimeout, clearAllTimeouts } = useManagedTimeouts();

  const deck = useMemo(
    () => buildMemoryDeck(tierSurahs, tierId, pairCount),
    [tierSurahs, tierId, pairCount],
  );

  // Oyun Aşaması ve Kart Durumu
  const [previewLeft, setPreviewLeft] = useState<number>(PREVIEW_SECONDS);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [matchedPairIds, setMatchedPairIds] = useState<number[]>([]);
  const [matchedOwner, setMatchedOwner] = useState<Record<number, 'p1' | 'p2'>>({});
  const [wrongIds, setWrongIds] = useState<string[]>([]);

  // Skor & İstatistikler
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // 2 Oyuncu Sıra & Skor Durumu
  const [activePlayer, setActivePlayer] = useState<'p1' | 'p2'>('p1');
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);
  const [p1Correct, setP1Correct] = useState<number>(0);
  const [p2Correct, setP2Correct] = useState<number>(0);
  const [turnRemainingSec, setTurnRemainingSec] = useState<number>(TURN_SECONDS);

  // Canlı Bilgi Notu
  const [featuredSurah, setFeaturedSurah] = useState<EnrichedGameSurah | null>(null);
  const [featuredNote, setFeaturedNote] = useState<string | undefined>(undefined);

  // Deterministik Kilit ve Zamanlayıcı Ref'leri (Hiçbir kronometre efekti bunları iptal etmez!)
  const phaseRef = useRef<'preview' | 'playing' | 'finished'>('preview');
  const isResolvingRef = useRef<boolean>(false);
  const flippedIdsRef = useRef<string[]>([]);
  const matchedPairIdsRef = useRef<Set<number>>(new Set());
  const mismatchTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const mistakenMapRef = useRef<Map<number, EnrichedGameSurah>>(new Map());
  const elapsedSecRef = useRef<number>(0);

  const isPreview = previewLeft > 0;
  const useTurnTimer = isDuel || tempo === 'timed';

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    if (phaseRef.current === 'finished') return;
    phaseRef.current = isPreview ? 'preview' : 'playing';
  }, [isPreview]);

  // 2 saniyelik açılış gözlemi (unmount temizliği useManagedTimeouts tarafından yönetilir)
  useEffect(() => {
    if (previewLeft <= 0) return;
    const timer = scheduleTimeout(() => {
      setPreviewLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => cancelTimeout(timer);
  }, [cancelTimeout, previewLeft, scheduleTimeout]);

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
      if (phaseRef.current === 'finished') return;
      phaseRef.current = 'finished';
      isResolvingRef.current = false;

      clearAllTimeouts();
      mismatchTimerRef.current = null;
      finishTimerRef.current = null;

      gameAudioService.playFanfare();

      const totalAttempts = Math.max(1, finalStats.correctCount + finalStats.mistakeCount);
      const accuracyPct = Math.round((finalStats.correctCount / totalAttempts) * 100);
      const timeBonus =
        tempo === 'timed' && !isDuel
          ? Math.max(0, timedLimitSec - finalStats.elapsedSec)
          : 0;
      const totalScore = !isDuel ? finalStats.score + timeBonus : finalStats.p1Score;
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
              p1Label: '1. Oyuncu',
              p2Label: '2. Oyuncu',
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
    [clearAllTimeouts, isDuel, onComplete, playerMode, tempo, tierId, timedLimitSec],
  );

  // Genel süre sayacı (kart kapatma zamanlayıcısından tamamen bağımsız)
  useEffect(() => {
    if (isPreview) return;
    const interval = window.setInterval(() => {
      if (phaseRef.current !== 'playing') return;
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isPreview]);

  // Tur geri sayımı (15s) — yalnızca sayaç düşürür; yan etkiler ayrı effect'te işlenir
  useEffect(() => {
    if (isPreview || !useTurnTimer) return;
    const interval = window.setInterval(() => {
      if (phaseRef.current !== 'playing' || isResolvingRef.current) return;
      setTurnRemainingSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isPreview, useTurnTimer]);

  // Tur süresi dolduğunda (1 kart açık kalmışsa dahil) tahtayı kilitsiz temizle ve sırayı devret
  useEffect(() => {
    if (!useTurnTimer || isPreview || turnRemainingSec > 0) return;
    if (phaseRef.current !== 'playing') return;
    if (isResolvingRef.current) return;

    flippedIdsRef.current = [];
    setFlippedIds([]);
    setWrongIds([]);
    isResolvingRef.current = false;
    setTurnRemainingSec(TURN_SECONDS);

    if (isDuel) {
      gameAudioService.playTurnSwitch();
      setActivePlayer((cur) => (cur === 'p1' ? 'p2' : 'p1'));
    }
  }, [isDuel, isPreview, turnRemainingSec, useTurnTimer]);

  // Zaman Yarışı (Tek Oyuncu) genel süre bitişi
  useEffect(() => {
    if (
      tempo === 'timed' &&
      !isDuel &&
      !isPreview &&
      elapsedSec >= timedLimitSec &&
      phaseRef.current === 'playing'
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
    isDuel,
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

  // HUD senkronizasyonu (Sağ panel & Mobil bar)
  useEffect(() => {
    const remaining = Math.max(0, timedLimitSec - elapsedSec);
    const statusMessage = isPreview
      ? `Kartları gözlemleyin... (${previewLeft} sn)`
      : isDuel
        ? activePlayer === 'p1'
          ? '1. Oyuncu sırada: iki kart çevir.'
          : '2. Oyuncu sırada: iki kart çevir.'
        : 'İki kart çevir ve sureyi künyesiyle eşleştir.';

    onHudUpdate({
      score: !isDuel ? score : p1Score,
      p1Score: !isDuel ? score : p1Score,
      p2Score,
      activeTurn: !isDuel ? 'p1' : activePlayer,
      combo,
      movesCount,
      progressLabel: `${matchedPairIds.length}/${deck.length / 2}`,
      elapsedSec,
      timerText:
        tempo === 'timed' && !isDuel
          ? formatClock(remaining)
          : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && !isDuel && remaining <= 12,
      turnRemainingSec: useTurnTimer && !isPreview ? turnRemainingSec : null,
      turnDurationSec: TURN_SECONDS,
      statusMessage,
      featuredSurah,
      featuredNote,
      roundContextTitle: 'Hafıza Eşleştirme',
      roundContextHint:
        'Aynı surenin Arapça/Türkçe kartı ile anlam veya özel grup kartını eşleştirin. Her doğru eşleşme sure künyesini ve tilavetini açar.',
    });
  }, [
    activePlayer,
    combo,
    deck.length,
    elapsedSec,
    featuredNote,
    featuredSurah,
    isDuel,
    isPreview,
    matchedPairIds.length,
    movesCount,
    onHudUpdate,
    p1Score,
    p2Score,
    previewLeft,
    score,
    tempo,
    timedLimitSec,
    turnRemainingSec,
    useTurnTimer,
  ]);

  // Kesin Korumalı Kart Tıklama & Eşleşme Motoru
  const handleCardTap = (card: MemoryCardItem) => {
    // 1. Aşama ve kilit korumaları
    if (phaseRef.current !== 'playing') return;
    if (isResolvingRef.current) return;
    if (flippedIdsRef.current.length >= 2) return;
    // 2. Zaten eşleşmiş veya zaten açık olan aynı karta tıklamayı kesin engelle
    if (matchedPairIdsRef.current.has(card.pairId)) return;
    if (flippedIdsRef.current.includes(card.id)) return;

    gameAudioService.playFlip();

    const nextFlipped = [...flippedIdsRef.current, card.id];
    flippedIdsRef.current = nextFlipped;
    setFlippedIds(nextFlipped);

    // Henüz ilk kart açıldıysa ikinci kartı bekle
    if (nextFlipped.length < 2) return;

    const firstCard = deck.find((c) => c.id === nextFlipped[0]);
    if (!firstCard || firstCard.id === card.id) {
      flippedIdsRef.current = [];
      setFlippedIds([]);
      return;
    }

    const actor: 'p1' | 'p2' = isDuel ? activePlayer : 'p1';
    setMovesCount((prev) => prev + 1);

    // DURUM A: EŞLEŞME DOĞRU — anında eşleştir, tahtayı sıfır gecikmeyle kilitsiz bırak
    if (firstCard.pairId === card.pairId && firstCard.side !== card.side) {
      matchedPairIdsRef.current.add(card.pairId);
      const nextMatchedArr = Array.from(matchedPairIdsRef.current);

      const nextCombo = !isDuel || actor === 'p1' ? combo + 1 : combo;
      const nextMaxCombo = Math.max(maxCombo, nextCombo);
      const earnedSinglePts = 12 + Math.min(12, Math.max(0, nextCombo - 1) * 4);
      const nextScore = !isDuel ? score + earnedSinglePts : score;
      const nextP1Score = actor === 'p1' ? p1Score + 10 : p1Score;
      const nextP2Score = actor === 'p2' ? p2Score + 10 : p2Score;
      const nextP1Correct = actor === 'p1' ? p1Correct + 1 : p1Correct;
      const nextP2Correct = actor === 'p2' ? p2Correct + 1 : p2Correct;
      const nextCorrectTotal = correctCount + 1;

      flippedIdsRef.current = [];
      isResolvingRef.current = false;

      gameAudioService.playMatch(Math.max(1, nextCombo));
      setFlippedIds([]);
      setWrongIds([]);
      setMatchedPairIds(nextMatchedArr);
      setMatchedOwner((prev) => ({ ...prev, [card.pairId]: actor }));
      setScore(nextScore);
      setP1Score(nextP1Score);
      setP2Score(nextP2Score);
      setP1Correct(nextP1Correct);
      setP2Correct(nextP2Correct);
      setCombo(nextCombo);
      setMaxCombo(nextMaxCombo);
      setCorrectCount(nextCorrectTotal);
      setFeaturedSurah(card.surah);
      setFeaturedNote(
        isDuel
          ? `${actor === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} eşleştirdi (+10p) — sıra hakkı devam ediyor!`
          : `Doğru eşleşme (+${earnedSinglePts}p) · ${card.surah.no}. ${card.surah.shortNameTr}`,
      );
      setTurnRemainingSec(TURN_SECONDS);

      if (nextMatchedArr.length >= deck.length / 2) {
        finishTimerRef.current = scheduleTimeout(() => {
          finishTimerRef.current = null;
          finishGame({
            score: nextScore,
            maxCombo: nextMaxCombo,
            correctCount: nextCorrectTotal,
            mistakeCount,
            elapsedSec: elapsedSecRef.current,
            p1Score: nextP1Score,
            p2Score: nextP2Score,
            p1Correct: nextP1Correct,
            p2Correct: nextP2Correct,
          });
        }, 420);
      }
      return;
    }

    // DURUM B: EŞLEŞME YANLIŞ — 850ms koruma ile kapat ve tahtayı temizce aç
    isResolvingRef.current = true;
    mistakenMapRef.current.set(firstCard.surah.no, firstCard.surah);
    mistakenMapRef.current.set(card.surah.no, card.surah);
    setMistakeCount((prev) => prev + 1);
    setCombo(0);
    setWrongIds([firstCard.id, card.id]);
    gameAudioService.playWrong();

    if (mismatchTimerRef.current !== null) {
      cancelTimeout(mismatchTimerRef.current);
    }

    mismatchTimerRef.current = scheduleTimeout(() => {
      mismatchTimerRef.current = null;
      flippedIdsRef.current = [];
      isResolvingRef.current = false;
      setFlippedIds([]);
      setWrongIds([]);
      setTurnRemainingSec(TURN_SECONDS);

      if (isDuel && phaseRef.current === 'playing') {
        gameAudioService.playTurnSwitch();
        setActivePlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
      }
    }, MISMATCH_FLIP_BACK_MS);
  };

  const gridClasses =
    pairCount <= 6
      ? 'grid-cols-3 sm:grid-cols-4 sm:grid-rows-3 gap-2 sm:gap-3'
      : 'grid-cols-3 sm:grid-cols-4 sm:grid-rows-4 gap-2 sm:gap-3';

  return (
    <div className="flex-1 min-h-full lg:min-h-0 flex flex-col justify-center gap-2.5 sm:gap-3.5">
      {/* Zümrüt Masa Üst Görev Başlığı */}
      <StagePromptBanner
        compact
        badgeIcon={isPreview ? <Eye className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
        badgeLabel={isPreview ? `Gözlem (${previewLeft} sn)` : 'Hafızanı Yokla'}
        prompt={
          isPreview
            ? 'Kartların yerini aklınızda tutun, birazdan kapanacaklar...'
            : isDuel
              ? `${activePlayer === 'p1' ? p1Name : p2Name} sırada — iki kart çevirip sureyi künyesiyle eşleştirin`
              : 'İki kart çevirerek sureyi anlamı veya özel grup künyesiyle eşleştirin'
        }
        progressBadge={`${matchedPairIds.length}/${deck.length / 2} Eşleşme`}
      />

      {/* 3B Kalınlıklı Numaralı Kart Izgarası */}
      <div className={`flex-1 min-h-0 grid ${gridClasses}`}>
        {deck.map((card) => {
          const isMatched = matchedPairIds.includes(card.pairId);
          const isFlipped = isPreview || isMatched || flippedIds.includes(card.id);
          const isWrong = wrongIds.includes(card.id);
          const owner = matchedOwner[card.pairId];
          // Tek Oyuncu modunda gereksiz SEN etiketi yok; 2 Oyuncu modunda zarif P1 / P2 rozeti
          const ownerBadge = isDuel && isMatched ? (owner === 'p2' ? 'P2' : 'P1') : null;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardTap(card)}
              disabled={isPreview || isMatched}
              aria-label={isFlipped ? `${card.surah.nameTr}` : `Kart #${card.slotNo}`}
              className={`game-card-perspective w-full h-full min-h-[92px] sm:min-h-0 cursor-pointer select-none focus:outline-none ${
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
                  <span className="text-base sm:text-xl font-black tabular-nums tracking-tight text-slate-700">
                    #{card.slotNo}
                  </span>
                </div>

                {/* AÇIK / EŞLEŞMİŞ YÜZ — Koyu Zümrüt 3B Kart + Yüksek Okunabilirlik Tipografi */}
                <div
                  className={`game-card-face game-card-face-front rounded-xl sm:rounded-2xl p-2 sm:p-3 flex flex-col justify-between text-left overflow-hidden ${
                    isWrong
                      ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white'
                      : 'game-bevel-emerald'
                  }`}
                >
                  {/* Üst Etiket Satırı: Tip + (2 Oyuncu modunda P1/P2) + Onay */}
                  <div className="flex items-center justify-between gap-1 shrink-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[9px] sm:text-[10px] font-extrabold tracking-wide uppercase px-1.5 py-0.5 rounded bg-white/14 text-amber-200 truncate">
                        {card.side === 'surah' ? 'SURE' : card.clueTag}
                      </span>
                      {ownerBadge && (
                        <span
                          className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                            owner === 'p2'
                              ? 'bg-amber-400 text-amber-950'
                              : 'bg-teal-200 text-teal-950'
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

                  {/* Orta Gövde: Sol İkon Kutusu (lg+) + Yüksek Kontrast Tipografi */}
                  <div className="flex-1 min-h-0 flex items-center gap-2 py-0.5">
                    <div className="hidden lg:flex w-8 h-8 rounded-lg bg-white/10 border border-white/15 items-center justify-center shrink-0 text-amber-300">
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
                            lang="ar"
                            className="font-arabic text-xl sm:text-2xl lg:text-[26px] leading-tight text-amber-200 truncate"
                          >
                            {card.surah.nameAr}
                          </div>
                          <div className="text-xs sm:text-sm lg:text-[16px] font-extrabold leading-tight text-white line-clamp-2">
                            {card.surah.no}. {card.surah.shortNameTr}
                          </div>
                        </>
                      ) : (
                        <>
                          {card.clueArabic && (
                            <div
                              dir="rtl"
                              lang="ar"
                              className="font-arabic text-base sm:text-xl font-bold leading-none text-amber-300 mb-0.5"
                            >
                              {card.clueArabic}
                            </div>
                          )}
                          <div className="text-xs sm:text-sm lg:text-[15px] font-bold leading-snug text-white line-clamp-2 sm:line-clamp-3">
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
