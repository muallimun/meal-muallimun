// ============================================================================
// Ulûmu'l-Kur'ân 15 Doğrulanmış Özel Sure Grubu & 29 Hurûf-u Mukattaa Ansiklopedisi
// ============================================================================

export interface MukattaaEntry {
  arabic: string;
  readingTr: string;
  groupNote?: string;
}

export type SurahGroupId =
  | 'hawamim'
  | 'musabbihat'
  | 'hamidat'
  | 'tawasin'
  | 'alm'
  | 'alr'
  | 'single_muqattaat'
  | 'qul'
  | 'nida'
  | 'tabaraka'
  | 'idha'
  | 'qasam_waw'
  | 'prophets'
  | 'animals'
  | 'sajdah';

export type SurahGroupCategory = 'mukattaa' | 'baslangic' | 'isim_ve_ozellik';

export interface SurahGroupCatalogItem {
  id: SurahGroupId;
  title: string;
  arabicTitle: string;
  shortLabel: string;
  badgeText: string;
  category: SurahGroupCategory;
  description: string;
  distinguishingTip: string;
  surahs: readonly number[];
  /** Çeldirici sorularında en öğretici komşu / karıştırılan sure numaraları */
  smartDistractors: readonly number[];
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
 * [2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32, 36, 38,
 *  40, 41, 42, 43, 44, 45, 46, 50, 68]
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
 * 15 Doğrulanmış Klasik Ulûmu'l-Kur'ân Sure Grubu Ansiklopedisi
 */
export const SURAH_GROUP_ATLAS: readonly SurahGroupCatalogItem[] = [
  {
    id: 'hawamim',
    title: "Havâmîm (7 Hâ-Mîm'ler)",
    arabicTitle: 'الحواميم',
    shortLabel: 'Havâmîm (حم)',
    badgeText: 'حم · 7 Sure',
    category: 'mukattaa',
    description:
      'Mushaf’ta hiç ara vermeden peş peşe "حم" mukattaası ile başlayan 7 Mekkî sure (40–46). Klasik kaynaklarda "Âl-i Hâ-Mîm" olarak da anılır.',
    distinguishingTip:
      '40. Mü’min’den 46. Ahkâf’a kesintisiz sıralanır; 42. Şûrâ "حم عسق" şeklinde çift mukattaalıdır. 39. Zümer ve 47. Muhammed bu gruba dâhil değildir.',
    surahs: [40, 41, 42, 43, 44, 45, 46],
    smartDistractors: [39, 47, 38, 50, 36],
  },
  {
    id: 'musabbihat',
    title: 'Müsebbihât (Tesbih ile Başlayanlar)',
    arabicTitle: 'المسبحات',
    shortLabel: 'Müsebbihât (Tesbih)',
    badgeText: 'Tesbih · 7 Sure',
    category: 'baslangic',
    description:
      'İlk kelimesi tesbih kökünden (سُبْحَانَ / سَبَّحَ / يُسَبِّحُ / سَبِّحِ) gelen 7 sure: İsrâ, Hadîd, Haşr, Saf, Cum’a, Tegâbün ve A’lâ.',
    distinguishingTip:
      'İsrâ "Sübhâne", Hadîd-Haşr-Saf "Sebbeha", Cum’a-Tegâbün "Yüsebbihu", A’lâ ise "Sebbih" emriyle başlar. 58. Mücâdele ve 60. Mümtehine Müsebbihât değildir.',
    surahs: [17, 57, 59, 61, 62, 64, 87],
    smartDistractors: [58, 60, 63, 18, 67, 88],
  },
  {
    id: 'hamidat',
    title: 'Hâmidât ("Elhamdülillâh" ile Başlayanlar)',
    arabicTitle: 'الحامدات',
    shortLabel: 'Hâmidât (الحمد)',
    badgeText: 'الحمد · 5 Sure',
    category: 'baslangic',
    description:
      'Doğrudan "الْحَمْدُ لِلَّهِ" hamd ifadesiyle başlayan 5 sure: Fâtiha, En’âm, Kehf, Sebe’ ve Fâtır.',
    distinguishingTip:
      'Sadece 5 sure "Elhamdülillâh" ile başlar. 17. İsrâ "Sübhâne", 67. Mülk ise "Tebâreke" ile başlar.',
    surahs: [1, 6, 18, 34, 35],
    smartDistractors: [17, 25, 36, 67, 7, 19],
  },
  {
    id: 'tawasin',
    title: 'Tavâsîn (طسم / طس Ardışık Üçlüsü)',
    arabicTitle: 'الطواسين',
    shortLabel: 'Tavâsîn (طسم/طس)',
    badgeText: 'طسم/طس · 3 Sure',
    category: 'mukattaa',
    description:
      'Mushaf’ta peş peşe yer alan Şuarâ (طسم), Neml (طس) ve Kasas (طسم) surelerinden oluşan 3’lü mukattaa ailesi.',
    distinguishingTip:
      'Ortadaki 27. Neml "طس" (Mîm’siz), iki yanındaki 26. Şuarâ ve 28. Kasas ise "طسم" ile başlar. 20. Tâ-Hâ (طه) bu üçlüde değildir.',
    surahs: [26, 27, 28],
    smartDistractors: [20, 25, 29, 36, 19],
  },
  {
    id: 'alm',
    title: 'Elif-Lâm-Mîm (الم) Ailesi',
    arabicTitle: 'الم',
    shortLabel: 'Elif-Lâm-Mîm (الم)',
    badgeText: 'الم · 6 Sure',
    category: 'mukattaa',
    description:
      'Yalın "الم" mukattaası ile başlayan 6 sure: Bakara, Âl-i İmrân, Ankebût, Rûm, Lokmân ve Secde.',
    distinguishingTip:
      'İlk 2’si Medenî (Bakara, Âl-i İmrân), son 4’ü peş peşe Mekkîdir (29–32). Dikkat: 7. A’râf "المص" ve 13. Ra’d "المر" ile başlar.',
    surahs: [2, 3, 29, 30, 31, 32],
    smartDistractors: [7, 13, 4, 28, 33, 10],
  },
  {
    id: 'alr',
    title: 'Elif-Lâm-Râ (الر) Ailesi',
    arabicTitle: 'الر',
    shortLabel: 'Elif-Lâm-Râ (الر)',
    badgeText: 'الر · 5 Sure',
    category: 'mukattaa',
    description:
      'Yalın "الر" mukattaası ile başlayan 5 sure: Yûnus, Hûd, Yûsuf, İbrâhîm ve Hicr.',
    distinguishingTip:
      'Aralarında bulunan 13. Ra’d Suresi "الر" değil, "المر" (Elif-Lâm-Mîm-Râ) ile başlar!',
    surahs: [10, 11, 12, 14, 15],
    smartDistractors: [13, 16, 7, 9, 17],
  },
  {
    id: 'single_muqattaat',
    title: 'Tek Harfli Mukattaalar',
    arabicTitle: 'الحروف المفردة',
    shortLabel: 'Tek Harfli (ص·ق·ن)',
    badgeText: 'ص · ق · ن',
    category: 'mukattaa',
    description:
      'Tek bir mukattaa harfiyle başlayan 3 Mekkî sure: 38. Sâd (ص), 50. Kâf (ق) ve 68. Kalem (ن).',
    distinguishingTip:
      '20. Tâ-Hâ (طه), 27. Neml (طس), 36. Yâsîn (يس) ve 40. Mü’min (حم) iki harfli mukattaalardır.',
    surahs: [38, 50, 68],
    smartDistractors: [36, 20, 27, 40, 19],
  },
  {
    id: 'qul',
    title: 'Kâlâkıl — "Kul" (قُلْ) Emriyle Başlayanlar',
    arabicTitle: 'القلاقل',
    shortLabel: 'Kâlâkıl (قُلْ)',
    badgeText: 'قُلْ · 5 Sure',
    category: 'baslangic',
    description:
      'Doğrudan "قُلْ" ("De ki!") hitabıyla başlayan 5 sure: Cin, Kâfirûn, İhlâs, Felak ve Nâs.',
    distinguishingTip:
      'Klasik kaynaklarda 4 Mekkî "Kul" suresi (Kâfirûn, İhlâs, Felak, Nâs) "Kâlâkıl / Dört Kul" olarak anılır; Cin suresiyle birlikte Kur’an’da "Kul" emriyle başlayan toplam 5 sure vardır. Son ikisi (113. Felak ve 114. Nâs) "Muavvizeteyn"dir.',
    surahs: [72, 109, 112, 113, 114],
    smartDistractors: [108, 110, 111, 107, 1, 71],
  },
  {
    id: 'nida',
    title: 'Nidâ (يَا أَيُّهَا) Hitabıyla Başlayanlar',
    arabicTitle: 'سور النداء',
    shortLabel: 'Nidâ (يَا أَيُّهَا)',
    badgeText: 'يَا أَيُّهَا · 10 Sure',
    category: 'baslangic',
    description:
      'Doğrudan "Ey insanlar / Ey iman edenler / Ey Peygamber" (يَا أَيُّهَا) çağrısıyla başlayan 10 sure.',
    distinguishingTip:
      'Nisâ ve Hac insanlara; Mâide, Hucurât ve Mümtehine mü’minlere; Ahzâb, Talâk, Tahrîm, Müzzemmil ve Müddessir ise Hz. Peygamber’e hitap eder.',
    surahs: [4, 5, 22, 33, 49, 60, 65, 66, 73, 74],
    smartDistractors: [2, 3, 8, 9, 24, 58, 63],
  },
  {
    id: 'tabaraka',
    title: 'Tebâreke (تَبَارَكَ) ile Başlayan İkili',
    arabicTitle: 'تبارك',
    shortLabel: 'Tebâreke (2 Sure)',
    badgeText: 'تَبَارَكَ · 2 Sure',
    category: 'baslangic',
    description:
      'Doğrudan "تَبَارَكَ" (yücelik ve bereket) lafzıyla başlayan iki Mekkî sure: 25. Furkân ve 67. Mülk.',
    distinguishingTip:
      'Kur’ân’da "Tebâreke" kelimesiyle başlayan yalnızca 2 sure vardır. 67. Mülk aynı zamanda 29. cüze (Tebâreke Cüzü) adını verir.',
    surahs: [25, 67],
    smartDistractors: [17, 18, 34, 68, 55, 56],
  },
  {
    id: 'idha',
    title: '"İzâ" (إِذَا) ile Başlayan Sureler',
    arabicTitle: 'سور إذا',
    shortLabel: 'İzâ (إِذَا · 7 Sure)',
    badgeText: 'إِذَا · 7 Sure',
    category: 'baslangic',
    description:
      '"إِذَا" ("...dığı zaman") şart edatıyla başlayan 7 sure: Vâkıa, Münâfikûn, Tekvîr, İnfitâr, İnşikâk, Zilzâl ve Nasr.',
    distinguishingTip:
      'Çoğunluğu kıyamet ve fetih sahnelerini tasvir eder. 83. Mutaffifîn ("Veyl") ve 101. Kâria bu grupta değildir.',
    surahs: [56, 63, 81, 82, 84, 99, 110],
    smartDistractors: [83, 101, 78, 88, 100, 109],
  },
  {
    id: 'qasam_waw',
    title: 'Vâv-ı Kasem (وَ — Yemin) ile Başlayanlar',
    arabicTitle: 'سور القسم',
    shortLabel: 'Kasem / Yemin (15 Sure)',
    badgeText: 'وَ · 15 Sure',
    category: 'baslangic',
    description:
      'Yemin vâv’ı (وَ) ile başlayan ve tamamı Mekkî olan 15 sure: Sâffât, Zâriyât, Tûr, Necm, Mürselât, Nâziât, Bürûc, Târık, Fecr, Şems, Leyl, Duhâ, Tîn, Âdiyât ve Asr.',
    distinguishingTip:
      'Tamamı Mekkîdir. 75. Kıyâme ve 90. Beled "Lâ uksimu" ile başladığı için Vâv-ı Kasem listesinin dışındadır.',
    surahs: [37, 51, 52, 53, 77, 79, 85, 86, 89, 91, 92, 93, 95, 100, 103],
    smartDistractors: [75, 90, 94, 96, 102, 104, 78],
  },
  {
    id: 'prophets',
    title: 'Peygamber İsmi Taşıyan Sureler',
    arabicTitle: 'سور الأنبياء',
    shortLabel: 'Peygamber İsimli (6 Sure)',
    badgeText: '6 Peygamber',
    category: 'isim_ve_ozellik',
    description:
      'Doğrudan bir peygamberin adını taşıyan 6 sure: Yûnus, Hûd, Yûsuf, İbrâhîm, Muhammed ve Nûh.',
    distinguishingTip:
      '19. Meryem ve 31. Lokmân peygamber değil salih kimselerin adlarını taşır; 21. Enbiyâ ise çoğul ("Peygamberler") anlamındadır.',
    surahs: [10, 11, 12, 14, 47, 71],
    smartDistractors: [19, 31, 21, 3, 20, 36],
  },
  {
    id: 'animals',
    title: 'Canlı / Hayvan İsmi Taşıyan Sureler',
    arabicTitle: 'سور الكائنات',
    shortLabel: 'Canlı İsimli (6 Sure)',
    badgeText: '6 Sure',
    category: 'isim_ve_ozellik',
    description:
      'İsmini bir canlıdan alan 6 sure: Bakara (İnek), En’âm (Ehli Hayvanlar), Nahl (Bal Arısı), Neml (Karınca), Ankebût (Örümcek) ve Fîl (Fil).',
    distinguishingTip:
      '100. Âdiyât (koşan atlar/süvariler) sıfat formundadır; klasik 6’lı canlı isimli sure listesi Bakara, En’âm, Nahl, Neml, Ankebût ve Fîl’dir.',
    surahs: [2, 6, 16, 27, 29, 105],
    smartDistractors: [100, 13, 57, 95, 106, 72],
  },
  {
    id: 'sajdah',
    title: 'Tilâvet Secdesi Bulunan Sureler',
    arabicTitle: 'سور السجدة',
    shortLabel: 'Tilâvet Secdesi (14 Sure)',
    badgeText: '۩ · 14 Sure',
    category: 'isim_ve_ozellik',
    description:
      'İçerisinde tilâvet secdesi ayeti barındıran 14 sure: A’râf, Ra’d, Nahl, İsrâ, Meryem, Hac, Furkân, Neml, Secde, Sâd, Fussilet, Necm, İnşikâk ve Alak.',
    distinguishingTip:
      'Hanefî mezhebi ve Türkiye/Diyanet Mushaf tertibine göre 14 surede 14 tilâvet secdesi yer alır (Şâfiî ve Hanbelî’de Hac 22/77 ikinci secde sayılırken Sâd 38/24 şükür secdesi kabul edilir).',
    surahs: [7, 13, 16, 17, 19, 22, 25, 27, 32, 38, 41, 53, 84, 96],
    smartDistractors: [2, 18, 36, 40, 67, 87, 97],
  },
];

export const SURAH_GROUP_BY_ID: Readonly<Record<SurahGroupId, SurahGroupCatalogItem>> =
  SURAH_GROUP_ATLAS.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<SurahGroupId, SurahGroupCatalogItem>,
  );

