import { getRangesSignature } from '../data/curatedAshrPresets';
import type {
  ActiveSessionSnapshot,
  AyahRange,
  MemorizationBackupPayload,
  MemorizationPrefs,
  MemorizationUnit,
  RetentionStage,
  SelfEvaluationRating,
  UnitSourceType,
} from '../types/memorization';
import { REVIEW_INTERVAL_DAYS } from '../types/memorization';

const DB_NAME = 'muallimun_memorization_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

const LS_PREFIX = 'muallimun_memorization_v1_';
const KEY_UNITS = 'units';
const KEY_PREFS = 'prefs';
const KEY_ACTIVE_SESSION = 'active_session';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_MEMORIZATION_PREFS: MemorizationPrefs = {
  method: 'snowball',
  profile: 'balanced',
  customConfig: {
    newAyahReps: 5,
    chainReps: 2,
    blockRounds: 3,
    windowSize: 5,
  },
  reciterId: null,
  listenRepeatPauseEnabled: false,
  pauseMultiplier: 1,
  viewMode: 'focus',
  autoProgressiveHide: true,
  showVaslHook: true,
  playbackRate: 1,
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (value === null || value === undefined) {
        store.delete(key);
      } else {
        store.put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function lsGet<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LS_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsSet<T>(key: string, value: T | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(`${LS_PREFIX}${key}`);
    } else {
      window.localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
    }
  } catch {
    // Depolama kotası veya gizli sekme kısıtlıysa sessizce geç
  }
}

function sanitizeUnit(raw: unknown): MemorizationUnit | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Partial<MemorizationUnit>;
  if (typeof u.id !== 'string' || !u.id.trim()) return null;
  if (typeof u.title !== 'string' || !u.title.trim()) return null;
  if (!Array.isArray(u.ranges) || u.ranges.length === 0) return null;

  const ranges: AyahRange[] = [];
  for (const r of u.ranges) {
    if (!r || typeof r !== 'object') continue;
    const surah = Number((r as AyahRange).surah);
    const startAyah = Number((r as AyahRange).startAyah);
    const endAyah = Number((r as AyahRange).endAyah);
    if (
      Number.isFinite(surah) &&
      surah >= 1 &&
      surah <= 114 &&
      Number.isFinite(startAyah) &&
      startAyah >= 1 &&
      Number.isFinite(endAyah) &&
      endAyah >= 1
    ) {
      ranges.push({
        surah: Math.floor(surah),
        startAyah: Math.min(Math.floor(startAyah), Math.floor(endAyah)),
        endAyah: Math.max(Math.floor(startAyah), Math.floor(endAyah)),
      });
    }
  }
  if (ranges.length === 0) return null;

  const verseKeys = Array.isArray(u.verseKeys)
    ? u.verseKeys.filter((k): k is string => typeof k === 'string' && /^\d+:\d+$/.test(k))
    : [];
  if (verseKeys.length === 0) {
    for (const r of ranges) {
      for (let a = r.startAyah; a <= r.endAyah; a += 1) {
        verseKeys.push(`${r.surah}:${a}`);
      }
    }
  }

  const mushafPages = Array.isArray(u.mushafPages)
    ? u.mushafPages
        .map((p) => Number(p))
        .filter((p) => Number.isFinite(p) && p >= 1 && p <= 604)
    : [];

  const sourceType: UnitSourceType =
    u.sourceType === 'preset' ||
    u.sourceType === 'page' ||
    u.sourceType === 'surah' ||
    u.sourceType === 'custom'
      ? u.sourceType
      : 'custom';

  const stage: RetentionStage =
    u.stage === 'raw' || u.stage === 'fresh' || u.stage === 'solid' ? u.stage : 'raw';

  const reviewStep =
    typeof u.reviewStep === 'number' && Number.isFinite(u.reviewStep)
      ? Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length, Math.round(u.reviewStep)))
      : 0;

  const nextReviewAt =
    typeof u.nextReviewAt === 'number' && Number.isFinite(u.nextReviewAt) && u.nextReviewAt > 0
      ? u.nextReviewAt
      : null;

  const lastSelfEval: SelfEvaluationRating | undefined =
    u.lastSelfEval === 'hard' || u.lastSelfEval === 'good' || u.lastSelfEval === 'easy'
      ? u.lastSelfEval
      : undefined;

  return {
    id: u.id.trim(),
    title: u.title.trim(),
    subtitle: typeof u.subtitle === 'string' && u.subtitle.trim() ? u.subtitle.trim() : undefined,
    sourceType,
    ranges,
    verseKeys,
    mushafPages,
    stage,
    completedSessions:
      typeof u.completedSessions === 'number' && Number.isFinite(u.completedSessions)
        ? Math.max(0, Math.floor(u.completedSessions))
        : 0,
    totalMinutes:
      typeof u.totalMinutes === 'number' && Number.isFinite(u.totalMinutes)
        ? Math.max(0, Math.floor(u.totalMinutes))
        : 0,
    starredVerseKeys: Array.isArray(u.starredVerseKeys)
      ? Array.from(
          new Set(
            u.starredVerseKeys.filter(
              (k): k is string => typeof k === 'string' && /^\d+:\d+$/.test(k),
            ),
          ),
        )
      : [],
    createdAt:
      typeof u.createdAt === 'number' && Number.isFinite(u.createdAt) ? u.createdAt : Date.now(),
    lastPracticedAt:
      typeof u.lastPracticedAt === 'number' && Number.isFinite(u.lastPracticedAt)
        ? u.lastPracticedAt
        : null,
    reviewStep,
    nextReviewAt,
    lastSelfEval,
  };
}

