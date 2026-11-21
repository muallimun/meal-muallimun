import type {
  AyahRange,
  CuratedPresetGroupId,
  CuratedPresetItem,
  MemorizationUnit,
  UnitSourceType,
} from '../types/memorization';
import { formatVerseKey } from '../types/memorization';
import type { MetaData } from '../types/quran';

export interface PresetGroupMeta {
  id: CuratedPresetGroupId;
  title: string;
  shortTitle: string;
  description: string;
}

export const CURATED_PRESET_GROUPS: readonly PresetGroupMeta[] = [
  {
    id: 'prayer_surahs',
    title: 'Namaz Sureleri · Fâtiha & Fîl–Nâs',
    shortTitle: 'Namaz Sureleri',
    description: 'Namazda en çok okunan 11 temel sure (Mushaf sırasıyla)',
  },
  {
    id: 'duha_to_fil',
    title: 'Duhâ – Fîl Arası Sureler · 93–104 Eksiksiz',
    shortTitle: 'Duhâ–Fîl Arası',
    description: '93. Duhâ suresinden 104. Hümeze suresine kadar 12 kısa sure',
  },
  {
    id: 'selected_ashrs',
    title: 'Seçkin Aşırlar & Mübarek Pasajlar',
    shortTitle: 'Seçkin Aşırlar',
    description: 'Kur’an’ın en meşhur aşır-ı şerifleri, dua ve tefekkür pasajları',
  },
  {
    id: 'featured_surahs',
    title: 'Seçkin Ezber Sureleri',
    shortTitle: 'Seçkin Sureler',
    description: 'Faziletleriyle öne çıkan ve sıkça ezberlenen 6 mübarek sure',
  },
] as const;

