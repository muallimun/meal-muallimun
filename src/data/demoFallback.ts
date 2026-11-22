import type {
  ArabicSurahFile,
  ManifestData,
  MealSurahFile,
  MetaData,
  QuestionIndexFile,
  QuestionSurahFile,
  WordSurahFile,
} from '../types/quran';

export const DEMO_MANIFEST: ManifestData = {
  app: "Muallimun Kur'an & Meal",
  domain: 'https://kuran.muallimun.net',
  schemaVersion: 2,
  dataVersion: 'demo-local',
  defaultPool: {
    mode: 'CUSTOM',
    surahs: [17, 24, 31, 49],
    juzs: [],
    preferredMeal: 'm1',
    arabicAudio: 'maher_al_muaiqly',
    mealAudio: 'tdv',
  },
  meals: {
    m1: { id: 'm1', label: 'Diyanet Vakfı Meali (TDV)', audioSource: 'tdv' },
    m2: { id: 'm2', label: 'Diyanet İşleri Meali (Yeni)', audioSource: 'dib' },
  },
  audioSources: {
    hatim: {
      id: 'hatim',
      kind: 'ar',
      label: 'İshak Danış (Hatim)',
      baseUrl: '',
      ext: 'mp3',
    },
    tdv: {
      id: 'tdv',
      kind: 'meal',
      mealId: 'm1',
      label: 'TDV Meali (Seyfullah Kartal)',
      baseUrl: '',
      ext: 'mp3',
    },
    dib: {
      id: 'dib',
      kind: 'meal',
      mealId: 'm2',
      label: 'DİB Yeni Meal (Mehmet Emin Ay)',
      baseUrl: '',
      ext: 'mp3',
    },
  },
  stats: {
    surahs: 5,
    juzs: 4,
    ayahs: 234,
    words: 2840,
    questions: 4,
    questionSurahs: [17, 24, 31, 49],
  },
};

export const DEMO_META: MetaData = {
  schemaVersion: 2,
  dataVersion: 'demo-local',
  besmele: {
    ayahId: 1001,
    audioCode: '001001',
    excludeSurahs: [1, 9],
    ar: 'بِسْمِ اللَّهِ اَلرَّحْمٰنِ الرَّحِيمِ',
    tdv: "Rahmân ve rahîm olan Allah'ın adıyla.",
    dib: 'Bismillâhirrahmânirrahîm.',
  },
  surahs: [
    {
      no: 1,
      nuzulSirasi: 5,
      nameTr: 'Fâtiha Suresi',
      nameAr: 'سُورَةُ الفَاتِحَة',
      type: 'Mekkî',
      ayahCount: 7,
      shortNameTr: 'Fatiha',
      cuzs: [1],
      pageStart: 1,
      pageEnd: 1,
      firstId: 1001,
      lastId: 1007,
      questionCount: 0,
    },
    {
      no: 17,
      nuzulSirasi: 50,
      nameTr: 'İsrâ Suresi',
      nameAr: 'سُورَةُ الإِسرَاء',
      type: 'Mekkî',
      ayahCount: 111,
      shortNameTr: 'İsrâ',
      cuzs: [15],
      pageStart: 281,
      pageEnd: 292,
      firstId: 17001,
      lastId: 17111,
      questionCount: 1,
    },
    {
      no: 24,
      nuzulSirasi: 102,
      nameTr: 'Nûr Suresi',
      nameAr: 'سُورَةُ النُّور',
      type: 'Medenî',
      ayahCount: 64,
      shortNameTr: 'Nûr',
      cuzs: [18],
      pageStart: 349,
      pageEnd: 358,
      firstId: 24001,
      lastId: 24064,
      questionCount: 1,
    },
    {
      no: 31,
      nuzulSirasi: 57,
      nameTr: 'Lokmân Suresi',
      nameAr: 'سُورَةُ لُقمَان',
      type: 'Mekkî',
      ayahCount: 34,
      shortNameTr: 'Lokmân',
      cuzs: [21],
      pageStart: 410,
      pageEnd: 413,
      firstId: 31001,
      lastId: 31034,
      questionCount: 1,
    },
    {
      no: 49,
      nuzulSirasi: 106,
      nameTr: 'Hucurât Suresi',
      nameAr: 'سُورَةُ الحُجُرَات',
      type: 'Medenî',
      ayahCount: 18,
      shortNameTr: 'Hucurât',
      cuzs: [26],
      pageStart: 514,
      pageEnd: 516,
      firstId: 49001,
      lastId: 49018,
      questionCount: 1,
    },
  ],
  juzs: [
    {
      no: 1,
      ayahCount: 7,
      surahs: [1],
      surahCounts: { '1': 7 },
      firstId: 1001,
      lastId: 1007,
      start: { s: 1, a: 1 },
      end: { s: 1, a: 7 },
    },
    {
      no: 15,
      ayahCount: 111,
      surahs: [17],
      surahCounts: { '17': 111 },
      firstId: 17001,
      lastId: 17111,
      start: { s: 17, a: 1 },
      end: { s: 17, a: 111 },
    },
    {
      no: 18,
      ayahCount: 64,
      surahs: [24],
      surahCounts: { '24': 64 },
      firstId: 24001,
      lastId: 24064,
      start: { s: 24, a: 1 },
      end: { s: 24, a: 64 },
    },
    {
      no: 21,
      ayahCount: 34,
      surahs: [31],
      surahCounts: { '31': 34 },
      firstId: 31001,
      lastId: 31034,
      start: { s: 31, a: 1 },
      end: { s: 31, a: 34 },
    },
    {
      no: 26,
      ayahCount: 18,
      surahs: [49],
      surahCounts: { '49': 18 },
      firstId: 49001,
      lastId: 49018,
      start: { s: 49, a: 1 },
      end: { s: 49, a: 18 },
    },
  ],
  presets: [
    { id: 'pilot', label: 'Hazır Soru Havuzu (Örnek)', mode: 'SURAHS', surahs: [17, 24, 31, 49] },
    { id: 'all', label: 'Tüm Örnek Sureler', mode: 'ALL', surahs: [1, 17, 24, 31, 49] },
  ],
  verseIndexSchema: ['id', 'surah', 'ayah', 'cuz', 'page', 'flags'],
  verseIndexFlags: {
    muqattaat: 1,
    arDupCrossSurah: 2,
    tdvDupCrossSurah: 4,
    dibDupCrossSurah: 8,
    tdvHasFootnote: 16,
    dibHasFootnote: 32,
    tdvMergedGroup: 64,
    dibMergedGroup: 128,
  },
  verseIndex: [
    [1001, 1, 1, 1, 1, 0],
    [17009, 17, 9, 15, 282, 0],
    [24035, 24, 35, 18, 354, 0],
    [31017, 31, 17, 21, 412, 0],
    [49010, 49, 10, 26, 515, 0],
    [49013, 49, 13, 26, 516, 0],
  ],
};

