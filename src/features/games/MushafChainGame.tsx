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
  /** Sıralı doğru sure numaraları (neighbors: [prevNo, nextNo], train: [s1, s2, s3, s4]) */
  expectedNos: number[];
  /** Alt havuzda gösterilecek aday sureler */
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
    // 2..113 aralığında hem öncesi hem sonrası bulunan bir merkez sure seç
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

    // 3 akıllı çeldirici seç (yakın komşular + kademe havuzu)
    const distractorMap = new Map<number, EnrichedGameSurah>();
    const nearOffsets = [-3, -2, 2, 3, -4, 4, -5, 5];
    for (const off of shuffleArray(nearOffsets)) {
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
      promptTitle: 'Önceki ve Sonraki Komşu Sureleri Yerleştirin',
      centerSurah: center,
      expectedNos: [prevSurah.no, nextSurah.no],
      candidates,
    };
  }

  // Round Type B: Mushaf Treni (4 sureyi baştan sona sırala)
  let picked: EnrichedGameSurah[] = [];

  // Kademe 4'te yüksek olasılıkla 7 Hâ-Mîm'lerden (Havâmîm) peş peşe 4 sure sor
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
    const uniqueSorted = shuffleArray(tierSurahs).slice(0, 4).sort((a, b) => a.no - b.no);
    picked = uniqueSorted;
  }

  // Karıştırılmış adayların zaten sıralı gelmemesini sağla
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
  accentColor: string;
  accentSoft: string;
  accentText: string;
  headerLabel?: string;
  headerScore?: number;
  round: ChainRoundData;
  roundNumber: number;
  totalRoundsLabel: string;
  isFinished?: boolean;
  onRoundCleared: (hadMistake: boolean, roundMistakes: EnrichedGameSurah[]) => void;
  onMistakeStep: (surah: EnrichedGameSurah) => void;
}

