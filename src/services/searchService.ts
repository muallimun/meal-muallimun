import { findMealById, isExtraMealId, isRtlMeal } from '../config/mealsConfig';
import { dataService } from './dataService';
import type { FihristTopic, SurahExtraInfo } from '../types/fihrist';
import type { ManifestData, MealVerse, MetaData, SurahMeta, WordSurahFile } from '../types/quran';
import {
  isArabicText,
  matchesNormalizedText,
  normalizeArabic,
  normalizeTurkish,
} from '../utils/textNormalize';

// ============================================================================
// Kademeli (Progressive & Non-Blocking) Kur'an, Meal, Dipnot & Kelime Arama Motoru
// ============================================================================

export type SearchScopeMode = 'all' | 'pool' | 'juz' | 'surah';

export type SearchResultTab = 'all' | 'arabic' | 'meal' | 'words' | 'surahs' | 'topics';

export interface DirectJumpItem {
  id: string;
  kind: 'verse' | 'page' | 'juz' | 'surah';
  title: string;
  subtitle: string;
  badge: string;
  surah?: number;
  ayah?: number;
  page?: number;
}

export interface SurahSearchHit {
  surah: SurahMeta;
  meaningTr?: string;
  matchedField: 'name' | 'meaning' | 'topic';
  snippet: string;
}

export interface FihristTopicSearchHit {
  topic: FihristTopic;
  ayahCount: number;
  matchedTag?: string;
}

export interface ExtraMealSearchHit {
  mealId: string;
  shortLabel: string;
  text: string;
  isRtl: boolean;
}

export interface VerseSearchHit {
  id: number;
  surah: number;
  surahNameTr: string;
  surahNameAr: string;
  ayah: number;
  cuz: number;
  page: number;
  arText: string;
  m1Text: string;
  m2Text: string;
  matchedArabic: boolean;
  matchedM1: boolean;
  matchedM2: boolean;
  matchedFootnotes: { meal: string; text: string }[];
  extraMealHits?: ExtraMealSearchHit[];
}

export interface WordSearchHit {
  key: string;
  verseId: number;
  surah: number;
  surahNameTr: string;
  ayah: number;
  cuz: number;
  page: number;
  wordIndex: number;
  arWord: string;
  arNorm: string;
  trWord: string;
  trNorm: string;
  arVerseText: string;
  mealPreview: string;
}

export interface WordGroupSummary {
  groupKey: string;
  arDisplay: string;
  trDisplay: string;
  count: number;
}

export interface ProgressiveSearchSnapshot {
  query: string;
  isArabicQuery: boolean;
  isScanning: boolean;
  scannedSurahs: number;
  totalSurahs: number;
  directJumps: DirectJumpItem[];
  surahHits: SurahSearchHit[];
  fihristTopicHits: FihristTopicSearchHit[];
  allHits: VerseSearchHit[];
  arabicHits: VerseSearchHit[];
  mealHits: VerseSearchHit[];
  wordHits: WordSearchHit[];
  wordGroups: WordGroupSummary[];
}

// Bellek içi hafif arama indeksi (sureler tarandıkça doldurulur, uygulama açılışında yüklenmez)
interface IndexedWordItem {
  idx: number;
  ar: string;
  arNorm: string;
  tr: string;
  trNorm: string;
}

interface IndexedVerseItem {
  id: number;
  surah: number;
  ayah: number;
  cuz: number;
  page: number;
  arRaw: string;
  arNorm: string;
  m1Raw: string;
  m1Norm: string;
  m1FnRaw: string[];
  m1FnNorm: string[];
  m2Raw: string;
  m2Norm: string;
  m2FnRaw: string[];
  m2FnNorm: string[];
  words: IndexedWordItem[];
}

interface IndexedSurahEntry {
  surahNo: number;
  verses: IndexedVerseItem[];
}

const surahSearchIndexCache = new Map<number, IndexedSurahEntry>();
const BATCH_SIZE = 10;

export function clearSearchIndexCache(): void {
  surahSearchIndexCache.clear();
}

export function getCachedIndexedSurahCount(): number {
  return surahSearchIndexCache.size;
}

/**
 * "2:255", "Bakara 255", "Hucurat 10", "Sayfa 411", "Cüz 26" gibi doğrudan referansları 0ms içinde yakalar.
 */
