export type HijriDayOffset = -2 | -1 | 0 | 1 | 2;

export interface HijriDateInfo {
  year: number;
  month: number; // 1..12
  day: number; // 1..30
  monthNameTr: string;
  monthNameAr: string;
  weekdayTr: string;
  weekdayAr: string;
  monthLength: 29 | 30;
  monthEndDateStamp: string; // YYYY-MM-DD (yerel takvim günü, aktif ofset dahil)
  formattedTr: string; // örn: "17 Cemâziyelâhir 1448"
  formattedShortTr: string; // örn: "17 Cemâziyelâhir"
  formattedAr: string; // örn: "١٧ جمادى الآخرة ١٤٤٨"
  source: 'diyanet' | 'intl' | 'tabular';
}

export interface GregorianDateInfo {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  monthNameTr: string;
  weekdayIndex: number; // 0 (Pazar) .. 6 (Cumartesi)
  weekdayTr: string;
  dateStamp: string; // YYYY-MM-DD
  formattedTr: string; // örn: "26 Kasım 2026"
  formattedFullTr: string; // örn: "26 Kasım 2026, Perşembe"
}

export interface RumiDateInfo {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  monthNameTr: string;
  formattedTr: string; // örn: "13 Teşrîn-i Sânî 1442"
}

export interface HolyDayInfo {
  key: string;
  name: string;
  isNight: boolean;
}

export interface MoonPhaseInfo {
  symbol: string;
  label: string;
}

export interface HijriDailyJuzRecommendation {
  juzs: number[];
  primaryJuz: number;
  label: string;
  startPage: number;
  endPage: number;
  totalPages: number;
  isCombinedFinalDay: boolean;
  note: string | null;
  isRamazan: boolean;
  monthLength: 29 | 30;
  monthEndDateStamp: string;
  hijri: HijriDateInfo;
}

export interface IslamicCalendarSnapshot {
  gregorian: GregorianDateInfo;
  hijri: HijriDateInfo;
  rumi: RumiDateInfo;
  holyDay: HolyDayInfo | null;
  moonPhase: MoonPhaseInfo;
  dailyJuz: HijriDailyJuzRecommendation;
  offset: HijriDayOffset;
}

export const HIJRI_OFFSET_STORAGE_KEY = 'muallimun_hijri_offset_v1';

// Diyanet İşleri Başkanlığı onaylı Hicrî ay başlangıçları (1..12. ay: Muharrem -> Zilhicce)
export const DIYANET_HIJRI_MONTH_STARTS: Readonly<Record<number, readonly string[]>> = {
  1446: [
    '2024-07-07',
    '2024-08-05',
    '2024-09-04',
    '2024-10-04',
    '2024-11-03',
    '2024-12-02',
    '2025-01-01',
    '2025-01-31',
    '2025-03-01',
    '2025-03-30',
    '2025-04-28',
    '2025-05-28',
  ],
  1447: [
    '2025-06-26',
    '2025-07-25',
    '2025-08-23',
    '2025-09-22',
    '2025-10-22',
    '2025-11-21',
    '2025-12-20',
    '2026-01-19',
    '2026-02-18',
    '2026-03-20',
    '2026-04-18',
    '2026-05-18',
  ],
  1448: [
    '2026-06-16',
    '2026-07-15',
    '2026-08-13',
    '2026-09-12',
    '2026-10-12',
    '2026-11-10',
    '2026-12-10',
    '2027-01-09',
    '2027-02-08',
    '2027-03-09',
    '2027-04-08',
    '2027-05-07',
  ],
};

// 1448 Zilhicce ayının gerçek uzunluğunu kesin belirlemek için 1 Muharrem 1449 sınırı
export const DIYANET_HIJRI_1449_START = '2027-06-06';

export const HIJRI_MONTHS_TR: readonly string[] = [
  'Muharrem',
  'Safer',
  'Rebîülevvel',
  'Rebîülâhir',
  'Cemâziyelevvel',
  'Cemâziyelâhir',
  'Receb',
  'Şâban',
  'Ramazan',
  'Şevval',
  'Zilkâde',
  'Zilhicce',
];

export const HIJRI_MONTHS_AR: readonly string[] = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

