import type {
  ExamDifficultyFilter,
  ExamMealBasisFilter,
  ExamSessionState,
  PreparedQuestion,
  QuestionItem,
  QuestionRef,
} from '../types/quran';

const ACTIVE_EXAM_SESSION_KEY = 'muallimun_active_exam_v1';

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const;

/**
 * Kanonik Soru Kimliği:
 * Her zaman tutarlı tekil string üretir (`q.uid` varsa onu, yoksa `${q.surah}_${q.id}`).
 */
export function getQuestionUid(q: Pick<QuestionItem, 'uid' | 'surah' | 'id'>): string {
  if (typeof q.uid === 'string' && q.uid.trim().length > 0) {
    return q.uid.trim();
  }
  return `${q.surah}_${q.id}`;
}

/**
 * Kaydedilmiş bir soru kimliği kümesi (eski `id` veya yeni kanonik `uid`) ile eşleşmeyi kontrol eder.
 */
export function matchesStoredQuestionIds(
  q: Pick<QuestionItem, 'uid' | 'surah' | 'id'>,
  idSet: Set<string>,
): boolean {
  const canonical = getQuestionUid(q);
  if (idSet.has(canonical)) return true;
  if (q.id && idSet.has(q.id)) return true;
  if (idSet.has(`${q.surah}_${q.id}`)) return true;
  return false;
}

/**
 * Bir sorudaki `refs` alanını savunmacı şekilde ayet numaraları dizisine (`number[]`) dönüştürür.
 * Desteklenen biçimler:
 * - `[{ sure: 49, from: 2, to: 3 }]`
 * - `[[49, 2, 3]]`
 * - `[23, 24]`
 * - `"23-24"`, `"17:23-24"`, `"23, 24"`, `"17:23"`
 * - `23`
 */
export function parseVerseRefs(refs: unknown, surahNo?: number): number[] {
  const collected = new Set<number>();

  const pushRange = (from: number, to: number) => {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    const start = Math.max(1, Math.min(Math.floor(from), Math.floor(to)));
    const end = Math.max(start, Math.floor(Math.max(from, to)));
    // Tek surede en fazla 286 ayet olabilir; sonsuz döngüye karşı güvenli sınır
    const safeEnd = Math.min(end, start + 300);
    for (let n = start; n <= safeEnd; n += 1) {
      collected.add(n);
    }
  };

  const parseString = (raw: string) => {
    const tokens = raw
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const token of tokens) {
      // Örn: "17:23-24" veya "17:23"
      let part = token;
      const colonIdx = token.indexOf(':');
      if (colonIdx !== -1) {
        const leftSurah = Number.parseInt(token.slice(0, colonIdx).trim(), 10);
        if (surahNo && Number.isFinite(leftSurah) && leftSurah !== surahNo) {
          continue;
        }
        part = token.slice(colonIdx + 1).trim();
      }

      const rangeMatch = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (rangeMatch) {
        pushRange(Number.parseInt(rangeMatch[1], 10), Number.parseInt(rangeMatch[2], 10));
        continue;
      }

      const singleMatch = part.match(/\d+/);
      if (singleMatch) {
        const num = Number.parseInt(singleMatch[0], 10);
        if (num >= 1) collected.add(num);
      }
    }
  };

  const inspect = (value: unknown) => {
    if (value == null) return;

    if (typeof value === 'number') {
      if (Number.isFinite(value) && value >= 1) {
        collected.add(Math.floor(value));
      }
      return;
    }

    if (typeof value === 'string') {
      parseString(value);
      return;
    }

    if (Array.isArray(value)) {
      // Tuple kontrolü: [sure, from, to]
      if (
        value.length === 3 &&
        value.every((x) => typeof x === 'number') &&
        surahNo &&
        value[0] === surahNo &&
        value[2] >= value[1]
      ) {
        pushRange(value[1] as number, value[2] as number);
        return;
      }

      for (const item of value) {
        inspect(item);
      }
      return;
    }

    if (typeof value === 'object') {
      const obj = value as Partial<QuestionRef> & { ayah?: number; a?: number };
      if (typeof obj.from === 'number') {
        if (surahNo && typeof obj.sure === 'number' && obj.sure !== surahNo) {
          return;
        }
        pushRange(obj.from, typeof obj.to === 'number' ? obj.to : obj.from);
        return;
      }
      if (typeof obj.ayah === 'number' && obj.ayah >= 1) {
        collected.add(Math.floor(obj.ayah));
        return;
      }
      if (typeof obj.a === 'number' && obj.a >= 1) {
        collected.add(Math.floor(obj.a));
      }
    }
  };

  inspect(refs);
  return Array.from(collected).sort((a, b) => a - b);
}

