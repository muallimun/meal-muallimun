import {
  DATA_BASE_URL,
  HAS_CUSTOM_DATA_BASE_URL,
  LIVE_DATA_BASE_URL,
  LOCAL_DATA_BASE_URL,
} from '../config/assetsConfig';
import { FALLBACK_FIHRIST_TOPICS } from '../data/fallbackFihristTopics';
import type {
  FihristRefTuple,
  FihristTopic,
  FihristTopicsPayload,
  ResearchVerseEntry,
} from '../types/fihrist';
import type {
  AudioPlaylistItem,
  CombinedVerse,
  MealVerse,
  MetaData,
  SurahMeta,
} from '../types/quran';
import { normalizeTurkish } from '../utils/textNormalize';
import { dataService } from './dataService';

export interface HydratedFihristVerse {
  key: string;
  entryId?: string;
  surah: number;
  ayah: number;
  rangeStart: number;
  rangeEnd: number;
  isRangeFirst: boolean;
  surahMeta: SurahMeta | null;
  verse: CombinedVerse;
  primaryMealVerse: MealVerse | null;
  secondaryMealVerse: MealVerse | null;
  note?: string;
}

export interface ParsedBulkRef {
  surah: number;
  startAyah: number;
  endAyah: number;
}

export interface BulkRefParseResult {
  valid: ParsedBulkRef[];
  invalidTokens: string[];
}

let cachedTopics: FihristTopic[] | null = null;
let topicsSource: 'remote' | 'local' | 'fallback' = 'fallback';
let inflightTopicsPromise: Promise<FihristTopic[]> | null = null;

function sanitizeRefTuples(raw: unknown): FihristRefTuple[] {
  if (!Array.isArray(raw)) return [];
  const out: FihristRefTuple[] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const surah = Number(item[0]);
    const start = Number(item[1]);
    const end = item.length >= 3 ? Number(item[2]) : start;
    if (
      Number.isInteger(surah) &&
      surah >= 1 &&
      surah <= 114 &&
      Number.isInteger(start) &&
      start >= 1 &&
      Number.isInteger(end) &&
      end >= 1
    ) {
      out.push([surah, Math.min(start, end), Math.max(start, end)]);
    }
  }
  return out;
}

function deriveTurkishLetter(rawLetter: unknown, title: string): string {
  if (typeof rawLetter === 'string' && rawLetter.trim()) {
    return rawLetter.trim().toLocaleUpperCase('tr-TR').slice(0, 1);
  }
  const clean = title.trim();
  if (!clean) return 'A';
  return clean.slice(0, 1).toLocaleUpperCase('tr-TR');
}

function sanitizeTopicList(raw: unknown): FihristTopic[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as FihristTopicsPayload).topics)
      ? (raw as FihristTopicsPayload).topics
      : [];

  const out: FihristTopic[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < arr.length; i += 1) {
    const item = arr[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<FihristTopic>;
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const refs = sanitizeRefTuples(rec.refs);
    if (!title || refs.length === 0) continue;

    const rawId =
      typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : `topic_${i + 1}`;
    const id = seenIds.has(rawId) ? `${rawId}_${i + 1}` : rawId;
    seenIds.add(id);

    const tags = Array.isArray(rec.tags)
      ? rec.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : undefined;

    out.push({
      id,
      letter: deriveTurkishLetter(rec.letter, title),
      title,
      tags: tags && tags.length > 0 ? tags : undefined,
      seeAlso:
        typeof rec.seeAlso === 'string' && rec.seeAlso.trim() ? rec.seeAlso.trim() : undefined,
      refs,
    });
  }

  return out;
}

function getFihristCandidateBaseUrls(): string[] {
  if (HAS_CUSTOM_DATA_BASE_URL) {
    return [DATA_BASE_URL, LOCAL_DATA_BASE_URL];
  }
  return [LOCAL_DATA_BASE_URL, LIVE_DATA_BASE_URL];
}

/**
 * `/data/fihrist/topics.json` dosyasını yalnızca kullanıcı Fihrist sekmesini açtığında
 * tembel olarak çeker ve bellekte önbellekler. Ağ veya dosya erişilemezse anında
 * kapsamlı A–Z dahili yedek fihriste düşer.
 */
