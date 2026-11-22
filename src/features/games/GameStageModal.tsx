import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Flame,
  RotateCcw,
  Star,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
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
import { GAME_DEFINITIONS, GAME_TIERS, resolveTierSurahs } from './gameTypes';
import { MemoryMatchGame } from './MemoryMatchGame';
import { MushafChainGame } from './MushafChainGame';
import { SpeedMatchGame } from './SpeedMatchGame';

interface GameStageModalProps {
  gameId: GameId;
  initialTierId: GameTierId;
  tempo: GameTempo;
  playerMode: GamePlayerMode;
  allSurahs: EnrichedGameSurah[];
  activePoolSurahNos: number[];
  onProgressUpdated: (nextMap: GameProgressMap) => void;
  onTierChanged: (tierId: GameTierId) => void;
  onClose: () => void;
}

export const GameStageModal: React.FC<GameStageModalProps> = ({
  gameId,
  initialTierId,
  tempo,
  playerMode,
  allSurahs,
  activePoolSurahNos,
  onProgressUpdated,
  onTierChanged,
  onClose,
}) => {
  const { setIsExamActive, awardGameXp } = useAppStore();

  const [currentTierId, setCurrentTierId] = useState<GameTierId>(initialTierId);
  const [runNonce, setRunNonce] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(() => gameAudioService.isMuted());
  const [result, setResult] = useState<GameResultPayload | null>(null);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);
  const [hud, setHud] = useState<GameHudUpdate>({
    score: 0,
    combo: 0,
    progressLabel: '',
    timerText: '0:00',
    timerUrgent: false,
  });

  // Tam ekran oyun sahnesi açıkken gövde kaydırmasını ve mobil alt barı gizle
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

  const gameMeta = GAME_DEFINITIONS.find((g) => g.id === gameId);
  const tierMeta = GAME_TIERS.find((t) => t.id === currentTierId);

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
    setHud({
      score: 0,
      combo: 0,
      progressLabel: '',
      timerText: '0:00',
      timerUrgent: false,
    });
    setRunNonce((n) => n + 1);
  }, []);

  const handleNextTier = useCallback(
    (nextTierId: GameTierId) => {
      gameAudioService.playFlip();
      setCurrentTierId(nextTierId);
      onTierChanged(nextTierId);
      setResult(null);
      setIsNewRecord(false);
      setRunNonce((n) => n + 1);
    },
    [onTierChanged],
  );

  const handleComplete = useCallback(
    (payload: GameResultPayload) => {
      setResult(payload);

      if (payload.playerMode === 'single') {
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

  const stageKey = `${gameId}-${currentTierId}-${tempo}-${playerMode}-${runNonce}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${gameMeta?.title ?? 'Oyun'} Sahnesi`}
      className="fixed inset-0 z-50 w-full h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      {/* Tek İnce Üst HUD Barı (48px) */}
      <header
        className="shrink-0 h-12 px-2.5 sm:px-4 border-b flex items-center justify-between gap-2"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Sol: Çıkış + Oyun & Kademe */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-2.5 rounded-xl border inline-flex items-center gap-1 text-xs font-bold cursor-pointer shrink-0 transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Çık</span>
          </button>

          <div className="min-w-0 leading-tight">
            <div
              className="text-xs sm:text-sm font-extrabold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {gameMeta?.shortTitle}
            </div>
            <div
              className="text-[10px] sm:text-[11px] font-medium truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {tierMeta?.shortTitle}
              {playerMode === 'duel' ? ' · İkili Düello' : ''}
            </div>
          </div>
        </div>

        {/* Sağ: Süre + Kombo + Puan + Ses + Yeniden */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!result && (
            <>
              <div
                className="h-8 px-2 rounded-lg border inline-flex items-center gap-1 text-xs font-bold tabular-nums"
                style={{
                  backgroundColor: hud.timerUrgent
                    ? 'rgba(220, 38, 38, 0.12)'
                    : 'var(--bg-surface-soft)',
                  borderColor: hud.timerUrgent
                    ? 'rgba(220, 38, 38, 0.35)'
                    : 'var(--border-subtle)',
                  color: hud.timerUrgent ? '#DC2626' : 'var(--text-primary)',
                }}
                title="Süre"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>{hud.timerText}</span>
              </div>

              {playerMode === 'single' && hud.combo >= 2 && (
                <div
                  className="hidden sm:inline-flex h-8 px-2 rounded-lg border items-center gap-1 text-xs font-extrabold tabular-nums"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    borderColor: 'rgba(217, 119, 6, 0.3)',
                    color: 'var(--brand-accent-text)',
                  }}
                  title="Seri Çarpanı"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>{hud.combo}x</span>
                </div>
              )}

              {playerMode === 'single' && (
                <div
                  className="h-8 px-2 rounded-lg border inline-flex items-center gap-1 text-xs font-extrabold tabular-nums"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'rgba(13, 148, 136, 0.25)',
                    color: 'var(--brand-primary-text)',
                  }}
                  title="Puan"
                >
                  <Star className="w-3.5 h-3.5" fill="currentColor" />
                  <span>{hud.score}</span>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}
            title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
            className="w-9 h-9 rounded-xl border inline-flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: isMuted ? 'var(--text-muted)' : 'var(--text-primary)',
            }}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            aria-label="Yeniden başlat"
            title="Yeniden Başlat"
            className="w-9 h-9 rounded-xl border inline-flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Oyun Alanı veya Pedagojik Özet Ekranı */}
      {result ? (
        <GameSummaryOverlay
          result={result}
          isNewRecord={isNewRecord}
          onReplay={handleRestart}
          onNextTier={handleNextTier}
          onExit={onClose}
        />
      ) : (
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {gameId === 'memory' && (
            <MemoryMatchGame
              key={stageKey}
              tierId={currentTierId}
              tempo={tempo}
              playerMode={playerMode}
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
              tempo={tempo}
              playerMode={playerMode}
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
              tempo={tempo}
              playerMode={playerMode}
              tierSurahs={tierSurahs}
              allSurahsMap={allSurahsMap}
              onHudUpdate={setHud}
              onComplete={handleComplete}
            />
          )}
        </main>
      )}
    </div>
  );
};