export const DEMO_QUESTION_INDEX: QuestionIndexFile = {
  version: 'demo-local',
  availableSurahs: [17, 24, 31, 49],
  items: [
    {
      id: 'Q_017_001',
      surah: 17,
      cuz: 15,
      scope: 'ayah',
      refs: [[17, 9, 9]],
      mealBasis: 'tdv',
      type: 'mcq',
      difficulty: 1,
      status: 'verified',
    },
    {
      id: 'Q_024_001',
      surah: 24,
      cuz: 18,
      scope: 'ayah',
      refs: [[24, 35, 35]],
      mealBasis: 'tdv',
      type: 'mcq',
      difficulty: 1,
      status: 'verified',
    },
    {
      id: 'Q_031_001',
      surah: 31,
      cuz: 21,
      scope: 'ayah',
      refs: [[31, 17, 17]],
      mealBasis: 'tdv',
      type: 'mcq',
      difficulty: 1,
      status: 'verified',
    },
    {
      id: 'Q_049_001',
      surah: 49,
      cuz: 26,
      scope: 'ayah',
      refs: [[49, 10, 10]],
      mealBasis: 'tdv',
      type: 'mcq',
      difficulty: 1,
      status: 'verified',
    },
  ],
};

export const DEMO_ARABIC_SURAHS: Record<number, ArabicSurahFile> = {
  17: {
    s: 17,
    verses: [
      {
        id: 17009,
        a: 9,
        c: 15,
        p: 282,
        t: 'اِنَّ هٰذَا الْقُرْاٰنَ يَهْد۪ي لِلَّت۪ي هِيَ اَقْوَمُ وَيُبَشِّرُ الْمُؤْمِن۪ينَ الَّذ۪ينَ يَعْمَلُونَ الصَّالِحَاتِ اَنَّ لَهُمْ اَجْرًا كَب۪يرًاۙ',
        wc: 18,
      },
    ],
  },
  24: {
    s: 24,
    verses: [
      {
        id: 24035,
        a: 35,
        c: 18,
        p: 354,
        t: 'اَللّٰهُ نُورُ السَّمٰوَاتِ وَالْاَرْضِۜ يَهْدِي اللّٰهُ لِنُورِه۪ مَنْ يَشَٓاءُۜ',
        wc: 10,
      },
    ],
  },
  31: {
    s: 31,
    verses: [
      {
        id: 31017,
        a: 17,
        c: 21,
        p: 412,
        t: 'يَا بُنَيَّ اَقِمِ الصَّلٰوةَ وَاْمُرْ بِالْمَعْرُوفِ وَانْهَ عَنِ الْمُنْكَرِ وَاصْبِرْ عَلٰى مَٓا اَصَابَكَۜ اِنَّ ذٰلِكَ مِنْ عَزْمِ الْاُمُورِۚ',
        wc: 19,
      },
    ],
  },
  49: {
    s: 49,
    verses: [
      {
        id: 49010,
        a: 10,
        c: 26,
        p: 515,
        t: 'اِنَّمَا الْمُؤْمِنُونَ اِخْوَةٌ فَاَصْلِحُوا بَيْنَ اَخَوَيْكُمْ وَاتَّقُوا اللّٰهَ لَعَلَّكُمْ تُرْحَمُونَ۟',
        wc: 11,
      },
      {
        id: 49013,
        a: 13,
        c: 26,
        p: 516,
        t: 'اِنَّ اَكْرَمَكُمْ عِنْدَ اللّٰهِ اَتْقٰيكُمْۜ اِنَّ اللّٰهَ عَل۪يمٌ خَب۪يرٌ',
        wc: 9,
      },
    ],
  },
};

