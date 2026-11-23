import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BookOpen,
  Info,
  Languages,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { useTajweedData } from '../../hooks/useTajweedData';
import { audioQueueService } from '../../services/audioQueueService';
import { dataService } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import type { SurahExtraInfo } from '../../types/fihrist';
import type {
  AppSettings,
  BesmeleInfo,
  BookContentMode,
  CombinedVerse,
  SurahBundle,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { formatSafeArabicTitle } from '../../utils/arabicUtils';
import { formatNumberTr, normalizeTurkish } from '../../utils/poolUtils';
import { SyncedVerseArabic } from './SyncedArabicText';
import { VerseCard } from './VerseCard';

interface VerseCardsViewProps {
  surahBundle: SurahBundle;
  besmele: BesmeleInfo;
  settings: AppSettings;
  wordMode: WordMealMode;
  contentMode?: BookContentMode;
  mealAudioFocusOnly?: boolean;
  bookmarkedSet: Set<number>;
  playingAyahId: number | null;
  jumpToAyahNo: number | null;
  jumpNonce: number;
  navResetNonce?: number;
  onToggleBookmark: (ayahId: number) => void;
  onChangeWordMode: (mode: WordMealMode) => void;
  onPlayFromVerse: (verse: CombinedVerse) => void;
  onPlayMealFromVerse: (verse: CombinedVerse) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenPageInMushaf: (pageNo: number, ayahId: number) => void;
  onOpenSurahInfo?: (surahMeta: SurahMeta) => void;
}

type CardFilterMode = 'all' | 'bookmarked' | 'footnotes' | 'merged';

const BATCH_SIZE = 30;

export const VerseCardsView: React.FC<VerseCardsViewProps> = ({
  surahBundle,
  besmele,
  settings,
  wordMode,
  contentMode = 'interleaved',
  mealAudioFocusOnly = false,
  bookmarkedSet,
  playingAyahId,
  jumpToAyahNo,
  jumpNonce,
  navResetNonce = 0,
  onToggleBookmark,
  onChangeWordMode,
  onPlayFromVerse,
  onPlayMealFromVerse,
  onShareVerse,
  onOpenPageInMushaf,
  onOpenSurahInfo,
}) => {
  const { surahMeta, verses, hasBesmele } = surahBundle;
  const effectiveContentMode: BookContentMode =
    settings.readerContentMode === 'ar_only'
      ? 'ar_only'
      : settings.readerContentMode === 'meal_only'
        ? 'meal_only'
        : contentMode === 'ar_only' || contentMode === 'meal_only'
          ? contentMode
          : 'interleaved';
  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const isBesmelePhase = audioState.activePhase === 'besmele';
  const isBesmelePlaying = Boolean(
    playingAyahId && verses[0]?.id === playingAyahId && isBesmelePhase,
  );
  const softPlayingBg =
    settings.theme === 'dark' ? 'rgba(45, 212, 191, 0.13)' : 'rgba(13, 148, 136, 0.10)';
  const surahNos = useMemo(() => [surahMeta.no], [surahMeta.no]);
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(surahNos);

  const {
    rules: tjRules,
    besmele: tjBesmele,
    getVerseWords: getTjVerseWords,
  } = useTajweedData(surahNos, settings.tajweedEnabled);

  const [isFilterBarOpen, setIsFilterBarOpen] = useState(false);
  const [isWordMenuOpen, setIsWordMenuOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<CardFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [surahExtraInfo, setSurahExtraInfo] = useState<SurahExtraInfo | null>(null);
  const wordMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    dataService
      .getSurahInfoExtrasMap()
      .then((map) => {
        if (!cancelled) {
          setSurahExtraInfo(map.get(surahMeta.no) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setSurahExtraInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [surahMeta.no]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Sure değişince veya dışarıdan yeni yönlendirme (Meal Oku vb.) gelince filtre ve batch sıfırla
  useEffect(() => {
    setFilterMode('all');
    setSearchQuery('');
    setVisibleCount(BATCH_SIZE);
    setIsFilterBarOpen(false);
    setIsWordMenuOpen(false);
  }, [surahMeta.no, navResetNonce]);

  // Kelime meali hızlı menüsü dış tıklama / Escape kapatma
  useEffect(() => {
    if (!isWordMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (wordMenuRef.current && !wordMenuRef.current.contains(e.target as Node)) {
        setIsWordMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWordMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [isWordMenuOpen]);

  // Filtre sayıları
  const counts = useMemo(() => {
    let bookmarked = 0;
    let footnotes = 0;
    let merged = 0;

    for (const v of verses) {
      if (bookmarkedSet.has(v.id)) bookmarked += 1;
      const pVerse = getPrimaryVerse(v);
      const sVerse = isDual ? getSecondaryVerse(v) : null;
      const hasFn =
        (pVerse?.fn && pVerse.fn.length > 0) || (sVerse?.fn && sVerse.fn.length > 0);
      if (hasFn) footnotes += 1;
      if (pVerse?.mg || sVerse?.mg) merged += 1;
    }

    return {
      all: verses.length,
      bookmarked,
      footnotes,
      merged,
    };
  }, [verses, bookmarkedSet, getPrimaryVerse, getSecondaryVerse, isDual]);

  const filteredVerses = useMemo(() => {
    const norm = normalizeTurkish(searchQuery);

    return verses.filter((v) => {
      const pVerse = getPrimaryVerse(v);
      const sVerse = isDual ? getSecondaryVerse(v) : null;
      if (filterMode === 'bookmarked' && !bookmarkedSet.has(v.id)) return false;
      if (filterMode === 'footnotes') {
        const hasFn =
          (pVerse?.fn && pVerse.fn.length > 0) || (sVerse?.fn && sVerse.fn.length > 0);
        if (!hasFn) return false;
      }
      if (filterMode === 'merged' && !pVerse?.mg && !sVerse?.mg) return false;

      if (!norm) return true;
      const haystack = normalizeTurkish(
        `${v.ayah} ${pVerse?.t ?? ''} ${sVerse?.t ?? ''}`,
      );
      return haystack.includes(norm);
    });
  }, [verses, filterMode, bookmarkedSet, searchQuery, getPrimaryVerse, getSecondaryVerse, isDual]);

  // Kademeli yükleme (IntersectionObserver ile 30'ar ayet)
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleCount >= filteredVerses.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => Math.min(filteredVerses.length, prev + BATCH_SIZE));
        }
      },
      { rootMargin: '320px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, filteredVerses.length]);

  // "Ayet'e Git" veya çalan ayete anında genişletip kaydırma
  useEffect(() => {
    if (!jumpToAyahNo) return;
    if (jumpToAyahNo === 1) {
      const timer = window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 40);
      return () => window.clearTimeout(timer);
    }

    const sourceList = filteredVerses.some((v) => v.ayah === jumpToAyahNo)
      ? filteredVerses
      : verses;
    const idx = sourceList.findIndex((v) => v.ayah === jumpToAyahNo);
    if (idx === -1) return;

    if (idx >= visibleCount) {
      setVisibleCount(Math.min(sourceList.length, idx + 10));
    }

    const targetVerse = sourceList[idx];
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`verse-card-${targetVerse.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToAyahNo, jumpNonce, surahMeta.no]);

  // Sesli oynatma sırasında aktif ayet visibleCount dışındaysa anında genişlet
  useEffect(() => {
    if (!playingAyahId) return;
    const idx = filteredVerses.findIndex((v) => v.id === playingAyahId);
    if (idx !== -1 && idx >= visibleCount) {
      setVisibleCount(Math.min(filteredVerses.length, idx + 10));
    }
  }, [playingAyahId, filteredVerses, visibleCount]);

  const displayedVerses = useMemo(
    () => filteredVerses.slice(0, visibleCount),
    [filteredVerses, visibleCount],
  );

  const hasActiveFilter = searchQuery.trim().length > 0 || filterMode !== 'all';
  const showFilterBar = isFilterBarOpen || hasActiveFilter;
  const pageSpanLabel =
    surahMeta.pageStart === surahMeta.pageEnd
      ? `Sayfa ${surahMeta.pageStart}`
      : `Sayfa ${surahMeta.pageStart}–${surahMeta.pageEnd}`;

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* Tek Satır Zarif Sure Başlığı + Açılır Arama/Filtre */}
      <div className="surface-card rounded-2xl">
        {/* Ana Satır: Sure Bilgisi (Sol) + Kompakt Aksiyon Grubu (Sağ) */}
        <div className="px-3.5 py-2.5 sm:px-5 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-extrabold text-xs tabular-nums shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              {surahMeta.no}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                  {surahMeta.nameTr}
                </h2>
                <span
                  className="arabic-title text-base sm:text-lg leading-none shrink-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {formatSafeArabicTitle(surahMeta.nameAr)}
                </span>
              </div>
              <p
                className="text-[11px] tabular-nums truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {surahMeta.type} · {formatNumberTr(surahMeta.ayahCount)} Ayet · İniş:{' '}
                {surahMeta.nuzulSirasi} · {pageSpanLabel}
              </p>
            </div>
          </div>

          {/* Sağ Kompakt Aksiyon Grubu: Arama/Filtre · Kelime Meali · Sure Tanıtımı */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. Sure İçi Arama & Filtre Aç/Kapa */}
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsFilterBarOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    window.setTimeout(() => searchInputRef.current?.focus(), 40);
                  }
                  return next;
                });
              }}
              aria-expanded={showFilterBar}
              aria-label="Sure içi arama ve filtreler"
              title="Sure içi arama ve filtreler (Yıldızlı, Dipnotlu, Birleşik)"
              className="relative h-9 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              style={{
                backgroundColor:
                  showFilterBar || hasActiveFilter
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                borderColor:
                  showFilterBar || hasActiveFilter
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                color:
                  showFilterBar || hasActiveFilter
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-secondary)',
              }}
            >
              {hasActiveFilter ? (
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Search className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="hidden md:inline whitespace-nowrap">Ara / Filtre</span>
              {hasActiveFilter && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                />
              )}
            </button>

            {/* 2. Kelime Meali Hızlı Anahtarı (Kapalı / Açık / Kendini Dene — Sadece Meal modunda gizli) */}
            {settings.wordByWordEnabled && effectiveContentMode !== 'meal_only' && (
              <div ref={wordMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setIsWordMenuOpen((v) => !v);
                  }}
                  aria-expanded={isWordMenuOpen}
                  aria-label="Kelime meali görünümü"
                  title="Kelime Meali: Kapalı / Açık / Kendini Dene"
                  className="h-9 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor:
                      wordMode === 'quiz'
                        ? 'var(--brand-accent-soft)'
                        : wordMode === 'visible'
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface-soft)',
                    borderColor:
                      wordMode === 'quiz'
                        ? 'rgba(217, 119, 6, 0.45)'
                        : wordMode === 'visible'
                          ? 'var(--brand-primary)'
                          : 'var(--border-subtle)',
                    color:
                      wordMode === 'quiz'
                        ? 'var(--brand-accent-text)'
                        : wordMode === 'visible'
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-secondary)',
                  }}
                >
                  <Languages className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">
                    {wordMode === 'off'
                      ? 'Kelime'
                      : wordMode === 'visible'
                        ? 'Kelime: Açık'
                        : 'Kendini Dene'}
                  </span>
                </button>

                {isWordMenuOpen && (
                  <div
                    className="absolute right-0 top-11 z-40 w-48 rounded-2xl border shadow-2xl p-1.5 space-y-0.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    <p
                      className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Kelime Meali
                    </p>
                    {(
                      [
                        { id: 'off', label: 'Kapalı', desc: 'Yalnızca ayet metni' },
                        { id: 'visible', label: 'Açık', desc: 'Tüm kelime anlamları' },
                        { id: 'quiz', label: 'Kendini Dene', desc: 'Dokunarak kontrol et' },
                      ] as { id: WordMealMode; label: string; desc: string }[]
                    ).map((opt) => {
                      const active = wordMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            onChangeWordMode(opt.id);
                            setIsWordMenuOpen(false);
                          }}
                          className="w-full px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? opt.id === 'quiz'
                                ? 'var(--brand-accent-soft)'
                                : 'var(--brand-primary-soft)'
                              : 'transparent',
                          }}
                        >
                          <span
                            className="block text-xs font-extrabold"
                            style={{
                              color: active
                                ? opt.id === 'quiz'
                                  ? 'var(--brand-accent-text)'
                                  : 'var(--brand-primary-text)'
                                : 'var(--text-primary)',
                            }}
                          >
                            {opt.label}
                          </span>
                          <span
                            className="block text-[10px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. Sure Tanıtımı (SurahInfoModal'ı açar) */}
            {onOpenSurahInfo && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onOpenSurahInfo(surahMeta);
                }}
                aria-label="Sure tanıtımını aç"
                title="Sure hakkında, nüzul bilgisi ve konusu"
                className="h-9 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors hover:border-teal-600/50 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Tanıtım</span>
              </button>
            )}
          </div>
        </div>

        {/* Açılır / Kapanır Sure İçi Arama & Filtre Paneli */}
        {showFilterBar && (
          <div
            className="px-3.5 py-2.5 sm:px-5 border-t flex flex-col md:flex-row md:items-center gap-2 rounded-b-2xl"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleCount(BATCH_SIZE);
                }}
                placeholder={`${surahMeta.shortNameTr} mealinde kelime veya ayet no ara...`}
                className="w-full min-h-[36px] pl-9 pr-8 rounded-xl border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/40"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Aramayı temizle"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Tümü (${counts.all})` },
                  { id: 'bookmarked', label: `Yıldızlı (${counts.bookmarked})` },
                  { id: 'footnotes', label: `Dipnotlu (${counts.footnotes})` },
                  { id: 'merged', label: `Birleşik (${counts.merged})` },
                ] as const
              ).map((chip) => {
                const active = filterMode === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setFilterMode(chip.id);
                      setVisibleCount(BATCH_SIZE);
                    }}
                    className="min-h-[34px] px-2.5 sm:px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
                    style={{
                      backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: active ? '#FFFFFF' : 'var(--text-secondary)',
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* İnce Quiz İpucu (Yalnızca Kendini Dene aktifken ve Arapça görünürken) */}
        {settings.wordByWordEnabled &&
          effectiveContentMode !== 'meal_only' &&
          wordMode === 'quiz' && (
            <div
              className="px-3.5 py-1.5 sm:px-5 border-t flex items-center justify-between gap-2 text-[11px] font-semibold"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'rgba(217, 119, 6, 0.25)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <span>Kendini Dene aktif — Türkçe anlamı görmek için kelimelere dokunun.</span>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onChangeWordMode('off');
                }}
                className="underline font-bold cursor-pointer shrink-0"
              >
                Kapat
              </button>
            </div>
          )}

        {/* Zarif Besmele Şeridi */}
        {hasBesmele && effectiveContentMode !== 'meal_only' && (
          <div
            className="px-4 py-2 border-t text-center transition-colors"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor:
                isBesmelePlaying && !audioState.isWordSyncActive ? softPlayingBg : undefined,
            }}
          >
            <p
              className={`${settings.tajweedEnabled && tjBesmele ? 'arabic-tajweed' : 'arabic-text'} leading-tight`}
              style={{
                fontSize: `${Math.max(20, Math.min(28, settings.arabicFontSize - 2))}px`,
                color: 'var(--brand-primary-text)',
              }}
            >
              <SyncedVerseArabic
                text={besmele.ar}
                surahNo={surahMeta.no}
                ayahNo={1}
                isPlaying={isBesmelePlaying}
                wordSyncEnabled={settings.wordSyncEnabled}
                useTajweed={Boolean(settings.tajweedEnabled && tjBesmele)}
                tajweedWords={tjBesmele}
                tajweedRules={tjRules}
                theme={settings.theme}
                isBesmele
              />
            </p>
          </div>
        )}
      </div>

      {/* 4. Ayet Kartları Listesi + Sayfa Geçiş Ayırıcıları */}
      {displayedVerses.length === 0 ? (
        <div
          className="surface-card rounded-2xl p-8 text-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          Seçili filtre veya arama kriterine uyan ayet bulunamadı.
        </div>
      ) : (
        <div className="space-y-4">
          {displayedVerses.map((verse, idx) => {
            const prevVerse = idx > 0 ? displayedVerses[idx - 1] : null;
            const showPageDivider = !prevVerse || prevVerse.page !== verse.page;

            return (
              <React.Fragment key={verse.id}>
                {showPageDivider && (
                  <div className="flex items-center gap-3 py-1">
                    <div
                      className="h-px flex-1"
                      style={{ backgroundColor: 'var(--border-subtle)' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onOpenPageInMushaf(verse.page, verse.id);
                      }}
                      title="Bu sayfayı Mushaf Sayfa görünümünde aç"
                      className="min-h-[34px] px-3.5 rounded-xl border text-xs font-bold tabular-nums flex items-center gap-1.5 transition-colors cursor-pointer hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Mushaf {verse.page}. Sayfa · {verse.cuz}. Cüz
                      </span>
                    </button>
                    <div
                      className="h-px flex-1"
                      style={{ backgroundColor: 'var(--border-subtle)' }}
                    />
                  </div>
                )}

                <VerseCard
                  verse={verse}
                  surahMeta={surahMeta}
                  surahExtraInfo={surahExtraInfo}
                  settings={settings}
                  globalWordMode={wordMode}
                  contentMode={contentMode}
                  mealAudioFocusOnly={mealAudioFocusOnly}
                  isBookmarked={bookmarkedSet.has(verse.id)}
                  isPlayingThisAyah={playingAyahId === verse.id && !isBesmelePhase}
                  primaryMeal={primaryMeal}
                  secondaryMeal={secondaryMeal}
                  isDual={isDual}
                  primaryVerse={getPrimaryVerse(verse)}
                  secondaryVerse={isDual ? getSecondaryVerse(verse) : null}
                  isLoadingExtra={isLoadingExtra}
                  tajweedWords={getTjVerseWords(verse.surah, verse.ayah)}
                  tajweedRules={tjRules}
                  onToggleBookmark={onToggleBookmark}
                  onPlayFromHere={onPlayFromVerse}
                  onPlayMealFromHere={onPlayMealFromVerse}
                  onShareVerse={onShareVerse}
                />
              </React.Fragment>
            );
          })}

          {/* Kademeli Yükleme Tetikleyicisi */}
          {visibleCount < filteredVerses.length && (
            <div ref={loadMoreRef} className="py-4 text-center">
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((prev) =>
                    Math.min(filteredVerses.length, prev + BATCH_SIZE),
                  )
                }
                className="min-h-[44px] px-5 rounded-xl border text-xs font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                Daha Fazla Ayet Göster ({filteredVerses.length - visibleCount} ayet kaldı)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