export async function loadFihristTopics(): Promise<FihristTopic[]> {
  if (cachedTopics) return cachedTopics;
  if (inflightTopicsPromise) return inflightTopicsPromise;

  inflightTopicsPromise = (async () => {
    const candidates = getFihristCandidateBaseUrls();
    for (const base of candidates) {
      const url = `${base.replace(/\/+$/, '')}/fihrist/topics.json`;
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const text = await res.text();
        if (text.trimStart().startsWith('<!doctype') || text.trimStart().startsWith('<html')) {
          continue;
        }
        const parsed = JSON.parse(text) as unknown;
        const topics = sanitizeTopicList(parsed);
        if (topics.length > 0) {
          cachedTopics = topics;
          topicsSource = base === LOCAL_DATA_BASE_URL ? 'local' : 'remote';
          return topics;
        }
      } catch {
        // Sıradaki kaynağa veya dahili yedeğe geç
      }
    }

    cachedTopics = [...FALLBACK_FIHRIST_TOPICS];
    topicsSource = 'fallback';
    return cachedTopics;
  })();

  try {
    return await inflightTopicsPromise;
  } finally {
    inflightTopicsPromise = null;
  }
}

export function getCachedFihristTopics(): FihristTopic[] | null {
  return cachedTopics;
}

export function getFihristTopicsSource(): 'remote' | 'local' | 'fallback' {
  return topicsSource;
}

export function countRefsAyahs(refs: readonly FihristRefTuple[]): number {
  let total = 0;
  for (const [, start, end] of refs) {
    total += Math.max(1, end - start + 1);
  }
  return total;
}

export function countEntriesAyahs(entries: readonly ResearchVerseEntry[]): number {
  let total = 0;
  for (const e of entries) {
    total += Math.max(1, e.endAyah - e.startAyah + 1);
  }
  return total;
}

export function formatRefRangeLabel(startAyah: number, endAyah: number): string {
  return startAyah === endAyah ? `${startAyah}` : `${startAyah}–${endAyah}`;
}

/**
 * Türkçe arama eşleştirmesi için şapkalı/aksanlı ve noktalı harfleri esnek biçimde sadeleştirir.
 */
export function foldTurkishForFihristSearch(value: string): string {
  return normalizeTurkish(value)
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

export function matchesFihristTopicQuery(topic: FihristTopic, rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q) return true;

  const normQ = normalizeTurkish(q);
  const foldedQ = foldTurkishForFihristSearch(q);
  const haystacks = [topic.title, ...(topic.tags ?? []), topic.seeAlso ?? ''];

  for (const h of haystacks) {
    if (!h) continue;
    if (normalizeTurkish(h).includes(normQ)) return true;
    if (foldTurkishForFihristSearch(h).includes(foldedQ)) return true;
  }
  return false;
}

export interface HydrateSourceItem {
  entryId?: string;
  surah: number;
  startAyah: number;
  endAyah: number;
  note?: string;
}

/**
 * Verilen ayet aralıklarının Arapça metinlerini ve seçili Türkçe meallerini
 * yalnızca mevcut `dataService` üzerinden (sure başına tek önbellekli istek) tembel yükler.
 */
export async function hydrateFihristItems(params: {
  items: readonly HydrateSourceItem[];
  primaryMealId: string;
  secondaryMealId: string;
  isDual: boolean;
  meta: MetaData | null;
}): Promise<HydratedFihristVerse[]> {
  const { items, primaryMealId, secondaryMealId, isDual, meta } = params;
  if (items.length === 0) return [];

  const uniqueSurahs = Array.from(new Set(items.map((it) => it.surah)));
  const needsExtraPrimary = primaryMealId !== 'm1' && primaryMealId !== 'm2';
  const needsExtraSecondary =
    isDual && secondaryMealId !== 'm1' && secondaryMealId !== 'm2';
  const needsExtra = needsExtraPrimary || needsExtraSecondary;

  const surahBundles = await Promise.all(
    uniqueSurahs.map(async (sNo) => {
      try {
        const bundle = await dataService.getSurahBundle(sNo);
        if (needsExtra) {
          await dataService.loadExtraMealsForSurah(sNo).catch(() => undefined);
        }
        return [sNo, bundle] as const;
      } catch {
        return [sNo, null] as const;
      }
    }),
  );

  const bundleMap = new Map(surahBundles);
  const surahMetaMap = new Map<number, SurahMeta>();
  if (meta) {
    for (const s of meta.surahs) {
      surahMetaMap.set(s.no, s);
    }
  }

  const out: HydratedFihristVerse[] = [];

  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx];
    const bundle = bundleMap.get(item.surah);
    if (!bundle) continue;

    const verseByAyah = new Map(bundle.verses.map((v) => [v.ayah, v]));
    const sMeta = bundle.surahMeta ?? surahMetaMap.get(item.surah) ?? null;
    const minA = Math.max(1, Math.min(item.startAyah, item.endAyah));
    const maxA = Math.max(minA, Math.max(item.startAyah, item.endAyah));

    let firstInRange = true;
    for (let ayahNo = minA; ayahNo <= maxA; ayahNo += 1) {
      const verse = verseByAyah.get(ayahNo);
      if (!verse) continue;

      const primaryMealVerse = dataService.getMealVerse(
        item.surah,
        ayahNo,
        primaryMealId,
        verse,
      );
      const secondaryMealVerse = isDual
        ? dataService.getMealVerse(item.surah, ayahNo, secondaryMealId, verse)
        : null;

      out.push({
        key: `${item.entryId ?? idx}_${item.surah}:${ayahNo}`,
        entryId: item.entryId,
        surah: item.surah,
        ayah: ayahNo,
        rangeStart: minA,
        rangeEnd: maxA,
        isRangeFirst: firstInRange,
        surahMeta: sMeta,
        verse,
        primaryMealVerse,
        secondaryMealVerse,
        note: firstInRange ? item.note : undefined,
      });
      firstInRange = false;
    }
  }

  return out;
}