/**
 * Ayet referanslarını insanca okunur Türkçe etikete dönüştürür (ör. "Hucurât Suresi · 12. Ayet" veya "2–3. Ayetler").
 */
export function formatVerseRefSummary(
  verseRefs: number[],
  surahNameTr: string,
  scope?: string,
): string {
  if (scope === 'surah_info' && verseRefs.length > 5) {
    return `${surahNameTr} · Sure Genel Bilgisi`;
  }
  if (verseRefs.length === 0) {
    return surahNameTr;
  }
  if (verseRefs.length === 1) {
    return `${surahNameTr} · ${verseRefs[0]}. Ayet`;
  }
  const first = verseRefs[0];
  const last = verseRefs[verseRefs.length - 1];
  const isContiguous = last - first + 1 === verseRefs.length;
  if (isContiguous) {
    return `${surahNameTr} · ${first}–${last}. Ayetler`;
  }
  if (verseRefs.length <= 4) {
    return `${surahNameTr} · ${verseRefs.join(', ')}. Ayetler`;
  }
  return `${surahNameTr} · ${first}–${last}. Ayetler`;
}

/**
 * Şık metinlerinin başındaki olası "A) ", "B. ", "(C) " gibi sabit önekleri temizler.
 */
export function stripOptionPrefix(optionText: string): string {
  return optionText
    .trim()
    .replace(/^\s*(?:\([A-Ea-e]\)|[A-Ea-e]\s*[).:\-–])\s+/, '')
    .trim();
}

const ORDER_DEPENDENT_PATTERNS: RegExp[] = [
  /\bhepsi\b/i,
  /\bhiçbiri\b/i,
  /\byukarıdakilerin\b/i,
  /\byalnız\s+[ivx]+\b/i,
  /\bsadece\s+[ivx]+\b/i,
  /\b[ivx]+\s*(?:,|ve|ile)\s*[ivx]+\b/i,
  /\b[a-e]\s+ve\s+[a-e]\b/i,
  /\btümü\b/i,
];

/**
 * Şık sırasının korunması gerekip gerekmediğini belirler.
 */
export function shouldLockOptionOrder(q: Pick<QuestionItem, 'lockOrder' | 'options'>): boolean {
  if (q.lockOrder === true) return true;
  return q.options.some((opt) => {
    const clean = stripOptionPrefix(opt).toLocaleLowerCase('tr-TR');
    return ORDER_DEPENDENT_PATTERNS.some((pattern) => pattern.test(clean));
  });
}

/**
 * Fisher-Yates algoritması ile dizinin kopyasını karıştırır.
 */
export function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Akıllı şık hazırlayıcı:
 * - Sabit A)/B) öneklerini temizler.
 * - `lockOrder` veya sıra bağımlı şık tespit edilirse sırayı korur; aksi halde Fisher-Yates ile karıştırır.
 * - `correctDisplayIndex` değerini hatasız günceller.
 */
export function prepareQuestionOptions(q: QuestionItem): PreparedQuestion {
  const cleanedOptions = q.options.map((opt) => stripOptionPrefix(opt));
  const safeAnswerIndex =
    q.answerIndex >= 0 && q.answerIndex < cleanedOptions.length ? q.answerIndex : 0;

  const orderLocked = shouldLockOptionOrder(q);
  const originalIndices = cleanedOptions.map((_, idx) => idx);
  const displayToOriginalIndex = orderLocked ? originalIndices : shuffleArray(originalIndices);

  const options = displayToOriginalIndex.map((origIdx) => cleanedOptions[origIdx]);
  const correctDisplayIndex = displayToOriginalIndex.indexOf(safeAnswerIndex);

  return {
    uid: getQuestionUid(q),
    question: q,
    options,
    correctDisplayIndex: correctDisplayIndex >= 0 ? correctDisplayIndex : 0,
    displayToOriginalIndex,
    orderLocked,
    verseRefs: parseVerseRefs(q.refs, q.surah),
  };
}

