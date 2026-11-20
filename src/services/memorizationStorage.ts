import type {
  ActiveSessionSnapshot,
  MemorizationPrefs,
  MemorizationUnit,
} from '../types/memorization';

const DB_NAME = 'muallimun_memorization_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

const LS_PREFIX = 'muallimun_memorization_v1_';
const KEY_UNITS = 'units';
const KEY_PREFS = 'prefs';
const KEY_ACTIVE_SESSION = 'active_session';

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

function sanitizePrefs(raw: Partial<MemorizationPrefs> | null): MemorizationPrefs {
  if (!raw) return { ...DEFAULT_MEMORIZATION_PREFS };
  const custom = raw.customConfig ?? DEFAULT_MEMORIZATION_PREFS.customConfig;
  const clampNum = (v: unknown, min: number, max: number, fb: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.round(v)))
      : fb;

  return {
    method:
      raw.method === 'snowball' || raw.method === 'single' || raw.method === 'block'
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
  const cached = lsGet<MemorizationUnit[]>(KEY_UNITS);
  return Array.isArray(cached) ? cached : [];
}

export function readPrefsSync(): MemorizationPrefs {
  return sanitizePrefs(lsGet<Partial<MemorizationPrefs>>(KEY_PREFS));
}

export function readActiveSessionSync(): ActiveSessionSnapshot | null {
  return lsGet<ActiveSessionSnapshot>(KEY_ACTIVE_SESSION);
}

export async function loadUnits(): Promise<MemorizationUnit[]> {
  const fromIdb = await idbGet<MemorizationUnit[]>(KEY_UNITS);
  if (Array.isArray(fromIdb)) {
    lsSet(KEY_UNITS, fromIdb);
    return fromIdb;
  }
  const fromLs = readUnitsSync();
  if (fromLs.length > 0) {
    await idbSet(KEY_UNITS, fromLs);
  }
  return fromLs;
}

export async function saveUnits(units: MemorizationUnit[]): Promise<void> {
  lsSet(KEY_UNITS, units);
  await idbSet(KEY_UNITS, units);
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
};
