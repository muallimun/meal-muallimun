import type { SurahMeta } from '../../types/quran';
import type { MukattaaEntry, SpecialSurahFamilyInfo } from './surahSpecialGroups';
import {
  AMME_SURAH_NOS,
  FAMOUS_SURAH_NOS,
  NAMAZ_SURAH_NOS,
  SPECIAL_GROUPS_SURAH_NOS,
  getSurahFamilies,
  getSurahMukattaa,
  getSurahPrimarySpecialTrait,
} from './surahSpecialGroups';
import type { SurahExtraInfo } from '../../types/fihrist';

export type GameId = 'memory' | 'chain' | 'speed';

export type GameTierId =
  | 'kademe_1'
  | 'kademe_2'
  | 'kademe_3'
  | 'kademe_4'
  | 'kademe_5'
  | 'kademe_6';

export type GameTempo = 'calm' | 'timed';

export type GamePlayerMode = 'single' | 'duel';

export interface GameTierMeta {
  id: GameTierId;
  order: number;
  title: string;
  shortTitle: string;
  subtitle: string;
  surahCountLabel: string;
  isSpecialGroups?: boolean;
  isActivePool?: boolean;
}

export const GAME_TIERS: readonly GameTierMeta[] = [
  {
    id: 'kademe_1',
    order: 1,
    title: 'Namaz Sureleri',
    shortTitle: 'Namaz Sureleri',
    subtitle: 'Fâtiha ve Fîl–Nâs arası 11 temel sure',
    surahCountLabel: '11 Sure',
  },
  {
    id: 'kademe_2',
    order: 2,
    title: '30. Cüz (Amme Cüzü)',
    shortTitle: '30. Cüz (Amme)',
    subtitle: 'Nebe’den Nâs’a kısa sureler bütünü',
    surahCountLabel: '37 Sure',
  },
  {
    id: 'kademe_3',
    order: 3,
    title: 'Seçme Meşhur Sureler',
    shortTitle: 'Meşhur Sureler',
    subtitle: 'Yâsîn, Mülk, Kehf, Rahmân, Fetih ve seçkin sureler',
    surahCountLabel: '18 Sure',
  },
  {
    id: 'kademe_4',
    order: 4,
    title: 'Özel Sure Grupları',
    shortTitle: 'Özel Gruplar',
    subtitle: 'Havâmîm, Mukattaa, Müsebbihât, Hâmidât & Secde',
    surahCountLabel: 'Özel Müfredat',
    isSpecialGroups: true,
  },
  {
    id: 'kademe_5',
    order: 5,
    title: 'Aktif Çalışma Havuzum',
    shortTitle: 'Çalışma Havuzum',
    subtitle: 'Seçili çalışma havuzunuzdaki surelerden oyun',
    surahCountLabel: 'Kişisel Havuz',
    isActivePool: true,
  },
  {
    id: 'kademe_6',
    order: 6,
    title: 'Tüm Mushaf Ustası',
    shortTitle: 'Tüm Mushaf',
    subtitle: 'Fâtiha’dan Nâs’a 114 surenin tamamı',
    surahCountLabel: '114 Sure',
  },
];

export interface GameDefinitionMeta {
  id: GameId;
  title: string;
  shortTitle: string;
  subtitle: string;
  focusLabel: string;
  duelLabel: string;
}

export const GAME_DEFINITIONS: readonly GameDefinitionMeta[] = [
  {
    id: 'memory',
    title: 'Hafıza Kartları',
    shortTitle: 'Hafıza Kartları',
    subtitle: 'Sure adını anlamı veya özel grup niteliğiyle 3B çevirmeli kartlarda eşleştirin.',
    focusLabel: 'Sure · Anlam · Özel Grup',
    duelLabel: 'Sıralı Düello (Bilen Devam Eder)',
  },
  {
    id: 'chain',
    title: 'Mushaf Zinciri',
    shortTitle: 'Mushaf Zinciri',
    subtitle: 'Komşu sureleri (öncesi–sonrası) yerleştirin ve karışık sureleri Mushaf sırasına dizin.',
    focusLabel: 'Tertip · Komşu Sure · Sıralama',
    duelLabel: 'Eşzamanlı Bölünmüş Ekran',
  },
  {
    id: 'speed',
    title: 'Hızlı Künye Eşleştirme',
    shortTitle: 'Hızlı Künye',
    subtitle: 'Sol sütundaki sureyi sağdaki anlam, ayet sayısı veya Mukattaa künyesiyle eşleştirin.',
    focusLabel: 'Anlam · Ayet Sayısı · Mukattaa',
    duelLabel: 'Eşzamanlı Bölünmüş Ekran',
  },
];

export interface EnrichedGameSurah {
  no: number;
  nameTr: string;
  shortNameTr: string;
  nameAr: string;
  meaningTr: string;
  type: 'Mekkî' | 'Medenî';
  ayahCount: number;
  nuzulOrder: number;
  mukattaa: MukattaaEntry | null;
  families: SpecialSurahFamilyInfo[];
  primaryTrait: {
    label: string;
    arabic?: string;
    badge: string;
  } | null;
}

export interface GameDuelSummary {
  p1Score: number;
  p2Score: number;
  p1Correct: number;
  p2Correct: number;
  winner: 'p1' | 'p2' | 'draw';
}

