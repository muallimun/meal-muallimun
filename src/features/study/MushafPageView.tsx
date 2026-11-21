import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Info,
  PanelRightClose,
  Play,
  Scale,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { BOOKMARK_COLOR_STYLES } from '../../components/PageBookmarksDrawer';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import {
  SAJDAH_AYAH_IDS,
  toArabicIndicDigits,
} from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  AppSettings,
  BesmeleInfo,
  BookContentMode,
  CombinedVerse,
  PageBundle,
  PageLayoutMode,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { formatSafeArabicTitle } from '../../utils/arabicUtils';
import { DraggableVerseInspector } from './DraggableVerseInspector';
import type { LocationPickerTab } from './LocationPickerModal';

interface MushafPageViewProps {
  pageBundle: PageBundle;
  secondPageBundle?: PageBundle | null;
  pageLayout?: PageLayoutMode;
  onChangePageLayout?: (layout: PageLayoutMode) => void;
  contentMode?: BookContentMode;
  besmele: BesmeleInfo;
  settings: AppSettings;
  wordMode: WordMealMode;
  selectedVerseId: number | null;
  playingAyahId: number | null;
  bookmarkedSet: Set<number>;
  isRefreshing?: boolean;
  onSelectVerse: (verse: CombinedVerse) => void;
  onChangePage: (nextPage: number) => void;
  onPlayFromVerse: (verse: CombinedVerse, singleAyahOnly?: boolean) => void;
  onPlayMealFromVerse: (verse: CombinedVerse) => void;
  onToggleBookmark: (ayahId: number) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenSurahInfo: (surah: SurahMeta) => void;
  onOpenLocationPicker?: (tab?: LocationPickerTab) => void;
  onToggleMobileImmersive?: () => void;
}

const ENDS_WITH_ARABIC_NUMERAL = /[\u0660-\u0669]\s*$/;

/** Özgün, telifsiz geometrik köşe süslemesi (SVG) */
const CornerOrnament: React.FC<{ position: 'tl' | 'tr' | 'bl' | 'br' }> = ({ position }) => {
  const rotation =
    position === 'tl'
      ? ''
      : position === 'tr'
        ? 'scale-x-[-1]'
        : position === 'bl'
          ? 'scale-y-[-1]'
          : 'scale-[-1]';
  const placement =
    position === 'tl'
      ? 'top-1.5 left-1.5'
      : position === 'tr'
        ? 'top-1.5 right-1.5'
        : position === 'bl'
          ? 'bottom-1.5 left-1.5'
          : 'bottom-1.5 right-1.5';

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 28"
      className={`w-5 h-5 sm:w-6 sm:h-6 absolute pointer-events-none opacity-55 ${placement} ${rotation}`}
      fill="none"
    >
      <path
        d="M2 24V6C2 3.79 3.79 2 6 2H24"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        style={{ color: 'var(--brand-primary)' }}
      />
      <path
        d="M6 18V8C6 6.9 6.9 6 8 6H18"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        style={{ color: 'var(--brand-accent)' }}
      />
      <path
        d="M9.5 9.5L12.5 8L11 11L9.5 9.5Z"
        fill="currentColor"
        style={{ color: 'var(--brand-accent)' }}
      />
    </svg>
  );
};

