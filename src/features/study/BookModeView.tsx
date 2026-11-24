import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeftRight,
  BookMarked,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Headphones,
  Info,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pin,
  Play,
  Repeat,
  Scale,
  Share2,
  Star,
  StickyNote,
  Volume2,
} from 'lucide-react';
import {
  AyahEndMarker,
  ENDS_WITH_ARABIC_AYAH_MARKER,
} from '../../components/AyahEndMarker';
import { ResponsiveActionMenu } from '../../components/ResponsiveActionMenu';
import {
  MEALS_CATALOG,
  getMealTextPresentation,
  resolveMealBesmelePresentation,
  resolveSpokenMealInfo,
} from '../../config/mealsConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { useMutashabihatData, useRukusData } from '../../hooks/useStudyReferenceData';
import { useTajweedData } from '../../hooks/useTajweedData';
import { audioQueueService } from '../../services/audioQueueService';
import { hasActiveBackStackEntries } from '../../services/backStackService';
import { RukuMarkerBadge } from './StudyPopovers';
import { SyncedVerseArabic } from './SyncedArabicText';
import { SAJDAH_AYAH_IDS } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import {
  VERSE_NOTE_COLOR_STYLES,
  makeVerseNoteKey,
  verseNotesStorage,
} from '../../services/verseNotesStorage';
import { useAppStore } from '../../store/useAppStore';
import type {
  BookContentMode,
  CombinedVerse,
  SurahBundle,
  SurahMeta,
} from '../../types/quran';
import {
  formatSafeArabicTitle,
  formatSurahTitle,
  getArabicDensityMetrics,
} from '../../utils/arabicUtils';

interface BookModeViewProps {
  bundle: SurahBundle;
  besmeleAr: string;
  playingAyahId: number | null;
  isAudioPlaying: boolean;
  onPlayFromAyah: (ayahIndex: number, modeOverride?: 'ar' | 'meal') => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenSurahInfo: (surah: SurahMeta) => void;
  onSelectPrevSurah: () => void;
  onSelectNextSurah: () => void;
  onOpenLocationPicker?: () => void;
  onToggleMobileImmersive?: () => void;
}