export interface GameResultPayload {
  gameId: GameId;
  tierId: GameTierId;
  tempo: GameTempo;
  playerMode: GamePlayerMode;
  score: number;
  stars: 1 | 2 | 3;
  maxCombo: number;
  correctCount: number;
  mistakeCount: number;
  accuracyPct: number;
  durationSec: number;
  earnedXp: number;
  mistakenSurahs: EnrichedGameSurah[];
  duel?: GameDuelSummary;
}

export interface GameHudUpdate {
  score: number;
  combo: number;
  progressLabel: string;
  timerText: string;
  timerUrgent?: boolean;
}

export interface GameComponentProps {
  tierId: GameTierId;
  tempo: GameTempo;
  playerMode: GamePlayerMode;
  tierSurahs: EnrichedGameSurah[];
  allSurahsMap: Map<number, EnrichedGameSurah>;
  onHudUpdate: (hud: GameHudUpdate) => void;
  onComplete: (result: GameResultPayload) => void;
}

/**
 * Meta + SurahExtraInfo + Ulûmu'l-Kur'ân sözlüğünü birleştirerek 114 surelik zengin listeyi kurar.
 */
export function buildEnrichedGameSurahs(
  surahs: SurahMeta[],
  extrasMap: Map<number, SurahExtraInfo>,
): EnrichedGameSurah[] {
  return surahs
    .slice()
    .sort((a, b) => a.no - b.no)
    .map((s) => {
      const extra = extrasMap.get(s.no);
      const rawType = (extra?.type || s.type || 'Mekkî').trim();
      const normalizedType: 'Mekkî' | 'Medenî' = rawType.startsWith('Med') ? 'Medenî' : 'Mekkî';
      const meaning = (extra?.meaningTr || '').trim() || `${s.shortNameTr} Suresi`;

      return {
        no: s.no,
        nameTr: s.nameTr,
        shortNameTr: s.shortNameTr || s.nameTr,
        nameAr: s.nameAr,
        meaningTr: meaning,
        type: normalizedType,
        ayahCount: extra?.ayahCount ?? s.ayahCount,
        nuzulOrder: extra?.nuzul?.osman ?? s.nuzulSirasi ?? s.no,
        mukattaa: getSurahMukattaa(s.no),
        families: getSurahFamilies(s.no),
        primaryTrait: getSurahPrimarySpecialTrait(s.no),
      };
    });
}

/**
 * Seçili kademeye göre oyun sure havuzunu döndürür.
 * Kademe 5'te aktif havuz 8'den az sure içeriyorsa komşu surelerle dengeli biçimde tamamlar.
 */
export function resolveTierSurahs(
  tierId: GameTierId,
  allSurahs: EnrichedGameSurah[],
  activePoolSurahNos: number[],
): EnrichedGameSurah[] {
  if (allSurahs.length === 0) return [];
  const byNo = new Map<number, EnrichedGameSurah>();
  for (const s of allSurahs) byNo.set(s.no, s);

  const pickByNos = (nos: readonly number[]): EnrichedGameSurah[] =>
    nos.map((no) => byNo.get(no)).filter((item): item is EnrichedGameSurah => Boolean(item));

  switch (tierId) {
    case 'kademe_1':
      return pickByNos(NAMAZ_SURAH_NOS);
    case 'kademe_2':
      return pickByNos(AMME_SURAH_NOS);
    case 'kademe_3':
      return pickByNos(FAMOUS_SURAH_NOS);
    case 'kademe_4':
      return pickByNos(SPECIAL_GROUPS_SURAH_NOS);
    case 'kademe_5': {
      const unique = Array.from(new Set(activePoolSurahNos))
        .filter((n) => byNo.has(n))
        .sort((a, b) => a - b);

      if (unique.length >= 8) {
        return pickByNos(unique);
      }

      // 4 veya 8'den az sure seçilmişse komşu surelerle nazikçe tamamla
      const padded = new Set<number>(unique.length > 0 ? unique : NAMAZ_SURAH_NOS);
      const seeds = unique.length > 0 ? unique : [105];
      let radius = 1;
      while (padded.size < 8 && radius <= 114) {
        for (const seed of seeds) {
          if (padded.size >= 8) break;
          if (seed - radius >= 1 && byNo.has(seed - radius)) padded.add(seed - radius);
          if (padded.size >= 8) break;
          if (seed + radius <= 114 && byNo.has(seed + radius)) padded.add(seed + radius);
        }
        radius += 1;
      }
      return pickByNos(Array.from(padded).sort((a, b) => a - b));
    }
    case 'kademe_6':
    default:
      return allSurahs;
  }
}

export function getNextTierId(current: GameTierId): GameTierId | null {
  const idx = GAME_TIERS.findIndex((t) => t.id === current);
  if (idx < 0 || idx >= GAME_TIERS.length - 1) return null;
  return GAME_TIERS[idx + 1].id;
}

export function shuffleArray<T>(items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function calculateGameStars(accuracyPct: number, score: number): 1 | 2 | 3 {
  if (accuracyPct >= 88 && score >= 60) return 3;
  if (accuracyPct >= 65 && score >= 30) return 2;
  return 1;
}

export function calculateGameXp(score: number, stars: 1 | 2 | 3, maxCombo: number): number {
  const base = Math.max(10, Math.round(score * 0.45));
  const starBonus = stars * 10;
  const comboBonus = maxCombo >= 3 ? maxCombo * 3 : 0;
  return Math.min(180, base + starBonus + comboBonus);
}

export function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
