import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  FileText,
  Headphones,
  Info,
  Link2,
  MoreHorizontal,
  Play,
  Share2,
  Square,
  Star,
  Volume2,
} from 'lucide-react';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  BookContentMode,
  CombinedVerse,
  SurahBundle,
  SurahMeta,
} from '../../types/quran';
import { formatSafeArabicTitle } from '../../utils/arabicUtils';

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
}

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicNumeral(n: number): string {
  return String(n)
    .split('')
    .map((ch) => ARABIC_INDIC[Number(ch)] ?? ch)
    .join('');
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
}) => {
  const {
    settings,
    studyPrefs,
    studyProgress,
    updateStudyPrefs,
    toggleBookmarkAyah,
  } = useAppStore();

  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedArabicAyahId, setSelectedArabicAyahId] = useState<number | null>(null);
  const [openMenuAyahId, setOpenMenuAyahId] = useState<number | null>(null);
  const [openFootnoteAyahId, setOpenFootnoteAyahId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const bookMode: BookContentMode = studyPrefs.bookContentMode;
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

  const showM1 = settings.preferredMeal === 'm1' || settings.preferredMeal === 'both';
  const showM2 = settings.preferredMeal === 'm2' || settings.preferredMeal === 'both';

  const selectedArabicVerse = useMemo(
    () => bundle.verses.find((v) => v.id === selectedArabicAyahId) ?? null,
    [bundle.verses, selectedArabicAyahId],
  );

  const handleCopyVerse = async (verse: CombinedVerse) => {
    const mealText =
      settings.preferredMeal === 'm2'
        ? verse.m2?.t || verse.m1?.t || ''
        : verse.m1?.t || verse.m2?.t || '';
    const text =
      bookMode === 'ar_only'
        ? `${verse.ar.t}\n— ${bundle.surahMeta.nameTr} Suresi, ${verse.ayah}. Ayet`
        : bookMode === 'meal_only'
          ? `${mealText}\n— ${bundle.surahMeta.nameTr} Suresi, ${verse.ayah}. Ayet`
          : `${verse.ar.t}\n\n${mealText}\n— ${bundle.surahMeta.nameTr} Suresi, ${verse.ayah}. Ayet`;

    try {
      await navigator.clipboard.writeText(text);
      sfxService.play('click');
      setCopiedId(verse.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === verse.id ? null : prev)), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const renderVerseActionMenu = (verse: CombinedVerse) => {
    const originalIdx = verseIndexMap.get(verse.id) ?? 0;
    const isBookmarked = bookmarkedSet.has(verse.id);
    const isMenuOpen = openMenuAyahId === verse.id;

    return (
      <div className="relative flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onPlayFromAyah(originalIdx)}
          title="Bu ayetten itibaren dinle"
          aria-label={`${verse.ayah}. ayetten itibaren dinle`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--brand-primary-soft)] hover:text-[var(--brand-primary-text)] transition-colors cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
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

        {isMenuOpen && (
          <div className="absolute right-0 top-10 z-30 w-52 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-xl p-1.5 space-y-0.5">
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Kitap Modu İçerik Akış Seçici */}
      <div className="surface-card rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex-1">
            {(
              [
                { id: 'interleaved', label: 'Arapça + Meal Akışı' },
                { id: 'meal_only', label: 'Sadece Türkçe Meal' },
                { id: 'ar_only', label: 'Sadece Arapça Metin' },
              ] as const
            ).map((opt) => {
              const active = bookMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    updateStudyPrefs({ bookContentMode: opt.id });
                  }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all cursor-pointer ${
                    active
                      ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                      : 'bg-[var(--bg-surface-soft)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                updateStudyPrefs({
                  pageLayout: studyPrefs.pageLayout === 'double' ? 'single' : 'double',
                });
              }}
              className={`hidden lg:inline-flex min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                studyPrefs.pageLayout === 'double'
                  ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary-text)] border-[var(--brand-primary)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--brand-primary)]'
              }`}
              title={
                studyPrefs.pageLayout === 'double'
                  ? 'Tek sütun kitap düzenine geç'
                  : 'Yan yana çift sayfa kitap düzenine geç'
              }
            >
              {studyPrefs.pageLayout === 'double' ? (
                <>
                  <Square className="w-4 h-4" />
                  <span>Tek Sayfa</span>
                </>
              ) : (
                <>
                  <Columns2 className="w-4 h-4" />
                  <span>Çift Sayfa</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setOnlyFavorites((v) => !v);
              }}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                onlyFavorites
                  ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] border-[var(--brand-accent)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--brand-accent)]'
              }`}
            >
              <Star className={`w-4 h-4 ${onlyFavorites ? 'fill-current' : ''}`} />
              <span>Favoriler ({favoriteCountInSurah})</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          {bookMode === 'ar_only' &&
            'Kesintisiz kitap sayfası düzeninde Arapça metin. İşlem yapmak istediğiniz ayete dokunun.'}
          {bookMode === 'meal_only' &&
            'Sade Türkçe meal kitap akışı. Sesli meal dinlerken aktif ayet otomatik vurgulanır ve ekranda ortalanır.'}
          {bookMode === 'interleaved' &&
            'Her Arapça ayetin hemen altında Türkçe mealinin yer aldığı tek parça kitap okuma düzeni.'}
        </p>
      </div>

      {/* Kitap Sayfası Çerçevesi (Masaüstünde Çift Sayfa seçiliyse geniş açılım) */}
      <article
        className={`${
          studyPrefs.pageLayout === 'double' ? 'max-w-6xl' : 'max-w-3xl'
        } mx-auto surface-card rounded-3xl border-2 border-[var(--border-strong)]/80 overflow-hidden shadow-md transition-all`}
      >
        {/* Kitap Serlevha Başlığı */}
        <header className="px-5 py-5 sm:px-8 sm:py-6 border-b border-[var(--border-subtle)] bg-gradient-to-b from-[var(--brand-primary-soft)]/70 to-transparent text-center">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)]">
              <BookOpen className="w-3.5 h-3.5 text-[var(--brand-primary-text)]" />
              {bundle.surahMeta.no}. Sure • {bundle.surahMeta.type}
            </span>

            <button
              type="button"
              onClick={() => onOpenSurahInfo(bundle.surahMeta)}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--brand-primary-text)] hover:border-[var(--brand-primary)] inline-flex items-center gap-1 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Sure Bilgisi</span>
            </button>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
            {bundle.surahMeta.nameTr} Suresi
          </h2>
          <p className="arabic-title text-xl sm:text-2xl text-[var(--brand-primary-text)] mt-1">
            {formatSafeArabicTitle(bundle.surahMeta.nameAr)}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {bundle.surahMeta.ayahCount} Ayet • Sayfa {bundle.surahMeta.pageStart}–
            {bundle.surahMeta.pageEnd}
          </p>

          {bundle.hasBesmele && !onlyFavorites && (
            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]/70">
              {bookMode !== 'meal_only' && (
                <p
                  className="arabic-text text-center text-[var(--text-primary)]"
                  style={{ fontSize: `${Math.max(22, settings.arabicFontSize - 2)}px` }}
                >
                  {besmeleAr}
                </p>
              )}
              {bookMode === 'meal_only' && (
                <p className="turkish-reading text-sm font-semibold italic text-[var(--text-secondary)]">
                  Rahmân ve Rahîm olan Allah’ın adıyla.
                </p>
              )}
            </div>
          )}
        </header>

        {/* Kitap İçeriği */}
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          {visibleVerses.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <Star className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Bu surede henüz favori ayetiniz yok.
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
              <div
                dir="rtl"
                className={`arabic-text text-justify text-[var(--text-primary)] leading-[2.35] ${
                  studyPrefs.pageLayout === 'double' ? 'lg:columns-2 lg:gap-10' : ''
                }`}
                style={{ fontSize: `${settings.arabicFontSize}px` }}
              >
                {visibleVerses.map((verse) => {
                  const isPlaying = playingAyahId === verse.id;
                  const isSelected = selectedArabicAyahId === verse.id;
                  const isBookmarked = bookmarkedSet.has(verse.id);
                  return (
                    <span
                      key={verse.id}
                      id={`book-ayah-${verse.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        sfxService.play('click');
                        setSelectedArabicAyahId((prev) => (prev === verse.id ? null : verse.id));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedArabicAyahId((prev) => (prev === verse.id ? null : verse.id));
                        }
                      }}
                      className={`inline rounded-xl px-1.5 py-0.5 transition-colors cursor-pointer ${
                        isPlaying
                          ? 'bg-[var(--brand-primary)]/18 ring-2 ring-[var(--brand-primary)]/60 text-[var(--text-primary)]'
                          : isSelected
                            ? 'bg-[var(--brand-accent-soft)] ring-1 ring-[var(--brand-accent)]/50'
                            : 'hover:bg-[var(--bg-surface-soft)]'
                      }`}
                    >
                      {verse.ar.t}
                      <span
                        className={`inline-flex items-center justify-center mx-1.5 px-2 py-0.5 rounded-full text-[0.55em] font-sans font-extrabold align-middle border ${
                          isPlaying
                            ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                            : isBookmarked
                              ? 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] border-[var(--brand-accent)]/60'
                              : 'bg-[var(--bg-surface-soft)] text-[var(--brand-primary-text)] border-[var(--border-strong)]'
                        }`}
                      >
                        ﴿{toArabicNumeral(verse.ayah)}﴾
                      </span>{' '}
                    </span>
                  );
                })}
              </div>

              {/* Seçili Arapça Ayet İşlem Çubuğu */}
              {selectedArabicVerse && (
                <div className="sticky bottom-24 z-20 rounded-2xl bg-[var(--bg-surface)] border-2 border-[var(--brand-primary)]/40 shadow-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[var(--brand-primary-text)]">
                      {bundle.surahMeta.nameTr} Suresi, {selectedArabicVerse.ayah}. Ayet
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedArabicAyahId(null)}
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
                      onClick={() => onShareVerse(selectedArabicVerse, bundle.surahMeta)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface-soft)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[var(--brand-accent-text)]" />
                      <span>Paylaş Kartı</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 2. SADECE TÜRKÇE MEAL veya 3. ARAPÇA + MEAL KİTAP AKIŞI */
            <div
              className={
                studyPrefs.pageLayout === 'double'
                  ? 'grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8 gap-y-2'
                  : 'divide-y divide-[var(--border-subtle)]/70'
              }
            >
              {visibleVerses.map((verse) => {
                const isPlaying = playingAyahId === verse.id;
                const fnList = [
                  ...(showM1 && verse.m1?.fn ? verse.m1.fn.map((t) => ({ src: 'TDV', text: t })) : []),
                  ...(showM2 && verse.m2?.fn ? verse.m2.fn.map((t) => ({ src: 'DİB', text: t })) : []),
                ];
                const isFnOpen = openFootnoteAyahId === verse.id;

                return (
                  <section
                    key={verse.id}
                    id={`book-ayah-${verse.id}`}
                    className={`py-4 sm:py-5 transition-all rounded-2xl px-2.5 sm:px-3.5 ${
                      studyPrefs.pageLayout === 'double'
                        ? 'border-b border-[var(--border-subtle)]/70'
                        : 'first:pt-1 last:pb-1 -mx-2.5 sm:-mx-3.5'
                    } ${
                      isPlaying
                        ? 'bg-[var(--brand-primary-soft)]/85 ring-2 ring-[var(--brand-primary)]/50 shadow-xs'
                        : 'hover:bg-[var(--bg-surface-soft)]/45'
                    }`}
                  >
                    {/* Ayet Üst Satır */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[34px] h-7 px-2 rounded-lg text-xs font-extrabold ${
                            isPlaying
                              ? 'bg-[var(--brand-primary)] text-white'
                              : 'bg-[var(--bg-surface-soft)] text-[var(--brand-primary-text)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {verse.surah}:{verse.ayah}
                        </span>

                        {isPlaying && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--brand-primary)] text-white">
                            <Volume2
                              className={`w-3.5 h-3.5 ${isAudioPlaying ? 'animate-pulse' : ''}`}
                            />
                            <span>{isAudioPlaying ? 'Okunuyor' : 'Duraklatıldı'}</span>
                          </span>
                        )}

                        {verse.m1?.mg && showM1 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-surface-soft)] text-[var(--text-muted)]">
                            <Link2 className="w-3 h-3" />
                            TDV {verse.m1.mg[0]}–{verse.m1.mg[1]}
                          </span>
                        )}
                      </div>

                      {renderVerseActionMenu(verse)}
                    </div>

                    {/* Arapça Ayet (Yalnızca interleaved modda) */}
                    {bookMode === 'interleaved' && (
                      <p
                        dir="rtl"
                        className="arabic-text text-right text-[var(--text-primary)] mb-3.5"
                        style={{ fontSize: `${settings.arabicFontSize}px` }}
                      >
                        {verse.ar.t}
                      </p>
                    )}

                    {/* Türkçe Meal Bloğu */}
                    <div className="space-y-2.5">
                      {showM1 && verse.m1 && (
                        <div className="space-y-1">
                          {settings.preferredMeal === 'both' && (
                            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-[var(--brand-primary-text)]">
                              TDV Meali
                            </span>
                          )}
                          <p
                            className="turkish-reading text-[var(--text-primary)]"
                            style={{ fontSize: `${settings.turkishFontSize}px` }}
                          >
                            {verse.m1.t}
                          </p>
                        </div>
                      )}

                      {showM2 && verse.m2 && (
                        <div
                          className={`space-y-1 ${
                            settings.preferredMeal === 'both'
                              ? 'pt-2 border-t border-dashed border-[var(--border-subtle)]'
                              : ''
                          }`}
                        >
                          {settings.preferredMeal === 'both' && (
                            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-[var(--brand-accent-text)]">
                              DİB Meali
                            </span>
                          )}
                          <p
                            className="turkish-reading text-[var(--text-primary)]"
                            style={{ fontSize: `${settings.turkishFontSize}px` }}
                          >
                            {verse.m2.t}
                          </p>
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
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[var(--brand-accent-text)] bg-[var(--brand-accent-soft)]/70 hover:bg-[var(--brand-accent-soft)] cursor-pointer"
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
