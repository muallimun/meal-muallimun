import type { GameId, GamePlayerMode, GameTierId } from './gameTypes';
import { sanitizePlayerMode } from './gameTypes';

const PROGRESS_STORAGE_KEY = 'muallimun_games_progress_v1';
const PLAYER_MODE_STORAGE_KEY = 'muallimun_games_player_mode_v1';

export interface GameTierProgressEntry {
  bestStars: 1 | 2 | 3;
  highScore: number;
  bestAccuracyPct: number;
  playsCount: number;
  lastPlayedAt: string;
}

export type GameProgressMap = Record<string, GameTierProgressEntry>;

const ALL_GAME_IDS: readonly GameId[] = [
  'memory',
  'chain',
  'speed',
  'compass',
  'detective',
  'families',
  'group_seq',
];

const ALL_GAME_ID_SET = new Set<string>(ALL_GAME_IDS);
const ALL_TIER_ID_SET = new Set<string>([
  'kademe_1',
  'kademe_2',
  'kademe_3',
  'kademe_4',
  'kademe_5',
  'kademe_6',
]);

export function loadGamePlayerMode(): GamePlayerMode {
  try {
    const raw = window.localStorage.getItem(PLAYER_MODE_STORAGE_KEY);
    const normalized = sanitizePlayerMode(raw);
    if (raw && raw !== normalized) {
      window.localStorage.setItem(PLAYER_MODE_STORAGE_KEY, normalized);
    }
    return normalized;
  } catch {
    return 'single';
  }
}

export function saveGamePlayerMode(mode: GamePlayerMode): void {
  try {
    window.localStorage.setItem(PLAYER_MODE_STORAGE_KEY, sanitizePlayerMode(mode));
  } catch {
    // Depolama erişilemezse sessiz geç
  }
}

export function makeGameProgressKey(gameId: GameId, tierId: GameTierId): string {
  return `${gameId}:${tierId}`;
}

export function loadGameProgress(): GameProgressMap {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const clean: GameProgressMap = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      const parts = key.split(':');
      if (parts.length !== 2) continue;
      const [gameId, tierId] = parts;
      if (!ALL_GAME_ID_SET.has(gameId) || !ALL_TIER_ID_SET.has(tierId)) continue;
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;

      const entry = val as Partial<GameTierProgressEntry>;
      const rawStars = entry.bestStars;
      if (rawStars !== 1 && rawStars !== 2 && rawStars !== 3) continue;

      const highScore = entry.highScore;
      if (typeof highScore !== 'number' || !Number.isFinite(highScore) || highScore < 0) continue;

      const bestAccuracyPct = entry.bestAccuracyPct;
      if (
        typeof bestAccuracyPct !== 'number' ||
        !Number.isFinite(bestAccuracyPct) ||
        bestAccuracyPct < 0 ||
        bestAccuracyPct > 100
      ) {
        continue;
      }

      const playsCount = entry.playsCount;
      if (
        typeof playsCount !== 'number' ||
        !Number.isFinite(playsCount) ||
        !Number.isInteger(playsCount) ||
        playsCount < 1
      ) {
        continue;
      }

      clean[key] = {
        bestStars: rawStars,
        highScore,
        bestAccuracyPct,
        playsCount,
        lastPlayedAt:
          typeof entry.lastPlayedAt === 'string' && entry.lastPlayedAt
            ? entry.lastPlayedAt
            : new Date(0).toISOString(),
      };
    }

    return clean;
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
