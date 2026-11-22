import type { SurahExtraInfo } from '../../types/fihrist';
import type { SurahMeta } from '../../types/quran';
import type {
  MukattaaEntry,
  SpecialSurahFamilyInfo,
  SurahGroupId,
} from './surahSpecialGroups';
import {
  AMME_SURAH_NOS,
  FAMOUS_SURAH_NOS,
  NAMAZ_SURAH_NOS,
  SPECIAL_GROUPS_SURAH_NOS,
  getSurahFamilies,
  getSurahMukattaa,
  getSurahPrimarySpecialTrait,
} from './surahSpecialGroups';

export type GameId =
  | 'memory'
  | 'chain'
  | 'speed'
  | 'compass'
  | 'detective'
  | 'families'
  | 'group_seq';

export type GameTierId =
  | 'kademe_1'
  | 'kademe_2'
  | 'kademe_3'
  | 'kademe_4'
  | 'kademe_5'
  | 'kademe_6';

export type GameTempo = 'calm' | 'timed';

export type GamePlayerMode = 'single' | 'duel';

export function sanitizePlayerMode(value: unknown): GamePlayerMode {
  return value === 'duel' ? 'duel' : 'single';
}

export interface GameTierMeta {
  id: GameTierId;
  order: number;
  title: string;
  shortTitle: string;
  subtitle: string;
  surahCountLabel: string;
  tipText: string;
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
    tipText:
      'Fâtiha (1) ve Fîl (105) – Nâs (114) arasındaki kısa surelerin tertibini ve anlamlarını pekiştirin.',
  },
  {
    id: 'kademe_2',
    order: 2,
    title: '30. Cüz (Amme Cüzü)',
    shortTitle: '30. Cüz (Amme)',
    subtitle: 'Nebe’den Nâs’a kısa sureler bütünü',
    surahCountLabel: '37 Sure',
    tipText:
      'Nebe (78) ile başlayıp Nâs (114) ile son bulan 37 surenin tamamı bu kademede yer alır.',
  },
  {
    id: 'kademe_3',
    order: 3,
    title: 'Seçme Meşhur Sureler',
    shortTitle: 'Meşhur Sureler',
    subtitle: 'Yâsîn, Mülk, Kehf, Rahmân, Fetih ve seçkin sureler',
    surahCountLabel: '18 Sure',
    tipText:
      'Günlük tilavette en çok okunan 18 seçkin surenin anlamı, ayet sayısı ve komşulukları.',
  },
  {
    id: 'kademe_4',
    order: 4,
    title: 'Özel Sure Grupları',
    shortTitle: 'Özel Gruplar',
    subtitle: '15 Ulûmu’l-Kur’ân ailesi: Havâmîm, Müsebbihât, Hâmidât, Mukattaa...',
    surahCountLabel: '15 Klasik Aile',
    tipText:
      'Havâmîm (40–46), Müsebbihât, Hâmidât, Tavâsîn, Elif-Lâm-Mîm, Elif-Lâm-Râ, Kâlâkıl, Nidâ, Kasem ve Secde sureleri.',
    isSpecialGroups: true,
  },
  {
    id: 'kademe_5',
    order: 5,
    title: 'Aktif Çalışma Havuzum',
    shortTitle: 'Çalışma Havuzum',
    subtitle: 'Seçili çalışma havuzunuzdaki surelerden oyun',
    surahCountLabel: 'Kişisel Havuz',
    tipText:
      'Uygulamada belirlediğiniz kişisel çalışma havuzundaki sureler öncelikli olarak seçilir.',
    isActivePool: true,
  },
  {
    id: 'kademe_6',
    order: 6,
    title: 'Tüm Mushaf Ustası',
    shortTitle: 'Tüm Mushaf',
    subtitle: 'Fâtiha’dan Nâs’a 114 surenin tamamı',
    surahCountLabel: '114 Sure',
    tipText:
      'Fâtiha’dan Nâs’a 114 surenin tamamında Mushaf tertibi, anlam ve Ulûmu’l-Kur’ân ustalığı.',
  },
];

export interface GameDefinitionMeta {
  id: GameId;
  title: string;
  shortTitle: string;
  arabicTitle: string;
  subtitle: string;
  howToPlay: string;
  focusLabel: string;
  duelLabel: string;
  stageTag?: string;
}

