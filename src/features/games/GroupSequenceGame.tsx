import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  GripVertical,
  ListOrdered,
} from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  shuffleArray,
} from './gameTypes';
import type { SurahGroupCatalogItem, SurahGroupId } from './surahSpecialGroups';
import {
  SURAH_GROUP_ATLAS,
  SURAH_GROUP_BY_ID,
  explainWhyNotInGroup,
} from './surahSpecialGroups';
import { RoundReviewBanner } from './RoundReviewBanner';
import { StagePromptBanner, renderArabicHighlightedText } from './StagePromptBanner';
import { useManagedTimeouts } from './useManagedTimeouts';

interface SequenceRoundData {
  id: string;
  group: SurahGroupCatalogItem;
  isSubset: boolean;
  hasDistractors: boolean;
  /** Mushaf sırasına göre doğru dizilim */
  orderedTargets: EnrichedGameSurah[];
  /** Masadaki karışık aday kartlar (üyeler + karma turda 2 çeldirici) */
  candidates: EnrichedGameSurah[];
  distractorNos: number[];
}

const TOTAL_CALM_ROUNDS = 4;
const TIMED_LIMIT_SEC = 80;

// Grup Dizilimi için en pedagojik öncelikli gruplar
const PRIORITY_SEQUENCE_GROUPS: readonly SurahGroupId[] = [
  'hawamim',
  'hamidat',
  'musabbihat',
  'tawasin',
  'qul',
  'alr',
  'alm',
  'prophets',
  'animals',
  'single_muqattaat',
  'idha',
  'nida',
  'qasam_waw',
  'sajdah',
  'tabaraka',
];

function generateSequenceRound(
  roundIndex: number,
  focusGroupId: SurahGroupId | null | undefined,
  allSurahsMap: Map<number, EnrichedGameSurah>,
  usedGroupIds: Set<SurahGroupId>,
): SequenceRoundData {
  let group: SurahGroupCatalogItem;

  if (focusGroupId && roundIndex === 0) {
    group = SURAH_GROUP_BY_ID[focusGroupId] ?? SURAH_GROUP_BY_ID.hawamim;
  } else {
    const orderedCatalog = PRIORITY_SEQUENCE_GROUPS.map((id) => SURAH_GROUP_BY_ID[id]).filter(
      Boolean,
    );
    const fresh = orderedCatalog.filter((g) => !usedGroupIds.has(g.id));
    const pool = fresh.length > 0 ? fresh : SURAH_GROUP_ATLAS;
    group = pool[Math.floor(Math.random() * pool.length)] ?? SURAH_GROUP_BY_ID.hawamim;
  }
  usedGroupIds.add(group.id);

  const fullMembers = group.surahs
    .map((no) => allSurahsMap.get(no))
    .filter((s): s is EnrichedGameSurah => Boolean(s))
    .sort((a, b) => a.no - b.no);

  // 10-15 üyeli büyük gruplarda (Nidâ, Kasem, Secde) 5 surelik kesit seç
  const isSubset = fullMembers.length > 7;
  const orderedTargets = isSubset
    ? shuffleArray(fullMembers)
        .slice(0, 5)
        .sort((a, b) => a.no - b.no)
    : fullMembers;

  // Çift turlarda (2. ve 4. tur) ve 5 veya daha az hedef varken 2 çeldirici ekleyerek "Kadroyu Ayıkla + Diz" yaptır
  const hasDistractors = roundIndex % 2 === 1 && orderedTargets.length <= 5;
  const distractors: EnrichedGameSurah[] = [];
  if (hasDistractors) {
    const smart = shuffleArray(group.smartDistractors)
      .filter((no) => !group.surahs.includes(no))
      .map((no) => allSurahsMap.get(no))
      .filter((s): s is EnrichedGameSurah => Boolean(s));
    for (const s of smart) {
      if (distractors.length >= 2) break;
      distractors.push(s);
    }
  }

  let candidates = shuffleArray([...orderedTargets, ...distractors]);
  // Zaten birebir sıralı gelmemesini sağla
  if (
    !hasDistractors &&
    candidates.length >= 2 &&
    candidates.every((c, i) => c.no === orderedTargets[i].no)
  ) {
    candidates = [candidates[1], candidates[0], ...candidates.slice(2)];
  }

  return {
    id: `seq-${roundIndex}-${group.id}-${Math.random().toString(36).slice(2, 6)}`,
    group,
    isSubset,
    hasDistractors,
    orderedTargets,
    candidates,
    distractorNos: distractors.map((d) => d.no),
  };
}

