import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Clock,
  Compass,
  Delete,
  CornerDownLeft,
  FileText,
  Hash,
  Keyboard,
  Languages,
  LayoutList,
  Loader2,
  Search,
  Sparkles,
  StickyNote,
  Volume2,
  X,
} from 'lucide-react';
import { findMealById, isExtraMealId } from '../config/mealsConfig';
import { Z_LAYERS } from '../config/zLayers';
import { audioQueueService } from '../services/audioQueueService';
import { useBackButtonGuard } from '../services/backStackService';
import { dataService } from '../services/dataService';
import {
  type DirectJumpItem,
  type FihristTopicSearchHit,
  type ProgressiveSearchSnapshot,
  type SearchResultTab,
  type SearchScopeMode,
  type SurahSearchHit,
  type VerseSearchHit,
  type WordSearchHit,
  runProgressiveSearch,
} from '../services/searchService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { formatSafeArabicTitle } from '../utils/arabicUtils';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { formatNumberTr } from '../utils/poolUtils';
import { buildHighlightedSegments, isArabicText } from '../utils/textNormalize';

// ============================================================================
// Özgün Sanal Ekran Klavyesi Dizilimleri (Standart + Alfabetik)
// ============================================================================

const ARABIC_STANDARD_ROWS: readonly (readonly string[])[] = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'د', 'ذ'],
];

const ARABIC_ALPHABETICAL_ROWS: readonly (readonly string[])[] = [
  ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز'],
  ['س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك'],
  ['ل', 'م', 'ن', 'ه', 'و', 'ي', 'ة', 'ى', 'ء', 'أ', 'إ'],
];

const TURKISH_STANDARD_ROWS: readonly (readonly string[])[] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', "'", ':'],
];

const TURKISH_ALPHABETICAL_ROWS: readonly (readonly string[])[] = [
  ['a', 'b', 'c', 'ç', 'd', 'e', 'f', 'g', 'ğ', 'h'],
  ['ı', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'ö', 'p'],
  ['r', 's', 'ş', 't', 'u', 'ü', 'v', 'y', 'z', ':'],
];

const PAGE_CHUNK_SIZE = 30;
const RECENT_SEARCHES_KEY = 'muallimun_recent_searches_v1';
const MAX_RECENT_SEARCHES = 5;

function isDesktopFinePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
}

function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length >= 2)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function writeRecentSearches(items: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Ignore storage quota errors
  }
}

const EXAMPLE_QUERIES: { label: string; value: string; isAr?: boolean }[] = [
  { label: 'Bakara 255', value: 'Bakara 255' },
  { label: 'Yâsîn', value: 'Yâsîn' },
  { label: 'Sayfa 411', value: 'Sayfa 411' },
  { label: 'غفور', value: 'غفور', isAr: true },
  { label: 'رحمن', value: 'رحمن', isAr: true },
  { label: 'sabır', value: 'sabır' },
  { label: 'takva', value: 'takva' },
];

const HighlightedText: React.FC<{
  text: string;
  query: string;
  arabicMode?: boolean;
  includeSubstring?: boolean;
}> = React.memo(({ text, query, arabicMode, includeSubstring = false }) => {
  const segments = useMemo(
    () => buildHighlightedSegments(text, query, arabicMode, includeSubstring),
    [text, query, arabicMode, includeSubstring],
  );

  return (
    <>
      {segments.map((seg, idx) =>
        seg.matched ? (
          <mark
            key={idx}
            className="rounded px-0.5 font-bold"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.28)',
              color: 'inherit',
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        ),
      )}
    </>
  );
});
HighlightedText.displayName = 'HighlightedText';

