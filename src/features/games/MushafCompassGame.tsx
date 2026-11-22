import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Compass,
  Lock,
  Minus,
  Plus,
  Scale,
} from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  shuffleArray,
} from './gameTypes';

type CompassTaskKind = 'dial' | 'scale';

interface CompassRoundData {
  id: string;
  kind: CompassTaskKind;
  targetSurah: EnrichedGameSurah;
  scalePair?: [EnrichedGameSurah, EnrichedGameSurah];
}

const TOTAL_CALM_ROUNDS = 6;
const TIMED_LIMIT_SEC = 75;

function scoreDialDistance(diff: number): number {
  if (diff === 0) return 100;
  if (diff <= 2) return 80;
  if (diff <= 6) return 50;
  if (diff <= 12) return 25;
  return 10;
}

function generateAiDialGuess(
  trueNo: number,
  tierId: GameComponentProps['tierId'],
  minNo: number,
  maxNo: number,
): number {
  const spread =
    tierId === 'kademe_1' ? 4 : tierId === 'kademe_2' ? 6 : tierId === 'kademe_3' ? 8 : 11;
  const offset = Math.round((Math.random() * 2 - 1) * spread);
  return Math.max(minNo, Math.min(maxNo, trueNo + offset));
}

function generateCompassRound(
  roundIndex: number,
  tierSurahs: EnrichedGameSurah[],
  usedNos: Set<number>,
): CompassRoundData {
  const kind: CompassTaskKind = roundIndex % 2 === 0 ? 'dial' : 'scale';
  const fresh = tierSurahs.filter((s) => !usedNos.has(s.no));
  const pool = fresh.length > 0 ? fresh : tierSurahs;

  if (kind === 'dial') {
    const target = pool[Math.floor(Math.random() * pool.length)] ?? tierSurahs[0];
    usedNos.add(target.no);
    return {
      id: `d-${roundIndex}-${target.no}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'dial',
      targetSurah: target,
    };
  }

  // Ayet Sayısı Tartısı: Ayet sayıları kesinlikle farklı iki sure seç
  const shuffled = shuffleArray(tierSurahs);
  const first = shuffled[0] ?? tierSurahs[0];
  let second = shuffled.find((s) => s.no !== first.no && s.ayahCount !== first.ayahCount);
  if (!second) {
    second = tierSurahs.find((s) => s.no !== first.no) ?? first;
  }
  const longer = first.ayahCount >= second.ayahCount ? first : second;
  return {
    id: `s-${roundIndex}-${first.no}-${second.no}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'scale',
    targetSurah: longer,
    scalePair: [first, second],
  };
}

export const MushafCompassGame: React.FC<GameComponentProps> = ({
  tierId,
  tempo,
  playerMode,
  tierSurahs,
  onHudUpdate,
  onComplete,
}) => {
  const isAi = playerMode === 'ai';
  const isDuel = playerMode === 'duel';
  const isVersus = isAi || isDuel;

  const usedNosRef = useRef<Set<number>>(new Set());
  const [roundIdx, setRoundIdx] = useState<number>(0);
  const [round, setRound] = useState<CompassRoundData>(() =>
    generateCompassRound(0, tierSurahs, usedNosRef.current),
  );

  // Kadran (Dial) Durumu
  const [dialValue, setDialValue] = useState<number>(57);
  const [duelP1DialLock, setDuelP1DialLock] = useState<number | null>(null);
  const [duelDialStep, setDuelDialStep] = useState<'p1' | 'p2'>('p1');
  const [dialRevealed, setDialRevealed] = useState<{
    p1Guess: number;
    p2Guess?: number;
    trueNo: number;
    p1Pts: number;
    p2Pts?: number;
    headline: string;
  } | null>(null);

  // Ayet Tartısı (Scale) Durumu
  const [scaleRevealed, setScaleRevealed] = useState<{
    pickedNo: number;
    longerNo: number;
    isCorrect: boolean;
    aiCorrect?: boolean;
    actor: 'p1' | 'p2';
  } | null>(null);

  // Genel Skor & İstatistikler
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);
  const [p1Correct, setP1Correct] = useState<number>(0);
  const [p2Correct, setP2Correct] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [featuredSurah, setFeaturedSurah] = useState<EnrichedGameSurah | null>(null);
  const [featuredNote, setFeaturedNote] = useState<string | undefined>(undefined);

  const mistakenMapRef = useRef<Map<number, EnrichedGameSurah>>(new Map());
  const finishedRef = useRef<boolean>(false);

  const scaleTurnPlayer: 'p1' | 'p2' = isDuel ? (roundIdx % 2 === 0 ? 'p1' : 'p2') : 'p1';

  const finishGame = useCallback(
    (stats: {
      p1Score: number;
      p2Score: number;
      p1Correct: number;
      p2Correct: number;
      maxCombo: number;
      mistakeCount: number;
      elapsedSec: number;
    }) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      gameAudioService.playFanfare();

      const totalCorrect = isDuel ? stats.p1Correct + stats.p2Correct : stats.p1Correct;
      const totalAttempts = Math.max(1, totalCorrect + stats.mistakeCount);
      const accuracyPct = Math.round((totalCorrect / totalAttempts) * 100);
      const stars = calculateGameStars(accuracyPct, Math.round(stats.p1Score / 3));
      const earnedXp = calculateGameXp(Math.round(stats.p1Score / 3), stars, stats.maxCombo);

      onComplete({
        gameId: 'compass',
        tierId,
        tempo,
        playerMode,
        score: stats.p1Score,
        stars,
        maxCombo: stats.maxCombo,
        correctCount: totalCorrect,
        mistakeCount: stats.mistakeCount,
        accuracyPct,
        durationSec: stats.elapsedSec,
        earnedXp,
        mistakenSurahs: Array.from(mistakenMapRef.current.values()),
        duel: isVersus
          ? {
              p1Score: stats.p1Score,
              p2Score: stats.p2Score,
              p1Correct: stats.p1Correct,
              p2Correct: stats.p2Correct,
              p1Label: isAi ? 'Sen' : '1. Oyuncu',
              p2Label: isAi ? 'Yapay Zekâ' : '2. Oyuncu',
              winner:
                stats.p1Score > stats.p2Score
                  ? 'p1'
                  : stats.p2Score > stats.p1Score
                    ? 'p2'
                    : 'draw',
            }
          : undefined,
      });
    },
    [isAi, isDuel, isVersus, onComplete, playerMode, tempo, tierId],
  );

  // Zamanlayıcı
  useEffect(() => {
    if (finishedRef.current) return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Süreli mod bitişi
  useEffect(() => {
    if (tempo === 'timed' && elapsedSec >= TIMED_LIMIT_SEC && !finishedRef.current) {
      finishGame({
        p1Score,
        p2Score,
        p1Correct,
        p2Correct,
        maxCombo,
        mistakeCount,
        elapsedSec,
      });
    }
  }, [
    elapsedSec,
    finishGame,
    maxCombo,
    mistakeCount,
    p1Correct,
    p1Score,
    p2Correct,
    p2Score,
    tempo,
  ]);

  // HUD senkronizasyonu
  useEffect(() => {
    const remaining = Math.max(0, TIMED_LIMIT_SEC - elapsedSec);
    const activeTurn: 'p1' | 'p2' | 'both' = isDuel
      ? round.kind === 'dial'
        ? duelDialStep
        : scaleTurnPlayer
      : isAi
        ? 'both'
        : 'p1';

    const statusMessage =
      round.kind === 'dial'
        ? isDuel && !dialRevealed
          ? duelDialStep === 'p1'
            ? '1. Oyuncu ibreyi sürükleyip konumunu kilitlesin.'
            : '2. Oyuncu ibreyi sürükleyip konumunu kilitlesin.'
          : 'İbreyi 1–114 arasında sürükle ve Konumu Kilitle.'
        : isDuel
          ? `${scaleTurnPlayer === 'p1' ? '1. Oyuncu' : '2. Oyuncu'}: Ayet sayısı daha fazla olan sureyi seç.`
          : 'Ayet sayısı daha fazla (daha uzun) olan sureyi seç.';

    onHudUpdate({
      score: p1Score,
      p1Score,
      p2Score,
      activeTurn,
      combo,
      movesCount,
      progressLabel:
        tempo === 'calm'
          ? `${Math.min(TOTAL_CALM_ROUNDS, roundIdx + 1)}/${TOTAL_CALM_ROUNDS}`
          : `${roundIdx + 1}. Görev`,
      elapsedSec,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 12,
      turnRemainingSec: tempo === 'timed' ? remaining : null,
      turnDurationSec: TIMED_LIMIT_SEC,
      statusMessage,
      featuredSurah,
      featuredNote,
    });
  }, [
    combo,
    dialRevealed,
    duelDialStep,
    elapsedSec,
    featuredNote,
    featuredSurah,
    isAi,
    isDuel,
    movesCount,
    onHudUpdate,
    p1Score,
    p2Score,
    round.kind,
    roundIdx,
    scaleTurnPlayer,
    tempo,
  ]);

  const advanceToNextRound = useCallback(() => {
    const nextIdx = roundIdx + 1;
    if (tempo === 'calm' && nextIdx >= TOTAL_CALM_ROUNDS) {
      finishGame({
        p1Score,
        p2Score,
        p1Correct,
        p2Correct,
        maxCombo,
        mistakeCount,
        elapsedSec,
      });
      return;
    }

    gameAudioService.playFlip();
    setRoundIdx(nextIdx);
    setRound(generateCompassRound(nextIdx, tierSurahs, usedNosRef.current));
    setDialValue(57);
    setDuelP1DialLock(null);
    setDuelDialStep('p1');
    setDialRevealed(null);
    setScaleRevealed(null);
  }, [
    elapsedSec,
    finishGame,
    maxCombo,
    mistakeCount,
    p1Correct,
    p1Score,
    p2Correct,
    p2Score,
    roundIdx,
    tempo,
    tierSurahs,
  ]);

  const handleLockDial = () => {
    if (dialRevealed || finishedRef.current) return;

    // 2 Oyuncu modunda önce 1. oyuncu kilitler, sonra 2. oyuncu kilitler
    if (isDuel && duelDialStep === 'p1') {
      gameAudioService.playSnap();
      setDuelP1DialLock(dialValue);
      setDialValue(57);
      setDuelDialStep('p2');
      return;
    }

    const trueNo = round.targetSurah.no;
    const p1Guess = isDuel && duelP1DialLock !== null ? duelP1DialLock : dialValue;
    const p2Guess = isDuel
      ? dialValue
      : isAi
        ? generateAiDialGuess(trueNo, tierId, 1, 114)
        : undefined;

    const p1Diff = Math.abs(p1Guess - trueNo);
    const p1BasePts = scoreDialDistance(p1Diff);
    const p2Diff = p2Guess !== undefined ? Math.abs(p2Guess - trueNo) : 999;
    const p2BasePts = p2Guess !== undefined ? scoreDialDistance(p2Diff) : 0;

    let p1Pts = p1BasePts;
    let p2Pts = p2BasePts;
    let headline =
      p1Diff === 0
        ? 'Tam İsabet! (+100p)'
        : p1Diff <= 2
          ? `Çok Yakın! ±${p1Diff} fark (+${p1Pts}p)`
          : p1Diff <= 6
            ? `Güzel Tahmin · ±${p1Diff} fark (+${p1Pts}p)`
            : `Gerçek konum: ${trueNo}. Sure (±${p1Diff} fark)`;

    if (isVersus && p2Guess !== undefined) {
      if (p1Diff < p2Diff) {
        p1Pts += 15;
        headline = `${isAi ? 'Sen' : '1. Oyuncu'} daha yakın! (+${p1Pts}p)`;
      } else if (p2Diff < p1Diff) {
        p2Pts += 15;
        headline = `${isAi ? 'Yapay Zekâ' : '2. Oyuncu'} daha yakın! (+${p2Pts}p)`;
      } else {
        headline = `Eşit mesafe! (±${p1Diff} fark)`;
      }
    }

    setMovesCount((prev) => prev + 1);
    setP1Score((prev) => prev + p1Pts);
    if (isVersus) setP2Score((prev) => prev + p2Pts);

    if (p1Diff <= 6) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setMaxCombo((prev) => Math.max(prev, nextCombo));
      setP1Correct((prev) => prev + 1);
      gameAudioService.playMatch(nextCombo);
    } else {
      setCombo(0);
      setMistakeCount((prev) => prev + 1);
      mistakenMapRef.current.set(round.targetSurah.no, round.targetSurah);
      gameAudioService.playWrong();
    }

    if (isVersus && p2Diff <= 6) {
      setP2Correct((prev) => prev + 1);
    }

    setDialRevealed({
      p1Guess,
      p2Guess,
      trueNo,
      p1Pts,
      p2Pts: isVersus ? p2Pts : undefined,
      headline,
    });
    setFeaturedSurah(round.targetSurah);
    setFeaturedNote(headline);
  };

  const handlePickScale = (picked: EnrichedGameSurah) => {
    if (scaleRevealed || !round.scalePair || finishedRef.current) return;
    const [left, right] = round.scalePair;
    const longer = left.ayahCount >= right.ayahCount ? left : right;
    const isCorrect = picked.no === longer.no;
    const actor = scaleTurnPlayer;

    setMovesCount((prev) => prev + 1);

    if (isCorrect) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setMaxCombo((prev) => Math.max(prev, nextCombo));
      gameAudioService.playMatch(nextCombo);
      if (actor === 'p1') {
        setP1Score((prev) => prev + 50);
        setP1Correct((prev) => prev + 1);
      } else {
        setP2Score((prev) => prev + 50);
        setP2Correct((prev) => prev + 1);
      }
    } else {
      setCombo(0);
      setMistakeCount((prev) => prev + 1);
      mistakenMapRef.current.set(longer.no, longer);
      gameAudioService.playWrong();
    }

    let aiGotIt: boolean | undefined;
    if (isAi) {
      aiGotIt = Math.random() < 0.78;
      if (aiGotIt) {
        setP2Score((prev) => prev + 50);
        setP2Correct((prev) => prev + 1);
      }
    }

    setScaleRevealed({
      pickedNo: picked.no,
      longerNo: longer.no,
      isCorrect,
      aiCorrect: aiGotIt,
      actor,
    });
    setFeaturedSurah(longer);
    setFeaturedNote(
      `${longer.shortNameTr} (${longer.ayahCount} ayet) daha uzundur · ${
        left.no === longer.no ? right.shortNameTr : left.shortNameTr
      }: ${left.no === longer.no ? right.ayahCount : left.ayahCount} ayet`,
    );
  };

  const toPercent = (n: number) => `${((n - 1) / 113) * 100}%`;

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 sm:gap-3 overflow-hidden">
      {/* Üst Görev Başlığı */}
      <div className="shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-300/35 shrink-0">
            {round.kind === 'dial' ? (
              <>
                <Compass className="w-3.5 h-3.5" />
                <span>Konum Kadranı (1–114)</span>
              </>
            ) : (
              <>
                <Scale className="w-3.5 h-3.5" />
                <span>Ayet Sayısı Tartısı</span>
              </>
            )}
          </span>
          <span className="text-xs sm:text-sm font-bold text-white/95 truncate">
            {round.kind === 'dial'
              ? 'Bu sure Mushaf’ta kaçıncı sıradadır?'
              : 'Hangi sure ayet sayısı bakımından daha uzundur?'}
          </span>
        </div>

        <span className="text-xs font-extrabold tabular-nums text-amber-200 shrink-0">
          {tempo === 'calm' ? `Görev ${roundIdx + 1}/${TOTAL_CALM_ROUNDS}` : `Görev ${roundIdx + 1}`}
        </span>
      </div>

      {/* GÖREV A: MUSHAF KONUM KADRANI (1–114) */}
      {round.kind === 'dial' ? (
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-3 sm:gap-4 max-w-2xl w-full mx-auto">
          {/* Hedef Sure 3B Zümrüt Kartı */}
          <div className="game-bevel-emerald rounded-2xl p-3.5 sm:p-5 text-center space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-white/12 text-amber-200">
                {round.targetSurah.type} · {round.targetSurah.ayahCount} Ayet
              </span>
              {round.targetSurah.mukattaa && (
                <span
                  dir="rtl"
                  className="font-arabic text-sm font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-200"
                >
                  {round.targetSurah.mukattaa.arabic}
                </span>
              )}
            </div>
            <div dir="rtl" className="font-arabic text-2xl sm:text-3xl text-amber-200 leading-tight">
              {round.targetSurah.nameAr}
            </div>
            <div className="text-lg sm:text-2xl font-black text-white tracking-tight">
              {round.targetSurah.nameTr}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-teal-100">
              Anlamı: “{round.targetSurah.meaningTr}”
            </div>
          </div>

          {/* Altın / Parşömen Mushaf Cetveli & Pusula İbresi */}
          <div className="game-bevel-parchment rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-slate-600">1. Fâtiha</span>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  disabled={Boolean(dialRevealed) || dialValue <= 1}
                  onClick={() => {
                    gameAudioService.playFlip();
                    setDialValue((v) => Math.max(1, v - 1));
                  }}
                  aria-label="Bir azalt"
                  className="w-8 h-8 rounded-lg border border-amber-800/25 bg-white/75 inline-flex items-center justify-center text-slate-800 cursor-pointer disabled:opacity-40"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-3 py-1 rounded-xl bg-teal-800 text-amber-200 text-sm sm:text-base font-black tabular-nums min-w-[92px] text-center">
                  {dialRevealed ? `Gerçek: ${dialRevealed.trueNo}.` : `${dialValue}. Sure`}
                </span>
                <button
                  type="button"
                  disabled={Boolean(dialRevealed) || dialValue >= 114}
                  onClick={() => {
                    gameAudioService.playFlip();
                    setDialValue((v) => Math.min(114, v + 1));
                  }}
                  aria-label="Bir artır"
                  className="w-8 h-8 rounded-lg border border-amber-800/25 bg-white/75 inline-flex items-center justify-center text-slate-800 cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[11px] font-extrabold text-slate-600">114. Nâs</span>
            </div>

            {/* Görsel Cetvel Çubuğu + İbre İşaretçileri */}
            <div className="relative pt-5 pb-4 px-1">
              {/* Çeyrek / Cüz Çentikleri */}
              <div className="h-3 rounded-full bg-teal-950/15 border border-amber-900/20 relative overflow-visible">
                {[1, 30, 57, 78, 114].map((mark) => (
                  <div
                    key={mark}
                    style={{ left: toPercent(mark) }}
                    className="absolute top-0 bottom-0 w-px bg-amber-900/35"
                  >
                    <span className="absolute top-4 -translate-x-1/2 text-[9px] font-bold tabular-nums text-slate-500">
                      {mark}
                    </span>
                  </div>
                ))}

                {/* Aktif / Kilitli Oyuncu İbresi */}
                {!dialRevealed ? (
                  <div
                    style={{ left: toPercent(dialValue) }}
                    className="absolute -top-4 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                  >
                    <span className="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[10px] font-black tabular-nums shadow">
                      {isDuel ? (duelDialStep === 'p1' ? 'P1' : 'P2') : dialValue}
                    </span>
                    <div className="w-3 h-3 rotate-45 bg-amber-600 -mt-1.5 border border-white" />
                  </div>
                ) : (
                  <>
                    {/* Oyuncu 1 İğnesi */}
                    <div
                      style={{ left: toPercent(dialRevealed.p1Guess) }}
                      className="absolute -top-4 -translate-x-1/2 flex flex-col items-center z-10"
                    >
                      <span className="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[9px] font-black tabular-nums shadow whitespace-nowrap">
                        {isDuel ? 'P1' : 'Sen'}: {dialRevealed.p1Guess}
                      </span>
                    </div>

                    {/* YZ veya Oyuncu 2 İğnesi */}
                    {dialRevealed.p2Guess !== undefined && (
                      <div
                        style={{ left: toPercent(dialRevealed.p2Guess) }}
                        className="absolute top-4 -translate-x-1/2 flex flex-col items-center z-10"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-200 text-[9px] font-black tabular-nums shadow whitespace-nowrap">
                          {isAi ? 'YZ' : 'P2'}: {dialRevealed.p2Guess}
                        </span>
                      </div>
                    )}

                    {/* Gerçek Konum Altın Zümrüt İğnesi */}
                    <div
                      style={{ left: toPercent(dialRevealed.trueNo) }}
                      className="absolute -top-1 -bottom-1 -translate-x-1/2 w-2.5 rounded-full bg-emerald-600 ring-2 ring-white shadow-md z-20"
                    />
                  </>
                )}
              </div>

              {/* Kaydırma Sürgüsü */}
              {!dialRevealed && (
                <input
                  type="range"
                  min={1}
                  max={114}
                  value={dialValue}
                  onChange={(e) => setDialValue(Number(e.target.value))}
                  aria-label="Sure sıra numarası tahmini (1-114)"
                  className="absolute inset-x-0 top-3 w-full h-8 opacity-0 cursor-pointer z-30"
                />
              )}
            </div>

            {/* Aksiyon veya Sonuç Şeridi */}
            {!dialRevealed ? (
              <button
                type="button"
                onClick={handleLockDial}
                className="w-full min-h-[44px] rounded-xl font-extrabold text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-opacity hover:opacity-95"
                style={{ backgroundColor: '#0F766E', color: '#FFFFFF' }}
              >
                <Lock className="w-4 h-4" />
                <span>
                  {isDuel
                    ? `${duelDialStep === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} Konumu Kilitle (${dialValue}. Sure)`
                    : `Konumu Kilitle (${dialValue}. Sure)`}
                </span>
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                <div className="text-xs sm:text-sm font-extrabold text-teal-900">
                  {dialRevealed.headline}
                </div>
                <button
                  type="button"
                  onClick={advanceToNextRound}
                  className="w-full sm:w-auto min-h-[42px] px-4 rounded-xl font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}
                >
                  <span>Sonraki Görev</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* GÖREV B: AYET SAYISI TARTISI (HANGİSİ DAHA UZUN?) */
        round.scalePair && (
          <div className="flex-1 min-h-0 flex flex-col justify-center gap-3 max-w-2xl w-full mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2.5 sm:gap-3 items-stretch">
              {round.scalePair.map((surah, idx) => {
                const revealed = Boolean(scaleRevealed);
                const isWinner = scaleRevealed?.longerNo === surah.no;
                const isPickedWrong =
                  revealed && scaleRevealed?.pickedNo === surah.no && !scaleRevealed.isCorrect;

                const cardClass = isPickedWrong
                  ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white game-shake'
                  : revealed && isWinner
                    ? 'game-bevel-emerald game-pop'
                    : 'game-bevel-parchment hover:brightness-[1.02]';

                const maxAyahs = Math.max(
                  round.scalePair![0].ayahCount,
                  round.scalePair![1].ayahCount,
                  1,
                );
                const barWidth = `${Math.max(12, Math.round((surah.ayahCount / maxAyahs) * 100))}%`;

                return (
                  <React.Fragment key={surah.no}>
                    <button
                      type="button"
                      disabled={revealed}
                      onClick={() => handlePickScale(surah)}
                      className={`rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between gap-2 text-center cursor-pointer transition-all min-h-[140px] sm:min-h-[210px] ${cardClass}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded ${
                            revealed && isWinner
                              ? 'bg-white/15 text-amber-200'
                              : isPickedWrong
                                ? 'bg-white/15 text-white'
                                : 'bg-amber-900/10 text-slate-600'
                          }`}
                        >
                          #{idx + 1} · {surah.type}
                        </span>
                        {revealed && isWinner && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400 text-amber-950 text-[10px] font-black">
                            <Check className="w-3 h-3" strokeWidth={3} />
                            Daha Uzun
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div
                          dir="rtl"
                          className={`font-arabic text-2xl sm:text-3xl leading-tight ${
                            revealed && (isWinner || isPickedWrong)
                              ? 'text-amber-200'
                              : 'text-teal-900'
                          }`}
                        >
                          {surah.nameAr}
                        </div>
                        <div
                          className={`text-base sm:text-xl font-black ${
                            revealed && (isWinner || isPickedWrong)
                              ? 'text-white'
                              : 'text-slate-900'
                          }`}
                        >
                          {surah.no}. {surah.shortNameTr}
                        </div>
                        <div
                          className={`text-xs font-semibold ${
                            revealed && (isWinner || isPickedWrong)
                              ? 'text-teal-100'
                              : 'text-slate-600'
                          }`}
                        >
                          “{surah.meaningTr}”
                        </div>
                      </div>

                      {revealed ? (
                        <div className="space-y-1 pt-1">
                          <div className="text-lg sm:text-2xl font-black tabular-nums">
                            {surah.ayahCount} Ayet
                          </div>
                          <div className="h-2 rounded-full bg-black/15 overflow-hidden">
                            <div
                              style={{ width: barWidth }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                isWinner ? 'bg-amber-400' : 'bg-slate-400'
                              }`}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-bold text-teal-800 pt-1">
                          Daha uzun olanı seç
                        </div>
                      )}
                    </button>

                    {idx === 0 && (
                      <div className="hidden sm:flex items-center justify-center">
                        <div className="w-11 h-11 rounded-full bg-amber-400/20 border border-amber-300/45 text-amber-200 flex items-center justify-center">
                          <Scale className="w-5 h-5" />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {scaleRevealed && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 rounded-2xl bg-black/20 border border-white/15 px-3.5 py-2.5 text-white">
                <div className="text-xs sm:text-sm font-bold">
                  {scaleRevealed.isCorrect
                    ? 'Doğru! Ayet tartısında uzun sureyi buldunuz (+50p).'
                    : 'Diğer sure ayet sayısı bakımından daha uzundur.'}
                  {isAi && scaleRevealed.aiCorrect !== undefined && (
                    <span className="ml-1.5 text-amber-200">
                      (Yapay Zekâ: {scaleRevealed.aiCorrect ? 'Doğru +50p' : 'Yanıldı'})
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={advanceToNextRound}
                  className="w-full sm:w-auto min-h-[40px] px-4 rounded-xl font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}
                >
                  <span>Sonraki Görev</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
