import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
  Copy,
  Headphones,
  Info,
  Languages,
  Link2,
  List,
  Play,
  Share2,
  Square,
  Star,
  Volume2,
} from 'lucide-react';
import {
  SAJDAH_AYAH_IDS,
  toArabicIndicDigits,
} from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import type {
  AppSettings,
  BesmeleInfo,
  CombinedVerse,
  PageBundle,
  PageLayoutMode,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { formatSafeArabicTitle } from '../../utils/arabicUtils';
import { WordMealGrid } from './WordMealGrid';

interface MushafPageViewProps {
  pageBundle: PageBundle;
  secondPageBundle?: PageBundle | null;
  pageLayout?: PageLayoutMode;
  onTogglePageLayout?: () => void;
  besmele: BesmeleInfo;
  settings: AppSettings;
  wordMode: WordMealMode;
  selectedVerseId: number | null;
  playingAyahId: number | null;
  bookmarkedSet: Set<number>;
  onSelectVerse: (verse: CombinedVerse) => void;
  onChangePage: (nextPage: number) => void;
  onPlayFromVerse: (verse: CombinedVerse, singleAyahOnly?: boolean) => void;
  onPlayMealFromVerse: (verse: CombinedVerse) => void;
  onToggleBookmark: (ayahId: number) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenSurahInfo: (surah: SurahMeta) => void;
}

type InspectorTab = 'all_page' | 'selected';

const ENDS_WITH_ARABIC_NUMERAL = /[\u0660-\u0669]\s*$/;

export const MushafPageView: React.FC<MushafPageViewProps> = ({
  pageBundle,
  secondPageBundle = null,
  pageLayout = 'single',
  onTogglePageLayout,
  besmele,
  settings,
  wordMode,
  selectedVerseId,
  playingAyahId,
  bookmarkedSet,
  onSelectVerse,
  onChangePage,
  onPlayFromVerse,
  onPlayMealFromVerse,
  onToggleBookmark,
  onShareVerse,
  onOpenSurahInfo,
}) => {
  // Varsayılan olarak sayfadaki tüm mealler görünür (daha ferah ve akıcı çoklu ayet meali deneyimi)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('all_page');
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [showWordsOverride, setShowWordsOverride] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const mealScrollRef = useRef<HTMLDivElement | null>(null);

  const isDoubleActive = pageLayout === 'double' && Boolean(secondPageBundle);

  const allVisibleVerses = useMemo(() => {
    if (isDoubleActive && secondPageBundle) {
      return [...pageBundle.verses, ...secondPageBundle.verses];
    }
    return pageBundle.verses;
  }, [isDoubleActive, pageBundle.verses, secondPageBundle]);

  const surahMetaByNo = useMemo(() => {
    const map = new Map<number, SurahMeta>();
    for (const seg of pageBundle.segments) {
      map.set(seg.surahMeta.no, seg.surahMeta);
    }
    if (secondPageBundle) {
      for (const seg of secondPageBundle.segments) {
        map.set(seg.surahMeta.no, seg.surahMeta);
      }
    }
    return map;
  }, [pageBundle.segments, secondPageBundle]);

  const selectedVerse =
    allVisibleVerses.find((v) => v.id === selectedVerseId) ?? allVisibleVerses[0] ?? null;

  const selectedSurahMeta = selectedVerse
    ? surahMetaByNo.get(selectedVerse.surah) ?? pageBundle.segments[0]?.surahMeta ?? null
    : pageBundle.segments[0]?.surahMeta ?? null;

  // Ayet değişince dipnot çekmecesini kapat
  useEffect(() => {
    setShowFootnotes(false);
  }, [selectedVerse?.id]);

  // Çalan ayet değişince meal listesini de ilgili ayete yumuşakça kaydır
  useEffect(() => {
    if (inspectorTab !== 'all_page') return;
    const targetId = playingAyahId ?? selectedVerseId;
    if (!targetId || !mealScrollRef.current) return;
    const itemEl = mealScrollRef.current.querySelector<HTMLElement>(
      `[data-meal-ayah-id="${targetId}"]`,
    );
    if (itemEl) {
      itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [playingAyahId, selectedVerseId, inspectorTab]);

  // Klavye sol/sağ ok tuşları (Mushaf yönü: Sol = Sonraki, Sağ = Önceki)
  const pageStep = isDoubleActive ? 2 : 1;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft' && pageBundle.pageNo < pageBundle.maxPage) {
        e.preventDefault();
        onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
      } else if (e.key === 'ArrowRight' && pageBundle.pageNo > pageBundle.minPage) {
        e.preventDefault();
        onChangePage(Math.max(pageBundle.minPage, pageBundle.pageNo - pageStep));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageBundle.pageNo, pageBundle.minPage, pageBundle.maxPage, pageStep, onChangePage]);

  const handleCopyVerse = async (verse: CombinedVerse, surahNameTr: string) => {
    sfxService.play('click');
    const lines: string[] = [
      `${surahNameTr} ${verse.surah}:${verse.ayah} (${verse.cuz}. Cüz · Sayfa ${verse.page})`,
      verse.ar.t,
    ];
    if ((settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') && verse.m1?.t) {
      lines.push(`TDV: ${verse.m1.t}`);
    }
    if ((settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') && verse.m2?.t) {
      lines.push(`DİB: ${verse.m2.t}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedId(verse.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const tdvFootnotes = selectedVerse?.m1?.fn ?? [];
  const dibFootnotes = selectedVerse?.m2?.fn ?? [];
  const footnoteCount =
    settings.preferredMeal === 'm1'
      ? tdvFootnotes.length
      : settings.preferredMeal === 'm2'
        ? dibFootnotes.length
        : tdvFootnotes.length + dibFootnotes.length;

  const isSelectedBookmarked = selectedVerse ? bookmarkedSet.has(selectedVerse.id) : false;
  const shouldShowWordsInInspector = wordMode !== 'off' || showWordsOverride;
  const effectiveWordMode: Exclude<WordMealMode, 'off'> =
    wordMode === 'quiz' ? 'quiz' : 'visible';

  const canGoPrev = pageBundle.pageNo > pageBundle.minPage;
  const canGoNext =
    (isDoubleActive && secondPageBundle ? secondPageBundle.pageNo : pageBundle.pageNo) <
    pageBundle.maxPage;

  // Tek bir Mushaf sayfasını çizen yardımcı fonksiyon (Tek veya Çift Sayfa düzeninde ortak)
  const renderMushafLeaf = (bundle: PageBundle, compactPadding = false) => {
    const surahTitlesTr = bundle.segments.map((s) => s.surahMeta.shortNameTr).join(' · ');
    const surahTitlesAr = bundle.segments
      .map((s) => formatSafeArabicTitle(s.surahMeta.nameAr))
      .slice(0, 2)
      .join(' · ');

    return (
      <div
        key={`mushaf-leaf-${bundle.pageNo}`}
        className="rounded-3xl p-1.5 border-2 transition-colors flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'rgba(15, 118, 110, 0.34)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          className={`rounded-[20px] border flex-1 flex flex-col justify-between ${
            compactPadding ? 'p-4 sm:p-5' : 'p-4 sm:p-6 md:p-7'
          }`}
          style={{
            borderColor: 'rgba(217, 119, 6, 0.35)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div>
            {/* Mushaf Üst Bilgi Şeridi */}
            <div
              className="pb-2.5 mb-4 border-b flex items-center justify-between gap-2 text-xs sm:text-sm"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="font-bold tabular-nums shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                Sayfa {bundle.pageNo}
              </span>

              <span
                className="font-semibold tabular-nums text-center px-2.5 py-0.5 rounded-lg text-xs"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-secondary)',
                }}
              >
                {bundle.cuzs.map((c) => `${c}. Cüz`).join(' / ')}
              </span>

              <div className="text-right min-w-0 flex items-center gap-2 justify-end">
                <span
                  className="text-xs font-bold truncate hidden sm:inline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {surahTitlesTr}
                </span>
                <span
                  className="arabic-title text-base sm:text-lg leading-none truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {surahTitlesAr}
                </span>
              </div>
            </div>

            {/* Sayfa Bölümleri */}
            <div className="space-y-5">
              {bundle.segments.map((segment) => (
                <div key={`seg-${bundle.pageNo}-${segment.surahMeta.no}`} className="space-y-3.5">
                  {segment.startsAtAyah1 && (
                    <div
                      className="rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-3 relative overflow-hidden"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'rgba(217, 119, 6, 0.4)',
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                            {segment.surahMeta.no}. {segment.surahMeta.nameTr}
                          </h3>
                          <p
                            className="text-xs tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {segment.surahMeta.type} · {segment.surahMeta.ayahCount} Ayet
                          </p>
                        </div>

                        <span
                          className="arabic-title text-xl sm:text-2xl leading-none"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {formatSafeArabicTitle(segment.surahMeta.nameAr)}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            onOpenSurahInfo(segment.surahMeta);
                          }}
                          className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <Info className="w-3.5 h-3.5 shrink-0" />
                          <span>Bilgi</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {segment.showBesmele && (
                    <p
                      className="arabic-text text-center py-0.5"
                      style={{
                        fontSize: `${Math.max(20, settings.arabicFontSize - 2)}px`,
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      {besmele.ar}
                    </p>
                  )}

                  {/* Kesintisiz Mushaf Ayet Akışı */}
                  <div
                    dir="rtl"
                    className="arabic-text"
                    style={{
                      fontSize: `${settings.arabicFontSize}px`,
                      lineHeight: 2.32,
                      textAlign: 'justify',
                      textAlignLast: 'center',
                    }}
                  >
                    {segment.verses.map((verse) => {
                      const isSelected = selectedVerse?.id === verse.id;
                      const isPlaying = playingAyahId === verse.id;
                      const isSajdah = SAJDAH_AYAH_IDS.has(verse.id);
                      const hasDigitsAtEnd = ENDS_WITH_ARABIC_NUMERAL.test(verse.ar.t);

                      const highlightBg = isPlaying
                        ? 'rgba(13, 148, 136, 0.24)'
                        : isSelected
                          ? 'rgba(217, 119, 6, 0.16)'
                          : 'transparent';

                      return (
                        <span
                          key={verse.id}
                          id={`mushaf-ayah-${verse.id}`}
                          data-ayah-id={verse.id}
                          onClick={() => {
                            sfxService.play('click');
                            onSelectVerse(verse);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              sfxService.play('click');
                              onSelectVerse(verse);
                            }
                          }}
                          className="inline rounded-lg px-1 py-0.5 transition-colors cursor-pointer hover:bg-teal-600/10 focus-visible:outline-2 focus-visible:outline-teal-600"
                          style={{ backgroundColor: highlightBg }}
                        >
                          {verse.ar.t}
                          {isSajdah && (
                            <span
                              title="Tilâvet Secdesi Ayeti"
                              className="inline-block mx-1 text-[0.72em] font-bold align-middle"
                              style={{ color: 'var(--brand-accent)' }}
                            >
                              ۩
                            </span>
                          )}
                          {!hasDigitsAtEnd && (
                            <span
                              className="inline-block mx-1.5 text-[0.76em] select-none align-middle"
                              style={{
                                color: isPlaying
                                  ? 'var(--brand-primary-text)'
                                  : isSelected
                                    ? 'var(--brand-accent-text)'
                                    : 'var(--brand-primary-text)',
                              }}
                              title={`${segment.surahMeta.shortNameTr} ${verse.ayah}. Ayet`}
                            >
                              ﴿{toArabicIndicDigits(verse.ayah)}﴾
                            </span>
                          )}{' '}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alt Sayfa Numarası */}
          <div
            className="mt-5 pt-2.5 border-t flex items-center justify-center text-xs font-bold tabular-nums"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              — {bundle.pageNo} / {bundle.maxPage} —
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={
        isDoubleActive
          ? 'space-y-5'
          : 'grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 items-start'
      }
    >
      {/* ====================================================================
          ANA ALAN: Mushaf Sayfası (Tek Sayfa veya Masaüstü Geniş Çift Sayfa)
          ==================================================================== */}
      <div className={isDoubleActive ? 'space-y-3' : 'lg:col-span-7 space-y-3'}>
        {isDoubleActive && secondPageBundle ? (
          /* Çift Sayfa Düzeni: Gerçek Mushaf RTL açılımı (Sağda pageNo, Solda pageNo+1) */
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            <div className="order-2 xl:order-1">{renderMushafLeaf(secondPageBundle, true)}</div>
            <div className="order-1 xl:order-2">{renderMushafLeaf(pageBundle, true)}</div>
          </div>
        ) : (
          renderMushafLeaf(pageBundle, false)
        )}

        {/* Mushaf Sayfa Geçiş Kontrolleri + Masaüstü Tek/Çift Sayfa Geçişi */}
        <div className="flex items-center justify-between gap-2.5">
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => {
              sfxService.play('click');
              onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
            }}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">
              {isDoubleActive ? 'Sonraki 2 Sayfa' : 'Sonraki Sayfa'}
            </span>
          </button>

          <div className="hidden sm:flex items-center gap-2">
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {isDoubleActive && secondPageBundle
                ? `Sayfa ${pageBundle.pageNo}–${secondPageBundle.pageNo}`
                : `Sayfa ${pageBundle.pageNo}`}
            </span>

            {onTogglePageLayout && (
              <button
                type="button"
                onClick={onTogglePageLayout}
                title={
                  pageLayout === 'double'
                    ? 'Tek sayfa görünümüne geç'
                    : 'Yan yana çift sayfa görünümüne geç'
                }
                className="hidden xl:inline-flex min-h-[34px] px-2.5 rounded-lg border text-xs font-bold items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor:
                    pageLayout === 'double' ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                  borderColor:
                    pageLayout === 'double' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color:
                    pageLayout === 'double'
                      ? 'var(--brand-primary-text)'
                      : 'var(--text-secondary)',
                }}
              >
                {pageLayout === 'double' ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>Tek Sayfa</span>
                  </>
                ) : (
                  <>
                    <Columns2 className="w-3.5 h-3.5" />
                    <span>Çift Sayfa</span>
                  </>
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => {
              sfxService.play('click');
              onChangePage(Math.max(pageBundle.minPage, pageBundle.pageNo - pageStep));
            }}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="whitespace-nowrap">
              {isDoubleActive ? 'Önceki 2 Sayfa' : 'Önceki Sayfa'}
            </span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* ====================================================================
          MEAL & İNCELEME PANELİ: Çoklu Ayet Meal Akışı + Seçili Ayet Ayrıntısı
          ==================================================================== */}
      <aside
        className={
          isDoubleActive
            ? 'surface-card rounded-2xl overflow-hidden flex flex-col'
            : 'lg:col-span-5 lg:sticky lg:top-20 surface-card rounded-2xl overflow-hidden flex flex-col lg:max-h-[calc(100dvh-6rem)]'
        }
      >
        {/* Panel Sekmeleri: Sayfadaki Tüm Mealler (Varsayılan) | Seçili Ayet Ayrıntı */}
        <div
          className="p-2 border-b shrink-0 flex items-center justify-between gap-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-xl flex-1"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setInspectorTab('all_page');
              }}
              className="min-h-[38px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: inspectorTab === 'all_page' ? 'var(--bg-surface)' : 'transparent',
                color:
                  inspectorTab === 'all_page'
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-secondary)',
                boxShadow: inspectorTab === 'all_page' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <List className="w-3.5 h-3.5 shrink-0" />
              <span>Sayfa Mealleri ({allVisibleVerses.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setInspectorTab('selected');
              }}
              className="min-h-[38px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: inspectorTab === 'selected' ? 'var(--bg-surface)' : 'transparent',
                color:
                  inspectorTab === 'selected'
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-secondary)',
                boxShadow: inspectorTab === 'selected' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>
                Seçili Ayet{selectedVerse ? ` (${selectedVerse.ayah})` : ''}
              </span>
            </button>
          </div>
        </div>

        {/* Panel İçeriği */}
        <div
          ref={mealScrollRef}
          className={`p-3.5 sm:p-4 overflow-y-auto flex-1 ${
            isDoubleActive ? 'max-h-[560px]' : ''
          }`}
        >
          {inspectorTab === 'all_page' ? (
            /* SEKME 1: Sayfadaki Tüm Ayetlerin Akıcı & Senkronize Meali */
            <div
              className={
                isDoubleActive
                  ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5'
                  : 'space-y-2.5'
              }
            >
              {allVisibleVerses.map((v) => {
                const surahMeta = surahMetaByNo.get(v.surah);
                const isSelected = selectedVerse?.id === v.id;
                const isPlaying = playingAyahId === v.id;
                const isFav = bookmarkedSet.has(v.id);
                const fnTotal =
                  (settings.preferredMeal !== 'm2' ? v.m1?.fn?.length ?? 0 : 0) +
                  (settings.preferredMeal !== 'm1' ? v.m2?.fn?.length ?? 0 : 0);

                return (
                  <div
                    key={`page-meal-${v.id}`}
                    data-meal-ayah-id={v.id}
                    onClick={() => {
                      sfxService.play('click');
                      onSelectVerse(v);
                      const el = document.getElementById(`mushaf-ayah-${v.id}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectVerse(v);
                      }
                    }}
                    className="w-full text-left p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5"
                    style={{
                      backgroundColor: isPlaying
                        ? 'var(--brand-primary-soft)'
                        : isSelected
                          ? 'var(--bg-surface-soft)'
                          : 'var(--bg-surface)',
                      borderColor: isPlaying
                        ? 'var(--brand-primary)'
                        : isSelected
                          ? 'var(--brand-accent)'
                          : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span
                          className="font-extrabold tabular-nums"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {surahMeta?.shortNameTr ?? `${v.surah}. Sure`} · {v.ayah}. Ayet
                        </span>
                        {isPlaying && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            <Volume2 className="w-3 h-3 animate-pulse" />
                            <span>Okunuyor</span>
                          </span>
                        )}
                        {v.m1?.mg && settings.preferredMeal !== 'm2' && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            {v.m1.mg[0]}–{v.m1.mg[1]}
                          </span>
                        )}
                      </div>

                      {/* Satır İçi Hızlı Aksiyonlar (Dinle · Yıldızla · Paylaş · Ayrıntı) */}
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onPlayFromVerse(v, false)}
                          title="Bu ayetten dinle"
                          aria-label={`${v.ayah}. ayetten dinle`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleBookmark(v.id)}
                          title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                          aria-label={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-amber-500/15 cursor-pointer"
                          style={{
                            color: isFav ? 'var(--brand-accent-text)' : 'var(--text-muted)',
                          }}
                        >
                          <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                        {surahMeta && (
                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              onShareVerse(v, surahMeta);
                            }}
                            title="Paylaşım kartı oluştur"
                            aria-label="Paylaşım kartı oluştur"
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            onSelectVerse(v);
                            setInspectorTab('selected');
                          }}
                          title="Kelime meali ve dipnot ayrıntısı"
                          className="h-7 px-2 rounded-lg text-[10px] font-bold border ml-0.5 cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {fnTotal > 0 ? `Detay (${fnTotal})` : 'Detay'}
                        </button>
                      </div>
                    </div>

                    {(settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') &&
                      v.m1 && (
                        <p
                          className="turkish-reading"
                          style={{
                            fontSize: `${Math.max(13, settings.turkishFontSize - 1)}px`,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {settings.preferredMeal === 'both' && (
                            <span
                              className="font-extrabold mr-1.5 text-xs"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              TDV:
                            </span>
                          )}
                          {v.m1.t}
                        </p>
                      )}

                    {(settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') &&
                      v.m2 && (
                        <p
                          className="turkish-reading"
                          style={{
                            fontSize: `${Math.max(13, settings.turkishFontSize - 1)}px`,
                            color:
                              settings.preferredMeal === 'both'
                                ? 'var(--text-secondary)'
                                : 'var(--text-primary)',
                          }}
                        >
                          {settings.preferredMeal === 'both' && (
                            <span
                              className="font-extrabold mr-1.5 text-xs"
                              style={{ color: 'var(--brand-accent-text)' }}
                            >
                              DİB:
                            </span>
                          )}
                          {v.m2.t}
                        </p>
                      )}
                  </div>
                );
              })}
            </div>
          ) : selectedVerse && selectedSurahMeta ? (
            /* SEKME 2: Seçili Ayet Ayrıntı, Dipnot & Kelime Meali */
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-extrabold tracking-tight">
                      {selectedSurahMeta.nameTr} · {selectedVerse.ayah}. Ayet
                    </h4>
                    <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {selectedVerse.cuz}. Cüz · Sayfa {selectedVerse.page}
                      {SAJDAH_AYAH_IDS.has(selectedVerse.id) && (
                        <span
                          className="font-bold ml-1.5"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          · ۩ Tilâvet Secdesi
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenSurahInfo(selectedSurahMeta)}
                    aria-label="Sure bilgisini aç"
                    className="min-w-[38px] min-h-[38px] rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>

                {/* Bu Ayetten Dinle · Sesli Mealini Dinle · Yıldızla · Kopyala · Paylaş */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayFromVerse(selectedVerse, false)}
                    className="flex-1 min-h-[42px] px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Headphones className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">Bu Ayetten Dinle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onPlayMealFromVerse(selectedVerse)}
                    title="Bu ayetten itibaren sadece Türkçe sesli mealini dinle"
                    className="flex-1 min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      borderColor: 'var(--brand-accent)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Volume2 className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">Sesli Mealini Dinle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleBookmark(selectedVerse.id)}
                    aria-label={isSelectedBookmarked ? 'Yıldızlılardan çıkar' : 'Yıldızla'}
                    className="min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: isSelectedBookmarked
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface)',
                      borderColor: isSelectedBookmarked
                        ? 'var(--brand-accent)'
                        : 'var(--border-subtle)',
                      color: isSelectedBookmarked
                        ? 'var(--brand-accent-text)'
                        : 'var(--text-primary)',
                    }}
                  >
                    <Star
                      className={`w-4 h-4 ${isSelectedBookmarked ? 'fill-current' : ''}`}
                    />
                    <span className="hidden sm:inline">
                      {isSelectedBookmarked ? 'Yıldızlı' : 'Yıldızla'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyVerse(selectedVerse, selectedSurahMeta.nameTr)}
                    aria-label="Kopyala"
                    className="min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: copiedId === selectedVerse.id ? '#10B981' : 'var(--text-primary)',
                    }}
                  >
                    {copiedId === selectedVerse.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {copiedId === selectedVerse.id ? 'Kopyalandı' : 'Kopyala'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onShareVerse(selectedVerse, selectedSurahMeta);
                    }}
                    aria-label="Paylaşım kartı oluştur"
                    className="min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Paylaş</span>
                  </button>
                </div>
              </div>

              {/* Seçili Meal(ler) */}
              <div
                className="p-4 rounded-xl border space-y-3.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {(settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') &&
                  selectedVerse.m1 && (
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                        <span
                          className="text-xs font-extrabold"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          Diyanet Vakfı Meali (TDV)
                        </span>
                        {selectedVerse.m1.mg && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            <Link2 className="w-3 h-3" />
                            {selectedVerse.m1.mg[0]}–{selectedVerse.m1.mg[1]} Birleşik Meal
                          </span>
                        )}
                      </div>
                      <p
                        className="turkish-reading"
                        style={{
                          fontSize: `${settings.turkishFontSize}px`,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {selectedVerse.m1.t}
                      </p>
                    </div>
                  )}

                {(settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') &&
                  selectedVerse.m2 && (
                    <div
                      className={settings.preferredMeal === 'both' ? 'pt-3 border-t' : undefined}
                      style={
                        settings.preferredMeal === 'both'
                          ? { borderColor: 'var(--border-subtle)' }
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                        <span
                          className="text-xs font-extrabold"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          Diyanet İşleri Meali (DİB Yeni)
                        </span>
                        {selectedVerse.m2.mg && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            <Link2 className="w-3 h-3" />
                            {selectedVerse.m2.mg[0]}–{selectedVerse.m2.mg[1]} Birleşik Meal
                          </span>
                        )}
                      </div>
                      <p
                        className="turkish-reading"
                        style={{
                          fontSize: `${settings.turkishFontSize}px`,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {selectedVerse.m2.t}
                      </p>
                    </div>
                  )}
              </div>

              {/* Dipnot / Tefsir Açıklaması (fn) */}
              {footnoteCount > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setShowFootnotes((v) => !v);
                    }}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
                    style={{
                      backgroundColor: showFootnotes
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: showFootnotes
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                      color: showFootnotes
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-primary)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 shrink-0" />
                      <span>Dipnot / Tefsir Açıklaması ({footnoteCount})</span>
                    </span>
                    {showFootnotes ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showFootnotes && (
                    <div
                      className="mt-2.5 p-3.5 rounded-xl border space-y-3 text-xs sm:text-sm leading-relaxed"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {(settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') &&
                        tdvFootnotes.length > 0 && (
                          <div className="space-y-1">
                            <p
                              className="text-xs font-extrabold"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              TDV Dipnotları
                            </p>
                            <ol className="space-y-1.5 list-decimal list-inside">
                              {tdvFootnotes.map((n, idx) => (
                                <li key={`m1-fn-${idx}`}>{n}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      {(settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') &&
                        dibFootnotes.length > 0 && (
                          <div className="space-y-1">
                            <p
                              className="text-xs font-extrabold"
                              style={{ color: 'var(--brand-accent-text)' }}
                            >
                              DİB Dipnotları
                            </p>
                            <ol className="space-y-1.5 list-decimal list-inside">
                              {dibFootnotes.map((n, idx) => (
                                <li key={`m2-fn-${idx}`}>{n}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}

              {/* Kelime-Kelime Meal Alanı */}
              {selectedVerse.words.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold flex items-center gap-1.5">
                      <Languages
                        className="w-4 h-4"
                        style={{ color: 'var(--brand-primary-text)' }}
                      />
                      <span>Kelime-Kelime Meal ({selectedVerse.words.length} kelime)</span>
                    </span>
                    {wordMode === 'off' && (
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setShowWordsOverride((v) => !v);
                        }}
                        className="text-xs font-bold cursor-pointer hover:underline"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {showWordsOverride ? 'Gizle' : 'Göster'}
                      </button>
                    )}
                  </div>

                  {shouldShowWordsInInspector && (
                    <div
                      className="p-3 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <WordMealGrid
                        ayahId={selectedVerse.id}
                        words={selectedVerse.words}
                        wordMode={effectiveWordMode}
                        arabicFontSize={settings.arabicFontSize}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
};