interface FloatingDrag {
  pointerId: number;
  surah: EnrichedGameSurah;
  x: number;
  y: number;
}

export const GroupSequenceGame: React.FC<GameComponentProps> = ({
  tierId,
  tempo,
  playerMode,
  allSurahsMap,
  focusGroupId,
  onHudUpdate,
  onComplete,
}) => {
  const isDuel = playerMode === 'duel';

  const usedGroupsRef = useRef<Set<SurahGroupId>>(new Set());
  const [roundIdx, setRoundIdx] = useState<number>(0);
  const [round, setRound] = useState<SequenceRoundData>(() =>
    generateSequenceRound(0, focusGroupId, allSurahsMap, usedGroupsRef.current),
  );

  // Yerleştirilen sıralı sureler (0..N-1)
  const [placedSurahs, setPlacedSurahs] = useState<EnrichedGameSurah[]>([]);
  const [wrongCardNo, setWrongCardNo] = useState<number | null>(null);
  const [inlineHint, setInlineHint] = useState<string | null>(null);
  const [roundCompleted, setRoundCompleted] = useState<boolean>(false);

  // Sürükle-bırak durumu
  const [dragState, setDragState] = useState<FloatingDrag | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

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
  const { scheduleTimeout } = useManagedTimeouts();

  const placedNos = useMemo(() => new Set(placedSurahs.map((s) => s.no)), [placedSurahs]);
  const nextExpected = round.orderedTargets[placedSurahs.length] ?? null;

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
      const stars = calculateGameStars(accuracyPct, Math.round(stats.p1Score / 2));
      const earnedXp = calculateGameXp(Math.round(stats.p1Score / 2), stars, stats.maxCombo);

      onComplete({
        gameId: 'group_seq',
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

  const isTimerPausedRef = useRef<boolean>(false);
  useEffect(() => {
    isTimerPausedRef.current = roundCompleted;
  }, [roundCompleted]);

  // Zamanlayıcı (Tur tamamlanınca incelerken duraklatılır)
  useEffect(() => {
    if (finishedRef.current) return;
    const interval = window.setInterval(() => {
      if (finishedRef.current || isTimerPausedRef.current) return;
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

  const handleNextRound = useCallback(() => {
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
    setRound(generateSequenceRound(nextIdx, focusGroupId, allSurahsMap, usedGroupsRef.current));
    setPlacedSurahs([]);
    setWrongCardNo(null);
    setInlineHint(null);
    setRoundCompleted(false);
    setDragState(null);
    setFeaturedSurah(null);
    setFeaturedNote(undefined);
  }, [
    allSurahsMap,
    elapsedSec,
    finishGame,
    focusGroupId,
    maxCombo,
    mistakeCount,
    p1Correct,
    p1Score,
    p2Correct,
    p2Score,
    roundIdx,
    tempo,
  ]);

  const attemptPlaceNext = useCallback(
    (surah: EnrichedGameSurah) => {
      if (roundCompleted || !nextExpected || placedNos.has(surah.no) || finishedRef.current) {
        return;
      }

      setMovesCount((prev) => prev + 1);
      const actor = isDuel ? activePlayer : 'p1';

      if (surah.no === nextExpected.no) {
        const nextPlaced = [...placedSurahs, surah];
        setPlacedSurahs(nextPlaced);
        setInlineHint(null);

        const nextCombo = actor === 'p1' ? combo + 1 : combo;
        const pts = 12 + Math.min(8, Math.max(0, nextCombo - 1) * 2);
        if (actor === 'p1') {
          setCombo(nextCombo);
          setMaxCombo((prev) => Math.max(prev, nextCombo));
          setP1Score((prev) => prev + pts);
          setP1Correct((prev) => prev + 1);
        } else {
          setP2Score((prev) => prev + pts);
          setP2Correct((prev) => prev + 1);
        }
        gameAudioService.playMatch(Math.max(1, nextCombo));

        setFeaturedSurah(surah);
        setFeaturedNote(
          `${nextPlaced.length}. sıra doğru: ${surah.no}. ${surah.shortNameTr} (+${pts}p)`,
        );

        if (isDuel) {
          setActivePlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
        }

        if (nextPlaced.length >= round.orderedTargets.length) {
          setRoundCompleted(true);
        }
      } else {
        setWrongCardNo(surah.no);
        gameAudioService.playWrong();
        setCombo(0);
        setMistakeCount((prev) => prev + 1);
        mistakenMapRef.current.set(nextExpected.no, nextExpected);
        mistakenMapRef.current.set(surah.no, surah);

        const isDistractor = round.distractorNos.includes(surah.no);
        const hint = isDistractor
          ? `${surah.shortNameTr} bu aileden değildir (çeldirici)!`
          : `Daha önce gelen bir sure var: ${placedSurahs.length + 1}. sırayı bulun.`;
        setInlineHint(hint);

        if (isDistractor) {
          setFeaturedSurah(surah);
          setFeaturedNote(explainWhyNotInGroup(surah.no, surah.shortNameTr, round.group));
        }

        if (isDuel) {
          gameAudioService.playTurnSwitch();
          setActivePlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
        }

        scheduleTimeout(() => setWrongCardNo(null), 900);
      }
    },
    [
      activePlayer,
      combo,
      isDuel,
      nextExpected,
      placedNos,
      placedSurahs,
      round.distractorNos,
      round.group,
      round.orderedTargets.length,
      roundCompleted,
      scheduleTimeout,
    ],
  );

  // Hibrit Pointer Drag & Drop (hedef sonraki boş yuva)
  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    surah: EnrichedGameSurah,
  ) => {
    if (roundCompleted || placedNos.has(surah.no)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragState({ pointerId: e.pointerId, surah, x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const origin = dragOriginRef.current;
    if (origin && !origin.moved && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8) {
      origin.moved = true;
    }
    if (origin?.moved) {
      setDragState((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
    }
  };

  const handlePointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    surah: EnrichedGameSurah,
  ) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const wasMoved = Boolean(dragOriginRef.current?.moved);
    setDragState(null);
    dragOriginRef.current = null;

    if (!wasMoved) {
      attemptPlaceNext(surah);
      return;
    }

    const els = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of els) {
      if ((el as HTMLElement).dataset?.seqSlot === 'next') {
        attemptPlaceNext(surah);
        return;
      }
    }
  };

  // HUD senkronizasyonu
  useEffect(() => {
    const remaining = Math.max(0, TIMED_LIMIT_SEC - elapsedSec);
    const statusMessage = roundCompleted
      ? `${round.group.shortLabel} dizilimi eksiksiz tamamlandı!`
      : inlineHint
        ? inlineHint
        : isDuel
          ? `${activePlayer === 'p1' ? '1. Oyuncu' : '2. Oyuncu'}: ${placedSurahs.length + 1}. sıradaki sureyi seç.`
          : round.hasDistractors
            ? `Çeldiricileri ele ve ${placedSurahs.length + 1}. sıradaki sureye dokun.`
            : `${round.group.shortLabel} surelerini Mushaf sırasına göre ${placedSurahs.length + 1}. sıradan diz.`;

    onHudUpdate({
      score: p1Score,
      p1Score,
      p2Score,
      activeTurn: !isDuel ? 'p1' : activePlayer,
      combo,
      movesCount,
      progressLabel: `${placedSurahs.length}/${round.orderedTargets.length}`,
      elapsedSec,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 12,
      turnRemainingSec: tempo === 'timed' ? remaining : null,
      turnDurationSec: TIMED_LIMIT_SEC,
      statusMessage,
      featuredSurah,
      featuredNote,
      roundContextTitle: round.group.title,
      roundContextHint: round.group.description,
    });
  }, [
    activePlayer,
    combo,
    elapsedSec,
    featuredNote,
    featuredSurah,
    inlineHint,
    isDuel,
    movesCount,
    onHudUpdate,
    p1Score,
    p2Score,
    placedSurahs.length,
    round.group.description,
    round.group.shortLabel,
    round.group.title,
    round.hasDistractors,
    round.orderedTargets.length,
    roundCompleted,
    tempo,
  ]);

  const slotCount = round.orderedTargets.length;
  // Mobil 360px uyumlu sıkışmasız ızgara
  const slotGridClass =
    slotCount <= 2
      ? 'grid-cols-2'
      : slotCount === 3
        ? 'grid-cols-3'
        : slotCount === 4
          ? 'grid-cols-2 sm:grid-cols-4'
          : slotCount === 5
            ? 'grid-cols-3 sm:grid-cols-5'
            : 'grid-cols-3 sm:grid-cols-4';

  // Mobilde her zaman 2 kolon (360px taşmasını sıfırlar), tablet/masaüstünde 3–4 kolon
  const candGridClass =
    round.candidates.length <= 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-start lg:justify-center gap-2.5 sm:gap-4 pb-1 lg:pb-0 relative">
      {/* Üst Grup Başlık & Soru Banner'ı */}
      <StagePromptBanner
        badgeIcon={<ListOrdered className="w-3.5 h-3.5" />}
        badgeLabel={round.group.shortLabel}
        arabicAccent={round.group.arabicTitle}
        distractorBadge={round.hasDistractors ? '+2 Çeldirici' : undefined}
        prompt={
          round.isSubset
            ? `${round.group.title} (5 surelik seçki) — Mushaf sırasına dizin`
            : `${round.group.title} — Baştan sona Mushaf sırasına dizin`
        }
        secondaryBadge={`${placedSurahs.length}/${slotCount}`}
        progressBadge={
          tempo === 'calm' ? `Tur ${roundIdx + 1}/${TOTAL_CALM_ROUNDS}` : `Tur ${roundIdx + 1}`
        }
      />

      {/* ÜST BÖLGE: 1 -> N Altın Mushaf Sıralama Yuvaları */}
      <div className={`grid ${slotGridClass} gap-2 sm:gap-2.5`}>
        {round.orderedTargets.map((_, idx) => {
          const placed = placedSurahs[idx] ?? null;
          const isNextSlot = !roundCompleted && idx === placedSurahs.length;

          return (
            <div
              key={`slot-${idx}`}
              data-seq-slot={isNextSlot ? 'next' : undefined}
              className={`min-h-[78px] sm:min-h-[100px] rounded-xl sm:rounded-2xl px-2 py-2 flex flex-col items-center justify-center text-center transition-all ${
                placed
                  ? 'game-bevel-emerald game-pop'
                  : isNextSlot
                    ? 'bg-amber-400/22 border-2 border-dashed border-amber-300 text-amber-100'
                    : 'bg-black/22 border border-dashed border-white/25 text-white/65'
              }`}
            >
              {placed ? (
                <>
                  <div className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-amber-300" strokeWidth={3} />
                    <span className="text-[11px] sm:text-xs font-black tabular-nums px-1.5 py-0.5 rounded-md bg-amber-400 text-amber-950">
                      {placed.no}. Sure
                    </span>
                  </div>
                  <div
                    dir="rtl"
                    lang="ar"
                    className="font-arabic text-base sm:text-xl lg:text-2xl text-amber-200 leading-snug break-keep mt-0.5"
                  >
                    {placed.nameAr}
                  </div>
                  <div className="text-xs sm:text-sm lg:text-base font-extrabold text-white leading-tight line-clamp-1">
                    {placed.shortNameTr}
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm sm:text-base font-extrabold tabular-nums">
                    {idx + 1}. Sıra
                  </span>
                  <span className="text-xs font-semibold opacity-85 mt-0.5">
                    {isNextSlot ? 'Sıradaki' : '—'}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Tur Tamamlandı veya İpucu Şeridi */}
      {roundCompleted ? (
        <RoundReviewBanner
          variant="success"
          message={renderArabicHighlightedText(
            `Tebrikler! ${round.group.shortLabel} dizilimi eksiksiz tamamlandı.`,
          )}
          ctaLabel="Sonraki Grup"
          onContinue={handleNextRound}
          timerPausedNote={tempo === 'timed'}
        />
      ) : inlineHint ? (
        <div className="shrink-0 rounded-xl bg-red-950/80 border border-red-400/55 px-3.5 py-2 text-center text-xs sm:text-sm font-bold text-red-100">
          {renderArabicHighlightedText(inlineHint)}
        </div>
      ) : null}

      {/* ALT BÖLGE: #1..#N Numaralı 3B Parşömen Aday Kartları */}
      <div className="shrink-0 rounded-2xl bg-black/20 border border-white/15 p-2.5 sm:p-3">
        <div className={`grid ${candGridClass} gap-2 sm:gap-2.5`}>
          {round.candidates.map((cand, idx) => {
            const isPlaced = placedNos.has(cand.no);
            const isWrongNow = wrongCardNo === cand.no;
            const isDraggingThis =
              dragState?.surah.no === cand.no && Boolean(dragOriginRef.current?.moved);
            const isRevealedDistractor =
              roundCompleted && round.distractorNos.includes(cand.no);

            return (
              <button
                key={cand.no}
                type="button"
                disabled={isPlaced || roundCompleted}
                onPointerDown={(e) => handlePointerDown(e, cand)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, cand)}
                onPointerCancel={() => {
                  setDragState(null);
                  dragOriginRef.current = null;
                }}
                style={{
                  touchAction: 'none',
                  opacity: isPlaced ? 0.25 : isRevealedDistractor ? 0.45 : isDraggingThis ? 0.45 : 1,
                }}
                className={`min-h-[68px] sm:min-h-[76px] rounded-xl px-2 py-1.5 sm:px-2.5 sm:py-2 flex flex-col justify-between gap-1 cursor-pointer select-none transition-opacity ${
                  isWrongNow
                    ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white game-shake'
                    : 'game-bevel-parchment hover:brightness-[1.02]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded ${
                      isWrongNow ? 'bg-white/20 text-white' : 'bg-amber-900/10 text-slate-600'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <GripVertical
                    className={`w-3.5 h-3.5 shrink-0 ${isWrongNow ? 'text-white/70' : 'text-slate-500'}`}
                  />
                </div>
                <div className="w-full text-center pb-0.5">
                  <div
                    dir="rtl"
                    lang="ar"
                    className={`font-arabic text-base sm:text-xl lg:text-[24px] leading-snug break-keep ${
                      isWrongNow ? 'text-amber-200' : 'text-teal-900'
                    }`}
                  >
                    {cand.nameAr}
                  </div>
                  <div
                    className={`text-xs sm:text-sm lg:text-[16px] font-bold leading-tight line-clamp-1 ${
                      isWrongNow ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {cand.shortNameTr}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sürüklenen Kart Hayaleti */}
      {dragState && dragOriginRef.current?.moved && (
        <div
          className="fixed z-[80] pointer-events-none game-bevel-amber rounded-xl px-3.5 py-2.5 text-center shadow-2xl"
          style={{
            left: dragState.x,
            top: dragState.y,
            transform: 'translate(-50%, -65%) scale(1.05)',
            minWidth: 124,
          }}
        >
          <div dir="rtl" className="font-arabic text-xl leading-tight text-teal-950">
            {dragState.surah.nameAr}
          </div>
          <div className="text-sm font-extrabold text-amber-950">
            {dragState.surah.shortNameTr}
          </div>
        </div>
      )}
    </div>
  );
};
