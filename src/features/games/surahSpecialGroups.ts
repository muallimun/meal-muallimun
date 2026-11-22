// ============================================================================
// Ulûmu'l-Kur'ân Doğrulanmış Özel Sure Grupları & Hurûf-u Mukattaa Sözlüğü
// ============================================================================

export interface MukattaaEntry {
  arabic: string;
  readingTr: string;
  groupNote?: string;
}

export type SpecialSurahFamilyId =
  | 'hawamim'
  | 'tawasin'
  | 'musabbihat'
  | 'hamidat'
  | 'qulSurahs'
  | 'prophetNamed'
  | 'sajdahSurahs';

export interface SpecialSurahFamilyInfo {
  id: SpecialSurahFamilyId;
  title: string;
  shortLabel: string;
  description: string;
  surahs: readonly number[];
}

/**
 * Kur'ân-ı Kerîm'de Hurûf-u Mukattaa ile başlayan 29 surenin eksiksiz haritası.
 * (6 Elif-Lâm-Mîm, 1 Elif-Lâm-Mîm-Sâd, 5 Elif-Lâm-Râ, 1 Elif-Lâm-Mîm-Râ,
 *  1 Kâf-Hâ-Yâ-Ayn-Sâd, 1 Tâ-Hâ, 3 Tavâsîn, 1 Yâ-Sîn, 1 Sâd,
 *  7 Havâmîm, 1 Kâf, 1 Nûn = 29 sure)
 */
export const MUKATTAA_MAP: Readonly<Record<number, MukattaaEntry>> = {
  // Elif-Lâm-Mîm (6 sure)
  2: { arabic: 'الم', readingTr: 'Elif-Lâm-Mîm' },
  3: { arabic: 'الم', readingTr: 'Elif-Lâm-Mîm' },
  29: { arabic: 'الم', readingTr: 'Elif-Lâm-Mîm' },
  30: { arabic: 'الم', readingTr: 'Elif-Lâm-Mîm' },
  31: { arabic: 'الم', readingTr: 'Elif-Lâm-Mîm' },
  32: { arabic: 'الم', readingTr: 'Elif-Lâm-Mîm' },

  // Elif-Lâm-Mîm-Sâd (1 sure)
  7: { arabic: 'المص', readingTr: 'Elif-Lâm-Mîm-Sâd' },

  // Elif-Lâm-Râ (5 sure)
  10: { arabic: 'الر', readingTr: 'Elif-Lâm-Râ' },
  11: { arabic: 'الر', readingTr: 'Elif-Lâm-Râ' },
  12: { arabic: 'الر', readingTr: 'Elif-Lâm-Râ' },
  14: { arabic: 'الر', readingTr: 'Elif-Lâm-Râ' },
  15: { arabic: 'الر', readingTr: 'Elif-Lâm-Râ' },

  // Elif-Lâm-Mîm-Râ (1 sure)
  13: { arabic: 'المر', readingTr: 'Elif-Lâm-Mîm-Râ' },

  // Kâf-Hâ-Yâ-Ayn-Sâd (1 sure)
  19: { arabic: 'كهيعص', readingTr: 'Kâf-Hâ-Yâ-Ayn-Sâd' },

  // Tâ-Hâ (1 sure)
  20: { arabic: 'طه', readingTr: 'Tâ-Hâ' },

  // Tavâsîn (3 sure: 26, 27, 28)
  26: { arabic: 'طسم', readingTr: 'Tâ-Sîn-Mîm', groupNote: 'Tavâsîn' },
  27: { arabic: 'طس', readingTr: 'Tâ-Sîn', groupNote: 'Tavâsîn' },
  28: { arabic: 'طسم', readingTr: 'Tâ-Sîn-Mîm', groupNote: 'Tavâsîn' },

  // Yâ-Sîn & Sâd
  36: { arabic: 'يس', readingTr: 'Yâ-Sîn' },
  38: { arabic: 'ص', readingTr: 'Sâd' },

  // 7 Hâ-Mîm'ler / Havâmîm (7 peş peşe sure: 40–46)
  40: { arabic: 'حم', readingTr: 'Hâ-Mîm', groupNote: "7 Hâ-Mîm'ler (Havâmîm)" },
  41: { arabic: 'حم', readingTr: 'Hâ-Mîm', groupNote: "7 Hâ-Mîm'ler (Havâmîm)" },
  42: {
    arabic: 'حم عسق',
    readingTr: 'Hâ-Mîm Ayn-Sîn-Kâf',
    groupNote: "7 Hâ-Mîm'ler (Havâmîm)",
  },
  43: { arabic: 'حم', readingTr: 'Hâ-Mîm', groupNote: "7 Hâ-Mîm'ler (Havâmîm)" },
  44: { arabic: 'حم', readingTr: 'Hâ-Mîm', groupNote: "7 Hâ-Mîm'ler (Havâmîm)" },
  45: { arabic: 'حم', readingTr: 'Hâ-Mîm', groupNote: "7 Hâ-Mîm'ler (Havâmîm)" },
  46: { arabic: 'حم', readingTr: 'Hâ-Mîm', groupNote: "7 Hâ-Mîm'ler (Havâmîm)" },

  // Kâf & Nûn
  50: { arabic: 'ق', readingTr: 'Kâf' },
  68: { arabic: 'ن', readingTr: 'Nûn' },
};