export const GREGORIAN_MONTHS_TR: readonly string[] = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export const RUMI_MONTHS_TR: readonly string[] = [
  'Kânûn-ı Sânî',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Teşrîn-i Evvel',
  'Teşrîn-i Sânî',
  'Kânûn-ı Evvel',
];

export const WEEKDAYS_TR: readonly string[] = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
];

export const WEEKDAYS_AR: readonly string[] = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

export const ISLAMIC_HOLY_DAYS: Readonly<Record<string, { name: string; isNight: boolean }>> = {
  '1-1': { name: 'Hicrî Yılbaşı', isNight: false },
  '1-10': { name: 'Aşûre Günü', isNight: false },
  '3-12': { name: 'Mevlid Kandili', isNight: true },
  '7-1': { name: 'Üç Aylar Başlangıcı', isNight: false },
  '7-27': { name: "Mi'rac Kandili", isNight: true },
  '8-15': { name: 'Berat Kandili', isNight: true },
  '9-1': { name: 'Ramazan Başlangıcı', isNight: false },
  '9-27': { name: 'Kadir Gecesi', isNight: true },
  '10-1': { name: 'Ramazan Bayramı (1. Gün)', isNight: false },
  '10-2': { name: 'Ramazan Bayramı (2. Gün)', isNight: false },
  '10-3': { name: 'Ramazan Bayramı (3. Gün)', isNight: false },
  '12-9': { name: 'Arefe Günü', isNight: false },
  '12-10': { name: 'Kurban Bayramı (1. Gün)', isNight: false },
  '12-11': { name: 'Kurban Bayramı (2. Gün)', isNight: false },
  '12-12': { name: 'Kurban Bayramı (3. Gün)', isNight: false },
  '12-13': { name: 'Kurban Bayramı (4. Gün)', isNight: false },
};

const MS_PER_DAY = 86_400_000;

export function toArabicIndicNumber(value: number): string {
  return String(Math.trunc(value)).replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)] ?? d);
}

function parseDateStampToDayNum(stamp: string): number {
  const [yStr, mStr, dStr] = stamp.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function localDateToDayNum(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

function dayNumToDateStamp(dayNum: number): string {
  const dt = new Date(dayNum * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DiyanetMonthSpan {
  year: number;
  month: number;
  startDayNum: number;
  endDayNum: number;
  monthLength: 29 | 30;
}

const DIYANET_MONTH_SPANS: readonly DiyanetMonthSpan[] = (() => {
  const rawStarts: { year: number; month: number; startDayNum: number }[] = [];
  const sortedYears = Object.keys(DIYANET_HIJRI_MONTH_STARTS)
    .map(Number)
    .sort((a, b) => a - b);

  for (const year of sortedYears) {
    const starts = DIYANET_HIJRI_MONTH_STARTS[year];
    for (let idx = 0; idx < starts.length; idx += 1) {
      rawStarts.push({
        year,
        month: idx + 1,
        startDayNum: parseDateStampToDayNum(starts[idx]),
      });
    }
  }

  const finalBoundaryDayNum = parseDateStampToDayNum(DIYANET_HIJRI_1449_START);
  const spans: DiyanetMonthSpan[] = [];

  for (let i = 0; i < rawStarts.length; i += 1) {
    const cur = rawStarts[i];
    const nextStart = i + 1 < rawStarts.length ? rawStarts[i + 1].startDayNum : finalBoundaryDayNum;
    const diff = nextStart - cur.startDayNum;
    const monthLength: 29 | 30 = diff <= 29 ? 29 : 30;
    spans.push({
      year: cur.year,
      month: cur.month,
      startDayNum: cur.startDayNum,
      endDayNum: nextStart - 1,
      monthLength,
    });
  }

  return spans;
})();

const DIYANET_FIRST_DAY_NUM = DIYANET_MONTH_SPANS[0]?.startDayNum ?? 0;
const DIYANET_LAST_DAY_NUM = DIYANET_MONTH_SPANS[DIYANET_MONTH_SPANS.length - 1]?.endDayNum ?? 0;

// ============================================================================
// Hicrî Gün Farkı (-2..+2, varsayılan 0: Diyanet)
// ============================================================================

function clampHijriOffset(raw: number): HijriDayOffset {
  const n = Math.trunc(raw);
  if (n <= -2) return -2;
  if (n === -1) return -1;
  if (n === 1) return 1;
  if (n >= 2) return 2;
  return 0;
}

function readStoredHijriOffset(): HijriDayOffset {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(HIJRI_OFFSET_STORAGE_KEY);
    if (raw === null) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return clampHijriOffset(parsed);
  } catch {
    return 0;
  }
}

let cachedHijriOffset: HijriDayOffset = readStoredHijriOffset();
const offsetListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== HIJRI_OFFSET_STORAGE_KEY) return;
    const next = readStoredHijriOffset();
    if (next !== cachedHijriOffset) {
      cachedHijriOffset = next;
      offsetListeners.forEach((listener) => listener());
    }
  });
}

