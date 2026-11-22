import {
  buildMemorizationUnitFromRanges,
  buildRangesForMushafPage,
} from '../data/curatedAshrPresets';
import type {
  AyahRange,
  ClassicalHifzLogEntry,
  ClassicalHifzPlan,
  Juz30HifzMode,
  MemorizationUnit,
} from '../types/memorization';
import type { MetaData } from '../types/quran';

export const TOTAL_MUSHAF_PAGES = 604;
export const MAX_CLASSICAL_LOGS = 60;

export interface JuzPageBounds {
  juzNo: number;
  /** Cüzün tam Mushaf başlangıç sayfası (1..581) */
  startPage: number;
  /** Cüzün tam Mushaf bitiş sayfası (20..604) */
  endPage: number;
  /** Cüzdeki toplam Mushaf sayfası (1..29 için 20, 30. cüz için 24) */
  totalPages: number;
  /** Klasik döngüde takip edilip edilmediği */
  isTracked: boolean;
  /** Döngü başlangıç (en küçük) sayfa numarası */
  trackStartPage: number;
  /** Döngü bitiş (1. turda ilk alınan en büyük) sayfa numarası */
  trackEndPage: number;
  /** Bu cüzün döngüde kaç tur sürdüğü (0, 20 veya 24) */
  trackTotalRounds: number;
  /** Kurulumda otomatik Has sayılan sayfalar */
  preHasPages: number[];
}

export interface ClassicalStepRef {
  round: number;
  juz: number;
  mushafPage: number;
}

export interface ResolvedTurnLesson {
  round: number;
  juz: number;
  /** Bugünkü yeni ezberlenecek Ham sayfası (1..604) */
  hamPage: number;
  /** Cüz içi sayfa numarası (1..20 veya 30. cüzde 1..24) */
  localPageInJuz: number;
  /** Bu cüzün toplam sayfa sayısı (20 veya 24) */
  juzTotalPages: number;
  /** Aktif Ham sayfası zaten Has listesinde mi? */
  isHamAlreadyHas: boolean;
  /** Bu cüzde tamamlanmış Has sayfaları (Mushaf sırasıyla yukarıdan aşağıya) */
  juzHasPages: number[];
  /** Klasik dinletme sırası: [hamPage, ...juzHasPages] (yukarıdan aşağıya rabt sırası) */
  fullLessonPages: number[];
  /** İleri turlarda Zen/Rabt öz-sınavı için ideal yakın zincir: Ham + hemen altındaki en fazla 4 Has */
  nearChainPages: number[];
  /** Bu dersten sonra geçilecek sıradaki adım */
  nextStep: ClassicalStepRef | null;
  /** Tüm 604 sayfa tamamlandı mı? */
  isAllCompleted: boolean;
}

export interface ClassicalHifzStats {
  hasCount: number;
  remainingPages: number;
  percent: number;
  completedRoundsCount: number;
  maxRounds: number;
  currentRoundDone: number;
  currentRoundTotal: number;
  estimatedDaysRemaining: number;
  estimatedFinishDate: Date | null;
  estimatedFinishLabel: string;
}

export interface PageContentSummary {
  pageNo: number;
  surahNames: string[];
  surahSummary: string;
  ayahRangeLabel: string;
  ayahCount: number;
  firstSurah: number;
  firstAyah: number;
  ranges: AyahRange[];
}

function makeRange(start: number, end: number): number[] {
  const out: number[] = [];
  for (let p = start; p <= end; p += 1) {
    out.push(p);
  }
  return out;
}

export function getMaxRoundForMode(juz30Mode: Juz30HifzMode): number {
  return juz30Mode === 'full_from_604' ? 24 : 20;
}