export const BookModeView: React.FC<BookModeViewProps> = ({
  bundle,
  besmeleAr,
  playingAyahId,
  isAudioPlaying,
  onPlayFromAyah,
  onShareVerse,
  onOpenSurahInfo,
  onSelectPrevSurah,
  onSelectNextSurah,
  onOpenLocationPicker,
  onToggleMobileImmersive,
}) => {
  const {
    settings,
    studyProgress,
    toggleBookmarkAyah,
    moveHatimBookmark,
    openMealCompare,
    openMutashabihat,
    openQuickMemorize,
    openQuickResearch,
    openVerseNoteModal,
    openListeningDrawer,
    manifest,
    meta,
    audioPrefs,
    selectedVerseKey,
    setSelectedVerseKey,
  } = useAppStore();

  const { getCount: getMutashabihatCount } = useMutashabihatData(true);
  const { getRukuEndingAt } = useRukusData(settings.showRukuMarkers);
  const verseNotesMap = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getMapSnapshot,
  );

  const bookSurahNos = useMemo(() => [bundle.surahMeta.no], [bundle.surahMeta.no]);
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(bookSurahNos);

  const {
    rules: tjRules,
    besmele: tjBesmele,
    getVerseWords: getTjVerseWords,
  } = useTajweedData(bookSurahNos, settings.tajweedEnabled);

  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [openMenuAyahId, setOpenMenuAyahId] = useState<number | null>(null);
  const [openFootnoteAyahId, setOpenFootnoteAyahId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const activeMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || hasActiveBackStackEntries()) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

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

      if (e.key === 'Escape') {
        if (selectedVerseKey) {
          setSelectedVerseKey(null);
        }
        return;
      }

      const isLtrReading = settings.readerContentMode === 'meal_only';
      if (e.key === 'ArrowLeft') {
        if (isLtrReading) {
          if (bundle.surahMeta.no > 1) {
            e.preventDefault();
            onSelectPrevSurah();
          }
        } else if (bundle.surahMeta.no < 114) {
          e.preventDefault();
          onSelectNextSurah();
        }
      } else if (e.key === 'ArrowRight') {
        if (isLtrReading) {
          if (bundle.surahMeta.no < 114) {
            e.preventDefault();
            onSelectNextSurah();
          }
        } else if (bundle.surahMeta.no > 1) {
          e.preventDefault();
          onSelectPrevSurah();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedVerseKey,
    setSelectedVerseKey,
    settings.readerContentMode,
    bundle.surahMeta.no,
    onSelectPrevSurah,
    onSelectNextSurah,
  ]);

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const isMealAudioFlowActive =
    (audioState.status === 'playing' || audioState.status === 'loading') &&
    (audioState.activePhase === 'meal' ||
      audioPrefs.mode === 'meal' ||
      audioPrefs.mode === 'ar_then_meal');
  const activeSpokenMeal = useMemo(
    () =>
      resolveSpokenMealInfo(
        audioState.activePhase === 'meal' ? audioState.activeSourceKey : audioPrefs.mealAudioSource,
        manifest,
      ),
    [audioState.activePhase, audioState.activeSourceKey, audioPrefs.mealAudioSource, manifest],
  );

  const bookMode: BookContentMode =
    settings.readerContentMode === 'ar_only'
      ? 'ar_only'
      : settings.readerContentMode === 'meal_only'
        ? 'meal_only'
        : 'interleaved';
  const isDoubleBookLayout = settings.desktopPageLayout === 'dual';
  const useRtlDoubleGrid = isDoubleBookLayout && bookMode !== 'meal_only';
  const isHatimOnSurahStart = studyProgress.pageBookmarks.some(
    (b) => b.isHatim && b.page === bundle.surahMeta.pageStart,
  );
  const bookmarkedSet = useMemo(
    () => new Set(studyProgress.bookmarkedAyahIds),
    [studyProgress.bookmarkedAyahIds],
  );

  const favoriteCountInSurah = useMemo(
    () => bundle.verses.filter((v) => bookmarkedSet.has(v.id)).length,
    [bundle.verses, bookmarkedSet],
  );

  const visibleVerses = useMemo(() => {
    if (!onlyFavorites) return bundle.verses;
    return bundle.verses.filter((v) => bookmarkedSet.has(v.id));
  }, [bundle.verses, onlyFavorites, bookmarkedSet]);

  const verseIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    bundle.verses.forEach((v, idx) => map.set(v.id, idx));
    return map;
  }, [bundle.verses]);

  const selectedArabicVerse = useMemo(() => {
    if (!selectedVerseKey) return null;
    const [sStr, aStr] = selectedVerseKey.split(':');
    const s = Number(sStr);
    const a = Number(aStr);
    if (s !== bundle.surahMeta.no || !Number.isFinite(a)) return null;
    return bundle.verses.find((v) => v.ayah === a) ?? null;
  }, [bundle.surahMeta.no, bundle.verses, selectedVerseKey]);

  const handleToggleSelectVerse = (verse: CombinedVerse) => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : '';
    if (sel) return;
    sfxService.play('click');
    const key = `${verse.surah}:${verse.ayah}`;
    if (selectedVerseKey === key) {
      setSelectedVerseKey(null);
      return;
    }
    setSelectedVerseKey(key);
    audioQueueService.syncPausedSelection(verse, meta);
  };

  const handleCopyVerse = async (verse: CombinedVerse) => {
    const pVerse = getPrimaryVerse(verse);
    const sVerse = isDual ? getSecondaryVerse(verse) : null;
    const mealLines: string[] = [];
    if (pVerse?.t) {
      mealLines.push(isDual ? `${primaryMeal.shortLabel}: ${pVerse.t}` : pVerse.t);
    }
    if (isDual && sVerse?.t) {
      mealLines.push(`${secondaryMeal.shortLabel}: ${sVerse.t}`);
    }
    const mealText = mealLines.join('\n') || verse.m1?.t || verse.m2?.t || '';
    const surahTitle = formatSurahTitle(bundle.surahMeta.nameTr, bundle.surahMeta.no);
    const text =
      bookMode === 'ar_only'
        ? `${verse.ar.t}\n— ${surahTitle}, ${verse.ayah}. Ayet`
        : bookMode === 'meal_only'
          ? `${mealText}\n— ${surahTitle}, ${verse.ayah}. Ayet (${primaryMeal.shortLabel})`
          : `${verse.ar.t}\n\n${mealText}\n— ${surahTitle}, ${verse.ayah}. Ayet (${primaryMeal.shortLabel})`;

    try {
      await navigator.clipboard.writeText(text);
      sfxService.play('click');
      setCopiedId(verse.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === verse.id ? null : prev)), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const renderVerseActionMenu = (
    verse: CombinedVerse,
    isSelected: boolean,
    isPlaying: boolean,
  ) => {
    const originalIdx = verseIndexMap.get(verse.id) ?? 0;
    const isBookmarked = bookmarkedSet.has(verse.id);
    const isMenuOpen = openMenuAyahId === verse.id;
    const showLabeledPlayActions = isSelected || isPlaying;

    return (
      <div
        className="relative flex items-center gap-1 ml-auto shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            setSelectedVerseKey(`${verse.surah}:${verse.ayah}`);
            onPlayFromAyah(originalIdx);
          }}
          title="Bu ayetten itibaren kesintisiz dinle"
          aria-label={`${verse.ayah}. ayetten itibaren dinle`}
          className={`inline-flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
            showLabeledPlayActions
              ? 'px-2.5 bg-[var(--brand-primary)] text-white shadow-xs hover:opacity-90'
              : 'w-8 sm:w-auto sm:px-2 text-[var(--text-secondary)] sm:opacity-75 sm:group-hover:opacity-100 hover:bg-[var(--brand-primary-soft)] hover:text-[var(--brand-primary-text)]'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current shrink-0" />
          <span className={showLabeledPlayActions ? 'inline' : 'hidden sm:inline'}>
            Buradan Dinle
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedVerseKey(`${verse.surah}:${verse.ayah}`);
            onPlayFromAyah(originalIdx, 'meal');
          }}
          title="Bu ayetten itibaren Türkçe sesli mealini dinle"
          aria-label={`${verse.ayah}. ayetten itibaren sesli meal dinle`}
          className={`inline-flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
            showLabeledPlayActions
              ? 'px-2.5 bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] border border-[var(--brand-accent)]/40 hover:opacity-90'
              : 'hidden sm:inline-flex sm:px-2 text-[var(--brand-accent-text)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:bg-[var(--brand-accent-soft)]'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5 shrink-0" />
          <span>Sesli Meal</span>
        </button>

        <button
          type="button"
          onClick={() => toggleBookmarkAyah(verse.id)}
          title={isBookmarked ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          aria-label={isBookmarked ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer ${
            isBookmarked
              ? 'text-[var(--brand-accent-text)] bg-[var(--brand-accent-soft)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-soft)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
        </button>

        <button
          ref={isMenuOpen ? activeMenuTriggerRef : undefined}
          type="button"
          onClick={() => {
            sfxService.play('click');
            setOpenMenuAyahId((prev) => (prev === verse.id ? null : verse.id));
          }}
          title="Diğer işlemler"
          aria-label="Ayet işlem menüsü"
          aria-expanded={isMenuOpen}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-soft)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        <ResponsiveActionMenu
          isOpen={isMenuOpen}
          onClose={() => setOpenMenuAyahId(null)}
          title={`${verse.surah}:${verse.ayah} · Ayet İşlemleri`}
          triggerRef={activeMenuTriggerRef}
        >
            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openQuickMemorize(verse.surah, verse.ayah, verse.page);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <BookMarked className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Buradan Ezber Başlat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openMealCompare(verse.surah, verse.ayah);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Scale className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Mealleri Karşılaştır ({MEALS_CATALOG.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                openVerseNoteModal(verse.surah, verse.ayah, verse.page);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-[var(--brand-primary-text)]" />
                <span>
                  {verseNotesMap.has(makeVerseNoteKey(verse.surah, verse.ayah))
                    ? 'Ayet Notumu Düzenle'
                    : 'Ayet Notu Ekle'}
                </span>
              </span>
              {(() => {
                const existing = verseNotesMap.get(makeVerseNoteKey(verse.surah, verse.ayah));
                if (!existing) return null;
                return (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: VERSE_NOTE_COLOR_STYLES[existing.color].dot }}
                  />
                );
              })()}
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openQuickResearch(verse.surah, verse.ayah, verse.ayah, verse.page);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Pin className="w-4 h-4 text-[var(--brand-accent-text)]" />
              <span>Araştırmaya Ekle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                if (manifest && meta) {
                  void audioQueueService.startSegmentQueue({
                    items: [
                      {
                        id: `loop_${verse.id}`,
                        type: 'ayah_range',
                        label: `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`,
                        surah: verse.surah,
                        startAyah: verse.ayah,
                        endAyah: verse.ayah,
                      },
                    ],
                    title: `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`,
                    context: 'single',
                    contextKey: `single:${verse.id}`,
                    manifest,
                    meta,
                    prefs: audioPrefs,
                    queueLoopOverride: 'infinite',
                  });
                }
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Repeat className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Bu Ayeti Döngüde Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                sfxService.play('click');
                openListeningDrawer({
                  initialTab: 'playlists',
                  pendingAddItem: {
                    type: 'ayah_range',
                    label: `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`,
                    surah: verse.surah,
                    startAyah: verse.ayah,
                    endAyah: verse.ayah,
                  },
                });
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Çalma Listesine Ekle</span>
            </button>

            {getMutashabihatCount(verse.surah, verse.ayah) > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuAyahId(null);
                  openMutashabihat(verse.surah, verse.ayah);
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4 text-[var(--brand-accent-text)]" />
                <span>
                  Benzer Ayetler ({getMutashabihatCount(verse.surah, verse.ayah)})
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                onPlayFromAyah(originalIdx, 'meal');
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Headphones className="w-4 h-4 text-[var(--brand-primary-text)]" />
              <span>Sesli Mealini Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                onShareVerse(verse, bundle.surahMeta);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-[var(--brand-accent-text)]" />
              <span>Paylaşım Kartı Oluştur</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpenMenuAyahId(null);
                void handleCopyVerse(verse);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-soft)] flex items-center gap-2 cursor-pointer"
            >
              {copiedId === verse.id ? (
                <>
                  <Check className="w-4 h-4 text-[var(--state-success)]" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>Metni Kopyala</span>
                </>
              )}
            </button>
        </ResponsiveActionMenu>
      </div>
    );
  };

  const handleContainerTap = (e: React.MouseEvent<HTMLElement>) => {
    if (!onToggleMobileImmersive || typeof window === 'undefined' || window.innerWidth >= 1024) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'button, a, [role="button"], input, select, [data-tajweed-rule], [data-waqf-sign], [data-ruku-badge]',
      )
    ) {
      return;
    }
    onToggleMobileImmersive();
  };

  return (
    <div className="space-y-3 pb-3 lg:pb-0" onClick={handleContainerTap}>
      {/* Kitap Sayfası Çerçevesi (Mükerrer üst filtre kutusu kaldırıldı — doğrudan odak kitap sayfası) */}
      <article
        className={`${
          isDoubleBookLayout ? 'max-w-6xl' : 'max-w-3xl'
        } mx-auto surface-card rounded-2xl sm:rounded-3xl border border-[var(--border-strong)]/80 overflow-hidden shadow-md transition-all`}
      >
        {/* Kitap Serlevha Başlığı */}
        <header className="book-serlevha-header px-4 py-3.5 sm:px-8 sm:py-5 border-b border-[var(--border-subtle)] text-center">
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onOpenLocationPicker?.();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] hover:border-[var(--brand-primary)] cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--brand-primary-text)]" />
              <span>
                {bundle.surahMeta.no}. Sure • {bundle.surahMeta.type}
              </span>
            </button>

            <div className="flex items-center gap-1.5">
              {(favoriteCountInSurah > 0 || onlyFavorites) && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setOnlyFavorites((v) => !v);
                  }}
                  title="Sadece favori ayetleri filtrele"
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: onlyFavorites
                      ? 'var(--brand-accent-soft)'
                      : 'var(--bg-surface)',
                    borderColor: onlyFavorites ? 'var(--brand-accent)' : 'var(--border-subtle)',
                    color: onlyFavorites ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
                  <span className="tabular-nums">{favoriteCountInSurah}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  moveHatimBookmark({
                    page: bundle.surahMeta.pageStart,
                    surah: bundle.surahMeta.no,
                    ayah: 1,
                  })
                }
                title="Hatim ayracını bu surenin sayfasına taşı"
                className="min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: isHatimOnSurahStart
                    ? 'var(--brand-primary)'
                    : 'var(--bg-surface)',
                  borderColor: isHatimOnSurahStart
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: isHatimOnSurahStart ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                <Bookmark className={`w-3.5 h-3.5 ${isHatimOnSurahStart ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">
                  {isHatimOnSurahStart ? 'Hatim Ayracı' : 'Ayraç Koy'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenSurahInfo(bundle.surahMeta)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--brand-primary-text)] hover:border-[var(--brand-primary)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sure Bilgisi</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onOpenLocationPicker?.();
            }}
            className="inline-flex flex-col items-center cursor-pointer hover:opacity-85 transition-opacity"
          >
            <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
              {formatSurahTitle(bundle.surahMeta.nameTr, bundle.surahMeta.no)}
            </h2>
            <p className="arabic-title text-xl sm:text-2xl text-[var(--brand-primary-text)] mt-1">
              {formatSafeArabicTitle(bundle.surahMeta.nameAr)}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {bundle.surahMeta.ayahCount} Ayet • Sayfa {bundle.surahMeta.pageStart}–
              {bundle.surahMeta.pageEnd}
            </p>
            {bookMode !== 'ar_only' && (
              <span
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>{primaryMeal.label}</span>
                {isDual && (
                  <>
                    <span aria-hidden="true" className="opacity-50">
                      ·
                    </span>
                    <span>{secondaryMeal.shortLabel}</span>
                  </>
                )}
              </span>
            )}
          </button>

          {bundle.hasBesmele && !onlyFavorites && (() => {
            const isBesmelePlaying = Boolean(
              playingAyahId &&
                bundle.verses[0]?.id === playingAyahId &&
                audioState.activePhase === 'besmele',
            );
            const softPlayingBg =
              settings.theme === 'dark'
                ? 'rgba(45, 212, 191, 0.13)'
                : 'rgba(13, 148, 136, 0.10)';
            return (
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]/70">
                {bookMode !== 'meal_only' && (
                  <p
                    className={`${settings.tajweedEnabled && tjBesmele ? 'arabic-tajweed' : 'arabic-text'} text-center text-[var(--text-primary)] rounded-xl px-2 py-0.5 transition-colors`}
                    style={{
                      fontSize: `${Math.max(22, settings.arabicFontSize - 2)}px`,
                      backgroundColor:
                        isBesmelePlaying && !audioState.isWordSyncActive
                          ? softPlayingBg
                          : 'transparent',
                    }}
                  >
                    <SyncedVerseArabic
                      text={besmeleAr}
                      surahNo={bundle.surahMeta.no}
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
                )}
                {bookMode === 'meal_only' && (() => {
                  const besmeleInfo = meta?.besmele ?? {
                    ayahId: 1001,
                    audioCode: '001001',
                    excludeSurahs: [1, 9],
                    ar: besmeleAr,
                    tdv: 'Rahmân ve Rahîm olan Allah’ın adıyla.',
                    dib: 'Rahmân ve Rahîm olan Allah’ın adıyla.',
                  };
                  const mealBesmele = resolveMealBesmelePresentation(primaryMeal, besmeleInfo);
                  return (
                    <p
                      dir={mealBesmele.dir}
                      lang={mealBesmele.isArabic ? 'ar' : primaryMeal.lang ?? 'tr'}
                      className={`${
                        mealBesmele.isArabic
                          ? 'arabic-text text-lg sm:text-xl leading-[2.0] text-[var(--text-primary)]'
                          : 'turkish-reading text-sm font-semibold italic text-[var(--text-secondary)]'
                      } text-center rounded-lg px-2 py-1 transition-colors`}
                      style={{
                        backgroundColor: isBesmelePlaying ? softPlayingBg : 'transparent',
                      }}
                    >
                      {mealBesmele.text}
                    </p>
                  );
                })()}
              </div>
            );
          })()}
        </header>

        {/* Kitap İçeriği */}
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          {visibleVerses.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <Star className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Bu surede henüz favori ayetiniz bulunmuyor.
              </p>
              <button
                type="button"
                onClick={() => setOnlyFavorites(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-bold cursor-pointer"
              >
                Tüm Ayetleri Göster
              </button>
            </div>
          ) : bookMode === 'ar_only' ? (
            /* 1. SADECE ARAPÇA KİTAP AKIŞI */
            <div className="space-y-5">
              {(() => {
                const hasTajweedInBook =
                  settings.tajweedEnabled &&
                  visibleVerses.some((v) => Boolean(getTjVerseWords(v.surah, v.ayah)?.length));
                const arabicDensity = getArabicDensityMetrics(
                  settings.arabicTextDensity,
                  settings.arabicLineHeight,
                );
                return (
                  <div
                    dir="rtl"
                    className={`${hasTajweedInBook ? 'arabic-tajweed' : 'arabic-text'} text-justify text-[var(--text-primary)] ${
                      isDoubleBookLayout ? 'lg:columns-2 lg:gap-10' : ''
                    }`}
                    style={{
                      fontSize: `${settings.arabicFontSize}px`,
                      lineHeight: hasTajweedInBook
                        ? arabicDensity.tajweedLineHeight
                        : arabicDensity.mushafLineHeight,
                      wordSpacing: arabicDensity.wordSpacing,
                    }}
                  >
                    {visibleVerses.map((verse) => {
                      const isPlaying =
                        playingAyahId === verse.id && audioState.activePhase !== 'besmele';
                      const isSelected = selectedArabicVerse?.id === verse.id;
                      const isBookmarked = bookmarkedSet.has(verse.id);
                      const isSajdah = SAJDAH_AYAH_IDS.has(verse.id) && settings.highlightSajdah;
                      const rukuEnd = settings.showRukuMarkers
                        ? getRukuEndingAt(verse.surah, verse.ayah)
                        : null;
                      const tjWords = settings.tajweedEnabled
                        ? getTjVerseWords(verse.surah, verse.ayah)
                        : null;
                      const useVerseTajweed = Boolean(tjWords && tjWords.length > 0);
                      const softPlayingBg =
                        settings.theme === 'dark'
                          ? 'rgba(16, 185, 129, 0.14)'
                          : 'rgba(16, 185, 129, 0.11)';
                      const softWordSyncPlayingBg =
                        settings.theme === 'dark'
                          ? 'rgba(16, 185, 129, 0.08)'
                          : 'rgba(16, 185, 129, 0.06)';
                      return (
                        <span
                          key={verse.id}
                          id={`book-ayah-${verse.id}`}
                          role="button"
                          tabIndex={0}
                          title={
                            isSajdah
                              ? `Tilâvet Secdesi Ayeti — ${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`
                              : `${bundle.surahMeta.nameTr} ${verse.ayah}. Ayet`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectVerse(verse);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleSelectVerse(verse);
                            }
                          }}
                          className={`inline rounded-xl px-[0.02em] py-[0.04em] transition-colors cursor-pointer ${
                            isPlaying
                              ? 'text-[var(--text-primary)] ring-1 ring-emerald-500/30'
                              : isSelected
                                ? 'bg-amber-500/[0.14] ring-1 ring-amber-500/40'
                                : isSajdah
                                  ? 'bg-amber-500/12 underline decoration-amber-500/65 decoration-dotted underline-offset-[10px]'
                                  : 'hover:bg-[var(--bg-surface-soft)]'
                          }`}
                          style={{
                            ...(isPlaying
                              ? {
                                  backgroundColor: audioState.isWordSyncActive
                                    ? softWordSyncPlayingBg
                                    : softPlayingBg,
                                }
                              : {}),
                            boxDecorationBreak: 'clone',
                            WebkitBoxDecorationBreak: 'clone',
                          }}
                        >
                          <SyncedVerseArabic
                            text={verse.ar.t}
                            surahNo={verse.surah}
                            ayahNo={verse.ayah}
                            isPlaying={isPlaying}
                            wordSyncEnabled={settings.wordSyncEnabled}
                            useTajweed={useVerseTajweed}
                            tajweedWords={tjWords}
                            tajweedRules={tjRules}
                            theme={settings.theme}
                          />
                          {isSajdah && (
                            <span
                              title="Tilâvet Secdesi Ayeti"
                              aria-label="Tilâvet Secdesi Ayeti"
                              className="inline-flex items-center justify-center mx-[0.14em] px-[0.22em] py-0.5 rounded-md border text-[0.6em] font-sans font-extrabold align-middle leading-none"
                              style={{
                                backgroundColor: 'var(--brand-accent-soft)',
                                borderColor: 'rgba(217, 119, 6, 0.5)',
                                color: 'var(--brand-accent-text)',
                              }}
                            >
                              ۩
                            </span>
                          )}
                          {(useVerseTajweed || !ENDS_WITH_ARABIC_AYAH_MARKER.test(verse.ar.t)) && (
                            <AyahEndMarker
                              ayahNo={verse.ayah}
                              isPlaying={isPlaying}
                              isWordSyncActive={audioState.isWordSyncActive}
                              isHighlighted={isSelected || isBookmarked || isSajdah}
                              theme={settings.theme}
                              size="mushaf"
                              title={
                                isSajdah
                                  ? `Tilâvet Secdesi · ${bundle.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                                  : `${bundle.surahMeta.shortNameTr} ${verse.ayah}. Ayet`
                              }
                            />
                          )}
                          {rukuEnd && (
                            <RukuMarkerBadge
                              ruku={rukuEnd}
                              surahNameTr={bundle.surahMeta.nameTr}
                              page={verse.page}
                              variant="inline"
                            />
                          )}{' '}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Seçili Arapça Ayet İşlem Çubuğu */}
              {selectedArabicVerse && (
                <div className="sticky bottom-24 z-20 rounded-2xl bg-[var(--bg-surface)] border-2 border-[var(--brand-primary)]/40 shadow-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-[var(--brand-primary-text)]">
                        {formatSurahTitle(bundle.surahMeta.nameTr, bundle.surahMeta.no)}, {selectedArabicVerse.ayah}. Ayet
                      </span>
                      {SAJDAH_AYAH_IDS.has(selectedArabicVerse.id) && settings.highlightSajdah && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-extrabold whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--brand-accent-soft)',
                            borderColor: 'rgba(217, 119, 6, 0.5)',
                            color: 'var(--brand-accent-text)',
                          }}
                        >
                          <span>۩</span>
                          <span>Tilâvet Secdesi Ayeti</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedVerseKey(null)}
                      className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 cursor-pointer"
                    >
                      Kapat
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onPlayFromAyah(verseIndexMap.get(selectedArabicVerse.id) ?? 0)
                      }
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Buradan Dinle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onPlayFromAyah(verseIndexMap.get(selectedArabicVerse.id) ?? 0, 'meal')
                      }
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary-text)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>Sesli Meal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleBookmarkAyah(selectedArabicVerse.id)}
                      className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                        bookmarkedSet.has(selectedArabicVerse.id)
                          ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] border-[var(--brand-accent)]'
                          : 'bg-[var(--bg-surface-soft)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          bookmarkedSet.has(selectedArabicVerse.id) ? 'fill-current' : ''
                        }`}
                      />
                      <span>
                        {bookmarkedSet.has(selectedArabicVerse.id) ? 'Favoride' : 'Favorile'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openVerseNoteModal(
                          selectedArabicVerse.surah,
                          selectedArabicVerse.ayah,
                          selectedArabicVerse.page,
                        )
                      }
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      style={(() => {
                        const existing = verseNotesMap.get(
                          makeVerseNoteKey(selectedArabicVerse.surah, selectedArabicVerse.ayah),
                        );
                        if (!existing) {
                          return {
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          };
                        }
                        const st = VERSE_NOTE_COLOR_STYLES[existing.color];
                        return {
                          backgroundColor: st.softBg,
                          borderColor: st.border,
                          color: st.badgeText,
                        };
                      })()}
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                      <span>
                        {verseNotesMap.has(
                          makeVerseNoteKey(selectedArabicVerse.surah, selectedArabicVerse.ayah),
                        )
                          ? 'Notumu Düzenle'
                          : 'Ayet Notu'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onShareVerse(selectedArabicVerse, bundle.surahMeta)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface-soft)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[var(--brand-accent-text)]" />
                      <span>Paylaş Kartı</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openQuickMemorize(
                          selectedArabicVerse.surah,
                          selectedArabicVerse.ayah,
                          selectedArabicVerse.page,
                        );
                      }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--brand-primary-soft)] border border-[var(--brand-primary)]/40 text-[var(--brand-primary-text)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BookMarked className="w-3.5 h-3.5" />
                      <span>Buradan Ezber Başlat</span>
                    </button>

                    {getMutashabihatCount(selectedArabicVerse.surah, selectedArabicVerse.ayah) >
                      0 && (
                      <button
                        type="button"
                        onClick={() =>
                          openMutashabihat(selectedArabicVerse.surah, selectedArabicVerse.ayah)
                        }
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--brand-accent-soft)] border border-[var(--brand-accent)]/40 text-[var(--brand-accent-text)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>
                          Benzer Ayetler (
                          {getMutashabihatCount(selectedArabicVerse.surah, selectedArabicVerse.ayah)}
                          )
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openMealCompare(selectedArabicVerse.surah, selectedArabicVerse.ayah);
                      }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface-soft)] border border-[var(--brand-primary)]/40 text-[var(--brand-primary-text)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>Mealleri Karşılaştır ({MEALS_CATALOG.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        if (manifest && meta) {
                          void audioQueueService.startSegmentQueue({
                            items: [
                              {
                                id: `loop_${selectedArabicVerse.id}`,
                                type: 'ayah_range',
                                label: `${bundle.surahMeta.nameTr} ${selectedArabicVerse.ayah}. Ayet`,
                                surah: selectedArabicVerse.surah,
                                startAyah: selectedArabicVerse.ayah,
                                endAyah: selectedArabicVerse.ayah,
                              },
                            ],
                            title: `${bundle.surahMeta.nameTr} ${selectedArabicVerse.ayah}. Ayet`,
                            context: 'single',
                            contextKey: `single:${selectedArabicVerse.id}`,
                            manifest,
                            meta,
                            prefs: audioPrefs,
                            queueLoopOverride: 'infinite',
                          });
                        }
                      }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface-soft)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Repeat className="w-3.5 h-3.5 text-[var(--brand-primary-text)]" />
                      <span>Döngüde Dinle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openListeningDrawer({
                          initialTab: 'playlists',
                          pendingAddItem: {
                            type: 'ayah_range',
                            label: `${bundle.surahMeta.nameTr} ${selectedArabicVerse.ayah}. Ayet`,
                            surah: selectedArabicVerse.surah,
                            startAyah: selectedArabicVerse.ayah,
                            endAyah: selectedArabicVerse.ayah,
                          },
                        });
                      }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface-soft)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ListPlus className="w-3.5 h-3.5 text-[var(--brand-primary-text)]" />
                      <span>Listeye Ekle</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 2. SADECE TÜRKÇE MEAL veya 3. ARAPÇA + MEAL KİTAP AKIŞI */
            <div
              dir={useRtlDoubleGrid ? 'rtl' : 'ltr'}
              className={
                isDoubleBookLayout
                  ? 'grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8 gap-y-2'
                  : 'divide-y divide-[var(--border-subtle)]/70'
              }
            >
              {visibleVerses.map((verse) => {
                const isPlaying =
                  playingAyahId === verse.id && audioState.activePhase !== 'besmele';
                const isSajdah = SAJDAH_AYAH_IDS.has(verse.id) && settings.highlightSajdah;
                const rukuEnd = settings.showRukuMarkers
                  ? getRukuEndingAt(verse.surah, verse.ayah)
                  : null;
                const mutashabihatCount = getMutashabihatCount(verse.surah, verse.ayah);
                const verseNote = verseNotesMap.get(makeVerseNoteKey(verse.surah, verse.ayah));
                const verseNoteStyle = verseNote ? VERSE_NOTE_COLOR_STYLES[verseNote.color] : null;
                const primaryVerse = getPrimaryVerse(verse);
                const secondaryVerse = isDual ? getSecondaryVerse(verse) : null;
                const fnList = settings.showFootnotes
                  ? [
                      ...(primaryVerse?.fn
                        ? primaryVerse.fn.map((t) => ({ src: primaryMeal.shortLabel, text: t }))
                        : []),
                      ...(isDual && secondaryVerse?.fn
                        ? secondaryVerse.fn.map((t) => ({
                            src: secondaryMeal.shortLabel,
                            text: t,
                          }))
                        : []),
                    ]
                  : [];
                const isFnOpen = openFootnoteAyahId === verse.id;
                const softPlayingBg =
                  settings.theme === 'dark'
                    ? 'rgba(16, 185, 129, 0.14)'
                    : 'rgba(16, 185, 129, 0.10)';
                const softWordSyncPlayingBg =
                  settings.theme === 'dark'
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'rgba(16, 185, 129, 0.06)';
                const suppressSectionFill =
                  isPlaying && audioState.isWordSyncActive && bookMode === 'interleaved';

                const isSelected = selectedVerseKey === `${verse.surah}:${verse.ayah}`;

                return (
                  <section
                    key={verse.id}
                    id={`book-ayah-${verse.id}`}
                    dir="ltr"
                    onClick={(e) => {
                      const target = e.target as HTMLElement | null;
                      if (
                        target?.closest(
                          'button, a, [role="button"], input, select, [data-tajweed-rule], [data-waqf-sign], [data-ruku-badge]',
                        )
                      ) {
                        return;
                      }
                      e.stopPropagation();
                      handleToggleSelectVerse(verse);
                    }}
                    className={`group text-left py-4 sm:py-5 transition-all rounded-2xl px-2.5 sm:px-3.5 cursor-pointer ${
                      isDoubleBookLayout
                        ? 'border-b border-[var(--border-subtle)]/70'
                        : 'first:pt-1 last:pb-1 -mx-2.5 sm:-mx-3.5'
                    } ${
                      isPlaying
                        ? 'ring-1 ring-emerald-500/35 shadow-xs'
                        : isSelected
                          ? 'bg-amber-500/[0.13] ring-1 ring-amber-500/40 my-1'
                          : isSajdah
                            ? 'bg-amber-500/[0.07] ring-1 ring-amber-500/45 my-1.5'
                            : 'hover:bg-[var(--bg-surface-soft)]/45'
                    }`}
                    style={
                      isPlaying
                        ? {
                            backgroundColor: suppressSectionFill
                              ? softWordSyncPlayingBg
                              : softPlayingBg,
                          }
                        : undefined
                    }
                  >
                    {/* Ayet Üst Satır */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[34px] h-7 px-2 rounded-lg text-xs font-extrabold ${
                            isPlaying
                              ? 'bg-[var(--brand-primary)] text-white'
                              : isSelected
                                ? 'bg-[var(--brand-accent)] text-white'
                                : isSajdah
                                  ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] border border-[var(--brand-accent)]/50'
                                  : 'bg-[var(--bg-surface-soft)] text-[var(--brand-primary-text)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {verse.surah}:{verse.ayah}
                        </span>

                        {isSelected && !isPlaying && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-extrabold"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            Seçili
                          </span>
                        )}

                        {isSajdah && (
                          <span
                            title="Diyanet / Hanefî standardına göre Tilâvet Secdesi ayeti"
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-extrabold whitespace-nowrap"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              borderColor: 'rgba(217, 119, 6, 0.5)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            <span className="text-sm leading-none">۩</span>
                            <span>Tilâvet Secdesi</span>
                          </span>
                        )}

                        {rukuEnd && (
                          <RukuMarkerBadge
                            ruku={rukuEnd}
                            surahNameTr={bundle.surahMeta.nameTr}
                            page={verse.page}
                            variant="pill"
                          />
                        )}

                        {mutashabihatCount > 0 && (
                          <button
                            type="button"
                            onClick={() => openMutashabihat(verse.surah, verse.ayah)}
                            title={`Benzer ayetleri karşılaştır (${mutashabihatCount})`}
                            className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-opacity hover:opacity-85"
                            style={{
                              backgroundColor: 'var(--brand-accent-soft)',
                              borderColor: 'rgba(217, 119, 6, 0.38)',
                              color: 'var(--brand-accent-text)',
                            }}
                          >
                            <ArrowLeftRight className="w-3 h-3 shrink-0" />
                            <span className="hidden sm:inline">Benzer ({mutashabihatCount})</span>
                            <span className="sm:hidden tabular-nums">{mutashabihatCount}</span>
                          </button>
                        )}

                        {isPlaying && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--brand-primary)] text-white">
                            <Volume2
                              className={`w-3.5 h-3.5 ${isAudioPlaying ? 'animate-pulse' : ''}`}
                            />
                            <span>{isAudioPlaying ? 'Okunuyor' : 'Duraklatıldı'}</span>
                          </span>
                        )}

                        {primaryVerse?.mg && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-surface-soft)] text-[var(--text-muted)]">
                            <Link2 className="w-3 h-3" />
                            {primaryMeal.shortLabel} {primaryVerse.mg[0]}–{primaryVerse.mg[1]}
                          </span>
                        )}

                        {verseNote && verseNoteStyle && (
                          <button
                            type="button"
                            onClick={() => openVerseNoteModal(verse.surah, verse.ayah, verse.page)}
                            title="Kişisel ayet notunu düzenle"
                            className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-opacity hover:opacity-85"
                            style={{
                              backgroundColor: verseNoteStyle.softBg,
                              borderColor: verseNoteStyle.border,
                              color: verseNoteStyle.badgeText,
                            }}
                          >
                            <StickyNote className="w-3 h-3 shrink-0" />
                            <span>Notum</span>
                          </button>
                        )}
                      </div>

                      {renderVerseActionMenu(verse, isSelected, isPlaying)}
                    </div>

                    {/* Arapça Ayet (Yalnızca interleaved modda) */}
                    {bookMode === 'interleaved' &&
                      (() => {
                        const tjWords = settings.tajweedEnabled
                          ? getTjVerseWords(verse.surah, verse.ayah)
                          : null;
                        const useVerseTajweed = Boolean(tjWords && tjWords.length > 0);
                        const arabicDensity = getArabicDensityMetrics(
                          settings.arabicTextDensity,
                          settings.arabicLineHeight,
                        );
                        return (
                          <p
                            dir="rtl"
                            className={`${useVerseTajweed ? 'arabic-tajweed' : 'arabic-text'} text-right text-[var(--text-primary)] mb-3.5`}
                            style={{
                              fontSize: `${settings.arabicFontSize}px`,
                              lineHeight: useVerseTajweed
                                ? arabicDensity.tajweedLineHeight
                                : arabicDensity.lineHeight,
                              wordSpacing: arabicDensity.wordSpacing,
                            }}
                          >
                            <SyncedVerseArabic
                              text={verse.ar.t}
                              surahNo={verse.surah}
                              ayahNo={verse.ayah}
                              isPlaying={isPlaying}
                              wordSyncEnabled={settings.wordSyncEnabled}
                              useTajweed={useVerseTajweed}
                              tajweedWords={tjWords}
                              tajweedRules={tjRules}
                              theme={settings.theme}
                            />
                            {isSajdah && (
                              <span
                                title="Tilâvet Secdesi Ayeti"
                                aria-label="Tilâvet Secdesi Ayeti"
                                className="inline-flex items-center justify-center mx-[0.16em] px-[0.22em] py-0.5 rounded-md border text-[0.6em] font-sans font-extrabold align-middle leading-none"
                                style={{
                                  backgroundColor: 'var(--brand-accent-soft)',
                                  borderColor: 'rgba(217, 119, 6, 0.5)',
                                  color: 'var(--brand-accent-text)',
                                }}
                              >
                                ۩
                              </span>
                            )}
                            {(useVerseTajweed || !ENDS_WITH_ARABIC_AYAH_MARKER.test(verse.ar.t)) && (
                              <AyahEndMarker
                                ayahNo={verse.ayah}
                                isPlaying={isPlaying}
                                isHighlighted={isSajdah}
                                theme={settings.theme}
                                size="card"
                              />
                            )}
                          </p>
                        );
                      })()}

                    {/* Türkçe Meal Bloğu */}
                    <div className="space-y-2.5">
                      {(() => {
                        const showSpokenMismatchOnPrimary =
                          isPlaying &&
                          isMealAudioFlowActive &&
                          Boolean(activeSpokenMeal) &&
                          activeSpokenMeal!.mealId !== primaryMeal.id &&
                          (!isDual || activeSpokenMeal!.mealId !== secondaryMeal.id);
                        const showPrimaryHeader =
                          isDual || primaryMeal.id !== 'm1' || showSpokenMismatchOnPrimary;
                        return (
                          <div className="space-y-1">
                            {showPrimaryHeader && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-[var(--brand-primary-text)]">
                                  {primaryMeal.label}
                                </span>
                                {showSpokenMismatchOnPrimary && activeSpokenMeal && (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap"
                                    style={{
                                      backgroundColor: 'var(--bg-surface-soft)',
                                      borderColor: 'var(--border-subtle)',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    <Volume2 className="w-3 h-3 shrink-0" />
                                    <span>Ses: {activeSpokenMeal.label}</span>
                                  </span>
                                )}
                              </div>
                            )}
                            {primaryVerse?.t ? (
                              (() => {
                                const pres = getMealTextPresentation(
                                  primaryMeal,
                                  settings.turkishFontSize,
                                );
                                return (
                                  <p
                                    dir={pres.dir}
                                    lang={pres.lang}
                                    className={`${
                                      pres.isRtl ? pres.className : `${pres.className} text-left`
                                    } text-[var(--text-primary)]`}
                                    style={{
                                      fontSize: `${pres.fontSizePx}px`,
                                      fontFamily: pres.fontFamily,
                                    }}
                                  >
                                    {primaryVerse.t}
                                  </p>
                                );
                              })()
                            ) : isLoadingExtra ? (
                              <div className="h-4 w-4/5 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                            ) : null}
                          </div>
                        );
                      })()}

                      {isDual && (
                        <div className="space-y-1 pt-2 border-t border-dashed border-[var(--border-subtle)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-[var(--brand-accent-text)]">
                              {secondaryMeal.label}
                            </span>
                            {isPlaying &&
                              isMealAudioFlowActive &&
                              activeSpokenMeal &&
                              activeSpokenMeal.mealId === secondaryMeal.id && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap"
                                  style={{
                                    backgroundColor: 'var(--brand-primary-soft)',
                                    borderColor: 'var(--brand-primary)',
                                    color: 'var(--brand-primary-text)',
                                  }}
                                >
                                  <Volume2 className="w-3 h-3 shrink-0" />
                                  <span>Ses: {activeSpokenMeal.label}</span>
                                </span>
                              )}
                          </div>
                          {secondaryVerse?.t ? (
                            (() => {
                              const pres = getMealTextPresentation(
                                secondaryMeal,
                                settings.turkishFontSize,
                              );
                              return (
                                <p
                                  dir={pres.dir}
                                  lang={pres.lang}
                                  className={`${
                                    pres.isRtl ? pres.className : `${pres.className} text-left`
                                  } text-[var(--text-primary)]`}
                                  style={{
                                    fontSize: `${pres.fontSizePx}px`,
                                    fontFamily: pres.fontFamily,
                                  }}
                                >
                                  {secondaryVerse.t}
                                </p>
                              );
                            })()
                          ) : isLoadingExtra ? (
                            <div className="h-4 w-4/5 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Dipnot Açılır Çekmecesi */}
                    {fnList.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setOpenFootnoteAyahId((prev) => (prev === verse.id ? null : verse.id));
                          }}
                          aria-expanded={isFnOpen}
                          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--brand-accent-text)] bg-[var(--brand-accent-soft)]/70 hover:bg-[var(--brand-accent-soft)] cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            {isFnOpen ? 'Dipnotu Gizle' : `Dipnot (${fnList.length})`}
                          </span>
                        </button>

                        {isFnOpen && (
                          <div className="mt-2 rounded-xl bg-[var(--bg-surface-soft)] border border-[var(--border-subtle)] p-3 space-y-2 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                            {fnList.map((fn, idx) => (
                              <p key={idx}>
                                <strong className="text-[var(--text-primary)]">{fn.src}: </strong>
                                {fn.text}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Kişisel Tefekkür Notum */}
                    {verseNote && verseNoteStyle && (
                      <button
                        type="button"
                        onClick={() => openVerseNoteModal(verse.surah, verse.ayah, verse.page)}
                        className="mt-3 w-full text-left rounded-xl border px-3 py-2.5 transition-opacity hover:opacity-95 cursor-pointer space-y-1"
                        style={{
                          backgroundColor: verseNoteStyle.softBg,
                          borderColor: verseNoteStyle.border,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-extrabold"
                            style={{ color: verseNoteStyle.badgeText }}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: verseNoteStyle.dot }}
                            />
                            <StickyNote className="w-3 h-3 shrink-0" />
                            <span>Kişisel Notum</span>
                          </span>
                          <span
                            className="text-[11px] font-bold underline underline-offset-2"
                            style={{ color: verseNoteStyle.badgeText }}
                          >
                            Düzenle
                          </span>
                        </div>
                        {verseNote.text && (
                          <p
                            className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap line-clamp-3"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {verseNote.text}
                          </p>
                        )}
                        {verseNote.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            {verseNote.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  color: verseNoteStyle.badgeText,
                                }}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Alt Sure Geçiş Çubuğu */}
        <footer className="px-4 py-3.5 sm:px-8 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-soft)]/70 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={bundle.surahMeta.no <= 1}
            onClick={onSelectPrevSurah}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm font-bold text-[var(--text-primary)] hover:border-[var(--brand-primary)] disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Önceki Sure</span>
          </button>

          <span className="text-xs font-bold text-[var(--text-muted)]">
            {bundle.surahMeta.no} / 114
          </span>

          <button
            type="button"
            disabled={bundle.surahMeta.no >= 114}
            onClick={onSelectNextSurah}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm font-bold text-[var(--text-primary)] hover:border-[var(--brand-primary)] disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>Sonraki Sure</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </footer>
      </article>
    </div>
  );
};