export const GlobalSearchModal: React.FC = () => {
  const {
    isSearchModalOpen,
    closeSearchModal,
    meta,
    manifest,
    settings,
    audioPrefs,
    poolStats,
    studyProgress,
    navigateToStudy,
    navigateToFihrist,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [scopeMode, setScopeMode] = useState<SearchScopeMode>('all');
  const [selectedJuzNo, setSelectedJuzNo] = useState<number>(30);
  const [selectedSurahNo, setSelectedSurahNo] = useState<number>(49);
  const [activeTab, setActiveTab] = useState<SearchResultTab>('all');
  const [selectedWordGroupKey, setSelectedWordGroupKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_CHUNK_SIZE);
  const [includeSubstring, setIncludeSubstring] = useState<boolean>(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());

  // Sanal Klavye Durumu
  const [showKeyboard, setShowKeyboard] = useState<boolean>(false);
  const [kbLang, setKbLang] = useState<'ar' | 'tr'>('ar');
  const [kbAlphabetical, setKbAlphabetical] = useState<boolean>(true);

  // Anlık dinleme yükleniyor durumu
  const [playingVerseId, setPlayingVerseId] = useState<number | null>(null);

  // Kademeli Arama Sonuç Durumu
  const [snapshot, setSnapshot] = useState<ProgressiveSearchSnapshot | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTokenRef = useRef<number>(0);

  const saveRecentSearch = useCallback((rawTerm: string) => {
    const term = rawTerm.trim();
    if (term.length < 2) return;
    setRecentSearches((prev) => {
      const next = [term, ...prev.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES,
      );
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((term: string) => {
    sfxService.play('click');
    setRecentSearches((prev) => {
      const next = prev.filter((item) => item !== term);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    sfxService.play('click');
    setRecentSearches([]);
    writeRecentSearches([]);
  }, []);

  useBackButtonGuard('global_search_modal', isSearchModalOpen, closeSearchModal);

  // Modal açıldığında yalnızca geniş masaüstü + fare ortamında odaklan & ESC dinle
  useEffect(() => {
    if (!isSearchModalOpen) {
      abortControllerRef.current?.abort();
      return;
    }

    // Aktif okunan sure / cüz bilgilerini kapsam varsayılanlarına senkronize et
    if (studyProgress.lastRead?.surah) {
      setSelectedSurahNo(studyProgress.lastRead.surah);
      const currentSurahMeta = meta?.surahs.find((s) => s.no === studyProgress.lastRead?.surah);
      if (currentSurahMeta?.cuzs[0]) {
        setSelectedJuzNo(currentSurahMeta.cuzs[0]);
      }
    }

    const releaseScrollLock = acquireBodyScrollLock();

    let focusTimer: number | null = null;
    if (isDesktopFinePointer()) {
      focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
    }

    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      releaseScrollLock();
      abortControllerRef.current?.abort();
    };
  }, [isSearchModalOpen, studyProgress.lastRead?.surah, meta]);

  // Seçili kapsama göre taranacak sure listesi
  const { targetSurahs, filterJuzNo } = useMemo(() => {
    if (!meta) return { targetSurahs: [] as number[], filterJuzNo: null as number | null };

    if (scopeMode === 'pool') {
      const list =
        poolStats.effectiveSurahs.length > 0
          ? poolStats.effectiveSurahs
          : meta.surahs.map((s) => s.no);
      return { targetSurahs: list, filterJuzNo: null };
    }

    if (scopeMode === 'juz') {
      const juz = meta.juzs.find((j) => j.no === selectedJuzNo);
      return {
        targetSurahs: juz ? juz.surahs : [],
        filterJuzNo: selectedJuzNo,
      };
    }

    if (scopeMode === 'surah') {
      return {
        targetSurahs: [selectedSurahNo],
        filterJuzNo: null,
      };
    }

    return {
      targetSurahs: meta.surahs.map((s) => s.no),
      filterJuzNo: null,
    };
  }, [meta, scopeMode, poolStats.effectiveSurahs, selectedJuzNo, selectedSurahNo]);

  // Sorgu veya kapsam değiştikçe kademeli (non-blocking) aramayı başlat, öncekini iptal et
  useEffect(() => {
    if (!isSearchModalOpen || !meta) return;

    abortControllerRef.current?.abort();
    searchTokenRef.current += 1;
    const currentToken = searchTokenRef.current;

    const trimmed = query.trim();
    if (!trimmed) {
      setSnapshot(null);
      setSelectedWordGroupKey(null);
      setVisibleCount(PAGE_CHUNK_SIZE);
      return;
    }

    setSelectedWordGroupKey(null);
    setVisibleCount(PAGE_CHUNK_SIZE);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Yazarken aşırı sık tekrar tetiklenmeyi önlemek için kısa debounce (110ms)
    const debounceId = window.setTimeout(() => {
      if (controller.signal.aborted || searchTokenRef.current !== currentToken) return;

      void runProgressiveSearch({
        query: trimmed,
        targetSurahs,
        filterJuzNo,
        preferredMeal: settings.preferredMeal,
        primaryMealId: settings.primaryMealId,
        secondaryMealId: settings.secondaryMealId,
        mealDisplayMode: settings.mealDisplayMode,
        manifest,
        includeSubstring,
        meta,
        signal: controller.signal,
        onProgress: (nextSnap) => {
          if (searchTokenRef.current !== currentToken) return;
          setSnapshot(nextSnap);
        },
      });
    }, 110);

    return () => {
      window.clearTimeout(debounceId);
      controller.abort();
    };
  }, [
    isSearchModalOpen,
    meta,
    manifest,
    query,
    targetSurahs,
    filterJuzNo,
    settings.preferredMeal,
    settings.primaryMealId,
    settings.secondaryMealId,
    settings.mealDisplayMode,
    includeSubstring,
  ]);

  // Sekme değişince görünür sonuç sayacını sıfırla ve yukarı kaydır
  useEffect(() => {
    setVisibleCount(PAGE_CHUNK_SIZE);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab, selectedWordGroupKey]);

  // Sanal klavye tuş girişi (imleç konumuna ekler; mobilde native klavyeyi tetiklemez)
  const insertAtCursor = useCallback((char: string) => {
    sfxService.play('click');
    const el = inputRef.current;
    if (!el) {
      setQuery((prev) => prev + char);
      return;
    }
    const start = el.selectionStart ?? query.length;
    const end = el.selectionEnd ?? query.length;
    const nextValue = query.slice(0, start) + char + query.slice(end);
    setQuery(nextValue);
    if (isDesktopFinePointer()) {
      window.requestAnimationFrame(() => {
        el.focus();
        const nextPos = start + char.length;
        el.setSelectionRange(nextPos, nextPos);
      });
    }
  }, [query]);

  const handleBackspace = useCallback(() => {
    sfxService.play('click');
    const el = inputRef.current;
    if (!el) {
      setQuery((prev) => prev.slice(0, -1));
      return;
    }
    const start = el.selectionStart ?? query.length;
    const end = el.selectionEnd ?? query.length;
    if (start === 0 && end === 0) return;

    let nextValue: string;
    let nextPos: number;
    if (start !== end) {
      nextValue = query.slice(0, start) + query.slice(end);
      nextPos = start;
    } else {
      nextValue = query.slice(0, start - 1) + query.slice(end);
      nextPos = start - 1;
    }
    setQuery(nextValue);
    if (isDesktopFinePointer()) {
      window.requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextPos, nextPos);
      });
    }
  }, [query]);

  // Ayete git (Mushaf veya Kartlar görünümünde)
  const handleJumpToVerse = useCallback(
    (
      surah: number,
      ayah: number,
      page: number,
      viewMode: 'mushaf' | 'cards' = 'mushaf',
    ) => {
      sfxService.play('click');
      saveRecentSearch(query);
      closeSearchModal();
      navigateToStudy({
        viewMode,
        surah,
        ayah,
        page,
        ...(viewMode === 'cards'
          ? { ensureMealVisible: true }
          : { ensureArabicVisible: true }),
      });
    },
    [closeSearchModal, navigateToStudy, query, saveRecentSearch],
  );

  // Konu Fihristi başlığına git
  const handleJumpToFihristTopic = useCallback(
    (topicId: string) => {
      sfxService.play('click');
      saveRecentSearch(query);
      closeSearchModal();
      navigateToFihrist({ subTab: 'topics', topicId });
    },
    [closeSearchModal, navigateToFihrist, query, saveRecentSearch],
  );

  // Doğrudan Git kartı aksiyonu
  const handleDirectJump = useCallback(
    (item: DirectJumpItem) => {
      sfxService.play('click');
      saveRecentSearch(query);
      closeSearchModal();
      navigateToStudy({
        viewMode: 'mushaf',
        surah: item.surah,
        ayah: item.ayah,
        page: item.page,
        ensureArabicVisible: true,
      });
    },
    [closeSearchModal, navigateToStudy, query, saveRecentSearch],
  );

  // Sonuç kartından doğrudan ayeti dinle
  const handleListenVerse = useCallback(
    async (surah: number, ayah: number, verseId: number) => {
      if (!manifest || !meta) return;
      sfxService.play('click');
      setPlayingVerseId(verseId);
      try {
        const bundle = await dataService.getSurahBundle(surah);
        const startIndex = Math.max(
          0,
          bundle.verses.findIndex((v) => v.ayah === ayah),
        );
        audioQueueService.startQueue({
          verses: bundle.verses,
          startIndex,
          context: 'single',
          contextKey: `search-${surah}-${ayah}`,
          manifest,
          meta,
          prefs: audioPrefs,
          singleAyahOnly: true,
        });
      } finally {
        setPlayingVerseId((prev) => (prev === verseId ? null : prev));
      }
    },
    [manifest, meta, audioPrefs],
  );

  // Seçili sekmenin filtrelenmiş listesi ve toplam adedi
  const filteredWordHits = useMemo<WordSearchHit[]>(() => {
    if (!snapshot) return [];
    if (!selectedWordGroupKey) return snapshot.wordHits;
    return snapshot.wordHits.filter(
      (w) => (w.arNorm || w.trNorm) === selectedWordGroupKey,
    );
  }, [snapshot, selectedWordGroupKey]);

  const activeListCount = useMemo(() => {
    if (!snapshot) return 0;
    switch (activeTab) {
      case 'all':
        return snapshot.allHits.length;
      case 'arabic':
        return snapshot.arabicHits.length;
      case 'meal':
        return snapshot.mealHits.length;
      case 'words':
        return filteredWordHits.length;
      case 'surahs':
        return snapshot.surahHits.length;
      case 'topics':
        return snapshot.fihristTopicHits.length;
    }
  }, [snapshot, activeTab, filteredWordHits.length]);

  // Kaydırdıkça otomatik daha fazla sonuç yükle
  const handleResultsScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (visibleCount >= activeListCount) return;
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 220) {
        setVisibleCount((prev) => Math.min(activeListCount, prev + PAGE_CHUNK_SIZE));
      }
    },
    [visibleCount, activeListCount],
  );

  const activeMealScopeLabels = useMemo(() => {
    const labels = ['Arapça', 'TDV', 'DİB Yeni'];
    const extraIds: string[] = [];
    if (isExtraMealId(settings.primaryMealId)) {
      extraIds.push(settings.primaryMealId);
    }
    if (
      settings.mealDisplayMode === 'dual' &&
      isExtraMealId(settings.secondaryMealId) &&
      !extraIds.includes(settings.secondaryMealId)
    ) {
      extraIds.push(settings.secondaryMealId);
    }
    for (const id of extraIds) {
      const def = findMealById(id, manifest);
      if (def?.shortLabel && !labels.includes(def.shortLabel)) {
        labels.push(def.shortLabel);
      }
    }
    return labels;
  }, [settings.primaryMealId, settings.secondaryMealId, settings.mealDisplayMode, manifest]);

  if (!isSearchModalOpen) return null;

  const trimmedQuery = query.trim();
  const inputIsRtl = isArabicText(query) || (showKeyboard && kbLang === 'ar' && !query);
  const progressPct =
    snapshot && snapshot.totalSurahs > 0
      ? Math.round((snapshot.scannedSurahs / snapshot.totalSurahs) * 100)
      : 0;

  const totalFoundAcrossTabs = snapshot
    ? snapshot.allHits.length +
      snapshot.wordHits.length +
      snapshot.surahHits.length +
      snapshot.fihristTopicHits.length
    : 0;

  const tabs: { id: SearchResultTab; label: string; count: number }[] = [
    { id: 'all', label: 'Ayet & Meal', count: snapshot?.allHits.length ?? 0 },
    { id: 'topics', label: 'Konu Fihristi', count: snapshot?.fihristTopicHits.length ?? 0 },
    { id: 'surahs', label: 'Sureler', count: snapshot?.surahHits.length ?? 0 },
    { id: 'words', label: 'Kelime Meali', count: snapshot?.wordHits.length ?? 0 },
    { id: 'meal', label: 'Meal & Dipnot', count: snapshot?.mealHits.length ?? 0 },
    { id: 'arabic', label: 'Arapça Metin', count: snapshot?.arabicHits.length ?? 0 },
  ];

  const keyboardRows =
    kbLang === 'ar'
      ? kbAlphabetical
        ? ARABIC_ALPHABETICAL_ROWS
        : ARABIC_STANDARD_ROWS
      : kbAlphabetical
        ? TURKISH_ALPHABETICAL_ROWS
        : TURKISH_STANDARD_ROWS;

  const renderVerseCard = (hit: VerseSearchHit, mode: 'all' | 'arabic' | 'meal') => {
    const showM1 =
      mode === 'meal'
        ? hit.matchedM1 || (!hit.matchedM2 && hit.matchedFootnotes.every((f) => f.meal !== 'DİB'))
        : settings.preferredMeal === 'm1' || settings.preferredMeal === 'both' || hit.matchedM1;
    const showM2 =
      mode === 'meal'
        ? hit.matchedM2 || settings.preferredMeal === 'm2' || settings.preferredMeal === 'both'
        : settings.preferredMeal === 'm2' || settings.preferredMeal === 'both' || hit.matchedM2;

    const isLoadingAudio = playingVerseId === hit.id;

    return (
      <article
        key={`${mode}-${hit.id}`}
        className="rounded-2xl border p-3.5 sm:p-4 space-y-2.5 transition-colors"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Üst Satır: Sure:Ayet · Cüz · Sayfa + Aksiyonlar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className="font-extrabold px-2.5 py-0.5 rounded-lg tabular-nums"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              {hit.surahNameTr} {hit.surah}:{hit.ayah}
            </span>
            <span
              className="font-semibold px-2 py-0.5 rounded-lg tabular-nums"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-muted)',
              }}
            >
              {hit.cuz}. Cüz · S.{hit.page}
            </span>
            {hit.matchedFootnotes.length > 0 && (
              <span
                className="font-bold px-2 py-0.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                Dipnot Eşleşmesi
              </span>
            )}
            {hit.matchedPersonalNote && (
              <span
                className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <StickyNote className="w-3 h-3 shrink-0" />
                <span>Notum</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleListenVerse(hit.surah, hit.ayah, hit.id)}
              disabled={isLoadingAudio}
              className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              title="Bu ayeti dinle"
            >
              {isLoadingAudio ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              )}
              <span>Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => handleJumpToVerse(hit.surah, hit.ayah, hit.page, 'cards')}
              className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <LayoutList className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Kartlarda Aç</span>
              <span className="sm:hidden">Kart</span>
            </button>

            <button
              type="button"
              onClick={() => handleJumpToVerse(hit.surah, hit.ayah, hit.page, 'mushaf')}
              className="min-h-[34px] px-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Mushaf&apos;ta Aç</span>
              <span className="sm:hidden">Mushaf</span>
            </button>
          </div>
        </div>

        {/* Arapça Ayet Metni */}
        <p
          dir="rtl"
          className="arabic-text text-right leading-loose break-words rounded-xl px-3 py-2"
          style={{
            fontSize: `${Math.min(30, Math.max(22, settings.arabicFontSize - 2))}px`,
            backgroundColor: 'var(--bg-surface-soft)',
            color: 'var(--text-primary)',
          }}
        >
          <HighlightedText
            text={hit.arText}
            query={trimmedQuery}
            arabicMode={true}
            includeSubstring={includeSubstring}
          />
        </p>

        {/* Türkçe Meal(ler) ve Seçili Ek Meal / Tefsir Eşleşmeleri */}
        {(mode !== 'arabic' || (hit.extraMealHits?.some((em) => em.isRtl) ?? false)) && (
          <div className="space-y-1.5">
            {mode !== 'arabic' && showM1 && hit.m1Text && (
              <p
                className="turkish-reading text-xs sm:text-sm leading-relaxed"
                style={{ color: 'var(--text-primary)' }}
              >
                <span
                  className="text-[11px] font-extrabold mr-1.5"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  TDV:
                </span>
                <HighlightedText
                  text={hit.m1Text}
                  query={trimmedQuery}
                  arabicMode={false}
                  includeSubstring={includeSubstring}
                />
              </p>
            )}
            {mode !== 'arabic' && showM2 && hit.m2Text && (
              <p
                className="turkish-reading text-xs sm:text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span
                  className="text-[11px] font-extrabold mr-1.5"
                  style={{ color: 'var(--brand-accent-text)' }}
                >
                  DİB:
                </span>
                <HighlightedText
                  text={hit.m2Text}
                  query={trimmedQuery}
                  arabicMode={false}
                  includeSubstring={includeSubstring}
                />
              </p>
            )}
            {hit.extraMealHits
              ?.filter((em) => (mode === 'arabic' ? em.isRtl : true))
              .map((em) => (
                <div
                  key={em.mealId}
                  className="rounded-xl border px-3 py-2 space-y-1"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <span
                    className="inline-block text-[11px] font-extrabold"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    {em.shortLabel}:
                  </span>
                  <p
                    dir={em.isRtl ? 'rtl' : 'ltr'}
                    lang={em.isRtl ? 'ar' : undefined}
                    className={
                      em.isRtl
                        ? 'text-right leading-[1.95] text-base sm:text-lg'
                        : 'turkish-reading text-xs sm:text-sm leading-relaxed'
                    }
                    style={{
                      color: 'var(--text-primary)',
                      ...(em.isRtl
                        ? { fontFamily: '"Scheherazade New", "Amiri", "Amiri Quran", serif' }
                        : {}),
                    }}
                  >
                    <HighlightedText
                      text={em.text}
                      query={trimmedQuery}
                      arabicMode={em.isRtl}
                      includeSubstring={includeSubstring}
                    />
                  </p>
                </div>
              ))}
          </div>
        )}

        {/* Eşleşen Dipnotlar (fn) */}
        {hit.matchedFootnotes.length > 0 && (
          <div
            className="rounded-xl border px-3 py-2 space-y-1 text-xs"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'rgba(217, 119, 6, 0.28)',
              color: 'var(--text-primary)',
            }}
          >
            {hit.matchedFootnotes.slice(0, 2).map((fn, fIdx) => (
              <p key={fIdx} className="leading-relaxed">
                <span className="font-extrabold mr-1" style={{ color: 'var(--brand-accent-text)' }}>
                  [{fn.meal} Dipnot]:
                </span>
                <HighlightedText
                  text={fn.text}
                  query={trimmedQuery}
                  arabicMode={isArabicText(fn.text)}
                  includeSubstring={includeSubstring}
                />
              </p>
            ))}
          </div>
        )}

        {/* Eşleşen Kişisel Ayet Notu */}
        {hit.matchedPersonalNote && (
          <div
            className="rounded-xl border px-3 py-2 text-xs leading-relaxed"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              borderColor: 'var(--brand-primary)',
              color: 'var(--text-primary)',
            }}
          >
            <span
              className="inline-flex items-center gap-1 font-extrabold mr-1.5"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              <StickyNote className="w-3 h-3 shrink-0" />
              <span>Notunuz:</span>
            </span>
            <HighlightedText
              text={hit.matchedPersonalNote}
              query={trimmedQuery}
              arabicMode={false}
              includeSubstring={includeSubstring}
            />
          </div>
        )}
      </article>
    );
  };

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.MODAL} flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-label="Kur'an, Meal ve Kelime Meali Arama Merkezi"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearchModal();
      }}
    >
      <div
        className="w-full h-[100dvh] max-h-[100dvh] sm:h-[88dvh] sm:max-h-[88dvh] sm:max-w-4xl rounded-none sm:rounded-2xl border-0 sm:border shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* ====================================================================
            1. Üst Arama Giriş Çubuğu + Tek Satırlık Kaydırılabilir Filtre Şeridi
            ==================================================================== */}
        <div
          className="sticky top-0 z-10 px-3 sm:px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pt-3 pb-2 border-b space-y-2 shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="relative flex-1 min-w-0 flex items-center min-h-[44px] rounded-xl border focus-within:ring-2 focus-within:ring-teal-600/35"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-strong)',
              }}
            >
              <Search
                className="w-4 h-4 absolute left-3 pointer-events-none shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <input
                ref={inputRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                dir={inputIsRtl ? 'rtl' : 'ltr'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveRecentSearch(query);
                    if (snapshot?.directJumps[0]) {
                      e.preventDefault();
                      handleDirectJump(snapshot.directJumps[0]);
                    } else if (!isDesktopFinePointer()) {
                      inputRef.current?.blur();
                    }
                  }
                }}
                placeholder="Sure, ayet (2:255), konu veya kelime ara..."
                className="w-full min-w-0 h-[42px] pl-9 pr-20 sm:pr-28 bg-transparent text-sm sm:text-base font-medium outline-none"
                style={{ color: 'var(--text-primary)' }}
              />

              <div className="absolute right-1.5 flex items-center gap-1">
                {/* Temizle (X) */}
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setQuery('');
                      if (isDesktopFinePointer()) {
                        inputRef.current?.focus();
                      }
                    }}
                    aria-label="Aramayı temizle"
                    title="Aramayı temizle"
                    className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer shrink-0 hover:bg-black/5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Sanal Klavye Aç/Kapa */}
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setShowKeyboard((prev) => {
                      const next = !prev;
                      if (next && !isDesktopFinePointer()) {
                        inputRef.current?.blur();
                      } else if (isDesktopFinePointer()) {
                        window.setTimeout(() => inputRef.current?.focus(), 10);
                      }
                      return next;
                    });
                  }}
                  aria-label="Sanal ekran klavyesini aç veya kapat"
                  aria-pressed={showKeyboard}
                  title="Arapça / Türkçe Sanal Klavye"
                  className="h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                  style={{
                    backgroundColor: showKeyboard
                      ? 'var(--brand-primary)'
                      : 'var(--bg-surface)',
                    borderColor: showKeyboard ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: showKeyboard ? '#FFFFFF' : 'var(--text-primary)',
                  }}
                >
                  <Keyboard className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline whitespace-nowrap">Klavye</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={closeSearchModal}
              aria-label="Aramayı kapat"
              title="Aramayı kapat"
              className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <span className="hidden sm:inline">ESC</span>
              <X className="w-5 h-5 sm:hidden" />
            </button>
          </div>

          {/* Kaydırılabilir (Mobil) / Sarılabilir (Masaüstü) Kapsam & Ek/Kök Filtre Şeridi */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-4 py-0.5 md:pr-0 md:flex-wrap md:overflow-visible">
            {(
              [
                { id: 'all', label: "Tüm Kur'an (114)" },
                { id: 'pool', label: `Havuzum (${poolStats.surahCount})` },
                { id: 'surah', label: 'Bu Sure' },
                { id: 'juz', label: 'Bu Cüz' },
              ] as { id: SearchScopeMode; label: string }[]
            ).map((opt) => {
              const active = scopeMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setScopeMode(opt.id);
                  }}
                  className="h-8 px-2.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: active
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}

            {scopeMode === 'surah' && meta && (
              <select
                value={selectedSurahNo}
                onChange={(e) => {
                  sfxService.play('click');
                  setSelectedSurahNo(Number(e.target.value));
                }}
                aria-label="Aranacak sureyi seç"
                className="h-8 max-w-[150px] sm:max-w-[185px] px-2 rounded-lg border text-xs font-bold cursor-pointer shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                {meta.surahs.map((s) => (
                  <option key={s.no} value={s.no}>
                    {s.no}. {s.shortNameTr}
                  </option>
                ))}
              </select>
            )}

            {scopeMode === 'juz' && meta && (
              <select
                value={selectedJuzNo}
                onChange={(e) => {
                  sfxService.play('click');
                  setSelectedJuzNo(Number(e.target.value));
                }}
                aria-label="Aranacak cüzü seç"
                className="h-8 px-2 rounded-lg border text-xs font-bold cursor-pointer shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                {meta.juzs.map((j) => (
                  <option key={j.no} value={j.no}>
                    {j.no}. Cüz
                  </option>
                ))}
              </select>
            )}

            <span
              aria-hidden="true"
              className="w-px h-4 shrink-0 mx-0.5"
              style={{ backgroundColor: 'var(--border-subtle)' }}
            />

            {/* Kompakt Ek/Kök Dahil Toggle Çip */}
            <button
              type="button"
              role="switch"
              aria-checked={includeSubstring}
              onClick={() => {
                sfxService.play('click');
                setIncludeSubstring((prev) => !prev);
              }}
              className="h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              style={{
                backgroundColor: includeSubstring
                  ? 'var(--brand-accent-soft)'
                  : 'var(--bg-surface)',
                borderColor: includeSubstring ? 'var(--brand-accent)' : 'var(--border-subtle)',
                color: includeSubstring ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
              }}
              title="Kelime ortasında geçenleri de dahil et. Kapalıyken yalnızca kelime başı (Arapça'da ال/و/ف/ب/ل ön ek duyarlı) eşleşmeleri gösterir."
            >
              <span>≈ Ek/Kök Dahil</span>
            </button>
          </div>

          {/* Aktif Meal/Tefsir Arama Kapsamı Bilgi Satırı */}
          <p
            className="text-[11px] truncate"
            style={{ color: 'var(--text-muted)' }}
            title={`Arama kapsamı: ${activeMealScopeLabels.join(' · ')}`}
          >
            Arama kapsamı: {activeMealScopeLabels.join(' · ')}
          </p>
        </div>

        {/* ====================================================================
            2. Açılır/Kapanır Özgün Sanal Ekran Klavyesi (العربية / Türkçe + Alfabetik)
            ==================================================================== */}
        {showKeyboard && (
          <div
            className="px-2.5 sm:px-4 py-2.5 border-b space-y-2 shrink-0 select-none"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {/* Klavye Üst Kontrolleri: Dil + Alfabetik Düzen */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="inline-flex p-0.5 rounded-lg border gap-0.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setKbLang('ar');
                    }}
                    className="min-h-[28px] px-2.5 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                    style={{
                      backgroundColor: kbLang === 'ar' ? 'var(--brand-primary)' : 'transparent',
                      color: kbLang === 'ar' ? '#FFFFFF' : 'var(--text-secondary)',
                    }}
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span>العربية</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setKbLang('tr');
                    }}
                    className="min-h-[28px] px-2.5 rounded-md text-xs font-bold cursor-pointer transition-colors"
                    style={{
                      backgroundColor: kbLang === 'tr' ? 'var(--brand-primary)' : 'transparent',
                      color: kbLang === 'tr' ? '#FFFFFF' : 'var(--text-secondary)',
                    }}
                  >
                    Türkçe
                  </button>
                </div>

                {/* Alfabetik Düzen Anahtarı */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={kbAlphabetical}
                  onClick={() => {
                    sfxService.play('click');
                    setKbAlphabetical((v) => !v);
                  }}
                  className="min-h-[30px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: kbAlphabetical
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface)',
                    borderColor: kbAlphabetical ? 'var(--brand-accent)' : 'var(--border-subtle)',
                    color: kbAlphabetical ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <span>Alfabetik Düzen</span>
                  <span
                    className="w-7 h-4 rounded-full p-0.5 flex items-center transition-colors"
                    style={{
                      backgroundColor: kbAlphabetical
                        ? 'var(--brand-accent)'
                        : 'var(--border-strong)',
                      justifyContent: kbAlphabetical ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span className="w-3 h-3 rounded-full bg-white" />
                  </span>
                </button>
              </div>

              <span className="hidden sm:inline text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Harekesiz yazabilirsiniz · tüm harekeli ayetlerle otomatik eşleşir
              </span>
            </div>

            {/* Tuş Satırları (Mobilde %100 taşmasız esnek ızgara) */}
            <div className="space-y-1">
              {keyboardRows.map((row, rIdx) => (
                <div
                  key={rIdx}
                  dir={kbLang === 'ar' ? 'rtl' : 'ltr'}
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                  }}
                >
                  {row.map((keyChar) => (
                    <button
                      key={keyChar}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertAtCursor(keyChar)}
                      className="min-h-[34px] sm:min-h-[36px] rounded-lg border font-bold flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: kbLang === 'ar' ? '16px' : '13px',
                      }}
                    >
                      {keyChar}
                    </button>
                  ))}
                </div>
              ))}

              {/* Alt Kontrol Satırı: Sil, Boşluk, Ara */}
              <div className="grid grid-cols-12 gap-1 pt-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleBackspace}
                  className="col-span-3 min-h-[36px] rounded-lg border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Delete className="w-3.5 h-3.5" />
                  <span>Sil</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertAtCursor(' ')}
                  className="col-span-6 min-h-[36px] rounded-lg border text-xs font-bold flex items-center justify-center cursor-pointer active:scale-95"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Boşluk
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    sfxService.play('click');
                    saveRecentSearch(query);
                    setShowKeyboard(false);
                    if (isDesktopFinePointer()) {
                      inputRef.current?.focus();
                    }
                  }}
                  className="col-span-3 min-h-[36px] rounded-lg text-xs font-extrabold text-white flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                  <span>Ara</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            3. Canlı Kademeli Tarama İlerleme Çubuğu ve 5 Arama Sekmesi
            ==================================================================== */}
        {trimmedQuery && (
          <div
            className="border-b shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {/* İlerleme Durumu */}
            {snapshot && snapshot.totalSurahs > 0 && (
              <div className="px-3.5 sm:px-4 pt-2 pb-1.5 space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                  <span
                    className="flex items-center gap-1.5 tabular-nums"
                    style={{
                      color: snapshot.isScanning
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {snapshot.isScanning && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                    {snapshot.isScanning
                      ? `Taranıyor: ${snapshot.scannedSurahs} / ${snapshot.totalSurahs} Sure · ${formatNumberTr(totalFoundAcrossTabs)} eşleşme bulundu...`
                      : `${snapshot.scannedSurahs} sure tarandı · ${formatNumberTr(snapshot.allHits.length)} ayet, ${formatNumberTr(snapshot.wordHits.length)} kelime eşleşmesi`}
                  </span>
                  {snapshot.isScanning && (
                    <span className="tabular-nums font-bold" style={{ color: 'var(--brand-primary-text)' }}>
                      %{progressPct}
                    </span>
                  )}
                </div>
                {snapshot.isScanning && (
                  <div
                    className="h-1 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{
                        width: `${progressPct}%`,
                        backgroundColor: 'var(--brand-primary)',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 5 Sonuç Sekmesi */}
            <div className="px-3 sm:px-4 py-1.5 pr-6 flex items-center gap-1 overflow-x-auto no-scrollbar md:pr-4 md:flex-wrap md:overflow-visible">
              {tabs.map((t) => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setActiveTab(t.id);
                    }}
                    className="min-h-[34px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary)'
                        : 'var(--bg-surface-soft)',
                      color: active ? '#FFFFFF' : 'var(--text-secondary)',
                    }}
                  >
                    <span>{t.label}</span>
                    <span
                      className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md tabular-nums"
                      style={{
                        backgroundColor: active
                          ? 'rgba(255,255,255,0.22)'
                          : 'var(--bg-surface)',
                        color: active ? '#FFFFFF' : 'var(--text-muted)',
                      }}
                    >
                      {formatNumberTr(t.count)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ====================================================================
            4. Kaydırılabilir Ana Sonuç / Başlangıç Alanı
            ==================================================================== */}
        <div
          ref={scrollContainerRef}
          onScroll={handleResultsScroll}
          onTouchMove={() => {
            if (document.activeElement === inputRef.current) {
              inputRef.current?.blur();
            }
          }}
          className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3"
          style={{ backgroundColor: 'var(--bg-canvas)' }}
        >
          {/* A. BOŞ SORGU: Son Aramalar + Hızlı Geçiş Örnekleri + Ayraçlar + Hızlı Sureler */}
          {!trimmedQuery && meta && (
            <div className="space-y-4">
              {/* Son Aramalar (Varsa, max 5) */}
              {recentSearches.length > 0 && (
                <div
                  className="rounded-2xl border p-3.5 space-y-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-extrabold flex items-center gap-1.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      <span>Son Aramalar</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearRecentSearches}
                      className="text-[11px] font-bold hover:underline cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Temizle
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((term) => (
                      <div
                        key={term}
                        className="inline-flex items-center rounded-xl border overflow-hidden"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setQuery(term);
                            if (isArabicText(term)) setKbLang('ar');
                          }}
                          className="min-h-[34px] pl-3 pr-1.5 text-xs font-bold cursor-pointer"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {term}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRecentSearch(term)}
                          aria-label={`${term} aramasını sil`}
                          className="w-7 h-8 flex items-center justify-center cursor-pointer hover:bg-black/5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hızlı Geçiş & Arama Örnekleri */}
              <div
                className="rounded-2xl border p-3.5 sm:p-4 space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div
                  className="flex items-center gap-1.5 text-xs font-extrabold"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Hızlı Geçiş &amp; Arama Örnekleri</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_QUERIES.map((ex) => (
                    <button
                      key={ex.value}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setQuery(ex.value);
                        if (ex.isAr) setKbLang('ar');
                      }}
                      className="min-h-[36px] px-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors hover:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Ayet no (2:255), sayfa (411), sure anlamı, fihrist konusu veya Arapça/Türkçe
                  kelime arayabilirsiniz.
                </p>
              </div>

              {/* Sayfa Ayraçları (Varsa) */}
              {studyProgress.pageBookmarks.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-extrabold px-1" style={{ color: 'var(--text-muted)' }}>
                    Sayfa Ayraçlarım
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {studyProgress.pageBookmarks.slice(0, 4).map((bm) => {
                      const sMeta = meta.surahs.find((s) => s.no === bm.surah);
                      return (
                        <button
                          key={bm.id}
                          type="button"
                          onClick={() =>
                            handleJumpToVerse(bm.surah, bm.ayah, bm.page, 'mushaf')
                          }
                          className="rounded-xl border p-3 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors hover:border-teal-600/40"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: 'var(--brand-accent-soft)',
                                color: 'var(--brand-accent-text)',
                              }}
                            >
                              <Bookmark className="w-4 h-4 fill-current" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold truncate">{bm.label}</p>
                              <p className="text-[11px] truncate tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                {sMeta?.nameTr ?? `${bm.surah}. Sure`} · Sayfa {bm.page}
                              </p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hızlı Sure Kısayolları */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-extrabold px-1" style={{ color: 'var(--text-muted)' }}>
                  Hızlı Sure Erişimi
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[1, 2, 17, 18, 24, 31, 36, 49].map((sNo) => {
                    const s = meta.surahs.find((x) => x.no === sNo);
                    if (!s) return null;
                    return (
                      <button
                        key={s.no}
                        type="button"
                        onClick={() => handleJumpToVerse(s.no, 1, s.pageStart, 'mushaf')}
                        className="rounded-xl border p-2.5 text-left cursor-pointer transition-colors hover:border-teal-600/40"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="text-[11px] font-extrabold tabular-nums"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            {s.no}. Sure
                          </span>
                          <span className="arabic-title text-sm leading-none">
                            {formatSafeArabicTitle(s.nameAr)}
                          </span>
                        </div>
                        <p className="text-xs font-bold truncate mt-1">{s.shortNameTr}</p>
                        <p className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          {s.ayahCount} ayet · S.{s.pageStart}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* B. DOĞRUDAN GİT KARTLARI (2:255, Bakara 255, Sayfa 411, Cüz 26) */}
          {trimmedQuery && snapshot && snapshot.directJumps.length > 0 && (
            <div className="space-y-1.5">
              {snapshot.directJumps.map((jump) => {
                const Icon =
                  jump.kind === 'page'
                    ? BookOpen
                    : jump.kind === 'juz'
                      ? Compass
                      : Hash;
                return (
                  <button
                    key={jump.id}
                    type="button"
                    onClick={() => handleDirectJump(jump)}
                    className="w-full rounded-2xl border-2 p-3 sm:p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer transition-transform active:scale-[0.995]"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      borderColor: 'var(--brand-primary)',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p
                          className="text-sm font-extrabold truncate"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {jump.title}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {jump.subtitle}
                        </p>
                      </div>
                    </div>
                    <span
                      className="px-3 py-1.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-1 shrink-0 whitespace-nowrap"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <span>{jump.badge}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* C. AKTİF SEKME SONUÇLARI (DOM Korumalı: İlk 30 + Kademeli Artış) */}
          {trimmedQuery && snapshot && (
            <>
              {/* Sekme 1: Ayet & Meal (+ Anlık Sure Anlamı & Konu Fihristi Önerileri) */}
              {activeTab === 'all' && (
                <div className="space-y-3">
                  {/* Anlık Eşleşen Sureler (Ad veya Türkçe Anlam: örn. "örümcek", "bal arısı") */}
                  {snapshot.surahHits.length > 0 && (
                    <div
                      className="rounded-2xl border p-3 space-y-2"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[11px] font-extrabold uppercase tracking-wide flex items-center gap-1.5"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Sure Eşleşmeleri ({snapshot.surahHits.length})</span>
                        </span>
                        {snapshot.surahHits.length > 4 && (
                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setActiveTab('surahs');
                            }}
                            className="text-[11px] font-bold hover:underline cursor-pointer"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            Tümünü gör
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {snapshot.surahHits.slice(0, 4).map((hit) => (
                          <button
                            key={`quick-surah-${hit.surah.no}`}
                            type="button"
                            onClick={() =>
                              handleJumpToVerse(hit.surah.no, 1, hit.surah.pageStart, 'mushaf')
                            }
                            className="rounded-xl border px-3 py-2 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors hover:border-teal-600/45"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="text-[11px] font-extrabold tabular-nums shrink-0"
                                  style={{ color: 'var(--brand-primary-text)' }}
                                >
                                  {hit.surah.no}.
                                </span>
                                <span className="text-xs font-extrabold truncate">
                                  <HighlightedText
                                    text={hit.surah.nameTr}
                                    query={trimmedQuery}
                                    arabicMode={false}
                                    includeSubstring={includeSubstring}
                                  />
                                </span>
                                {hit.meaningTr && (
                                  <span
                                    className="text-[11px] font-semibold truncate"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    (
                                    <HighlightedText
                                      text={hit.meaningTr}
                                      query={trimmedQuery}
                                      arabicMode={false}
                                      includeSubstring={true}
                                    />
                                    )
                                  </span>
                                )}
                              </div>
                              <p
                                className="text-[10px] tabular-nums mt-0.5"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {hit.surah.type} · {hit.surah.ayahCount} ayet · S.{hit.surah.pageStart}
                              </p>
                            </div>
                            <ArrowRight
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color: 'var(--brand-primary-text)' }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Konu Fihristi Eşleşmeleri (İlk 8 Konu -> Doğrudan Fihrist Sekmesine Açılır) */}
                  {snapshot.fihristTopicHits.length > 0 && (
                    <div
                      className="rounded-2xl border p-3 space-y-2"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[11px] font-extrabold uppercase tracking-wide flex items-center gap-1.5"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          <Compass className="w-3.5 h-3.5" />
                          <span>Konu Fihristi ({snapshot.fihristTopicHits.length})</span>
                        </span>
                        {snapshot.fihristTopicHits.length > 8 && (
                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setActiveTab('topics');
                            }}
                            className="text-[11px] font-bold hover:underline cursor-pointer"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            Tümünü gör
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {snapshot.fihristTopicHits.slice(0, 8).map((hit) => (
                          <button
                            key={`quick-topic-${hit.topic.id}`}
                            type="button"
                            onClick={() => handleJumpToFihristTopic(hit.topic.id)}
                            className="min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors hover:border-teal-600/50"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <span className="truncate max-w-[200px] sm:max-w-[260px]">
                              <HighlightedText
                                text={hit.topic.title}
                                query={trimmedQuery}
                                arabicMode={false}
                                includeSubstring={true}
                              />
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums shrink-0"
                              style={{
                                backgroundColor: 'var(--brand-primary-soft)',
                                color: 'var(--brand-primary-text)',
                              }}
                            >
                              {hit.ayahCount} ayet
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {snapshot.allHits.slice(0, visibleCount).map((hit) =>
                      renderVerseCard(hit, 'all'),
                    )}
                  </div>
                </div>
              )}

              {/* Sekme 2: Sadece Arapça Metin */}
              {activeTab === 'arabic' && (
                <div className="space-y-2.5">
                  {snapshot.arabicHits.slice(0, visibleCount).map((hit) =>
                    renderVerseCard(hit, 'arabic'),
                  )}
                </div>
              )}

              {/* Sekme 3: Meal & Dipnot */}
              {activeTab === 'meal' && (
                <div className="space-y-2.5">
                  {snapshot.mealHits.slice(0, visibleCount).map((hit) =>
                    renderVerseCard(hit, 'meal'),
                  )}
                </div>
              )}

              {/* Sekme 4: Kelime Meali (Kelime Fihristi) */}
              {activeTab === 'words' && (
                <div className="space-y-3">
                  {/* Kelime Özeti Grup Çipleri */}
                  {snapshot.wordGroups.length > 0 && (
                    <div
                      className="rounded-2xl border p-3 space-y-2"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                        <span style={{ color: 'var(--text-muted)' }}>
                          Kelime Fihristi Grupları ({formatNumberTr(snapshot.wordGroups.length)} tekil kelime)
                        </span>
                        {selectedWordGroupKey && (
                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setSelectedWordGroupKey(null);
                            }}
                            className="font-extrabold underline cursor-pointer"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            Filtreyi Temizle
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setSelectedWordGroupKey(null);
                          }}
                          className="min-h-[30px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors"
                          style={{
                            backgroundColor:
                              selectedWordGroupKey === null
                                ? 'var(--brand-primary)'
                                : 'var(--bg-surface-soft)',
                            borderColor:
                              selectedWordGroupKey === null
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                            color:
                              selectedWordGroupKey === null ? '#FFFFFF' : 'var(--text-secondary)',
                          }}
                        >
                          Tümü ({formatNumberTr(snapshot.wordHits.length)})
                        </button>

                        {snapshot.wordGroups.slice(0, 40).map((grp) => {
                          const isSelected = selectedWordGroupKey === grp.groupKey;
                          return (
                            <button
                              key={grp.groupKey}
                              type="button"
                              onClick={() => {
                                sfxService.play('click');
                                setSelectedWordGroupKey(isSelected ? null : grp.groupKey);
                              }}
                              className="min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                              style={{
                                backgroundColor: isSelected
                                  ? 'var(--brand-primary-soft)'
                                  : 'var(--bg-surface-soft)',
                                borderColor: isSelected
                                  ? 'var(--brand-primary)'
                                  : 'var(--border-subtle)',
                                color: isSelected
                                  ? 'var(--brand-primary-text)'
                                  : 'var(--text-primary)',
                              }}
                            >
                              <span dir="rtl" className="arabic-text text-sm leading-none">
                                {grp.arDisplay}
                              </span>
                              {grp.trDisplay && (
                                <span
                                  className="text-[11px] font-semibold max-w-[120px] truncate"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  ({grp.trDisplay})
                                </span>
                              )}
                              <span
                                className="text-[10px] font-extrabold tabular-nums"
                                style={{ color: 'var(--brand-accent-text)' }}
                              >
                                · {grp.count} kez
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Eşleşen Kelime Geçişleri Listesi */}
                  <div className="space-y-2">
                    {filteredWordHits.slice(0, visibleCount).map((hit) => {
                      const isLoadingAudio = playingVerseId === hit.verseId;
                      return (
                        <article
                          key={hit.key}
                          className="rounded-2xl border p-3.5 space-y-2"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {/* Arapça Kelime ↔ Türkçe Kelime Anlamı */}
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span
                                dir="rtl"
                                className="arabic-text text-lg sm:text-xl font-bold px-2.5 py-1 rounded-xl leading-none"
                                style={{
                                  backgroundColor: 'var(--brand-primary-soft)',
                                  color: 'var(--brand-primary-text)',
                                }}
                              >
                                <HighlightedText
                                  text={hit.arWord}
                                  query={trimmedQuery}
                                  arabicMode={true}
                                  includeSubstring={includeSubstring}
                                />
                              </span>
                              <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                                ↔
                              </span>
                              <span
                                className="text-xs sm:text-sm font-extrabold px-2.5 py-1 rounded-xl"
                                style={{
                                  backgroundColor: 'var(--brand-accent-soft)',
                                  color: 'var(--brand-accent-text)',
                                }}
                              >
                                <HighlightedText
                                  text={hit.trWord}
                                  query={trimmedQuery}
                                  arabicMode={false}
                                  includeSubstring={includeSubstring}
                                />
                              </span>
                            </div>

                            {/* Sure:Ayet + Aksiyonlar */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className="text-[11px] font-bold px-2 py-1 rounded-lg tabular-nums"
                                style={{
                                  backgroundColor: 'var(--bg-surface-soft)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {hit.surahNameTr} {hit.surah}:{hit.ayah} (S.{hit.page})
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleListenVerse(hit.surah, hit.ayah, hit.verseId)
                                }
                                disabled={isLoadingAudio}
                                aria-label="Ayeti dinle"
                                className="min-w-[32px] min-h-[32px] rounded-lg border flex items-center justify-center cursor-pointer"
                                style={{
                                  backgroundColor: 'var(--bg-surface-soft)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--brand-primary-text)',
                                }}
                              >
                                {isLoadingAudio ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleJumpToVerse(hit.surah, hit.ayah, hit.page, 'cards')
                                }
                                className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                style={{ backgroundColor: 'var(--brand-primary)' }}
                              >
                                <span>Ayete Git</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Ayet Önizlemesi */}
                          <p
                            dir="rtl"
                            className="arabic-text text-right text-base sm:text-lg leading-relaxed truncate"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {hit.arVerseText}
                          </p>
                          {hit.mealPreview && (
                            <p
                              className="text-xs leading-relaxed line-clamp-2"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {hit.mealPreview}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sekme 5: Sureler */}
              {activeTab === 'surahs' && (
                <div className="space-y-2">
                  {snapshot.surahHits.slice(0, visibleCount).map((hit: SurahSearchHit) => (
                    <article
                      key={hit.surah.no}
                      className="rounded-2xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="text-xs font-extrabold px-2 py-0.5 rounded-lg tabular-nums"
                            style={{
                              backgroundColor: 'var(--brand-primary-soft)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            {hit.surah.no}
                          </span>
                          <h4 className="text-sm sm:text-base font-extrabold">
                            <HighlightedText
                              text={hit.surah.nameTr}
                              query={trimmedQuery}
                              arabicMode={false}
                              includeSubstring={includeSubstring}
                            />
                          </h4>
                          {hit.meaningTr && (
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-lg"
                              style={{
                                backgroundColor:
                                  hit.matchedField === 'meaning'
                                    ? 'var(--brand-accent-soft)'
                                    : 'var(--bg-surface-soft)',
                                color:
                                  hit.matchedField === 'meaning'
                                    ? 'var(--brand-accent-text)'
                                    : 'var(--text-secondary)',
                              }}
                            >
                              <HighlightedText
                                text={hit.meaningTr}
                                query={trimmedQuery}
                                arabicMode={false}
                                includeSubstring={true}
                              />
                            </span>
                          )}
                          <span className="arabic-title text-lg leading-none">
                            <HighlightedText
                              text={formatSafeArabicTitle(hit.surah.nameAr)}
                              query={trimmedQuery}
                              arabicMode={true}
                              includeSubstring={includeSubstring}
                            />
                          </span>
                          <span
                            className="text-[11px] font-semibold tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {hit.surah.type} · {hit.surah.ayahCount} ayet · S.{hit.surah.pageStart}
                          </span>
                        </div>
                        {hit.snippet && (
                          <p
                            className="text-xs leading-relaxed line-clamp-2"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <HighlightedText
                              text={hit.snippet}
                              query={trimmedQuery}
                              arabicMode={false}
                              includeSubstring={hit.matchedField === 'meaning' || includeSubstring}
                            />
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleJumpToVerse(hit.surah.no, 1, hit.surah.pageStart, 'cards')
                          }
                          className="min-h-[36px] px-3 rounded-xl border text-xs font-bold cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          Kartlarda Aç
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleJumpToVerse(hit.surah.no, 1, hit.surah.pageStart, 'mushaf')
                          }
                          className="min-h-[36px] px-3 rounded-xl text-xs font-bold text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Mushaf&apos;ta Aç</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* Sekme 6: Konu Fihristi */}
              {activeTab === 'topics' && (
                <div className="space-y-2">
                  {snapshot.fihristTopicHits
                    .slice(0, visibleCount)
                    .map((hit: FihristTopicSearchHit) => (
                      <article
                        key={hit.topic.id}
                        className="rounded-2xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="w-7 h-7 rounded-lg text-xs font-extrabold inline-flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: 'var(--brand-primary-soft)',
                                color: 'var(--brand-primary-text)',
                              }}
                            >
                              {hit.topic.letter}
                            </span>
                            <h4 className="text-sm sm:text-base font-extrabold">
                              <HighlightedText
                                text={hit.topic.title}
                                query={trimmedQuery}
                                arabicMode={false}
                                includeSubstring={true}
                              />
                            </h4>
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded-lg tabular-nums"
                              style={{
                                backgroundColor: 'var(--bg-surface-soft)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {hit.topic.refs.length} referans · {hit.ayahCount} ayet
                            </span>
                          </div>
                          {hit.topic.tags && hit.topic.tags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              {hit.topic.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                                  style={{
                                    backgroundColor:
                                      hit.matchedTag === tag
                                        ? 'var(--brand-accent-soft)'
                                        : 'var(--bg-surface-soft)',
                                    color:
                                      hit.matchedTag === tag
                                        ? 'var(--brand-accent-text)'
                                        : 'var(--text-muted)',
                                  }}
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleJumpToFihristTopic(hit.topic.id)}
                          className="min-h-[36px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          <Compass className="w-3.5 h-3.5" />
                          <span>Konuyu Aç</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </article>
                    ))}
                </div>
              )}

              {/* Boş Sonuç Durumu (+ Diğer sekmelerde eşleşme varsa tek tıkla geçiş) */}
              {activeListCount === 0 &&
                !(
                  activeTab === 'all' &&
                  (snapshot.surahHits.length > 0 || snapshot.fihristTopicHits.length > 0)
                ) &&
                !snapshot.isScanning && (
                <div
                  className="rounded-2xl border p-8 text-center space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <FileText className="w-7 h-7 mx-auto" style={{ color: 'var(--text-muted)' }} />
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold">
                      Bu sekmede &ldquo;{trimmedQuery}&rdquo; için eşleşme bulunamadı
                    </p>
                    <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
                      {trimmedQuery.length < 2
                        ? 'Tam metin ve kelime araması için en az 2 harf yazın.'
                        : 'Diğer sekmeleri kontrol edebilir veya arama kapsamını Tüm Kur’an (114 Sure) olarak genişletebilirsiniz.'}
                    </p>
                  </div>
                  {tabs.some((t) => t.id !== activeTab && t.count > 0) && (
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {tabs
                        .filter((t) => t.id !== activeTab && t.count > 0)
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setActiveTab(t.id);
                            }}
                            className="min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            style={{
                              backgroundColor: 'var(--brand-primary-soft)',
                              borderColor: 'var(--brand-primary)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            <span>
                              {t.label} ({formatNumberTr(t.count)} sonuç)
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Daha Fazla Sonuç Göster (+30) */}
              {visibleCount < activeListCount && (
                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setVisibleCount((prev) => Math.min(activeListCount, prev + PAGE_CHUNK_SIZE));
                    }}
                    className="min-h-[42px] px-5 rounded-xl border text-xs sm:text-sm font-extrabold cursor-pointer transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--brand-primary)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    Daha Fazla Sonuç Göster (+
                    {Math.min(PAGE_CHUNK_SIZE, activeListCount - visibleCount)}) ·{' '}
                    {formatNumberTr(visibleCount)} / {formatNumberTr(activeListCount)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
