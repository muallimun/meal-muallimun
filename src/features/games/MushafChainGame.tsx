import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, GripVertical, Sparkles } from 'lucide-react';
import { gameAudioService } from './gameAudioService';
import type { EnrichedGameSurah, GameComponentProps } from './gameTypes';
import {
  calculateGameStars,
  calculateGameXp,
  formatClock,
  shuffleArray,
} from './gameTypes';
import { SPECIAL_SURAH_FAMILIES } from './surahSpecialGroups';

type ChainRoundKind = 'neighbors' | 'train';

interface ChainRoundData {
  id: string;
  kind: ChainRoundKind;
  promptTitle: string;
  centerSurah?: EnrichedGameSurah;
  focusSurah: EnrichedGameSurah;
  expectedNos: number[];
  candidates: EnrichedGameSurah[];
}

const TOTAL_CALM_ROUNDS = 5;
const TIMED_LIMIT_SEC = 65;

function generateChainRound(
  roundIndex: number,
  tierId: GameComponentProps['tierId'],
  tierSurahs: EnrichedGameSurah[],
  allSurahsMap: Map<number, EnrichedGameSurah>,
  usedCenterNos: Set<number>,
): ChainRoundData {
  const kind: ChainRoundKind = roundIndex % 2 === 0 ? 'neighbors' : 'train';

  if (kind === 'neighbors') {
    const eligible = tierSurahs.filter(
      (s) => s.no >= 2 && s.no <= 113 && allSurahsMap.has(s.no - 1) && allSurahsMap.has(s.no + 1),
    );
    const fresh = eligible.filter((s) => !usedCenterNos.has(s.no));
    const pool = fresh.length > 0 ? fresh : eligible;
    const center =
      pool[Math.floor(Math.random() * pool.length)] ??
      allSurahsMap.get(108) ??
      tierSurahs[0];

    usedCenterNos.add(center.no);
    const prevSurah = allSurahsMap.get(center.no - 1)!;
    const nextSurah = allSurahsMap.get(center.no + 1)!;

    const distractorMap = new Map<number, EnrichedGameSurah>();
    for (const off of shuffleArray([-3, -2, 2, 3, -4, 4, -5, 5])) {
      if (distractorMap.size >= 2) break;
      const cand = allSurahsMap.get(center.no + off);
      if (
        cand &&
        cand.no !== center.no &&
        cand.no !== prevSurah.no &&
        cand.no !== nextSurah.no
      ) {
        distractorMap.set(cand.no, cand);
      }
    }
    for (const s of shuffleArray(tierSurahs)) {
      if (distractorMap.size >= 3) break;
      if (
        s.no !== center.no &&
        s.no !== prevSurah.no &&
        s.no !== nextSurah.no &&
        !distractorMap.has(s.no)
      ) {
        distractorMap.set(s.no, s);
      }
    }

    const candidates = shuffleArray([
      prevSurah,
      nextSurah,
      ...Array.from(distractorMap.values()).slice(0, 3),
    ]);

    return {
      id: `n-${roundIndex}-${center.no}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'neighbors',
      promptTitle: 'Önceki ve Sonraki Komşu Sureleri Yuvalara Yerleştirin',
      centerSurah: center,
      focusSurah: center,
      expectedNos: [prevSurah.no, nextSurah.no],
      candidates,
    };
  }

  let picked: EnrichedGameSurah[] = [];
  if (tierId === 'kademe_4' && Math.random() < 0.55) {
    const hawamimSurahs = SPECIAL_SURAH_FAMILIES.hawamim.surahs
      .map((no) => allSurahsMap.get(no))
      .filter((s): s is EnrichedGameSurah => Boolean(s));
    if (hawamimSurahs.length >= 4) {
      const start = Math.floor(Math.random() * (hawamimSurahs.length - 3));
      picked = hawamimSurahs.slice(start, start + 4);
    }
  }

  if (picked.length < 4) {
    picked = shuffleArray(tierSurahs).slice(0, 4).sort((a, b) => a.no - b.no);
  }

  let candidates = shuffleArray(picked);
  const expectedNos = picked.map((s) => s.no);
  if (candidates.every((c, idx) => c.no === expectedNos[idx]) && candidates.length >= 2) {
    candidates = [candidates[1], candidates[0], ...candidates.slice(2)];
  }

  return {
    id: `t-${roundIndex}-${expectedNos.join('_')}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'train',
    promptTitle:
      tierId === 'kademe_4' && picked.every((p) => p.no >= 40 && p.no <= 46)
        ? "7 Hâ-Mîm'leri (Havâmîm) Mushaf Sırasına Dizin"
        : '4 Sureyi Mushaf Sırasına Göre Baştan Sona Dizin',
    focusSurah: picked[0],
    expectedNos,
    candidates,
  };
}

interface FloatingDragState {
  pointerId: number;
  surah: EnrichedGameSurah;
  x: number;
  y: number;
}

interface ChainBoardProps {
  boardId: 'single' | 'p1' | 'p2';
  headerLabel?: string;
  headerScore?: number;
  headerAccent?: 'amber' | 'teal';
  round: ChainRoundData;
  roundNumber: number;
  totalRoundsLabel: string;
  isFinished?: boolean;
  onRoundCleared: (hadMistake: boolean, focusSurah: EnrichedGameSurah) => void;
  onMistakeStep: (surah: EnrichedGameSurah) => void;
}

const ChainBoard: React.FC<ChainBoardProps> = ({
  boardId,
  headerLabel,
  headerScore,
  headerAccent = 'amber',
  round,
  roundNumber,
  totalRoundsLabel,
  isFinished,
  onRoundCleared,
  onMistakeStep,
}) => {
  const slotCount = round.expectedNos.length;
  const [slots, setSlots] = useState<(EnrichedGameSurah | null)[]>(() =>
    Array.from({ length: slotCount }, () => null),
  );
  const [selectedSurahNo, setSelectedSurahNo] = useState<number | null>(null);
  const [wrongSlots, setWrongSlots] = useState<number[]>([]);
  const [cleared, setCleared] = useState<boolean>(false);
  const [dragState, setDragState] = useState<FloatingDragState | null>(null);

  const hadMistakeRef = useRef<boolean>(false);
  const dragOriginRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    setSlots(Array.from({ length: round.expectedNos.length }, () => null));
    setSelectedSurahNo(null);
    setWrongSlots([]);
    setCleared(false);
    setDragState(null);
    hadMistakeRef.current = false;
  }, [round]);

  const placedNos = useMemo(
    () => new Set(slots.filter((s): s is EnrichedGameSurah => Boolean(s)).map((s) => s.no)),
    [slots],
  );

  const evaluateFilledSlots = useCallback(
    (nextSlots: (EnrichedGameSurah | null)[]) => {
      if (nextSlots.some((s) => s === null)) return;

      const wrongIdx: number[] = [];
      nextSlots.forEach((placed, idx) => {
        if (!placed || placed.no !== round.expectedNos[idx]) {
          wrongIdx.push(idx);
        }
      });

      if (wrongIdx.length === 0) {
        setCleared(true);
        setWrongSlots([]);
        setSelectedSurahNo(null);
        gameAudioService.playMatch(hadMistakeRef.current ? 1 : 2);
        window.setTimeout(() => {
          onRoundCleared(hadMistakeRef.current, round.focusSurah);
        }, 420);
      } else {
        hadMistakeRef.current = true;
        setWrongSlots(wrongIdx);
        gameAudioService.playWrong();
        if (round.centerSurah) onMistakeStep(round.centerSurah);
        wrongIdx.forEach((idx) => {
          const placed = nextSlots[idx];
          if (placed) onMistakeStep(placed);
        });

        window.setTimeout(() => {
          setSlots((prev) =>
            prev.map((item, idx) => (wrongIdx.includes(idx) ? null : item)),
          );
          setWrongSlots([]);
        }, 560);
      }
    },
    [onMistakeStep, onRoundCleared, round],
  );

  const placeSurahInSlot = useCallback(
    (surah: EnrichedGameSurah, slotIndex: number) => {
      if (cleared || isFinished) return;
      gameAudioService.playSnap();
      setSlots((prev) => {
        const next = prev.map((item) => (item?.no === surah.no ? null : item));
        next[slotIndex] = surah;
        window.setTimeout(() => evaluateFilledSlots(next), 40);
        return next;
      });
      setSelectedSurahNo(null);
    },
    [cleared, evaluateFilledSlots, isFinished],
  );

  const handleCandidateTap = (surah: EnrichedGameSurah) => {
    if (cleared || isFinished || placedNos.has(surah.no)) return;
    gameAudioService.playFlip();
    if (selectedSurahNo === surah.no) {
      const firstEmpty = slots.findIndex((s) => s === null);
      if (firstEmpty >= 0) placeSurahInSlot(surah, firstEmpty);
      return;
    }
    setSelectedSurahNo(surah.no);
  };

  const handleSlotTap = (slotIndex: number) => {
    if (cleared || isFinished) return;
    if (selectedSurahNo !== null) {
      const cand = round.candidates.find((c) => c.no === selectedSurahNo);
      if (cand) placeSurahInSlot(cand, slotIndex);
      return;
    }
    if (slots[slotIndex]) {
      gameAudioService.playFlip();
      setSlots((prev) => prev.map((item, idx) => (idx === slotIndex ? null : item)));
    }
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    surah: EnrichedGameSurah,
  ) => {
    if (cleared || isFinished || placedNos.has(surah.no)) return;
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
      handleCandidateTap(surah);
      return;
    }

    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of elements) {
      const slotAttr = (el as HTMLElement).dataset?.chainSlot;
      if (slotAttr && slotAttr.startsWith(`${boardId}:`)) {
        const idx = Number(slotAttr.split(':')[1]);
        if (!Number.isNaN(idx) && idx >= 0 && idx < slotCount) {
          placeSurahInSlot(surah, idx);
          return;
        }
      }
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden relative">
      {/* Başlık */}
      <div className="shrink-0 space-y-1.5">
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
              <span className="text-xs opacity-80">{totalRoundsLabel}</span>
              <span className="text-base font-black">{headerScore ?? 0}p</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-300/30 shrink-0">
              {round.kind === 'neighbors' ? 'Komşu Sureler' : 'Mushaf Treni'}
            </span>
            <span className="text-xs sm:text-sm font-bold text-white/95 truncate">
              {round.promptTitle}
            </span>
          </div>
          {!headerLabel && (
            <span className="text-xs font-extrabold tabular-nums text-amber-200 shrink-0">
              Tur {roundNumber}
              {totalRoundsLabel ? `/${totalRoundsLabel}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Orta Alan: Hedef Yuvalar */}
      {isFinished ? (
        <div className="flex-1 min-h-0 rounded-2xl border border-emerald-300/35 bg-emerald-950/35 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
          <CheckCircle2 className="w-8 h-8 text-amber-300" />
          <p className="text-base font-extrabold">Tüm Turlar Tamamlandı</p>
          <p className="text-xs text-white/75">Diğer oyuncunun tamamlaması bekleniyor...</p>
        </div>
      ) : round.kind === 'neighbors' && round.centerSurah ? (
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 items-stretch">
            {renderSlotButton({
              boardId,
              slotIndex: 0,
              label: 'Önceki Sure',
              icon: <ArrowLeft className="w-3.5 h-3.5" />,
              placed: slots[0],
              isWrong: wrongSlots.includes(0),
              isCleared: cleared,
              isHighlighted: selectedSurahNo !== null && !slots[0],
              onClick: () => handleSlotTap(0),
            })}

            {/* Merkez Sabit 3B Zümrüt Sure Kartı */}
            <div className="game-bevel-emerald rounded-2xl p-2 sm:p-3.5 flex flex-col items-center justify-center text-center gap-1">
              <span className="text-[10px] sm:text-xs font-extrabold tabular-nums px-2 py-0.5 rounded bg-amber-400 text-amber-950">
                {round.centerSurah.no}. Sure
              </span>
              <span dir="rtl" className="font-arabic text-xl sm:text-2xl leading-tight text-amber-200">
                {round.centerSurah.nameAr}
              </span>
              <span className="text-xs sm:text-base font-extrabold leading-tight text-white">
                {round.centerSurah.shortNameTr}
              </span>
              {round.centerSurah.mukattaa && (
                <span dir="rtl" className="font-arabic text-xs sm:text-sm font-bold text-amber-300">
                  {round.centerSurah.mukattaa.arabic}
                </span>
              )}
            </div>

            {renderSlotButton({
              boardId,
              slotIndex: 1,
              label: 'Sonraki Sure',
              icon: <ArrowRight className="w-3.5 h-3.5" />,
              placed: slots[1],
              isWrong: wrongSlots.includes(1),
              isCleared: cleared,
              isHighlighted: selectedSurahNo !== null && !slots[1],
              onClick: () => handleSlotTap(1),
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
            {slots.map((placed, idx) =>
              renderSlotButton({
                boardId,
                slotIndex: idx,
                label: `${idx + 1}. Sıra`,
                icon: <Sparkles className="w-3 h-3" />,
                placed,
                isWrong: wrongSlots.includes(idx),
                isCleared: cleared,
                isHighlighted: selectedSurahNo !== null && !placed,
                onClick: () => handleSlotTap(idx),
              }),
            )}
          </div>
        </div>
      )}

      {/* Alt 3B Parşömen Aday Kartlar Havuzu */}
      {!isFinished && (
        <div className="shrink-0 rounded-2xl bg-black/18 border border-white/15 p-2 sm:p-3 space-y-1.5">
          <div className="text-[11px] font-semibold text-white/80 px-0.5">
            {selectedSurahNo !== null
              ? 'Şimdi yukarıdaki altın çerçeveli hedef yuvaya dokunun'
              : 'Parşömen sure kartını sürükleyin veya dokunup yuvaya yerleştirin'}
          </div>

          <div
            className={`grid gap-2 ${
              round.candidates.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5'
            }`}
          >
            {round.candidates.map((cand, cIdx) => {
              const isUsed = placedNos.has(cand.no);
              const isSelected = selectedSurahNo === cand.no;
              const isDraggingThis =
                dragState?.surah.no === cand.no && Boolean(dragOriginRef.current?.moved);

              return (
                <button
                  key={cand.no}
                  type="button"
                  disabled={isUsed || cleared}
                  onPointerDown={(e) => handlePointerDown(e, cand)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(e, cand)}
                  onPointerCancel={() => {
                    setDragState(null);
                    dragOriginRef.current = null;
                  }}
                  style={{
                    touchAction: 'none',
                    opacity: isUsed ? 0.3 : isDraggingThis ? 0.45 : 1,
                  }}
                  className={`${
                    isSelected ? 'game-bevel-amber' : 'game-bevel-parchment'
                  } min-h-[54px] sm:min-h-[64px] rounded-xl px-2 py-1.5 flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing select-none transition-opacity relative`}
                >
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <span className="text-[9px] font-black tabular-nums text-slate-500">
                      #{cIdx + 1}
                    </span>
                    <GripVertical className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0 text-center">
                    <div
                      dir="rtl"
                      className="font-arabic text-base sm:text-lg leading-tight text-teal-900 truncate"
                    >
                      {cand.nameAr}
                    </div>
                    <div className="text-xs font-extrabold text-slate-800 truncate">
                      {cand.shortNameTr}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sürüklenen Kart Hayaleti */}
      {dragState && dragOriginRef.current?.moved && (
        <div
          className="fixed z-[80] pointer-events-none game-bevel-amber rounded-xl px-3 py-2 text-center shadow-2xl"
          style={{
            left: dragState.x,
            top: dragState.y,
            transform: 'translate(-50%, -65%) scale(1.05)',
            minWidth: 112,
          }}
        >
          <div dir="rtl" className="font-arabic text-lg leading-tight text-teal-950">
            {dragState.surah.nameAr}
          </div>
          <div className="text-xs font-extrabold text-amber-950">
            {dragState.surah.shortNameTr}
          </div>
        </div>
      )}
    </div>
  );
};

function renderSlotButton(params: {
  boardId: string;
  slotIndex: number;
  label: string;
  icon: React.ReactNode;
  placed: EnrichedGameSurah | null;
  isWrong: boolean;
  isCleared: boolean;
  isHighlighted: boolean;
  onClick: () => void;
}) {
  const {
    boardId,
    slotIndex,
    label,
    icon,
    placed,
    isWrong,
    isCleared,
    isHighlighted,
    onClick,
  } = params;

  const slotSurface = isWrong
    ? 'bg-red-900/80 border-2 border-red-400 text-white game-shake'
    : isCleared
      ? 'game-bevel-emerald'
      : placed
        ? 'game-bevel-parchment'
        : isHighlighted
          ? 'bg-amber-400/20 border-2 border-dashed border-amber-300 text-amber-100'
          : 'bg-black/20 border-2 border-dashed border-amber-200/45 text-amber-100/85';

  return (
    <button
      key={`${boardId}-slot-${slotIndex}`}
      type="button"
      data-chain-slot={`${boardId}:${slotIndex}`}
      onClick={onClick}
      className={`min-h-[96px] sm:min-h-[120px] rounded-2xl px-2 py-2.5 flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-all ${slotSurface}`}
    >
      <span
        className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold ${
          placed && !isCleared && !isWrong ? 'text-teal-800' : ''
        }`}
      >
        {icon}
        <span>{label}</span>
      </span>

      {placed ? (
        <>
          <span
            dir="rtl"
            className={`font-arabic text-lg sm:text-xl leading-tight ${
              isCleared ? 'text-amber-200' : isWrong ? 'text-white' : 'text-teal-900'
            }`}
          >
            {placed.nameAr}
          </span>
          <span
            className={`text-xs sm:text-sm font-extrabold leading-tight line-clamp-1 ${
              isCleared || isWrong ? 'text-white' : 'text-slate-900'
            }`}
          >
            {placed.shortNameTr}
          </span>
          {isCleared && (
            <span className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded bg-amber-400 text-amber-950">
              {placed.no}. Sure
            </span>
          )}
        </>
      ) : (
        <span className="text-[11px] font-medium opacity-80">
          {isHighlighted ? 'Buraya bırak' : 'Altın yuva'}
        </span>
      )}
    </button>
  );
}

export const MushafChainGame: React.FC<GameComponentProps> = ({
  tierId,
  tempo,
  playerMode,
  tierSurahs,
  allSurahsMap,
  onHudUpdate,
  onComplete,
}) => {
  const isDuel = playerMode === 'duel';
  const isAi = playerMode === 'ai';

  const usedSingleRef = useRef<Set<number>>(new Set());
  const [singleRoundIdx, setSingleRoundIdx] = useState<number>(0);
  const [singleRound, setSingleRound] = useState<ChainRoundData>(() =>
    generateChainRound(0, tierId, tierSurahs, allSurahsMap, usedSingleRef.current),
  );
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // Yapay Zekâ puanları (eşzamanlı yarış)
  const [aiScore, setAiScore] = useState<number>(0);
  const [aiCorrect, setAiCorrect] = useState<number>(0);
  const [aiThinking, setAiThinking] = useState<boolean>(false);

  // 2 Oyuncu Bölünmüş Ekran
  const usedP1Ref = useRef<Set<number>>(new Set());
  const usedP2Ref = useRef<Set<number>>(new Set());
  const [p1Idx, setP1Idx] = useState<number>(0);
  const [p2Idx, setP2Idx] = useState<number>(0);
  const [p1Round, setP1Round] = useState<ChainRoundData>(() =>
    generateChainRound(0, tierId, tierSurahs, allSurahsMap, usedP1Ref.current),
  );
  const [p2Round, setP2Round] = useState<ChainRoundData>(() =>
    generateChainRound(0, tierId, tierSurahs, allSurahsMap, usedP2Ref.current),
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
        gameId: 'chain',
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
        duel:
          isDuel || isAi
            ? {
                p1Score: payload.p1Score,
                p2Score: payload.p2Score,
                p1Correct: payload.p1Correct,
                p2Correct: payload.p2Correct,
                p1Label: isAi ? 'Sen' : '1. Oyuncu',
                p2Label: isAi ? 'Yapay Zekâ' : '2. Oyuncu',
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
    [isAi, isDuel, onComplete, playerMode, tempo, tierId],
  );

  // Zamanlayıcı
  useEffect(() => {
    if (finishedRef.current) return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Yapay Zekâ eşzamanlı rakip döngüsü (gerçekçi tempo & doğruluk)
  useEffect(() => {
    if (!isAi || finishedRef.current) return;
    let active = true;
    const scheduleNext = () => {
      const delay = 4600 + Math.floor(Math.random() * 2800);
      return window.setTimeout(() => {
        if (!active || finishedRef.current) return;
        setAiThinking(true);
        window.setTimeout(() => {
          if (!active || finishedRef.current) return;
          const success = Math.random() < 0.8;
          if (success) {
            setAiScore((prev) => prev + 18);
            setAiCorrect((prev) => prev + 1);
          }
          setAiThinking(false);
          if (active && !finishedRef.current) {
            timerRef = scheduleNext();
          }
        }, 700);
      }, delay);
    };
    let timerRef = scheduleNext();
    return () => {
      active = false;
      window.clearTimeout(timerRef);
    };
  }, [isAi]);

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
        p2Score: isDuel ? p2Score : aiScore,
        p1Correct: isDuel ? p1Correct : correctCount,
        p2Correct: isDuel ? p2Correct : aiCorrect,
      });
    }
  }, [
    aiCorrect,
    aiScore,
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
      p2Score: isDuel ? p2Score : aiScore,
      activeTurn: isDuel || isAi ? 'both' : 'p1',
      aiThinking: isAi && aiThinking,
      combo,
      movesCount,
      progressLabel:
        tempo === 'calm'
          ? isDuel
            ? `${Math.min(TOTAL_CALM_ROUNDS, Math.max(p1Idx, p2Idx) + 1)}/${TOTAL_CALM_ROUNDS}`
            : `${Math.min(TOTAL_CALM_ROUNDS, singleRoundIdx + 1)}/${TOTAL_CALM_ROUNDS}`
          : `${isDuel ? p1Correct + p2Correct : correctCount} Tur`,
      elapsedSec,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 10,
      turnRemainingSec: tempo === 'timed' ? remaining : null,
      turnDurationSec: TIMED_LIMIT_SEC,
      statusMessage: isDuel
        ? 'İki oyuncu aynı anda kendi zincirini tamamlıyor!'
        : isAi
          ? 'Komşu sureleri ve Mushaf trenini Yapay Zekâdan hızlı kur.'
          : 'Komşu sureleri altın yuvalara sürükle veya dokunup yerleştir.',
      featuredSurah,
      featuredNote,
    });
  }, [
    aiScore,
    aiThinking,
    combo,
    correctCount,
    elapsedSec,
    featuredNote,
    featuredSurah,
    isAi,
    isDuel,
    movesCount,
    onHudUpdate,
    p1Correct,
    p1Idx,
    p1Score,
    p2Correct,
    p2Idx,
    p2Score,
    score,
    singleRoundIdx,
    tempo,
  ]);

  const handleRecordMistake = useCallback((surah: EnrichedGameSurah) => {
    mistakenMapRef.current.set(surah.no, surah);
    setMistakeCount((prev) => prev + 1);
    setMovesCount((prev) => prev + 1);
    setCombo(0);
  }, []);

  const handleSingleCleared = useCallback(
    (hadMistake: boolean, focusSurah: EnrichedGameSurah) => {
      const nextCombo = hadMistake ? 1 : combo + 1;
      const nextMaxCombo = Math.max(maxCombo, nextCombo);
      const pts = (hadMistake ? 15 : 22) + Math.min(12, (nextCombo - 1) * 4);
      const nextScore = score + pts;
      const nextCorrect = correctCount + 1;
      const nextIdx = singleRoundIdx + 1;

      setScore(nextScore);
      setCombo(nextCombo);
      setMaxCombo(nextMaxCombo);
      setCorrectCount(nextCorrect);
      setMovesCount((prev) => prev + 1);
      setFeaturedSurah(focusSurah);
      setFeaturedNote(`Zincir tamamlandı (+${pts}p) · ${focusSurah.no}. ${focusSurah.shortNameTr}`);

      if (tempo === 'calm' && nextIdx >= TOTAL_CALM_ROUNDS) {
        finishGame({
          score: nextScore,
          maxCombo: nextMaxCombo,
          correctCount: nextCorrect,
          mistakeCount,
          elapsedSec,
          p1Score: nextScore,
          p2Score: aiScore,
          p1Correct: nextCorrect,
          p2Correct: aiCorrect,
        });
        return;
      }

      setSingleRoundIdx(nextIdx);
      setSingleRound(
        generateChainRound(nextIdx, tierId, tierSurahs, allSurahsMap, usedSingleRef.current),
      );
    },
    [
      aiCorrect,
      aiScore,
      allSurahsMap,
      combo,
      correctCount,
      elapsedSec,
      finishGame,
      maxCombo,
      mistakeCount,
      score,
      singleRoundIdx,
      tempo,
      tierId,
      tierSurahs,
    ],
  );

  const handleDuelCleared = useCallback(
    (player: 'p1' | 'p2', hadMistake: boolean, focusSurah: EnrichedGameSurah) => {
      const pts = hadMistake ? 15 : 22;
      setMovesCount((prev) => prev + 1);
      setFeaturedSurah(focusSurah);
      setFeaturedNote(
        `${player === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} zinciri tamamladı (+${pts}p)`,
      );

      if (player === 'p1') {
        const nextIdx = p1Idx + 1;
        const speedBonus = tempo === 'calm' && nextIdx >= TOTAL_CALM_ROUNDS && !p2Done ? 10 : 0;
        const nextP1Score = p1Score + pts + speedBonus;
        const nextP1Correct = p1Correct + 1;
        setP1Score(nextP1Score);
        setP1Correct(nextP1Correct);

        if (tempo === 'calm' && nextIdx >= TOTAL_CALM_ROUNDS) {
          setP1Done(true);
          if (p2Done) {
            finishGame({
              score: nextP1Score,
              maxCombo: Math.max(maxCombo, 1),
              correctCount: nextP1Correct + p2Correct,
              mistakeCount,
              elapsedSec,
              p1Score: nextP1Score,
              p2Score,
              p1Correct: nextP1Correct,
              p2Correct,
            });
          }
          return;
        }
        setP1Idx(nextIdx);
        setP1Round(
          generateChainRound(nextIdx, tierId, tierSurahs, allSurahsMap, usedP1Ref.current),
        );
      } else {
        const nextIdx = p2Idx + 1;
        const speedBonus = tempo === 'calm' && nextIdx >= TOTAL_CALM_ROUNDS && !p1Done ? 10 : 0;
        const nextP2Score = p2Score + pts + speedBonus;
        const nextP2Correct = p2Correct + 1;
        setP2Score(nextP2Score);
        setP2Correct(nextP2Correct);

        if (tempo === 'calm' && nextIdx >= TOTAL_CALM_ROUNDS) {
          setP2Done(true);
          if (p1Done) {
            finishGame({
              score: p1Score,
              maxCombo: Math.max(maxCombo, 1),
              correctCount: p1Correct + nextP2Correct,
              mistakeCount,
              elapsedSec,
              p1Score,
              p2Score: nextP2Score,
              p1Correct,
              p2Correct: nextP2Correct,
            });
          }
          return;
        }
        setP2Idx(nextIdx);
        setP2Round(
          generateChainRound(nextIdx, tierId, tierSurahs, allSurahsMap, usedP2Ref.current),
        );
      }
    },
    [
      allSurahsMap,
      elapsedSec,
      finishGame,
      maxCombo,
      mistakeCount,
      p1Correct,
      p1Done,
      p1Idx,
      p1Score,
      p2Correct,
      p2Done,
      p2Idx,
      p2Score,
      tempo,
      tierId,
      tierSurahs,
    ],
  );

  if (isDuel) {
    return (
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 overflow-hidden">
        <div className="min-h-0 flex flex-col rounded-2xl border border-amber-300/35 bg-black/15 p-2.5 overflow-hidden">
          <ChainBoard
            boardId="p1"
            headerLabel="1. Oyuncu"
            headerScore={p1Score}
            headerAccent="amber"
            round={p1Round}
            roundNumber={p1Idx + 1}
            totalRoundsLabel={
              tempo === 'calm'
                ? `${Math.min(TOTAL_CALM_ROUNDS, p1Idx + 1)}/${TOTAL_CALM_ROUNDS}`
                : `${p1Correct} Tur`
            }
            isFinished={p1Done}
            onRoundCleared={(hadMistake, s) => handleDuelCleared('p1', hadMistake, s)}
            onMistakeStep={handleRecordMistake}
          />
        </div>

        <div className="min-h-0 flex flex-col rounded-2xl border border-teal-200/30 bg-black/15 p-2.5 overflow-hidden">
          <ChainBoard
            boardId="p2"
            headerLabel="2. Oyuncu"
            headerScore={p2Score}
            headerAccent="teal"
            round={p2Round}
            roundNumber={p2Idx + 1}
            totalRoundsLabel={
              tempo === 'calm'
                ? `${Math.min(TOTAL_CALM_ROUNDS, p2Idx + 1)}/${TOTAL_CALM_ROUNDS}`
                : `${p2Correct} Tur`
            }
            isFinished={p2Done}
            onRoundCleared={(hadMistake, s) => handleDuelCleared('p2', hadMistake, s)}
            onMistakeStep={handleRecordMistake}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <ChainBoard
        boardId="single"
        round={singleRound}
        roundNumber={singleRoundIdx + 1}
        totalRoundsLabel={tempo === 'calm' ? String(TOTAL_CALM_ROUNDS) : ''}
        onRoundCleared={handleSingleCleared}
        onMistakeStep={handleRecordMistake}
      />
    </div>
  );
};