export function getHijriOffset(): HijriDayOffset {
  return cachedHijriOffset;
}

export function setHijriOffset(offset: number): HijriDayOffset {
  const next = clampHijriOffset(offset);
  if (next === cachedHijriOffset) return next;
  cachedHijriOffset = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(HIJRI_OFFSET_STORAGE_KEY, String(next));
    } catch {
      // Depolama kısıtlıysa bellek içi değerle devam et
    }
  }
  offsetListeners.forEach((listener) => listener());
  return next;
}

export function subscribeHijriOffset(listener: () => void): () => void {
  offsetListeners.add(listener);
  return () => {
    offsetListeners.delete(listener);
  };
}

// ============================================================================
// Yedek Hicrî Motorları (Intl Umm al-Qura + Standart Tabular 30/29)
// ============================================================================

let cachedIntlFormatter: Intl.DateTimeFormat | null | undefined;

function getUmmAlQuraFormatter(): Intl.DateTimeFormat | null {
  if (cachedIntlFormatter !== undefined) return cachedIntlFormatter;
  try {
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
      cachedIntlFormatter = null;
      return null;
    }
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const resolved = fmt.resolvedOptions().calendar ?? '';
    if (!resolved.includes('islamic')) {
      cachedIntlFormatter = null;
      return null;
    }
    cachedIntlFormatter = fmt;
    return fmt;
  } catch {
    cachedIntlFormatter = null;
    return null;
  }
}

function readIntlHijriParts(
  fmt: Intl.DateTimeFormat,
  dayNum: number,
): { year: number; month: number; day: number } | null {
  try {
    const parts = fmt.formatToParts(new Date(dayNum * MS_PER_DAY));
    let year = NaN;
    let month = NaN;
    let day = NaN;
    for (const part of parts) {
      if (part.type === 'year') year = Number(part.value);
      else if (part.type === 'month') month = Number(part.value);
      else if (part.type === 'day') day = Number(part.value);
    }
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      year < 1 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 30
    ) {
      return null;
    }
    return { year, month, day };
  } catch {
    return null;
  }
}

// Standart 30/29 Tabular (Kuwaiti/Civil) Hicrî hesabı — Intl desteklenmeyen ortamlar için
const ISLAMIC_LEAP_YEARS = new Set([2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29]);

function isTabularHijriLeapYear(year: number): boolean {
  const mod = ((year % 30) + 30) % 30;
  return ISLAMIC_LEAP_YEARS.has(mod);
}

function getTabularHijriMonthLength(year: number, month: number): 29 | 30 {
  if (month % 2 === 1) return 30;
  if (month === 12 && isTabularHijriLeapYear(year)) return 30;
  return 29;
}

function resolveTabularHijri(dayNum: number): {
  year: number;
  month: number;
  day: number;
  monthLength: 29 | 30;
  monthEndDayNum: number;
} {
  // Julian Day Number (UTC 1970-01-01 = JDN 2440588)
  const jdn = dayNum + 2440588;
  let l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  const safeMonth = Math.max(1, Math.min(12, month));
  const monthLength = getTabularHijriMonthLength(year, safeMonth);
  const safeDay = Math.max(1, Math.min(monthLength, day));
  const monthStartDayNum = dayNum - (safeDay - 1);
  return {
    year,
    month: safeMonth,
    day: safeDay,
    monthLength,
    monthEndDayNum: monthStartDayNum + monthLength - 1,
  };
}

// ============================================================================
// Ana Dönüştürücüler: Milâdî, Hicrî, Rûmî, Dini Günler, Ay Evresi, Günün Cüzü
// ============================================================================