export function getJuzPageBounds(
  juzNo: number,
  juz30Mode: Juz30HifzMode = 'short_surahs_pre_has',
): JuzPageBounds {
  const safeJuz = Math.max(1, Math.min(30, Math.trunc(juzNo) || 1));

  if (safeJuz < 30) {
    const startPage = (safeJuz - 1) * 20 + 1;
    const endPage = safeJuz * 20;
    return {
      juzNo: safeJuz,
      startPage,
      endPage,
      totalPages: 20,
      isTracked: true,
      trackStartPage: startPage,
      trackEndPage: endPage,
      trackTotalRounds: 20,
      preHasPages: [],
    };
  }

  // 30. Cüz (Mushaf 581..604 — 24 sayfa)
  if (juz30Mode === 'juz30_pre_has') {
    return {
      juzNo: 30,
      startPage: 581,
      endPage: 604,
      totalPages: 24,
      isTracked: false,
      trackStartPage: 581,
      trackEndPage: 580,
      trackTotalRounds: 0,
      preHasPages: makeRange(581, 604),
    };
  }

  if (juz30Mode === 'full_from_604') {
    return {
      juzNo: 30,
      startPage: 581,
      endPage: 604,
      totalPages: 24,
      isTracked: true,
      trackStartPage: 581,
      trackEndPage: 604,
      trackTotalRounds: 24,
      preHasPages: [],
    };
  }

  // Önerilen: short_surahs_pre_has (601..604 baştan Has; 600->581 arası 20 tur)
  return {
    juzNo: 30,
    startPage: 581,
    endPage: 604,
    totalPages: 24,
    isTracked: true,
    trackStartPage: 581,
    trackEndPage: 600,
    trackTotalRounds: 20,
    preHasPages: [601, 602, 603, 604],
  };
}

export function getJuzAndLocalPageForMushafPage(mushafPage: number): {
  juz: number;
  localPage: number;
  startPage: number;
  endPage: number;
  totalPages: number;
} {
  const safePage = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, Math.trunc(mushafPage) || 1));
  if (safePage >= 581) {
    return {
      juz: 30,
      localPage: safePage - 580,
      startPage: 581,
      endPage: 604,
      totalPages: 24,
    };
  }
  const juz = Math.floor((safePage - 1) / 20) + 1;
  const startPage = (juz - 1) * 20 + 1;
  return {
    juz,
    localPage: safePage - startPage + 1,
    startPage,
    endPage: juz * 20,
    totalPages: 20,
  };
}

export function getPageForRoundAndJuz(
  round: number,
  juz: number,
  juz30Mode: Juz30HifzMode,
): number | null {
  if (!Number.isInteger(round) || round < 1) return null;
  if (!Number.isInteger(juz) || juz < 1 || juz > 30) return null;
  const bounds = getJuzPageBounds(juz, juz30Mode);
  if (!bounds.isTracked || round > bounds.trackTotalRounds) return null;
  const page = bounds.trackEndPage - (round - 1);
  if (page < bounds.trackStartPage || page > bounds.trackEndPage) return null;
  return page;
}

export function getRoundAndJuzForMushafPage(
  mushafPage: number,
  juz30Mode: Juz30HifzMode,
): { round: number; juz: number } | null {
  const safePage = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, Math.trunc(mushafPage) || 1));
  const { juz } = getJuzAndLocalPageForMushafPage(safePage);
  const bounds = getJuzPageBounds(juz, juz30Mode);
  if (!bounds.isTracked) return null;
  if (safePage < bounds.trackStartPage || safePage > bounds.trackEndPage) return null;
  const round = bounds.trackEndPage - safePage + 1;
  return { round, juz };
}

export function getOrderedClassicalSteps(juz30Mode: Juz30HifzMode): ClassicalStepRef[] {
  const maxRound = getMaxRoundForMode(juz30Mode);
  const steps: ClassicalStepRef[] = [];
  for (let round = 1; round <= maxRound; round += 1) {
    for (let juz = 1; juz <= 30; juz += 1) {
      const page = getPageForRoundAndJuz(round, juz, juz30Mode);
      if (page !== null) {
        steps.push({ round, juz, mushafPage: page });
      }
    }
  }
  return steps;
}

