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
let mutashabihatPromise: Promise<MutashabihatFile> | null = null;
const mutashabihatSubscribers = new Set<() => void>();

function ensureMutashabihatLoaded(): void {
  if (mutashabihatCache || mutashabihatPromise) return;
  mutashabihatPromise = dataService
    .getMutashabihatData()
    .then((file) => {
      mutashabihatCache = file;
      for (const listener of mutashabihatSubscribers) listener();
      return file;
    })
    .finally(() => {
      mutashabihatPromise = null;
    });
}

export function useMutashabihatData(enabled = true) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
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
    isLoading: enabled && !mutashabihatCache,
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
let rukusPromise: Promise<IndexedRukus> | null = null;
const rukusSubscribers = new Set<() => void>();

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
  rukusPromise = dataService
    .getRukusData()
    .then((file) => {
      rukusCache = indexRukusFile(file);
      for (const listener of rukusSubscribers) listener();
      return rukusCache;
    })
    .finally(() => {
      rukusPromise = null;
    });
}

export function useRukusData(enabled = true) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
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
    isLoading: enabled && !rukusCache,
    getRukuEndingAt,
    getRukusForSurah,
    getRukuForVerse,
    findWaqfSign,
  };
}