/**
 * Doğrulanmış Özel Sure Aileleri (Ulûmu'l-Kur'ân)
 */
export const SPECIAL_SURAH_FAMILIES: Readonly<Record<SpecialSurahFamilyId, SpecialSurahFamilyInfo>> =
  {
    hawamim: {
      id: 'hawamim',
      title: "7 Hâ-Mîm'ler (Havâmîm)",
      shortLabel: 'Havâmîm (7 Hâ-Mîm)',
      description: 'Peş peşe "Hâ-Mîm" mukattaasıyla başlayan 7 sure (40–46).',
      surahs: [40, 41, 42, 43, 44, 45, 46],
    },
    tawasin: {
      id: 'tawasin',
      title: 'Tavâsîn Sureleri',
      shortLabel: 'Tavâsîn (طسم / طس)',
      description: 'Tâ-Sîn-Mîm ve Tâ-Sîn harfleriyle peş peşe başlayan 3 sure (26–28).',
      surahs: [26, 27, 28],
    },
    musabbihat: {
      id: 'musabbihat',
      title: 'Müsebbihât Sureleri',
      shortLabel: 'Müsebbihât (Tesbih)',
      description: 'Allah’ı tesbih eden ifadelerle başlayan 7 sure.',
      surahs: [17, 57, 59, 61, 62, 64, 87],
    },
    hamidat: {
      id: 'hamidat',
      title: 'Hâmidât Sureleri',
      shortLabel: 'Hâmidât (Elhamdülillâh)',
      description: '"Elhamdülillâh" hamdiyle başlayan 5 sure.',
      surahs: [1, 6, 18, 34, 35],
    },
    qulSurahs: {
      id: 'qulSurahs',
      title: '"Kul" Emriyle Başlayan Sureler',
      shortLabel: '"Kul" ile Başlayan (5 Sure)',
      description: 'Doğrudan "De ki (Kul)" hitabıyla başlayan 5 sure.',
      surahs: [72, 109, 112, 113, 114],
    },
    prophetNamed: {
      id: 'prophetNamed',
      title: 'Peygamber İsmi Taşıyan Sureler',
      shortLabel: 'Peygamber İsimli (6 Sure)',
      description: 'Doğrudan bir peygamberin adını taşıyan 6 sure.',
      surahs: [10, 11, 12, 14, 47, 71],
    },
    sajdahSurahs: {
      id: 'sajdahSurahs',
      title: 'Tilâvet Secdesi Bulunan Sureler',
      shortLabel: 'Tilâvet Secdesi (14 Sure)',
      description: 'İçerisinde tilâvet secdesi ayeti bulunan 14 sure.',
      surahs: [7, 13, 16, 17, 19, 22, 25, 27, 32, 38, 41, 53, 84, 96],
    },
  };

/** 29 Mukattaa sure numarası (sıralı) */
export const MUKATTAA_SURAH_NOS: readonly number[] = Object.keys(MUKATTAA_MAP)
  .map(Number)
  .sort((a, b) => a - b);

/** Kademe 1: Namaz Sureleri (1 ve 105–114) */
export const NAMAZ_SURAH_NOS: readonly number[] = [
  1, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
];

/** Kademe 2: 30. Cüz / Amme Cüzü (78–114) */
export const AMME_SURAH_NOS: readonly number[] = Array.from({ length: 37 }, (_, i) => 78 + i);

/** Kademe 3: Seçme Meşhur Sureler (18 sure) */
export const FAMOUS_SURAH_NOS: readonly number[] = [
  1, 2, 12, 17, 18, 19, 24, 31, 36, 44, 48, 49, 55, 56, 59, 62, 67, 76,
];