export const CURATED_ASHR_PRESETS: readonly CuratedPresetItem[] = [
  // ==========================================================================
  // GRUP 1 — Namaz Sureleri · Fâtiha & Fîl–Nâs (11 Sure)
  // ==========================================================================
  {
    id: 'preset_s001',
    group: 'prayer_surahs',
    title: 'Fâtiha Suresi',
    subtitle: '1. Sure · 1–7 · 7 Ayet',
    ranges: [{ surah: 1, startAyah: 1, endAyah: 7 }],
    estimatedAyahs: 7,
  },
  {
    id: 'preset_s105',
    group: 'prayer_surahs',
    title: 'Fîl Suresi',
    subtitle: '105. Sure · 1–5 · 5 Ayet',
    ranges: [{ surah: 105, startAyah: 1, endAyah: 5 }],
    estimatedAyahs: 5,
  },
  {
    id: 'preset_s106',
    group: 'prayer_surahs',
    title: 'Kureyş Suresi',
    subtitle: '106. Sure · 1–4 · 4 Ayet',
    ranges: [{ surah: 106, startAyah: 1, endAyah: 4 }],
    estimatedAyahs: 4,
  },
  {
    id: 'preset_s107',
    group: 'prayer_surahs',
    title: 'Mâûn Suresi',
    subtitle: '107. Sure · 1–7 · 7 Ayet',
    ranges: [{ surah: 107, startAyah: 1, endAyah: 7 }],
    estimatedAyahs: 7,
  },
  {
    id: 'preset_s108',
    group: 'prayer_surahs',
    title: 'Kevser Suresi',
    subtitle: '108. Sure · 1–3 · 3 Ayet',
    ranges: [{ surah: 108, startAyah: 1, endAyah: 3 }],
    estimatedAyahs: 3,
  },
  {
    id: 'preset_s109',
    group: 'prayer_surahs',
    title: 'Kâfirûn Suresi',
    subtitle: '109. Sure · 1–6 · 6 Ayet',
    ranges: [{ surah: 109, startAyah: 1, endAyah: 6 }],
    estimatedAyahs: 6,
  },
  {
    id: 'preset_s110',
    group: 'prayer_surahs',
    title: 'Nasr Suresi',
    subtitle: '110. Sure · 1–3 · 3 Ayet',
    ranges: [{ surah: 110, startAyah: 1, endAyah: 3 }],
    estimatedAyahs: 3,
  },
  {
    id: 'preset_s111',
    group: 'prayer_surahs',
    title: 'Tebbet Suresi',
    subtitle: '111. Sure · 1–5 · 5 Ayet',
    ranges: [{ surah: 111, startAyah: 1, endAyah: 5 }],
    estimatedAyahs: 5,
  },
  {
    id: 'preset_s112',
    group: 'prayer_surahs',
    title: 'İhlâs Suresi',
    subtitle: '112. Sure · 1–4 · 4 Ayet',
    ranges: [{ surah: 112, startAyah: 1, endAyah: 4 }],
    estimatedAyahs: 4,
  },
  {
    id: 'preset_s113',
    group: 'prayer_surahs',
    title: 'Felak Suresi',
    subtitle: '113. Sure · 1–5 · 5 Ayet',
    ranges: [{ surah: 113, startAyah: 1, endAyah: 5 }],
    estimatedAyahs: 5,
  },
  {
    id: 'preset_s114',
    group: 'prayer_surahs',
    title: 'Nâs Suresi',
    subtitle: '114. Sure · 1–6 · 6 Ayet',
    ranges: [{ surah: 114, startAyah: 1, endAyah: 6 }],
    estimatedAyahs: 6,
  },

  // ==========================================================================
  // GRUP 2 — Duhâ – Fîl Arası Sureler · 93–104 Eksiksiz (12 Sure)
  // ==========================================================================
  {
    id: 'preset_s093',
    group: 'duha_to_fil',
    title: 'Duhâ Suresi',
    subtitle: '93. Sure · 1–11 · 11 Ayet',
    ranges: [{ surah: 93, startAyah: 1, endAyah: 11 }],
    estimatedAyahs: 11,
  },
  {
    id: 'preset_s094',
    group: 'duha_to_fil',
    title: 'İnşirâh Suresi',
    subtitle: '94. Sure · 1–8 · 8 Ayet',
    ranges: [{ surah: 94, startAyah: 1, endAyah: 8 }],
    estimatedAyahs: 8,
  },
  {
    id: 'preset_s095',
    group: 'duha_to_fil',
    title: 'Tîn Suresi',
    subtitle: '95. Sure · 1–8 · 8 Ayet',
    ranges: [{ surah: 95, startAyah: 1, endAyah: 8 }],
    estimatedAyahs: 8,
  },
  {
    id: 'preset_s096',
    group: 'duha_to_fil',
    title: 'Alak Suresi',
    subtitle: '96. Sure · 1–19 · 19 Ayet',
    ranges: [{ surah: 96, startAyah: 1, endAyah: 19 }],
    estimatedAyahs: 19,
  },
  {
    id: 'preset_s097',
    group: 'duha_to_fil',
    title: 'Kadir Suresi',
    subtitle: '97. Sure · 1–5 · 5 Ayet',
    ranges: [{ surah: 97, startAyah: 1, endAyah: 5 }],
    estimatedAyahs: 5,
  },
  {
    id: 'preset_s098',
    group: 'duha_to_fil',
    title: 'Beyyine Suresi',
    subtitle: '98. Sure · 1–8 · 8 Ayet',
    ranges: [{ surah: 98, startAyah: 1, endAyah: 8 }],
    estimatedAyahs: 8,
  },
  {
    id: 'preset_s099',
    group: 'duha_to_fil',
    title: 'Zilzâl Suresi',
    subtitle: '99. Sure · 1–8 · 8 Ayet',
    ranges: [{ surah: 99, startAyah: 1, endAyah: 8 }],
    estimatedAyahs: 8,
  },
  {
    id: 'preset_s100',
    group: 'duha_to_fil',
    title: 'Âdiyât Suresi',
    subtitle: '100. Sure · 1–11 · 11 Ayet',
    ranges: [{ surah: 100, startAyah: 1, endAyah: 11 }],
    estimatedAyahs: 11,
  },
  {
    id: 'preset_s101',
    group: 'duha_to_fil',
    title: 'Kâria Suresi',
    subtitle: '101. Sure · 1–11 · 11 Ayet',
    ranges: [{ surah: 101, startAyah: 1, endAyah: 11 }],
    estimatedAyahs: 11,
  },
  {
    id: 'preset_s102',
    group: 'duha_to_fil',
    title: 'Tekâsür Suresi',
    subtitle: '102. Sure · 1–8 · 8 Ayet',
    ranges: [{ surah: 102, startAyah: 1, endAyah: 8 }],
    estimatedAyahs: 8,
  },
  {
    id: 'preset_s103',
    group: 'duha_to_fil',
    title: 'Asr Suresi',
    subtitle: '103. Sure · 1–3 · 3 Ayet',
    ranges: [{ surah: 103, startAyah: 1, endAyah: 3 }],
    estimatedAyahs: 3,
  },
  {
    id: 'preset_s104',
    group: 'duha_to_fil',
    title: 'Hümeze Suresi',
    subtitle: '104. Sure · 1–9 · 9 Ayet',
    ranges: [{ surah: 104, startAyah: 1, endAyah: 9 }],
    estimatedAyahs: 9,
  },

  // ==========================================================================
  // GRUP 3 — Seçkin Aşırlar & Mübarek Pasajlar (10 Aşır)
  // ==========================================================================
  {
    id: 'preset_bakara_1_5',
    group: 'selected_ashrs',
    title: 'Bakara Suresi 1–5',
    subtitle: 'Elif-Lâm-Mîm · 5 Ayet',
    ranges: [{ surah: 2, startAyah: 1, endAyah: 5 }],
    estimatedAyahs: 5,
  },
  {
    id: 'preset_bakara_153_157',
    group: 'selected_ashrs',
    title: 'Bakara Suresi 153–157',
    subtitle: 'Sabır ve İstircâ Ayetleri · 5 Ayet',
    ranges: [{ surah: 2, startAyah: 153, endAyah: 157 }],
    estimatedAyahs: 5,
  },
  {
    id: 'preset_ayetel_kursi',
    group: 'selected_ashrs',
    title: "Âyetü'l-Kürsî",
    subtitle: 'Bakara 255 · 1 Ayet',
    ranges: [{ surah: 2, startAyah: 255, endAyah: 255 }],
    estimatedAyahs: 1,
  },
  {
    id: 'preset_amenerrasulu',
    group: 'selected_ashrs',
    title: 'Âmenerrasûlü',
    subtitle: 'Bakara Son 2 Ayet (285–286)',
    ranges: [{ surah: 2, startAyah: 285, endAyah: 286 }],
    estimatedAyahs: 2,
  },
  {
    id: 'preset_ali_imran_102_109',
    group: 'selected_ashrs',
    title: 'Âl-i İmrân Suresi 102–109',
    subtitle: 'Birlik ve Takvâ Ayetleri · 8 Ayet',
    ranges: [{ surah: 3, startAyah: 102, endAyah: 109 }],
    estimatedAyahs: 8,
  },
  {
    id: 'preset_ali_imran_189_194',
    group: 'selected_ashrs',
    title: 'Âl-i İmrân Suresi 189–194',
    subtitle: "Ulü'l-Elbâb & Dua Ayetleri · 6 Ayet",
    ranges: [{ surah: 3, startAyah: 189, endAyah: 194 }],
    estimatedAyahs: 6,
  },
  {
    id: 'preset_muminun_1_11',
    group: 'selected_ashrs',
    title: "Mü'minûn Suresi 1–11",
    subtitle: "Mü'minlerin Özellikleri · 11 Ayet",
    ranges: [{ surah: 23, startAyah: 1, endAyah: 11 }],
    estimatedAyahs: 11,
  },
  {
    id: 'preset_fussilet_30_36',
    group: 'selected_ashrs',
    title: 'Fussilet Suresi 30–36',
    subtitle: 'İstikamet ve Güzel Ahlâk · 7 Ayet',
    ranges: [{ surah: 41, startAyah: 30, endAyah: 36 }],
    estimatedAyahs: 7,
  },
  {
    id: 'preset_hasr_21_24',
    group: 'selected_ashrs',
    title: 'Haşr Suresi 21–24',
    subtitle: 'Lev Enzelnâ / Hüvallâhüllezî · 4 Ayet',
    ranges: [{ surah: 59, startAyah: 21, endAyah: 24 }],
    estimatedAyahs: 4,
  },
  {
    id: 'preset_cuma_9_11',
    group: 'selected_ashrs',
    title: "Cum'a Suresi 9–11",
    subtitle: 'Cuma Namazı Ayetleri · 3 Ayet',
    ranges: [{ surah: 62, startAyah: 9, endAyah: 11 }],
    estimatedAyahs: 3,
  },

  // ==========================================================================
  // GRUP 4 — Seçkin Ezber Sureleri (6 Sure)
  // ==========================================================================
  {
    id: 'preset_surah_yasin',
    group: 'featured_surahs',
    title: 'Yâsîn Suresi',
    subtitle: '36. Sure · 1–83 · 83 Ayet',
    ranges: [{ surah: 36, startAyah: 1, endAyah: 83 }],
    estimatedAyahs: 83,
  },
  {
    id: 'preset_surah_hucurat',
    group: 'featured_surahs',
    title: 'Hucurât Suresi',
    subtitle: '49. Sure · 1–18 · 18 Ayet',
    ranges: [{ surah: 49, startAyah: 1, endAyah: 18 }],
    estimatedAyahs: 18,
  },
  {
    id: 'preset_surah_rahman',
    group: 'featured_surahs',
    title: 'Rahmân Suresi',
    subtitle: '55. Sure · 1–78 · 78 Ayet',
    ranges: [{ surah: 55, startAyah: 1, endAyah: 78 }],
    estimatedAyahs: 78,
  },
  {
    id: 'preset_surah_mulk',
    group: 'featured_surahs',
    title: 'Mülk Suresi',
    subtitle: '67. Sure · 1–30 · 30 Ayet',
    ranges: [{ surah: 67, startAyah: 1, endAyah: 30 }],
    estimatedAyahs: 30,
  },
  {
    id: 'preset_surah_nebe',
    group: 'featured_surahs',
    title: 'Nebe Suresi',
    subtitle: '78. Sure · 1–40 · 40 Ayet',
    ranges: [{ surah: 78, startAyah: 1, endAyah: 40 }],
    estimatedAyahs: 40,
  },
  {
    id: 'preset_surah_ala',
    group: 'featured_surahs',
    title: "A'lâ Suresi",
    subtitle: '87. Sure · 1–19 · 19 Ayet',
    ranges: [{ surah: 87, startAyah: 1, endAyah: 19 }],
    estimatedAyahs: 19,
  },
] as const;

