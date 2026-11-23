import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeftRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Headphones,
  Info,
  Languages,
  Link2,
  ListPlus,
  MoreHorizontal,
  Pin,
  Repeat,
  Scale,
  Share2,
  Star,
  StickyNote,
  Volume2,
} from 'lucide-react';
import {
  MEALS_CATALOG,
  findMealById,
  getMealTextPresentation,
  resolveSpokenMealInfo,
} from '../../config/mealsConfig';
import { useMutashabihatData, useRukusData } from '../../hooks/useStudyReferenceData';
import { audioQueueService } from '../../services/audioQueueService';
import { SAJDAH_AYAH_IDS, toArabicIndicDigits } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import {
  VERSE_NOTE_COLOR_STYLES,
  makeVerseNoteKey,
  verseNotesStorage,
} from '../../services/verseNotesStorage';
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
import type { SurahExtraInfo } from '../../types/fihrist';
import type { TajweedRuleDef, TajweedWord } from '../../types/tajweed';
import { RukuMarkerBadge } from './StudyPopovers';
import { SyncedVerseArabic } from './SyncedArabicText';
import { WordMealGrid } from './WordMealGrid';

interface VerseCardProps {
  verse: CombinedVerse;
  surahMeta: SurahMeta;
  surahExtraInfo?: SurahExtraInfo | null;
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
  tajweedWords?: TajweedWord[] | null;
  tajweedRules?: Record<string, TajweedRuleDef>;
  onToggleBookmark: (ayahId: number) => void;
  onPlayFromHere: (verse: CombinedVerse) => void;
  onPlayMealFromHere: (verse: CombinedVerse) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
}