export const DEMO_MEAL1_SURAHS: Record<number, MealSurahFile> = {
  17: {
    s: 17,
    meal: 'tdv',
    verses: [
      {
        id: 17009,
        a: 9,
        t: "Şüphesiz bu Kur'an en doğru yola iletir; iyi davranışlarda bulunan müminlere, kendileri için büyük bir mükâfat olduğunu müjdeler.",
        len: 129,
      },
    ],
  },
  24: {
    s: 24,
    meal: 'tdv',
    verses: [
      {
        id: 24035,
        a: 35,
        t: 'Allah, göklerin ve yerin nurudur. Allah dilediği kimseyi nuruna iletir.',
        len: 71,
      },
    ],
  },
  31: {
    s: 31,
    meal: 'tdv',
    verses: [
      {
        id: 31017,
        a: 17,
        t: 'Yavrucuğum! Namazı kıl, iyiliği emret, kötülükten vazgeçirmeye çalış, başına gelenlere sabret. Doğrusu bunlar, azmedilmeye değer işlerdir.',
        len: 139,
      },
    ],
  },
  49: {
    s: 49,
    meal: 'tdv',
    verses: [
      {
        id: 49010,
        a: 10,
        t: "Müminler ancak kardeştirler. Öyleyse kardeşlerinizin arasını düzeltin ve Allah'tan korkun ki esirgenesiniz.",
        len: 107,
      },
      {
        id: 49013,
        a: 13,
        t: "Muhakkak ki Allah yanında en değerli olanınız, O'ndan en çok korkanınızdır. Şüphesiz Allah bilendir, her şeyden haberdardır.",
        len: 125,
      },
    ],
  },
};

export const DEMO_MEAL2_SURAHS: Record<number, MealSurahFile> = {
  17: {
    s: 17,
    meal: 'dib',
    verses: [
      {
        id: 17009,
        a: 9,
        t: "Şüphesiz bu Kur'an insanları en doğru olan yola iletir ve salih amel işleyen mü'minlere, kendileri için büyük bir mükâfat olduğunu müjdeler.",
        len: 141,
      },
    ],
  },
  24: {
    s: 24,
    meal: 'dib',
    verses: [
      {
        id: 24035,
        a: 35,
        t: 'Allah, göklerin ve yerin nurudur. Allah, dilediği kimseyi nuruna kavuşturur.',
        len: 76,
      },
    ],
  },
  31: {
    s: 31,
    meal: 'dib',
    verses: [
      {
        id: 31017,
        a: 17,
        t: 'Yavrum! Namazı dosdoğru kıl. İyiliği emret. Kötülükten alıkoy. Başına gelen musibetlere karşı sabırlı ol. Çünkü bunlar kesin olarak emredilmiş işlerdendir.',
        len: 155,
      },
    ],
  },
  49: {
    s: 49,
    meal: 'dib',
    verses: [
      {
        id: 49010,
        a: 10,
        t: "Mü'minler ancak kardeştirler. Öyleyse kardeşlerinizin arasını düzeltin. Allah'a karşı gelmekten sakının ki size merhamet edilsin.",
        len: 129,
      },
      {
        id: 49013,
        a: 13,
        t: "Şüphesiz, Allah katında sizin en değerli olanınız, O'na karşı gelmekten en çok sakınanınızdır. Şüphesiz Allah hakkıyla bilendir, hakkıyla haberdar olandır.",
        len: 157,
      },
    ],
  },
};

export const DEMO_WORDS_EMPTY = (surahNo: number): WordSurahFile => ({
  s: surahNo,
  words: {},
});

export const DEMO_QUESTIONS_EMPTY = (surahNo: number): QuestionSurahFile => ({
  s: surahNo,
  questions: [],
});