/**
 * Öncül (premises) metinlerini Romen rakamıyla temiz biçimlendirir (zaten Romen rakamı varsa tekrarlamaz).
 */
export function formatPremiseItem(rawText: string, index: number): { roman: string; text: string } {
  const roman = ROMAN_NUMERALS[index] ?? String(index + 1);
  const cleaned = rawText
    .trim()
    .replace(/^(?:VIII|VII|VI|IV|V|III|II|I)\s*[.)\-–:]\s*/i, '')
    .trim();
  return { roman: `${roman}.`, text: cleaned };
}

export function normalizeMealBasis(basis?: string): 'tdv' | 'dib' | 'common' {
  const lower = (basis ?? '').trim().toLowerCase();
  if (lower === 'dib' || lower === 'm2') return 'dib';
  if (lower === 'common' || lower === 'ortak' || lower === 'both') return 'common';
  return 'tdv';
}

export function getMealBasisLabel(basis?: string): string {
  const norm = normalizeMealBasis(basis);
  if (norm === 'dib') return 'DİB';
  if (norm === 'common') return 'Ortak';
  return 'TDV';
}

export function getDifficultyInfo(difficulty?: number): {
  level: 1 | 2 | 3;
  label: string;
  color: string;
  bg: string;
} {
  if (difficulty === 3) {
    return {
      level: 3,
      label: 'Zor',
      color: '#DC2626',
      bg: 'rgba(239, 68, 68, 0.12)',
    };
  }
  if (difficulty === 2) {
    return {
      level: 2,
      label: 'Orta',
      color: 'var(--brand-accent-text)',
      bg: 'var(--brand-accent-soft)',
    };
  }
  return {
    level: 1,
    label: 'Kolay',
    color: '#059669',
    bg: 'rgba(16, 185, 129, 0.13)',
  };
}

export function formatSourceRefLabel(sourceRef?: string): string {
  if (!sourceRef) return 'Muallimun Editoryal Soru Bankası';
  const normalized = sourceRef.trim().toLowerCase();
  if (normalized === 'ozgun_uretim') return 'Muallimun Özgün Editoryal Soru';
  if (normalized === 'pdf_uyarlama') return 'Yarışma Kitapçığı Uyarlaması';
  return sourceRef;
}

