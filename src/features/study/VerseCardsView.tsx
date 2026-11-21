import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Info,
  Languages,
  Search,
  X,
} from 'lucide-react';
import { useActiveMeals } from '../../hooks/useActiveMeals';
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
  onToggleBookmark: (ayahId: number) => void;
  onChangeWordMode: (mode: WordMealMode) => void;
  onPlayFromVerse: (verse: CombinedVerse) => void;
  onPlayMealFromVerse: (verse: CombinedVerse) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenPageInMushaf: (pageNo: number, ayahId: number) => void;
}

type CardFilterMode = 'all' | 'bookmarked' | 'footnotes' | 'merged';
type IntroTabKey = 'hakkinda' | 'nuzul' | 'konusu';

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
  onToggleBookmark,
  onChangeWordMode,
  onPlayFromVerse,
  onPlayMealFromVerse,
  onShareVerse,
  onOpenPageInMushaf,
}) => {
  const { surahMeta, verses, hasBesmele } = surahBundle;
  const surahNos = useMemo(() => [surahMeta.no], [surahMeta.no]);
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(surahNos);

  const [introOpen, setIntroOpen] = useState(false);
  const [introTab, setIntroTab] = useState<IntroTabKey>('hakkinda');
  const [filterMode, setFilterMode] = useState<CardFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [surahExtraInfo, setSurahExtraInfo] = useState<SurahExtraInfo | null>(null);

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

  const introSections = useMemo(
    () =>
      [
        { key: 'hakkinda' as const, label: 'Hakkında', text: surahMeta.hakkinda?.trim() ?? '' },
        { key: 'nuzul' as const, label: 'Nüzul', text: surahMeta.nuzul?.trim() ?? '' },
        { key: 'konusu' as const, label: 'Konusu', text: surahMeta.konusu?.trim() ?? '' },
      ].filter((s) => s.text.length > 0),
    [surahMeta],
  );

  // Sure değişince filtre ve batch sıfırla
  useEffect(() => {
    setFilterMode('all');
    setSearchQuery('');
    setVisibleCount(BATCH_SIZE);
    setIntroOpen(false);
    if (introSections.length > 0) {
      setIntroTab(introSections[0].key);
    }
  }, [surahMeta.no, introSections]);

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
    const idx = filteredVerses.findIndex((v) => v.ayah === jumpToAyahNo);
    if (idx === -1) return;

    if (idx >= visibleCount) {
      setVisibleCount(Math.min(filteredVerses.length, idx + 10));
    }

    const targetVerse = filteredVerses[idx];
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

  const activeIntroSection =
    introSections.find((s) => s.key === introTab) ?? introSections[0];

  return (
    <div className="space-y-3.5">
      {/* Birleşik Kompakt Üst Kart: Sure Başlığı + Besmele + Arama & Filtreler */}
      <div className="surface-card rounded-2xl overflow-hidden">
        {/* Satır 1: Sure Bilgisi + Besmele (Masaüstünde yan yana) + Sure Tanıtımı */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-xs tabular-nums shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              {surahMeta.no}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold tracking-tight">{surahMeta.nameTr}</h2>
                <span
                  className="arabic-title text-lg leading-none"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {formatSafeArabicTitle(surahMeta.nameAr)}
                </span>
              </div>
              <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {surahMeta.type} · {formatNumberTr(surahMeta.ayahCount)} Ayet · İniş:{' '}
                {surahMeta.nuzulSirasi} · Sayfa {surahMeta.pageStart}–{surahMeta.pageEnd}
              </p>
            </div>
          </div>

          {hasBesmele && (
            <div className="lg:text-center px-2 py-0.5">
              <p
                className="arabic-text leading-tight"
                style={{
                  fontSize: `${Math.max(19, Math.min(26, settings.arabicFontSize - 4))}px`,
                  color: 'var(--brand-primary-text)',
                }}
              >
                {besmele.ar}
              </p>
            </div>
          )}

          {introSections.length > 0 && (
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIntroOpen((v) => !v);
              }}
              className="self-start lg:self-auto min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
              style={{
                backgroundColor: introOpen ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
                borderColor: introOpen ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Sure Tanıtımı</span>
              {introOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Açılır Sure Tanıtımı */}
        {introOpen && introSections.length > 0 && activeIntroSection && (
          <div
            className="px-4 sm:px-5 pb-4 pt-3 border-t space-y-2.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {introSections.length > 1 && (
              <div
                className="inline-flex items-center gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {introSections.map((sec) => {
                  const active = sec.key === activeIntroSection.key;
                  return (
                    <button
                      key={sec.key}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setIntroTab(sec.key);
                      }}
                      className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      }}
                    >
                      {sec.label}
                    </button>
                  );
                })}
              </div>
            )}

            <p
              className="turkish-reading text-xs sm:text-sm whitespace-pre-line"
              style={{ color: 'var(--text-secondary)' }}
            >
              {activeIntroSection.text}
            </p>
          </div>
        )}

        {/* Satır 2: Arama ve Filtre Çipleri Tek Kompakt Şeritte */}
        <div
          className="px-4 py-2.5 sm:px-5 border-t flex flex-col md:flex-row md:items-center gap-2"
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

        {/* Satır 3: Kelime Meali & Kendini Dene (Yalnızca Kartlar Modunda) */}
        {settings.wordByWordEnabled && (
          <div
            className="px-4 py-2 sm:px-5 border-t flex flex-wrap items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Languages className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                <span>Kelime Meali:</span>
              </span>
              <div
                role="group"
                aria-label="Kelime meali görünümü"
                className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {(
                  [
                    { id: 'off', label: 'Kapalı' },
                    { id: 'visible', label: 'Açık' },
                    { id: 'quiz', label: 'Kendini Dene' },
                  ] as { id: WordMealMode; label: string }[]
                ).map((opt) => {
                  const active = wordMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onChangeWordMode(opt.id);
                      }}
                      className="min-h-[30px] px-2.5 sm:px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color:
                          active && opt.id === 'quiz'
                            ? 'var(--brand-accent-text)'
                            : active
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {wordMode === 'quiz' && (
              <span
                className="text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-lg border"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'rgba(217, 119, 6, 0.35)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                Türkçe anlamı görmek için kelimelere dokunun
              </span>
            )}
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
                  isPlayingThisAyah={playingAyahId === verse.id}
                  primaryMeal={primaryMeal}
                  secondaryMeal={secondaryMeal}
                  isDual={isDual}
                  primaryVerse={getPrimaryVerse(verse)}
                  secondaryVerse={isDual ? getSecondaryVerse(verse) : null}
                  isLoadingExtra={isLoadingExtra}
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