/** Kademe 4: Özel Sure Gruplarındaki tüm sure numaraları (tekrarsız, sıralı) */
export const SPECIAL_GROUPS_SURAH_NOS: readonly number[] = (() => {
  const set = new Set<number>(MUKATTAA_SURAH_NOS);
  for (const family of Object.values(SPECIAL_SURAH_FAMILIES)) {
    for (const no of family.surahs) {
      set.add(no);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
})();

export function getSurahMukattaa(surahNo: number): MukattaaEntry | null {
  return MUKATTAA_MAP[surahNo] ?? null;
}

export function getSurahFamilies(surahNo: number): SpecialSurahFamilyInfo[] {
  const list: SpecialSurahFamilyInfo[] = [];
  for (const family of Object.values(SPECIAL_SURAH_FAMILIES)) {
    if (family.surahs.includes(surahNo)) {
      list.push(family);
    }
  }
  return list;
}

/**
 * Bir surenin oyunda kart/ipucu olarak gösterilebilecek en ayırt edici Ulûmu'l-Kur'ân niteliğini döndürür.
 */
export function getSurahPrimarySpecialTrait(surahNo: number): {
  label: string;
  arabic?: string;
  badge: string;
} | null {
  const mukattaa = getSurahMukattaa(surahNo);
  const families = getSurahFamilies(surahNo);

  // Havâmîm öncelikli (40-46)
  if (SPECIAL_SURAH_FAMILIES.hawamim.surahs.includes(surahNo) && mukattaa) {
    return {
      label: `7 Hâ-Mîm'ler (Havâmîm) · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Havâmîm',
    };
  }

  // Tavâsîn (26-28)
  if (SPECIAL_SURAH_FAMILIES.tawasin.surahs.includes(surahNo) && mukattaa) {
    return {
      label: `Tavâsîn · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Tavâsîn',
    };
  }

  // Benzersiz / nadir mukattaa harfleri (7, 13, 19, 20, 36, 38, 50, 68)
  if (mukattaa && [7, 13, 19, 20, 36, 38, 50, 68].includes(surahNo)) {
    return {
      label: `Hurûf-u Mukattaa · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Mukattaa',
    };
  }

  // Hâmidât (1, 6, 18, 34, 35)
  const hamidat = families.find((f) => f.id === 'hamidat');
  if (hamidat) {
    return {
      label: '"Elhamdülillâh" ile Başlayan (Hâmidât)',
      badge: 'Hâmidât',
    };
  }

  // Müsebbihât (17, 57, 59, 61, 62, 64, 87)
  const musabbihat = families.find((f) => f.id === 'musabbihat');
  if (musabbihat) {
    return {
      label: 'Tesbih ile Başlayan (Müsebbihât)',
      badge: 'Müsebbihât',
    };
  }

  // "Kul" ile başlayan (72, 109, 112, 113, 114)
  const qul = families.find((f) => f.id === 'qulSurahs');
  if (qul) {
    return {
      label: '"Kul" (De ki) Emriyle Başlayan Sure',
      badge: 'Kul Suresi',
    };
  }

  // Peygamber isimli (10, 11, 12, 14, 47, 71)
  const prophet = families.find((f) => f.id === 'prophetNamed');
  if (prophet) {
    return {
      label: mukattaa
        ? `Peygamber İsimli · ${mukattaa.readingTr}`
        : 'Peygamber İsmi Taşıyan Sure',
      arabic: mukattaa?.arabic,
      badge: 'Peygamber İsimli',
    };
  }

  // Diğer mukattaa sureleri (2, 3, 15, 29, 30, 31, 32)
  if (mukattaa) {
    return {
      label: `Hurûf-u Mukattaa · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Mukattaa',
    };
  }

  // Tilâvet secdesi bulunanlar
  const sajdah = families.find((f) => f.id === 'sajdahSurahs');
  if (sajdah) {
    return {
      label: 'Tilâvet Secdesi Bulunan Sure (14 Sure)',
      badge: 'Tilâvet Secdesi',
    };
  }

  return null;
}

/**
 * Bir surenin tüm özel grup etiketlerini kısa dizge olarak verir (Özet / Künye kartı için).
 */
export function getSurahSpecialSummaryText(surahNo: number): string | null {
  const parts: string[] = [];
  const mukattaa = getSurahMukattaa(surahNo);
  if (mukattaa) {
    parts.push(`${mukattaa.arabic} (${mukattaa.readingTr})`);
  }
  const families = getSurahFamilies(surahNo);
  for (const fam of families) {
    // Havâmîm veya Tavâsîn zaten mukattaa ile ilişkili ama açıkça göstermek eğitici
    parts.push(fam.shortLabel);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
