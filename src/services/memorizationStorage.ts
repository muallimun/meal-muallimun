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
  VisibilityMask,
  ZenSessionMode,
} from '../types/memorization';
import { REVIEW_INTERVAL_DAYS } from '../types/memorization';
import { clampAyahRange, isValidVerseKey } from '../utils/quranBounds';

const DB_NAME = 'muallimun_memorization_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

const LS_PREFIX = 'muallimun_memorization_v1_';
const LS_TIMESTAMPS_KEY = 'muallimun_memorization_v1_timestamps';
const KEY_UNITS = 'units';
const KEY_PREFS = 'prefs';
const KEY_ACTIVE_SESSION = 'active_session';

interface IdbEnvelope<T> {
  __envelopeV1: true;
  updatedAt: number;
  data: T;
}

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
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            // ignore
          }
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        resolve(null);
      };
    } catch {
      dbPromise = null;
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
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (value === null || value === undefined) {
        store.delete(key);
      } else {
        store.put(value, key);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function readLsTimestamps(): Partial<Record<string, number>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_TIMESTAMPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Partial<Record<string, number>> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeLsTimestamp(key: string, ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readLsTimestamps();
    current[key] = ts;
    window.localStorage.setItem(LS_TIMESTAMPS_KEY, JSON.stringify(current));
  } catch {
    // ignore quota errors
  }
}

function unwrapIdbRecord<T>(raw: unknown): { hasValue: boolean; updatedAt: number; data: T | null } {
  if (raw === null || raw === undefined) {
    return { hasValue: false, updatedAt: 0, data: null };
  }
  if (
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as Partial<IdbEnvelope<T>>).__envelopeV1 === true &&
    typeof (raw as Partial<IdbEnvelope<T>>).updatedAt === 'number'
  ) {
    const env = raw as IdbEnvelope<T>;
    return {
      hasValue: true,
      updatedAt: Number.isFinite(env.updatedAt) ? env.updatedAt : 0,
      data: env.data ?? null,
    };
  }
  // Geriye dönük uyumluluk: eski düz dizi/nesne kaydı
  return { hasValue: true, updatedAt: 0, data: raw as T };
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
    const clamped = clampAyahRange(
      Number((r as AyahRange).surah),
      Number((r as AyahRange).startAyah),
      Number((r as AyahRange).endAyah),
    );
    if (clamped) {
      ranges.push(clamped);
    }
  }
  if (ranges.length === 0) return null;

  const verseKeys = Array.isArray(u.verseKeys)
    ? Array.from(new Set(u.verseKeys.filter((k): k is string => isValidVerseKey(k))))
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

  const rawStep =
    typeof u.reviewStep === 'number' && Number.isFinite(u.reviewStep)
      ? u.reviewStep
      : typeof u.srsBox === 'number' && Number.isFinite(u.srsBox)
        ? u.srsBox
        : 0;
  const reviewStep = Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length, Math.round(rawStep)));

  const nextReviewAt =
    typeof u.nextReviewAt === 'number' && Number.isFinite(u.nextReviewAt) && u.nextReviewAt > 0
      ? u.nextReviewAt
      : null;

  const lastPracticedAt =
    typeof u.lastPracticedAt === 'number' && Number.isFinite(u.lastPracticedAt)
      ? u.lastPracticedAt
      : typeof u.lastReviewedAt === 'number' && Number.isFinite(u.lastReviewedAt)
        ? u.lastReviewedAt
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
          new Set(u.starredVerseKeys.filter((k): k is string => isValidVerseKey(k))),
        )
      : [],
    createdAt:
      typeof u.createdAt === 'number' && Number.isFinite(u.createdAt) ? u.createdAt : Date.now(),
    lastPracticedAt,
    lastReviewedAt: lastPracticedAt,
    reviewStep,
    srsBox: reviewStep,
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

