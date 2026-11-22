import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { GameArenaShell } from './GameArenaShell';
import { gameAudioService } from './gameAudioService';
import type { GameProgressMap } from './gameProgressStorage';
import { saveGameProgressResult } from './gameProgressStorage';
import { GameSummaryOverlay } from './GameSummaryOverlay';
import type {
  EnrichedGameSurah,
  GameHudUpdate,
  GameId,
  GamePlayerMode,
  GameResultPayload,
  GameTempo,
  GameTierId,
} from './gameTypes';
import { resolveTierSurahs } from './gameTypes';
import { GroupSequenceGame } from './GroupSequenceGame';
import { MemoryMatchGame } from './MemoryMatchGame';
import { MushafChainGame } from './MushafChainGame';
import { MushafCompassGame } from './MushafCompassGame';
import { SpeedMatchGame } from './SpeedMatchGame';
import { SurahDetectiveGame } from './SurahDetectiveGame';
import { SurahFamiliesGame } from './SurahFamiliesGame';
import type { SurahGroupId } from './surahSpecialGroups';
import { SURAH_GROUP_BY_ID } from './surahSpecialGroups';

interface GameStageModalProps {
  gameId: GameId;
  initialTierId: GameTierId;
  initialTempo: GameTempo;
  initialPlayerMode: GamePlayerMode;
  focusGroupId?: SurahGroupId | null;
  allSurahs: EnrichedGameSurah[];
  activePoolSurahNos: number[];
  onProgressUpdated: (nextMap: GameProgressMap) => void;
  onConfigSynced: (patch: {
    tierId?: GameTierId;
    tempo?: GameTempo;
    playerMode?: GamePlayerMode;
  }) => void;
  onClose: () => void;
}

const DEFAULT_HUD: GameHudUpdate = {
  score: 0,
  p1Score: 0,
  p2Score: 0,
  activeTurn: 'p1',
  combo: 0,
  movesCount: 0,
  progressLabel: '',
  elapsedSec: 0,
  timerText: '00:00',
  timerUrgent: false,
  turnRemainingSec: null,
  statusMessage: 'Oyuna başlamak için ilk hamlenizi yapın.',
  featuredSurah: null,
};