export function formatDurationTr(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs} sn`;
  return `${mins} dk ${String(secs).padStart(2, '0')} sn`;
}

export const EXAM_PASS_THRESHOLD_PCT = 70;

export function formatClockTimer(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Soru başına ortalama süreyi saniye cinsinden hesaplar (1 ondalık hassasiyet veya tam saniye).
 */
export function calculateAvgSecPerQuestion(durationSec: number, questionCount: number): number {
  if (!Number.isFinite(durationSec) || !Number.isFinite(questionCount) || questionCount <= 0) {
    return 0;
  }
  const safeDuration = Math.max(0, durationSec);
  return Math.round((safeDuration / questionCount) * 10) / 10;
}

/**
 * Soru başına ortalama süreyi insanca okunur Türkçe etikete dönüştürür (ör. "14 sn/soru" veya "1 dk 05 sn/soru").
 */
export function formatAvgSpeedTr(avgSec: number): string {
  if (!Number.isFinite(avgSec) || avgSec <= 0) return '0 sn/soru';
  if (avgSec < 60) {
    const rounded = avgSec < 10 ? Math.round(avgSec * 10) / 10 : Math.round(avgSec);
    const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
    return `${display} sn/soru`;
  }
  return `${formatDurationTr(Math.round(avgSec))}/soru`;
}

/**
 * Kısa Sure:Ayet referansı üretir (ör. "17:23–24", "49:12" veya "17. Sure").
 */
export function formatShortVerseRef(surahNo: number, verseRefs: number[]): string {
  if (verseRefs.length === 0) return `${surahNo}. Sure`;
  if (verseRefs.length === 1) return `${surahNo}:${verseRefs[0]}`;
  const first = verseRefs[0];
  const last = verseRefs[verseRefs.length - 1];
  const isContiguous = last - first + 1 === verseRefs.length;
  if (isContiguous) return `${surahNo}:${first}–${last}`;
  if (verseRefs.length <= 3) return `${surahNo}:${verseRefs.join(',')}`;
  return `${surahNo}:${first}–${last}`;
}

/**
 * Sınav sonucu için panoya kopyalamaya ve isteğe bağlı gönderime uygun temiz Türkçe özet metni üretir.
 */
export function buildExamSummaryPlainText(params: {
  title: string;
  scorePct: number;
  passThresholdPct: number;
  correct: number;
  wrong: number;
  blank: number;
  totalQuestions: number;
  durationSec: number;
  avgSecPerQuestion: number;
  surahBreakdown: Array<{ surahNo: number; surahName: string; correct: number; total: number }>;
  completedAt?: string;
}): string {
  const {
    title,
    scorePct,
    passThresholdPct,
    correct,
    wrong,
    blank,
    totalQuestions,
    durationSec,
    avgSecPerQuestion,
    surahBreakdown,
    completedAt,
  } = params;

  const passedLabel =
    scorePct >= passThresholdPct
      ? `Başarılı (%${passThresholdPct} barajı geçildi)`
      : `Geliştirilebilir (%${passThresholdPct} barajı altı)`;

  const dateText = (() => {
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(completedAt ? new Date(completedAt) : new Date());
    } catch {
      return '';
    }
  })();

  const lines: string[] = [
    `Muallimun Kur'an & Meal — ${title}`,
    ...(dateText ? [`Tarih: ${dateText}`] : []),
    `Başarı: %${scorePct} (${passedLabel})`,
    `Sonuç: ${correct} Doğru · ${wrong} Yanlış · ${blank} Boş (Toplam ${totalQuestions} Soru)`,
    `Süre: ${formatDurationTr(durationSec)} (Ortalama: ${formatAvgSpeedTr(avgSecPerQuestion)})`,
  ];

  if (surahBreakdown.length > 0) {
    lines.push('', 'Sure Bazlı Dağılım:');
    for (const item of surahBreakdown) {
      const pct = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0;
      lines.push(`- ${item.surahNo}. ${item.surahName}: ${item.correct}/${item.total} (%${pct})`);
    }
  }

  lines.push('', 'Kaynak: https://kuran.muallimun.net');
  return lines.join('\n');
}

/**
 * Filtrelere ve "henüz çözmediklerime öncelik ver" tercihine göre sınav sorularını seçer ve hazırlar.
 */
export function selectAndPrepareExamQuestions(params: {
  allQuestions: QuestionItem[];
  surahs: number[];
  difficulty: ExamDifficultyFilter;
  mealBasis: ExamMealBasisFilter;
  questionCount: number; // 0 = tümü
  prioritizeUnsolved: boolean;
  solvedQuestionUids: string[];
  customQuestionUids?: string[];
}): PreparedQuestion[] {
  const {
    allQuestions,
    surahs,
    difficulty,
    mealBasis,
    questionCount,
    prioritizeUnsolved,
    solvedQuestionUids,
    customQuestionUids,
  } = params;

  let filtered: QuestionItem[];

  if (customQuestionUids && customQuestionUids.length > 0) {
    const targetSet = new Set(customQuestionUids);
    filtered = allQuestions.filter((q) => matchesStoredQuestionIds(q, targetSet));
  } else {
    const surahSet = new Set(surahs);
    filtered = allQuestions.filter((q) => {
      if (surahSet.size > 0 && !surahSet.has(q.surah)) return false;
      if (difficulty !== 'all' && q.difficulty !== difficulty) return false;
      if (mealBasis !== 'all' && normalizeMealBasis(q.mealBasis) !== mealBasis) return false;
      return true;
    });
  }

  if (filtered.length === 0) return [];

  let ordered: QuestionItem[];
  if (prioritizeUnsolved && (!customQuestionUids || customQuestionUids.length === 0)) {
    const solvedSet = new Set(solvedQuestionUids);
    const unsolved = shuffleArray(filtered.filter((q) => !matchesStoredQuestionIds(q, solvedSet)));
    const solved = shuffleArray(filtered.filter((q) => matchesStoredQuestionIds(q, solvedSet)));
    ordered = [...unsolved, ...solved];
  } else {
    ordered = shuffleArray(filtered);
  }

  const limit = questionCount > 0 ? Math.min(questionCount, ordered.length) : ordered.length;
  return ordered.slice(0, limit).map((q) => prepareQuestionOptions(q));
}

