import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  GripVertical,
  Layers,
  ShieldAlert,
  Sparkles,
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
import { StagePromptBanner } from './StagePromptBanner';
import { useManagedTimeouts } from './useManagedTimeouts';

type FamilyRoundKind = 'odd_one_out' | 'find_member' | 'chest_sort';

interface QuizRoundData {
  id: string;
  kind: 'odd_one_out' | 'find_member';
  group: SurahGroupCatalogItem;
  prompt: string;
  options: EnrichedGameSurah[];
  correctSurahNo: number;
  explanation: string;
}

interface ChestItem {
  surah: EnrichedGameSurah;
  targetGroupId: SurahGroupId;
}

interface ChestSortRoundData {
  id: string;
  kind: 'chest_sort';
  groups: SurahGroupCatalogItem[];
  items: ChestItem[];
}

type FamilyRoundData = QuizRoundData | ChestSortRoundData;

const TOTAL_CALM_ROUNDS = 6;
const TIMED_LIMIT_SEC = 75;

function pickGroupForRound(
  roundIndex: number,
  focusGroupId: SurahGroupId | null | undefined,
  usedGroupIds: Set<SurahGroupId>,
  minMembers = 2,
): SurahGroupCatalogItem {
  if (focusGroupId && roundIndex === 0) {
    const focused = SURAH_GROUP_BY_ID[focusGroupId];
    if (focused && focused.surahs.length >= minMembers) {
      usedGroupIds.add(focused.id);
      return focused;
    }
  }
  const eligible = SURAH_GROUP_ATLAS.filter((g) => g.surahs.length >= minMembers);
  const fresh = eligible.filter((g) => !usedGroupIds.has(g.id));
  const pool = fresh.length > 0 ? fresh : eligible;
  const chosen = pool[Math.floor(Math.random() * pool.length)] ?? SURAH_GROUP_ATLAS[0];
  usedGroupIds.add(chosen.id);
  return chosen;
}