export const GameStageModal: React.FC<GameStageModalProps> = ({
  gameId,
  initialTierId,
  initialTempo,
  initialPlayerMode,
  focusGroupId = null,
  allSurahs,
  activePoolSurahNos,
  onProgressUpdated,
  onConfigSynced,
  onClose,
}) => {
  const { setIsExamActive, awardGameXp } = useAppStore();

  const [currentTierId, setCurrentTierId] = useState<GameTierId>(initialTierId);
  const [currentTempo, setCurrentTempo] = useState<GameTempo>(initialTempo);
  const [currentPlayerMode, setCurrentPlayerMode] = useState<GamePlayerMode>(initialPlayerMode);
  const [runNonce, setRunNonce] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(() => gameAudioService.isMuted());
  const [result, setResult] = useState<GameResultPayload | null>(null);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);
  const [hud, setHud] = useState<GameHudUpdate>(DEFAULT_HUD);

  useEffect(() => {
    setIsExamActive(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      setIsExamActive(false);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, setIsExamActive]);

  const allSurahsMap = useMemo(() => {
    const map = new Map<number, EnrichedGameSurah>();
    for (const s of allSurahs) map.set(s.no, s);
    return map;
  }, [allSurahs]);

  const tierSurahs = useMemo(
    () => resolveTierSurahs(currentTierId, allSurahs, activePoolSurahNos),
    [activePoolSurahNos, allSurahs, currentTierId],
  );

  const handleToggleMute = () => {
    const nextMuted = gameAudioService.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted) {
      gameAudioService.playFlip();
    }
  };

  const handleRestart = useCallback(() => {
    gameAudioService.playFlip();
    setResult(null);
    setIsNewRecord(false);
    setHud(DEFAULT_HUD);
    setRunNonce((n) => n + 1);
  }, []);

  const handleChangeConfig = useCallback(
    (patch: {
      tierId?: GameTierId;
      tempo?: GameTempo;
      playerMode?: GamePlayerMode;
    }) => {
      gameAudioService.playFlip();
      if (patch.tierId) setCurrentTierId(patch.tierId);
      if (patch.tempo) setCurrentTempo(patch.tempo);
      if (patch.playerMode) setCurrentPlayerMode(patch.playerMode);
      onConfigSynced(patch);
      setResult(null);
      setIsNewRecord(false);
      setHud(DEFAULT_HUD);
      setRunNonce((n) => n + 1);
    },
    [onConfigSynced],
  );

  const handleNextTier = useCallback(
    (nextTierId: GameTierId) => {
      handleChangeConfig({ tierId: nextTierId });
    },
    [handleChangeConfig],
  );

  const handleComplete = useCallback(
    (payload: GameResultPayload) => {
      setResult(payload);

      if (payload.playerMode !== 'duel') {
        const saved = saveGameProgressResult({
          gameId: payload.gameId,
          tierId: payload.tierId,
          stars: payload.stars,
          score: payload.score,
          accuracyPct: payload.accuracyPct,
        });
        setIsNewRecord(saved.isNewRecord);
        onProgressUpdated(saved.map);
      } else {
        setIsNewRecord(false);
      }

      awardGameXp(payload.earnedXp);
    },
    [awardGameXp, onProgressUpdated],
  );

  const focusGroupTitle = focusGroupId ? SURAH_GROUP_BY_ID[focusGroupId]?.title ?? null : null;
  const stageKey = `${gameId}-${currentTierId}-${currentTempo}-${currentPlayerMode}-${focusGroupId ?? 'all'}-${runNonce}`;

  return (
    <GameArenaShell
      gameId={gameId}
      tierId={currentTierId}
      tempo={currentTempo}
      playerMode={currentPlayerMode}
      focusGroupTitle={focusGroupTitle}
      isMuted={isMuted}
      isSummaryOpen={Boolean(result)}
      hud={hud}
      allSurahsMap={allSurahsMap}
      onToggleMute={handleToggleMute}
      onRestart={handleRestart}
      onChangeConfig={handleChangeConfig}
      onClose={onClose}
    >
      {result ? (
        <GameSummaryOverlay
          result={result}
          isNewRecord={isNewRecord}
          onReplay={handleRestart}
          onNextTier={handleNextTier}
          onExit={onClose}
        />
      ) : (
        <>
          {gameId === 'memory' && (
            <MemoryMatchGame
              key={stageKey}
              tierId={currentTierId}
              tempo={currentTempo}
              playerMode={currentPlayerMode}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
          {gameId === 'chain' && (
            <MushafChainGame
              key={stageKey}
              tierId={currentTierId}
              tempo={currentTempo}
              playerMode={currentPlayerMode}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
          {gameId === 'speed' && (
            <SpeedMatchGame
              key={stageKey}
              tierId={currentTierId}
              tempo={currentTempo}
              playerMode={currentPlayerMode}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
          {gameId === 'compass' && (
            <MushafCompassGame
              key={stageKey}
              tierId={currentTierId}
              tempo={currentTempo}
              playerMode={currentPlayerMode}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
          {gameId === 'detective' && (
            <SurahDetectiveGame
              key={stageKey}
              tierId={currentTierId}
              tempo={currentTempo}
              playerMode={currentPlayerMode}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
          {gameId === 'families' && (
            <SurahFamiliesGame
              key={stageKey}
              tierId={currentTierId}
              tempo={currentTempo}
              playerMode={currentPlayerMode}
              focusGroupId={focusGroupId}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
          {gameId === 'group_seq' && (
            <GroupSequenceGame
              key={stageKey}
              tierId={currentTierId}
              tempo={currentTempo}
              playerMode={currentPlayerMode}
              focusGroupId={focusGroupId}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
        </>
      )}
    </GameArenaShell>
  );
};
