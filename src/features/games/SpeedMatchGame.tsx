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
import { StagePromptBanner } from './StagePromptBanner';
import { useManagedTimeouts } from './useManagedTimeouts';

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

    if (surah.primaryTrait && (tierId === 'kademe_4' || idx % 3 === 0)) {
      const trait = surah.primaryTrait;
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

    if (idx % 2 === 1) {
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
  headerLabel?: string;
  headerScore?: number;
  headerAccent?: 'amber' | 'teal';
  ownerTag?: string;
  wave: SpeedWaveData;
  waveNumber: number;
  totalWavesLabel: string;
  isFinished?: boolean;
  onMatchCorrect: (surah: EnrichedGameSurah) => void;
  onMatchWrong: (surah: EnrichedGameSurah) => void;
  onWaveCleared: () => void;
}

const SpeedBoard: React.FC<SpeedBoardProps> = ({
  headerLabel,
  headerScore,
  headerAccent = 'amber',
  ownerTag,
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
  const { scheduleTimeout, clearAllTimeouts } = useManagedTimeouts();

  useEffect(() => {
    clearAllTimeouts();
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedNos([]);
    setWrongPair(null);
    setJustMatchedNo(null);
  }, [clearAllTimeouts, wave]);

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

        scheduleTimeout(() => setJustMatchedNo(null), 320);

        if (nextMatched.length >= wave.leftSurahs.length) {
          scheduleTimeout(() => {
            onWaveCleared();
          }, 340);
        }
      } else {
        setWrongPair({ left: leftNo, right: rightNo });
        const leftSurah = surahByNo.get(leftNo);
        if (leftSurah) onMatchWrong(leftSurah);

        scheduleTimeout(() => {
          setWrongPair(null);
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 380);
      }
    },
    [matchedNos, onMatchCorrect, onMatchWrong, onWaveCleared, scheduleTimeout, surahByNo, wave.leftSurahs.length],
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
    <div className="flex-1 min-h-full lg:min-h-0 flex flex-col justify-center gap-3 sm:gap-4">
      <div className="shrink-0 space-y-2">
        {headerLabel && (
          <div
            className={`rounded-xl px-3 py-1.5 flex items-center justify-between border ${
              headerAccent === 'amber'
                ? 'bg-amber-400/20 border-amber-300/45 text-amber-100'
                : 'bg-teal-950/40 border-teal-300/35 text-teal-100'
            }`}
          >
            <span className="text-xs sm:text-sm font-extrabold">{headerLabel}</span>
            <div className="flex items-center gap-2.5 tabular-nums">
              <span className="text-xs opacity-80">{totalWavesLabel}</span>
              <span className="text-base font-black">{headerScore ?? 0}p</span>
            </div>
          </div>
        )}

        <StagePromptBanner
          compact={Boolean(headerLabel)}
          badgeIcon={<Sparkles className="w-3.5 h-3.5" />}
          badgeLabel="Künye Eşleştir"
          prompt="Sol sütundan sureyi, sağ sütundan doğru anlam veya künyesini seçin"
          progressBadge={`Dalga ${waveNumber}${totalWavesLabel && !headerLabel ? `/${totalWavesLabel}` : ''}`}
        />
      </div>

      {isFinished ? (
        <div className="rounded-2xl border border-emerald-300/35 bg-emerald-950/35 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
          <CheckCircle2 className="w-9 h-9 text-amber-300" />
          <p className="text-lg font-extrabold">Tüm Dalgalar Tamamlandı</p>
          <p className="text-sm text-white/80">Diğer oyuncunun tamamlaması bekleniyor...</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 sm:gap-3.5">
          {/* Sol Sütun: 3B Parşömen / Zümrüt Sure Kartları */}
          <div className="min-h-0 flex flex-col gap-2 sm:gap-2.5">
            {wave.leftSurahs.map((surah, idx) => {
              const isMatched = matchedNos.includes(surah.no);
              const isSelected = selectedLeft === surah.no;
              const isWrong = wrongPair?.left === surah.no;
              const isPop = justMatchedNo === surah.no;

              const cardStyle = isWrong
                ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white game-shake'
                : isMatched
                  ? 'game-bevel-emerald opacity-80'
                  : isSelected
                    ? 'game-bevel-amber ring-2 ring-amber-300'
                    : 'game-bevel-parchment';

              return (
                <button
                  key={`L-${surah.no}`}
                  type="button"
                  disabled={isMatched}
                  onClick={() => handleLeftTap(surah.no)}
                  className={`flex-1 min-h-[64px] sm:min-h-[76px] rounded-xl sm:rounded-2xl px-2.5 sm:px-3.5 py-2 flex flex-col justify-between cursor-pointer transition-all select-none ${cardStyle} ${
                    isPop ? 'game-pop' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span
                      className={`text-[10px] sm:text-xs font-black tabular-nums px-1.5 py-0.5 rounded ${
                        isMatched
                          ? 'bg-white/15 text-amber-200'
                          : 'bg-amber-900/10 text-slate-600'
                      }`}
                    >
                      #{idx + 1} · SURE
                    </span>
                    {isMatched && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded ${
                          ownerTag === 'P2'
                            ? 'bg-amber-400 text-amber-950'
                            : ownerTag === 'P1'
                              ? 'bg-teal-200 text-teal-950'
                              : 'bg-emerald-400/25 text-emerald-200'
                        }`}
                      >
                        <Check className="w-3 h-3" strokeWidth={3} />
                        {ownerTag ? <span>{ownerTag}</span> : null}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center text-center py-0.5">
                    <span
                      dir="rtl"
                      lang="ar"
                      className={`font-arabic text-xl sm:text-2xl lg:text-[26px] leading-tight ${
                        isMatched || isWrong ? 'text-amber-200' : 'text-teal-900'
                      }`}
                    >
                      {surah.nameAr}
                    </span>
                    <span
                      className={`text-sm sm:text-base lg:text-[17px] font-bold leading-tight line-clamp-1 ${
                        isMatched || isWrong ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {surah.shortNameTr}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sağ Sütun: 3B Parşömen / Zümrüt Künye & Mukattaa Kartları */}
          <div className="min-h-0 flex flex-col gap-2 sm:gap-2.5">
            {wave.rightFacts.map((fact) => {
              const isMatched = matchedNos.includes(fact.surahNo);
              const isSelected = selectedRight === fact.surahNo;
              const isWrong = wrongPair?.right === fact.surahNo;
              const isPop = justMatchedNo === fact.surahNo;

              const cardStyle = isWrong
                ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white game-shake'
                : isMatched
                  ? 'game-bevel-emerald opacity-80'
                  : isSelected
                    ? 'game-bevel-amber ring-2 ring-amber-300'
                    : 'game-bevel-parchment';

              return (
                <button
                  key={`R-${fact.surahNo}`}
                  type="button"
                  disabled={isMatched}
                  onClick={() => handleRightTap(fact.surahNo)}
                  className={`flex-1 min-h-[64px] sm:min-h-[76px] rounded-xl sm:rounded-2xl px-2.5 sm:px-3.5 py-2 flex flex-col justify-between cursor-pointer transition-all select-none ${cardStyle} ${
                    isPop ? 'game-pop' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span
                      className={`text-[10px] sm:text-xs font-extrabold uppercase px-1.5 py-0.5 rounded truncate ${
                        isMatched
                          ? 'bg-white/15 text-amber-200'
                          : 'bg-teal-800/12 text-teal-900'
                      }`}
                    >
                      {fact.tag}
                    </span>
                    {fact.arabicText && (
                      <span
                        dir="rtl"
                        lang="ar"
                        className={`font-arabic text-base sm:text-xl font-bold leading-none shrink-0 ${
                          isMatched || isWrong ? 'text-amber-300' : 'text-amber-800'
                        }`}
                      >
                        {fact.arabicText}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 flex items-center justify-center text-center py-0.5">
                    <span
                      className={`text-[13px] sm:text-base lg:text-[16px] font-bold leading-snug line-clamp-2 ${
                        isMatched || isWrong ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {fact.mainText}
                    </span>
                  </div>
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
  playerNames,
  tierSurahs,
  onHudUpdate,
  onComplete,
}) => {
  const isDuel = playerMode === 'duel';
  const p1Name = playerNames?.p1?.trim() || '1. Oyuncu';
  const p2Name = playerNames?.p2?.trim() || '2. Oyuncu';
  const [isMdViewport, setIsMdViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );

  useEffect(() => {
    const onResize = () => setIsMdViewport(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isDesktopSingle = !isDuel && isMdViewport;
  const pairCount = isDesktopSingle ? 5 : 4;

  const [waveIdx, setWaveIdx] = useState<number>(0);
  const [singleWave, setSingleWave] = useState<SpeedWaveData>(() =>
    buildSpeedWave(0, tierId, tierSurahs, pairCount),
  );
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // 2 Oyuncu durumu
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

  // Canlı Bilgi Notu
  const [featuredSurah, setFeaturedSurah] = useState<EnrichedGameSurah | null>(null);
  const [featuredNote, setFeaturedNote] = useState<string | undefined>(undefined);

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
              p1Label: '1. Oyuncu',
              p2Label: '2. Oyuncu',
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
        p1Score: isDuel ? p1Score : score,
        p2Score: isDuel ? p2Score : 0,
        p1Correct: isDuel ? p1Correct : correctCount,
        p2Correct: isDuel ? p2Correct : 0,
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
      score: isDuel ? p1Score : score,
      p1Score: isDuel ? p1Score : score,
      p2Score: isDuel ? p2Score : 0,
      activeTurn: isDuel ? 'both' : 'p1',
      combo,
      movesCount,
      progressLabel:
        tempo === 'calm'
          ? isDuel
            ? `${Math.min(TOTAL_CALM_WAVES, Math.max(p1WaveIdx, p2WaveIdx) + 1)}/${TOTAL_CALM_WAVES}`
            : `${Math.min(TOTAL_CALM_WAVES, waveIdx + 1)}/${TOTAL_CALM_WAVES}`
          : `${isDuel ? p1Correct + p2Correct : correctCount} Eşleşme`,
      elapsedSec,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 10,
      turnRemainingSec: tempo === 'timed' ? remaining : null,
      turnDurationSec: TIMED_LIMIT_SEC,
      statusMessage: isDuel
        ? 'İki oyuncu aynı anda künye dalgalarını temizliyor!'
        : 'Sol sütundan sureyi, sağ sütundan doğru künyesini seç.',
      featuredSurah,
      featuredNote,
      roundContextTitle: `Künye Eşleştir · Dalga ${waveIdx + 1}`,
      roundContextHint:
        'Soldaki sure adlarını sağdaki Türkçe anlamı, ayet sayısı veya Mukattaa künyesiyle seri biçimde eşleştirin.',
    });
  }, [
    combo,
    correctCount,
    elapsedSec,
    featuredNote,
    featuredSurah,
    isDuel,
    movesCount,
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

  const handleSingleCorrect = useCallback(
    (surah: EnrichedGameSurah) => {
      const nextCombo = combo + 1;
      const nextMaxCombo = Math.max(maxCombo, nextCombo);
      const pts = 10 + Math.min(10, (nextCombo - 1) * 2);
      gameAudioService.playMatch(nextCombo);
      setCombo(nextCombo);
      setMaxCombo(nextMaxCombo);
      setScore((prev) => prev + pts);
      setCorrectCount((prev) => prev + 1);
      setMovesCount((prev) => prev + 1);
      setFeaturedSurah(surah);
      setFeaturedNote(`Doğru eşleşme (+${pts}p) · ${surah.no}. ${surah.shortNameTr}`);
    },
    [combo, maxCombo],
  );

  const handleWrong = useCallback((surah: EnrichedGameSurah) => {
    mistakenMapRef.current.set(surah.no, surah);
    gameAudioService.playWrong();
    setCombo(0);
    setMistakeCount((prev) => prev + 1);
    setMovesCount((prev) => prev + 1);
  }, []);

  const handleSingleWaveCleared = useCallback(() => {
    const nextWaveIdx = waveIdx + 1;
    const nextScore = score + 15;
    setScore(nextScore);

    if (tempo === 'calm' && nextWaveIdx >= TOTAL_CALM_WAVES) {
      finishGame({
        score: nextScore,
        maxCombo,
        correctCount,
        mistakeCount,
        elapsedSec,
        p1Score: nextScore,
        p2Score: 0,
        p1Correct: correctCount,
        p2Correct: 0,
      });
      return;
    }

    setWaveIdx(nextWaveIdx);
    setSingleWave(buildSpeedWave(nextWaveIdx, tierId, tierSurahs, pairCount));
    setFeaturedSurah(null);
    setFeaturedNote(undefined);
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

  const handleDuelCorrect = useCallback(
    (player: 'p1' | 'p2', surah: EnrichedGameSurah) => {
      gameAudioService.playMatch(2);
      setMovesCount((prev) => prev + 1);
      setFeaturedSurah(surah);
      setFeaturedNote(`${player === 'p1' ? p1Name : p2Name} eşleştirdi (+10p)`);
      if (player === 'p1') {
        setP1Score((prev) => prev + 10);
        setP1Correct((prev) => prev + 1);
      } else {
        setP2Score((prev) => prev + 10);
        setP2Correct((prev) => prev + 1);
      }
    },
    [p1Name, p2Name],
  );

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
              score: nextP1Score,
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
              score: p1Score,
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
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto md:overflow-hidden">
        <div className="min-h-0 flex flex-col rounded-2xl border border-teal-200/35 bg-black/15 p-2.5 overflow-hidden">
          <SpeedBoard
            headerLabel={p1Name}
            headerScore={p1Score}
            headerAccent="teal"
            ownerTag="P1"
            wave={p1Wave}
            waveNumber={p1WaveIdx + 1}
            totalWavesLabel={
              tempo === 'calm'
                ? `${Math.min(TOTAL_CALM_WAVES, p1WaveIdx + 1)}/${TOTAL_CALM_WAVES}`
                : `${p1Correct} Eşleşme`
            }
            isFinished={p1Done}
            onMatchCorrect={(s) => handleDuelCorrect('p1', s)}
            onMatchWrong={handleWrong}
            onWaveCleared={() => handleDuelWaveCleared('p1')}
          />
        </div>

        <div className="min-h-0 flex flex-col rounded-2xl border border-amber-300/35 bg-black/15 p-2.5 overflow-hidden">
          <SpeedBoard
            headerLabel={p2Name}
            headerScore={p2Score}
            headerAccent="amber"
            ownerTag="P2"
            wave={p2Wave}
            waveNumber={p2WaveIdx + 1}
            totalWavesLabel={
              tempo === 'calm'
                ? `${Math.min(TOTAL_CALM_WAVES, p2WaveIdx + 1)}/${TOTAL_CALM_WAVES}`
                : `${p2Correct} Eşleşme`
            }
            isFinished={p2Done}
            onMatchCorrect={(s) => handleDuelCorrect('p2', s)}
            onMatchWrong={handleWrong}
            onWaveCleared={() => handleDuelWaveCleared('p2')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-full lg:min-h-0 flex flex-col">
      <SpeedBoard
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