function sanitizeUnitsList(raw: unknown): MemorizationUnit[] {
  if (!Array.isArray(raw)) return [];
  const out: MemorizationUnit[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    const clean = sanitizeUnit(item);
    if (!clean || seenIds.has(clean.id)) continue;
    seenIds.add(clean.id);
    out.push(clean);
  }
  return out;
}

function sanitizePrefs(raw: Partial<MemorizationPrefs> | null): MemorizationPrefs {
  if (!raw) return { ...DEFAULT_MEMORIZATION_PREFS };
  const custom = raw.customConfig ?? DEFAULT_MEMORIZATION_PREFS.customConfig;
  const clampNum = (v: unknown, min: number, max: number, fb: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.round(v)))
      : fb;

  return {
    method:
      raw.method === 'snowball' ||
      raw.method === 'reverse_snowball' ||
      raw.method === 'single' ||
      raw.method === 'block'
        ? raw.method
        : DEFAULT_MEMORIZATION_PREFS.method,
    profile:
      raw.profile === 'fast' ||
      raw.profile === 'balanced' ||
      raw.profile === 'deep' ||
      raw.profile === 'custom'
        ? raw.profile
        : DEFAULT_MEMORIZATION_PREFS.profile,
    customConfig: {
      newAyahReps: clampNum(custom.newAyahReps, 1, 30, 5),
      chainReps: clampNum(custom.chainReps, 1, 10, 2),
      blockRounds: clampNum(custom.blockRounds, 1, 10, 3),
      windowSize: clampNum(custom.windowSize, 3, 7, 5),
    },
    reciterId: typeof raw.reciterId === 'string' && raw.reciterId.trim() ? raw.reciterId : null,
    listenRepeatPauseEnabled:
      typeof raw.listenRepeatPauseEnabled === 'boolean'
        ? raw.listenRepeatPauseEnabled
        : DEFAULT_MEMORIZATION_PREFS.listenRepeatPauseEnabled,
    pauseMultiplier:
      raw.pauseMultiplier === 0.8 || raw.pauseMultiplier === 1 || raw.pauseMultiplier === 1.2
        ? raw.pauseMultiplier
        : DEFAULT_MEMORIZATION_PREFS.pauseMultiplier,
    viewMode:
      raw.viewMode === 'focus' || raw.viewMode === 'mushaf'
        ? raw.viewMode
        : DEFAULT_MEMORIZATION_PREFS.viewMode,
    autoProgressiveHide:
      typeof raw.autoProgressiveHide === 'boolean'
        ? raw.autoProgressiveHide
        : DEFAULT_MEMORIZATION_PREFS.autoProgressiveHide,
    showVaslHook:
      typeof raw.showVaslHook === 'boolean'
        ? raw.showVaslHook
        : DEFAULT_MEMORIZATION_PREFS.showVaslHook,
    playbackRate:
      raw.playbackRate === 0.75 ||
      raw.playbackRate === 1 ||
      raw.playbackRate === 1.25 ||
      raw.playbackRate === 1.5
        ? raw.playbackRate
        : DEFAULT_MEMORIZATION_PREFS.playbackRate,
  };
}

// ============================================================================
// Sabak · Sabkî · Menzil Aralıklı Tekrar Takvimi (1 – 3 – 7 – 14 – 30 gün)
// ============================================================================

/**
 * Öz-değerlendirmeye göre (`hard` | `good` | `easy`) birimin tekrar basamağını,
 * bir sonraki tekrar tarihini ve aşamasını (`raw` / `fresh` / `solid`) günceller.
 */