export const VerseCard: React.FC<VerseCardProps> = ({
  verse,
  surahMeta,
  surahExtraInfo = null,
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
  tajweedWords = null,
  tajweedRules,
  onToggleBookmark,
  onPlayFromHere,
  onPlayMealFromHere,
  onShareVerse,
}) => {
  const effectiveContentMode: BookContentMode =
    settings.readerContentMode === 'ar_only'
      ? 'ar_only'
      : settings.readerContentMode === 'meal_only'
        ? 'meal_only'
        : contentMode === 'ar_only' || contentMode === 'meal_only'
          ? contentMode
          : 'interleaved';
  const {
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
  const surahNameTr = surahMeta.nameTr;
  const mutashabihatCount = getMutashabihatCount(verse.surah, verse.ayah);
  const rukuEnd = settings.showRukuMarkers ? getRukuEndingAt(verse.surah, verse.ayah) : null;
  const verseNotesMap = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getMapSnapshot,
  );
  const verseNote = verseNotesMap.get(makeVerseNoteKey(verse.surah, verse.ayah));
  const verseNoteStyle = verseNote ? VERSE_NOTE_COLOR_STYLES[verseNote.color] : null;
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

  const [localWordOverride, setLocalWordOverride] = useState<boolean | null>(null);
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [expandedMergedPrimary, setExpandedMergedPrimary] = useState(false);
  const [expandedMergedSecondary, setExpandedMergedSecondary] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNuzulNote, setShowNuzulNote] = useState(false);

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
  const isMedeniExceptionAyah = Boolean(
    surahExtraInfo?.medeniAyahs?.some(([s, e]) => verse.ayah >= s && verse.ayah <= e),
  );
  const matchingNuzulNote =
    surahExtraInfo?.nuzulNote &&
    surahExtraInfo.nuzulNoteRanges?.some(([s, e]) => verse.ayah >= s && verse.ayah <= e)
      ? surahExtraInfo.nuzulNote
      : null;

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
    mealDef: MealDefinition,
    isPrimaryBlock: boolean,
    accentColor: string,
    expanded: boolean,
    onToggleExpand: () => void,
    withTopBorder: boolean,
  ) => {
    if (!meal) return null;
    const mealId = mealDef.id;
    const label = mealDef.label;
    const mealPres = getMealTextPresentation(mealDef, settings.turkishFontSize);
    const mg = meal.mg;
    const isMergedContinuation = Boolean(mg && verse.ayah > mg[0]);
    const showSpokenMismatch =
      isPrimaryBlock &&
      isPlayingThisAyah &&
      isMealAudioFlowActive &&
      Boolean(activeSpokenMeal) &&
      activeSpokenMeal!.mealId !== mealId &&
      (!resolvedIsDual || resolvedSecondaryMeal.id !== activeSpokenMeal!.mealId);
    const showSpokenMatchSecondary =
      !isPrimaryBlock &&
      isPlayingThisAyah &&
      isMealAudioFlowActive &&
      Boolean(activeSpokenMeal) &&
      activeSpokenMeal!.mealId === mealId;

    return (
      <div
        className={withTopBorder ? 'pt-3.5 border-t' : undefined}
        style={withTopBorder ? { borderColor: 'var(--border-subtle)' } : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-bold" style={{ color: accentColor }}>
              {label}
            </span>
            {showSpokenMismatch && activeSpokenMeal && (
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
            {showSpokenMatchSecondary && activeSpokenMeal && (
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
              dir={mealPres.dir}
              lang={mealPres.lang}
              className={mealPres.className}
              style={{
                fontSize: `${mealPres.fontSizePx}px`,
                fontFamily: mealPres.fontFamily,
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
  const verseKey = `${verse.surah}:${verse.ayah}`;
  const isSelected = selectedVerseKey === verseKey;

  const handleToggleSelectCard = () => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : '';
    if (sel) return;
    sfxService.play('click');
    if (isSelected) {
      setSelectedVerseKey(null);
      return;
    }
    setSelectedVerseKey(verseKey);
    audioQueueService.syncPausedSelection(verse, meta);
  };

  return (
    <article
      id={`verse-card-${verse.id}`}
      data-ayah-id={verse.id}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (
          target?.closest(
            'button, a, [role="button"], input, select, [data-tajweed-rule], [data-waqf-sign], [data-ruku-badge]',
          )
        ) {
          return;
        }
        handleToggleSelectCard();
      }}
      className="surface-card rounded-2xl p-4 sm:p-6 transition-all cursor-pointer"
      style={{
        borderColor: isPlayingThisAyah
          ? 'var(--brand-primary)'
          : isSelected
            ? 'rgba(217, 119, 6, 0.6)'
            : highlightSajdah
              ? 'rgba(217, 119, 6, 0.55)'
              : 'var(--border-subtle)',
        backgroundColor:
          isSelected && !isPlayingThisAyah
            ? 'color-mix(in srgb, var(--bg-surface) 94%, #D97706 6%)'
            : highlightSajdah && !isPlayingThisAyah
              ? 'color-mix(in srgb, var(--bg-surface) 95%, #D97706 5%)'
              : undefined,
        boxShadow: isPlayingThisAyah
          ? '0 0 0 2px rgba(15, 118, 110, 0.22), var(--shadow-card)'
          : isSelected
            ? '0 0 0 2px rgba(217, 119, 6, 0.20), var(--shadow-card)'
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSelectCard();
            }}
            title={isSelected ? 'Ayet seçimini kaldır' : 'Bu ayeti dinleme odağı olarak seç'}
            className="px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums inline-flex items-center gap-1 cursor-pointer transition-colors"
            style={{
              backgroundColor: isPlayingThisAyah
                ? 'var(--brand-primary)'
                : isSelected
                  ? 'var(--brand-accent)'
                  : 'var(--brand-primary-soft)',
              color:
                isPlayingThisAyah || isSelected ? '#FFFFFF' : 'var(--brand-primary-text)',
            }}
          >
            {isPlayingThisAyah && <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
            <span>
              {verse.surah}:{verse.ayah}
            </span>
          </button>
          {isSelected && !isPlayingThisAyah && (
            <span
              className="text-[10.5px] font-extrabold px-2 py-0.5 rounded-md"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              Seçili
            </span>
          )}
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
          {isMedeniExceptionAyah && (
            <span
              title="1381 Mısır baskısı / İbn Abdi'l-Kâfî rivayetine göre Mekkî suredeki Medenî ayet"
              className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'rgba(217, 119, 6, 0.35)',
                color: 'var(--brand-accent-text)',
              }}
            >
              Medenî Ayet
            </span>
          )}
          {rukuEnd && (
            <RukuMarkerBadge
              ruku={rukuEnd}
              surahNameTr={surahNameTr}
              page={verse.page}
              variant="pill"
            />
          )}
          {mutashabihatCount > 0 && (
            <button
              type="button"
              onClick={() => openMutashabihat(verse.surah, verse.ayah)}
              title={`Bu ayetle lafız benzerliği bulunan ${mutashabihatCount} ayeti karşılaştır`}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border text-[11px] font-extrabold whitespace-nowrap cursor-pointer transition-colors hover:opacity-85"
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
          {matchingNuzulNote && (
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowNuzulNote((prev) => !prev);
              }}
              title={matchingNuzulNote}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap cursor-pointer transition-opacity hover:opacity-85"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'rgba(15, 118, 110, 0.3)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Info className="w-3 h-3 shrink-0" />
              <span>Nüzul Notu</span>
            </button>
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

        {/* Hızlı Aksiyonlar: Mobilde yalnızca 3 temiz ikon (Dinle · Yıldız · ⋯), masaüstünde tam aksiyonlar */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectedVerseKey(verseKey);
              onPlayFromHere(verse);
            }}
            title="Bu ayetten itibaren dinle"
            aria-label="Bu ayetten itibaren dinle"
            className="w-9 h-9 sm:w-auto sm:min-h-[38px] sm:px-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
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
            onClick={() => {
              setSelectedVerseKey(verseKey);
              onPlayMealFromHere(verse);
            }}
            title="Bu ayetten itibaren Türkçe sesli mealini dinle"
            className="hidden sm:flex min-h-[38px] px-2.5 rounded-xl border items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'var(--brand-accent)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <Volume2 className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Sesli Meal</span>
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
              className="hidden sm:flex min-w-[38px] min-h-[38px] px-2 rounded-xl items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer"
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
            title={`Bu ayeti ${MEALS_CATALOG.length} farklı meal ve tefsirde karşılaştır`}
            aria-label={`${MEALS_CATALOG.length} meal ve tefsirde karşılaştır`}
            className="hidden sm:flex min-w-[38px] min-h-[38px] px-2 rounded-xl items-center justify-center gap-1 text-xs font-bold transition-colors cursor-pointer hover:bg-[var(--brand-primary-soft)]"
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
            className="w-9 h-9 sm:min-w-[38px] sm:min-h-[38px] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
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
              title="Diğer işlemler (Sesli Meal / Kelime / Karşılaştır / Paylaş / Kopyala)"
              aria-label="Ayet işlem menüsü"
              aria-expanded={menuOpen}
              className="w-9 h-9 sm:min-w-[38px] sm:min-h-[38px] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: menuOpen ? 'var(--bg-surface-soft)' : 'transparent',
                color: 'var(--text-muted)',
              }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-10 z-30 w-56 rounded-2xl border shadow-xl p-1.5 space-y-0.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                {/* Mobilde sadeleştirmek için menüye alınan hızlı okuma aksiyonları */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onPlayMealFromHere(verse);
                  }}
                  className="sm:hidden w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Volume2 className="w-4 h-4" style={{ color: 'var(--brand-accent-text)' }} />
                  <span>Sesli Meal Dinle</span>
                </button>

                {settings.wordByWordEnabled && verse.words.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      sfxService.play('click');
                      setLocalWordOverride((prev) =>
                        prev === null ? globalWordMode === 'off' : !prev,
                      );
                    }}
                    className="sm:hidden w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span className="flex items-center gap-2">
                      <Languages className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                      <span>Kelime Meali</span>
                    </span>
                    <span
                      className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md"
                      style={{
                        backgroundColor: showWordGrid
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface-soft)',
                        color: showWordGrid ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                      }}
                    >
                      {showWordGrid ? 'Açık' : 'Kapalı'}
                    </span>
                  </button>
                )}

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
                    openVerseNoteModal(verse.surah, verse.ayah, verse.page);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="flex items-center gap-2">
                    <StickyNote
                      className="w-4 h-4 shrink-0"
                      style={{ color: verseNoteStyle ? verseNoteStyle.dot : 'var(--brand-primary-text)' }}
                    />
                    <span>{verseNote ? 'Kişisel Notumu Düzenle' : 'Kişisel Not Ekle'}</span>
                  </span>
                  {verseNote && verseNoteStyle && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: verseNoteStyle.dot }}
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    sfxService.play('click');
                    openQuickResearch(verse.surah, verse.ayah, verse.ayah, verse.page);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Pin className="w-4 h-4" style={{ color: 'var(--brand-accent-text)' }} />
                  <span>Araştırmaya Ekle</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    sfxService.play('click');
                    if (manifest && meta) {
                      void audioQueueService.startSegmentQueue({
                        items: [
                          {
                            id: `loop_${verse.id}`,
                            type: 'ayah_range',
                            label: `${surahNameTr} ${verse.ayah}. Ayet`,
                            surah: verse.surah,
                            startAyah: verse.ayah,
                            endAyah: verse.ayah,
                          },
                        ],
                        title: `${surahNameTr} ${verse.ayah}. Ayet`,
                        context: 'single',
                        contextKey: `single:${verse.id}`,
                        manifest,
                        meta,
                        prefs: audioPrefs,
                        queueLoopOverride: 'infinite',
                      });
                    }
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Repeat className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Bu Ayeti Döngüde Dinle</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    sfxService.play('click');
                    openListeningDrawer({
                      initialTab: 'playlists',
                      pendingAddItem: {
                        type: 'ayah_range',
                        label: `${surahNameTr} ${verse.ayah}. Ayet`,
                        surah: verse.surah,
                        startAyah: verse.ayah,
                        endAyah: verse.ayah,
                      },
                    });
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <ListPlus className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Çalma Listesine Ekle</span>
                </button>

                {mutashabihatCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openMutashabihat(verse.surah, verse.ayah);
                    }}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center gap-2 hover:bg-[var(--bg-surface-soft)] cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <ArrowLeftRight
                      className="w-4 h-4"
                      style={{ color: 'var(--brand-accent-text)' }}
                    />
                    <span>Benzer Ayetler ({mutashabihatCount})</span>
                  </button>
                )}

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
                  <span>Mealleri Karşılaştır ({MEALS_CATALOG.length})</span>
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

      {matchingNuzulNote && showNuzulNote && (
        <div
          className="mb-3.5 px-3 py-2 rounded-xl border text-xs flex items-start gap-2 leading-relaxed"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            borderColor: 'rgba(15, 118, 110, 0.25)',
            color: 'var(--text-secondary)',
          }}
        >
          <Info
            className="w-3.5 h-3.5 shrink-0 mt-0.5"
            style={{ color: 'var(--brand-primary-text)' }}
          />
          <span>
            <strong style={{ color: 'var(--brand-primary-text)' }}>Nüzul Notu: </strong>
            {matchingNuzulNote}
          </span>
        </div>
      )}

      {/* Arapça Metin (Sadece Meal veya Odaklı Sesli Meal modunda gizlenir) */}
      {!mealAudioFocusOnly && effectiveContentMode !== 'meal_only' && (
        <div className={effectiveContentMode === 'ar_only' ? '' : 'mb-4'}>
          {(() => {
            const useTajweed =
              settings.tajweedEnabled &&
              Boolean(tajweedWords && tajweedWords.length > 0 && tajweedRules);
            return (
              <p
                className={`${useTajweed ? 'arabic-tajweed' : 'arabic-text'} text-right break-words`}
                style={{
                  fontSize: `${settings.arabicFontSize}px`,
                  color: 'var(--text-primary)',
                }}
              >
                {
                  <SyncedVerseArabic
                    text={verse.ar.t}
                    surahNo={verse.surah}
                    ayahNo={verse.ayah}
                    isPlaying={isPlayingThisAyah}
                    wordSyncEnabled={settings.wordSyncEnabled}
                    useTajweed={useTajweed}
                    tajweedWords={tajweedWords}
                    tajweedRules={tajweedRules}
                    theme={settings.theme}
                  />
                }
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
                {(useTajweed || !/[\u0660-\u0669\u06DD﴿﴾]\s*$/.test(verse.ar.t)) && (
                  <span
                    className="arabic-text inline-block mx-1.5 text-[0.78em] select-none align-middle"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    ﴿{toArabicIndicDigits(verse.ayah)}﴾
                  </span>
                )}
                {rukuEnd && (
                  <RukuMarkerBadge
                    ruku={rukuEnd}
                    surahNameTr={surahNameTr}
                    page={verse.page}
                    variant="inline"
                  />
                )}
              </p>
            );
          })()}
        </div>
      )}

      {/* Etkileşimli Kelime-Kelime Meal (Sadece Meal modunda gizlenir) */}
      {!mealAudioFocusOnly &&
        effectiveContentMode !== 'meal_only' &&
        showWordGrid &&
        verse.words.length > 0 && (
          <div
            className="mb-4 p-3.5 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <WordMealGrid
              ayahId={verse.id}
              surah={verse.surah}
              ayah={verse.ayah}
              words={verse.words}
              wordMode={effectiveWordMode}
              arabicFontSize={settings.arabicFontSize}
              isPlayingThisAyah={isPlayingThisAyah}
              wordSyncEnabled={settings.wordSyncEnabled}
            />
          </div>
        )}

      {/* Seçili Meal / Çift Meal (Meal & Tefsir Desteği — Sadece AR modunda gizlenir) */}
      {effectiveContentMode !== 'ar_only' && (
        <div className="space-y-3.5">
          {resolvedPrimaryVerse ? (
            renderMealBlock(
              resolvedPrimaryVerse,
              resolvedPrimaryMeal,
              true,
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
                resolvedSecondaryMeal,
                false,
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
      {effectiveContentMode !== 'ar_only' && totalFootnotes > 0 && (
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

      {/* Kişisel Tefekkür Notum Kutusu */}
      {verseNote && verseNoteStyle && (
        <button
          type="button"
          onClick={() => openVerseNoteModal(verse.surah, verse.ayah, verse.page)}
          className="mt-4 w-full text-left rounded-xl border p-3 sm:p-3.5 transition-opacity hover:opacity-95 cursor-pointer space-y-1.5"
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
              <StickyNote className="w-3.5 h-3.5 shrink-0" />
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
              className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap line-clamp-4"
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
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold"
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
    </article>
  );
};
