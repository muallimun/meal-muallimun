import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
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
  PanelRightClose,
  PanelRightOpen,
  Play,
  Share2,
  Sparkles,
  Square,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react';
import { BOOKMARK_COLOR_STYLES } from '../../components/PageBookmarksDrawer';
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
import { WordMealGrid } from './WordMealGrid';

interface MushafPageViewProps {
  pageBundle: PageBundle;
  secondPageBundle?: PageBundle | null;
  pageLayout?: PageLayoutMode;
  onChangePageLayout?: (layout: PageLayoutMode) => void;
  contentMode?: BookContentMode;
  sidePanelOpen?: boolean;
  onToggleSidePanel?: () => void;
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
}

type InspectorTab = 'all_page' | 'selected';

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
  sidePanelOpen = true,
  onToggleSidePanel,
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
}) => {
  const {
    studyProgress,
    upsertPageBookmark,
    moveHatimBookmark,
    removePageBookmark,
    openBookmarksDrawer,
  } = useAppStore();

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('all_page');
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [showWordsOverride, setShowWordsOverride] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [openRibbonPage, setOpenRibbonPage] = useState<number | null>(null);
  const [isVerseDrawerOpen, setIsVerseDrawerOpen] = useState<boolean>(false);
  const mealScrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const isArOnly = contentMode === 'ar_only';
  const isMealOnly = contentMode === 'meal_only';
  const isDoubleMushaf = pageLayout === 'double_mushaf' && Boolean(secondPageBundle);
  const isDoubleMeal = pageLayout === 'double_meal' && contentMode === 'interleaved';
  const isBookSpread = isDoubleMushaf || isDoubleMeal;
  const showSideMealPanel =
    !isBookSpread && contentMode === 'interleaved' && sidePanelOpen;

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

  const selectedVerse =
    allVisibleVerses.find((v) => v.id === selectedVerseId) ?? allVisibleVerses[0] ?? null;

  const selectedSurahMeta = selectedVerse
    ? surahMetaByNo.get(selectedVerse.surah) ?? pageBundle.segments[0]?.surahMeta ?? null
    : pageBundle.segments[0]?.surahMeta ?? null;

  // Ayet değişince dipnot çekmecesini kapat
  useEffect(() => {
    setShowFootnotes(false);
  }, [selectedVerse?.id]);

  // Sayfa değişince açık kurdele menüsünü kapat
  useEffect(() => {
    setOpenRibbonPage(null);
  }, [pageBundle.pageNo]);

  // Çalan/seçilen ayet değişince meal listesini de ilgili ayete yumuşakça kaydır
  useEffect(() => {
    const targetId = playingAyahId ?? selectedVerseId;
    if (!targetId) return;
    if (isDoubleMeal) {
      const el = document.getElementById(`facing-meal-ayah-${targetId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (inspectorTab !== 'all_page' || !mealScrollRef.current) return;
    const itemEl = mealScrollRef.current.querySelector<HTMLElement>(
      `[data-meal-ayah-id="${targetId}"]`,
    );
    if (itemEl) {
      itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [playingAyahId, selectedVerseId, inspectorTab, isDoubleMeal]);

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
  const footnoteCount = settings.showFootnotes
    ? settings.preferredMeal === 'm1'
      ? tdvFootnotes.length
      : settings.preferredMeal === 'm2'
        ? dibFootnotes.length
        : tdvFootnotes.length + dibFootnotes.length
    : 0;

  const isSelectedBookmarked = selectedVerse ? bookmarkedSet.has(selectedVerse.id) : false;
  const shouldShowWordsInInspector =
    settings.wordByWordEnabled && (wordMode !== 'off' || showWordsOverride);
  const effectiveWordMode: Exclude<WordMealMode, 'off'> =
    wordMode === 'quiz' ? 'quiz' : 'visible';

  const canGoPrev = pageBundle.pageNo > pageBundle.minPage;
  const canGoNext =
    (isDoubleMushaf && secondPageBundle ? secondPageBundle.pageNo : pageBundle.pageNo) <
    pageBundle.maxPage;

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
        ? 'mushaf-paper-right rounded-2xl xl:rounded-l-none xl:rounded-r-2xl'
        : leafPosition === 'left'
          ? 'mushaf-paper-left rounded-2xl xl:rounded-r-none xl:rounded-l-2xl'
          : 'mushaf-paper-single rounded-2xl';

    const compactPadding = leafPosition !== 'single';
    const pageHasSajdah =
      settings.highlightSajdah && bundle.verses.some((v) => SAJDAH_AYAH_IDS.has(v.id));

    return (
      <div
        key={`mushaf-leaf-${bundle.pageNo}`}
        className={`${paperClass} p-2 sm:p-2.5 transition-opacity duration-200 flex flex-col h-full ${
          isRefreshing ? 'opacity-80' : 'opacity-100'
        }`}
      >
        <div className="mushaf-cetvel-outer rounded-xl p-1 flex-1 flex flex-col">
          <div
            className={`mushaf-cetvel-inner rounded-[10px] relative flex-1 flex flex-col justify-between ${
              compactPadding ? 'px-4 py-3.5 sm:px-5 sm:py-4' : 'px-4 py-4 sm:px-6 sm:py-5'
            }`}
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            {/* 4 Özgün Geometrik Köşe Süsü */}
            <CornerOrnament position="tl" />
            <CornerOrnament position="tr" />
            <CornerOrnament position="bl" />
            <CornerOrnament position="br" />

            <div>
              {/* Klasik Mushaf Üst Şeridi: Kurdele Ayraç · Sayfa · Cüz · Sure */}
              <div
                className="pb-2.5 mb-3.5 border-b flex items-center justify-between gap-2 text-xs"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 shrink-0">
                  {renderRibbonBookmark(bundle)}
                  <span
                    className="font-extrabold tabular-nums"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    Sayfa {bundle.pageNo}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="font-bold tabular-nums text-center px-2.5 py-0.5 rounded-lg text-[11px]"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {bundle.cuzs.map((c) => `${c}. Cüz`).join(' / ')}
                  </span>
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

                <div className="text-right min-w-0 flex items-center gap-1.5 justify-end">
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
                              if (!showSideMealPanel) {
                                setIsVerseDrawerOpen(true);
                              }
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
                                if (!showSideMealPanel) {
                                  setIsVerseDrawerOpen(true);
                                }
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
    const mealTitle =
      settings.preferredMeal === 'both'
        ? 'TDV & DİB Karşılaştırmalı Meal'
        : settings.preferredMeal === 'm2'
          ? 'Diyanet İşleri Yeni Meali (DİB)'
          : 'Diyanet Vakfı Meali (TDV)';

    const paperClass =
      side === 'right'
        ? 'mushaf-paper-right rounded-2xl xl:rounded-l-none xl:rounded-r-2xl'
        : side === 'left'
          ? 'mushaf-paper-left rounded-2xl xl:rounded-r-none xl:rounded-l-2xl'
          : 'mushaf-paper-single rounded-2xl';

    return (
      <div
        className={`${paperClass} p-2 sm:p-2.5 transition-opacity duration-200 flex flex-col h-full ${
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
              {/* Sol Meal Sayfası Üst Şeridi */}
              <div
                className="pb-2.5 mb-3.5 border-b flex items-center justify-between gap-2 text-xs"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span
                  className="font-extrabold truncate"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {mealTitle}
                </span>
                <span
                  className="font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-lg text-[11px]"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Sayfa {bundle.pageNo} Meali
                </span>
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
                        {settings.preferredMeal === 'm2' ? besmele.dib : besmele.tdv}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      {segment.verses.map((v) => {
                        const isSelected = selectedVerse?.id === v.id;
                        const isPlaying = playingAyahId === v.id;
                        const isFav = bookmarkedSet.has(v.id);
                        const isSajdah = SAJDAH_AYAH_IDS.has(v.id) && settings.highlightSajdah;

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
                                {(settings.preferredMeal === 'm1' ||
                                  settings.preferredMeal === 'both') &&
                                  v.m1 && (
                                    <p
                                      className="turkish-reading"
                                      style={{
                                        fontSize: `${settings.turkishFontSize}px`,
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

                                {(settings.preferredMeal === 'm2' ||
                                  settings.preferredMeal === 'both') &&
                                  v.m2 && (
                                    <p
                                      className="turkish-reading"
                                      style={{
                                        fontSize: `${settings.turkishFontSize}px`,
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

  // Seçili Ayet Ayrıntı Bloğu (Dipnot + Kelime Meali + Dinleme Aksiyonları)
  const renderSelectedVerseDetail = () => {
    if (!selectedVerse || !selectedSurahMeta) return null;
    return (
      <div className="space-y-3.5">
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm sm:text-base font-extrabold tracking-tight">
                {selectedSurahMeta.nameTr} · {selectedVerse.ayah}. Ayet
              </h4>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {selectedVerse.cuz}. Cüz · Sayfa {selectedVerse.page}
                {SAJDAH_AYAH_IDS.has(selectedVerse.id) && settings.highlightSajdah && (
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
              className="min-w-[36px] min-h-[36px] rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPlayFromVerse(selectedVerse, false)}
              className="flex-1 min-h-[40px] px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Headphones className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Bu Ayetten Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => onPlayMealFromVerse(selectedVerse)}
              title="Bu ayetten itibaren sadece Türkçe sesli mealini dinle"
              className="flex-1 min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'var(--brand-accent)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Volume2 className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Sesli Meal</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleBookmark(selectedVerse.id)}
              aria-label={isSelectedBookmarked ? 'Yıldızlılardan çıkar' : 'Yıldızla'}
              className="min-h-[40px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer"
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
              <Star className={`w-4 h-4 ${isSelectedBookmarked ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => handleCopyVerse(selectedVerse, selectedSurahMeta.nameTr)}
              aria-label="Kopyala"
              className="min-h-[40px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer"
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
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onShareVerse(selectedVerse, selectedSurahMeta);
              }}
              aria-label="Paylaşım kartı oluştur"
              className="min-h-[40px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Seçili Meal(ler) */}
        <div
          className="p-3.5 rounded-xl border space-y-3"
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
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
              style={{
                backgroundColor: showFootnotes
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface)',
                borderColor: showFootnotes ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color: showFootnotes ? 'var(--brand-primary-text)' : 'var(--text-primary)',
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
                className="mt-2 p-3.5 rounded-xl border space-y-2.5 text-xs sm:text-sm leading-relaxed"
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

        {/* Kelime-Kelime Meal Alanı (Sadece wordByWordEnabled açıkken görünür) */}
        {settings.wordByWordEnabled && selectedVerse.words.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold flex items-center gap-1.5">
                <Languages className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
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
    );
  };

  return (
    <div
      className={
        showSideMealPanel
          ? 'grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 items-start'
          : 'space-y-4'
      }
    >
      {/* ====================================================================
          ANA ALAN: Gerçekçi Mushaf Kitap Çerçevesi
          - Arapça + Meal / Sadece Arapça / Sadece Türkçe Meal tam uyumlu
          - Çift sayfa modlarında altta mükerrer meal BLOĞU KESİNLİKLE yok!
          ==================================================================== */}
      <div
        className={
          showSideMealPanel
            ? 'lg:col-span-7 space-y-3'
            : isBookSpread
              ? 'space-y-3'
              : 'max-w-3xl mx-auto w-full space-y-3'
        }
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isMealOnly ? (
          isDoubleMushaf && secondPageBundle ? (
            /* SADECE TÜRKÇE MEAL — 2 SAYFA AÇIK KİTAP (Sol: pageNo, Sağ: pageNo+1 — Türkçe LTR akış) */
            <div className="mushaf-cover-frame rounded-[26px] p-2 sm:p-2.5">
              <div className="relative grid grid-cols-1 xl:grid-cols-2 gap-3 xl:gap-0 items-stretch">
                <div
                  aria-hidden="true"
                  className="hidden xl:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
                />
                <div>{renderFacingMealLeaf(pageBundle, 'left')}</div>
                <div>{renderFacingMealLeaf(secondPageBundle, 'right')}</div>
              </div>
            </div>
          ) : (
            /* SADECE TÜRKÇE MEAL — TEK MUSHAF YAPRAĞI ÇERÇEVESİNDE */
            <div className="mushaf-cover-frame rounded-[26px] p-2 sm:p-2.5">
              {renderFacingMealLeaf(pageBundle, 'single')}
            </div>
          )
        ) : isDoubleMushaf && secondPageBundle ? (
          /* AÇIK MUSHAF YAYILIMI (2 Sayfa Arapça): Gerçek RTL kitap açılımı — SAĞDA pageNo, SOLDA pageNo+1 */
          <div className="mushaf-cover-frame rounded-[26px] p-2 sm:p-2.5">
            <div className="relative grid grid-cols-1 xl:grid-cols-2 gap-3 xl:gap-0 items-stretch">
              {/* Ortadaki Gerçekçi Cilt Kıvrımı Gölgesi */}
              <div
                aria-hidden="true"
                className="hidden xl:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
              />
              {/* SOL YAPRAK: Sonraki sayfa (pageNo + 1) */}
              <div className="order-2 xl:order-1">
                {renderMushafLeaf(secondPageBundle, 'left')}
              </div>
              {/* SAĞ YAPRAK: Küçük sayfa (pageNo) */}
              <div className="order-1 xl:order-2">
                {renderMushafLeaf(pageBundle, 'right')}
              </div>
            </div>
          </div>
        ) : isDoubleMeal ? (
          /* SAĞ MUSHAF · SOL MEAL AÇIK KİTAP YAYILIMI */
          <div className="mushaf-cover-frame rounded-[26px] p-2 sm:p-2.5">
            <div className="relative grid grid-cols-1 xl:grid-cols-2 gap-3 xl:gap-0 items-stretch">
              <div
                aria-hidden="true"
                className="hidden xl:block pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-8 z-10 mushaf-spine-seam"
              />
              {/* SOL YAPRAK: Kitap Sayfası Formatında Senkronize Meal */}
              <div className="order-2 xl:order-1">{renderFacingMealLeaf(pageBundle, 'left')}</div>
              {/* SAĞ YAPRAK: Arapça Mushaf Sayfası */}
              <div className="order-1 xl:order-2">{renderMushafLeaf(pageBundle, 'right')}</div>
            </div>
          </div>
        ) : (
          /* TEK SAYFA MUSHAF (Katmanlı Yaprak Kenarlı Cilt Çerçevesi) */
          <div className="mushaf-cover-frame rounded-[26px] p-2 sm:p-2.5">
            {renderMushafLeaf(pageBundle, 'single')}
          </div>
        )}

        {/* Mushaf Sayfa Geçiş Kontrolleri + 3'lü Masaüstü Sayfa Düzeni + Talep Üzerine Ayet Detay */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => {
              sfxService.play('click');
              onChangePage(Math.min(pageBundle.maxPage, pageBundle.pageNo + pageStep));
            }}
            className="flex-1 sm:flex-initial min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
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

          {/* Orta: Sayfa Özeti + Masaüstü 3'lü Sayfa Düzeni + Yan Panel/Ayet İncele */}
          <div className="hidden sm:flex flex-wrap items-center justify-center gap-2">
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              {isDoubleMushaf && secondPageBundle
                ? `Sayfa ${pageBundle.pageNo}–${secondPageBundle.pageNo}`
                : `Sayfa ${pageBundle.pageNo}`}
            </span>

            {onChangePageLayout && (
              <div
                className="hidden xl:flex items-center p-0.5 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {(
                  [
                    { id: 'single', label: 'Tek Sayfa', icon: Square },
                    {
                      id: 'double_mushaf',
                      label: isMealOnly ? '2 Sayfa Meal' : '2 Sayfa Mushaf',
                      icon: Columns2,
                    },
                    ...(contentMode === 'interleaved'
                      ? [{ id: 'double_meal' as const, label: 'Mushaf + Meal', icon: BookOpen }]
                      : []),
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = pageLayout === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onChangePageLayout(opt.id);
                      }}
                      className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Yan Meal Paneli Kapalıysa Tek Tıkla Geri Aç */}
            {!isBookSpread &&
              contentMode === 'interleaved' &&
              !sidePanelOpen &&
              onToggleSidePanel && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onToggleSidePanel();
                  }}
                  className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <PanelRightOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Meal Panelini Aç</span>
                </button>
              )}

            {/* Yan Panel Yokken Taşınabilir Kompakt İnceleme Penceresi Tetikleyicisi */}
            {!showSideMealPanel && selectedVerse && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsVerseDrawerOpen((prev) => !prev);
                }}
                aria-pressed={isVerseDrawerOpen}
                className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: isVerseDrawerOpen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isVerseDrawerOpen
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isVerseDrawerOpen
                    ? `İncelemeyi Kapat (${selectedVerse.ayah})`
                    : isArOnly || isDoubleMushaf
                      ? `Ayet Meal & Detay (${selectedVerse.ayah})`
                      : `Ayet Detay (${selectedVerse.ayah})`}
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
            className="flex-1 sm:flex-initial min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
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

        {/* Mobil (<640px) Hızlı Yardımcı Şerit: Meal Panelini Aç & Taşınabilir İnceleme Penceresi */}
        {((!isBookSpread && contentMode === 'interleaved' && !sidePanelOpen && onToggleSidePanel) ||
          (!showSideMealPanel && selectedVerse)) && (
          <div className="flex sm:hidden flex-wrap items-center justify-center gap-2">
            {!isBookSpread &&
              contentMode === 'interleaved' &&
              !sidePanelOpen &&
              onToggleSidePanel && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onToggleSidePanel();
                  }}
                  className="flex-1 min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <PanelRightOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Meal Panelini Aç</span>
                </button>
              )}

            {!showSideMealPanel && selectedVerse && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsVerseDrawerOpen((prev) => !prev);
                }}
                aria-pressed={isVerseDrawerOpen}
                className="flex-1 min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: isVerseDrawerOpen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isVerseDrawerOpen
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isVerseDrawerOpen
                    ? `İncelemeyi Kapat (${selectedVerse.ayah})`
                    : isArOnly || isDoubleMushaf
                      ? `Ayet Meal & Detay (${selectedVerse.ayah})`
                      : `Ayet Detay (${selectedVerse.ayah})`}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ====================================================================
          YAN MEAL & İNCELEME PANELİ:
          Yalnızca Tek Sayfa + Arapça+Meal modunda ve `sidePanelOpen === true` iken görünür.
          ==================================================================== */}
      {showSideMealPanel && (
        <aside className="lg:col-span-5 lg:sticky lg:top-16 surface-card rounded-2xl overflow-hidden flex flex-col lg:max-h-[calc(100dvh-5rem)]">
          {/* Panel Sekmeleri + Yan Paneli Kapat Butonu */}
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
                className="min-h-[36px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor:
                    inspectorTab === 'all_page' ? 'var(--bg-surface)' : 'transparent',
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
                className="min-h-[36px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor:
                    inspectorTab === 'selected' ? 'var(--bg-surface)' : 'transparent',
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

            {onToggleSidePanel && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onToggleSidePanel();
                }}
                title="Meal panelini kapat"
                aria-label="Meal panelini kapat"
                className="hidden lg:flex w-9 h-9 rounded-xl border items-center justify-center cursor-pointer shrink-0 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Panel İçeriği */}
          <div ref={mealScrollRef} className="p-3.5 overflow-y-auto flex-1">
            {inspectorTab === 'all_page' ? (
              <div
                className={
                  isDoubleMushaf ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5' : 'space-y-2.5'
                }
              >
                {allVisibleVerses.map((v) => {
                  const surahMeta = surahMetaByNo.get(v.surah);
                  const isSelected = selectedVerse?.id === v.id;
                  const isPlaying = playingAyahId === v.id;
                  const isFav = bookmarkedSet.has(v.id);
                  const isSajdah = SAJDAH_AYAH_IDS.has(v.id) && settings.highlightSajdah;
                  const fnTotal = settings.showFootnotes
                    ? (settings.preferredMeal !== 'm2' ? v.m1?.fn?.length ?? 0 : 0) +
                      (settings.preferredMeal !== 'm1' ? v.m2?.fn?.length ?? 0 : 0)
                    : 0;

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
                      className="w-full text-left p-3 rounded-xl border transition-all cursor-pointer space-y-1.5"
                      style={{
                        backgroundColor: isPlaying
                          ? 'var(--brand-primary-soft)'
                          : isSelected
                            ? 'var(--bg-surface-soft)'
                            : isSajdah
                              ? 'rgba(217, 119, 6, 0.06)'
                              : 'var(--bg-surface)',
                        borderColor: isPlaying
                          ? 'var(--brand-primary)'
                          : isSelected
                            ? 'var(--brand-accent)'
                            : isSajdah
                              ? 'rgba(217, 119, 6, 0.42)'
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
                          {isSajdah && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold whitespace-nowrap"
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
                            title="Ayet ayrıntısı"
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
            ) : (
              renderSelectedVerseDetail()
            )}
          </div>
        </aside>
      )}

      {/* ====================================================================
          TAŞINABİLİR KOMPAKT AYET İNCELEME PENCERESİ (Arka Planı Karartmaz/Kilitlemez)
          ==================================================================== */}
      <DraggableVerseInspector
        isOpen={isVerseDrawerOpen && !showSideMealPanel}
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
