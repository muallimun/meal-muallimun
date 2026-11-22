import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  Lock,
  Search,
} from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  shuffleArray,
} from './gameTypes';
import { StagePromptBanner, renderArabicHighlightedText } from './StagePromptBanner';
import { useManagedTimeouts } from './useManagedTimeouts';

interface DetectiveClue {
  index: number;
  points: number;
  title: string;
  text: string;
}

interface DetectiveCaseData {
  id: string;
  target: EnrichedGameSurah;
  clues: DetectiveClue[];
  candidates: EnrichedGameSurah[];
}

const TOTAL_CALM_CASES = 5;
const TIMED_LIMIT_SEC = 80;
const CLUE_POINTS = [100, 75, 50, 30] as const;

function buildDetectiveCase(
  caseIndex: number,
  tierSurahs: EnrichedGameSurah[],
  allSurahsMap: Map<number, EnrichedGameSurah>,
  usedNos: Set<number>,
): DetectiveCaseData {
  const fresh = tierSurahs.filter((s) => !usedNos.has(s.no));
  const pool = fresh.length > 0 ? fresh : tierSurahs;
  const target = pool[Math.floor(Math.random() * pool.length)] ?? tierSurahs[0];
  usedNos.add(target.no);

  const prev = allSurahsMap.get(target.no - 1);
  const next = allSurahsMap.get(target.no + 1);

  // 1. İpucu (100p): Dönem, ayet sayısı ve varsa mukattaa
  const clue1 = target.mukattaa
    ? `${target.type}dir, ${target.ayahCount} ayettir ve ${target.mukattaa.readingTr} (${target.mukattaa.arabic}) mukattaası ile başlar.`
    : `${target.type}dir ve toplam ${target.ayahCount} ayetten oluşur.`;

  // 2. İpucu (75p): Mushaf'taki komşu sureler
  const clue2 =
    prev && next
      ? `${prev.shortNameTr} Suresi'nden sonra, ${next.shortNameTr} Suresi'nden önce gelir.`
      : !prev && next
        ? `Mushaf'ın 1. suresidir; ardından ${next.shortNameTr} Suresi gelir.`
        : prev
          ? `${prev.shortNameTr} Suresi'nden sonra gelir; Mushaf'ın son suresidir.`
          : `Mushaf'ta ${target.no}. sıradadır.`;

  // 3. İpucu (50p): Özel grup / nüzul özelliği
  const clue3 = target.families.length > 0
    ? `${target.families[0].title}: ${target.families[0].description}`
    : `Nüzul (iniş) sırasına göre ${target.nuzulOrder}. sırada vahyedilmiştir.`;

  // 4. İpucu (30p): Türkçe anlamı
  const clue4 = `Surenin Türkçe anlamı “${target.meaningTr}” demektir.`;

  const clues: DetectiveClue[] = [
    { index: 0, points: CLUE_POINTS[0], title: 'Dönem & Ayet', text: clue1 },
    { index: 1, points: CLUE_POINTS[1], title: 'Komşu Sureler', text: clue2 },
    { index: 2, points: CLUE_POINTS[2], title: 'Grup & Nüzul', text: clue3 },
    { index: 3, points: CLUE_POINTS[3], title: 'Sure Anlamı', text: clue4 },
  ];

  // 5 çeldirici seç (aynı kademeden + mümkünse benzer ayet sayısına yakın)
  const others = shuffleArray(tierSurahs.filter((s) => s.no !== target.no));
  const distractors = others.slice(0, 5);
  const candidates = shuffleArray([target, ...distractors]);

  return {
    id: `det-${caseIndex}-${target.no}-${Math.random().toString(36).slice(2, 6)}`,
    target,
    clues,
    candidates,
  };
}