export function normalizeHasPages(pages: Iterable<number>): number[] {
  const set = new Set<number>();
  for (const p of pages) {
    const n = Math.trunc(Number(p));
    if (Number.isFinite(n) && n >= 1 && n <= TOTAL_MUSHAF_PAGES) {
      set.add(n);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Kurulum sihirbazında seçilen 30. cüz modu ve başlangıç (tur, cüz) noktasına göre
 * otomatik Has sayılacak sayfaların listesini üretir.
 */
export function computePreSeededHasPages(options: {
  juz30Mode: Juz30HifzMode;
  startRound: number;
  startJuz: number;
}): number[] {
  const { juz30Mode } = options;
  const maxRound = getMaxRoundForMode(juz30Mode);
  const safeRound = Math.max(1, Math.min(maxRound, Math.trunc(options.startRound) || 1));
  const maxJuzForStart = juz30Mode === 'juz30_pre_has' ? 29 : 30;
  const safeJuz =
    safeRound > 20
      ? 30
      : Math.max(1, Math.min(maxJuzForStart, Math.trunc(options.startJuz) || 1));

  const seeded = new Set<number>(getJuzPageBounds(30, juz30Mode).preHasPages);
  const steps = getOrderedClassicalSteps(juz30Mode);

  for (const step of steps) {
    if (
      step.round < safeRound ||
      (step.round === safeRound && step.juz < safeJuz)
    ) {
      seeded.add(step.mushafPage);
    }
  }

  return normalizeHasPages(seeded);
}

export function createClassicalPlan(options: {
  juz30Mode: Juz30HifzMode;
  weeklyTargetDays: 5 | 6 | 7;
  startRound: number;
  startJuz: number;
  nowMs?: number;
}): ClassicalHifzPlan {
  const now = options.nowMs ?? Date.now();
  const maxRound = getMaxRoundForMode(options.juz30Mode);
  const safeRound = Math.max(1, Math.min(maxRound, Math.trunc(options.startRound) || 1));
  const maxJuzForRound = options.juz30Mode === 'juz30_pre_has' ? 29 : 30;
  const safeJuz =
    safeRound > 20
      ? 30
      : Math.max(1, Math.min(maxJuzForRound, Math.trunc(options.startJuz) || 1));

  const hasPages = computePreSeededHasPages({
    juz30Mode: options.juz30Mode,
    startRound: safeRound,
    startJuz: safeJuz,
  });

  return {
    version: 1,
    isActive: true,
    juz30Mode: options.juz30Mode,
    weeklyTargetDays: options.weeklyTargetDays,
    currentRound: safeRound,
    currentJuz: safeJuz,
    hasPages,
    startedAt: now,
    updatedAt: now,
    completedAt: hasPages.length >= TOTAL_MUSHAF_PAGES ? now : null,
    recentLogs: [],
  };
}

function findNextUncompletedStepAfter(
  steps: ClassicalStepRef[],
  hasSet: Set<number>,
  currentRound: number,
  currentJuz: number,
): ClassicalStepRef | null {
  const currentIdx = steps.findIndex(
    (s) => s.round === currentRound && s.juz === currentJuz,
  );
  const startSearch = currentIdx >= 0 ? currentIdx + 1 : 0;

  for (let i = startSearch; i < steps.length; i += 1) {
    if (!hasSet.has(steps[i].mushafPage)) {
      return steps[i];
    }
  }
  for (let i = 0; i < startSearch; i += 1) {
    if (!hasSet.has(steps[i].mushafPage)) {
      return steps[i];
    }
  }
  return null;
}

export function resolveCurrentTurnLesson(plan: ClassicalHifzPlan): ResolvedTurnLesson {
  const steps = getOrderedClassicalSteps(plan.juz30Mode);
  const hasSet = new Set<number>(plan.hasPages);
  const isAllCompleted = hasSet.size >= TOTAL_MUSHAF_PAGES;

  let activeRound = plan.currentRound;
  let activeJuz = plan.currentJuz;
  let hamPage = getPageForRoundAndJuz(activeRound, activeJuz, plan.juz30Mode);

  if (hamPage === null) {
    const firstOpen = steps.find((s) => !hasSet.has(s.mushafPage)) ?? steps[0];
    activeRound = firstOpen.round;
    activeJuz = firstOpen.juz;
    hamPage = firstOpen.mushafPage;
  }

  const bounds = getJuzPageBounds(activeJuz, plan.juz30Mode);
  const localPageInJuz = hamPage - bounds.startPage + 1;
  const isHamAlreadyHas = hasSet.has(hamPage);

  // Bu cüzdeki Has sayfaları — Mushaf sırasıyla yukarıdan aşağıya (küçükten büyüğe)
  const juzHasPages: number[] = [];
  for (let p = bounds.startPage; p <= bounds.endPage; p += 1) {
    if (p !== hamPage && hasSet.has(p)) {
      juzHasPages.push(p);
    }
  }

  // Klasik usulde dinletme sırası: Ham sayfa ve hemen altından devam eden Has sayfaları (yukarıdan aşağıya)
  const followingHasPages = juzHasPages.filter((p) => p > hamPage);
  const priorHasPages = juzHasPages.filter((p) => p < hamPage);
  const orderedChainHas =
    followingHasPages.length > 0 ? followingHasPages : priorHasPages;

  const fullLessonPages = [hamPage, ...orderedChainHas].sort((a, b) => a - b);
  const nearChainPages = [hamPage, ...orderedChainHas.slice(0, 4)].sort((a, b) => a - b);

  // Bugünkü Ham tamamlandığında sıradaki adımın önizlemesi
  const projectedHas = new Set<number>(hasSet);
  projectedHas.add(hamPage);
  const nextStep = findNextUncompletedStepAfter(
    steps,
    projectedHas,
    activeRound,
    activeJuz,
  );

  return {
    round: activeRound,
    juz: activeJuz,
    hamPage,
    localPageInJuz,
    juzTotalPages: bounds.totalPages,
    isHamAlreadyHas,
    juzHasPages,
    fullLessonPages,
    nearChainPages,
    nextStep,
    isAllCompleted,
  };
}

export function advanceClassicalLesson(
  plan: ClassicalHifzPlan,
  nowMs = Date.now(),
): ClassicalHifzPlan {
  const lesson = resolveCurrentTurnLesson(plan);
  const nextHasPages = normalizeHasPages([...plan.hasPages, lesson.hamPage]);
  const hasSet = new Set<number>(nextHasPages);
  const steps = getOrderedClassicalSteps(plan.juz30Mode);
  const nextStep = findNextUncompletedStepAfter(
    steps,
    hasSet,
    lesson.round,
    lesson.juz,
  );

  const logEntry: ClassicalHifzLogEntry = {
    id: `chl_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    round: lesson.round,
    juz: lesson.juz,
    mushafPage: lesson.hamPage,
    completedAt: nowMs,
  };

  const recentLogs = [logEntry, ...plan.recentLogs].slice(0, MAX_CLASSICAL_LOGS);
  const allDone = nextHasPages.length >= TOTAL_MUSHAF_PAGES;

  return {
    ...plan,
    hasPages: nextHasPages,
    currentRound: nextStep ? nextStep.round : lesson.round,
    currentJuz: nextStep ? nextStep.juz : lesson.juz,
    updatedAt: nowMs,
    completedAt: allDone ? (plan.completedAt ?? nowMs) : null,
    recentLogs,
  };
}

export function undoLastClassicalLesson(
  plan: ClassicalHifzPlan,
  nowMs = Date.now(),
): ClassicalHifzPlan {
  if (!plan.recentLogs || plan.recentLogs.length === 0) {
    return plan;
  }
  const [lastLog, ...restLogs] = plan.recentLogs;
  const nextHasPages = plan.hasPages.filter((p) => p !== lastLog.mushafPage);

  return {
    ...plan,
    hasPages: nextHasPages,
    currentRound: lastLog.round,
    currentJuz: lastLog.juz,
    updatedAt: nowMs,
    completedAt: null,
    recentLogs: restLogs,
  };
}

export function togglePageHasStatus(
  plan: ClassicalHifzPlan,
  mushafPage: number,
  nowMs = Date.now(),
): ClassicalHifzPlan {
  const safePage = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, Math.trunc(mushafPage) || 1));
  const hasSet = new Set<number>(plan.hasPages);
  if (hasSet.has(safePage)) {
    hasSet.delete(safePage);
  } else {
    hasSet.add(safePage);
  }
  const nextHasPages = normalizeHasPages(hasSet);
  return {
    ...plan,
    hasPages: nextHasPages,
    updatedAt: nowMs,
    completedAt: nextHasPages.length >= TOTAL_MUSHAF_PAGES ? (plan.completedAt ?? nowMs) : null,
  };
}

export function setActiveCursorToPage(
  plan: ClassicalHifzPlan,
  mushafPage: number,
  nowMs = Date.now(),
): ClassicalHifzPlan {
  const mapped = getRoundAndJuzForMushafPage(mushafPage, plan.juz30Mode);
  if (!mapped) return plan;
  return {
    ...plan,
    currentRound: mapped.round,
    currentJuz: mapped.juz,
    updatedAt: nowMs,
  };
}

export function updateClassicalPlanSettings(
  plan: ClassicalHifzPlan,
  patch: {
    juz30Mode?: Juz30HifzMode;
    weeklyTargetDays?: 5 | 6 | 7;
  },
  nowMs = Date.now(),
): ClassicalHifzPlan {
  const nextMode = patch.juz30Mode ?? plan.juz30Mode;
  const nextWeekly = patch.weeklyTargetDays ?? plan.weeklyTargetDays;
  const preHas = getJuzPageBounds(30, nextMode).preHasPages;
  const nextHasPages = normalizeHasPages([...plan.hasPages, ...preHas]);

  const steps = getOrderedClassicalSteps(nextMode);
  const currentValid = getPageForRoundAndJuz(plan.currentRound, plan.currentJuz, nextMode);
  let nextRound = plan.currentRound;
  let nextJuz = plan.currentJuz;

  if (currentValid === null) {
    const hasSet = new Set<number>(nextHasPages);
    const fallback = steps.find((s) => !hasSet.has(s.mushafPage)) ?? steps[0];
    nextRound = fallback.round;
    nextJuz = fallback.juz;
  }

  return {
    ...plan,
    juz30Mode: nextMode,
    weeklyTargetDays: nextWeekly,
    hasPages: nextHasPages,
    currentRound: nextRound,
    currentJuz: nextJuz,
    updatedAt: nowMs,
    completedAt: nextHasPages.length >= TOTAL_MUSHAF_PAGES ? (plan.completedAt ?? nowMs) : null,
  };
}

export function computeClassicalStats(
  plan: ClassicalHifzPlan,
  nowMs = Date.now(),
): ClassicalHifzStats {
  const hasSet = new Set<number>(plan.hasPages);
  const hasCount = Math.min(TOTAL_MUSHAF_PAGES, hasSet.size);
  const remainingPages = Math.max(0, TOTAL_MUSHAF_PAGES - hasCount);
  const percent = Number(((hasCount / TOTAL_MUSHAF_PAGES) * 100).toFixed(1));
  const maxRounds = getMaxRoundForMode(plan.juz30Mode);

  let completedRoundsCount = 0;
  let currentRoundDone = 0;
  let currentRoundTotal = 0;

  for (let r = 1; r <= maxRounds; r += 1) {
    let roundTotal = 0;
    let roundDone = 0;
    for (let j = 1; j <= 30; j += 1) {
      const p = getPageForRoundAndJuz(r, j, plan.juz30Mode);
      if (p !== null) {
        roundTotal += 1;
        if (hasSet.has(p)) roundDone += 1;
      }
    }
    if (roundTotal > 0 && roundDone === roundTotal) {
      completedRoundsCount += 1;
    }
    if (r === plan.currentRound) {
      currentRoundDone = roundDone;
      currentRoundTotal = roundTotal;
    }
  }

  const estimatedDaysRemaining =
    remainingPages === 0
      ? 0
      : Math.ceil((remainingPages * 7) / Math.max(1, plan.weeklyTargetDays));

  const estimatedFinishDate =
    remainingPages === 0
      ? null
      : new Date(nowMs + estimatedDaysRemaining * 24 * 60 * 60 * 1000);

  const estimatedFinishLabel = estimatedFinishDate
    ? new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(estimatedFinishDate)
    : 'Hıfz Tamamlandı';

  return {
    hasCount,
    remainingPages,
    percent,
    completedRoundsCount,
    maxRounds,
    currentRoundDone,
    currentRoundTotal,
    estimatedDaysRemaining,
    estimatedFinishDate,
    estimatedFinishLabel,
  };
}

export function describeMushafPageContent(
  meta: MetaData | null,
  pageNo: number,
): PageContentSummary {
  const safePage = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, Math.trunc(pageNo) || 1));
  if (!meta) {
    return {
      pageNo: safePage,
      surahNames: [],
      surahSummary: `Sayfa ${safePage}`,
      ayahRangeLabel: '',
      ayahCount: 0,
      firstSurah: 1,
      firstAyah: 1,
      ranges: [],
    };
  }

  const built = buildRangesForMushafPage(meta, safePage, 'full');
  const surahMap = new Map(meta.surahs.map((s) => [s.no, s.shortNameTr]));

  const rangeParts = built.ranges.map((r) => {
    const sName = surahMap.get(r.surah) ?? `${r.surah}. Sure`;
    return r.startAyah === r.endAyah
      ? `${sName} ${r.startAyah}`
      : `${sName} ${r.startAyah}–${r.endAyah}`;
  });

  const surahSummary =
    built.surahNames.length <= 2
      ? built.surahNames.join(' · ')
      : `${built.surahNames[0]} … ${built.surahNames[built.surahNames.length - 1]} (${built.surahNames.length} sure)`;

  const ayahRangeLabel =
    rangeParts.length <= 2
      ? rangeParts.join(' · ')
      : `${rangeParts[0]} … ${rangeParts[rangeParts.length - 1]}`;

  return {
    pageNo: safePage,
    surahNames: built.surahNames,
    surahSummary: surahSummary || `Sayfa ${safePage}`,
    ayahRangeLabel,
    ayahCount: built.verseKeys.length,
    firstSurah: built.ranges[0]?.surah ?? 1,
    firstAyah: built.ranges[0]?.startAyah ?? 1,
    ranges: built.ranges,
  };
}

/**
 * Verilen Mushaf sayfalarından havuzu şişirmeden anlık (ad-hoc) MemorizationUnit üretir.
 * Ardışık sayfaların aynı sureye ait aralıklarını temizce birleştirir.
 */
export function buildAdHocUnitForPages(
  meta: MetaData | null,
  pages: number[],
  title: string,
  subtitle: string,
): MemorizationUnit | null {
  if (!meta) return null;
  const sortedPages = normalizeHasPages(pages);
  if (sortedPages.length === 0) return null;

  const mergedRanges: AyahRange[] = [];
  for (const pageNo of sortedPages) {
    const { ranges } = buildRangesForMushafPage(meta, pageNo, 'full');
    for (const r of ranges) {
      const last = mergedRanges[mergedRanges.length - 1];
      if (last && last.surah === r.surah && last.endAyah + 1 === r.startAyah) {
        last.endAyah = r.endAyah;
      } else {
        mergedRanges.push({ ...r });
      }
    }
  }

  if (mergedRanges.length === 0) return null;

  return buildMemorizationUnitFromRanges(meta, {
    id: `adhoc_classical_${sortedPages[0]}_${sortedPages[sortedPages.length - 1]}_${sortedPages.length}`,
    title,
    subtitle,
    sourceType: 'page',
    ranges: mergedRanges,
  });
}

export function formatPagesCompactLabel(pages: number[]): string {
  const sorted = normalizeHasPages(pages);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return `Sayfa ${sorted[0]}`;

  // Ardışık blokları grupla (örn. [19, 20] -> "19–20", [18, 19, 20] -> "18–20")
  const groups: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      groups.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  groups.push(start === prev ? `${start}` : `${start}–${prev}`);
  return `Sayfa ${groups.join(', ')}`;
}