export const MushafPageView: React.FC<MushafPageViewProps> = ({
  pageBundle,
  secondPageBundle = null,
  pageLayout = 'single',
  onChangePageLayout,
  contentMode = 'interleaved',
  besmele,
  settings,
  wordMode,
  selectedVerseId,
  playingAyahId,
  bookmarkedSet,
  isRefreshing = false,
  onSelectVerse,
  onChangePage,
  onPlayFromVerse,
  onPlayMealFromVerse,
  onToggleBookmark,
  onShareVerse,
  onOpenSurahInfo,
  onOpenLocationPicker,
  onToggleMobileImmersive,
}) => {
  const {
    studyProgress,
    upsertPageBookmark,
    moveHatimBookmark,
    removePageBookmark,
    openBookmarksDrawer,
    openMealCompare,
    openMealSelector,
  } = useAppStore();

  const [openRibbonPage, setOpenRibbonPage] = useState<number | null>(null);
  const [isVerseDrawerOpen, setIsVerseDrawerOpen] = useState<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const isArOnly = contentMode === 'ar_only';
  const isDoubleMushaf = pageLayout === 'double_mushaf' && Boolean(secondPageBundle);
  const isDoubleMeal = pageLayout === 'double_meal';
  const isMealOnly = contentMode === 'meal_only' && !isDoubleMeal;
  const isBookSpread = isDoubleMushaf || isDoubleMeal;

  const allVisibleVerses = useMemo(() => {
    if (isDoubleMushaf && secondPageBundle) {
      return [...pageBundle.verses, ...secondPageBundle.verses];
    }
    return pageBundle.verses;
  }, [isDoubleMushaf, pageBundle.verses, secondPageBundle]);

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

  const visibleSurahNos = useMemo(
    () => Array.from(surahMetaByNo.keys()),
    [surahMetaByNo],
  );
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(visibleSurahNos);

  const selectedVerse =
    allVisibleVerses.find((v) => v.id === selectedVerseId) ?? allVisibleVerses[0] ?? null;

  const selectedSurahMeta = selectedVerse
    ? surahMetaByNo.get(selectedVerse.surah) ?? pageBundle.segments[0]?.surahMeta ?? null
    : pageBundle.segments[0]?.surahMeta ?? null;

  // Sayfa değişince açık kurdele menüsünü kapat
  useEffect(() => {
    setOpenRibbonPage(null);
  }, [pageBundle.pageNo]);

  // Çalan/seçilen ayet değişince karşılıklı meal sayfasını ilgili ayete kaydır
  useEffect(() => {
    const targetId = playingAyahId ?? selectedVerseId;
    if (!targetId || !isDoubleMeal) return;
    const el = document.getElementById(`facing-meal-ayah-${targetId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [playingAyahId, selectedVerseId, isDoubleMeal]);

  // Klavye sol/sağ ok tuşları (Mushaf yönü: Sol = Sonraki, Sağ = Önceki)
  const pageStep = isDoubleMushaf ? 2 : 1;
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

  // Mobilde yatay parmak kaydırma ile sayfa çevirme
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    // RTL Mushaf sayfa çevirme: Sağa kaydır -> sonraki sayfa, Sola kaydır -> önceki sayfa
    if (dx > 0 && pageBundle.pageNo < pageBundle.maxPage) {
      sfxService.play('click');
      onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
    } else if (dx < 0 && pageBundle.pageNo > pageBundle.minPage) {
      sfxService.play('click');
      onChangePage(Math.max(pageBundle.minPage, pageBundle.pageNo - pageStep));
    }
  };

  const canGoPrev = pageBundle.pageNo > pageBundle.minPage;
  const canGoNext =
    (isDoubleMushaf && secondPageBundle ? secondPageBundle.pageNo : pageBundle.pageNo) <
    pageBundle.maxPage;

  const handleMobileEmptySpaceTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onToggleMobileImmersive || typeof window === 'undefined' || window.innerWidth >= 1024) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, [role="button"], input, select')) {
      return;
    }
    onToggleMobileImmersive();
  };

  // Kurdele Sayfa Ayracı Bileşeni (Her Mushaf Yaprağının Üst Köşesinde)
  const renderRibbonBookmark = (bundle: PageBundle) => {
    const firstVerse = bundle.verses[0];
    const firstSurah = bundle.segments[0]?.surahMeta;
    const hatimOnPage = studyProgress.pageBookmarks.find(
      (b) => b.isHatim && b.page === bundle.pageNo,
    );
    const customOnPage = studyProgress.pageBookmarks.find(
      (b) => !b.isHatim && b.page === bundle.pageNo,
    );
    const activeBookmark = hatimOnPage ?? customOnPage ?? null;
    const ribbonColor = activeBookmark
      ? BOOKMARK_COLOR_STYLES[activeBookmark.color]?.bg ?? '#0F766E'
      : null;
    const isMenuOpen = openRibbonPage === bundle.pageNo;

    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            setOpenRibbonPage((prev) => (prev === bundle.pageNo ? null : bundle.pageNo));
          }}
          title={
            activeBookmark
              ? `${activeBookmark.label} (Sayfa ${bundle.pageNo})`
              : `Sayfa ${bundle.pageNo} için ayraç ekle`
          }
          aria-label={`Sayfa ${bundle.pageNo} ayracı`}
          aria-expanded={isMenuOpen}
          className="relative flex items-center justify-center w-8 h-9 -mt-2 rounded-b-lg border-x border-b shadow-xs transition-transform hover:translate-y-0.5 cursor-pointer"
          style={{
            backgroundColor: ribbonColor ?? 'var(--bg-surface-soft)',
            borderColor: ribbonColor ? 'transparent' : 'var(--border-strong)',
            color: ribbonColor ? '#FFFFFF' : 'var(--text-muted)',
          }}
        >
          <Bookmark className={`w-4 h-4 ${activeBookmark ? 'fill-current' : ''}`} />
        </button>

        {isMenuOpen && firstVerse && (
          <div
            className="absolute left-0 top-9 z-30 w-60 rounded-2xl border shadow-xl p-2 space-y-1 text-left"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div
              className="px-2.5 py-1.5 border-b text-[11px] font-bold flex items-center justify-between"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              <span>Sayfa {bundle.pageNo} Ayracı</span>
              {activeBookmark && (
                <span style={{ color: 'var(--brand-primary-text)' }}>{activeBookmark.label}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                moveHatimBookmark({
                  page: bundle.pageNo,
                  surah: firstVerse.surah,
                  ayah: firstVerse.ayah,
                });
                setOpenRibbonPage(null);
              }}
              className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {hatimOnPage ? 'Hatim Ayracım Burada ✓' : 'Hatim Ayracımı Buraya Taşı'}
              </span>
            </button>

            {customOnPage ? (
              <button
                type="button"
                onClick={() => {
                  removePageBookmark(customOnPage.id);
                  setOpenRibbonPage(null);
                }}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-red-500/10 cursor-pointer"
                style={{ color: '#DC2626' }}
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Sayfa Ayracını Kaldır</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  upsertPageBookmark({
                    page: bundle.pageNo,
                    surah: firstVerse.surah,
                    ayah: firstVerse.ayah,
                    label: firstSurah
                      ? `${firstSurah.shortNameTr} · S.${bundle.pageNo}`
                      : `Sayfa ${bundle.pageNo}`,
                    color: 'amber',
                  });
                  setOpenRibbonPage(null);
                }}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                <Bookmark className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-accent-text)' }} />
                <span>Bu Sayfayı Ayraçlara Ekle</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpenRibbonPage(null);
                openBookmarksDrawer();
              }}
              className="w-full min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold text-center border-t mt-1 pt-1.5 hover:underline cursor-pointer"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              Tüm Sayfa Ayraçlarım ({studyProgress.pageBookmarks.length})
            </button>
          </div>
        )}
      </div>
    );
  };

  // Arapça Mushaf Yaprağı (Tek Sayfa, Sağ Yaprak veya Sol Yaprak)
  const renderMushafLeaf = (
    bundle: PageBundle,
    leafPosition: 'single' | 'right' | 'left',
  ) => {
    const surahTitlesTr = bundle.segments.map((s) => s.surahMeta.shortNameTr).join(' · ');
    const surahTitlesAr = bundle.segments
      .map((s) => formatSafeArabicTitle(s.surahMeta.nameAr))
      .slice(0, 2)
      .join(' · ');

    const paperClass =
      leafPosition === 'right'
        ? 'mushaf-paper-right rounded-2xl lg:rounded-l-none lg:rounded-r-2xl'
        : leafPosition === 'left'
          ? 'mushaf-paper-left rounded-2xl lg:rounded-r-none lg:rounded-l-2xl'
          : 'mushaf-paper-single rounded-2xl';

    const compactPadding = leafPosition !== 'single';
    const pageHasSajdah =
      settings.highlightSajdah && bundle.verses.some((v) => SAJDAH_AYAH_IDS.has(v.id));

    return (
      <div
        key={`mushaf-leaf-${bundle.pageNo}`}
        className={`${paperClass} p-1.5 sm:p-2.5 transition-opacity duration-200 flex flex-col h-full ${
          isRefreshing ? 'opacity-80' : 'opacity-100'
        }`}
      >
        <div className="mushaf-cetvel-outer rounded-xl p-1 flex-1 flex flex-col">
          <div
            className={`mushaf-cetvel-inner rounded-[10px] relative flex-1 flex flex-col justify-between ${
              compactPadding ? 'px-3.5 py-3 sm:px-5 sm:py-4' : 'px-3.5 py-3.5 sm:px-6 sm:py-5'
            }`}
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            {/* 4 Özgün Geometrik Köşe Süsü */}
            <CornerOrnament position="tl" />
            <CornerOrnament position="tr" />
            <CornerOrnament position="bl" />
            <CornerOrnament position="br" />

            <div>
              {/* Klasik Mushaf Üst Şeridi: Kurdele Ayraç · Tıklanabilir Sayfa / Cüz / Sure Konum Seçici */}
              <div
                className="pb-2.5 mb-3.5 border-b flex items-center justify-between gap-2 text-xs"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 shrink-0">
                  {renderRibbonBookmark(bundle)}
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('page');
                    }}
                    title="Sayfa değiştir"
                    className="font-extrabold tabular-nums hover:underline cursor-pointer"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    Sayfa {bundle.pageNo}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onOpenLocationPicker?.('juz');
                    }}
                    title="Cüz seç"
                    className="font-bold tabular-nums text-center px-2.5 py-0.5 rounded-lg text-[11px] hover:opacity-80 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {bundle.cuzs.map((c) => `${c}. Cüz`).join(' / ')}
                  </button>
                  {pageHasSajdah && (
                    <span
                      title="Bu sayfada Tilâvet Secdesi ayeti bulunmaktadır"
                      className="font-extrabold px-2 py-0.5 rounded-lg border text-[11px] inline-flex items-center gap-1 whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        borderColor: 'rgba(217, 119, 6, 0.45)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      <span>۩</span>
                      <span className="hidden xs:inline sm:inline">Secde</span>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onOpenLocationPicker?.('surah');
                  }}
                  title="Sure seç"
                  className="text-right min-w-0 flex items-center gap-1.5 justify-end hover:opacity-80 cursor-pointer"
                >
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
                </button>
              </div>

              {/* Sayfa Bölümleri (Sure Başlıkları + Besmele + Kesintisiz Ayet Akışı) */}
              <div className="space-y-4">
                {bundle.segments.map((segment) => (
                  <div key={`seg-${bundle.pageNo}-${segment.surahMeta.no}`} className="space-y-3">
                    {segment.startsAtAyah1 && (
                      <div
                        className="rounded-xl border px-3.5 py-2 relative overflow-hidden"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'rgba(217, 119, 6, 0.36)',
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                              {segment.surahMeta.no}. {segment.surahMeta.nameTr}
                            </h3>
                            <p
                              className="text-[11px] tabular-nums"
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
                            className="min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
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
                        lineHeight: 2.28,
                        textAlign: 'justify',
                        textAlignLast: 'center',
                      }}
                    >
                      {segment.verses.map((verse) => {
                        const isSelected = selectedVerse?.id === verse.id;
                        const isPlaying = playingAyahId === verse.id;
                        const isSajdah = SAJDAH_AYAH_IDS.has(verse.id);
                        const highlightSajdah = isSajdah && settings.highlightSajdah;
                        const hasDigitsAtEnd = ENDS_WITH_ARABIC_NUMERAL.test(verse.ar.t);

                        const highlightBg = isPlaying
                          ? 'rgba(13, 148, 136, 0.24)'
                          : isSelected
                            ? 'rgba(217, 119, 6, 0.18)'
                            : highlightSajdah
                              ? 'rgba(217, 119, 6, 0.10)'
                              : 'transparent';

                        return (
                          <span
                            key={verse.id}
                            id={`mushaf-ayah-${verse.id}`}
                            data-ayah-id={verse.id}
                            onClick={() => {
                              sfxService.play('click');
                              onSelectVerse(verse);
                              setIsVerseDrawerOpen(true);
                            }}
                            role="button"
                            tabIndex={0}
                            title={
                              highlightSajdah
                                ? `Tilâvet Secdesi Ayeti — ${segment.surahMeta.nameTr} ${verse.ayah}. Ayet`
                                : `${segment.surahMeta.nameTr} ${verse.ayah}. Ayet`
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                sfxService.play('click');
                                onSelectVerse(verse);
                                setIsVerseDrawerOpen(true);
                              }
                            }}
                            className={`inline rounded-lg px-1 py-0.5 transition-colors cursor-pointer hover:bg-teal-600/10 focus-visible:outline-2 focus-visible:outline-teal-600 ${
                              highlightSajdah
                                ? 'underline decoration-amber-500/65 decoration-dotted underline-offset-[10px]'
                                : ''
                            }`}
                            style={{ backgroundColor: highlightBg }}
                          >
                            {verse.ar.t}
                            {highlightSajdah && (
                              <span
                                title="Tilâvet Secdesi Ayeti"
                                aria-label="Tilâvet Secdesi Ayeti"
                                className="inline-flex items-center justify-center mx-1 px-1.5 py-0.5 rounded-md border text-[0.64em] font-extrabold align-middle leading-none select-none"
                                style={{
                                  backgroundColor: 'var(--brand-accent-soft)',
                                  borderColor: 'rgba(217, 119, 6, 0.5)',
                                  color: 'var(--brand-accent-text)',
                                }}
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
                                    : isSelected || highlightSajdah
                                      ? 'var(--brand-accent-text)'
                                      : 'var(--brand-primary-text)',
                                }}
                                title={
                                  highlightSajdah
                                    ? `Tilâvet Secdesi · ${segment.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                    : `${segment.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                }
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

            {/* Alt Klasik Sayfa Numarası */}
            <div
              className="mt-4 pt-2 border-t flex items-center justify-center text-xs font-bold tabular-nums"
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
      </div>
    );
  };

  // Mushaf Çerçeveli Türkçe Meal Yaprağı (Sağ Mushaf · Sol Meal VE Sadece Türkçe Meal modları)
  const renderFacingMealLeaf = (
    bundle: PageBundle,
    side: 'single' | 'right' | 'left' = 'left',
  ) => {
    const mealTitle = isDual
      ? `${primaryMeal.shortLabel} & ${secondaryMeal.shortLabel}`
      : primaryMeal.label;

    const paperClass =
      side === 'right'
        ? 'mushaf-paper-right rounded-2xl lg:rounded-l-none lg:rounded-r-2xl'
        : side === 'left'
          ? 'mushaf-paper-left rounded-2xl lg:rounded-r-none lg:rounded-l-2xl'
          : 'mushaf-paper-single rounded-2xl';

    return (
      <div
        className={`${paperClass} p-1.5 sm:p-2.5 transition-opacity duration-200 flex flex-col h-full ${
          isRefreshing ? 'opacity-80' : 'opacity-100'
        }`}
      >
        <div className="mushaf-cetvel-outer rounded-xl p-1 flex-1 flex flex-col">
          <div
            className="mushaf-cetvel-inner rounded-[10px] relative flex-1 flex flex-col justify-between px-4 py-3.5 sm:px-5 sm:py-4"
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            <CornerOrnament position="tl" />
            <CornerOrnament position="tr" />
            <CornerOrnament position="bl" />
            <CornerOrnament position="br" />

            <div>
              {/* Sol Meal Sayfası Üst Şeridi (+ ◫ Kapat ikonu Tek Sayfa ile %100 senkronize) */}
              <div
                className="pb-2.5 mb-3.5 border-b flex items-center justify-between gap-2 text-xs"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    openMealSelector('primary');
                  }}
                  title="24 Türkçe meal arasından değiştir"
                  className="font-extrabold truncate hover:underline text-left cursor-pointer"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {mealTitle}
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="font-bold tabular-nums px-2 py-0.5 rounded-lg text-[11px]"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Sayfa {bundle.pageNo} Meali
                  </span>
                  {isDoubleMeal && side === 'left' && onChangePageLayout && (
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onChangePageLayout('single');
                      }}
                      title="Meal sayfasını kapat (Tek Sayfa Mushaf)"
                      aria-label="Meal sayfasını kapat"
                      className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer transition-colors hover:opacity-85"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <PanelRightClose className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Kitap Düzeninde Süslü Numaralı Meal Akışı */}
              <div className="space-y-3.5">
                {bundle.segments.map((segment) => (
                  <div key={`meal-seg-${bundle.pageNo}-${segment.surahMeta.no}`} className="space-y-2">
                    {segment.startsAtAyah1 && (
                      <div
                        className="rounded-xl border px-3 py-1.5 flex items-center justify-between gap-2"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <span className="text-xs font-extrabold">
                          {segment.surahMeta.no}. {segment.surahMeta.nameTr} Suresi
                        </span>
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          {segment.surahMeta.ayahCount} Ayet
                        </span>
                      </div>
                    )}

                    {segment.showBesmele && (
                      <p
                        className="turkish-reading text-xs sm:text-sm italic text-center font-semibold py-0.5"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {primaryMeal.id === 'm2' ? besmele.dib : besmele.tdv}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      {segment.verses.map((v) => {
                        const isSelected = selectedVerse?.id === v.id;
                        const isPlaying = playingAyahId === v.id;
                        const isFav = bookmarkedSet.has(v.id);
                        const isSajdah = SAJDAH_AYAH_IDS.has(v.id) && settings.highlightSajdah;
                        const pVerse = getPrimaryVerse(v);
                        const sVerse = isDual ? getSecondaryVerse(v) : null;

                        return (
                          <div
                            key={`facing-meal-${v.id}`}
                            id={`facing-meal-ayah-${v.id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              sfxService.play('click');
                              onSelectVerse(v);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectVerse(v);
                              }
                            }}
                            className="group rounded-xl px-2.5 py-2 transition-colors cursor-pointer border"
                            style={{
                              backgroundColor: isPlaying
                                ? 'var(--brand-primary-soft)'
                                : isSelected
                                  ? 'rgba(217, 119, 6, 0.12)'
                                  : isSajdah
                                    ? 'rgba(217, 119, 6, 0.07)'
                                    : 'transparent',
                              borderColor: isPlaying
                                ? 'var(--brand-primary)'
                                : isSelected
                                  ? 'rgba(217, 119, 6, 0.4)'
                                  : isSajdah
                                    ? 'rgba(217, 119, 6, 0.38)'
                                    : 'transparent',
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-lg text-[11px] font-extrabold tabular-nums shrink-0 mt-0.5"
                                style={{
                                  backgroundColor: isPlaying
                                    ? 'var(--brand-primary)'
                                    : isSelected || isSajdah
                                      ? 'var(--brand-accent)'
                                      : 'var(--bg-surface-soft)',
                                  color:
                                    isPlaying || isSelected || isSajdah
                                      ? '#FFFFFF'
                                      : 'var(--brand-primary-text)',
                                }}
                              >
                                ({v.ayah})
                              </span>

                              <div className="flex-1 min-w-0 space-y-1">
                                {isSajdah && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-extrabold"
                                    style={{
                                      backgroundColor: 'var(--brand-accent-soft)',
                                      borderColor: 'rgba(217, 119, 6, 0.45)',
                                      color: 'var(--brand-accent-text)',
                                    }}
                                  >
                                    <span>۩</span>
                                    <span>Tilâvet Secdesi</span>
                                  </span>
                                )}
                                {pVerse?.t ? (
                                  <p
                                    className="turkish-reading"
                                    style={{
                                      fontSize: `${settings.turkishFontSize}px`,
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    {isDual && (
                                      <span
                                        className="font-extrabold mr-1.5 text-xs"
                                        style={{ color: 'var(--brand-primary-text)' }}
                                      >
                                        {primaryMeal.shortLabel}:
                                      </span>
                                    )}
                                    {pVerse.t}
                                  </p>
                                ) : isLoadingExtra ? (
                                  <div className="h-4 w-4/5 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                                ) : null}

                                {isDual &&
                                  (sVerse?.t ? (
                                    <p
                                      className="turkish-reading"
                                      style={{
                                        fontSize: `${settings.turkishFontSize}px`,
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      <span
                                        className="font-extrabold mr-1.5 text-xs"
                                        style={{ color: 'var(--brand-accent-text)' }}
                                      >
                                        {secondaryMeal.shortLabel}:
                                      </span>
                                      {sVerse.t}
                                    </p>
                                  ) : isLoadingExtra ? (
                                    <div className="h-4 w-3/4 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                                  ) : null)}
                              </div>

                              {/* Satır içi zarif hızlı aksiyonlar */}
                              <div
                                className="flex items-center gap-0.5 shrink-0 opacity-75 group-hover:opacity-100"
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
                                  onClick={() => {
                                    sfxService.play('click');
                                    openMealCompare(v.surah, v.ayah);
                                  }}
                                  title="24 Mealde Karşılaştır"
                                  aria-label={`${v.ayah}. ayeti 24 mealde karşılaştır`}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                  style={{ color: 'var(--brand-primary-text)' }}
                                >
                                  <Scale className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onToggleBookmark(v.id)}
                                  title={isFav ? 'Favorilerden çıkar' : 'Favorile'}
                                  aria-label={isFav ? 'Favorilerden çıkar' : 'Favorile'}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-amber-500/15 cursor-pointer"
                                  style={{
                                    color: isFav ? 'var(--brand-accent-text)' : 'var(--text-muted)',
                                  }}
                                >
                                  <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    sfxService.play('click');
                                    onSelectVerse(v);
                                    setIsVerseDrawerOpen(true);
                                  }}
                                  title="Dipnot, kelime meali ve ayet detayı"
                                  aria-label={`${v.ayah}. ayet detayını aç`}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-teal-600/15 cursor-pointer"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alt Bilgi */}
            <div
              className="mt-4 pt-2 border-t flex items-center justify-between gap-2 text-[11px] font-semibold"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              <span>Senkronize Meal Sayfası</span>
              <span className="tabular-nums">Sayfa {bundle.pageNo}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3" onClick={handleMobileEmptySpaceTap}>
      {/* ====================================================================
          ANA ALAN: Gerçekçi Mushaf Kitap Çerçevesi
          - Tek Sayfa: Odaklı ortalanmış Mushaf yaprağı (tıklanan ayet DraggableVerseInspector açar)
          - 2 Sayfa: Yan yana 2 Arapça Mushaf yaprağı (lg+)
          - Mushaf + Meal: Sağ Mushaf · Sol Senkronize Meal yaprağı (lg+, ◫ ile tek tıkla Tek Sayfa'ya döner)
          ==================================================================== */}
      <div
        className={isBookSpread ? 'space-y-3' : 'max-w-3xl mx-auto w-full space-y-3'}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isMealOnly ? (
          isDoubleMushaf && secondPageBundle ? (
            <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-0 items-stretch">
                <div
                  aria-hidden="true"
                  className="hidden lg:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
                />
                <div>{renderFacingMealLeaf(pageBundle, 'left')}</div>
                <div>{renderFacingMealLeaf(secondPageBundle, 'right')}</div>
              </div>
            </div>
          ) : (
            <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
              {renderFacingMealLeaf(pageBundle, 'single')}
            </div>
          )
        ) : isDoubleMushaf && secondPageBundle ? (
          /* AÇIK MUSHAF YAYILIMI (2 Sayfa Arapça): Gerçek RTL kitap açılımı — SAĞDA pageNo, SOLDA pageNo+1 */
          <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-0 items-stretch">
              <div
                aria-hidden="true"
                className="hidden lg:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
              />
              <div className="order-2 lg:order-1">
                {renderMushafLeaf(secondPageBundle, 'left')}
              </div>
              <div className="order-1 lg:order-2">
                {renderMushafLeaf(pageBundle, 'right')}
              </div>
            </div>
          </div>
        ) : isDoubleMeal ? (
          /* SAĞ MUSHAF · SOL MEAL AÇIK KİTAP YAYILIMI */
          <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-0 items-stretch">
              <div
                aria-hidden="true"
                className="hidden lg:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
              />
              <div className="order-2 lg:order-1">{renderFacingMealLeaf(pageBundle, 'left')}</div>
              <div className="order-1 lg:order-2">{renderMushafLeaf(pageBundle, 'right')}</div>
            </div>
          </div>
        ) : (
          /* TEK SAYFA MUSHAF (Katmanlı Yaprak Kenarlı Cilt Çerçevesi) */
          <div className="mushaf-cover-frame rounded-[22px] sm:rounded-[26px] p-1.5 sm:p-2.5">
            {renderMushafLeaf(pageBundle, 'single')}
          </div>
        )}

        {/* Sade Sayfa Geçiş Kontrolleri + Ayet İncele Tetikleyicisi */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => {
              sfxService.play('click');
              onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
            }}
            className="flex-1 sm:flex-initial min-h-[40px] px-3.5 sm:px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">
              {isDoubleMushaf ? 'Sonraki 2 Sayfa' : 'Sonraki Sayfa'}
            </span>
          </button>

          <div className="flex items-center justify-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onOpenLocationPicker?.('page');
              }}
              className="hidden sm:inline-flex text-xs font-bold tabular-nums hover:underline cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              {isDoubleMushaf && secondPageBundle
                ? `Sayfa ${pageBundle.pageNo}–${secondPageBundle.pageNo}`
                : `Sayfa ${pageBundle.pageNo}`}
            </button>

            {selectedVerse && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsVerseDrawerOpen((prev) => !prev);
                }}
                aria-pressed={isVerseDrawerOpen}
                className="min-h-[36px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isVerseDrawerOpen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isVerseDrawerOpen ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isVerseDrawerOpen
                    ? `Kapat (${selectedVerse.ayah})`
                    : isArOnly || isDoubleMushaf
                      ? `Meal (${selectedVerse.ayah})`
                      : `Ayet (${selectedVerse.ayah})`}
                </span>
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
            className="flex-1 sm:flex-initial min-h-[40px] px-3.5 sm:px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="whitespace-nowrap">
              {isDoubleMushaf ? 'Önceki 2 Sayfa' : 'Önceki Sayfa'}
            </span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAŞINABİLİR KOMPAKT AYET İNCELEME PENCERESİ (Arka Planı Karartmaz/Kilitlemez)
          ==================================================================== */}
      <DraggableVerseInspector
        isOpen={isVerseDrawerOpen}
        verse={selectedVerse}
        surahMeta={selectedSurahMeta}
        settings={settings}
        wordMode={wordMode}
        isBookmarked={Boolean(selectedVerse && bookmarkedSet.has(selectedVerse.id))}
        isPlaying={Boolean(selectedVerse && playingAyahId === selectedVerse.id)}
        onClose={() => setIsVerseDrawerOpen(false)}
        onPlayFromVerse={(v) => onPlayFromVerse(v, false)}
        onPlayMealFromVerse={onPlayMealFromVerse}
        onToggleBookmark={onToggleBookmark}
        onShareVerse={onShareVerse}
        onOpenSurahInfo={onOpenSurahInfo}
      />
    </div>
  );
};