export function getGregorianDateInfo(date: Date = new Date()): GregorianDateInfo {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdayIndex = date.getDay();
  const monthNameTr = GREGORIAN_MONTHS_TR[month - 1] ?? '';
  const weekdayTr = WEEKDAYS_TR[weekdayIndex] ?? '';
  const dateStamp = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const formattedTr = `${day} ${monthNameTr} ${year}`;
  return {
    year,
    month,
    day,
    monthNameTr,
    weekdayIndex,
    weekdayTr,
    dateStamp,
    formattedTr,
    formattedFullTr: `${formattedTr}, ${weekdayTr}`,
  };
}

export function gregorianToRumi(date: Date = new Date()): RumiDateInfo {
  const rumiDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 13);
  const year = rumiDate.getFullYear() - 584;
  const month = rumiDate.getMonth() + 1;
  const day = rumiDate.getDate();
  const monthNameTr = RUMI_MONTHS_TR[month - 1] ?? '';
  return {
    year,
    month,
    day,
    monthNameTr,
    formattedTr: `${day} ${monthNameTr} ${year}`,
  };
}

export function gregorianToHijri(
  date: Date = new Date(),
  offsetOverride?: number,
): HijriDateInfo {
  const offset =
    offsetOverride !== undefined ? clampHijriOffset(offsetOverride) : getHijriOffset();
  const baseDayNum = localDateToDayNum(date);
  const effectiveDayNum = baseDayNum + offset;
  const weekdayIndex = date.getDay();
  const weekdayTr = WEEKDAYS_TR[weekdayIndex] ?? '';
  const weekdayAr = WEEKDAYS_AR[weekdayIndex] ?? '';

  let year: number;
  let month: number;
  let day: number;
  let monthLength: 29 | 30;
  let monthEndEffectiveDayNum: number;
  let source: 'diyanet' | 'intl' | 'tabular';

  if (effectiveDayNum >= DIYANET_FIRST_DAY_NUM && effectiveDayNum <= DIYANET_LAST_DAY_NUM) {
    // İkili arama ile Diyanet ay aralığını bul
    let lo = 0;
    let hi = DIYANET_MONTH_SPANS.length - 1;
    let matched = DIYANET_MONTH_SPANS[0];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const span = DIYANET_MONTH_SPANS[mid];
      if (effectiveDayNum < span.startDayNum) {
        hi = mid - 1;
      } else if (effectiveDayNum > span.endDayNum) {
        lo = mid + 1;
      } else {
        matched = span;
        break;
      }
    }
    year = matched.year;
    month = matched.month;
    day = effectiveDayNum - matched.startDayNum + 1;
    monthLength = matched.monthLength;
    monthEndEffectiveDayNum = matched.endDayNum;
    source = 'diyanet';
  } else {
    const intlFmt = getUmmAlQuraFormatter();
    const intlParts = intlFmt ? readIntlHijriParts(intlFmt, effectiveDayNum) : null;
    if (intlFmt && intlParts) {
      year = intlParts.year;
      month = intlParts.month;
      day = intlParts.day;
      const monthStartDayNum = effectiveDayNum - (day - 1);
      const day30Parts = readIntlHijriParts(intlFmt, monthStartDayNum + 29);
      monthLength =
        day30Parts && day30Parts.year === year && day30Parts.month === month ? 30 : 29;
      monthEndEffectiveDayNum = monthStartDayNum + monthLength - 1;
      source = 'intl';
    } else {
      const tab = resolveTabularHijri(effectiveDayNum);
      year = tab.year;
      month = tab.month;
      day = tab.day;
      monthLength = tab.monthLength;
      monthEndEffectiveDayNum = tab.monthEndDayNum;
      source = 'tabular';
    }
  }

  const monthNameTr = HIJRI_MONTHS_TR[month - 1] ?? '';
  const monthNameAr = HIJRI_MONTHS_AR[month - 1] ?? '';
  // Kullanıcının yerel takviminde bu Hicrî ayın son günü (ofset düşülerek gerçek Milâdî güne çevrilir)
  const monthEndDateStamp = dayNumToDateStamp(monthEndEffectiveDayNum - offset);

  return {
    year,
    month,
    day,
    monthNameTr,
    monthNameAr,
    weekdayTr,
    weekdayAr,
    monthLength,
    monthEndDateStamp,
    formattedTr: `${day} ${monthNameTr} ${year}`,
    formattedShortTr: `${day} ${monthNameTr}`,
    formattedAr: `${toArabicIndicNumber(day)} ${monthNameAr} ${toArabicIndicNumber(year)}`,
    source,
  };
}

