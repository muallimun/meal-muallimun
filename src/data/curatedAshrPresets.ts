import type {
  AyahRange,
  CuratedPresetItem,
  MemorizationUnit,
  UnitSourceType,
} from '../types/memorization';
import { formatVerseKey } from '../types/memorization';
import type { MetaData } from '../types/quran';

export interface PresetGroupMeta {
  id: CuratedPresetItem['group'];
  title: string;
  description: string;
}

export const CURATED_PRESET_GROUPS: readonly PresetGroupMeta[] = [
  {
    id: 'ashr',
    title: 'Klasik Aşırlar & Seçkin Pasajlar',
    description: 'Namazda ve günlük tilavette en çok okunan mübarek ayet grupları',
  },
  {
    id: 'popular_surahs',
    title: 'Sık Ezberlenen Sureler',
    description: 'Faziletleriyle öne çıkan sureler ve Kehf başlangıç/bitiş pasajları',
  },
  {
    id: 'prayer_surahs',
    title: 'Namaz Sureleri (Duhâ – Nâs)',
    description: '93. Duhâ suresinden 114. Nâs suresine kadar kısa sureler',
  },
] as const;

export const CURATED_ASHR_PRESETS: readonly CuratedPresetItem[] = [
  // 1. Klasik Aşırlar
  {
    id: 'preset_ayetel_kursi',
    group: 'ashr',
    title: "Âyetü'l-Kürsî",
    subtitle: 'Bakara 255 · 1 Ayet',
    ranges: [{ surah: 2, startAyah: 255, endAyah: 255 }],
    estimatedAyahs: 1,
  },
  {
    id: 'preset_amenerrasulu',
    group: 'ashr',
    title: 'Âmenerrasûlü',
    subtitle: 'Bakara 285–286 · 2 Ayet',
    ranges: [{ surah: 2, startAyah: 285, endAyah: 286 }],
    estimatedAyahs: 2,
  },
  {
    id: 'preset_huvallahullezi',
    group: 'ashr',
    title: 'Hüvallâhüllezî (Haşr Son 3 Ayet)',
    subtitle: 'Haşr 22–24 · 3 Ayet',
    ranges: [{ surah: 59, startAyah: 22, endAyah: 24 }],
    estimatedAyahs: 3,
  },
  {
    id: 'preset_muminun_1_11',
    group: 'ashr',
    title: "Mü'minûn İlk Ayetler",
    subtitle: "Mü'minûn 1–11 · 11 Ayet",
    ranges: [{ surah: 23, startAyah: 1, endAyah: 11 }],
    estimatedAyahs: 11,
  },
  {
    id: 'preset_hucurat_kardeslik',
    group: 'ashr',
    title: 'Hucurât Kardeşlik Ayetleri',
    subtitle: 'Hucurât 10–13 · 4 Ayet',
    ranges: [{ surah: 49, startAyah: 10, endAyah: 13 }],
    estimatedAyahs: 4,
  },
  {
    id: 'preset_ali_imran_sehadet_mulk',
    group: 'ashr',
    title: 'Âl-i İmrân Şehâdet & Mülk',
    subtitle: 'Âl-i İmrân 18–19 ve 26–27 · 4 Ayet',
    ranges: [
      { surah: 3, startAyah: 18, endAyah: 19 },
      { surah: 3, startAyah: 26, endAyah: 27 },
    ],
    estimatedAyahs: 4,
  },
  {
    id: 'preset_ali_imran_ulul_elbab',
    group: 'ashr',
    title: "Âl-i İmrân Ulü'l-Elbâb",
    subtitle: 'Âl-i İmrân 190–194 · 5 Ayet',
    ranges: [{ surah: 3, startAyah: 190, endAyah: 194 }],
    estimatedAyahs: 5,
  },
  {
    id: 'preset_lokman_ogutleri',
    group: 'ashr',
    title: 'Lokmân Öğütleri',
    subtitle: 'Lokmân 12–19 · 8 Ayet',
    ranges: [{ surah: 31, startAyah: 12, endAyah: 19 }],
    estimatedAyahs: 8,
  },
  {
    id: 'preset_furkan_rahmanin_kullari',
    group: 'ashr',
    title: "Furkân Rahmân'ın Kulları",
    subtitle: 'Furkân 63–77 · 15 Ayet',
    ranges: [{ surah: 25, startAyah: 63, endAyah: 77 }],
    estimatedAyahs: 15,
  },
  {
    id: 'preset_cuma_9_11',
    group: 'ashr',
    title: "Cum'a Ayetleri",
    subtitle: "Cum'a 9–11 · 3 Ayet",
    ranges: [{ surah: 62, startAyah: 9, endAyah: 11 }],
    estimatedAyahs: 3,
  },

  // 2. Sık Ezberlenen Sureler
  {
    id: 'preset_surah_fatiha',
    group: 'popular_surahs',
    title: 'Fâtiha Suresi',
    subtitle: '1. Sure · 7 Ayet',
    ranges: [{ surah: 1, startAyah: 1, endAyah: 7 }],
    estimatedAyahs: 7,
  },
  {
    id: 'preset_surah_yasin',
    group: 'popular_surahs',
    title: 'Yâsîn Suresi',
    subtitle: '36. Sure · 83 Ayet',
    ranges: [{ surah: 36, startAyah: 1, endAyah: 83 }],
    estimatedAyahs: 83,
  },
  {
    id: 'preset_surah_mulk',
    group: 'popular_surahs',
    title: 'Mülk Suresi (Tebâreke)',
    subtitle: '67. Sure · 30 Ayet',
    ranges: [{ surah: 67, startAyah: 1, endAyah: 30 }],
    estimatedAyahs: 30,
  },
  {
    id: 'preset_surah_nebe',
    group: 'popular_surahs',
    title: 'Nebe Suresi (Amme)',
    subtitle: '78. Sure · 40 Ayet',
    ranges: [{ surah: 78, startAyah: 1, endAyah: 40 }],
    estimatedAyahs: 40,
  },
  {
    id: 'preset_surah_rahman',
    group: 'popular_surahs',
    title: 'Rahmân Suresi',
    subtitle: '55. Sure · 78 Ayet',
    ranges: [{ surah: 55, startAyah: 1, endAyah: 78 }],
    estimatedAyahs: 78,
  },
  {
    id: 'preset_surah_vakia',
    group: 'popular_surahs',
    title: 'Vâkıa Suresi',
    subtitle: '56. Sure · 96 Ayet',
    ranges: [{ surah: 56, startAyah: 1, endAyah: 96 }],
    estimatedAyahs: 96,
  },
  {
    id: 'preset_surah_fetih',
    group: 'popular_surahs',
    title: 'Fetih Suresi',
    subtitle: '48. Sure · 29 Ayet',
    ranges: [{ surah: 48, startAyah: 1, endAyah: 29 }],
    estimatedAyahs: 29,
  },
  {
    id: 'preset_kehf_ilk_10',
    group: 'popular_surahs',
    title: 'Kehf İlk 10 Ayet',
    subtitle: 'Kehf 1–10 · 10 Ayet',
    ranges: [{ surah: 18, startAyah: 1, endAyah: 10 }],
    estimatedAyahs: 10,
  },
  {
    id: 'preset_kehf_son_10',
    group: 'popular_surahs',
    title: 'Kehf Son 10 Ayet',
    subtitle: 'Kehf 101–110 · 10 Ayet',
    ranges: [{ surah: 18, startAyah: 101, endAyah: 110 }],
    estimatedAyahs: 10,
  },

  // 3. Namaz Sureleri (Duhâ 93 – Nâs 114)
  { id: 'preset_s093', group: 'prayer_surahs', title: 'Duhâ Suresi', subtitle: '93. Sure · 11 Ayet', ranges: [{ surah: 93, startAyah: 1, endAyah: 11 }], estimatedAyahs: 11 },
  { id: 'preset_s094', group: 'prayer_surahs', title: 'İnşirâh Suresi', subtitle: '94. Sure · 8 Ayet', ranges: [{ surah: 94, startAyah: 1, endAyah: 8 }], estimatedAyahs: 8 },
  { id: 'preset_s095', group: 'prayer_surahs', title: 'Tîn Suresi', subtitle: '95. Sure · 8 Ayet', ranges: [{ surah: 95, startAyah: 1, endAyah: 8 }], estimatedAyahs: 8 },
  { id: 'preset_s096', group: 'prayer_surahs', title: 'Alak Suresi', subtitle: '96. Sure · 19 Ayet', ranges: [{ surah: 96, startAyah: 1, endAyah: 19 }], estimatedAyahs: 19 },
  { id: 'preset_s097', group: 'prayer_surahs', title: 'Kadir Suresi', subtitle: '97. Sure · 5 Ayet', ranges: [{ surah: 97, startAyah: 1, endAyah: 5 }], estimatedAyahs: 5 },
  { id: 'preset_s098', group: 'prayer_surahs', title: 'Beyyine Suresi', subtitle: '98. Sure · 8 Ayet', ranges: [{ surah: 98, startAyah: 1, endAyah: 8 }], estimatedAyahs: 8 },
  { id: 'preset_s099', group: 'prayer_surahs', title: 'Zilzâl Suresi', subtitle: '99. Sure · 8 Ayet', ranges: [{ surah: 99, startAyah: 1, endAyah: 8 }], estimatedAyahs: 8 },
  { id: 'preset_s100', group: 'prayer_surahs', title: 'Âdiyât Suresi', subtitle: '100. Sure · 11 Ayet', ranges: [{ surah: 100, startAyah: 1, endAyah: 11 }], estimatedAyahs: 11 },
  { id: 'preset_s101', group: 'prayer_surahs', title: 'Kâria Suresi', subtitle: '101. Sure · 11 Ayet', ranges: [{ surah: 101, startAyah: 1, endAyah: 11 }], estimatedAyahs: 11 },
  { id: 'preset_s102', group: 'prayer_surahs', title: 'Tekâsür Suresi', subtitle: '102. Sure · 8 Ayet', ranges: [{ surah: 102, startAyah: 1, endAyah: 8 }], estimatedAyahs: 8 },
  { id: 'preset_s103', group: 'prayer_surahs', title: 'Asr Suresi', subtitle: '103. Sure · 3 Ayet', ranges: [{ surah: 103, startAyah: 1, endAyah: 3 }], estimatedAyahs: 3 },
  { id: 'preset_s104', group: 'prayer_surahs', title: 'Hümeze Suresi', subtitle: '104. Sure · 9 Ayet', ranges: [{ surah: 104, startAyah: 1, endAyah: 9 }], estimatedAyahs: 9 },
  { id: 'preset_s105', group: 'prayer_surahs', title: 'Fîl Suresi', subtitle: '105. Sure · 5 Ayet', ranges: [{ surah: 105, startAyah: 1, endAyah: 5 }], estimatedAyahs: 5 },
  { id: 'preset_s106', group: 'prayer_surahs', title: 'Kureyş Suresi', subtitle: '106. Sure · 4 Ayet', ranges: [{ surah: 106, startAyah: 1, endAyah: 4 }], estimatedAyahs: 4 },
  { id: 'preset_s107', group: 'prayer_surahs', title: 'Mâûn Suresi', subtitle: '107. Sure · 7 Ayet', ranges: [{ surah: 107, startAyah: 1, endAyah: 7 }], estimatedAyahs: 7 },
  { id: 'preset_s108', group: 'prayer_surahs', title: 'Kevser Suresi', subtitle: '108. Sure · 3 Ayet', ranges: [{ surah: 108, startAyah: 1, endAyah: 3 }], estimatedAyahs: 3 },
  { id: 'preset_s109', group: 'prayer_surahs', title: 'Kâfirûn Suresi', subtitle: '109. Sure · 6 Ayet', ranges: [{ surah: 109, startAyah: 1, endAyah: 6 }], estimatedAyahs: 6 },
  { id: 'preset_s110', group: 'prayer_surahs', title: 'Nasr Suresi', subtitle: '110. Sure · 3 Ayet', ranges: [{ surah: 110, startAyah: 1, endAyah: 3 }], estimatedAyahs: 3 },
  { id: 'preset_s111', group: 'prayer_surahs', title: 'Tebbet Suresi', subtitle: '111. Sure · 5 Ayet', ranges: [{ surah: 111, startAyah: 1, endAyah: 5 }], estimatedAyahs: 5 },
  { id: 'preset_s112', group: 'prayer_surahs', title: 'İhlâs Suresi', subtitle: '112. Sure · 4 Ayet', ranges: [{ surah: 112, startAyah: 1, endAyah: 4 }], estimatedAyahs: 4 },
  { id: 'preset_s113', group: 'prayer_surahs', title: 'Felak Suresi', subtitle: '113. Sure · 5 Ayet', ranges: [{ surah: 113, startAyah: 1, endAyah: 5 }], estimatedAyahs: 5 },
  { id: 'preset_s114', group: 'prayer_surahs', title: 'Nâs Suresi', subtitle: '114. Sure · 6 Ayet', ranges: [{ surah: 114, startAyah: 1, endAyah: 6 }], estimatedAyahs: 6 },
] as const;