function buildChestSortRound(
  roundIndex: number,
  focusGroupId: SurahGroupId | null | undefined,
  allSurahsMap: Map<number, EnrichedGameSurah>,
  chestCount: 2 | 3,
): ChestSortRoundData {
  // Çakışmasız (ortak üyesi olmayan) kartlarla 2 veya 3 sandık kur
  const preferredPool = focusGroupId
    ? [
        SURAH_GROUP_BY_ID[focusGroupId],
        ...shuffleArray(SURAH_GROUP_ATLAS.filter((g) => g.id !== focusGroupId)),
      ]
    : shuffleArray(SURAH_GROUP_ATLAS);

  const selectedGroups: SurahGroupCatalogItem[] = [];
  for (const g of preferredPool) {
    if (selectedGroups.length >= chestCount) break;
    if (g.surahs.length < 2) continue;
    // Seçili diğer sandıklarla ayrık en az 2 üyesi olsun
    const exclusiveCount = g.surahs.filter((no) =>
      selectedGroups.every((other) => !other.surahs.includes(no)),
    ).length;
    if (exclusiveCount >= 2) {
      selectedGroups.push(g);
    }
  }

  const finalGroups =
    selectedGroups.length >= 2
      ? selectedGroups
      : [SURAH_GROUP_BY_ID.hawamim, SURAH_GROUP_BY_ID.hamidat];

  const perChest = finalGroups.length === 3 ? 2 : 3;
  const items: ChestItem[] = [];
  const usedNos = new Set<number>();

  for (const group of finalGroups) {
    // Sadece bu gruba ait (diğer aktif sandıklarda olmayan) sureleri seç
    const exclusiveNos = shuffleArray(
      group.surahs.filter(
        (no) =>
          !usedNos.has(no) &&
          finalGroups.every((other) => other.id === group.id || !other.surahs.includes(no)),
      ),
    );

    let added = 0;
    for (const no of exclusiveNos) {
      if (added >= perChest) break;
      const surah = allSurahsMap.get(no);
      if (!surah) continue;
      usedNos.add(no);
      items.push({ surah, targetGroupId: group.id });
      added += 1;
    }
  }

  return {
    id: `chest-${roundIndex}-${finalGroups.map((g) => g.id).join('_')}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'chest_sort',
    groups: finalGroups,
    items: shuffleArray(items),
  };
}

function generateFamilyRound(
  roundIndex: number,
  focusGroupId: SurahGroupId | null | undefined,
  tierId: GameComponentProps['tierId'],
  allSurahsMap: Map<number, EnrichedGameSurah>,
  usedGroupIds: Set<SurahGroupId>,
): FamilyRoundData {
  // 3 mekaniği akıcı biçimde döndür: Odd One Out -> Find Member -> Chest Sort
  const pattern: FamilyRoundKind[] = ['odd_one_out', 'find_member', 'chest_sort'];
  let kind = pattern[roundIndex % pattern.length];

  // Tabaraka (2 sure) odaklıysa ilk turda Odd One Out yerine Find Member kullan
  if (
    roundIndex === 0 &&
    focusGroupId === 'tabaraka' &&
    kind === 'odd_one_out'
  ) {
    kind = 'find_member';
  }

  if (kind === 'chest_sort') {
    const isWide = typeof window !== 'undefined' && window.innerWidth >= 768;
    const chestCount: 2 | 3 =
      isWide && (tierId === 'kademe_4' || tierId === 'kademe_6') ? 3 : 2;
    return buildChestSortRound(roundIndex, focusGroupId, allSurahsMap, chestCount);
  }

  const allSurahs = Array.from(allSurahsMap.values());

  if (kind === 'odd_one_out') {
    const group = pickGroupForRound(roundIndex, focusGroupId, usedGroupIds, 3);
    const members = shuffleArray(group.surahs)
      .slice(0, 3)
      .map((no) => allSurahsMap.get(no))
      .filter((s): s is EnrichedGameSurah => Boolean(s));

    // Öğretici çeldirici seç
    const smartPool = group.smartDistractors
      .filter((no) => !group.surahs.includes(no))
      .map((no) => allSurahsMap.get(no))
      .filter((s): s is EnrichedGameSurah => Boolean(s));
    const fallbackPool = shuffleArray(allSurahs.filter((s) => !group.surahs.includes(s.no)));
    const distractor =
      smartPool[Math.floor(Math.random() * smartPool.length)] ?? fallbackPool[0];

    const options = shuffleArray([...members, distractor]);
    const explanation = explainWhyNotInGroup(distractor.no, distractor.shortNameTr, group);

    return {
      id: `odd-${roundIndex}-${group.id}-${distractor.no}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'odd_one_out',
      group,
      prompt: `Aşağıdakilerden hangisi "${group.title}" grubundan DEĞİLDİR?`,
      options,
      correctSurahNo: distractor.no,
      explanation,
    };
  }

  // Tur Tipi B: Hangisi Bu Ailedendir?
  const group = pickGroupForRound(roundIndex, focusGroupId, usedGroupIds, 2);
  const memberNo = group.surahs[Math.floor(Math.random() * group.surahs.length)];
  const correctSurah = allSurahsMap.get(memberNo) ?? allSurahs[0];

  const distractorNos = new Set<number>();
  for (const no of shuffleArray(group.smartDistractors)) {
    if (distractorNos.size >= 3) break;
    if (!group.surahs.includes(no) && allSurahsMap.has(no)) distractorNos.add(no);
  }
  for (const s of shuffleArray(allSurahs)) {
    if (distractorNos.size >= 3) break;
    if (!group.surahs.includes(s.no)) distractorNos.add(s.no);
  }

  const distractors = Array.from(distractorNos)
    .map((no) => allSurahsMap.get(no))
    .filter((s): s is EnrichedGameSurah => Boolean(s))
    .slice(0, 3);

  const memberNames = group.surahs
    .map((no) => `${no}. ${allSurahsMap.get(no)?.shortNameTr ?? no}`)
    .slice(0, 7)
    .join(', ');

  return {
    id: `mem-${roundIndex}-${group.id}-${correctSurah.no}-${Math.random().toString(36).slice(2, 5)}`,
    kind: 'find_member',
    group,
    prompt: `Aşağıdakilerden hangisi "${group.title}" grubundandır?`,
    options: shuffleArray([correctSurah, ...distractors]),
    correctSurahNo: correctSurah.no,
    explanation: `${correctSurah.no}. ${correctSurah.shortNameTr}, ${group.shortLabel} üyesidir. Üyeler: ${memberNames}${group.surahs.length > 7 ? '...' : ''}.`,
  };
}