export function getHolyDayForHijri(month: number, day: number): HolyDayInfo | null {
  const key = `${month}-${day}`;
  const found = ISLAMIC_HOLY_DAYS[key];
  if (!found) return null;
  return {
    key,
    name: found.name,
    isNight: found.isNight,
  };
}

export function getMoonPhaseForHijriDay(day: number, monthLength: 29 | 30 = 30): MoonPhaseInfo {
  if (day <= 1) return { symbol: '🌑', label: 'Yeni Ay' };
  if (day <= 6) return { symbol: '🌒', label: 'Hilâl' };
  if (day <= 9) return { symbol: '🌓', label: 'İlk Dördün' };
  if (day <= 12) return { symbol: '🌔', label: 'Şişkin Ay' };
  if (day <= 16) return { symbol: '🌕', label: 'Dolunay' };
  if (day <= 20) return { symbol: '🌖', label: 'Küçülen Dolunay' };
  if (day <= 23) return { symbol: '🌗', label: 'Son Dördün' };
  if (day < monthLength) return { symbol: '🌘', label: 'Küçülen Hilâl' };
  return { symbol: '🌑', label: 'Ay Sonu' };
}

function getJuzPageRange(juzNo: number): {
  startPage: number;
  endPage: number;
  totalPages: number;
} {
  const safeJuz = Math.max(1, Math.min(30, Math.trunc(juzNo) || 1));
  if (safeJuz === 30) {
    return { startPage: 581, endPage: 604, totalPages: 24 };
  }
  const startPage = (safeJuz - 1) * 20 + 1;
  const endPage = safeJuz * 20;
  return { startPage, endPage, totalPages: 20 };
}

export function getHijriDailyJuzRecommendation(
  date: Date = new Date(),
  offsetOverride?: number,
): HijriDailyJuzRecommendation {
  const hijri = gregorianToHijri(date, offsetOverride);
  const isRamazan = hijri.month === 9;

  if (hijri.monthLength === 29 && hijri.day >= 29) {
    return {
      juzs: [29, 30],
      primaryJuz: 29,
      label: '29. & 30. Cüz',
      startPage: 561,
      endPage: 604,
      totalPages: 44,
      isCombinedFinalDay: true,
      note: 'Bu Hicrî ay 29 gün çektiği için hatim tamamlama günü olarak bugün 29. ve 30. Cüz birlikte okunur.',
      isRamazan,
      monthLength: hijri.monthLength,
      monthEndDateStamp: hijri.monthEndDateStamp,
      hijri,
    };
  }

  const juz = Math.max(1, Math.min(30, hijri.day));
  const range = getJuzPageRange(juz);

  return {
    juzs: [juz],
    primaryJuz: juz,
    label: `${juz}. Cüz`,
    startPage: range.startPage,
    endPage: range.endPage,
    totalPages: range.totalPages,
    isCombinedFinalDay: false,
    note: null,
    isRamazan,
    monthLength: hijri.monthLength,
    monthEndDateStamp: hijri.monthEndDateStamp,
    hijri,
  };
}

export function getIslamicCalendarSnapshot(
  date: Date = new Date(),
  offsetOverride?: number,
): IslamicCalendarSnapshot {
  const offset =
    offsetOverride !== undefined ? clampHijriOffset(offsetOverride) : getHijriOffset();
  const gregorian = getGregorianDateInfo(date);
  const dailyJuz = getHijriDailyJuzRecommendation(date, offset);
  const hijri = dailyJuz.hijri;
  const rumi = gregorianToRumi(date);
  const holyDay = getHolyDayForHijri(hijri.month, hijri.day);
  const moonPhase = getMoonPhaseForHijriDay(hijri.day, hijri.monthLength);

  return {
    gregorian,
    hijri,
    rumi,
    holyDay,
    moonPhase,
    dailyJuz,
    offset,
  };
}