const ChainBoard: React.FC<ChainBoardProps> = ({
  boardId,
  accentColor,
  accentSoft,
  accentText,
  headerLabel,
  headerScore,
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
  const roundMistakesRef = useRef<Map<number, EnrichedGameSurah>>(new Map());
  const dragOriginRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Yeni turda tahta durumunu sıfırla
  useEffect(() => {
    setSlots(Array.from({ length: round.expectedNos.length }, () => null));
    setSelectedSurahNo(null);
    setWrongSlots([]);
    setCleared(false);
    setDragState(null);
    hadMistakeRef.current = false;
    roundMistakesRef.current = new Map();
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
          onRoundCleared(
            hadMistakeRef.current,
            Array.from(roundMistakesRef.current.values()),
          );
        }, 420);
      } else {
        hadMistakeRef.current = true;
        setWrongSlots(wrongIdx);
        gameAudioService.playWrong();

        // Hatalı sureleri pedagojik özet için kaydet
        if (round.centerSurah) {
          roundMistakesRef.current.set(round.centerSurah.no, round.centerSurah);
          onMistakeStep(round.centerSurah);
        }
        wrongIdx.forEach((idx) => {
          const placed = nextSlots[idx];
          if (placed) {
            roundMistakesRef.current.set(placed.no, placed);
            onMistakeStep(placed);
          }
        });

        // Kısa sarsıntıdan sonra yalnızca hatalı slotları temizle (doğrular sabit kalır)
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
      // Çift dokunuşta ilk boş slota hızlı yerleştir
      const firstEmpty = slots.findIndex((s) => s === null);
      if (firstEmpty >= 0) {
        placeSurahInSlot(surah, firstEmpty);
      }
      return;
    }
    setSelectedSurahNo(surah.no);
  };

  const handleSlotTap = (slotIndex: number) => {
    if (cleared || isFinished) return;
    if (selectedSurahNo !== null) {
      const cand = round.candidates.find((c) => c.no === selectedSurahNo);
      if (cand) {
        placeSurahInSlot(cand, slotIndex);
      }
      return;
    }
    // Slotta kart varsa geri havuza çıkar
    if (slots[slotIndex]) {
      gameAudioService.playFlip();
      setSlots((prev) => prev.map((item, idx) => (idx === slotIndex ? null : item)));
    }
  };

  // Çoklu dokunma destekli (pointerId izli) Hibrit Sürükle-Bırak
  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    surah: EnrichedGameSurah,
  ) => {
    if (cleared || isFinished || placedNos.has(surah.no)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragState({
      pointerId: e.pointerId,
      surah,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const origin = dragOriginRef.current;
    if (origin && !origin.moved) {
      const dist = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
      if (dist > 8) origin.moved = true;
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

    // Bırakılan noktadaki slotu bul
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
    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 sm:gap-3 overflow-hidden relative">
      {/* Oyuncu / Tur Başlığı */}
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
                {totalRoundsLabel}
              </span>
              <span className="text-base font-black tabular-nums" style={{ color: accentText }}>
                {headerScore ?? 0}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[11px] font-extrabold px-2 py-0.5 rounded-md shrink-0 tabular-nums"
              style={{
                backgroundColor: accentSoft,
                color: accentText,
              }}
            >
              {round.kind === 'neighbors' ? 'Komşu Sureler' : 'Mushaf Treni'}
            </span>
            <span
              className="text-xs sm:text-sm font-bold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {round.promptTitle}
            </span>
          </div>
          {!headerLabel && (
            <span
              className="text-xs font-bold tabular-nums shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              Tur {roundNumber}
              {totalRoundsLabel ? ` / ${totalRoundsLabel}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Orta Alan: Hedef Slotlar */}
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
            Tüm Turlar Tamamlandı
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Diğer oyuncunun tamamlaması bekleniyor...
          </p>
        </div>
      ) : round.kind === 'neighbors' && round.centerSurah ? (
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-2.5">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 items-stretch">
            {/* Sol Slot: Önceki Sure */}
            {renderSlotButton({
              boardId,
              slotIndex: 0,
              label: 'Önceki Sure',
              icon: <ArrowLeft className="w-3.5 h-3.5" />,
              placed: slots[0],
              isWrong: wrongSlots.includes(0),
              isCleared: cleared,
              isHighlighted: selectedSurahNo !== null && !slots[0],
              accentColor,
              accentSoft,
              accentText,
              onClick: () => handleSlotTap(0),
            })}

            {/* Merkez Sabit Sure Kartı */}
            <div
              className="rounded-2xl border-2 p-2 sm:p-3.5 flex flex-col items-center justify-center text-center gap-1"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: accentColor,
                boxShadow: '0 6px 18px -6px rgba(15, 23, 42, 0.14)',
              }}
            >
              <span
                className="text-[10px] sm:text-xs font-extrabold tabular-nums px-2 py-0.5 rounded-md"
                style={{
                  backgroundColor: accentSoft,
                  color: accentText,
                }}
              >
                {round.centerSurah.no}. Sure
              </span>
              <span
                dir="rtl"
                className="font-arabic text-xl sm:text-2xl leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {round.centerSurah.nameAr}
              </span>
              <span
                className="text-xs sm:text-base font-extrabold leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {round.centerSurah.shortNameTr}
              </span>
              {round.centerSurah.mukattaa && (
                <span
                  dir="rtl"
                  className="font-arabic text-xs sm:text-sm font-bold"
                  style={{ color: 'var(--brand-accent-text)' }}
                >
                  {round.centerSurah.mukattaa.arabic}
                </span>
              )}
            </div>

            {/* Sağ Slot: Sonraki Sure */}
            {renderSlotButton({
              boardId,
              slotIndex: 1,
              label: 'Sonraki Sure',
              icon: <ArrowRight className="w-3.5 h-3.5" />,
              placed: slots[1],
              isWrong: wrongSlots.includes(1),
              isCleared: cleared,
              isHighlighted: selectedSurahNo !== null && !slots[1],
              accentColor,
              accentSoft,
              accentText,
              onClick: () => handleSlotTap(1),
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-2">
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
                accentColor,
                accentSoft,
                accentText,
                onClick: () => handleSlotTap(idx),
              }),
            )}
          </div>
        </div>
      )}

      {/* Alt Aday Kartlar Havuzu */}
      {!isFinished && (
        <div
          className="shrink-0 rounded-2xl border p-2 sm:p-3 space-y-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between text-[11px] font-medium px-0.5" style={{ color: 'var(--text-muted)' }}>
            <span>
              {selectedSurahNo !== null
                ? 'Şimdi yukarıdaki hedef yuvaya dokunun'
                : 'Kartı sürükleyin veya dokunup yuvaya yerleştirin'}
            </span>
          </div>

          <div
            className={`grid gap-2 ${
              round.candidates.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5'
            }`}
          >
            {round.candidates.map((cand) => {
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
                    backgroundColor: isSelected ? accentSoft : 'var(--bg-surface)',
                    borderColor: isSelected ? accentColor : 'var(--border-strong)',
                    opacity: isUsed ? 0.32 : isDraggingThis ? 0.45 : 1,
                    boxShadow: isSelected
                      ? `0 0 0 2px ${accentColor}`
                      : '0 2px 6px -2px rgba(15, 23, 42, 0.08)',
                  }}
                  className="min-h-[54px] sm:min-h-[64px] rounded-xl border px-2 py-1.5 flex items-center justify-between gap-1.5 text-left cursor-grab active:cursor-grabbing select-none transition-opacity"
                >
                  <GripVertical
                    className="w-3.5 h-3.5 shrink-0 opacity-45"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <div className="flex-1 min-w-0 text-center">
                    <div
                      dir="rtl"
                      className="font-arabic text-base sm:text-lg leading-tight truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {cand.nameAr}
                    </div>
                    <div
                      className="text-xs font-extrabold truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {cand.shortNameTr}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sürüklenen Kart Hayaleti (Floating Ghost) */}
      {dragState && dragOriginRef.current?.moved && (
        <div
          className="fixed z-[80] pointer-events-none rounded-xl border-2 px-3 py-2 text-center shadow-xl"
          style={{
            left: dragState.x,
            top: dragState.y,
            transform: 'translate(-50%, -65%) scale(1.04)',
            backgroundColor: 'var(--bg-surface)',
            borderColor: accentColor,
            minWidth: 112,
          }}
        >
          <div dir="rtl" className="font-arabic text-lg leading-tight" style={{ color: 'var(--text-primary)' }}>
            {dragState.surah.nameAr}
          </div>
          <div className="text-xs font-extrabold" style={{ color: accentText }}>
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
  accentColor: string;
  accentSoft: string;
  accentText: string;
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
    accentColor,
    accentSoft,
    accentText,
    onClick,
  } = params;

  const borderColor = isWrong
    ? '#DC2626'
    : isCleared
      ? '#0D9488'
      : placed || isHighlighted
        ? accentColor
        : 'var(--border-strong)';

  const bgColor = isWrong
    ? 'rgba(220, 38, 38, 0.08)'
    : isCleared
      ? 'var(--brand-primary-soft)'
      : placed
        ? 'var(--bg-surface)'
        : isHighlighted
          ? accentSoft
          : 'var(--bg-surface-soft)';

  return (
    <button
      key={`${boardId}-slot-${slotIndex}`}
      type="button"
      data-chain-slot={`${boardId}:${slotIndex}`}
      onClick={onClick}
      className={`min-h-[96px] sm:min-h-[120px] rounded-2xl border-2 px-2 py-2.5 flex flex-col items-center justify-center text-center gap-1 cursor-pointer transition-colors ${
        placed ? 'border-solid' : 'border-dashed'
      } ${isWrong ? 'game-shake' : ''}`}
      style={{
        backgroundColor: bgColor,
        borderColor,
      }}
    >
      <span
        className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold"
        style={{ color: isWrong ? '#DC2626' : placed ? accentText : 'var(--text-muted)' }}
      >
        {icon}
        <span>{label}</span>
      </span>

      {placed ? (
        <>
          <span
            dir="rtl"
            className="font-arabic text-lg sm:text-xl leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {placed.nameAr}
          </span>
          <span
            className="text-xs sm:text-sm font-extrabold leading-tight line-clamp-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {placed.shortNameTr}
          </span>
          {isCleared && (
            <span
              className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              {placed.no}. Sure
            </span>
          )}
        </>
      ) : (
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {isHighlighted ? 'Buraya bırak' : 'Boş yuva'}
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

  // Tek oyuncu durumu
  const usedSingleRef = useRef<Set<number>>(new Set());
  const [singleRoundIdx, setSingleRoundIdx] = useState<number>(0);
  const [singleRound, setSingleRound] = useState<ChainRoundData>(() =>
    generateChainRound(0, tierId, tierSurahs, allSurahsMap, usedSingleRef.current),
  );
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // İkili Düello (Eşzamanlı Bölünmüş Ekran) durumları
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
            ? `Tur ${Math.min(TOTAL_CALM_ROUNDS, Math.max(p1Idx, p2Idx) + 1)}/${TOTAL_CALM_ROUNDS}`
            : `Tur ${Math.min(TOTAL_CALM_ROUNDS, singleRoundIdx + 1)}/${TOTAL_CALM_ROUNDS}`
          : `${isDuel ? p1Correct + p2Correct : correctCount} Tur`,
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
    setCombo(0);
  }, []);

  const handleSingleCleared = useCallback(
    (hadMistake: boolean) => {
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

      if (tempo === 'calm' && nextIdx >= TOTAL_CALM_ROUNDS) {
        finishGame({
          score: nextScore,
          maxCombo: nextMaxCombo,
          correctCount: nextCorrect,
          mistakeCount,
          elapsedSec,
          p1Score: 0,
          p2Score: 0,
          p1Correct: 0,
          p2Correct: 0,
        });
        return;
      }

      setSingleRoundIdx(nextIdx);
      setSingleRound(
        generateChainRound(nextIdx, tierId, tierSurahs, allSurahsMap, usedSingleRef.current),
      );
    },
    [
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
    (player: 'p1' | 'p2', hadMistake: boolean) => {
      const pts = hadMistake ? 15 : 22;

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
              score: nextP1Score + p2Score,
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
              score: p1Score + nextP2Score,
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
      <div className="flex-1 min-h-0 w-full max-w-[1440px] mx-auto px-3 py-2.5 grid grid-cols-2 gap-3 overflow-hidden">
        <div
          className="min-h-0 flex flex-col rounded-2xl border p-3 overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'rgba(13, 148, 136, 0.35)',
          }}
        >
          <ChainBoard
            boardId="p1"
            accentColor="#0D9488"
            accentSoft="var(--brand-primary-soft)"
            accentText="var(--brand-primary-text)"
            headerLabel="1. Oyuncu · Zümrüt"
            headerScore={p1Score}
            round={p1Round}
            roundNumber={p1Idx + 1}
            totalRoundsLabel={
              tempo === 'calm' ? `${Math.min(TOTAL_CALM_ROUNDS, p1Idx + 1)}/${TOTAL_CALM_ROUNDS}` : `${p1Correct} Tur`
            }
            isFinished={p1Done}
            onRoundCleared={(hadMistake) => handleDuelCleared('p1', hadMistake)}
            onMistakeStep={handleRecordMistake}
          />
        </div>

        <div
          className="min-h-0 flex flex-col rounded-2xl border p-3 overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'rgba(217, 119, 6, 0.38)',
          }}
        >
          <ChainBoard
            boardId="p2"
            accentColor="#D97706"
            accentSoft="var(--brand-accent-soft)"
            accentText="var(--brand-accent-text)"
            headerLabel="2. Oyuncu · Kehribar"
            headerScore={p2Score}
            round={p2Round}
            roundNumber={p2Idx + 1}
            totalRoundsLabel={
              tempo === 'calm' ? `${Math.min(TOTAL_CALM_ROUNDS, p2Idx + 1)}/${TOTAL_CALM_ROUNDS}` : `${p2Correct} Tur`
            }
            isFinished={p2Done}
            onRoundCleared={(hadMistake) => handleDuelCleared('p2', hadMistake)}
            onMistakeStep={handleRecordMistake}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full max-w-3xl mx-auto px-2.5 sm:px-5 py-2.5 sm:py-4 flex flex-col overflow-hidden">
      <ChainBoard
        boardId="single"
        accentColor="var(--brand-primary)"
        accentSoft="var(--brand-primary-soft)"
        accentText="var(--brand-primary-text)"
        round={singleRound}
        roundNumber={singleRoundIdx + 1}
        totalRoundsLabel={tempo === 'calm' ? String(TOTAL_CALM_ROUNDS) : ''}
        onRoundCleared={(hadMistake) => handleSingleCleared(hadMistake)}
        onMistakeStep={handleRecordMistake}
      />
    </div>
  );
};