export const SurahDetectiveGame: React.FC<GameComponentProps> = ({
  tierId,
  tempo,
  playerMode,
  tierSurahs,
  allSurahsMap,
  onHudUpdate,
  onComplete,
}) => {
  const isDuel = playerMode === 'duel';

  const usedNosRef = useRef<Set<number>>(new Set());
  const [caseIdx, setCaseIdx] = useState<number>(0);
  const [activeCase, setActiveCase] = useState<DetectiveCaseData>(() =>
    buildDetectiveCase(0, tierSurahs, allSurahsMap, usedNosRef.current),
  );
  const [revealedCluesCount, setRevealedCluesCount] = useState<number>(1);
  const [eliminatedNos, setEliminatedNos] = useState<number[]>([]);
  const [wrongNo, setWrongNo] = useState<number | null>(null);
  const [solvedBy, setSolvedBy] = useState<{
    actor: 'p1' | 'p2';
    points: number;
  } | null>(null);

  // Sıra ve Skor
  const [activePlayer, setActivePlayer] = useState<'p1' | 'p2'>('p1');
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
  const wrongTimerRef = useRef<number | null>(null);
  const { scheduleTimeout, cancelTimeout } = useManagedTimeouts();

  const currentRewardPoints =
    CLUE_POINTS[Math.min(CLUE_POINTS.length - 1, Math.max(0, revealedCluesCount - 1))];

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
        gameId: 'detective',
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
        duel: isDuel
          ? {
              p1Score: stats.p1Score,
              p2Score: stats.p2Score,
              p1Correct: stats.p1Correct,
              p2Correct: stats.p2Correct,
              p1Label: '1. Oyuncu',
              p2Label: '2. Oyuncu',
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

  const submitGuess = useCallback(
    (candidate: EnrichedGameSurah, actor: 'p1' | 'p2') => {
      if (solvedBy || finishedRef.current || eliminatedNos.includes(candidate.no)) return;

      setMovesCount((prev) => prev + 1);

      if (candidate.no === activeCase.target.no) {
        if (wrongTimerRef.current !== null) {
          cancelTimeout(wrongTimerRef.current);
          wrongTimerRef.current = null;
        }
        const pts = currentRewardPoints;
        setSolvedBy({ actor, points: pts });
        setRevealedCluesCount(4); // Öğreticilik için kalan tüm ipuçlarını aç

        if (actor === 'p1') {
          const nextCombo = combo + 1;
          setCombo(nextCombo);
          setMaxCombo((prev) => Math.max(prev, nextCombo));
          setP1Score((prev) => prev + pts);
          setP1Correct((prev) => prev + 1);
          gameAudioService.playMatch(nextCombo);
        } else {
          setP2Score((prev) => prev + pts);
          setP2Correct((prev) => prev + 1);
          gameAudioService.playMatch(2);
        }

        setFeaturedSurah(activeCase.target);
        setFeaturedNote(
          isDuel
            ? `${actor === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} gizli sureyi buldu (+${pts}p)!`
            : `Gizli sureyi buldunuz (+${pts}p) · ${activeCase.target.no}. ${activeCase.target.shortNameTr}`,
        );
      } else {
        setWrongNo(candidate.no);
        setEliminatedNos((prev) => [...prev, candidate.no]);
        gameAudioService.playWrong();

        setCombo(0);
        setMistakeCount((prev) => prev + 1);
        mistakenMapRef.current.set(activeCase.target.no, activeCase.target);

        if (wrongTimerRef.current !== null) {
          cancelTimeout(wrongTimerRef.current);
        }
        wrongTimerRef.current = scheduleTimeout(() => {
          wrongTimerRef.current = null;
          setWrongNo(null);
          // Yanlış tahminde kapalı ipucu varsa bir sonrakini otomatik aç
          setRevealedCluesCount((prev) => Math.min(4, prev + 1));
          if (isDuel) {
            gameAudioService.playTurnSwitch();
            setActivePlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
          }
        }, 520);
      }
    },
    [
      activeCase.target,
      cancelTimeout,
      combo,
      currentRewardPoints,
      eliminatedNos,
      isDuel,
      scheduleTimeout,
      solvedBy,
    ],
  );

  // HUD senkronizasyonu
  useEffect(() => {
    const remaining = Math.max(0, TIMED_LIMIT_SEC - elapsedSec);
    const statusMessage = solvedBy
      ? `Gizli sure çözüldü: ${activeCase.target.no}. ${activeCase.target.shortNameTr}`
      : isDuel
        ? `${activePlayer === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} sırada: ipucu aç veya sureyi tahmin et.`
        : `Açık ipuçlarıyla gizli sureyi bul (${currentRewardPoints}p değerinde).`;

    onHudUpdate({
      score: p1Score,
      p1Score,
      p2Score,
      activeTurn: !isDuel ? 'p1' : activePlayer,
      combo,
      movesCount,
      progressLabel:
        tempo === 'calm'
          ? `${Math.min(TOTAL_CALM_CASES, caseIdx + 1)}/${TOTAL_CALM_CASES}`
          : `${caseIdx + 1}. Dosya`,
      elapsedSec,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 12,
      turnRemainingSec: tempo === 'timed' ? remaining : null,
      turnDurationSec: TIMED_LIMIT_SEC,
      statusMessage,
      featuredSurah,
      featuredNote,
      roundContextTitle: `Dosya #${caseIdx + 1} · Dedektif İpucu`,
      roundContextHint:
        'En az ipucuyla gizli sureyi tahmin ederek daha yüksek puan (100p → 30p) kazanın.',
    });
  }, [
    activeCase.target.no,
    activeCase.target.shortNameTr,
    activePlayer,
    caseIdx,
    combo,
    currentRewardPoints,
    elapsedSec,
    featuredNote,
    featuredSurah,
    isDuel,
    movesCount,
    onHudUpdate,
    p1Score,
    p2Score,
    solvedBy,
    tempo,
  ]);

  const handleOpenNextClue = () => {
    if (solvedBy || revealedCluesCount >= 4) return;
    gameAudioService.playFlip();
    setRevealedCluesCount((prev) => Math.min(4, prev + 1));
  };

  const handleNextCase = () => {
    if (wrongTimerRef.current !== null) {
      window.clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = null;
    }
    const nextIdx = caseIdx + 1;
    if (tempo === 'calm' && nextIdx >= TOTAL_CALM_CASES) {
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
    setCaseIdx(nextIdx);
    setActiveCase(buildDetectiveCase(nextIdx, tierSurahs, allSurahsMap, usedNosRef.current));
    setRevealedCluesCount(1);
    setEliminatedNos([]);
    setWrongNo(null);
    setSolvedBy(null);
    setFeaturedSurah(null);
    setFeaturedNote(undefined);
    if (isDuel) {
      setActivePlayer(nextIdx % 2 === 0 ? 'p1' : 'p2');
    }
  };

  return (
    <div className="flex-1 min-h-full lg:min-h-0 flex flex-col justify-center gap-3 sm:gap-4">
      {/* Üst Dosya Başlığı */}
      <StagePromptBanner
        badgeIcon={<Search className="w-3.5 h-3.5" />}
        badgeLabel={`Dosya #${caseIdx + 1}`}
        prompt={
          solvedBy
            ? `${activeCase.target.no}. ${activeCase.target.nameTr} (${activeCase.target.meaningTr})`
            : `Gizli Sureyi Bul · Ödül: ${currentRewardPoints}p`
        }
        progressBadge={
          tempo === 'calm' ? `${caseIdx + 1}/${TOTAL_CALM_CASES}` : `${currentRewardPoints}p`
        }
        actionSlot={
          !solvedBy && revealedCluesCount < 4 ? (
            <button
              type="button"
              onClick={handleOpenNextClue}
              className="h-9 px-3 sm:px-3.5 rounded-full bg-amber-400 text-amber-950 text-xs sm:text-sm font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0 hover:bg-amber-300 transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span>İpucu Aç ({CLUE_POINTS[revealedCluesCount]}p)</span>
            </button>
          ) : undefined
        }
      />

      {/* ÜST BÖLGE: #1..#4 3B İpucu Dosya Kartları (Mobil + Masaüstü 2x2) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {activeCase.clues.map((clue) => {
          const isOpen = clue.index < revealedCluesCount;
          const isNextUnlockable = !solvedBy && clue.index === revealedCluesCount;

          if (!isOpen) {
            return (
              <button
                key={clue.index}
                type="button"
                disabled={!isNextUnlockable}
                onClick={handleOpenNextClue}
                className={`min-h-[96px] sm:min-h-[118px] rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between gap-2 text-left transition-all ${
                  isNextUnlockable
                    ? 'bg-black/25 border-2 border-dashed border-amber-300/65 text-amber-100 cursor-pointer hover:bg-black/35'
                    : 'bg-black/15 border border-white/15 text-white/55 cursor-default'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-white/12 text-xs font-black tabular-nums shrink-0">
                    #{clue.index + 1}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-black tabular-nums px-2 py-0.5 rounded-md bg-white/12 shrink-0">
                    <Lock className="w-3 h-3" />
                    {clue.points}p
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-extrabold leading-snug">
                    {clue.title}
                  </div>
                  <div className="text-[11px] sm:text-xs font-medium opacity-80 mt-0.5">
                    {isNextUnlockable ? 'Açmak için dokun' : 'Kilitli ipucu'}
                  </div>
                </div>
              </button>
            );
          }

          return (
            <div
              key={clue.index}
              className="min-h-[96px] sm:min-h-[118px] game-bevel-emerald rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between gap-1.5 game-pop"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/15 text-amber-200 truncate">
                  #{clue.index + 1} · {clue.title}
                </span>
                <span className="text-xs font-black tabular-nums px-2 py-0.5 rounded-md bg-amber-400 text-amber-950 shrink-0">
                  {clue.points}p
                </span>
              </div>
              <p className="text-[13px] sm:text-base lg:text-[17px] font-medium leading-relaxed text-white">
                {renderArabicHighlightedText(clue.text)}
              </p>
            </div>
          );
        })}
      </div>

      {/* ÇÖZÜM SONRASI SONRAKİ DOSYA ŞERİDİ */}
      {solvedBy && (
        <div className="shrink-0 rounded-2xl bg-black/25 border border-amber-300/45 px-3.5 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-white">
          <div className="text-sm sm:text-base font-bold leading-snug text-center sm:text-left">
            {isDuel
              ? `${solvedBy.actor === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} buldu`
              : 'Doğru tahmin'}{' '}
            (+{solvedBy.points}p) · {activeCase.target.no}. {activeCase.target.nameTr}
          </div>
          <button
            type="button"
            onClick={handleNextCase}
            className="w-full sm:w-auto h-10 px-4 rounded-xl font-extrabold text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}
          >
            <span>Sonraki Dosya</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ALT BÖLGE: 6 Adet 3B Parşömen Aday Sure Kartı (#1..#6) */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
        {activeCase.candidates.map((cand, idx) => {
          const isEliminated = eliminatedNos.includes(cand.no);
          const isWrongNow = wrongNo === cand.no;
          const isSolvedTarget = Boolean(solvedBy && cand.no === activeCase.target.no);

          const cardClass = isWrongNow
            ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white game-shake'
            : isSolvedTarget
              ? 'game-bevel-emerald game-pop'
              : 'game-bevel-parchment hover:brightness-[1.02]';

          return (
            <button
              key={cand.no}
              type="button"
              disabled={Boolean(solvedBy) || isEliminated}
              onClick={() => submitGuess(cand, !isDuel ? 'p1' : activePlayer)}
              style={{ opacity: isEliminated && !isWrongNow ? 0.35 : 1 }}
              className={`min-h-[62px] sm:min-h-[74px] rounded-xl sm:rounded-2xl px-2.5 py-2 flex items-center justify-between gap-2 text-left cursor-pointer transition-all select-none ${cardClass}`}
            >
              <span
                className={`text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded shrink-0 ${
                  isSolvedTarget
                    ? 'bg-amber-400 text-amber-950'
                    : isWrongNow
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-900/12 text-slate-600'
                }`}
              >
                #{idx + 1}
              </span>

              <div className="flex-1 min-w-0 text-center">
                <div
                  dir="rtl"
                  className={`font-arabic text-xl sm:text-2xl lg:text-[26px] leading-snug truncate ${
                    isSolvedTarget || isWrongNow ? 'text-amber-200' : 'text-teal-900'
                  }`}
                >
                  {cand.nameAr}
                </div>
                <div
                  className={`text-sm sm:text-base lg:text-[17px] font-bold truncate ${
                    isSolvedTarget || isWrongNow ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {cand.shortNameTr}
                </div>
              </div>

              {isSolvedTarget && (
                <span className="w-6 h-6 rounded-full bg-emerald-400/25 text-emerald-200 inline-flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
