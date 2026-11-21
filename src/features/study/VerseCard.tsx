import React, { useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Headphones,
  Languages,
  Link2,
  MoreHorizontal,
  Scale,
  Share2,
  Star,
  Volume2,
} from 'lucide-react';
import { findMealById } from '../../config/mealsConfig';
import { SAJDAH_AYAH_IDS } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  AppSettings,
  BookContentMode,
  CombinedVerse,
  MealDefinition,
  MealVerse,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { WordMealGrid } from './WordMealGrid';

interface VerseCardProps {
  verse: CombinedVerse;
  surahMeta: SurahMeta;
  settings: AppSettings;
  globalWordMode: WordMealMode;
  contentMode?: BookContentMode;
  mealAudioFocusOnly?: boolean;
  isBookmarked: boolean;
  isPlayingThisAyah: boolean;
  primaryMeal?: MealDefinition;
  secondaryMeal?: MealDefinition;
  isDual?: boolean;
  primaryVerse?: MealVerse | null;
  secondaryVerse?: MealVerse | null;
  isLoadingExtra?: boolean;
  onToggleBookmark: (ayahId: number) => void;
  onPlayFromHere: (verse: CombinedVerse) => void;
  onPlayMealFromHere: (verse: CombinedVerse) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
}

export const VerseCard: React.FC<VerseCardProps> = ({
  verse,
  surahMeta,
  settings,
  globalWordMode,
  contentMode = 'interleaved',
  mealAudioFocusOnly = false,
  isBookmarked,
  isPlayingThisAyah,
  primaryMeal,
  secondaryMeal,
  isDual,
  primaryVerse,
  secondaryVerse,
  isLoadingExtra = false,
  onToggleBookmark,
  onPlayFromHere,
  onPlayMealFromHere,
  onShareVerse,
}) => {
  const { openMealCompare, openQuickMemorize, manifest } = useAppStore();
  const surahNameTr = surahMeta.nameTr;
  const [localWordOverride, setLocalWordOverride] = useState<boolean | null>(null);
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [expandedMergedPrimary, setExpandedMergedPrimary] = useState(false);
  const [expandedMergedSecondary, setExpandedMergedSecondary] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const resolvedPrimaryMeal = primaryMeal ?? findMealById(settings.primaryMealId, manifest);
  const resolvedSecondaryMeal = secondaryMeal ?? findMealById(settings.secondaryMealId, manifest);
  const resolvedIsDual =
    isDual ?? (settings.mealDisplayMode === 'dual' || settings.preferredMeal === 'both');
  const resolvedPrimaryVerse =
    primaryVerse !== undefined
      ? primaryVerse
      : resolvedPrimaryMeal.id === 'm2'
        ? verse.m2
        : verse.m1;
  const resolvedSecondaryVerse = resolvedIsDual
    ? secondaryVerse !== undefined
      ? secondaryVerse
      : resolvedSecondaryMeal.id === 'm1'
        ? verse.m1
        : verse.m2
    : null;

  const isMuqattaat = Boolean(verse.ar.mq);
  const isSajdah = SAJDAH_AYAH_IDS.has(verse.id);

  const showWordGrid =
    settings.wordByWordEnabled &&
    (localWordOverride !== null ? localWordOverride : globalWordMode !== 'off');
  const effectiveWordMode: Exclude<WordMealMode, 'off'> =
    globalWordMode === 'quiz' ? 'quiz' : 'visible';

  const primaryFootnotes = resolvedPrimaryVerse?.fn ?? [];
  const secondaryFootnotes = resolvedIsDual ? (resolvedSecondaryVerse?.fn ?? []) : [];
  const totalFootnotes = settings.showFootnotes
    ? primaryFootnotes.length + secondaryFootnotes.length
    : 0;

  const handleCopy = async () => {
    sfxService.play('click');
    const parts: string[] = [
      `${surahNameTr} ${verse.surah}:${verse.ayah} (${verse.cuz}. Cüz · Sayfa ${verse.page})`,
      verse.ar.t,
    ];
    if (resolvedPrimaryVerse?.t) {
      parts.push(`${resolvedPrimaryMeal.shortLabel}: ${resolvedPrimaryVerse.t}`);
    }
    if (resolvedIsDual && resolvedSecondaryVerse?.t) {
      parts.push(`${resolvedSecondaryMeal.shortLabel}: ${resolvedSecondaryVerse.t}`);
    }
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Kopyalama desteklenmiyorsa sessizce geç
    }
  };

  const renderMealBlock = (
    meal: MealVerse | null,
    label: string,
    accentColor: string,
    expanded: boolean,
    onToggleExpand: () => void,
    withTopBorder: boolean,
  ) => {
    if (!meal) return null;
    const mg = meal.mg;
    const isMergedContinuation = Boolean(mg && verse.ayah > mg[0]);

    return (
      <div
        className={withTopBorder ? 'pt-3.5 border-t' : undefined}
        style={withTopBorder ? { borderColor: 'var(--border-subtle)' } : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-bold" style={{ color: accentColor }}>
            {label}
          </span>
          {mg && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Link2 className="w-3 h-3 shrink-0" />
              <span>
                {mg[0]}–{mg[1]}. Ayetler Birleşik Meal
              </span>
            </span>
          )}
        </div>

        {isMergedContinuation && !expanded ? (
          <div
            className="px-3.5 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>
              Bu ayetin meali {mg![0]}–{mg![1]}. ayetlerle birlikte yukarıda verilmiştir.
            </span>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onToggleExpand();
              }}
              className="font-bold cursor-pointer hover:underline shrink-0"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              Metni Göster
            </button>
          </div>
        ) : (
          <div>
            <p
              className="turkish-reading"
              style={{
                fontSize: `${settings.turkishFontSize}px`,
                color: 'var(--text-secondary)',
              }}
            >
              {meal.t}
            </p>
            {isMergedContinuation && expanded && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onToggleExpand();
                }}
                className="mt-1.5 text-xs font-semibold cursor-pointer hover:underline"
                style={{ color: 'var(--text-muted)' }}
              >
                Birleşik metni gizle
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const highlightSajdah = isSajdah && settings.highlightSajdah;

  return (
    <article
      id={`verse-card-${verse.id}`}
      data-ayah-id={verse.id}
      className="surface-card rounded-2xl p-4 sm:p-6 transition-all"
      style={{
        borderColor: isPlayingThisAyah
          ? 'var(--brand-primary)'
          : highlightSajdah
            ? 'rgba(217, 119, 6, 0.55)'
            : 'var(--border-subtle)',
        backgroundColor:
          highlightSajdah && !isPlayingThisAyah
            ? 'color-mix(in srgb, var(--bg-surface) 95%, #D97706 5%)'
            : undefined,
        boxShadow: isPlayingThisAyah
          ? '0 0 0 2px rgba(15, 118, 110, 0.22), var(--shadow-card)'
          : highlightSajdah
            ? '0 0 0 1px rgba(217, 119, 6, 0.18), var(--shadow-card)'
            : 'var(--shadow-card)',
      }}
    >
      {/* Üst Bar: Sure:Ayet · Cüz · Sayfa ve Aksiyon Butonları */}
      <div
        className="pb-3 mb-4 border-b flex flex-wrap items-center justify-between gap-2"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums inline-flex items-center gap-1"
            style={{
              backgroundColor: isPlayingThisAyah
                ? 'var(--brand-primary)'
                : 'var(--brand-primary-soft)',
              color: isPlayingThisAyah ? '#FFFFFF' : 'var(--brand-primary-text)',
            }}
          >
            {isPlayingThisAyah && <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
            <span>
              {verse.surah}:{verse.ayah}
            </span>
          </span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {verse.cuz}. Cüz · Sayfa {verse.page}
          </span>
          {isMuqattaat && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-md"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-secondary)',
              }}
            >
              Hurûf-ı Mukattaa
            </span>
          )}
          {highlightSajdah && (
            <span
              title="Diyanet / Hanefî standardına göre Tilâvet Secdesi ayeti"
              className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg border whitespace-nowrap"
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
        </div>

        {/* Hızlı Aksiyonlar (40-44px dokunma alanları) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPlayFromHere(verse)}
            title="Bu ayetten itibaren dinle"
            className="min-h-[40px] px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            style={{
              backgroundColor: isPlayingThisAyah
                ? 'var(--brand-primary)'
                : 'var(--bg-surface-soft)',
              color: isPlayingThisAyah ? '#FFFFFF' : 'var(--brand-primary-text)',
            }}
          >
            <Headphones className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Dinle</span>
          </button>

          <button
            type="button"
            onClick={() => onPlayMealFromHere(verse)}
            title="Bu ayetten itibaren Türkçe sesli mealini dinle"
            className="min-h-[40px] px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'var(--brand-accent)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <Volume2 className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Sesli Meal</span>
          </button>

          {settings.wordByWordEnabled && verse.words.length > 0 && (
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setLocalWordOverride((prev) =>
                  prev === null ? globalWordMode === 'off' : !prev,
                );
              }}
              title="Kelime-kelime meali göster veya gizle"
              aria-label="Kelime meali"
              className="min-w-[40px] min-h-[40px] px-2 rounded-xl flex items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer"
              style={{
                backgroundColor: showWordGrid ? 'var(--brand-primary-soft)' : 'transparent',
                color: showWordGrid ? 'var(--brand-primary-text)' : 'var(--text-muted)',
              }}
            >
              <Languages className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">Kelime</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              openMealCompare(verse.surah, verse.ayah);
            }}
            title="Bu ayeti 24 farklı Türkçe mealde karşılaştır"
            aria-label="24 mealde karşılaştır"
            className="min-w-[40px] min-h-[40px] px-2 rounded-xl flex items-center justify-center gap-1 text-xs font-bold transition-colors cursor-pointer hover:bg-[var(--brand-primary-soft)]"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            <Scale className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">Karşılaştır</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleBookmark(verse.id)}
            title={isBookmarked ? 'Yıldızlılardan çıkar' : 'Ayeti yıldızla'}
            aria-label={isBookmarked ? 'Yıldızlılardan çıkar' : 'Ayeti yıldızla'}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
            style={{
              color: isBookmarked ? 'var(--brand-accent)' : 'var(--text-muted)',
              backgroundColor: isBookmarked ? 'var(--brand-accent-soft)' : 'transparent',
            }}
          >
            <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setMenuOpen((v) => !v);
              }}
              title="Diğer işlemler (Karşılaştır / Paylaş / Kopyala)"
              aria-label="Ayet işlem menüsü"
              aria-expanded={menuOpen}
              className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: menuOpen ? 'var(--bg-surface-soft)' : 'transparent',
                color: 'var(--text-muted)',
              }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-11 z-30 w-56 rounded-2xl border shadow-xl p-1.5 space-y-0.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    sfxService.play('click');
                    openQuickMemorize(verse.surah, verse.ayah, verse.page);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <BookMarked className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Buradan Ezber Başlat</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    sfxService.play('click');
                    openMealCompare(verse.surah, verse.ayah);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Scale className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Mealleri Karşılaştır (24)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    sfxService.play('click');
                    onShareVerse(verse, surahMeta);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Share2 className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Paylaşım Kartı Oluştur</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void handleCopy();
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: copied ? '#10B981' : 'var(--text-primary)' }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Kopyalandı' : 'Ayeti Kopyala'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Arapça Metin (Sadece Meal veya Odaklı Sesli Meal modunda gizlenir) */}
      {!mealAudioFocusOnly && contentMode !== 'meal_only' && (
        <div className={contentMode === 'ar_only' ? '' : 'mb-4'}>
          <p
            className="arabic-text text-right break-words"
            style={{
              fontSize: `${settings.arabicFontSize}px`,
              color: 'var(--text-primary)',
            }}
          >
            {verse.ar.t}
            {highlightSajdah && (
              <span
                title="Tilâvet Secdesi Ayeti"
                aria-label="Tilâvet Secdesi Ayeti"
                className="inline-flex items-center justify-center mx-1.5 px-1.5 py-0.5 rounded-md border text-[0.62em] font-extrabold align-middle leading-none select-none"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'rgba(217, 119, 6, 0.5)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                ۩
              </span>
            )}
          </p>
        </div>
      )}

      {/* Etkileşimli Kelime-Kelime Meal */}
      {!mealAudioFocusOnly && contentMode !== 'meal_only' && showWordGrid && verse.words.length > 0 && (
        <div
          className="mb-4 p-3.5 rounded-xl border"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <WordMealGrid
            ayahId={verse.id}
            words={verse.words}
            wordMode={effectiveWordMode}
            arabicFontSize={settings.arabicFontSize}
          />
        </div>
      )}

      {/* Seçili Meal / Çift Meal (24 Meal Desteği — Sadece AR modunda gizlenir) */}
      {contentMode !== 'ar_only' && (
        <div className="space-y-3.5">
          {resolvedPrimaryVerse ? (
            renderMealBlock(
              resolvedPrimaryVerse,
              resolvedPrimaryMeal.label,
              'var(--brand-primary-text)',
              expandedMergedPrimary,
              () => setExpandedMergedPrimary((v) => !v),
              false,
            )
          ) : isLoadingExtra ? (
            <div className="space-y-1.5">
              <span className="text-xs font-bold" style={{ color: 'var(--brand-primary-text)' }}>
                {resolvedPrimaryMeal.label}
              </span>
              <div className="h-4 w-5/6 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
            </div>
          ) : null}

          {resolvedIsDual &&
            (resolvedSecondaryVerse ? (
              renderMealBlock(
                resolvedSecondaryVerse,
                resolvedSecondaryMeal.label,
                'var(--brand-accent-text)',
                expandedMergedSecondary,
                () => setExpandedMergedSecondary((v) => !v),
                true,
              )
            ) : isLoadingExtra ? (
              <div
                className="pt-3.5 border-t space-y-1.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-xs font-bold" style={{ color: 'var(--brand-accent-text)' }}>
                  {resolvedSecondaryMeal.label}
                </span>
                <div className="h-4 w-5/6 rounded bg-[var(--bg-surface-soft)] animate-pulse" />
              </div>
            ) : null)}
        </div>
      )}

      {/* Dipnotlar (fn) Akordeonu */}
      {contentMode !== 'ar_only' && totalFootnotes > 0 && (
        <div
          className="mt-4 pt-3 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setShowFootnotes((v) => !v);
            }}
            className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            style={{
              backgroundColor: showFootnotes
                ? 'var(--brand-primary-soft)'
                : 'var(--bg-surface-soft)',
              color: showFootnotes ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
            }}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Açıklama / Dipnot ({totalFootnotes})</span>
            {showFootnotes ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {showFootnotes && (
            <div
              className="mt-3 p-4 rounded-xl border space-y-3 text-xs sm:text-sm leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {primaryFootnotes.length > 0 && (
                <div className="space-y-1.5">
                  <p
                    className="text-xs font-extrabold"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    {resolvedPrimaryMeal.label} Dipnotları
                  </p>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    {primaryFootnotes.map((note, idx) => (
                      <li key={`p-fn-${idx}`} className="turkish-reading">
                        {note}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {resolvedIsDual && secondaryFootnotes.length > 0 && (
                <div
                  className={
                    primaryFootnotes.length > 0
                      ? 'pt-3 border-t space-y-1.5'
                      : 'space-y-1.5'
                  }
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <p
                    className="text-xs font-extrabold"
                    style={{ color: 'var(--brand-accent-text)' }}
                  >
                    {resolvedSecondaryMeal.label} Dipnotları
                  </p>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    {secondaryFootnotes.map((note, idx) => (
                      <li key={`s-fn-${idx}`} className="turkish-reading">
                        {note}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
};