export function createUnitId(prefix = 'mem'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/**
 * Verilen `AyahRange[]` dizisinden mevcut `meta.json` (`verseIndex`) tek doğruluk kaynağıyla
 * Mushaf sırasına göre `verseKeys` ve `mushafPages` listelerini üretir.
 */
export function buildMemorizationUnitFromRanges(
  meta: MetaData | null,
  input: {
    id?: string;
    title: string;
    subtitle?: string;
    sourceType: UnitSourceType;
    ranges: AyahRange[];
  },
): MemorizationUnit {
  const sanitizedRanges: AyahRange[] = [];
  const verseKeySet = new Set<string>();
  const verseKeys: string[] = [];
  const pageSet = new Set<number>();

  // meta.verseIndex hızlı arama haritası ("s:a" -> page)
  const pageLookup = new Map<string, number>();
  const surahMaxAyah = new Map<number, number>();
  if (meta) {
    for (const s of meta.surahs) {
      surahMaxAyah.set(s.no, s.ayahCount);
    }
    for (const row of meta.verseIndex) {
      pageLookup.set(formatVerseKey(row[1], row[2]), row[4]);
    }
  }

  for (const r of input.ranges) {
    const surah = Math.max(1, Math.min(114, Math.floor(r.surah)));
    const maxA = surahMaxAyah.get(surah) ?? 286;
    const rawStart = Math.max(1, Math.min(maxA, Math.floor(r.startAyah)));
    const rawEnd = Math.max(1, Math.min(maxA, Math.floor(r.endAyah)));
    const startAyah = Math.min(rawStart, rawEnd);
    const endAyah = Math.max(rawStart, rawEnd);

    sanitizedRanges.push({ surah, startAyah, endAyah });

    for (let a = startAyah; a <= endAyah; a += 1) {
      const key = formatVerseKey(surah, a);
      if (!verseKeySet.has(key)) {
        verseKeySet.add(key);
        verseKeys.push(key);
      }
      const p = pageLookup.get(key);
      if (p) pageSet.add(p);
    }
  }

  const mushafPages = Array.from(pageSet).sort((a, b) => a - b);

  return {
    id: input.id ?? createUnitId('unit'),
    title: input.title.trim() || 'Ezber Birimi',
    subtitle: input.subtitle?.trim() || undefined,
    sourceType: input.sourceType,
    ranges: sanitizedRanges,
    verseKeys,
    mushafPages,
    stage: 'raw',
    completedSessions: 0,
    totalMinutes: 0,
    starredVerseKeys: [],
    createdAt: Date.now(),
    lastPracticedAt: null,
  };
}

/**
 * Bir Mushaf sayfasındaki ayetleri `meta.verseIndex` üzerinden çoklu-sure uyumlu `AyahRange[]` olarak çıkarır.
 * `split`: 'full' | 'top' | 'bottom'
 */
export function buildRangesForMushafPage(
  meta: MetaData,
  pageNo: number,
  split: 'full' | 'top' | 'bottom' = 'full',
): {
  ranges: AyahRange[];
  verseKeys: string[];
  surahNames: string[];
  hasNextPageContinuationHint: boolean;
} {
  const rows = meta.verseIndex.filter((r) => r[4] === pageNo);
  if (rows.length === 0) {
    return {
      ranges: [],
      verseKeys: [],
      surahNames: [],
      hasNextPageContinuationHint: false,
    };
  }

  let selectedRows = rows;
  if (split !== 'full' && rows.length >= 2) {
    const mid = Math.ceil(rows.length / 2);
    selectedRows = split === 'top' ? rows.slice(0, mid) : rows.slice(mid);
  }

  const ranges: AyahRange[] = [];
  const verseKeys: string[] = [];
  const surahIds = new Set<number>();

  for (const row of selectedRows) {
    const surah = row[1];
    const ayah = row[2];
    surahIds.add(surah);
    verseKeys.push(formatVerseKey(surah, ayah));

    const last = ranges[ranges.length - 1];
    if (last && last.surah === surah && last.endAyah + 1 === ayah) {
      last.endAyah = ayah;
    } else {
      ranges.push({ surah, startAyah: ayah, endAyah: ayah });
    }
  }

  const surahNameMap = new Map(meta.surahs.map((s) => [s.no, s.shortNameTr]));
  const surahNames = Array.from(surahIds).map((id) => surahNameMap.get(id) ?? `${id}. Sure`);

  // Sayfadaki son ayetten sonra aynı sure sonraki sayfada devam ediyorsa bilgilendirme notu göster
  const lastRow = rows[rows.length - 1];
  const nextPageRows = meta.verseIndex.filter((r) => r[4] === pageNo + 1);
  const hasNextPageContinuationHint =
    Boolean(lastRow && nextPageRows.length > 0 && nextPageRows[0][1] === lastRow[1]);

  return {
    ranges,
    verseKeys,
    surahNames,
    hasNextPageContinuationHint,
  };
}