export function parseDirectReferences(rawQuery: string, meta: MetaData): DirectJumpItem[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const items: DirectJumpItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: DirectJumpItem) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  };

  // 1. Sayısal Sure:Ayet formatı ("2:255", "49 10", "17/23")
  const numRefMatch = q.match(/^(\d{1,3})\s*[:./\-\s]\s*(\d{1,3})$/);
  if (numRefMatch) {
    const sNo = Number(numRefMatch[1]);
    const aNo = Number(numRefMatch[2]);
    const surah = meta.surahs.find((s) => s.no === sNo);
    if (surah && aNo >= 1 && aNo <= surah.ayahCount) {
      const page = dataService.findPageForSurahAyah(meta, sNo, aNo);
      const row = meta.verseIndex.find((r) => r[1] === sNo && r[2] === aNo);
      pushUnique({
        id: `jump-verse-${sNo}-${aNo}`,
        kind: 'verse',
        title: `${surah.nameTr} ${sNo}:${aNo}`,
        subtitle: `Sayfa ${page}${row ? ` · ${row[3]}. Cüz` : ''} · Doğrudan ayete git`,
        badge: 'Doğrudan Git',
        surah: sNo,
        ayah: aNo,
        page,
      });
    }
  }

  // 2. Sure Adı + Ayet Numarası ("Bakara 255", "Hucurat 10", "İsra 23", "Bakara Suresi 255")
  const namedRefMatch = q.match(/^([a-zA-ZçğıöşüÇĞİÖŞÜâîûÂÎÛ'\s-]+?)\s+(\d{1,3})$/);
  if (namedRefMatch) {
    const rawName = namedRefMatch[1].replace(/\b(suresi|sure)\b/gi, '').trim();
    const aNo = Number(namedRefMatch[2]);
    const normName = normalizeTurkish(rawName);
    if (normName.length >= 2 && aNo >= 1) {
      // "sayfa 411" ve "cüz 26" ile çakışmasın
      if (
        normName !== 'sayfa' &&
        normName !== 'sf' &&
        normName !== 's' &&
        normName !== 'cuz' &&
        normName !== 'cüz' &&
        normName !== 'c'
      ) {
        const matchedSurah =
          meta.surahs.find(
            (s) =>
              normalizeTurkish(s.shortNameTr) === normName ||
              normalizeTurkish(s.nameTr) === normName,
          ) ??
          meta.surahs.find(
            (s) =>
              normalizeTurkish(s.shortNameTr).startsWith(normName) ||
              normalizeTurkish(s.nameTr).includes(normName),
          );

        if (matchedSurah && aNo <= matchedSurah.ayahCount) {
          const page = dataService.findPageForSurahAyah(meta, matchedSurah.no, aNo);
          const row = meta.verseIndex.find((r) => r[1] === matchedSurah.no && r[2] === aNo);
          pushUnique({
            id: `jump-verse-${matchedSurah.no}-${aNo}`,
            kind: 'verse',
            title: `${matchedSurah.nameTr} ${matchedSurah.no}:${aNo}`,
            subtitle: `Sayfa ${page}${row ? ` · ${row[3]}. Cüz` : ''} · Doğrudan ayete git`,
            badge: 'Doğrudan Git',
            surah: matchedSurah.no,
            ayah: aNo,
            page,
          });
        }
      }
    }
  }

  // 3. Sayfa referansı ("Sayfa 411", "sf 411", "s. 411" veya salt sayı 0..604)
  const pageMatch = q.match(/^(?:(?:sayfa|sf|s)\.?\s*)?(\d{1,3})$/i);
  if (pageMatch) {
    const pNo = Number(pageMatch[1]);
    const { minPage, maxPage } = dataService.getPageBounds(meta);
    if (pNo >= minPage && pNo <= maxPage) {
      const firstRow = meta.verseIndex.find((r) => r[4] === pNo);
      const surah = firstRow ? meta.surahs.find((s) => s.no === firstRow[1]) : null;
      pushUnique({
        id: `jump-page-${pNo}`,
        kind: 'page',
        title: `Mushaf Sayfa ${pNo}`,
        subtitle: surah && firstRow
          ? `${surah.nameTr} (${firstRow[1]}:${firstRow[2]}) · ${firstRow[3]}. Cüz`
          : 'Mushaf sayfasını doğrudan aç',
        badge: 'Sayfa',
        page: pNo,
        surah: firstRow?.[1],
        ayah: firstRow?.[2],
      });
    }
  }

  // 4. Cüz referansı ("Cüz 26", "26. cüz", "cuz 15")
  const juzMatch =
    q.match(/^(?:cüz|cuz|c)\.?\s*(\d{1,2})$/i) || q.match(/^(\d{1,2})\.?\s*(?:cüz|cuz)$/i);
  if (juzMatch) {
    const jNo = Number(juzMatch[1]);
    const juz = meta.juzs.find((j) => j.no === jNo);
    if (juz) {
      const loc = dataService.findFirstLocationForJuz(meta, jNo);
      const startSurah = meta.surahs.find((s) => s.no === loc.surah);
      pushUnique({
        id: `jump-juz-${jNo}`,
        kind: 'juz',
        title: `${jNo}. Cüz Başlangıcı`,
        subtitle: `${startSurah?.nameTr ?? `${loc.surah}. Sure`} ${loc.surah}:${loc.ayah} · Sayfa ${loc.page}`,
        badge: 'Cüz',
        surah: loc.surah,
        ayah: loc.ayah,
        page: loc.page,
      });
    }
  }

  return items;
}

/**
 * meta.json + surah_info.json üzerinden anlık olarak sure isimleri, Türkçe anlamları,
 * Arapça adları ve konuları içinde arama yapar.
 */
export function searchSurahsInstant(
  rawQuery: string,
  meta: MetaData,
  includeSubstring = false,
  surahExtrasMap?: Map<number, SurahExtraInfo>,
): SurahSearchHit[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const arabicQ = isArabicText(q);
  const normQ = arabicQ ? normalizeArabic(q) : normalizeTurkish(q);
  if (!normQ) return [];

  const hits: SurahSearchHit[] = [];

  for (const s of meta.surahs) {
    const meaningTr = surahExtrasMap?.get(s.no)?.meaningTr;

    if (arabicQ) {
      if (matchesNormalizedText(normalizeArabic(s.nameAr), normQ, true, includeSubstring)) {
        hits.push({
          surah: s,
          meaningTr,
          matchedField: 'name',
          snippet: s.konusu || s.hakkinda || `${s.type} · ${s.ayahCount} ayet`,
        });
      }
      continue;
    }

    const numMatch = String(s.no) === q;
    const nameMatch =
      matchesNormalizedText(normalizeTurkish(s.nameTr), normQ, false, includeSubstring) ||
      matchesNormalizedText(normalizeTurkish(s.shortNameTr), normQ, false, includeSubstring);

    if (numMatch || nameMatch) {
      hits.push({
        surah: s,
        meaningTr,
        matchedField: 'name',
        snippet: s.konusu || s.hakkinda || `${s.type} · ${s.ayahCount} ayet`,
      });
      continue;
    }

    if (normQ.length >= 2) {
      if (
        meaningTr &&
        matchesNormalizedText(normalizeTurkish(meaningTr), normQ, false, true)
      ) {
        hits.push({
          surah: s,
          meaningTr,
          matchedField: 'meaning',
          snippet: `Anlamı: ${meaningTr}${s.konusu ? ` · ${s.konusu}` : ''}`,
        });
        continue;
      }

      const topicText = s.konusu || '';
      const aboutText = s.hakkinda || '';
      if (matchesNormalizedText(normalizeTurkish(topicText), normQ, false, includeSubstring)) {
        hits.push({
          surah: s,
          meaningTr,
          matchedField: 'topic',
          snippet: topicText,
        });
      } else if (
        matchesNormalizedText(normalizeTurkish(aboutText), normQ, false, includeSubstring)
      ) {
        hits.push({
          surah: s,
          meaningTr,
          matchedField: 'topic',
          snippet: aboutText,
        });
      }
    }
  }

  return hits;
}

/**
 * 601 başlık içeren Konu Fihristi (topics.json) üzerinde başlık ve etiket eşleşmesi yapar.
 */
export function searchFihristTopicsInstant(
  rawQuery: string,
  topics: readonly FihristTopic[],
): FihristTopicSearchHit[] {
  const q = rawQuery.trim();
  if (!q || isArabicText(q)) return [];
  const normQ = normalizeTurkish(q);
  if (normQ.length < 2) return [];

  const scored: { hit: FihristTopicSearchHit; score: number }[] = [];

  for (const topic of topics) {
    const normTitle = normalizeTurkish(topic.title);
    const titleExact = normTitle === normQ;
    const titleStarts = !titleExact && normTitle.startsWith(normQ);
    const titleWordStarts =
      !titleExact && !titleStarts && matchesNormalizedText(normTitle, normQ, false, false);
    const titleIncludes = !titleExact && !titleStarts && !titleWordStarts && normTitle.includes(normQ);

    let matchedTag: string | undefined;
    if (topic.tags && topic.tags.length > 0) {
      matchedTag = topic.tags.find((tag) => normalizeTurkish(tag).includes(normQ));
    }

    if (!titleExact && !titleStarts && !titleWordStarts && !titleIncludes && !matchedTag) {
      continue;
    }

    let ayahCount = 0;
    for (const [, start, end] of topic.refs) {
      ayahCount += Math.max(1, Math.abs(end - start) + 1);
    }

    const score = titleExact
      ? 100
      : titleStarts
        ? 85
        : titleWordStarts
          ? 70
          : titleIncludes
            ? 55
            : 40;

    scored.push({
      hit: { topic, ayahCount, matchedTag },
      score,
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.hit.ayahCount - a.hit.ayahCount ||
      a.hit.topic.title.localeCompare(b.hit.topic.title, 'tr-TR'),
  );

  return scored.map((item) => item.hit);
}

async function getOrIndexSurah(surahNo: number): Promise<IndexedSurahEntry> {
  const cached = surahSearchIndexCache.get(surahNo);
  if (cached) return cached;

  const [arFile, m1File, m2File, wordsFile] = await Promise.all([
    dataService.getArabicSurah(surahNo),
    dataService.getMealSurah('m1', surahNo),
    dataService.getMealSurah('m2', surahNo),
    dataService
      .getWordsSurah(surahNo)
      .catch(() => ({ s: surahNo, words: {} }) as WordSurahFile),
  ]);

  const m1Map = new Map(m1File.verses.map((v) => [v.a, v]));
  const m2Map = new Map(m2File.verses.map((v) => [v.a, v]));

  const verses: IndexedVerseItem[] = arFile.verses.map((ar) => {
    const m1 = m1Map.get(ar.a);
    const m2 = m2Map.get(ar.a);
    const m1Raw = m1?.t ?? '';
    const m2Raw = m2?.t ?? '';
    const m1FnRaw = Array.isArray(m1?.fn) ? m1.fn : [];
    const m2FnRaw = Array.isArray(m2?.fn) ? m2.fn : [];
    const rawPairs = wordsFile.words[String(ar.a)] ?? [];

    const words: IndexedWordItem[] = rawPairs.map((pair, idx) => ({
      idx,
      ar: pair[0] ?? '',
      arNorm: normalizeArabic(pair[0] ?? ''),
      tr: pair[1] ?? '',
      trNorm: normalizeTurkish(pair[1] ?? ''),
    }));

    return {
      id: ar.id,
      surah: surahNo,
      ayah: ar.a,
      cuz: ar.c,
      page: ar.p,
      arRaw: ar.t,
      arNorm: normalizeArabic(ar.t),
      m1Raw,
      m1Norm: normalizeTurkish(m1Raw),
      m1FnRaw,
      m1FnNorm: m1FnRaw.map((fn) => normalizeTurkish(fn)),
      m2Raw,
      m2Norm: normalizeTurkish(m2Raw),
      m2FnRaw,
      m2FnNorm: m2FnRaw.map((fn) => normalizeTurkish(fn)),
      words,
    };
  });

  const entry: IndexedSurahEntry = { surahNo, verses };
  surahSearchIndexCache.set(surahNo, entry);
  return entry;
}

function buildWordGroups(wordHits: WordSearchHit[]): WordGroupSummary[] {
  const map = new Map<
    string,
    { arDisplay: string; trCounts: Map<string, number>; count: number }
  >();

  for (const hit of wordHits) {
    const key = hit.arNorm || hit.trNorm;
    if (!key) continue;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        arDisplay: hit.arWord,
        trCounts: new Map<string, number>(),
        count: 0,
      };
      map.set(key, bucket);
    }
    bucket.count += 1;
    const trClean = hit.trWord.trim();
    if (trClean) {
      bucket.trCounts.set(trClean, (bucket.trCounts.get(trClean) ?? 0) + 1);
    }
  }

  const summaries: WordGroupSummary[] = [];
  for (const [groupKey, bucket] of map.entries()) {
    let bestTr = '';
    let bestTrCount = -1;
    for (const [trText, cnt] of bucket.trCounts.entries()) {
      if (cnt > bestTrCount) {
        bestTr = trText;
        bestTrCount = cnt;
      }
    }
    summaries.push({
      groupKey,
      arDisplay: bucket.arDisplay,
      trDisplay: bestTr,
      count: bucket.count,
    });
  }

  summaries.sort((a, b) => b.count - a.count || a.arDisplay.localeCompare(b.arDisplay));
  return summaries;
}

export interface RunProgressiveSearchOptions {
  query: string;
  targetSurahs: number[];
  filterJuzNo?: number | null;
  preferredMeal: 'm1' | 'm2' | 'both';
  primaryMealId?: string;
  secondaryMealId?: string;
  mealDisplayMode?: 'single' | 'dual';
  manifest?: ManifestData | null;
  includeSubstring?: boolean;
  meta: MetaData;
  signal: AbortSignal;
  onProgress: (snapshot: ProgressiveSearchSnapshot) => void;
}

/**
 * Seçili sureleri 10'arlı paketler halinde (batched async) tarayarak ana iş parçacığını
 * kilitlemeden ve her pakette sonuçları akıtarak tüm Kur'an / Meal (27 eser) / Dipnot / Kelime araması yapar.
 */
export async function runProgressiveSearch(
  options: RunProgressiveSearchOptions,
): Promise<void> {
  const {
    query,
    targetSurahs,
    filterJuzNo,
    preferredMeal,
    primaryMealId,
    secondaryMealId,
    mealDisplayMode,
    manifest = null,
    includeSubstring = false,
    meta,
    signal,
    onProgress,
  } = options;
  const trimmed = query.trim();

  const [surahExtrasMap, fihristTopicsFile] = await Promise.all([
    dataService.getSurahInfoExtrasMap().catch(() => new Map<number, SurahExtraInfo>()),
    dataService.getFihristTopics().catch(() => ({ topics: [] as FihristTopic[] })),
  ]);

  if (signal.aborted) return;

  const directJumps = parseDirectReferences(trimmed, meta);
  const surahHits = searchSurahsInstant(trimmed, meta, includeSubstring, surahExtrasMap);
  const fihristTopicHits = searchFihristTopicsInstant(trimmed, fihristTopicsFile.topics ?? []);
  const arabicMode = isArabicText(trimmed);
  const normQuery = arabicMode ? normalizeArabic(trimmed) : normalizeTurkish(trimmed);

  // Çok kısa (1 karakter) metinlerde yalnızca anlık sure/referans sonuçlarını ver, 114 sure tarama
  if (normQuery.length < 2 || targetSurahs.length === 0) {
    if (!signal.aborted) {
      onProgress({
        query: trimmed,
        isArabicQuery: arabicMode,
        isScanning: false,
        scannedSurahs: 0,
        totalSurahs: targetSurahs.length,
        directJumps,
        surahHits,
        fihristTopicHits,
        allHits: [],
        arabicHits: [],
        mealHits: [],
        wordHits: [],
        wordGroups: [],
      });
    }
    return;
  }

  const surahMetaMap = new Map<number, SurahMeta>(meta.surahs.map((s) => [s.no, s]));
  const allHits: VerseSearchHit[] = [];
  const arabicHits: VerseSearchHit[] = [];
  const mealHits: VerseSearchHit[] = [];
  const wordHits: WordSearchHit[] = [];

  // 0ms anlık başlangıç bildirimi (Sureler, Konu Fihristi ve Doğrudan Git hemen görünür)
  if (!signal.aborted) {
    onProgress({
      query: trimmed,
      isArabicQuery: arabicMode,
      isScanning: true,
      scannedSurahs: 0,
      totalSurahs: targetSurahs.length,
      directJumps,
      surahHits,
      fihristTopicHits,
      allHits: [],
      arabicHits: [],
      mealHits: [],
      wordHits: [],
      wordGroups: [],
    });
  }

  const activeExtraMealIds: string[] = [];
  if (primaryMealId && isExtraMealId(primaryMealId)) {
    activeExtraMealIds.push(primaryMealId);
  }
  if (
    mealDisplayMode === 'dual' &&
    secondaryMealId &&
    isExtraMealId(secondaryMealId) &&
    !activeExtraMealIds.includes(secondaryMealId)
  ) {
    activeExtraMealIds.push(secondaryMealId);
  }

  const activeExtraMeals = activeExtraMealIds.map((mealId) => {
    const def = findMealById(mealId, manifest);
    return {
      mealId,
      shortLabel: def.shortLabel,
      isRtl: isRtlMeal(def),
    };
  });
  const needsExtraMeals = activeExtraMeals.length > 0;

  let scanned = 0;

  for (let offset = 0; offset < targetSurahs.length; offset += BATCH_SIZE) {
    if (signal.aborted) return;

    const batchSurahs = targetSurahs.slice(offset, offset + BATCH_SIZE);
    const [indexedBatch, extraBatchList] = await Promise.all([
      Promise.all(
        batchSurahs.map((sNo) =>
          getOrIndexSurah(sNo).catch(() => ({ surahNo: sNo, verses: [] }) as IndexedSurahEntry),
        ),
      ),
      needsExtraMeals
        ? Promise.all(
            batchSurahs.map((sNo) =>
              dataService
                .loadExtraMealsForSurah(sNo)
                .catch(() => ({}) as Record<string, MealVerse[]>),
            ),
          )
        : Promise.resolve<Record<string, MealVerse[]>[]>([]),
    ]);

    if (signal.aborted) return;

    for (let bIdx = 0; bIdx < indexedBatch.length; bIdx += 1) {
      const surahEntry = indexedBatch[bIdx];
      const sMeta = surahMetaMap.get(surahEntry.surahNo);
      const surahNameTr = sMeta?.nameTr ?? `${surahEntry.surahNo}. Sure`;
      const surahNameAr = sMeta?.nameAr ?? '';

      // Sure bazlı ek meal (m3..m27) ayet indeks haritası
      const extraByMealId = new Map<string, Map<number, MealVerse>>();
      if (needsExtraMeals) {
        const rawExtra = extraBatchList[bIdx] ?? {};
        for (const extraDef of activeExtraMeals) {
          const list = rawExtra[extraDef.mealId];
          if (Array.isArray(list) && list.length > 0) {
            extraByMealId.set(
              extraDef.mealId,
              new Map(list.map((mv) => [mv.a, mv])),
            );
          }
        }
      }

      for (const verse of surahEntry.verses) {
        if (filterJuzNo && verse.cuz !== filterJuzNo) continue;

        let matchedArabic = false;
        let matchedM1 = false;
        let matchedM2 = false;
        let matchedExtraRtl = false;
        const matchedFootnotes: { meal: string; text: string }[] = [];
        const extraMealHits: ExtraMealSearchHit[] = [];

        if (arabicMode) {
          matchedArabic = matchesNormalizedText(verse.arNorm, normQuery, true, includeSubstring);
        } else {
          matchedM1 = matchesNormalizedText(verse.m1Norm, normQuery, false, includeSubstring);
          matchedM2 = matchesNormalizedText(verse.m2Norm, normQuery, false, includeSubstring);

          for (let f = 0; f < verse.m1FnNorm.length; f += 1) {
            if (matchesNormalizedText(verse.m1FnNorm[f], normQuery, false, includeSubstring)) {
              matchedFootnotes.push({ meal: 'TDV', text: verse.m1FnRaw[f] });
            }
          }
          for (let f = 0; f < verse.m2FnNorm.length; f += 1) {
            if (matchesNormalizedText(verse.m2FnNorm[f], normQuery, false, includeSubstring)) {
              matchedFootnotes.push({ meal: 'DİB', text: verse.m2FnRaw[f] });
            }
          }
        }

        // Seçili ek mealler (m3..m27) ve Arapça tefsirler (m25/m26)
        if (needsExtraMeals) {
          for (const extraDef of activeExtraMeals) {
            const extraVerse = extraByMealId.get(extraDef.mealId)?.get(verse.ayah);
            if (!extraVerse) continue;

            if (extraDef.isRtl && arabicMode) {
              const normText = normalizeArabic(extraVerse.t);
              if (matchesNormalizedText(normText, normQuery, true, includeSubstring)) {
                extraMealHits.push({
                  mealId: extraDef.mealId,
                  shortLabel: extraDef.shortLabel,
                  text: extraVerse.t,
                  isRtl: true,
                });
                matchedExtraRtl = true;
              }
              if (Array.isArray(extraVerse.fn)) {
                for (const fnText of extraVerse.fn) {
                  if (matchesNormalizedText(normalizeArabic(fnText), normQuery, true, includeSubstring)) {
                    matchedFootnotes.push({ meal: extraDef.shortLabel, text: fnText });
                    matchedExtraRtl = true;
                  }
                }
              }
            } else if (!extraDef.isRtl && !arabicMode) {
              const normText = normalizeTurkish(extraVerse.t);
              if (matchesNormalizedText(normText, normQuery, false, includeSubstring)) {
                extraMealHits.push({
                  mealId: extraDef.mealId,
                  shortLabel: extraDef.shortLabel,
                  text: extraVerse.t,
                  isRtl: false,
                });
              }
              if (Array.isArray(extraVerse.fn)) {
                for (const fnText of extraVerse.fn) {
                  if (matchesNormalizedText(normalizeTurkish(fnText), normQuery, false, includeSubstring)) {
                    matchedFootnotes.push({ meal: extraDef.shortLabel, text: fnText });
                  }
                }
              }
            }
          }
        }

        const matchedMealOrFn =
          matchedM1 ||
          matchedM2 ||
          extraMealHits.length > 0 ||
          matchedFootnotes.length > 0;
        if (matchedArabic || matchedMealOrFn) {
          const hit: VerseSearchHit = {
            id: verse.id,
            surah: verse.surah,
            surahNameTr,
            surahNameAr,
            ayah: verse.ayah,
            cuz: verse.cuz,
            page: verse.page,
            arText: verse.arRaw,
            m1Text: verse.m1Raw,
            m2Text: verse.m2Raw,
            matchedArabic,
            matchedM1,
            matchedM2,
            matchedFootnotes,
            ...(extraMealHits.length > 0 ? { extraMealHits } : {}),
          };
          allHits.push(hit);
          if (matchedArabic || matchedExtraRtl) arabicHits.push(hit);
          if (matchedMealOrFn) mealHits.push(hit);
        }

        // Kelime Meali (w/) eşleşmesi
        for (const w of verse.words) {
          const isWordMatch = arabicMode
            ? matchesNormalizedText(w.arNorm, normQuery, true, includeSubstring)
            : matchesNormalizedText(w.trNorm, normQuery, false, includeSubstring);
          if (isWordMatch) {
            const mealPreview =
              preferredMeal === 'm2' ? verse.m2Raw || verse.m1Raw : verse.m1Raw || verse.m2Raw;
            wordHits.push({
              key: `${verse.id}-${w.idx}`,
              verseId: verse.id,
              surah: verse.surah,
              surahNameTr,
              ayah: verse.ayah,
              cuz: verse.cuz,
              page: verse.page,
              wordIndex: w.idx,
              arWord: w.ar,
              arNorm: w.arNorm,
              trWord: w.tr,
              trNorm: w.trNorm,
              arVerseText: verse.arRaw,
              mealPreview,
            });
          }
        }
      }
    }

    scanned = Math.min(targetSurahs.length, offset + batchSurahs.length);
    const isStillScanning = scanned < targetSurahs.length;

    onProgress({
      query: trimmed,
      isArabicQuery: arabicMode,
      isScanning: isStillScanning,
      scannedSurahs: scanned,
      totalSurahs: targetSurahs.length,
      directJumps,
      surahHits,
      fihristTopicHits,
      allHits: [...allHits],
      arabicHits: [...arabicHits],
      mealHits: [...mealHits],
      wordHits: [...wordHits],
      wordGroups: buildWordGroups(wordHits),
    });

    // Ana iş parçacığına nefes aldır (UI donmasını önler)
    if (isStillScanning) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
}
