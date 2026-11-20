import { dataService } from './dataService';
import type { MetaData, SurahMeta, WordSurahFile } from '../types/quran';
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

export type SearchResultTab = 'all' | 'arabic' | 'meal' | 'words' | 'surahs';

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
  matchedField: 'name' | 'topic';
  snippet: string;
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
  matchedFootnotes: { meal: 'TDV' | 'DİB'; text: string }[];
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
 * meta.json üzerinden 0ms içinde sure isimleri, Arapça adları ve konuları içinde arama yapar.
 */
export function searchSurahsInstant(
  rawQuery: string,
  meta: MetaData,
  includeSubstring = false,
): SurahSearchHit[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const arabicQ = isArabicText(q);
  const normQ = arabicQ ? normalizeArabic(q) : normalizeTurkish(q);
  if (!normQ) return [];

  const hits: SurahSearchHit[] = [];

  for (const s of meta.surahs) {
    if (arabicQ) {
      if (matchesNormalizedText(normalizeArabic(s.nameAr), normQ, true, includeSubstring)) {
        hits.push({
          surah: s,
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
        matchedField: 'name',
        snippet: s.konusu || s.hakkinda || `${s.type} · ${s.ayahCount} ayet`,
      });
      continue;
    }

    if (normQ.length >= 2) {
      const topicText = s.konusu || '';
      const aboutText = s.hakkinda || '';
      if (matchesNormalizedText(normalizeTurkish(topicText), normQ, false, includeSubstring)) {
        hits.push({
          surah: s,
          matchedField: 'topic',
          snippet: topicText,
        });
      } else if (
        matchesNormalizedText(normalizeTurkish(aboutText), normQ, false, includeSubstring)
      ) {
        hits.push({
          surah: s,
          matchedField: 'topic',
          snippet: aboutText,
        });
      }
    }
  }

  return hits;
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
  includeSubstring?: boolean;
  meta: MetaData;
  signal: AbortSignal;
  onProgress: (snapshot: ProgressiveSearchSnapshot) => void;
}

/**
 * Seçili sureleri 10'arlı paketler halinde (batched async) tarayarak ana iş parçacığını
 * kilitlemeden ve her pakette sonuçları akıtarak tüm Kur'an / Meal / Dipnot / Kelime araması yapar.
 */
export async function runProgressiveSearch(
  options: RunProgressiveSearchOptions,
): Promise<void> {
  const {
    query,
    targetSurahs,
    filterJuzNo,
    preferredMeal,
    includeSubstring = false,
    meta,
    signal,
    onProgress,
  } = options;
  const trimmed = query.trim();

  const directJumps = parseDirectReferences(trimmed, meta);
  const surahHits = searchSurahsInstant(trimmed, meta, includeSubstring);
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

  // 0ms anlık başlangıç bildirimi (Sureler ve Doğrudan Git hemen görünür)
  if (!signal.aborted) {
    onProgress({
      query: trimmed,
      isArabicQuery: arabicMode,
      isScanning: true,
      scannedSurahs: 0,
      totalSurahs: targetSurahs.length,
      directJumps,
      surahHits,
      allHits: [],
      arabicHits: [],
      mealHits: [],
      wordHits: [],
      wordGroups: [],
    });
  }

  let scanned = 0;

  for (let offset = 0; offset < targetSurahs.length; offset += BATCH_SIZE) {
    if (signal.aborted) return;

    const batchSurahs = targetSurahs.slice(offset, offset + BATCH_SIZE);
    const indexedBatch = await Promise.all(
      batchSurahs.map((sNo) =>
        getOrIndexSurah(sNo).catch(() => ({ surahNo: sNo, verses: [] }) as IndexedSurahEntry),
      ),
    );

    if (signal.aborted) return;

    for (const surahEntry of indexedBatch) {
      const sMeta = surahMetaMap.get(surahEntry.surahNo);
      const surahNameTr = sMeta?.nameTr ?? `${surahEntry.surahNo}. Sure`;
      const surahNameAr = sMeta?.nameAr ?? '';

      for (const verse of surahEntry.verses) {
        if (filterJuzNo && verse.cuz !== filterJuzNo) continue;

        let matchedArabic = false;
        let matchedM1 = false;
        let matchedM2 = false;
        const matchedFootnotes: { meal: 'TDV' | 'DİB'; text: string }[] = [];

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

        const matchedMealOrFn = matchedM1 || matchedM2 || matchedFootnotes.length > 0;
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
          };
          allHits.push(hit);
          if (matchedArabic) arabicHits.push(hit);
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