interface FloatingDrag {
  pointerId: number;
  surah: EnrichedGameSurah;
  x: number;
  y: number;
}

export const SurahFamiliesGame: React.FC<GameComponentProps> = ({
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
  const [round, setRound] = useState<FamilyRoundData>(() =>
    generateFamilyRound(0, focusGroupId, tierId, allSurahsMap, usedGroupsRef.current),
  );

  // Quiz (Type A & B) durumları
  const [quizSolved, setQuizSolved] = useState<{
    actor: 'p1' | 'p2';
    pickedNo: number;
    isCorrect: boolean;
  } | null>(null);
  const [wrongOptionNo, setWrongOptionNo] = useState<number | null>(null);

  // Sandık Tasnifi (Type C) durumları
  const [sortedMap, setSortedMap] = useState<Record<number, SurahGroupId>>({});
  const [selectedCardNo, setSelectedCardNo] = useState<number | null>(null);
  const [wrongChestId, setWrongChestId] = useState<SurahGroupId | null>(null);
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
        gameId: 'families',
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

  const advanceRound = useCallback(() => {
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
    setRound(
      generateFamilyRound(nextIdx, focusGroupId, tierId, allSurahsMap, usedGroupsRef.current),
    );
    setQuizSolved(null);
    setWrongOptionNo(null);
    setSortedMap({});
    setSelectedCardNo(null);
    setWrongChestId(null);
    setDragState(null);
    setFeaturedSurah(null);
    setFeaturedNote(undefined);
    if (isDuel) {
      setActivePlayer(nextIdx % 2 === 0 ? 'p1' : 'p2');
    }
  }, [
    allSurahsMap,
    elapsedSec,
    finishGame,
    focusGroupId,
    isDuel,
    maxCombo,
    mistakeCount,
    p1Correct,
    p1Score,
    p2Correct,
    p2Score,
    roundIdx,
    tempo,
    tierId,
  ]);

  const handleQuizAnswer = useCallback(
    (option: EnrichedGameSurah, actor: 'p1' | 'p2') => {
      if (round.kind === 'chest_sort' || quizSolved || finishedRef.current) return;

      setMovesCount((prev) => prev + 1);
      const isCorrect = option.no === round.correctSurahNo;
      const correctSurah =
        round.options.find((o) => o.no === round.correctSurahNo) ?? option;

      if (isCorrect) {
        const pts = 25;
        setQuizSolved({ actor, pickedNo: option.no, isCorrect: true });
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
        setFeaturedSurah(correctSurah);
        setFeaturedNote(round.explanation);
      } else {
        setWrongOptionNo(option.no);
        gameAudioService.playWrong();
        setCombo(0);
        setMistakeCount((prev) => prev + 1);
        mistakenMapRef.current.set(option.no, option);
        mistakenMapRef.current.set(correctSurah.no, correctSurah);
        setQuizSolved({ actor, pickedNo: option.no, isCorrect: false });
        setFeaturedSurah(correctSurah);
        setFeaturedNote(round.explanation);
        scheduleTimeout(() => setWrongOptionNo(null), 500);
      }
    },
    [combo, quizSolved, round, scheduleTimeout],
  );

  // Sandığa yerleştirme kontrolü (Type C)
  const placeCardInChest = useCallback(
    (surahNo: number, chestGroupId: SurahGroupId) => {
      if (round.kind !== 'chest_sort' || finishedRef.current) return;
      const item = round.items.find((i) => i.surah.no === surahNo);
      if (!item || sortedMap[surahNo]) return;

      setMovesCount((prev) => prev + 1);
      const actor = isDuel ? activePlayer : 'p1';

      if (item.targetGroupId === chestGroupId) {
        const nextMap = { ...sortedMap, [surahNo]: chestGroupId };
        setSortedMap(nextMap);
        setSelectedCardNo(null);

        const nextCombo = actor === 'p1' ? combo + 1 : combo;
        if (actor === 'p1') {
          setCombo(nextCombo);
          setMaxCombo((prev) => Math.max(prev, nextCombo));
          setP1Score((prev) => prev + 12);
          setP1Correct((prev) => prev + 1);
        } else {
          setP2Score((prev) => prev + 12);
          setP2Correct((prev) => prev + 1);
        }
        gameAudioService.playMatch(Math.max(1, nextCombo));

        const targetGroup = SURAH_GROUP_BY_ID[chestGroupId];
        setFeaturedSurah(item.surah);
        setFeaturedNote(
          `${item.surah.no}. ${item.surah.shortNameTr} → ${targetGroup.shortLabel} sandığına yerleşti (+12p).`,
        );

        if (isDuel) {
          setActivePlayer((prev) => (prev === 'p1' ? 'p2' : 'p1'));
        }

        if (Object.keys(nextMap).length >= round.items.length) {
          scheduleTimeout(() => {
            advanceRound();
          }, 680);
        }
      } else {
        setWrongChestId(chestGroupId);
        gameAudioService.playWrong();
        setCombo(0);
        setMistakeCount((prev) => prev + 1);
        mistakenMapRef.current.set(item.surah.no, item.surah);
        const wrongGroup = SURAH_GROUP_BY_ID[chestGroupId];
        setFeaturedSurah(item.surah);
        setFeaturedNote(explainWhyNotInGroup(item.surah.no, item.surah.shortNameTr, wrongGroup));
        scheduleTimeout(() => setWrongChestId(null), 480);
      }
    },
    [activePlayer, advanceRound, combo, isDuel, round, scheduleTimeout, sortedMap],
  );

  // Pointer Sürükle-Bırak (Type C)
  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    surah: EnrichedGameSurah,
  ) => {
    if (sortedMap[surah.no]) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragState({ pointerId: e.pointerId, surah, x: e.clientX, y: e.clientY });
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const origin = dragOriginRef.current;
    if (origin && !origin.moved && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8) {
      origin.moved = true;
    }
    if (origin?.moved) {
      setDragState((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
    }
  };

  const handleCardPointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    surah: EnrichedGameSurah,
  ) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const wasMoved = Boolean(dragOriginRef.current?.moved);
    setDragState(null);
    dragOriginRef.current = null;

    if (!wasMoved) {
      gameAudioService.playFlip();
      setSelectedCardNo((prev) => (prev === surah.no ? null : surah.no));
      return;
    }

    const els = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of els) {
      const chestId = (el as HTMLElement).dataset?.chestId as SurahGroupId | undefined;
      if (chestId) {
        placeCardInChest(surah.no, chestId);
        return;
      }
    }
  };

  // HUD senkronizasyonu
  useEffect(() => {
    const remaining = Math.max(0, TIMED_LIMIT_SEC - elapsedSec);
    const statusMessage =
      round.kind === 'chest_sort'
        ? selectedCardNo !== null
          ? 'Şimdi bu surenin ait olduğu altın aile sandığına dokunun.'
          : isDuel
            ? `${activePlayer === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} sırada: sureyi doğru sandığa yerleştir.`
            : 'Sure kartlarını sürükleyerek veya dokunarak doğru aile sandığına yerleştirin.'
        : quizSolved
          ? 'Açıklamayı inceleyip sonraki tura geçebilirsiniz.'
          : isDuel
            ? `${activePlayer === 'p1' ? '1. Oyuncu' : '2. Oyuncu'} sırada: doğru kartı seç.`
            : round.kind === 'odd_one_out'
              ? 'Gruba ait OLMAYAN çeldirici sureyi bul.'
              : 'Bu sure ailesinin gerçek üyesini seç.';

    onHudUpdate({
      score: p1Score,
      p1Score,
      p2Score,
      activeTurn: !isDuel ? 'p1' : activePlayer,
      combo,
      movesCount,
      progressLabel:
        tempo === 'calm'
          ? `${Math.min(TOTAL_CALM_ROUNDS, roundIdx + 1)}/${TOTAL_CALM_ROUNDS}`
          : `Tur ${roundIdx + 1}`,
      elapsedSec,
      timerText: tempo === 'timed' ? formatClock(remaining) : formatClock(elapsedSec),
      timerUrgent: tempo === 'timed' && remaining <= 12,
      turnRemainingSec: tempo === 'timed' ? remaining : null,
      turnDurationSec: TIMED_LIMIT_SEC,
      statusMessage,
      featuredSurah,
      featuredNote,
      roundContextTitle:
        round.kind === 'chest_sort' ? 'Aile Sandıkları Tasnifi' : round.group.title,
      roundContextHint:
        round.kind === 'chest_sort'
          ? 'Her sureyi ait olduğu Ulûmu’l-Kur’ân aile sandığına sürükleyin veya dokunup yerleştirin.'
          : round.group.description,
    });
  }, [
    activePlayer,
    combo,
    elapsedSec,
    featuredNote,
    featuredSurah,
    isDuel,
    movesCount,
    onHudUpdate,
    p1Score,
    p2Score,
    quizSolved,
    round,
    roundIdx,
    selectedCardNo,
    tempo,
  ]);

  const sortedCount = Object.keys(sortedMap).length;
  const remainingChestItems = useMemo(() => {
    if (round.kind !== 'chest_sort') return [];
    return round.items.filter((i) => !sortedMap[i.surah.no]);
  }, [round, sortedMap]);

  const roundProgressLabel =
    tempo === 'calm' ? `Tur ${roundIdx + 1}/${TOTAL_CALM_ROUNDS}` : `Tur ${roundIdx + 1}`;

  return (
    <div className="flex-1 min-h-full lg:min-h-0 flex flex-col justify-center gap-3.5 sm:gap-5 relative">
      {/* Üst Görev & Soru Şeridi */}
      {round.kind !== 'chest_sort' ? (
        <StagePromptBanner
          badgeIcon={
            round.kind === 'odd_one_out' ? (
              <ShieldAlert className="w-3.5 h-3.5" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )
          }
          badgeLabel={round.kind === 'odd_one_out' ? 'Çeldiriciyi Yakala' : 'Üyeyi Tanı'}
          arabicAccent={round.group.arabicTitle}
          prompt={round.prompt}
          secondaryBadge={round.group.badgeText}
          progressBadge={roundProgressLabel}
        />
      ) : (
        <StagePromptBanner
          badgeIcon={<Layers className="w-3.5 h-3.5" />}
          badgeLabel="Aile Sandıkları"
          prompt="Sure kartlarını ait oldukları Ulûmu’l-Kur’ân sandıklarına yerleştirin"
          secondaryBadge={`${sortedCount}/${round.items.length}`}
          progressBadge={roundProgressLabel}
        />
      )}

      {/* TUR TİPİ A & B: ÇELDİRİCİ / ÜYE TANIMA */}
      {round.kind !== 'chest_sort' ? (
        <div className="flex flex-col justify-center gap-3 sm:gap-4 max-w-3xl w-full mx-auto">
          {/* #1..#4 Numaralı 3B Parşömen Kartlar */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
            {round.options.map((opt, idx) => {
              const isTarget = opt.no === round.correctSurahNo;
              const isRevealedCorrect = Boolean(quizSolved && isTarget);
              const isPickedWrong = Boolean(
                quizSolved && !quizSolved.isCorrect && quizSolved.pickedNo === opt.no,
              );

              const cardStyle =
                isPickedWrong || wrongOptionNo === opt.no
                  ? 'bg-red-800 border-2 border-red-400 border-b-4 border-b-red-950 text-white game-shake'
                  : isRevealedCorrect
                    ? 'game-bevel-emerald game-pop'
                    : 'game-bevel-parchment hover:brightness-[1.02]';

              return (
                <button
                  key={opt.no}
                  type="button"
                  disabled={Boolean(quizSolved)}
                  onClick={() => handleQuizAnswer(opt, !isDuel ? 'p1' : activePlayer)}
                  className={`min-h-[124px] sm:min-h-[154px] rounded-2xl p-3 sm:p-4 flex flex-col justify-between text-center cursor-pointer transition-all select-none ${cardStyle}`}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    <span
                      className={`text-[11px] sm:text-xs font-black tabular-nums px-2 py-0.5 rounded-md ${
                        isRevealedCorrect
                          ? 'bg-white/15 text-amber-200'
                          : isPickedWrong
                            ? 'bg-white/20 text-white'
                            : 'bg-amber-900/12 text-slate-600'
                      }`}
                    >
                      #{idx + 1} · {opt.no}. Sure
                    </span>
                    {isRevealedCorrect && (
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-black ${
                          isDuel && quizSolved?.isCorrect
                            ? quizSolved.actor === 'p2'
                              ? 'bg-amber-400 text-amber-950'
                              : 'bg-teal-200 text-teal-950'
                            : 'bg-emerald-400/25 text-emerald-100'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        {isDuel && quizSolved?.isCorrect
                          ? quizSolved.actor === 'p1'
                            ? 'P1'
                            : 'P2'
                          : 'DOĞRU'}
                      </span>
                    )}
                  </div>

                  <div className="my-auto py-1.5 space-y-1">
                    <div
                      dir="rtl"
                      className={`font-arabic text-2xl sm:text-3xl lg:text-[32px] leading-snug ${
                        isRevealedCorrect || isPickedWrong ? 'text-amber-200' : 'text-teal-900'
                      }`}
                    >
                      {opt.nameAr}
                    </div>
                    <div
                      className={`text-base sm:text-lg lg:text-xl font-black ${
                        isRevealedCorrect || isPickedWrong ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {opt.shortNameTr}
                    </div>
                    <div
                      className={`text-xs sm:text-sm lg:text-[15px] font-medium line-clamp-2 ${
                        isRevealedCorrect || isPickedWrong ? 'text-teal-100' : 'text-slate-600'
                      }`}
                    >
                      “{opt.meaningTr}”
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Çözüm Sonrası Açıklama & Devam Şeridi */}
          {quizSolved && (
            <div className="shrink-0 rounded-2xl bg-black/25 border border-amber-300/45 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-white">
              <p className="text-sm sm:text-[15px] font-semibold leading-snug">
                {round.explanation}
              </p>
              <button
                type="button"
                onClick={advanceRound}
                className="w-full sm:w-auto min-h-[42px] px-4 rounded-xl font-extrabold text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}
              >
                <span>Sonraki Tur</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* TUR TİPİ C: AİLE SANDIKLARINA TASNİF */
        <div className="flex flex-col justify-center gap-3 sm:gap-4">
          {/* Üst: Altın Çerçeveli Aile Sandıkları */}
          <div
            className={`grid ${
              round.groups.length === 3
                ? 'grid-cols-3 gap-2 sm:gap-3'
                : 'grid-cols-2 gap-2.5 sm:gap-3.5'
            }`}
          >
            {round.groups.map((grp) => {
              const placedInThis = round.items.filter(
                (item) => sortedMap[item.surah.no] === grp.id,
              );
              const isWrongHere = wrongChestId === grp.id;
              const isHighlighted = selectedCardNo !== null;

              return (
                <button
                  key={grp.id}
                  type="button"
                  data-chest-id={grp.id}
                  onClick={() => {
                    if (selectedCardNo !== null) {
                      placeCardInChest(selectedCardNo, grp.id);
                    }
                  }}
                  className={`min-h-[144px] sm:min-h-[184px] rounded-2xl border-2 p-3 sm:p-4 flex flex-col justify-between gap-2.5 text-left transition-all cursor-pointer ${
                    isWrongHere
                      ? 'bg-red-900/75 border-red-400 text-white game-shake'
                      : isHighlighted
                        ? 'bg-amber-400/22 border-amber-300 border-dashed text-white'
                        : 'bg-black/22 border-amber-200/45 border-dashed text-white'
                  }`}
                >
                  <div className="space-y-1 shrink-0">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-amber-400 text-amber-950 truncate">
                        {grp.badgeText}
                      </span>
                      <span
                        dir="rtl"
                        className="font-arabic text-base sm:text-xl text-amber-200 shrink-0"
                      >
                        {grp.arabicTitle}
                      </span>
                    </div>
                    <div className="text-sm sm:text-base lg:text-lg font-extrabold leading-snug">
                      {grp.shortLabel}
                    </div>
                  </div>

                  {/* Sandığa Yerleşen Kartlar */}
                  <div className="flex-1 flex flex-wrap content-start gap-1.5">
                    {placedInThis.length === 0 ? (
                      <span className="text-xs sm:text-sm font-semibold text-amber-100/75 self-center mx-auto text-center py-2">
                        {isHighlighted ? 'Buraya bırak' : 'Sureleri buraya taşı'}
                      </span>
                    ) : (
                      placedInThis.map((placed) => (
                        <span
                          key={placed.surah.no}
                          className="game-bevel-emerald px-2.5 py-1 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1 game-pop"
                        >
                          <Check className="w-3.5 h-3.5 text-amber-300" strokeWidth={3} />
                          <span>
                            {placed.surah.no}. {placed.surah.shortNameTr}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Alt: #1..#6 Numaralı 3B Parşömen Sure Kartları (Mobil 2 kolon, SM+ 3 kolon) */}
          <div className="shrink-0 rounded-2xl bg-black/20 border border-white/15 p-2.5 sm:p-3 space-y-2">
            <div className="text-xs sm:text-sm font-semibold text-white/90 px-0.5">
              {selectedCardNo !== null
                ? 'Şimdi yukarıdaki ilgili aile sandığına dokunun'
                : 'Sureyi sürükleyip bırakın veya dokunup sandığı seçin'}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
              {round.items.map((item, idx) => {
                const isPlaced = Boolean(sortedMap[item.surah.no]);
                const isSelected = selectedCardNo === item.surah.no;
                const isDraggingThis =
                  dragState?.surah.no === item.surah.no && Boolean(dragOriginRef.current?.moved);

                return (
                  <button
                    key={item.surah.no}
                    type="button"
                    disabled={isPlaced}
                    onPointerDown={(e) => handleCardPointerDown(e, item.surah)}
                    onPointerMove={handleCardPointerMove}
                    onPointerUp={(e) => handleCardPointerUp(e, item.surah)}
                    onPointerCancel={() => {
                      setDragState(null);
                      dragOriginRef.current = null;
                    }}
                    style={{
                      touchAction: 'none',
                      opacity: isPlaced ? 0.28 : isDraggingThis ? 0.45 : 1,
                    }}
                    className={`${
                      isSelected
                        ? 'game-bevel-amber ring-2 ring-amber-300'
                        : 'game-bevel-parchment hover:brightness-[1.02]'
                    } min-h-[62px] sm:min-h-[70px] rounded-xl px-2.5 py-2 flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing select-none transition-opacity`}
                  >
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-[11px] font-black tabular-nums text-slate-600">
                        #{idx + 1}
                      </span>
                      <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0 text-center">
                      <div
                        dir="rtl"
                        className="font-arabic text-xl sm:text-2xl lg:text-[26px] leading-snug text-teal-900 truncate"
                      >
                        {item.surah.nameAr}
                      </div>
                      <div className="text-sm sm:text-base lg:text-[17px] font-bold text-slate-900 truncate">
                        {item.surah.shortNameTr}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {remainingChestItems.length === 0 && (
              <div className="text-center text-sm font-extrabold text-amber-200 pt-1">
                Tüm sureler doğru sandıklara yerleşti!
              </div>
            )}
          </div>
        </div>
      )}

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
