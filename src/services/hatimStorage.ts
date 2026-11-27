import { dataService } from './dataService';
import type { MetaData } from '../types/quran';
import { getHijriDailyJuzRecommendation } from '../utils/islamicCalendar';
import { isAllPersistencePaused, reportStorageQuotaError } from '../utils/storageQuotaBus';

export const HATIM_STORAGE_KEY = 'muallimun_hatim_planner_v1';
export const HATIM_TOTAL_PAGES = 604;
export const HATIM_TOTAL_JUZS = 30;

export type HatimGoalMode = 'daily_pages' | 'target_date' | 'free_juz' | 'hijri_month';

export interface CompletedHatimRecord {
  id: string;
  title: string;
  startedAt: string;
  completedAt: string;
  durationDays: number;
  note?: string;
}

export interface ActiveHatimPlan {
  id: string;
  title: string;
  goalMode: HatimGoalMode;
  dailyTargetPages: number;
  targetEndDate?: string | null;
  completedPages: number[];
  currentPage: number;
  todayDate: string;
  todayReadPages: number[];
  lastReadDate?: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface HatimPlannerState {
  version: 1;
  activePlan: ActiveHatimPlan | null;
  history: CompletedHatimRecord[];
}

export interface HatimJuzStatus {
  juz: number;
  startPage: number;
  endPage: number;
  totalPages: number;
  readCount: number;
  status: 'completed' | 'partial' | 'not_started';
  firstUnreadPage: number | null;
}

export interface HatimProgressSummary {
  completedCount: number;
  remainingPages: number;
  percent: number;
  completedJuzCount: number;
  todayTargetPages: number;
  todayCompletedCount: number;
  todayRemainingPages: number;
  isTodayQuotaMet: boolean;
  isCompleted: boolean;
  estimatedDaysRemaining: number | null;
  estimatedFinishDate: Date | null;
  currentJuz: number;
  daysSinceLastRead: number | null;
  missedHijriJuzCount: number;
  isTargetDateBehind: boolean;
}

export function getLocalDateStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getHatimJuzPageBounds(juzNo: number): {
  juz: number;
  startPage: number;
  endPage: number;
  totalPages: number;
} {
  const safeJuz = Math.max(1, Math.min(HATIM_TOTAL_JUZS, Math.trunc(juzNo) || 1));
  if (safeJuz === 30) {
    return { juz: 30, startPage: 581, endPage: 604, totalPages: 24 };
  }
  const startPage = (safeJuz - 1) * 20 + 1;
  const endPage = safeJuz * 20;
  return { juz: safeJuz, startPage, endPage, totalPages: 20 };
}

export function getJuzForMushafPage(pageNo: number): number {
  const safePage = Math.max(1, Math.min(HATIM_TOTAL_PAGES, Math.trunc(pageNo) || 1));
  if (safePage >= 581) return 30;
  return Math.floor((safePage - 1) / 20) + 1;
}

/**
 * 604 sayfalık 30 cüz düzeninde 30. cüz 24 sayfa olduğu için (+4 sayfa)
 * günde 20 sayfa = tam 30 gün, günde 10 sayfa = tam 60 gün mukabele tutarlılığı sağlar.
 */
export function estimateHatimDays(remainingPages: number, dailyTargetPages: number): number {
  const remaining = Math.max(0, Math.trunc(remainingPages));
  if (remaining <= 0) return 0;
  const daily = Math.max(1, Math.trunc(dailyTargetPages) || 1);

  if (daily === 20) {
    if (remaining <= 24) return 1;
    if (remaining % 20 <= 4) return Math.floor(remaining / 20);
    return Math.ceil(remaining / 20);
  }

  if (daily === 10 && remaining >= 600 && remaining % 10 <= 4) {
    return 60;
  }

  return Math.ceil(remaining / daily);
}

export function normalizePageList(pages: Iterable<number>): number[] {
  const set = new Set<number>();
  for (const p of pages) {
    if (typeof p === 'number' && Number.isFinite(p)) {
      const n = Math.trunc(p);
      if (n >= 1 && n <= HATIM_TOTAL_PAGES) {
        set.add(n);
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function findNextUnreadPage(
  completedPages: readonly number[],
  preferredStart = 1,
): number {
  const set = new Set(completedPages);
  const start = Math.max(1, Math.min(HATIM_TOTAL_PAGES, Math.trunc(preferredStart) || 1));
  for (let p = start; p <= HATIM_TOTAL_PAGES; p += 1) {
    if (!set.has(p)) return p;
  }
  for (let p = 1; p < start; p += 1) {
    if (!set.has(p)) return p;
  }
  return HATIM_TOTAL_PAGES;
}

function isValidDateStamp(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

function sanitizeGoalMode(raw: unknown): HatimGoalMode {
  if (
    raw === 'daily_pages' ||
    raw === 'target_date' ||
    raw === 'free_juz' ||
    raw === 'hijri_month'
  ) {
    return raw;
  }
  return 'daily_pages';
}

function sanitizeIso(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return fallback;
}

export function sanitizeActiveHatimPlan(raw: unknown): ActiveHatimPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const today = getLocalDateStamp();

  const completedPages = Array.isArray(r.completedPages)
    ? normalizePageList(r.completedPages.filter((x): x is number => typeof x === 'number'))
    : [];

  const rawDaily =
    typeof r.dailyTargetPages === 'number' && Number.isFinite(r.dailyTargetPages)
      ? Math.trunc(r.dailyTargetPages)
      : 20;
  const dailyTargetPages = Math.max(1, Math.min(HATIM_TOTAL_PAGES, rawDaily));

  const rawCurrent =
    typeof r.currentPage === 'number' && Number.isFinite(r.currentPage)
      ? Math.trunc(r.currentPage)
      : findNextUnreadPage(completedPages, 1);
  const currentPage = Math.max(1, Math.min(HATIM_TOTAL_PAGES, rawCurrent));

  const storedToday = isValidDateStamp(r.todayDate) ? r.todayDate.trim() : today;
  const rawTodayPages =
    storedToday === today && Array.isArray(r.todayReadPages)
      ? normalizePageList(r.todayReadPages.filter((x): x is number => typeof x === 'number'))
      : [];

  const targetEndDate = isValidDateStamp(r.targetEndDate) ? r.targetEndDate.trim() : null;
  const startedAt = sanitizeIso(r.startedAt, nowIso);
  const updatedAt = sanitizeIso(r.updatedAt, nowIso);

  let lastReadDate: string | null;
  if (isValidDateStamp(r.lastReadDate)) {
    lastReadDate = r.lastReadDate.trim();
  } else if (r.lastReadDate === null) {
    lastReadDate = null;
  } else if (rawTodayPages.length > 0) {
    lastReadDate = today;
  } else if (
    Array.isArray(r.todayReadPages) &&
    r.todayReadPages.length > 0 &&
    isValidDateStamp(r.todayDate)
  ) {
    lastReadDate = r.todayDate.trim();
  } else if (completedPages.length > 0) {
    lastReadDate = getLocalDateStamp(new Date(updatedAt));
  } else {
    lastReadDate = null;
  }

  return {
    id:
      typeof r.id === 'string' && r.id.trim()
        ? r.id.trim().slice(0, 80)
        : `hatim_${Date.now()}`,
    title:
      typeof r.title === 'string' && r.title.trim()
        ? r.title.trim().slice(0, 80)
        : 'Hatim Programım',
    goalMode: sanitizeGoalMode(r.goalMode),
    dailyTargetPages,
    targetEndDate,
    completedPages,
    currentPage,
    todayDate: today,
    todayReadPages: rawTodayPages,
    lastReadDate,
    startedAt,
    updatedAt,
  };
}

function sanitizeHistoryRecord(raw: unknown): CompletedHatimRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const startedAt = sanitizeIso(r.startedAt, nowIso);
  const completedAt = sanitizeIso(r.completedAt, nowIso);
  const durationDays =
    typeof r.durationDays === 'number' && Number.isFinite(r.durationDays)
      ? Math.max(1, Math.trunc(r.durationDays))
      : computeDurationDays(startedAt, completedAt);

  return {
    id:
      typeof r.id === 'string' && r.id.trim()
        ? r.id.trim().slice(0, 80)
        : `hatim_hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title:
      typeof r.title === 'string' && r.title.trim()
        ? r.title.trim().slice(0, 80)
        : 'Tamamlanan Hatim',
    startedAt,
    completedAt,
    durationDays,
    note: typeof r.note === 'string' && r.note.trim() ? r.note.trim().slice(0, 300) : undefined,
  };
}

export function sanitizeHatimState(raw: unknown): HatimPlannerState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, activePlan: null, history: [] };
  }
  const r = raw as Record<string, unknown>;
  const activePlan = sanitizeActiveHatimPlan(r.activePlan);
  const history = Array.isArray(r.history)
    ? r.history
        .map((item) => sanitizeHistoryRecord(item))
        .filter((item): item is CompletedHatimRecord => item !== null)
        .slice(0, 100)
    : [];

  return {
    version: 1,
    activePlan,
    history,
  };
}

export function validateHatimBackupJson(rawJson: string): {
  valid: boolean;
  hasActivePlan: boolean;
  completedPagesCount: number;
  historyCount: number;
} {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, hasActivePlan: false, completedPagesCount: 0, historyCount: 0 };
    }
    const sanitized = sanitizeHatimState(parsed);
    return {
      valid: true,
      hasActivePlan: Boolean(sanitized.activePlan),
      completedPagesCount: sanitized.activePlan?.completedPages.length ?? 0,
      historyCount: sanitized.history.length,
    };
  } catch {
    return { valid: false, hasActivePlan: false, completedPagesCount: 0, historyCount: 0 };
  }
}

function computeDurationDays(startedAtIso: string, completedAtIso: string): number {
  const start = new Date(startedAtIso).getTime();
  const end = new Date(completedAtIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
}

function computeCalendarDaysBetween(fromDateStamp: string, toDateStamp: string): number {
  if (!isValidDateStamp(fromDateStamp) || !isValidDateStamp(toDateStamp)) return 0;
  const [fy, fm, fd] = fromDateStamp.split('-').map(Number);
  const [ty, tm, td] = toDateStamp.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.max(0, Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000)));
}

function computeRemainingDaysUntilDate(targetDateStamp: string | null | undefined): number {
  if (!targetDateStamp || !isValidDateStamp(targetDateStamp)) return 30;
  const parts = targetDateStamp.split('-').map(Number);
  const target = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const diffMs = target.getTime() - todayStart.getTime();
  if (diffMs <= 0) return 1;
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

export function getHatimJuzStatuses(plan: ActiveHatimPlan | null): HatimJuzStatus[] {
  const readSet = new Set(plan?.completedPages ?? []);
  const list: HatimJuzStatus[] = [];

  for (let juz = 1; juz <= HATIM_TOTAL_JUZS; juz += 1) {
    const bounds = getHatimJuzPageBounds(juz);
    let readCount = 0;
    let firstUnreadPage: number | null = null;
    for (let p = bounds.startPage; p <= bounds.endPage; p += 1) {
      if (readSet.has(p)) {
        readCount += 1;
      } else if (firstUnreadPage === null) {
        firstUnreadPage = p;
      }
    }
    const status: HatimJuzStatus['status'] =
      readCount >= bounds.totalPages
        ? 'completed'
        : readCount > 0
          ? 'partial'
          : 'not_started';

    list.push({
      juz,
      startPage: bounds.startPage,
      endPage: bounds.endPage,
      totalPages: bounds.totalPages,
      readCount,
      status,
      firstUnreadPage,
    });
  }
  return list;
}

export function computeHatimSummary(plan: ActiveHatimPlan): HatimProgressSummary {
  const today = getLocalDateStamp();
  const completedCount = plan.completedPages.length;
  const remainingPages = Math.max(0, HATIM_TOTAL_PAGES - completedCount);
  const percent = Number(((completedCount / HATIM_TOTAL_PAGES) * 100).toFixed(1));
  const isCompleted = completedCount >= HATIM_TOTAL_PAGES;

  const juzStatuses = getHatimJuzStatuses(plan);
  const completedJuzCount = juzStatuses.filter((j) => j.status === 'completed').length;

  let todayCompletedCount = plan.todayDate === today ? plan.todayReadPages.length : 0;
  let todayTargetPages = plan.dailyTargetPages;
  let todayRemainingPages: number;
  let estimatedDaysRemaining: number | null = null;
  let estimatedFinishDate: Date | null = null;
  let missedHijriJuzCount = 0;
  let isTargetDateBehind = false;

  if (plan.goalMode === 'hijri_month') {
    const rec = getHijriDailyJuzRecommendation();
    todayTargetPages = rec.totalPages;
    const completedSet = new Set(plan.completedPages);
    let completedInTodayJuz = 0;
    for (let p = rec.startPage; p <= rec.endPage; p += 1) {
      if (completedSet.has(p)) {
        completedInTodayJuz += 1;
      }
    }
    todayCompletedCount = completedInTodayJuz;
    todayRemainingPages = isCompleted
      ? 0
      : Math.max(0, todayTargetPages - completedInTodayJuz);
    estimatedDaysRemaining = isCompleted
      ? 0
      : Math.max(1, rec.monthLength - rec.hijri.day + 1);
    if (!isCompleted && isValidDateStamp(rec.monthEndDateStamp)) {
      const parts = rec.monthEndDateStamp.split('-').map(Number);
      estimatedFinishDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    if (!isCompleted && rec.primaryJuz > 1) {
      for (let juzIdx = 0; juzIdx < rec.primaryJuz - 1; juzIdx += 1) {
        if (juzStatuses[juzIdx] && juzStatuses[juzIdx].status !== 'completed') {
          missedHijriJuzCount += 1;
        }
      }
    }
  } else {
    if (plan.goalMode === 'target_date' && plan.targetEndDate) {
      const daysLeft = computeRemainingDaysUntilDate(plan.targetEndDate);
      // Bugün zaten okunan sayfaları da hesaba katarak gün başındaki dinamik hedefi sabit tut
      const remainingAtDayStart = remainingPages + todayCompletedCount;
      todayTargetPages =
        remainingAtDayStart <= 0
          ? 0
          : Math.max(1, Math.min(HATIM_TOTAL_PAGES, Math.ceil(remainingAtDayStart / daysLeft)));
      isTargetDateBehind = !isCompleted && todayTargetPages - plan.dailyTargetPages >= 5;
      estimatedDaysRemaining = isCompleted ? 0 : daysLeft;
      if (!isCompleted) {
        const parts = plan.targetEndDate.split('-').map(Number);
        estimatedFinishDate = new Date(parts[0], parts[1] - 1, parts[2]);
      }
    } else if (plan.goalMode === 'daily_pages') {
      // Borç yığmama kuralı: Okunmayan günler günlük hedefi katlamaz; bitiş tahmini doğal olarak ileri kayar
      todayTargetPages = Math.max(1, Math.min(HATIM_TOTAL_PAGES, plan.dailyTargetPages));
      if (isCompleted) {
        estimatedDaysRemaining = 0;
      } else {
        estimatedDaysRemaining = estimateHatimDays(remainingPages, todayTargetPages);
        estimatedFinishDate = new Date(Date.now() + estimatedDaysRemaining * 24 * 60 * 60 * 1000);
      }
    } else {
      // Serbest cüz dağıtımı
      todayTargetPages = Math.max(1, Math.min(HATIM_TOTAL_PAGES, plan.dailyTargetPages || 20));
      if (isCompleted) {
        estimatedDaysRemaining = 0;
      }
    }

    todayRemainingPages = isCompleted
      ? 0
      : Math.max(0, Math.min(remainingPages, todayTargetPages - todayCompletedCount));
  }

  let daysSinceLastRead: number | null = null;
  if (plan.lastReadDate && isValidDateStamp(plan.lastReadDate)) {
    daysSinceLastRead = computeCalendarDaysBetween(plan.lastReadDate, today);
  } else if (todayCompletedCount > 0) {
    daysSinceLastRead = 0;
  } else if (plan.startedAt) {
    const startedDt = new Date(plan.startedAt);
    if (!Number.isNaN(startedDt.getTime())) {
      daysSinceLastRead = computeCalendarDaysBetween(getLocalDateStamp(startedDt), today);
    }
  }

  return {
    completedCount,
    remainingPages,
    percent,
    completedJuzCount,
    todayTargetPages,
    todayCompletedCount,
    todayRemainingPages,
    isTodayQuotaMet: isCompleted || todayRemainingPages === 0,
    isCompleted,
    estimatedDaysRemaining,
    estimatedFinishDate,
    currentJuz: getJuzForMushafPage(plan.currentPage),
    daysSinceLastRead,
    missedHijriJuzCount,
    isTargetDateBehind,
  };
}

export function resolvePageLocationForBookmark(
  meta: MetaData | null,
  pageNo: number,
): { page: number; surah: number; ayah: number } {
  const safePage = Math.max(1, Math.min(HATIM_TOTAL_PAGES, Math.trunc(pageNo) || 1));
  if (meta) {
    const row = meta.verseIndex.find((r) => r[4] === safePage);
    if (row) {
      return { page: safePage, surah: row[1], ayah: row[2] };
    }
    const bounds = dataService.getPageBounds(meta);
    const clamped = Math.max(bounds.minPage, Math.min(bounds.maxPage, safePage));
    const fallback = meta.verseIndex.find((r) => r[4] === clamped);
    if (fallback) {
      return { page: clamped, surah: fallback[1], ayah: fallback[2] };
    }
  }
  return { page: safePage, surah: 1, ayah: 1 };
}

// ============================================================================
// Reaktif localStorage Servisi (useSyncExternalStore + Çoklu Sekme Senkronlu)
// ============================================================================

const listeners = new Set<() => void>();
let cachedState: HatimPlannerState = { version: 1, activePlan: null, history: [] };
let hydrated = false;

function readFromStorage(): HatimPlannerState {
  if (typeof window === 'undefined') {
    return { version: 1, activePlan: null, history: [] };
  }
  try {
    const raw = window.localStorage.getItem(HATIM_STORAGE_KEY);
    if (!raw) return { version: 1, activePlan: null, history: [] };
    return sanitizeHatimState(JSON.parse(raw));
  } catch {
    return { version: 1, activePlan: null, history: [] };
  }
}

function ensureHydrated(): HatimPlannerState {
  if (!hydrated) {
    cachedState = readFromStorage();
    hydrated = true;
  }
  return cachedState;
}

function emitChange(): void {
  listeners.forEach((fn) => fn());
}

function persistState(next: HatimPlannerState): HatimPlannerState {
  cachedState = next;
  hydrated = true;
  if (typeof window !== 'undefined' && !isAllPersistencePaused()) {
    try {
      window.localStorage.setItem(HATIM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      reportStorageQuotaError();
    }
  }
  emitChange();
  return next;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === HATIM_STORAGE_KEY) {
      cachedState = readFromStorage();
      hydrated = true;
      emitChange();
    }
  });
}

function rollToday(plan: ActiveHatimPlan): ActiveHatimPlan {
  const today = getLocalDateStamp();
  if (plan.todayDate === today) return plan;
  return {
    ...plan,
    todayDate: today,
    todayReadPages: [],
  };
}

export const hatimStorage = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): HatimPlannerState {
    return ensureHydrated();
  },

  startNewHatim(options: {
    title?: string;
    goalMode: HatimGoalMode;
    dailyTargetPages?: number;
    targetEndDate?: string | null;
    startPage?: number;
    preMarkBeforeStartPage?: boolean;
  }): ActiveHatimPlan {
    const state = ensureHydrated();
    const nowIso = new Date().toISOString();
    const today = getLocalDateStamp();
    const nextNumber = state.history.length + 1;

    const safeStartPage = Math.max(
      1,
      Math.min(HATIM_TOTAL_PAGES, Math.trunc(options.startPage ?? 1) || 1),
    );

    const preCompleted: number[] = [];
    if (options.preMarkBeforeStartPage !== false && safeStartPage > 1) {
      for (let p = 1; p < safeStartPage; p += 1) {
        preCompleted.push(p);
      }
    }

    const safeDaily = Math.max(
      1,
      Math.min(HATIM_TOTAL_PAGES, Math.trunc(options.dailyTargetPages ?? 20) || 20),
    );

    const plan: ActiveHatimPlan = {
      id: `hatim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: options.title?.trim() || `${nextNumber}. Hatim`,
      goalMode: options.goalMode,
      dailyTargetPages: safeDaily,
      targetEndDate:
        options.goalMode === 'target_date' && isValidDateStamp(options.targetEndDate)
          ? options.targetEndDate
          : null,
      completedPages: preCompleted,
      currentPage: safeStartPage,
      todayDate: today,
      todayReadPages: [],
      lastReadDate: null,
      startedAt: nowIso,
      updatedAt: nowIso,
    };

    persistState({
      ...state,
      activePlan: plan,
    });
    return plan;
  },

  updateActivePlan(patch: {
    title?: string;
    goalMode?: HatimGoalMode;
    dailyTargetPages?: number;
    targetEndDate?: string | null;
  }): ActiveHatimPlan | null {
    const state = ensureHydrated();
    if (!state.activePlan) return null;
    const base = rollToday(state.activePlan);
    const nextMode = patch.goalMode ?? base.goalMode;
    const nextPlan: ActiveHatimPlan = {
      ...base,
      title: patch.title !== undefined ? patch.title.trim() || base.title : base.title,
      goalMode: nextMode,
      dailyTargetPages:
        patch.dailyTargetPages !== undefined
          ? Math.max(1, Math.min(HATIM_TOTAL_PAGES, Math.trunc(patch.dailyTargetPages) || 1))
          : base.dailyTargetPages,
      targetEndDate:
        nextMode === 'target_date'
          ? patch.targetEndDate !== undefined
            ? isValidDateStamp(patch.targetEndDate)
              ? patch.targetEndDate
              : null
            : base.targetEndDate ?? null
          : null,
      updatedAt: new Date().toISOString(),
    };

    persistState({ ...state, activePlan: nextPlan });
    return nextPlan;
  },

  toggleJuzCompleted(juzNo: number): ActiveHatimPlan | null {
    const state = ensureHydrated();
    if (!state.activePlan) return null;
    const base = rollToday(state.activePlan);
    const bounds = getHatimJuzPageBounds(juzNo);
    const completedSet = new Set(base.completedPages);
    const todaySet = new Set(base.todayReadPages);

    let allInJuzDone = true;
    for (let p = bounds.startPage; p <= bounds.endPage; p += 1) {
      if (!completedSet.has(p)) {
        allInJuzDone = false;
        break;
      }
    }

    if (allInJuzDone) {
      for (let p = bounds.startPage; p <= bounds.endPage; p += 1) {
        completedSet.delete(p);
        todaySet.delete(p);
      }
    } else {
      for (let p = bounds.startPage; p <= bounds.endPage; p += 1) {
        if (!completedSet.has(p)) {
          todaySet.add(p);
        }
        completedSet.add(p);
      }
    }

    const nextCompleted = normalizePageList(completedSet);
    const nextToday = normalizePageList(todaySet);
    const preferredStart = allInJuzDone ? bounds.startPage : Math.min(HATIM_TOTAL_PAGES, bounds.endPage + 1);
    const nextCurrent = findNextUnreadPage(nextCompleted, preferredStart);

    const nextPlan: ActiveHatimPlan = {
      ...base,
      completedPages: nextCompleted,
      todayReadPages: nextToday,
      currentPage: nextCurrent,
      lastReadDate: !allInJuzDone ? getLocalDateStamp() : (base.lastReadDate ?? null),
      updatedAt: new Date().toISOString(),
    };
    persistState({ ...state, activePlan: nextPlan });
    return nextPlan;
  },

  /**
   * Mevcut `currentPage` (veya verilen `fromPage`) konumundan `targetPage` sayfasına kadar olan
   * sayfaları okundu olarak işaretler ve sıradaki okunmamış sayfaya ilerler.
   */
  markPagesReadUpTo(
    targetPage: number,
    options?: { fromPage?: number; includeTargetPage?: boolean },
  ): ActiveHatimPlan | null {
    const state = ensureHydrated();
    if (!state.activePlan) return null;
    const base = rollToday(state.activePlan);
    const safeTarget = Math.max(1, Math.min(HATIM_TOTAL_PAGES, Math.trunc(targetPage) || 1));
    const includeTarget = options?.includeTargetPage ?? false;
    const start = Math.max(
      1,
      Math.min(HATIM_TOTAL_PAGES, Math.trunc(options?.fromPage ?? base.currentPage) || 1),
    );
    const end = includeTarget ? safeTarget : safeTarget - 1;

    const completedSet = new Set(base.completedPages);
    const todaySet = new Set(base.todayReadPages);

    if (end >= start) {
      for (let p = start; p <= end; p += 1) {
        if (!completedSet.has(p)) {
          completedSet.add(p);
          todaySet.add(p);
        }
      }
    }

    const nextCompleted = normalizePageList(completedSet);
    const nextToday = normalizePageList(todaySet);
    const nextCurrent = includeTarget
      ? findNextUnreadPage(nextCompleted, Math.min(HATIM_TOTAL_PAGES, safeTarget + 1))
      : safeTarget;

    const nextPlan: ActiveHatimPlan = {
      ...base,
      completedPages: nextCompleted,
      todayReadPages: nextToday,
      currentPage: nextCurrent,
      lastReadDate: end >= start ? getLocalDateStamp() : (base.lastReadDate ?? null),
      updatedAt: new Date().toISOString(),
    };
    persistState({ ...state, activePlan: nextPlan });
    return nextPlan;
  },

  /**
   * Bugünkü hedeften kalan sayfa adedini `currentPage` itibarıyla okundu işaretler.
   */
  completeTodayQuota(): { plan: ActiveHatimPlan; markedPages: number[] } | null {
    const state = ensureHydrated();
    if (!state.activePlan) return null;
    const base = rollToday(state.activePlan);

    const completedSet = new Set(base.completedPages);
    const todaySet = new Set(base.todayReadPages);
    const newlyMarked: number[] = [];
    let preferredNextStart = base.currentPage;

    if (base.goalMode === 'hijri_month') {
      const rec = getHijriDailyJuzRecommendation();
      for (let p = rec.startPage; p <= rec.endPage; p += 1) {
        if (!completedSet.has(p)) {
          completedSet.add(p);
          todaySet.add(p);
          newlyMarked.push(p);
        }
      }
      if (newlyMarked.length === 0) {
        return { plan: base, markedPages: [] };
      }
      preferredNextStart = Math.min(HATIM_TOTAL_PAGES, rec.endPage + 1);
    } else {
      const summary = computeHatimSummary(base);
      const countToMark = summary.todayRemainingPages;

      if (countToMark <= 0) {
        return { plan: base, markedPages: [] };
      }

      // Önce currentPage'den 604'e, yetmezse 1'den currentPage'e okunmamış sayfaları topla
      for (
        let p = base.currentPage;
        p <= HATIM_TOTAL_PAGES && newlyMarked.length < countToMark;
        p += 1
      ) {
        if (!completedSet.has(p)) {
          completedSet.add(p);
          todaySet.add(p);
          newlyMarked.push(p);
        }
      }
      for (let p = 1; p < base.currentPage && newlyMarked.length < countToMark; p += 1) {
        if (!completedSet.has(p)) {
          completedSet.add(p);
          todaySet.add(p);
          newlyMarked.push(p);
        }
      }
      const lastMarked = newlyMarked[newlyMarked.length - 1] ?? base.currentPage;
      preferredNextStart = Math.min(HATIM_TOTAL_PAGES, lastMarked + 1);
    }

    const nextCompleted = normalizePageList(completedSet);
    const nextToday = normalizePageList(todaySet);
    const nextCurrent = findNextUnreadPage(nextCompleted, preferredNextStart);

    const nextPlan: ActiveHatimPlan = {
      ...base,
      completedPages: nextCompleted,
      todayReadPages: nextToday,
      currentPage: nextCurrent,
      lastReadDate: getLocalDateStamp(),
      updatedAt: new Date().toISOString(),
    };

    persistState({ ...state, activePlan: nextPlan });
    return { plan: nextPlan, markedPages: newlyMarked };
  },

  setCurrentPage(pageNo: number): ActiveHatimPlan | null {
    const state = ensureHydrated();
    if (!state.activePlan) return null;
    const safePage = Math.max(1, Math.min(HATIM_TOTAL_PAGES, Math.trunc(pageNo) || 1));
    const nextPlan: ActiveHatimPlan = {
      ...rollToday(state.activePlan),
      currentPage: safePage,
      updatedAt: new Date().toISOString(),
    };
    persistState({ ...state, activePlan: nextPlan });
    return nextPlan;
  },

  completeAndArchiveHatim(options?: {
    title?: string;
    note?: string;
    startNewAfter?: boolean;
  }): CompletedHatimRecord | null {
    const state = ensureHydrated();
    if (!state.activePlan) return null;
    const nowIso = new Date().toISOString();
    const plan = state.activePlan;

    const record: CompletedHatimRecord = {
      id: `hatim_done_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: options?.title?.trim() || plan.title || `${state.history.length + 1}. Hatim`,
      startedAt: plan.startedAt,
      completedAt: nowIso,
      durationDays: computeDurationDays(plan.startedAt, nowIso),
      note: options?.note?.trim() ? options.note.trim().slice(0, 300) : undefined,
    };

    const nextHistory = [record, ...state.history].slice(0, 100);
    let nextActive: ActiveHatimPlan | null = null;
    if (options?.startNewAfter) {
      nextActive = {
        id: `hatim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: `${nextHistory.length + 1}. Hatim`,
        goalMode: plan.goalMode === 'target_date' ? 'daily_pages' : plan.goalMode,
        dailyTargetPages: plan.dailyTargetPages,
        targetEndDate: null,
        completedPages: [],
        currentPage: 1,
        todayDate: getLocalDateStamp(),
        todayReadPages: [],
        lastReadDate: null,
        startedAt: nowIso,
        updatedAt: nowIso,
      };
    }

    persistState({
      version: 1,
      activePlan: nextActive,
      history: nextHistory,
    });
    return record;
  },

  abandonActivePlan(): void {
    const state = ensureHydrated();
    persistState({
      ...state,
      activePlan: null,
    });
  },

  deleteHistoryRecord(recordId: string): void {
    const state = ensureHydrated();
    persistState({
      ...state,
      history: state.history.filter((h) => h.id !== recordId),
    });
  },
};