export function createUnitId(prefix = 'mem'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/**
 * Bir birimin `ranges` dizisi için kanonik eşleştirme imzası üretir (mükerrer kontrolü için).
 */
export function getRangesSignature(ranges: readonly AyahRange[]): string {
  return ranges
    .map((r) => {
      const s = Math.floor(r.surah);
      const a1 = Math.min(Math.floor(r.startAyah), Math.floor(r.endAyah));
      const a2 = Math.max(Math.floor(r.startAyah), Math.floor(r.endAyah));
      return `${s}:${a1}-${a2}`;
    })
    .join(',');
}

/**
 * Verilen `ranges` imzasına sahip mevcut ezber birimini kullanıcının havuzunda arar.
 */
export function findMatchingUnitInPool(
  units: readonly MemorizationUnit[],
  ranges: readonly AyahRange[],
): MemorizationUnit | undefined {
  const targetSig = getRangesSignature(ranges);
  if (!targetSig) return undefined;
  return units.find((u) => getRangesSignature(u.ranges) === targetSig);
}

/**
 * Bir preset veya aralık dizisinin Mushaf sayfa etiketini hesaplar (örn. "Sayfa 604" veya "Sayfa 562–564").
 */
export function getRangesPageLabel(
  meta: MetaData | null,
  ranges: readonly AyahRange[],
): string | null {
  if (!meta || ranges.length === 0) return null;
  const pages = new Set<number>();
  for (const r of ranges) {
    const startA = Math.min(r.startAyah, r.endAyah);
    const endA = Math.max(r.startAyah, r.endAyah);
    for (const row of meta.verseIndex) {
      if (row[1] === r.surah && row[2] >= startA && row[2] <= endA && row[4] >= 1) {
        pages.add(row[4]);
      }
    }
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted.length === 1
    ? `Sayfa ${sorted[0]}`
    : `Sayfa ${sorted[0]}–${sorted[sorted.length - 1]}`;
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
    reviewStep: 0,
    nextReviewAt: null,
  };
}

/**
 * Uzun bir hazır sureyi (`> 15 ayet`) Mushaf sayfalarına veya günlük ayet dilimlerine bölerek
 * ardışık `MemorizationUnit[]` parçaları üretir.
 */
export function buildSplitUnitsForPreset(
  meta: MetaData | null,
  preset: CuratedPresetItem,
  splitBy: 'pages' | 'daily',
  dailyChunkSize = 6,
): MemorizationUnit[] {
  if (preset.ranges.length !== 1) {
    return [
      buildMemorizationUnitFromRanges(meta, {
        title: preset.title,
        subtitle: preset.subtitle,
        sourceType: 'preset',
        ranges: preset.ranges,
      }),
    ];
  }

  const r = preset.ranges[0];

  if (splitBy === 'pages' && meta) {
    const byPage = new Map<number, number[]>();
    for (const row of meta.verseIndex) {
      if (row[1] === r.surah && row[2] >= r.startAyah && row[2] <= r.endAyah && row[4] >= 1) {
        const list = byPage.get(row[4]) ?? [];
        list.push(row[2]);
        byPage.set(row[4], list);
      }
    }
    const sortedPages = Array.from(byPage.keys()).sort((a, b) => a - b);
    if (sortedPages.length > 1) {
      return sortedPages.map((pg, idx) => {
        const ayahs = byPage.get(pg)!;
        const startA = ayahs[0];
        const endA = ayahs[ayahs.length - 1];
        return buildMemorizationUnitFromRanges(meta, {
          title: `${preset.title} · Sayfa ${pg}`,
          subtitle: `Bölüm ${idx + 1}/${sortedPages.length} · ${startA}–${endA}. Ayetler (${ayahs.length} Ayet)`,
          sourceType: 'preset',
          ranges: [{ surah: r.surah, startAyah: startA, endAyah: endA }],
        });
      });
    }
  }

  // Günlük ayet dilimleri (veya tek sayfaya sığan 16-19 ayetli surelerde varsayılan dilimleme)
  const chunk = Math.max(4, Math.min(12, Math.round(dailyChunkSize)));
  const out: MemorizationUnit[] = [];
  let part = 1;
  const totalParts = Math.ceil((r.endAyah - r.startAyah + 1) / chunk);
  for (let a = r.startAyah; a <= r.endAyah; a += chunk) {
    const end = Math.min(r.endAyah, a + chunk - 1);
    out.push(
      buildMemorizationUnitFromRanges(meta, {
        title: `${preset.title} · Dilim ${part}`,
        subtitle: `Bölüm ${part}/${totalParts} · ${a}–${end}. Ayetler (${end - a + 1} Ayet)`,
        sourceType: 'preset',
        ranges: [{ surah: r.surah, startAyah: a, endAyah: end }],
      }),
    );
    part += 1;
  }
  return out;
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
