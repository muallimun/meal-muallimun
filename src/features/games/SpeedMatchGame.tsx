import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Sparkles } from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  shuffleArray,
} from './gameTypes';

interface SpeedFactCard {
  surahNo: number;
  tag: string;
  mainText: string;
  arabicText?: string;
}

interface SpeedWaveData {
  id: string;
  leftSurahs: EnrichedGameSurah[];
  rightFacts: SpeedFactCard[];
}

const TOTAL_CALM_WAVES = 4;
const TIMED_LIMIT_SEC = 60;

/**
 * Bir dalgada yer alan 4–5 sure için çakışmasız (her biri kesinlikle tek bir sureye ait)
 * Künye / Anlam / Mukattaa kartları üretir.
 */
function buildSpeedWave(
  waveIndex: number,
  tierId: GameComponentProps['tierId'],
  tierSurahs: EnrichedGameSurah[],
  pairCount: number,
): SpeedWaveData {
  const picked = shuffleArray(tierSurahs).slice(0, Math.min(pairCount, tierSurahs.length));
  const usedTraitBadges = new Set<string>();

  const facts: SpeedFactCard[] = picked.map((surah, idx) => {
    const others = picked.filter((o) => o.no !== surah.no);

    // Kademe 4'te veya özel grubu olan surelerde öncelikle Ulûmu'l-Kur'ân niteliğini dene
    if (surah.primaryTrait && (tierId === 'kademe_4' || idx % 3 === 0)) {
      const trait = surah.primaryTrait;
      // Başka bir sure bu dalgada aynı özel grup rozetine/mukattaasına sahip değilse benzersizdir!
      const isAmbiguous =
        usedTraitBadges.has(trait.label) ||
        others.some(
          (o) =>
            (trait.arabic && o.mukattaa?.arabic === trait.arabic) ||
            o.primaryTrait?.label === trait.label ||
            o.families.some((f) => f.shortLabel === trait.badge),
        );

      if (!isAmbiguous) {
        usedTraitBadges.add(trait.label);
        return {
          surahNo: surah.no,
          tag: trait.badge,
          mainText: trait.label,
          arabicText: trait.arabic,
        };
      }
    }

    // Anlam veya Künye (Mushaf sırası + ayet sayısı + Mekkî/Medenî) arasında dengeli dağıt
    const preferIdentity = idx % 2 === 1;
    if (preferIdentity) {
      return {
        surahNo: surah.no,
        tag: `${surah.type} · Künye`,
        mainText: `${surah.no}. Sure · ${surah.ayahCount} Ayet`,
        arabicText: surah.mukattaa?.arabic,
      };
    }

    return {
      surahNo: surah.no,
      tag: 'Anlamı',
      mainText: surah.meaningTr,
    };
  });

  // Sağ sütunu karıştır
  let rightFacts = shuffleArray(facts);
  if (
    rightFacts.length > 1 &&
    rightFacts.every((f, idx) => f.surahNo === picked[idx].no)
  ) {
    rightFacts = [rightFacts[1], rightFacts[0], ...rightFacts.slice(2)];
  }

  return {
    id: `w-${waveIndex}-${picked.map((s) => s.no).join('_')}-${Math.random().toString(36).slice(2, 6)}`,
    leftSurahs: picked,
    rightFacts,
  };
}

interface SpeedBoardProps {
  accentColor: string;
  accentSoft: string;
  accentText: string;
  headerLabel?: string;
  headerScore?: number;
  wave: SpeedWaveData;
  waveNumber: number;
  totalWavesLabel: string;
  isFinished?: boolean;
  onMatchCorrect: (surah: EnrichedGameSurah) => void;
  onMatchWrong: (surah: EnrichedGameSurah) => void;
  onWaveCleared: () => void;
}

