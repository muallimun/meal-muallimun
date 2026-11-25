import { useCallback, useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import {
  FALLBACK_WAQF_SIGNS,
  registerLoadedWaqfSigns,
  resolveWaqfSignDef,
} from '../services/studyPopoverBus';
import type {
  MutashabihatEntryTuple,
  MutashabihatFile,
  RukuItem,
  RukusFile,
  WaqfSignDef,
} from '../types/fihrist';

const EMPTY_LINKS: readonly MutashabihatEntryTuple[] = [];
const EMPTY_RUKUS: readonly RukuItem[] = [];

// ============================================================================
// Paylaşımlı Tembel Yükleyici — Müteşâbihât (mutashabihat.json)
// ============================================================================

let mutashabihatCache: MutashabihatFile | null = null;
let mutashabihatPromise: Promise<MutashabihatFile | null> | null = null;
let mutashabihatLoadFailed = false;
const mutashabihatSubscribers = new Set<() => void>();

function notifyMutashabihatSubscribers(): void {
  for (const listener of mutashabihatSubscribers) listener();
}

function isNonEmptyMutashabihat(file: MutashabihatFile | null | undefined): file is MutashabihatFile {
  return Boolean(
    file &&
      file.verses &&
      typeof file.verses === 'object' &&
      Object.keys(file.verses).length > 0,
  );
}

function ensureMutashabihatLoaded(): void {
  if (mutashabihatCache || mutashabihatPromise) return;
  mutashabihatLoadFailed = false;
  mutashabihatPromise = dataService
    .getMutashabihatData()
    .then((file) => {
      if (isNonEmptyMutashabihat(file)) {
        mutashabihatCache = file;
        mutashabihatLoadFailed = false;
        return file;
      }
      mutashabihatLoadFailed = true;
      return null;
    })
    .catch(() => {
      mutashabihatLoadFailed = true;
      return null;
    })
    .finally(() => {
      mutashabihatPromise = null;
      notifyMutashabihatSubscribers();
    });
}

export function useMutashabihatData(enabled = true) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    ensureOnlineRetryListener();
    const onUpdate = () => setTick((t) => t + 1);
    mutashabihatSubscribers.add(onUpdate);
    if (!mutashabihatCache) {
      ensureMutashabihatLoaded();
    }
    return () => {
      mutashabihatSubscribers.delete(onUpdate);
    };
  }, [enabled]);

  const getLinks = useCallback(
    (surah: number, ayah: number): readonly MutashabihatEntryTuple[] => {
      if (!mutashabihatCache) return EMPTY_LINKS;
      return mutashabihatCache.verses[`${surah}:${ayah}`] ?? EMPTY_LINKS;
    },
    [],
  );

  const getCount = useCallback((surah: number, ayah: number): number => {
    if (!mutashabihatCache) return 0;
    return mutashabihatCache.verses[`${surah}:${ayah}`]?.length ?? 0;
  }, []);

  return {
    data: mutashabihatCache,
    isLoading: enabled && !mutashabihatCache && !mutashabihatLoadFailed,
    totalVersesWithSimilar: mutashabihatCache?.totalVersesWithSimilar ?? 0,
    totalLinks: mutashabihatCache?.totalLinks ?? 0,
    getLinks,
    getCount,
  };
}

// ============================================================================
// Paylaşımlı Tembel Yükleyici — 556 Rükû & Secâvend Vakıf Rehberi (rukus.json)
// ============================================================================

interface IndexedRukus {
  file: RukusFile;
  byEndKey: Map<string, RukuItem>;
  bySurah: Map<number, RukuItem[]>;
}

let rukusCache: IndexedRukus | null = null;
let rukusPromise: Promise<IndexedRukus | null> | null = null;
let rukusLoadFailed = false;
const rukusSubscribers = new Set<() => void>();

function notifyRukusSubscribers(): void {
  for (const listener of rukusSubscribers) listener();
}

function isNonEmptyRukus(file: RukusFile | null | undefined): file is RukusFile {
  return Boolean(file && Array.isArray(file.rukus) && file.rukus.length > 0);
}

function indexRukusFile(file: RukusFile): IndexedRukus {
  const byEndKey = new Map<string, RukuItem>();
  const bySurah = new Map<number, RukuItem[]>();

  for (const r of file.rukus ?? []) {
    byEndKey.set(`${r.surah}:${r.endAyah}`, r);
    const list = bySurah.get(r.surah);
    if (list) {
      list.push(r);
    } else {
      bySurah.set(r.surah, [r]);
    }
  }

  if (Array.isArray(file.waqfSigns) && file.waqfSigns.length > 0) {
    registerLoadedWaqfSigns(file.waqfSigns);
  }

  return { file, byEndKey, bySurah };
}

function ensureRukusLoaded(): void {
  if (rukusCache || rukusPromise) return;
  rukusLoadFailed = false;
  rukusPromise = dataService
    .getRukusData()
    .then((file) => {
      if (isNonEmptyRukus(file)) {
        rukusCache = indexRukusFile(file);
        rukusLoadFailed = false;
        return rukusCache;
      }
      rukusLoadFailed = true;
      return null;
    })
    .catch(() => {
      rukusLoadFailed = true;
      return null;
    })
    .finally(() => {
      rukusPromise = null;
      notifyRukusSubscribers();
    });
}

let onlineRetryBound = false;
function ensureOnlineRetryListener(): void {
  if (onlineRetryBound || typeof window === 'undefined') return;
  onlineRetryBound = true;
  window.addEventListener('online', () => {
    if (!mutashabihatCache && mutashabihatSubscribers.size > 0) {
      ensureMutashabihatLoaded();
    }
    if (!rukusCache && rukusSubscribers.size > 0) {
      ensureRukusLoaded();
    }
  });
}

export function useRukusData(enabled = true) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    ensureOnlineRetryListener();
    const onUpdate = () => setTick((t) => t + 1);
    rukusSubscribers.add(onUpdate);
    if (!rukusCache) {
      ensureRukusLoaded();
    }
    return () => {
      rukusSubscribers.delete(onUpdate);
    };
  }, [enabled]);

  const waqfSigns: readonly WaqfSignDef[] =
    rukusCache?.file.waqfSigns && rukusCache.file.waqfSigns.length > 0
      ? rukusCache.file.waqfSigns
      : FALLBACK_WAQF_SIGNS;

  const getRukuEndingAt = useCallback((surah: number, ayah: number): RukuItem | null => {
    return rukusCache?.byEndKey.get(`${surah}:${ayah}`) ?? null;
  }, []);

  const getRukusForSurah = useCallback((surah: number): readonly RukuItem[] => {
    return rukusCache?.bySurah.get(surah) ?? EMPTY_RUKUS;
  }, []);

  const getRukuForVerse = useCallback((surah: number, ayah: number): RukuItem | null => {
    const list = rukusCache?.bySurah.get(surah);
    if (!list) return null;
    return list.find((r) => ayah >= r.startAyah && ayah <= r.endAyah) ?? null;
  }, []);

  const findWaqfSign = useCallback(
    (chars: string): WaqfSignDef | null => resolveWaqfSignDef(chars, waqfSigns),
    [waqfSigns],
  );

  return {
    allRukus: rukusCache?.file.rukus ?? EMPTY_RUKUS,
    totalRukus: rukusCache?.file.totalRukus ?? 0,
    waqfSigns,
    isLoading: enabled && !rukusCache && !rukusLoadFailed,
    getRukuEndingAt,
    getRukusForSurah,
    getRukuForVerse,
    findWaqfSign,
  };
}