export function applySelfEvaluation(
  unit: MemorizationUnit,
  rating: SelfEvaluationRating,
  nowMs = Date.now(),
): { updated: MemorizationUnit; scheduledDays: number } {
  const currentStep = Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length, unit.reviewStep ?? 0));

  let nextStep: number;
  let scheduledDays: number;
  let nextStage: RetentionStage;

  if (rating === 'hard') {
    nextStep = 0;
    scheduledDays = REVIEW_INTERVAL_DAYS[0]; // 1 gün (yarın)
    nextStage = unit.stage === 'solid' ? 'fresh' : 'raw';
  } else if (rating === 'good') {
    nextStep = Math.min(REVIEW_INTERVAL_DAYS.length, currentStep + 1);
    scheduledDays = REVIEW_INTERVAL_DAYS[Math.max(0, nextStep - 1)];
    nextStage = nextStep >= 3 ? 'solid' : 'fresh';
  } else {
    // easy ('Su Gibi') -> 2 basamak ilerler (en fazla 30 gün)
    nextStep = Math.min(REVIEW_INTERVAL_DAYS.length, currentStep + 2);
    scheduledDays = REVIEW_INTERVAL_DAYS[Math.max(0, nextStep - 1)];
    nextStage = nextStep >= 3 ? 'solid' : 'fresh';
  }

  // Günün başlangıcına yaslı ama nazik tarih hesaplaması (hedef günün sabah 06:00'sı veya +N gün)
  const targetDate = new Date(nowMs + scheduledDays * DAY_MS);
  targetDate.setHours(6, 0, 0, 0);
  const nextReviewAt = Math.max(nowMs + 12 * 60 * 60 * 1000, targetDate.getTime());

  return {
    scheduledDays,
    updated: {
      ...unit,
      reviewStep: nextStep,
      nextReviewAt,
      stage: nextStage,
      lastSelfEval: rating,
      lastPracticedAt: nowMs,
    },
  };
}

/**
 * Birimin aralıklı tekrar durumu için sakin ve baskısız etiket döndürür.
 */
export function getReviewScheduleBadge(
  unit: MemorizationUnit,
  nowMs = Date.now(),
): { isDue: boolean; label: string } | null {
  if (unit.nextReviewAt === null || unit.nextReviewAt === undefined) {
    return null;
  }
  if (unit.nextReviewAt <= nowMs) {
    return { isDue: true, label: 'Bugün tekrar zamanı' };
  }

  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(unit.nextReviewAt);
  startOfTarget.setHours(0, 0, 0, 0);
  const diffDays = Math.max(1, Math.round((startOfTarget.getTime() - startOfToday.getTime()) / DAY_MS));

  if (diffDays <= 1) {
    return { isDue: false, label: 'Yarın tekrar' };
  }
  return { isDue: false, label: `${diffDays} gün sonra` };
}

export function isUnitDueForReview(unit: MemorizationUnit, nowMs = Date.now()): boolean {
  return typeof unit.nextReviewAt === 'number' && unit.nextReviewAt <= nowMs;
}

// ============================================================================
// Değişiklik Aboneliği (QuickMemorizeFromVerseModal <-> MemorizationHubPage senkronizasyonu)
// ============================================================================

type StorageListener = () => void;
const listeners = new Set<StorageListener>();

function notifyListeners(): void {
  for (const fn of listeners) {
    fn();
  }
}

