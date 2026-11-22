import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  Loader2,
  Pause,
  Play,
  Scale,
  Search,
  Star,
  Volume2,
  X,
} from 'lucide-react';
import {
  getAllMeals,
  getMealLangBadge,
  getMealTextPresentation,
} from '../config/mealsConfig';
import { audioQueueService } from '../services/audioQueueService';
import { SAJDAH_AYAH_IDS, dataService } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { CombinedVerse, MealCategory, MealDefinition, SurahBundle } from '../types/quran';
import { normalizeTurkish } from '../utils/textNormalize';

type CompareFilterTab = 'all' | 'favorites' | MealCategory;

function foldSearchText(value: string): string {
  return normalizeTurkish(value)
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

export const MealCompareModal: React.FC = () => {
  const {
    compareTarget,
    openMealCompare,
    closeMealCompare,
    settings,
    setPrimaryMeal,
    toggleFavoriteMeal,
    studyProgress,
    toggleBookmarkAyah,
    audioPrefs,
    manifest,
    meta,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const extraVersion = useSyncExternalStore(
    dataService.subscribeExtraMeals,
    dataService.getExtraMealsVersion,
  );

  const [bundle, setBundle] = useState<SurahBundle | null>(null);
  const [isLoadingBundle, setIsLoadingBundle] = useState(false);
  const [isLoadingExtra, setIsLoadingExtra] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extraError, setExtraError] = useState<string | null>(null);

  const [filterTab, setFilterTab] = useState<CompareFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFootnotes, setExpandedFootnotes] = useState<Record<string, boolean>>({});
  const [copiedMealId, setCopiedMealId] = useState<string | null>(null);

  const surahNo = compareTarget?.surah ?? null;
  const ayahNo = compareTarget?.ayah ?? null;

  // Escape ve Sol/Sağ ok kısayolları
  useEffect(() => {
    if (!compareTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMealCompare();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [compareTarget, closeMealCompare]);

  // Ayet değiştiğinde açık dipnotları sıfırla (varsayılan kapalı başlar)
  useEffect(() => {
    setExpandedFootnotes({});
    setCopiedMealId(null);
  }, [surahNo, ayahNo]);

  // Sure paketi + mx/sXXX.json tembel yükleme (sure başına tek HTTP isteği, önbellekli)
  useEffect(() => {
    if (surahNo === null) {
      setBundle(null);
      setLoadError(null);
      setExtraError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingBundle(true);
    setLoadError(null);

    dataService
      .getSurahBundle(surahNo)
      .then((res) => {
        if (cancelled) return;
        setBundle(res);
        setIsLoadingBundle(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Ayet verisi yüklenemedi.');
        setIsLoadingBundle(false);
      });

    if (dataService.hasExtraMealsLoaded(surahNo)) {
      setIsLoadingExtra(false);
      setExtraError(null);
    } else {
      setIsLoadingExtra(true);
      setExtraError(null);
      dataService
        .loadExtraMealsForSurah(surahNo)
        .then(() => {
          if (cancelled) return;
          setIsLoadingExtra(false);
        })
        .catch(() => {
          if (cancelled) return;
          setIsLoadingExtra(false);
          setExtraError('Ek meal ve tefsir paketi şu anda indirilemedi (TDV ve DİB gösteriliyor).');
        });
    }

    return () => {
      cancelled = true;
    };
  }, [surahNo]);

  const allMeals = useMemo(() => getAllMeals(manifest), [manifest]);
  const extraCount = Math.max(1, allMeals.length - 2);
  const categoryCounts = useMemo(() => {
    let resmi = 0;
    let klasik = 0;
    let cagdas = 0;
    let evrensel = 0;
    for (const m of allMeals) {
      if (m.category === 'resmi') resmi += 1;
      else if (m.category === 'klasik') klasik += 1;
      else if (m.category === 'evrensel') evrensel += 1;
      else cagdas += 1;
    }
    return { resmi, klasik, cagdas, evrensel };
  }, [allMeals]);
  const favoriteSet = useMemo(
    () => new Set(settings.favoriteMealIds ?? []),
    [settings.favoriteMealIds],
  );

  const verse: CombinedVerse | null = useMemo(() => {
    if (!bundle || ayahNo === null) return null;
    return bundle.verses.find((v) => v.ayah === ayahNo) ?? bundle.verses[0] ?? null;
  }, [bundle, ayahNo]);

  const navTargets = useMemo(() => {
    if (!meta || surahNo === null || ayahNo === null) {
      return { prev: null, next: null };
    }
    const currentSurah = meta.surahs.find((s) => s.no === surahNo);
    let prev: { surah: number; ayah: number } | null = null;
    let next: { surah: number; ayah: number } | null = null;

    if (ayahNo > 1) {
      prev = { surah: surahNo, ayah: ayahNo - 1 };
    } else if (surahNo > 1) {
      const prevSurah = meta.surahs.find((s) => s.no === surahNo - 1);
      if (prevSurah) {
        prev = { surah: prevSurah.no, ayah: prevSurah.ayahCount };
      }
    }

    if (currentSurah && ayahNo < currentSurah.ayahCount) {
      next = { surah: surahNo, ayah: ayahNo + 1 };
    } else if (surahNo < 114) {
      const nextSurah = meta.surahs.find((s) => s.no === surahNo + 1);
      if (nextSurah) {
        next = { surah: nextSurah.no, ayah: 1 };
      }
    }

    return { prev, next };
  }, [meta, surahNo, ayahNo]);

  const mealRows = useMemo(() => {
    void extraVersion;
    if (!verse) return [];
    const q = foldSearchText(searchQuery);

    const rows = allMeals
      .map((meal) => {
        const mealVerse = dataService.getMealVerse(verse.surah, verse.ayah, meal.id, verse);
        return { meal, mealVerse };
      })
      .filter(({ meal, mealVerse }) => {
        if (filterTab === 'favorites' && !favoriteSet.has(meal.id)) return false;
        if (
          (filterTab === 'resmi' ||
            filterTab === 'klasik' ||
            filterTab === 'cagdas' ||
            filterTab === 'evrensel') &&
          meal.category !== filterTab
        ) {
          return false;
        }
        if (!q) return true;
        const textHaystack = foldSearchText(
          `${meal.label} ${meal.shortLabel} ${mealVerse?.t ?? ''}`,
        );
        return textHaystack.includes(q);
      });

    if (filterTab === 'all' && !q) {
      return [...rows].sort((a, b) => {
        const aPrimary = a.meal.id === settings.primaryMealId ? 0 : 1;
        const bPrimary = b.meal.id === settings.primaryMealId ? 0 : 1;
        if (aPrimary !== bPrimary) return aPrimary - bPrimary;
        const aFav = favoriteSet.has(a.meal.id) ? 0 : 1;
        const bFav = favoriteSet.has(b.meal.id) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return 0;
      });
    }
    return rows;
  }, [allMeals, verse, filterTab, favoriteSet, searchQuery, extraVersion, settings.primaryMealId]);

  if (!compareTarget || surahNo === null || ayahNo === null) return null;

  const surahMeta =
    bundle?.surahMeta ?? meta?.surahs.find((s) => s.no === surahNo) ?? null;
  const surahName = surahMeta?.nameTr ?? `${surahNo}. Sure`;
  const isSajdah = verse ? SAJDAH_AYAH_IDS.has(verse.id) : false;
  const isBookmarked = verse ? studyProgress.bookmarkedAyahIds.includes(verse.id) : false;
  const isThisVersePlaying =
    Boolean(verse) &&
    audioState.currentAyahId === verse?.id &&
    (audioState.status === 'playing' || audioState.status === 'loading');

  const handleTogglePlay = () => {
    if (!verse || !manifest || !meta) return;
    sfxService.play('click');
    if (isThisVersePlaying) {
      audioQueueService.togglePlayPause();
      return;
    }
    audioQueueService.startQueue({
      verses: [verse],
      startIndex: 0,
      context: 'single',
      contextKey: `compare:${verse.surah}:${verse.ayah}`,
      manifest,
      meta,
      prefs: audioPrefs,
      singleAyahOnly: true,
    });
  };

  const handleCopyMeal = async (meal: MealDefinition, text: string) => {
    if (!verse || !text) return;
    const formatted = `${surahName} ${verse.surah}:${verse.ayah} (${meal.label})\n${text}`;
    try {
      await navigator.clipboard.writeText(formatted);
      sfxService.play('click');
      setCopiedMealId(meal.id);
      window.setTimeout(() => {
        setCopiedMealId((prev) => (prev === meal.id ? null : prev));
      }, 1800);
    } catch {
      // clipboard restricted
    }
  };

  const toggleFootnote = (mealId: string) => {
    sfxService.play('click');
    setExpandedFootnotes((prev) => ({
      ...prev,
      [mealId]: !prev[mealId],
    }));
  };

  const filterChips: { id: CompareFilterTab; label: string }[] = [
    { id: 'all', label: `Tümü (${allMeals.length})` },
    { id: 'favorites', label: `⭐ Favorilerim (${settings.favoriteMealIds.length})` },
    { id: 'resmi', label: `Resmî (${categoryCounts.resmi})` },
    { id: 'klasik', label: `Klasik (${categoryCounts.klasik})` },
    { id: 'cagdas', label: `Çağdaş (${categoryCounts.cagdas})` },
    { id: 'evrensel', label: `Arapça & Evrensel (${categoryCounts.evrensel})` },
  ];

  const categoryLabels: Record<MealCategory, string> = {
    resmi: 'Resmî',
    klasik: 'Klasik',
    cagdas: 'Çağdaş',
    evrensel: 'Arapça & Evrensel',
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Tüm Mealleri Karşılaştır"
      onClick={closeMealCompare}
    >
      <div
        className="w-full sm:max-w-4xl h-[94dvh] sm:h-[90vh] rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık ve Ayet Navigasyonu */}
        <div
          className="px-4 sm:px-5 py-3 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-soft)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Scale className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-sm sm:text-base font-extrabold truncate">
                  {surahName} · {surahNo}:{ayahNo}
                </h2>
                {verse && (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Sayfa {verse.page} · Cüz {verse.cuz}
                  </span>
                )}
                {isSajdah && settings.highlightSajdah && (
                  <span
                    className="text-[10px] font-extrabold px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    ۩ Tilâvet Secdesi
                  </span>
                )}
              </div>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                {allMeals.length} Meal &amp; Tefsir Karşılaştırma &amp; Araştırma Merkezi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!navTargets.prev}
              onClick={() => navTargets.prev && openMealCompare(navTargets.prev.surah, navTargets.prev.ayah)}
              title="Önceki Ayet"
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-35"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden md:inline">Önceki Ayet</span>
            </button>

            <button
              type="button"
              disabled={!navTargets.next}
              onClick={() => navTargets.next && openMealCompare(navTargets.next.surah, navTargets.next.ayah)}
              title="Sonraki Ayet"
              className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-35"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="hidden md:inline">Sonraki Ayet</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={!verse}
              aria-label={isThisVersePlaying ? 'Duraklat' : 'Ayeti dinle'}
              className="min-h-[38px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 text-white cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isThisVersePlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{isThisVersePlaying ? 'Duraklat' : 'Dinle'}</span>
            </button>

            <button
              type="button"
              onClick={closeMealCompare}
              aria-label="Karşılaştırma penceresini kapat"
              className="min-w-[38px] min-h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Kaydırılabilir İçerik */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {isLoadingBundle && !verse ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--brand-primary)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Ayet verileri yükleniyor...
              </p>
            </div>
          ) : loadError ? (
            <div
              className="rounded-2xl border p-5 flex items-center gap-3 text-sm"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{loadError}</span>
            </div>
          ) : (
            verse && (
              <>
                {/* Arapça Ayet Kutusu */}
                <div
                  className="rounded-2xl border p-4 sm:p-5"
                  style={{
                    backgroundColor: 'var(--bg-mushaf)',
                    borderColor: 'var(--border-strong)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Arapça Metin · {surahName} {verse.surah}:{verse.ayah}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleBookmarkAyah(verse.id)}
                      className="min-h-[32px] px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: isBookmarked
                          ? 'var(--brand-accent-soft)'
                          : 'var(--bg-surface)',
                        borderColor: isBookmarked
                          ? 'var(--brand-accent)'
                          : 'var(--border-subtle)',
                        color: isBookmarked
                          ? 'var(--brand-accent-text)'
                          : 'var(--text-secondary)',
                      }}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
                      <span>{isBookmarked ? 'Favori Ayet' : 'Ayeti Kaydet'}</span>
                    </button>
                  </div>

                  <p
                    dir="rtl"
                    lang="ar"
                    className="arabic-text text-right leading-[2.2]"
                    style={{
                      fontSize: `${Math.min(34, Math.max(24, settings.arabicFontSize))}px`,
                    }}
                  >
                    {verse.ar.t}
                  </p>
                </div>

                {/* Filtre & Arama Çubuğu */}
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-muted)' }}
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`${allMeals.length} meal, tefsir veya çeviri metni içinde filtrele...`}
                        className="w-full min-h-[40px] pl-9 pr-8 rounded-xl border text-xs sm:text-sm focus:outline-none"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Filtreyi temizle"
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                      {filterChips.map((chip) => {
                        const active = filterTab === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setFilterTab(chip.id);
                            }}
                            className="min-h-[36px] px-3 rounded-xl border text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
                            style={{
                              backgroundColor: active
                                ? 'var(--brand-primary)'
                                : 'var(--bg-surface-soft)',
                              borderColor: active
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                              color: active ? '#FFFFFF' : 'var(--text-secondary)',
                            }}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isLoadingExtra && (
                    <div
                      className="rounded-xl border px-3 py-2 flex items-center gap-2 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--brand-primary-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>
                        {surahName} suresi için ek {extraCount} meal &amp; tefsir paketi indiriliyor...
                      </span>
                    </div>
                  )}

                  {extraError && (
                    <div
                      className="rounded-xl border px-3 py-2 flex items-center gap-2 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{extraError}</span>
                    </div>
                  )}
                </div>

                {/* 24 Meal Karşılaştırma Kartları */}
                <div className="space-y-3">
                  {mealRows.length === 0 ? (
                    <div
                      className="rounded-2xl border p-8 text-center"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <p className="text-sm font-bold">Eşleşen meal kaydı bulunamadı.</p>
                    </div>
                  ) : (
                    mealRows.map(({ meal, mealVerse }) => {
                      const isPrimary = meal.id === settings.primaryMealId;
                      const isFav = favoriteSet.has(meal.id);
                      const footnotes = mealVerse?.fn ?? [];
                      const isFootnoteOpen = Boolean(expandedFootnotes[meal.id]);
                      const isCopied = copiedMealId === meal.id;

                      return (
                        <article
                          key={meal.id}
                          className="rounded-2xl border p-3.5 sm:p-4 transition-colors"
                          style={{
                            backgroundColor: isPrimary
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface)',
                            borderColor: isPrimary
                              ? 'var(--brand-primary)'
                              : 'var(--border-subtle)',
                          }}
                        >
                          {/* Kart Başlığı */}
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <h3 className="text-xs sm:text-sm font-extrabold">
                                {meal.label}
                              </h3>
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                style={{
                                  backgroundColor: 'var(--bg-surface-soft)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {categoryLabels[meal.category]}
                              </span>
                              {(() => {
                                const langBadge = getMealLangBadge(meal);
                                if (!langBadge) return null;
                                return (
                                  <span
                                    className="inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border"
                                    style={{
                                      backgroundColor:
                                        meal.lang === 'ar'
                                          ? 'var(--brand-accent-soft)'
                                          : 'var(--brand-primary-soft)',
                                      borderColor:
                                        meal.lang === 'ar'
                                          ? 'rgba(217, 119, 6, 0.35)'
                                          : 'rgba(15, 118, 110, 0.3)',
                                      color:
                                        meal.lang === 'ar'
                                          ? 'var(--brand-accent-text)'
                                          : 'var(--brand-primary-text)',
                                    }}
                                  >
                                    {langBadge}
                                  </span>
                                );
                              })()}
                              {meal.hasAudio ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md"
                                  style={{
                                    backgroundColor: 'var(--brand-primary-soft)',
                                    color: 'var(--brand-primary-text)',
                                  }}
                                >
                                  <Volume2 className="w-3 h-3" />
                                  <span>Sesli</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                  style={{
                                    backgroundColor: 'var(--bg-surface-soft)',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  <BookOpen className="w-3 h-3" />
                                  <span>Metin</span>
                                </span>
                              )}
                              {mealVerse?.mg && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                                  style={{
                                    backgroundColor: 'var(--brand-accent-soft)',
                                    color: 'var(--brand-accent-text)',
                                  }}
                                >
                                  {mealVerse.mg[0]}–{mealVerse.mg[1]}. ayetler birlikte
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isPrimary ? (
                                <span
                                  className="min-h-[30px] px-2 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1"
                                  style={{
                                    backgroundColor: 'var(--brand-primary)',
                                    color: '#FFFFFF',
                                  }}
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Ana Meal</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPrimaryMeal(meal.id)}
                                  className="min-h-[30px] px-2 rounded-lg border text-[11px] font-bold cursor-pointer hover:opacity-90"
                                  style={{
                                    backgroundColor: 'var(--bg-surface-soft)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  Ana Meal Yap
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleFavoriteMeal(meal.id)}
                                aria-label={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                                style={{
                                  backgroundColor: isFav
                                    ? 'var(--brand-accent-soft)'
                                    : 'transparent',
                                  color: isFav
                                    ? 'var(--brand-accent-text)'
                                    : 'var(--text-muted)',
                                }}
                              >
                                <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                              </button>

                              <button
                                type="button"
                                disabled={!mealVerse?.t}
                                onClick={() => mealVerse?.t && void handleCopyMeal(meal, mealVerse.t)}
                                aria-label={`${meal.shortLabel} mealini kopyala`}
                                title="Kopyala"
                                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-35"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {isCopied ? (
                                  <Check
                                    className="w-3.5 h-3.5"
                                    style={{ color: 'var(--brand-primary-text)' }}
                                  />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Meal / Tefsir Metni */}
                          {mealVerse?.t ? (
                            (() => {
                              const pres = getMealTextPresentation(
                                meal,
                                Math.max(14, settings.turkishFontSize),
                              );
                              return (
                                <p
                                  dir={pres.dir}
                                  lang={pres.lang}
                                  className={pres.isRtl ? pres.className : `${pres.className} leading-relaxed`}
                                  style={{
                                    fontSize: `${pres.fontSizePx}px`,
                                    fontFamily: pres.fontFamily,
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {mealVerse.t}
                                </p>
                              );
                            })()
                          ) : isLoadingExtra && meal.storage === 'mx' ? (
                            <div
                              className="h-5 w-4/5 rounded-md animate-pulse"
                              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                            />
                          ) : (
                            <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                              Bu ayet için bu mealde metin bulunamadı.
                            </p>
                          )}

                          {/* Açılır Dipnot Akordeonu (Varsayılan Kapalı) */}
                          {footnotes.length > 0 && (
                            <div className="mt-2.5">
                              <button
                                type="button"
                                onClick={() => toggleFootnote(meal.id)}
                                className="min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                style={{
                                  backgroundColor: isFootnoteOpen
                                    ? 'var(--brand-accent-soft)'
                                    : 'var(--bg-surface-soft)',
                                  borderColor: 'var(--border-subtle)',
                                  color: isFootnoteOpen
                                    ? 'var(--brand-accent-text)'
                                    : 'var(--text-secondary)',
                                }}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Açılır Dipnot ({footnotes.length})</span>
                                {isFootnoteOpen ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {isFootnoteOpen && (
                                <div
                                  className="mt-2 rounded-xl border p-3 space-y-1.5 text-xs leading-relaxed"
                                  style={{
                                    backgroundColor: 'var(--bg-surface-soft)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {footnotes.map((note, idx) => (
                                    <p key={idx}>
                                      <span
                                        className="font-extrabold mr-1"
                                        style={{ color: 'var(--brand-accent-text)' }}
                                      >
                                        [{idx + 1}]
                                      </span>
                                      {note}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
};