const SpeedBoard: React.FC<SpeedBoardProps> = ({
  accentColor,
  accentSoft,
  accentText,
  headerLabel,
  headerScore,
  wave,
  waveNumber,
  totalWavesLabel,
  isFinished,
  onMatchCorrect,
  onMatchWrong,
  onWaveCleared,
}) => {
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [matchedNos, setMatchedNos] = useState<number[]>([]);
  const [wrongPair, setWrongPair] = useState<{ left: number; right: number } | null>(null);
  const [justMatchedNo, setJustMatchedNo] = useState<number | null>(null);

  useEffect(() => {
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedNos([]);
    setWrongPair(null);
    setJustMatchedNo(null);
  }, [wave]);

  const surahByNo = useMemo(() => {
    const map = new Map<number, EnrichedGameSurah>();
    for (const s of wave.leftSurahs) map.set(s.no, s);
    return map;
  }, [wave.leftSurahs]);

  const attemptMatch = useCallback(
    (leftNo: number, rightNo: number) => {
      if (leftNo === rightNo) {
        const nextMatched = [...matchedNos, leftNo];
        setMatchedNos(nextMatched);
        setJustMatchedNo(leftNo);
        setSelectedLeft(null);
        setSelectedRight(null);

        const surah = surahByNo.get(leftNo);
        if (surah) onMatchCorrect(surah);

        window.setTimeout(() => setJustMatchedNo(null), 320);

        if (nextMatched.length >= wave.leftSurahs.length) {
          window.setTimeout(() => {
            onWaveCleared();
          }, 340);
        }
      } else {
        setWrongPair({ left: leftNo, right: rightNo });
        const leftSurah = surahByNo.get(leftNo);
        if (leftSurah) onMatchWrong(leftSurah);

        window.setTimeout(() => {
          setWrongPair(null);
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 380);
      }
    },
    [matchedNos, onMatchCorrect, onMatchWrong, onWaveCleared, surahByNo, wave.leftSurahs.length],
  );

  const handleLeftTap = (surahNo: number) => {
    if (isFinished || matchedNos.includes(surahNo) || wrongPair) return;
    gameAudioService.playFlip();
    if (selectedRight !== null) {
      attemptMatch(surahNo, selectedRight);
    } else {
      setSelectedLeft((prev) => (prev === surahNo ? null : surahNo));
    }
  };

  const handleRightTap = (surahNo: number) => {
    if (isFinished || matchedNos.includes(surahNo) || wrongPair) return;
    gameAudioService.playFlip();
    if (selectedLeft !== null) {
      attemptMatch(selectedLeft, surahNo);
    } else {
      setSelectedRight((prev) => (prev === surahNo ? null : surahNo));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      {/* Oyuncu / Dalga Başlığı */}
      <div className="shrink-0 space-y-1">
        {headerLabel && (
          <div
            className="rounded-xl border px-3 py-1.5 flex items-center justify-between"
            style={{
              backgroundColor: accentSoft,
              borderColor: accentColor,
            }}
          >
            <span className="text-xs sm:text-sm font-extrabold" style={{ color: accentText }}>
              {headerLabel}
            </span>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {totalWavesLabel}
              </span>
              <span className="text-base font-black tabular-nums" style={{ color: accentText }}>
                {headerScore ?? 0}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] sm:text-xs px-0.5" style={{ color: 'var(--text-muted)' }}>
          <span>Sol sütundaki sureyi sağdaki doğru künyeyle eşleştirin.</span>
          <span className="inline-flex items-center gap-1 font-bold tabular-nums shrink-0" style={{ color: accentText }}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              Dalga {waveNumber}
              {totalWavesLabel && !headerLabel ? `/${totalWavesLabel}` : ''}
            </span>
          </span>
        </div>
      </div>

      {/* Eşleştirme Matrisi */}
      {isFinished ? (
        <div
          className="flex-1 min-h-0 rounded-2xl border flex flex-col items-center justify-center gap-2 p-4 text-center"
          style={{
            backgroundColor: accentSoft,
            borderColor: accentColor,
          }}
        >
          <CheckCircle2 className="w-8 h-8" style={{ color: accentText }} />
          <p className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
            Tüm Dalgalar Tamamlandı
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Diğer oyuncunun tamamlaması bekleniyor...
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 sm:gap-3">
          {/* Sol Sütun: Sureler */}
          <div className="min-h-0 flex flex-col gap-2">
            {wave.leftSurahs.map((surah) => {
              const isMatched = matchedNos.includes(surah.no);
              const isSelected = selectedLeft === surah.no;
              const isWrong = wrongPair?.left === surah.no;
              const isPop = justMatchedNo === surah.no;

              return (
                <button
                  key={`L-${surah.no}`}
                  type="button"
                  disabled={isMatched}
                  onClick={() => handleLeftTap(surah.no)}
                  className={`flex-1 min-h-[54px] rounded-xl sm:rounded-2xl border-2 px-2.5 sm:px-3.5 py-2 flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none ${
                    isWrong ? 'game-shake' : isPop ? 'game-pop' : ''
                  }`}
                  style={{
                    backgroundColor: isMatched
                      ? 'var(--brand-primary-soft)'
                      : isSelected
                        ? accentSoft
                        : 'var(--bg-surface)',
                    borderColor: isWrong
                      ? '#DC2626'
                      : isMatched
                        ? '#0D9488'
                        : isSelected
                          ? accentColor
                          : 'var(--border-strong)',
                    opacity: isMatched ? 0.42 : 1,
                    boxShadow: isSelected
                      ? `0 0 0 2px ${accentColor}`
                      : '0 2px 8px -3px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {isMatched && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: '#0D9488' }} />}
                    <span
                      dir="rtl"
                      className="font-arabic text-lg sm:text-2xl leading-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {surah.nameAr}
                    </span>
                  </div>
                  <span
                    className="text-xs sm:text-sm font-extrabold leading-tight line-clamp-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {surah.shortNameTr}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sağ Sütun: Künye & Anlam Kartları */}
          <div className="min-h-0 flex flex-col gap-2">
            {wave.rightFacts.map((fact) => {
              const isMatched = matchedNos.includes(fact.surahNo);
              const isSelected = selectedRight === fact.surahNo;
              const isWrong = wrongPair?.right === fact.surahNo;
              const isPop = justMatchedNo === fact.surahNo;

              return (
                <button
                  key={`R-${fact.surahNo}`}
                  type="button"
                  disabled={isMatched}
                  onClick={() => handleRightTap(fact.surahNo)}
                  className={`flex-1 min-h-[54px] rounded-xl sm:rounded-2xl border-2 px-2.5 sm:px-3.5 py-2 flex flex-col items-center justify-center text-center gap-0.5 cursor-pointer transition-all select-none ${
                    isWrong ? 'game-shake' : isPop ? 'game-pop' : ''
                  }`}
                  style={{
                    backgroundColor: isMatched
                      ? 'var(--brand-primary-soft)'
                      : isSelected
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface)',
                    borderColor: isWrong
                      ? '#DC2626'
                      : isMatched
                        ? '#0D9488'
                        : isSelected
                          ? '#D97706'
                          : 'var(--border-strong)',
                    opacity: isMatched ? 0.42 : 1,
                    boxShadow: isSelected
                      ? '0 0 0 2px #D97706'
                      : '0 2px 8px -3px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      {fact.tag}
                    </span>
                    {fact.arabicText && (
                      <span
                        dir="rtl"
                        className="font-arabic text-sm sm:text-base font-bold leading-none"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {fact.arabicText}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[11px] sm:text-xs font-bold leading-snug line-clamp-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {fact.mainText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const SpeedMatchGame: React.FC<GameComponentProps> = ({
  tierId,
  tempo,
  playerMode,
  tierSurahs,
  onHudUpdate,
  onComplete,
}) => {
  const isDuel = playerMode === 'duel';
  const isDesktopSingle =
    !isDuel && typeof window !== 'undefined' && window.innerWidth >= 768;
  const pairCount = isDesktopSingle ? 5 : 4;

  // Tek oyuncu durumu
  const [waveIdx, setWaveIdx] = useState<number>(0);
  const [singleWave, setSingleWave] = useState<SpeedWaveData>(() =>
    buildSpeedWave(0, tierId, tierSurahs, pairCount),
  );
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // İkili Düello durumu
  const [p1WaveIdx, setP1WaveIdx] = useState<number>(0);
  const [p2WaveIdx, setP2WaveIdx] = useState<number>(0);
  const [p1Wave, setP1Wave] = useState<SpeedWaveData>(() =>
    buildSpeedWave(0, tierId, tierSurahs, 4),
  );
  const [p2Wave, setP2Wave] = useState<SpeedWaveData>(() =>
    buildSpeedWave(0, tierId, tierSurahs, 4),
  );
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);
  const [p1Correct, setP1Correct] = useState<number>(0);
  const [p2Correct, setP2Correct] = useState<number>(0);
  const [p1Done, setP1Done] = useState<boolean>(false);
  const [p2Done, setP2Done] = useState<boolean>(false);

  const mistakenMapRef = useRef<Map<number, EnrichedGameSurah>>(new Map());
  const finishedRef = useRef<boolean>(false);

  const finishGame = useCallback(
    (payload: {
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

      const totalAttempts = Math.max(1, payload.correctCount + payload.mistakeCount);
      const accuracyPct = Math.round((payload.correctCount / totalAttempts) * 100);
      const stars = calculateGameStars(accuracyPct, payload.score);
      const earnedXp = calculateGameXp(payload.score, stars, payload.maxCombo);

      onComplete({
        gameId: 'speed',
        tierId,
        tempo,
        playerMode,
        score: payload.score,
        stars,
        maxCombo: payload.maxCombo,
        correctCount: payload.correctCount,
        mistakeCount: payload.mistakeCount,
        accuracyPct,
        durationSec: payload.elapsedSec,
        earnedXp,
        mistakenSurahs: Array.from(mistakenMapRef.current.values()),
        duel: isDuel
          ? {
              p1Score: payload.p1Score,
              p2Score: payload.p2Score,
              p1Correct: payload.p1Correct,
              p2Correct: payload.p2Correct,
              winner:
                payload.p1Score > payload.p2Score
                  ? 'p1'
                  : payload.p2Score > payload.p1Score
                    ? 'p2'
                    : 'draw',
            }
          : undefined,
      });
    },
    [isDuel, onComplete, playerMode, tempo, tierId],
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
        score: isDuel ? p1Score + p2Score : score,
        maxCombo,
        correctCount: isDuel ? p1Correct + p2Correct : correctCount,
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
    maxCombo,
    mistakeCount,
    p1Correct,
    p1Score,
    p2Correct,
    p2Score,
    score,
    tempo,
  ]);

  // HUD senkronizasyonu
  useEffect(() => {
    const remaining = Math.max(0, TIMED_LIMIT_SEC - elapsedSec);
    onHudUpdate({
      score: isDuel ? p1Score + p2Score : score,
      combo,
      progressLabel:
        tempo === 'calm'
          ? isDuel
            ? `Dalga ${Math.min(TOTAL_CALM_WAVES, Math.max(p1WaveIdx, p2WaveIdx) + 1)}/${TOTAL_CALM_WAVES}`
            : `Dalga ${Math.min(TOTAL_CALM_WAVES, waveIdx + 1)}/${TOTAL_CALM_WAVES}`
          : `${isDuel ? p1Correct + p2Correct : correctCount} Eşleşme`,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 10,
    });
  }, [
    combo,
    correctCount,
    elapsedSec,
    isDuel,
    onHudUpdate,
    p1Correct,
    p1Score,
    p1WaveIdx,
    p2Correct,
    p2Score,
    p2WaveIdx,
    score,
    tempo,
    waveIdx,
  ]);

  const handleSingleCorrect = useCallback(() => {
    const nextCombo = combo + 1;
    const nextMaxCombo = Math.max(maxCombo, nextCombo);
    const pts = 10 + Math.min(10, (nextCombo - 1) * 2);
    gameAudioService.playMatch(nextCombo);
    setCombo(nextCombo);
    setMaxCombo(nextMaxCombo);
    setScore((prev) => prev + pts);
    setCorrectCount((prev) => prev + 1);
  }, [combo, maxCombo]);

  const handleWrong = useCallback((surah: EnrichedGameSurah) => {
    mistakenMapRef.current.set(surah.no, surah);
    gameAudioService.playWrong();
    setCombo(0);
    setMistakeCount((prev) => prev + 1);
  }, []);

  const handleSingleWaveCleared = useCallback(() => {
    const nextWaveIdx = waveIdx + 1;
    const waveBonus = 15;
    const nextScore = score + waveBonus;
    setScore(nextScore);

    if (tempo === 'calm' && nextWaveIdx >= TOTAL_CALM_WAVES) {
      finishGame({
        score: nextScore,
        maxCombo,
        correctCount,
        mistakeCount,
        elapsedSec,
        p1Score: 0,
        p2Score: 0,
        p1Correct: 0,
        p2Correct: 0,
      });
      return;
    }

    setWaveIdx(nextWaveIdx);
    setSingleWave(buildSpeedWave(nextWaveIdx, tierId, tierSurahs, pairCount));
  }, [
    correctCount,
    elapsedSec,
    finishGame,
    maxCombo,
    mistakeCount,
    pairCount,
    score,
    tempo,
    tierId,
    tierSurahs,
    waveIdx,
  ]);

  const handleDuelCorrect = useCallback((player: 'p1' | 'p2') => {
    gameAudioService.playMatch(2);
    if (player === 'p1') {
      setP1Score((prev) => prev + 10);
      setP1Correct((prev) => prev + 1);
    } else {
      setP2Score((prev) => prev + 10);
      setP2Correct((prev) => prev + 1);
    }
  }, []);

  const handleDuelWaveCleared = useCallback(
    (player: 'p1' | 'p2') => {
      if (player === 'p1') {
        const nextIdx = p1WaveIdx + 1;
        const firstClearBonus = nextIdx > p2WaveIdx ? 15 : 5;
        const nextP1Score = p1Score + firstClearBonus;
        setP1Score(nextP1Score);

        if (tempo === 'calm' && nextIdx >= TOTAL_CALM_WAVES) {
          setP1Done(true);
          if (p2Done) {
            finishGame({
              score: nextP1Score + p2Score,
              maxCombo: Math.max(maxCombo, 2),
              correctCount: p1Correct + p2Correct,
              mistakeCount,
              elapsedSec,
              p1Score: nextP1Score,
              p2Score,
              p1Correct,
              p2Correct,
            });
          }
          return;
        }
        setP1WaveIdx(nextIdx);
        setP1Wave(buildSpeedWave(nextIdx, tierId, tierSurahs, 4));
      } else {
        const nextIdx = p2WaveIdx + 1;
        const firstClearBonus = nextIdx > p1WaveIdx ? 15 : 5;
        const nextP2Score = p2Score + firstClearBonus;
        setP2Score(nextP2Score);

        if (tempo === 'calm' && nextIdx >= TOTAL_CALM_WAVES) {
          setP2Done(true);
          if (p1Done) {
            finishGame({
              score: p1Score + nextP2Score,
              maxCombo: Math.max(maxCombo, 2),
              correctCount: p1Correct + p2Correct,
              mistakeCount,
              elapsedSec,
              p1Score,
              p2Score: nextP2Score,
              p1Correct,
              p2Correct,
            });
          }
          return;
        }
        setP2WaveIdx(nextIdx);
        setP2Wave(buildSpeedWave(nextIdx, tierId, tierSurahs, 4));
      }
    },
    [
      elapsedSec,
      finishGame,
      maxCombo,
      mistakeCount,
      p1Correct,
      p1Done,
      p1Score,
      p1WaveIdx,
      p2Correct,
      p2Done,
      p2Score,
      p2WaveIdx,
      tempo,
      tierId,
      tierSurahs,
    ],
  );

  if (isDuel) {
    return (
      <div className="flex-1 min-h-0 w-full max-w-[1440px] mx-auto px-3 py-2.5 grid grid-cols-2 gap-3 overflow-hidden">
        <div
          className="min-h-0 flex flex-col rounded-2xl border p-3 overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'rgba(13, 148, 136, 0.35)',
          }}
        >
          <SpeedBoard
            accentColor="#0D9488"
            accentSoft="var(--brand-primary-soft)"
            accentText="var(--brand-primary-text)"
            headerLabel="1. Oyuncu · Zümrüt"
            headerScore={p1Score}
            wave={p1Wave}
            waveNumber={p1WaveIdx + 1}
            totalWavesLabel={
              tempo === 'calm'
                ? `${Math.min(TOTAL_CALM_WAVES, p1WaveIdx + 1)}/${TOTAL_CALM_WAVES}`
                : `${p1Correct} Eşleşme`
            }
            isFinished={p1Done}
            onMatchCorrect={() => handleDuelCorrect('p1')}
            onMatchWrong={handleWrong}
            onWaveCleared={() => handleDuelWaveCleared('p1')}
          />
        </div>

        <div
          className="min-h-0 flex flex-col rounded-2xl border p-3 overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'rgba(217, 119, 6, 0.38)',
          }}
        >
          <SpeedBoard
            accentColor="#D97706"
            accentSoft="var(--brand-accent-soft)"
            accentText="var(--brand-accent-text)"
            headerLabel="2. Oyuncu · Kehribar"
            headerScore={p2Score}
            wave={p2Wave}
            waveNumber={p2WaveIdx + 1}
            totalWavesLabel={
              tempo === 'calm'
                ? `${Math.min(TOTAL_CALM_WAVES, p2WaveIdx + 1)}/${TOTAL_CALM_WAVES}`
                : `${p2Correct} Eşleşme`
            }
            isFinished={p2Done}
            onMatchCorrect={() => handleDuelCorrect('p2')}
            onMatchWrong={handleWrong}
            onWaveCleared={() => handleDuelWaveCleared('p2')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full max-w-3xl mx-auto px-2.5 sm:px-5 py-2.5 sm:py-4 flex flex-col overflow-hidden">
      <SpeedBoard
        accentColor="var(--brand-primary)"
        accentSoft="var(--brand-primary-soft)"
        accentText="var(--brand-primary-text)"
        wave={singleWave}
        waveNumber={waveIdx + 1}
        totalWavesLabel={tempo === 'calm' ? String(TOTAL_CALM_WAVES) : ''}
        onMatchCorrect={handleSingleCorrect}
        onMatchWrong={handleWrong}
        onWaveCleared={handleSingleWaveCleared}
      />
    </div>
  );
};