// ============================================================================
// Aktif Sınav Oturumu (sessionStorage) Kaydet / Geri Yükle / Temizle
// ============================================================================

export function saveActiveExamSession(session: ExamSessionState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage.setItem(ACTIVE_EXAM_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function validateExamSessionPayload(raw: unknown): ExamSessionState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Partial<ExamSessionState>;

  if (typeof candidate.sessionId !== 'string' || !candidate.sessionId.trim()) return null;
  if (!candidate.config || typeof candidate.config !== 'object') return null;
  if (!Array.isArray(candidate.questions) || candidate.questions.length === 0) return null;

  for (const item of candidate.questions) {
    if (!item || typeof item !== 'object') return null;
    const pq = item as Partial<PreparedQuestion>;
    if (typeof pq.uid !== 'string' || !pq.uid.trim()) return null;
    if (!pq.question || typeof pq.question !== 'object') return null;
    const surah = pq.question.surah;
    if (
      typeof surah !== 'number' ||
      !Number.isInteger(surah) ||
      surah < 1 ||
      surah > 114 ||
      typeof pq.question.stem !== 'string' ||
      !pq.question.stem.trim()
    ) {
      return null;
    }
    if (
      !Array.isArray(pq.options) ||
      pq.options.length === 0 ||
      !pq.options.every((opt) => typeof opt === 'string')
    ) {
      return null;
    }
    if (
      typeof pq.correctDisplayIndex !== 'number' ||
      !Number.isInteger(pq.correctDisplayIndex) ||
      pq.correctDisplayIndex < 0 ||
      pq.correctDisplayIndex >= pq.options.length
    ) {
      return null;
    }
  }

  const rawIndex =
    typeof candidate.currentIndex === 'number' && Number.isFinite(candidate.currentIndex)
      ? Math.floor(candidate.currentIndex)
      : 0;
  const clampedIndex = Math.max(0, Math.min(candidate.questions.length - 1, rawIndex));

  const answers =
    candidate.answers && typeof candidate.answers === 'object' && !Array.isArray(candidate.answers)
      ? candidate.answers
      : {};
  const flaggedUids = Array.isArray(candidate.flaggedUids)
    ? candidate.flaggedUids.filter((id): id is string => typeof id === 'string')
    : [];
  const eliminatedOptionsByUid =
    candidate.eliminatedOptionsByUid &&
    typeof candidate.eliminatedOptionsByUid === 'object' &&
    !Array.isArray(candidate.eliminatedOptionsByUid)
      ? candidate.eliminatedOptionsByUid
      : {};

  return {
    ...(candidate as ExamSessionState),
    currentIndex: clampedIndex,
    answers,
    flaggedUids,
    eliminatedOptionsByUid,
    startedAt:
      typeof candidate.startedAt === 'number' && Number.isFinite(candidate.startedAt)
        ? candidate.startedAt
        : Date.now(),
  };
}

export function loadActiveExamSession(): ExamSessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_EXAM_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const validated = validateExamSessionPayload(parsed);
    if (!validated) {
      clearActiveExamSession();
      return null;
    }
    return validated;
  } catch {
    clearActiveExamSession();
    return null;
  }
}

export function clearActiveExamSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ACTIVE_EXAM_SESSION_KEY);
  } catch {
    // ignore
  }
}