/**
 * Konu veya araştırma listesindeki ayet aralıklarını mevcut `audioQueueService.startSegmentQueue`
 * motoruna doğrudan beslenecek `AudioPlaylistItem[]` dizisine dönüştürür.
 */
export function buildAudioSegmentsFromItems(
  items: readonly { surah: number; startAyah: number; endAyah: number }[],
  meta: MetaData | null,
  prefix = 'fihrist',
): AudioPlaylistItem[] {
  const surahMap = new Map<number, SurahMeta>();
  if (meta) {
    for (const s of meta.surahs) surahMap.set(s.no, s);
  }

  return items.map((item, idx) => {
    const sName = surahMap.get(item.surah)?.nameTr ?? `${item.surah}. Sure`;
    const rangeTxt =
      item.startAyah === item.endAyah
        ? `${item.startAyah}. Ayet`
        : `${item.startAyah}–${item.endAyah}. Ayetler`;

    return {
      id: `${prefix}_${idx}_${item.surah}_${item.startAyah}_${item.endAyah}`,
      type: 'ayah_range',
      label: `${sName} ${rangeTxt}`,
      surah: item.surah,
      startAyah: item.startAyah,
      endAyah: item.endAyah,
    };
  });
}

/**
 * Kullanıcının yapıştırdığı toplu ayet referanslarını ayrıştırır.
 * Desteklenen biçimler:
 *  - `2/153-157; 3/189-194; 31/12-19`
 *  - `2:255, 49:11-12`
 *  - Satır sonu, noktalı virgül veya virgülle ayrılmış çoklu referanslar
 */
export function parseBulkVerseReferences(
  rawInput: string,
  meta: MetaData | null,
): BulkRefParseResult {
  const trimmed = rawInput.trim();
  if (!trimmed) return { valid: [], invalidTokens: [] };

  const surahMaxMap = new Map<number, number>();
  if (meta) {
    for (const s of meta.surahs) {
      surahMaxMap.set(s.no, s.ayahCount);
    }
  }

  const tokens = trimmed
    .split(/[;,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const valid: ParsedBulkRef[] = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    // Örnek: "2/153-157", "2:255", "31 / 12 – 19"
    const match = token.match(/^(\d{1,3})\s*[:/.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/);
    if (!match) {
      invalidTokens.push(token);
      continue;
    }

    const surah = Number(match[1]);
    const rawStart = Number(match[2]);
    const rawEnd = match[3] ? Number(match[3]) : rawStart;

    if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
      invalidTokens.push(token);
      continue;
    }

    const maxAyah = surahMaxMap.get(surah) ?? 286;
    if (
      !Number.isInteger(rawStart) ||
      !Number.isInteger(rawEnd) ||
      rawStart < 1 ||
      rawEnd < 1 ||
      rawStart > maxAyah ||
      rawEnd > maxAyah
    ) {
      invalidTokens.push(token);
      continue;
    }

    valid.push({
      surah,
      startAyah: Math.min(rawStart, rawEnd),
      endAyah: Math.max(rawStart, rawEnd),
    });
  }

  return { valid, invalidTokens };
}