/**
 * Geriye dönük uyumluluk için mevcut SPECIAL_SURAH_FAMILIES yapısı korunur.
 */
export const SPECIAL_SURAH_FAMILIES: Readonly<Record<SpecialSurahFamilyId, SpecialSurahFamilyInfo>> =
  {
    hawamim: {
      id: 'hawamim',
      title: SURAH_GROUP_BY_ID.hawamim.title,
      shortLabel: SURAH_GROUP_BY_ID.hawamim.shortLabel,
      description: SURAH_GROUP_BY_ID.hawamim.description,
      surahs: SURAH_GROUP_BY_ID.hawamim.surahs,
    },
    tawasin: {
      id: 'tawasin',
      title: SURAH_GROUP_BY_ID.tawasin.title,
      shortLabel: SURAH_GROUP_BY_ID.tawasin.shortLabel,
      description: SURAH_GROUP_BY_ID.tawasin.description,
      surahs: SURAH_GROUP_BY_ID.tawasin.surahs,
    },
    musabbihat: {
      id: 'musabbihat',
      title: SURAH_GROUP_BY_ID.musabbihat.title,
      shortLabel: SURAH_GROUP_BY_ID.musabbihat.shortLabel,
      description: SURAH_GROUP_BY_ID.musabbihat.description,
      surahs: SURAH_GROUP_BY_ID.musabbihat.surahs,
    },
    hamidat: {
      id: 'hamidat',
      title: SURAH_GROUP_BY_ID.hamidat.title,
      shortLabel: SURAH_GROUP_BY_ID.hamidat.shortLabel,
      description: SURAH_GROUP_BY_ID.hamidat.description,
      surahs: SURAH_GROUP_BY_ID.hamidat.surahs,
    },
    qulSurahs: {
      id: 'qulSurahs',
      title: SURAH_GROUP_BY_ID.qul.title,
      shortLabel: SURAH_GROUP_BY_ID.qul.shortLabel,
      description: SURAH_GROUP_BY_ID.qul.description,
      surahs: SURAH_GROUP_BY_ID.qul.surahs,
    },
    prophetNamed: {
      id: 'prophetNamed',
      title: SURAH_GROUP_BY_ID.prophets.title,
      shortLabel: SURAH_GROUP_BY_ID.prophets.shortLabel,
      description: SURAH_GROUP_BY_ID.prophets.description,
      surahs: SURAH_GROUP_BY_ID.prophets.surahs,
    },
    sajdahSurahs: {
      id: 'sajdahSurahs',
      title: SURAH_GROUP_BY_ID.sajdah.title,
      shortLabel: SURAH_GROUP_BY_ID.sajdah.shortLabel,
      description: SURAH_GROUP_BY_ID.sajdah.description,
      surahs: SURAH_GROUP_BY_ID.sajdah.surahs,
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
  for (const group of SURAH_GROUP_ATLAS) {
    for (const no of group.surahs) {
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
 * Bir surenin 15 klasik gruptan hangilerine ait olduğunu döndürür.
 */
export function getSurahAtlasGroups(surahNo: number): SurahGroupCatalogItem[] {
  return SURAH_GROUP_ATLAS.filter((g) => g.surahs.includes(surahNo));
}

/**
 * 9. Tevbe (Besmelesiz tek sure), 27. Neml (İki besmeleli sure) ve kritik istisnalar için özel notlar.
 */
export function getSurahUniqueFeatureNote(surahNo: number): string | null {
  switch (surahNo) {
    case 9:
      return 'Kur’ân-ı Kerîm’de başında Besmele bulunmayan tek suredir.';
    case 27:
      return 'Başında ve 30. ayetinde (Hz. Süleyman’ın mektubunda) olmak üzere iki Besmele bulunan tek suredir.';
    case 13:
      return 'Elif-Lâm-Râ (الر) surelerinin arasında yer almasına rağmen Elif-Lâm-Mîm-Râ (المر) ile başlar.';
    case 7:
      return 'Yalın الم değil, المص (Elif-Lâm-Mîm-Sâd) mukattaası ile başlar.';
    case 42:
      return '7 Hâ-Mîm (Havâmîm) içindeki çift mukattaalı tek suredir (حم عسق).';
    case 113:
    case 114:
      return 'Felak ve Nâs birlikte Muavvizeteyn (iki sığınma suresi) olarak anılır.';
    default:
      return null;
  }
}

/**
 * Bir çeldirici surenin hedef gruba NEDEN dâhil olmadığını açıklayan pedagojik cümle üretir.
 */
export function explainWhyNotInGroup(
  distractorNo: number,
  distractorNameTr: string,
  targetGroup: SurahGroupCatalogItem,
): string {
  const uniqueNote = getSurahUniqueFeatureNote(distractorNo);
  if (
    uniqueNote &&
    ((targetGroup.id === 'alr' && distractorNo === 13) ||
      (targetGroup.id === 'alm' && (distractorNo === 7 || distractorNo === 13)))
  ) {
    return `${distractorNo}. ${distractorNameTr} Suresi: ${uniqueNote}`;
  }

  const muk = getSurahMukattaa(distractorNo);
  const actualGroups = getSurahAtlasGroups(distractorNo);

  if (targetGroup.category === 'mukattaa') {
    if (muk) {
      return `${distractorNo}. ${distractorNameTr} Suresi bu grupta değildir; ${muk.arabic} (${muk.readingTr}) mukattaası ile başlar.`;
    }
    return `${distractorNo}. ${distractorNameTr} Suresi Hurûf-u Mukattaa ile başlamaz; ${targetGroup.shortLabel} grubuna dâhil değildir.`;
  }

  if (actualGroups.length > 0) {
    return `${distractorNo}. ${distractorNameTr} Suresi ${targetGroup.shortLabel} üyesi değildir; ${actualGroups[0].shortLabel} grubundandır.`;
  }

  if (uniqueNote) {
    return `${distractorNo}. ${distractorNameTr} Suresi ${targetGroup.shortLabel} üyesi değildir. (${uniqueNote})`;
  }

  return `${distractorNo}. ${distractorNameTr} Suresi ${targetGroup.shortLabel} grubuna dâhil değildir. ${targetGroup.distinguishingTip}`;
}

export function getSurahPrimarySpecialTrait(surahNo: number): {
  label: string;
  arabic?: string;
  badge: string;
} | null {
  const mukattaa = getSurahMukattaa(surahNo);
  const groups = getSurahAtlasGroups(surahNo);

  if (SURAH_GROUP_BY_ID.hawamim.surahs.includes(surahNo) && mukattaa) {
    return {
      label: `7 Hâ-Mîm'ler (Havâmîm) · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Havâmîm',
    };
  }
  if (SURAH_GROUP_BY_ID.tawasin.surahs.includes(surahNo) && mukattaa) {
    return {
      label: `Tavâsîn · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Tavâsîn',
    };
  }
  if (mukattaa && [7, 13, 19, 20, 36, 38, 50, 68].includes(surahNo)) {
    return {
      label: `Hurûf-u Mukattaa · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Mukattaa',
    };
  }

  const priorityOrder: SurahGroupId[] = [
    'hamidat',
    'musabbihat',
    'qul',
    'tabaraka',
    'prophets',
    'animals',
    'idha',
    'nida',
    'qasam_waw',
    'sajdah',
  ];

  for (const gid of priorityOrder) {
    const matched = groups.find((g) => g.id === gid);
    if (matched) {
      return {
        label: mukattaa ? `${matched.title} · ${mukattaa.readingTr}` : matched.title,
        arabic: mukattaa?.arabic,
        badge: matched.shortLabel,
      };
    }
  }

  if (mukattaa) {
    return {
      label: `Hurûf-u Mukattaa · ${mukattaa.readingTr}`,
      arabic: mukattaa.arabic,
      badge: 'Mukattaa',
    };
  }

  return null;
}

export function getSurahSpecialSummaryText(surahNo: number): string | null {
  const parts: string[] = [];
  const mukattaa = getSurahMukattaa(surahNo);
  if (mukattaa) {
    parts.push(`${mukattaa.arabic} (${mukattaa.readingTr})`);
  }
  const groups = getSurahAtlasGroups(surahNo);
  for (const g of groups) {
    if (!parts.includes(g.shortLabel)) {
      parts.push(g.shortLabel);
    }
  }
  const uniqueNote = getSurahUniqueFeatureNote(surahNo);
  if (uniqueNote && parts.length === 0) {
    parts.push(uniqueNote);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
