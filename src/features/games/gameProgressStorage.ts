import type { GameId, GameTierId } from './gameTypes';

const PROGRESS_STORAGE_KEY = 'muallimun_games_progress_v1';

export interface GameTierProgressEntry {
  bestStars: 1 | 2 | 3;
  highScore: number;
  bestAccuracyPct: number;
  playsCount: number;
  lastPlayedAt: string;
}

export type GameProgressMap = Record<string, GameTierProgressEntry>;

const ALL_GAME_IDS: readonly GameId[] = ['memory', 'chain', 'speed', 'compass', 'detective'];

export function makeGameProgressKey(gameId: GameId, tierId: GameTierId): string {
  return `${gameId}:${tierId}`;
}

export function loadGameProgress(): GameProgressMap {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as GameProgressMap;
  } catch {
    return {};
  }
}

export function saveGameProgressResult(input: {
  gameId: GameId;
  tierId: GameTierId;
  stars: 1 | 2 | 3;
  score: number;
  accuracyPct: number;
}): { map: GameProgressMap; isNewRecord: boolean } {
  const current = loadGameProgress();
  const key = makeGameProgressKey(input.gameId, input.tierId);
  const prev = current[key];

  const isNewRecord = !prev || input.score > prev.highScore;
  const nextEntry: GameTierProgressEntry = {
    bestStars: prev ? (Math.max(prev.bestStars, input.stars) as 1 | 2 | 3) : input.stars,
    highScore: prev ? Math.max(prev.highScore, input.score) : input.score,
    bestAccuracyPct: prev
      ? Math.max(prev.bestAccuracyPct, input.accuracyPct)
      : input.accuracyPct,
    playsCount: (prev?.playsCount ?? 0) + 1,
    lastPlayedAt: new Date().toISOString(),
  };

  const nextMap: GameProgressMap = {
    ...current,
    [key]: nextEntry,
  };

  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(nextMap));
  } catch {
    // Depolama doluysa sessiz geç
  }

  return { map: nextMap, isNewRecord };
}

export function getTierEarnedStars(map: GameProgressMap, tierId: GameTierId): number {
  return ALL_GAME_IDS.reduce(
    (acc, g) => acc + (map[makeGameProgressKey(g, tierId)]?.bestStars ?? 0),
    0,
  );
}

export function getTotalEarnedGameStars(map: GameProgressMap): number {
  return Object.values(map).reduce((acc, entry) => acc + (entry?.bestStars ?? 0), 0);
}