export const GAME_DEFINITIONS: readonly GameDefinitionMeta[] = [
  {
    id: 'memory',
    title: 'Hafızanı Yokla',
    shortTitle: 'Hafızanı Yokla',
    arabicTitle: 'لُعْبَةُ الذَّاكِرَةِ',
    subtitle:
      'Numaralı 3B kartları çevirerek sure adını anlamı veya özel grup niteliğiyle eşleştirin.',
    howToPlay:
      'Açılışta kartları kısa süre gözlemleyin. İki kart çevirerek sureyi Türkçe anlamı veya Ulûmu’l-Kur’ân özelliğiyle eşleştirin. Doğru eşleştiren 10 puan alır ve sıra hakkını korur.',
    focusLabel: 'Sure · Anlam · Özel Grup',
    duelLabel: 'Sıralı Düello (Bilen Devam Eder)',
  },
  {
    id: 'chain',
    title: 'Mushaf Zinciri',
    shortTitle: 'Mushaf Zinciri',
    arabicTitle: 'سِلْسِلَةُ الْمُصْحَفِ',
    subtitle:
      'Komşu sureleri (öncesi–sonrası) yuvalara oturtun ve karışık sureleri Mushaf sırasına dizin.',
    howToPlay:
      'Komşu Sure turlarında merkez surenin bir önceki ve bir sonraki suresini yuvalara sürükleyin veya dokunup yerleştirin. Mushaf Treni turlarında 4 sureyi baştan sona sıralayın.',
    focusLabel: 'Tertip · Komşu Sure · Sıralama',
    duelLabel: 'Eşzamanlı Bölünmüş Ekran',
  },
  {
    id: 'speed',
    title: 'Künye Eşleştir',
    shortTitle: 'Künye Eşleştir',
    arabicTitle: 'مُطَابَقَةُ السُّوَرِ',
    subtitle:
      'Sol sütundaki sureyi sağdaki anlam, ayet sayısı veya Mukattaa künyesiyle eşleştirin.',
    howToPlay:
      'Sol sütundan bir sureye, sağ sütundan ona ait anlam, ayet sayısı veya özel grup kartına dokunarak eşleştirin. Hızlı seri eşleştirmeler kombo puanı kazandırır.',
    focusLabel: 'Anlam · Ayet Sayısı · Mukattaa',
    duelLabel: 'Eşzamanlı Bölünmüş Ekran',
  },
  {
    id: 'compass',
    title: 'Mushaf Pusulası',
    shortTitle: 'Mushaf Pusulası',
    arabicTitle: 'بَوْصَلَةُ الْمُصْحَفِ',
    subtitle:
      'Mushaf cetvelinde surenin yerini (1–114) ibreyle tahmin edin ve sure uzunluklarını tartın.',
    howToPlay:
      'Konum Kadranı turlarında ibreyi sürükleyerek surenin Mushaf sırasını tahmin edip kilitleyin (tam isabet 100p). Ayet Tartısı turlarında ayet sayısı daha fazla olan sureyi seçin.',
    focusLabel: '1–114 Konum · Ayet Tartısı',
    duelLabel: 'İbre Yarışı & Sıralı Tartı',
  },
  {
    id: 'detective',
    title: 'Sure Dedektifi',
    shortTitle: 'Sure Dedektifi',
    arabicTitle: 'كَاشِفُ السُّوَرِ',
    subtitle:
      'Dönem, ayet sayısı, komşu sure ve anlam ipuçlarını birleştirip gizli sureyi en az ipucuyla bulun.',
    howToPlay:
      'İlk ipucu açık başlar (100p). İhtiyaç duydukça 2., 3. ve 4. ipuçlarını açabilirsiniz (75p / 50p / 30p). 6 aday sure arasından gizli sureyi en az ipucuyla tahmin edin.',
    focusLabel: 'Çoklu İpucu · Muhakeme',
    duelLabel: 'Sıralı Dedektif Yarışı',
  },
  {
    id: 'families',
    title: 'Sure Aileleri & Tasnif',
    shortTitle: 'Sure Aileleri',
    arabicTitle: 'تَصْنِيفُ السُّوَرِ',
    subtitle:
      '15 Ulûmu’l-Kur’ân grubunda çeldiriciyi yakalayın, üyeyi tanıyın ve sureleri aile sandıklarına tasnif edin.',
    howToPlay:
      'Üç akıcı turda (Hangisi Değildir?, Hangisi Üyesidir? ve Aile Sandıkları) Havâmîm, Müsebbihât, Hâmidât, Mukattaa ve diğer sure ailelerini sınıflandırın.',
    focusLabel: '15 Aile · Çeldirici · Sandık Tasnifi',
    duelLabel: 'Sıralı & Yarışmalı Tasnif',
    stageTag: 'Ulûmu’l-Kur’ân',
  },
  {
    id: 'group_seq',
    title: 'Grup Kadrosu & Dizilim',
    shortTitle: 'Grup Dizilimi',
    arabicTitle: 'تَرْتِيبُ المَجْمُوعَاتِ',
    subtitle:
      '7 Hâ-Mîm, 7 Müsebbihât, 5 Hâmidât, 3 Tavâsîn ve diğer sure ailelerinin kadrosunu Mushaf sırasına dizin.',
    howToPlay:
      'Verilen sure ailesinin üyelerini Mushaf’taki sırasına göre 1’den N’ye sırayla dokunarak veya sürükleyerek altın yuvalara oturtun. Karma turlarda çeldiricilere dikkat edin!',
    focusLabel: 'Kadro Seçimi · Grup İçi Tertip',
    duelLabel: 'Sıralı & Eşzamanlı Dizilim',
    stageTag: 'Ulûmu’l-Kur’ân',
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
  p1Label: string;
  p2Label: string;
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
  p1Score: number;
  p2Score: number;
  activeTurn: 'p1' | 'p2' | 'both';
  combo: number;
  movesCount: number;
  progressLabel: string;
  elapsedSec: number;
  timerText: string;
  timerUrgent?: boolean;
  turnRemainingSec?: number | null;
  turnDurationSec?: number;
  statusMessage: string;
  featuredSurah?: EnrichedGameSurah | null;
  featuredNote?: string;
  roundContextTitle?: string;
  roundContextHint?: string;
}

export interface GameComponentProps {
  tierId: GameTierId;
  tempo: GameTempo;
  playerMode: GamePlayerMode;
  tierSurahs: EnrichedGameSurah[];
  allSurahsMap: Map<number, EnrichedGameSurah>;
  focusGroupId?: SurahGroupId | null;
  onHudUpdate: (hud: GameHudUpdate) => void;
  onComplete: (result: GameResultPayload) => void;
}

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
  if (accuracyPct >= 85 && score >= 50) return 3;
  if (accuracyPct >= 62 && score >= 25) return 2;
  return 1;
}

export function calculateGameXp(score: number, stars: 1 | 2 | 3, maxCombo: number): number {
  const base = Math.max(12, Math.round(score * 0.35));
  const starBonus = stars * 10;
  const comboBonus = maxCombo >= 3 ? maxCombo * 3 : 0;
  return Math.min(200, base + starBonus + comboBonus);
}

export function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}