export function sanitizeActiveSession(raw: unknown): ActiveSessionSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Partial<ActiveSessionSnapshot>;
  if (typeof s.unitId !== 'string' || !s.unitId.trim()) return null;
  if (typeof s.unitTitle !== 'string' || !s.unitTitle.trim()) return null;

  const totalSteps =
    typeof s.totalSteps === 'number' && Number.isFinite(s.totalSteps)
      ? Math.max(1, Math.floor(s.totalSteps))
      : 1;
  const stepIndex =
    typeof s.stepIndex === 'number' && Number.isFinite(s.stepIndex)
      ? Math.max(0, Math.min(totalSteps - 1, Math.floor(s.stepIndex)))
      : 0;

  const cleanPrefs = sanitizePrefs({
    method: s.method,
    profile: s.profile,
    customConfig: s.customConfig,
  });

  const mask: VisibilityMask =
    s.mask === 'open' ||
    s.mask === 'first_word' ||
    s.mask === 'word_reveal' ||
    s.mask === 'hidden'
      ? s.mask
      : 'open';

  const sessionMode: ZenSessionMode | undefined =
    s.sessionMode === 'standard' ||
    s.sessionMode === 'starred_only' ||
    s.sessionMode === 'self_test_ordered' ||
    s.sessionMode === 'self_test_shuffled'
      ? s.sessionMode
      : undefined;

  const overrideVerseKeys = Array.isArray(s.overrideVerseKeys)
    ? Array.from(new Set(s.overrideVerseKeys.filter((k): k is string => isValidVerseKey(k))))
    : undefined;

  return {
    unitId: s.unitId.trim(),
    unitTitle: s.unitTitle.trim(),
    method: cleanPrefs.method,
    profile: cleanPrefs.profile,
    customConfig: cleanPrefs.customConfig,
    stepIndex,
    totalSteps,
    elapsedSec:
      typeof s.elapsedSec === 'number' && Number.isFinite(s.elapsedSec)
        ? Math.max(0, Math.floor(s.elapsedSec))
        : 0,
    completedReps:
      typeof s.completedReps === 'number' && Number.isFinite(s.completedReps)
        ? Math.max(0, Math.floor(s.completedReps))
        : 0,
    mask,
    updatedAt:
      typeof s.updatedAt === 'number' && Number.isFinite(s.updatedAt) && s.updatedAt > 0
        ? s.updatedAt
        : Date.now(),
    ...(sessionMode ? { sessionMode } : {}),
    ...(overrideVerseKeys && overrideVerseKeys.length > 0 ? { overrideVerseKeys } : {}),
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
      srsBox: nextStep,
      nextReviewAt,
      stage: nextStage,
      lastSelfEval: rating,
      lastPracticedAt: nowMs,
      lastReviewedAt: nowMs,
    },
  };
}

/**
 * Birim manuel olarak `fresh` (Taze) veya `solid` (Sağlam) aşamasına alındığında
 * henüz tekrar takvimi yoksa otomatik olarak 1. SRS kutusuna (+1 gün) yerleştirir.
 */
export function applyStageChangeWithSrs(
  unit: MemorizationUnit,
  nextStage: RetentionStage,
  nowMs = Date.now(),
): MemorizationUnit {
  if (nextStage === 'raw') {
    return {
      ...unit,
      stage: 'raw',
    };
  }
  if (typeof unit.nextReviewAt === 'number' && unit.nextReviewAt > 0) {
    return {
      ...unit,
      stage: nextStage,
    };
  }
  const initialBox = nextStage === 'solid' ? Math.max(3, unit.reviewStep || 0) : Math.max(1, unit.reviewStep || 0);
  const clampedBox = Math.min(REVIEW_INTERVAL_DAYS.length, initialBox);
  const days = REVIEW_INTERVAL_DAYS[Math.max(0, clampedBox - 1)];
  const targetDate = new Date(nowMs + days * DAY_MS);
  targetDate.setHours(6, 0, 0, 0);
  const nextReviewAt = Math.max(nowMs + 12 * 60 * 60 * 1000, targetDate.getTime());

  return {
    ...unit,
    stage: nextStage,
    reviewStep: clampedBox,
    srsBox: clampedBox,
    nextReviewAt,
    lastPracticedAt: unit.lastPracticedAt ?? nowMs,
    lastReviewedAt: unit.lastReviewedAt ?? unit.lastPracticedAt ?? nowMs,
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
let crossTabListenerAttached = false;

function notifyListeners(): void {
  for (const fn of listeners) {
    fn();
  }
}

function ensureCrossTabStorageListener(): void {
  if (crossTabListenerAttached || typeof window === 'undefined') return;
  crossTabListenerAttached = true;
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(LS_PREFIX)) {
      notifyListeners();
    }
  });
}

