import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Headphones,
  Info,
  Languages,
  Link2,
  List,
  Star,
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
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { WordMealGrid } from './WordMealGrid';

interface MushafPageViewProps {
  pageBundle: PageBundle;
  besmele: BesmeleInfo;
  settings: AppSettings;
  wordMode: WordMealMode;
  selectedVerseId: number | null;
  playingAyahId: number | null;
  bookmarkedSet: Set<number>;
  onSelectVerse: (verse: CombinedVerse) => void;
  onChangePage: (nextPage: number) => void;
  onPlayFromVerse: (verse: CombinedVerse, singleAyahOnly?: boolean) => void;
  onToggleBookmark: (ayahId: number) => void;
  onOpenSurahInfo: (surah: SurahMeta) => void;
}

type InspectorTab = 'selected' | 'all_page';

const ENDS_WITH_ARABIC_NUMERAL = /[\u0660-\u0669]\s*$/;

export const MushafPageView: React.FC<MushafPageViewProps> = ({
  pageBundle,
  besmele,
  settings,
  wordMode,
  selectedVerseId,
  playingAyahId,
  bookmarkedSet,
  onSelectVerse,
  onChangePage,
  onPlayFromVerse,
  onToggleBookmark,
  onOpenSurahInfo,
}) => {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('selected');
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [showWordsOverride, setShowWordsOverride] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const selectedVerse =
    pageBundle.verses.find((v) => v.id === selectedVerseId) ?? pageBundle.verses[0] ?? null;

  const selectedSegment = selectedVerse
    ? pageBundle.segments.find((seg) => seg.surahMeta.no === selectedVerse.surah) ??
      pageBundle.segments[0]
    : pageBundle.segments[0];

  // Ayet değişince dipnot çekmecesini kapat (temiz akış)
  useEffect(() => {
    setShowFootnotes(false);
  }, [selectedVerse?.id]);

  // Klavye sol/sağ ok tuşları (Mushaf yönü: Sol = Sonraki Sayfa, Sağ = Önceki Sayfa)
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
        onChangePage(pageBundle.pageNo + 1);
      } else if (e.key === 'ArrowRight' && pageBundle.pageNo > pageBundle.minPage) {
        e.preventDefault();
        onChangePage(pageBundle.pageNo - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageBundle.pageNo, pageBundle.minPage, pageBundle.maxPage, onChangePage]);

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

  const pageSurahTitlesTr = pageBundle.segments.map((s) => s.surahMeta.shortNameTr).join(' · ');
  const pageSurahTitlesAr = pageBundle.segments
    .map((s) => s.surahMeta.nameAr)
    .slice(0, 2)
    .join(' · ');

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
  const canGoNext = pageBundle.pageNo < pageBundle.maxPage;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* ====================================================================
          SOL / ANA KOLON (7 sütun): Gerçek Mushaf Sayfası Çerçevesi
          ==================================================================== */}
      <div className="lg:col-span-7 space-y-3">
        <div
          className="rounded-3xl p-1.5 sm:p-2 border-2 transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'rgba(15, 118, 110, 0.34)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div
            className="rounded-[20px] border p-4 sm:p-6 md:p-7"
            style={{
              borderColor: 'rgba(217, 119, 6, 0.35)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            {/* Mushaf Üst Bilgi Şeridi: Solda Sayfa · Ortada Cüz · Sağda Sure Adı */}
            <div
              className="pb-3 mb-5 border-b flex items-center justify-between gap-2 text-xs sm:text-sm"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span
                className="font-bold tabular-nums shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                Sayfa {pageBundle.pageNo}
              </span>

              <span
                className="font-semibold tabular-nums text-center px-2.5 py-0.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-secondary)',
                }}
              >
                {pageBundle.cuzs.map((c) => `${c}. Cüz`).join(' / ')}
              </span>

              <div className="text-right min-w-0 flex items-center gap-2 justify-end">
                <span
                  className="text-xs font-bold truncate hidden sm:inline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {pageSurahTitlesTr}
                </span>
                <span
                  className="arabic-text text-base sm:text-lg leading-none truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {pageSurahTitlesAr}
                </span>
              </div>
            </div>

            {/* Sayfa Bölümleri (Tek sayfada birden fazla sure olabilir) */}
            <div className="space-y-6">
              {pageBundle.segments.map((segment) => (
                <div key={`seg-${pageBundle.pageNo}-${segment.surahMeta.no}`} className="space-y-4">
                  {/* Serlevha (Surenin 1. ayeti bu sayfada başlıyorsa) */}
                  {segment.startsAtAyah1 && (
                    <div
                      className="rounded-2xl border px-4 py-3 sm:px-5 sm:py-3.5 relative overflow-hidden"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'rgba(217, 119, 6, 0.4)',
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
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
                          className="arabic-text text-2xl sm:text-3xl leading-none"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          {segment.surahMeta.nameAr}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            onOpenSurahInfo(segment.surahMeta);
                          }}
                          className="min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <Info className="w-3.5 h-3.5 shrink-0" />
                          <span>Sure Bilgisi</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Besmele Satırı (Sure 1 ve 9 hariç) */}
                  {segment.showBesmele && (
                    <p
                      className="arabic-text text-center py-1"
                      style={{
                        fontSize: `${Math.max(22, settings.arabicFontSize - 2)}px`,
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      {besmele.ar}
                    </p>
                  )}

                  {/* Kesintisiz Satır İçi (Inline) Mushaf Ayet Akışı */}
                  <div
                    dir="rtl"
                    className="arabic-text"
                    style={{
                      fontSize: `${settings.arabicFontSize}px`,
                      lineHeight: 2.35,
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
                        ? 'rgba(13, 148, 136, 0.22)'
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
                          style={{
                            backgroundColor: highlightBg,
                          }}
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

            {/* Alt Mushaf Sayfa Numarası */}
            <div
              className="mt-6 pt-3 border-t flex items-center justify-center text-xs font-bold tabular-nums"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <span>
                — {pageBundle.pageNo} / {pageBundle.maxPage} —
              </span>
            </div>
          </div>
        </div>

        {/* Mushaf Sayfa Geçiş Kontrolleri: Solda Sonraki Sayfa, Sağda Önceki Sayfa */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => {
              sfxService.play('click');
              onChangePage(pageBundle.pageNo + 1);
            }}
            className="flex-1 sm:flex-initial min-h-[46px] px-4 sm:px-5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Sonraki Sayfa</span>
          </button>

          <span
            className="text-xs font-semibold tabular-nums hidden sm:inline"
            style={{ color: 'var(--text-muted)' }}
          >
            Sayfa {pageBundle.pageNo}
          </span>

          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => {
              sfxService.play('click');
              onChangePage(pageBundle.pageNo - 1);
            }}
            className="flex-1 sm:flex-initial min-h-[46px] px-4 sm:px-5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="whitespace-nowrap">Önceki Sayfa</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* ====================================================================
          SAĞ / ALT KOLON (5 sütun): Senkronize Seçili Ayet İnceleme Paneli
          ==================================================================== */}
      <aside className="lg:col-span-5 lg:sticky lg:top-20 surface-card rounded-2xl overflow-hidden flex flex-col lg:max-h-[calc(100dvh-6.5rem)]">
        {/* Panel Sekmeleri: Seçili Ayet | Sayfadaki Tüm Mealler */}
        <div
          className="p-2.5 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setInspectorTab('selected');
              }}
              className="min-h-[40px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
              <span>Seçili Ayet</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setInspectorTab('all_page');
              }}
              className="min-h-[40px] px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
              <span>Sayfadaki Tüm Mealler ({pageBundle.verses.length})</span>
            </button>
          </div>
        </div>

        {/* Panel İçeriği */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          {inspectorTab === 'selected' && selectedVerse && selectedSegment ? (
            <div className="space-y-4">
              {/* Ayet Başlığı ve Hızlı Aksiyonlar */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-extrabold tracking-tight">
                      {selectedSegment.surahMeta.nameTr} · {selectedVerse.ayah}. Ayet
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
                    onClick={() => onOpenSurahInfo(selectedSegment.surahMeta)}
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

                {/* Bu Ayetten Dinle · Yıldızla · Kopyala */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayFromVerse(selectedVerse, false)}
                    className="flex-1 min-h-[42px] px-3.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Headphones className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">Bu Ayetten Dinle</span>
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
                    onClick={() =>
                      handleCopyVerse(selectedVerse, selectedSegment.surahMeta.nameTr)
                    }
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
          ) : (
            /* SEKME 2: Sayfadaki Tüm Ayetlerin Meali */
            <div className="space-y-2.5">
              {pageBundle.verses.map((v) => {
                const seg = pageBundle.segments.find((s) => s.surahMeta.no === v.surah);
                const isSelected = selectedVerse?.id === v.id;
                const isPlaying = playingAyahId === v.id;

                return (
                  <button
                    key={`page-meal-${v.id}`}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onSelectVerse(v);
                      setInspectorTab('selected');
                    }}
                    className="w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer space-y-1.5"
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
                      <span
                        className="font-extrabold tabular-nums"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {seg?.surahMeta.shortNameTr ?? `${v.surah}. Sure`} · {v.ayah}. Ayet
                      </span>
                      {v.m1?.mg && settings.preferredMeal !== 'm2' && (
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          {v.m1.mg[0]}–{v.m1.mg[1]} birleşik
                        </span>
                      )}
                    </div>

                    {(settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') &&
                      v.m1 && (
                        <p
                          className="turkish-reading text-xs sm:text-sm"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {v.m1.t}
                        </p>
                      )}

                    {(settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') &&
                      v.m2 && (
                        <p
                          className="turkish-reading text-xs sm:text-sm"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {settings.preferredMeal === 'both' && (
                            <span
                              className="font-bold mr-1"
                              style={{ color: 'var(--brand-accent-text)' }}
                            >
                              DİB:
                            </span>
                          )}
                          {v.m2.t}
                        </p>
                      )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