export function subscribeMemorizationStorage(listener: StorageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ============================================================================
// Anında Senkron Okuma (İlk boyamada titreme olmaması için) + Asenkron IndexedDB Kalıcılığı
// ============================================================================

export function readUnitsSync(): MemorizationUnit[] {
  const cached = lsGet<unknown>(KEY_UNITS);
  return sanitizeUnitsList(cached);
}

export function readPrefsSync(): MemorizationPrefs {
  return sanitizePrefs(lsGet<Partial<MemorizationPrefs>>(KEY_PREFS));
}

export function readActiveSessionSync(): ActiveSessionSnapshot | null {
  return lsGet<ActiveSessionSnapshot>(KEY_ACTIVE_SESSION);
}

export async function loadUnits(): Promise<MemorizationUnit[]> {
  const fromIdb = await idbGet<unknown>(KEY_UNITS);
  if (Array.isArray(fromIdb)) {
    const clean = sanitizeUnitsList(fromIdb);
    lsSet(KEY_UNITS, clean);
    return clean;
  }
  const fromLs = readUnitsSync();
  if (fromLs.length > 0) {
    await idbSet(KEY_UNITS, fromLs);
  }
  return fromLs;
}

export async function saveUnits(units: MemorizationUnit[]): Promise<void> {
  const clean = sanitizeUnitsList(units);
  lsSet(KEY_UNITS, clean);
  await idbSet(KEY_UNITS, clean);
  notifyListeners();
}

export async function upsertUnit(unit: MemorizationUnit): Promise<MemorizationUnit[]> {
  const existing = await loadUnits();
  const idx = existing.findIndex((u) => u.id === unit.id);
  const next =
    idx >= 0
      ? existing.map((u, i) => (i === idx ? unit : u))
      : [unit, ...existing];
  await saveUnits(next);
  return next;
}

export async function addUnitsBatch(newUnits: MemorizationUnit[]): Promise<MemorizationUnit[]> {
  const existing = await loadUnits();
  const next = [...newUnits, ...existing];
  await saveUnits(next);
  return next;
}

export async function deleteUnit(unitId: string): Promise<MemorizationUnit[]> {
  const existing = await loadUnits();
  const next = existing.filter((u) => u.id !== unitId);
  await saveUnits(next);
  const active = await loadActiveSession();
  if (active?.unitId === unitId) {
    await saveActiveSession(null);
  }
  return next;
}

export async function loadPrefs(): Promise<MemorizationPrefs> {
  const fromIdb = await idbGet<Partial<MemorizationPrefs>>(KEY_PREFS);
  if (fromIdb) {
    const clean = sanitizePrefs(fromIdb);
    lsSet(KEY_PREFS, clean);
    return clean;
  }
  const fromLs = readPrefsSync();
  await idbSet(KEY_PREFS, fromLs);
  return fromLs;
}

export async function savePrefs(prefs: MemorizationPrefs): Promise<void> {
  const clean = sanitizePrefs(prefs);
  lsSet(KEY_PREFS, clean);
  await idbSet(KEY_PREFS, clean);
  notifyListeners();
}

export async function loadActiveSession(): Promise<ActiveSessionSnapshot | null> {
  const fromIdb = await idbGet<ActiveSessionSnapshot | null>(KEY_ACTIVE_SESSION);
  if (fromIdb) {
    lsSet(KEY_ACTIVE_SESSION, fromIdb);
    return fromIdb;
  }
  return readActiveSessionSync();
}

export async function saveActiveSession(
  snapshot: ActiveSessionSnapshot | null,
): Promise<void> {
  lsSet(KEY_ACTIVE_SESSION, snapshot);
  await idbSet(KEY_ACTIVE_SESSION, snapshot);
  notifyListeners();
}

// ============================================================================
// JSON Yedekleme (Dışa Aktar / İçe Aktar)
// ============================================================================

export async function createBackupPayload(): Promise<MemorizationBackupPayload> {
  const [units, prefs] = await Promise.all([loadUnits(), loadPrefs()]);
  return {
    app: 'muallimun-memorization',
    version: 2,
    exportedAt: new Date().toISOString(),
    units,
    prefs,
  };
}

export async function importBackupPayload(
  rawData: unknown,
  mode: 'merge' | 'replace',
): Promise<{
  importedCount: number;
  skippedDuplicates: number;
  totalUnits: number;
}> {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Geçersiz yedek dosyası formatı.');
  }

  const record = rawData as Partial<MemorizationBackupPayload> & { units?: unknown };
  if (!Array.isArray(record.units)) {
    throw new Error('Yedek dosyasında ezber havuzu ("units") bulunamadı.');
  }

  const incomingUnits = sanitizeUnitsList(record.units);
  if (incomingUnits.length === 0 && record.units.length > 0) {
    throw new Error('Yedek dosyasındaki ezber kayıtları doğrulanamadı.');
  }

  if (record.prefs && typeof record.prefs === 'object') {
    await savePrefs(sanitizePrefs(record.prefs));
  }

  if (mode === 'replace') {
    await saveUnits(incomingUnits);
    await saveActiveSession(null);
    return {
      importedCount: incomingUnits.length,
      skippedDuplicates: 0,
      totalUnits: incomingUnits.length,
    };
  }

  // Merge: ID veya kanonik aralık imzasına göre mükerrer kayıtları atla
  const existing = await loadUnits();
  const existingIds = new Set(existing.map((u) => u.id));
  const existingSigs = new Set(existing.map((u) => getRangesSignature(u.ranges)));

  const toAdd: MemorizationUnit[] = [];
  let skippedDuplicates = 0;

  for (const unit of incomingUnits) {
    const sig = getRangesSignature(unit.ranges);
    if (existingIds.has(unit.id) || (sig && existingSigs.has(sig))) {
      skippedDuplicates += 1;
      continue;
    }
    existingIds.add(unit.id);
    if (sig) existingSigs.add(sig);
    toAdd.push(unit);
  }

  const merged = [...toAdd, ...existing];
  await saveUnits(merged);

  return {
    importedCount: toAdd.length,
    skippedDuplicates,
    totalUnits: merged.length,
  };
}

export const memorizationStorage = {
  subscribe: subscribeMemorizationStorage,
  readUnitsSync,
  readPrefsSync,
  readActiveSessionSync,
  loadUnits,
  saveUnits,
  upsertUnit,
  addUnitsBatch,
  deleteUnit,
  loadPrefs,
  savePrefs,
  loadActiveSession,
  saveActiveSession,
  createBackupPayload,
  importBackupPayload,
};