export function subscribeMemorizationStorage(listener: StorageListener): () => void {
  ensureCrossTabStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ============================================================================
// Seri Yazma Kuyruğu (Lost Update Önleme)
// ============================================================================

let unitsWriteQueue: Promise<unknown> = Promise.resolve();

function enqueueUnitsMutation<T>(task: () => Promise<T>): Promise<T> {
  const next = unitsWriteQueue.then(task, task);
  unitsWriteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
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
  return sanitizeActiveSession(lsGet<unknown>(KEY_ACTIVE_SESSION));
}

async function writeUnitsInternal(units: MemorizationUnit[]): Promise<MemorizationUnit[]> {
  const clean = sanitizeUnitsList(units);
  const now = Date.now();
  lsSet(KEY_UNITS, clean);
  writeLsTimestamp(KEY_UNITS, now);
  const envelope: IdbEnvelope<MemorizationUnit[]> = {
    __envelopeV1: true,
    updatedAt: now,
    data: clean,
  };
  await idbSet(KEY_UNITS, envelope);
  notifyListeners();
  return clean;
}

export async function loadUnits(): Promise<MemorizationUnit[]> {
  const rawIdb = await idbGet<unknown>(KEY_UNITS);
  const unwrapped = unwrapIdbRecord<unknown>(rawIdb);
  const lsUpdatedAt = readLsTimestamps()[KEY_UNITS] ?? 0;

  if (unwrapped.hasValue && Array.isArray(unwrapped.data)) {
    // Eğer localStorage zaman damgası IDB'den kesinlikle yeniyse eski IDB verisiyle ezme
    if (lsUpdatedAt > unwrapped.updatedAt) {
      const fromLs = readUnitsSync();
      const healEnvelope: IdbEnvelope<MemorizationUnit[]> = {
        __envelopeV1: true,
        updatedAt: lsUpdatedAt,
        data: fromLs,
      };
      await idbSet(KEY_UNITS, healEnvelope);
      return fromLs;
    }
    const clean = sanitizeUnitsList(unwrapped.data);
    lsSet(KEY_UNITS, clean);
    if (unwrapped.updatedAt > 0) {
      writeLsTimestamp(KEY_UNITS, unwrapped.updatedAt);
    }
    return clean;
  }

  const fromLs = readUnitsSync();
  if (fromLs.length > 0 || lsUpdatedAt > 0) {
    const ts = lsUpdatedAt > 0 ? lsUpdatedAt : Date.now();
    const seedEnvelope: IdbEnvelope<MemorizationUnit[]> = {
      __envelopeV1: true,
      updatedAt: ts,
      data: fromLs,
    };
    await idbSet(KEY_UNITS, seedEnvelope);
  }
  return fromLs;
}

export async function saveUnits(units: MemorizationUnit[]): Promise<void> {
  await enqueueUnitsMutation(async () => {
    await writeUnitsInternal(units);
  });
}

export async function upsertUnit(unit: MemorizationUnit): Promise<MemorizationUnit[]> {
  return enqueueUnitsMutation(async () => {
    const existing = await loadUnits();
    const idx = existing.findIndex((u) => u.id === unit.id);
    const next =
      idx >= 0
        ? existing.map((u, i) => (i === idx ? unit : u))
        : [unit, ...existing];
    return writeUnitsInternal(next);
  });
}

export async function addUnitsBatch(newUnits: MemorizationUnit[]): Promise<MemorizationUnit[]> {
  return enqueueUnitsMutation(async () => {
    const existing = await loadUnits();
    const next = [...newUnits, ...existing];
    return writeUnitsInternal(next);
  });
}

export async function deleteUnit(unitId: string): Promise<MemorizationUnit[]> {
  return enqueueUnitsMutation(async () => {
    const existing = await loadUnits();
    const next = existing.filter((u) => u.id !== unitId);
    const saved = await writeUnitsInternal(next);
    const active = await loadActiveSession();
    if (active?.unitId === unitId) {
      await saveActiveSession(null);
    }
    return saved;
  });
}

export async function loadPrefs(): Promise<MemorizationPrefs> {
  const rawIdb = await idbGet<unknown>(KEY_PREFS);
  const unwrapped = unwrapIdbRecord<Partial<MemorizationPrefs>>(rawIdb);
  const lsUpdatedAt = readLsTimestamps()[KEY_PREFS] ?? 0;

  if (unwrapped.hasValue && unwrapped.data && typeof unwrapped.data === 'object') {
    if (lsUpdatedAt > unwrapped.updatedAt) {
      const fromLs = readPrefsSync();
      const healEnvelope: IdbEnvelope<MemorizationPrefs> = {
        __envelopeV1: true,
        updatedAt: lsUpdatedAt,
        data: fromLs,
      };
      await idbSet(KEY_PREFS, healEnvelope);
      return fromLs;
    }
    const clean = sanitizePrefs(unwrapped.data);
    lsSet(KEY_PREFS, clean);
    if (unwrapped.updatedAt > 0) {
      writeLsTimestamp(KEY_PREFS, unwrapped.updatedAt);
    }
    return clean;
  }

  const fromLs = readPrefsSync();
  const ts = lsUpdatedAt > 0 ? lsUpdatedAt : Date.now();
  const seedEnvelope: IdbEnvelope<MemorizationPrefs> = {
    __envelopeV1: true,
    updatedAt: ts,
    data: fromLs,
  };
  await idbSet(KEY_PREFS, seedEnvelope);
  return fromLs;
}

export async function savePrefs(prefs: MemorizationPrefs): Promise<void> {
  const clean = sanitizePrefs(prefs);
  const now = Date.now();
  lsSet(KEY_PREFS, clean);
  writeLsTimestamp(KEY_PREFS, now);
  const envelope: IdbEnvelope<MemorizationPrefs> = {
    __envelopeV1: true,
    updatedAt: now,
    data: clean,
  };
  await idbSet(KEY_PREFS, envelope);
  notifyListeners();
}

export async function loadActiveSession(): Promise<ActiveSessionSnapshot | null> {
  const rawIdb = await idbGet<unknown>(KEY_ACTIVE_SESSION);
  const unwrapped = unwrapIdbRecord<unknown>(rawIdb);
  const lsUpdatedAt = readLsTimestamps()[KEY_ACTIVE_SESSION] ?? 0;

  if (lsUpdatedAt > unwrapped.updatedAt) {
    const fromLs = readActiveSessionSync();
    if (fromLs) {
      const healEnvelope: IdbEnvelope<ActiveSessionSnapshot> = {
        __envelopeV1: true,
        updatedAt: lsUpdatedAt,
        data: fromLs,
      };
      await idbSet(KEY_ACTIVE_SESSION, healEnvelope);
    } else {
      await idbSet(KEY_ACTIVE_SESSION, null);
    }
    return fromLs;
  }

  if (unwrapped.hasValue) {
    const clean = sanitizeActiveSession(unwrapped.data);
    lsSet(KEY_ACTIVE_SESSION, clean);
    if (unwrapped.updatedAt > 0) {
      writeLsTimestamp(KEY_ACTIVE_SESSION, unwrapped.updatedAt);
    }
    return clean;
  }

  return readActiveSessionSync();
}

export async function saveActiveSession(
  snapshot: ActiveSessionSnapshot | null,
): Promise<void> {
  const clean = snapshot ? sanitizeActiveSession(snapshot) : null;
  const now = Date.now();
  lsSet(KEY_ACTIVE_SESSION, clean);
  writeLsTimestamp(KEY_ACTIVE_SESSION, now);
  if (clean) {
    const envelope: IdbEnvelope<ActiveSessionSnapshot> = {
      __envelopeV1: true,
      updatedAt: now,
      data: clean,
    };
    await idbSet(KEY_ACTIVE_SESSION, envelope);
  } else {
    await idbSet(KEY_ACTIVE_SESSION, null);
  }
  notifyListeners();
}

// ============================================================================
// JSON Yedekleme (Ön Doğrulama / Dışa Aktar / İçe Aktar)
// ============================================================================

export interface MemorizationBackupValidationResult {
  valid: boolean;
  error?: string;
  units: MemorizationUnit[];
  prefs: MemorizationPrefs | null;
  activeSession: ActiveSessionSnapshot | null;
  unitsCount: number;
  hasPrefs: boolean;
  hasActiveSession: boolean;
}

/**
 * Herhangi bir depoya yazmadan ezber yedeğini bellekte doğrular ve özet döndürür.
 */
export function validateMemorizationBackupPayload(
  rawData: unknown,
): MemorizationBackupValidationResult {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return {
      valid: false,
      error: 'Geçersiz ezber yedeği formatı.',
      units: [],
      prefs: null,
      activeSession: null,
      unitsCount: 0,
      hasPrefs: false,
      hasActiveSession: false,
    };
  }

  const record = rawData as Partial<MemorizationBackupPayload> & { units?: unknown };
  if (!Array.isArray(record.units)) {
    return {
      valid: false,
      error: 'Yedek dosyasında ezber havuzu ("units") bulunamadı.',
      units: [],
      prefs: null,
      activeSession: null,
      unitsCount: 0,
      hasPrefs: false,
      hasActiveSession: false,
    };
  }

  const incomingUnits = sanitizeUnitsList(record.units);
  if (incomingUnits.length === 0 && record.units.length > 0) {
    return {
      valid: false,
      error: 'Yedek dosyasındaki ezber kayıtları doğrulanamadı.',
      units: [],
      prefs: null,
      activeSession: null,
      unitsCount: 0,
      hasPrefs: false,
      hasActiveSession: false,
    };
  }

  const prefs =
    record.prefs && typeof record.prefs === 'object' && !Array.isArray(record.prefs)
      ? sanitizePrefs(record.prefs)
      : null;

  const activeSession =
    record.activeSession !== undefined && record.activeSession !== null
      ? sanitizeActiveSession(record.activeSession)
      : null;

  return {
    valid: true,
    units: incomingUnits,
    prefs,
    activeSession,
    unitsCount: incomingUnits.length,
    hasPrefs: prefs !== null,
    hasActiveSession: activeSession !== null,
  };
}

export async function createBackupPayload(): Promise<MemorizationBackupPayload> {
  const [units, prefs, activeSession] = await Promise.all([
    loadUnits(),
    loadPrefs(),
    loadActiveSession(),
  ]);
  return {
    app: 'muallimun-memorization',
    version: 2,
    exportedAt: new Date().toISOString(),
    units,
    prefs,
    activeSession,
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
  const validation = validateMemorizationBackupPayload(rawData);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Geçersiz yedek dosyası formatı.');
  }

  return enqueueUnitsMutation(async () => {
    if (validation.prefs) {
      await savePrefs(validation.prefs);
    }

    if (mode === 'replace') {
      await writeUnitsInternal(validation.units);
      await saveActiveSession(validation.activeSession);
      return {
        importedCount: validation.units.length,
        skippedDuplicates: 0,
        totalUnits: validation.units.length,
      };
    }

    // Merge: ID veya kanonik aralık imzasına göre mükerrer kayıtları atla
    const existing = await loadUnits();
    const existingIds = new Set(existing.map((u) => u.id));
    const existingSigs = new Set(existing.map((u) => getRangesSignature(u.ranges)));

    const toAdd: MemorizationUnit[] = [];
    let skippedDuplicates = 0;

    for (const unit of validation.units) {
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
    await writeUnitsInternal(merged);

    return {
      importedCount: toAdd.length,
      skippedDuplicates,
      totalUnits: merged.length,
    };
  });
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
  sanitizeActiveSession,
  validateBackupPayload: validateMemorizationBackupPayload,
  createBackupPayload,
  importBackupPayload,
};
