import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowLeftRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GripHorizontal,
  Headphones,
  Info,
  Languages,
  Link2,
  ListPlus,
  Pin,
  Repeat,
  Scale,
  Share2,
  Sparkles,
  Star,
  Volume2,
  X,
} from 'lucide-react';
import {
  MEALS_CATALOG,
  getMealTextPresentation,
  resolveSpokenMealInfo,
} from '../../config/mealsConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { useMutashabihatData, useRukusData } from '../../hooks/useStudyReferenceData';
import { useTajweedData } from '../../hooks/useTajweedData';
import { audioQueueService } from '../../services/audioQueueService';
import { SAJDAH_AYAH_IDS } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  AppSettings,
  CombinedVerse,
  SurahMeta,
  WordMealMode,
} from '../../types/quran';
import { RukuMarkerBadge } from './StudyPopovers';
import { SyncedVerseArabic } from './SyncedArabicText';
import { WordMealGrid } from './WordMealGrid';

interface DraggableVerseInspectorProps {
  isOpen: boolean;
  verse: CombinedVerse | null;
  surahMeta: SurahMeta | null;
  settings: AppSettings;
  wordMode: WordMealMode;
  isBookmarked: boolean;
  isPlaying: boolean;
  onClose: () => void;
  onPlayFromVerse: (verse: CombinedVerse) => void;
  onPlayMealFromVerse: (verse: CombinedVerse) => void;
  onToggleBookmark: (ayahId: number) => void;
  onShareVerse: (verse: CombinedVerse, surahMeta: SurahMeta) => void;
  onOpenSurahInfo: (surah: SurahMeta) => void;
}

interface Position {
  x: number;
  y: number;
}

const EDGE_MARGIN = 10;

function clampPosition(pos: Position, width: number, height: number): Position {
  if (typeof window === 'undefined') return pos;
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - Math.min(height, 72) - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(EDGE_MARGIN, pos.x), maxX),
    y: Math.min(Math.max(EDGE_MARGIN, pos.y), maxY),
  };
}

export const DraggableVerseInspector: React.FC<DraggableVerseInspectorProps> = ({
  isOpen,
  verse,
  surahMeta,
  settings,
  wordMode,
  isBookmarked,
  isPlaying,
  onClose,
  onPlayFromVerse,
  onPlayMealFromVerse,
  onToggleBookmark,
  onShareVerse,
  onOpenSurahInfo,
}) => {
  const {
    openMealCompare,
    openMutashabihat,
    openQuickMemorize,
    openQuickResearch,
    openListeningDrawer,
    manifest,
    meta,
    audioPrefs,
  } = useAppStore();
  const { getCount: getMutashabihatCount } = useMutashabihatData(isOpen);
  const { getRukuEndingAt } = useRukusData(isOpen && settings.showRukuMarkers);
  const verseSurah = verse?.surah;
  const activeSurahNos = useMemo(
    () => (verseSurah ? [verseSurah] : []),
    [verseSurah],
  );
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(activeSurahNos);

  const { rules: tjRules, getVerseWords: getTjVerseWords } = useTajweedData(
    activeSurahNos,
    isOpen && settings.tajweedEnabled,
  );

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

  const panelRef = useRef<HTMLDivElement | null>(null);
  const hasDraggedRef = useRef(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);

  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Ayet değişince dipnot panelini sıfırla
  useEffect(() => {
    setShowFootnotes(false);
  }, [verse?.id]);

  // İlk açılışta ekran boyutuna göre güvenli başlangıç konumu hesapla
  const computeDefaultPosition = useCallback((): Position => {
    if (typeof window === 'undefined') return { x: 16, y: 80 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelEl = panelRef.current;
    const w = panelEl?.offsetWidth || (vw >= 640 ? 420 : Math.min(448, vw - 20));
    const h = panelEl?.offsetHeight || Math.min(520, Math.round(vh * 0.62));

    if (vw < 640) {
      return clampPosition(
        {
          x: Math.round((vw - w) / 2),
          y: Math.max(68, vh - h - 84),
        },
        w,
        h,
      );
    }

    return clampPosition(
      {
        x: vw - w - 24,
        y: Math.max(72, Math.min(110, vh - h - 96)),
      },
      w,
      h,
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    if (!hasDraggedRef.current || !position) {
      setPosition(computeDefaultPosition());
    } else if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      setPosition((prev) => (prev ? clampPosition(prev, rect.width, rect.height) : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, computeDefaultPosition]);

  // Pencere yeniden boyutlandığında konumu sınırlar içinde tut
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      const panelEl = panelRef.current;
      const w = panelEl?.offsetWidth || 420;
      const h = panelEl?.offsetHeight || 420;
      setPosition((prev) => {
        if (!prev) return computeDefaultPosition();
        return clampPosition(prev, w, h);
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, computeDefaultPosition]);

  // Escape ile kolay kapatma
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Sürükleme olay dinleyicileri (Mouse + Touch)
  useEffect(() => {
    if (!isDragging) return;

    const updateFromClientPoint = (clientX: number, clientY: number) => {
      const offset = dragOffsetRef.current;
      const panelEl = panelRef.current;
      if (!offset || !panelEl) return;
      const w = panelEl.offsetWidth;
      const h = panelEl.offsetHeight;
      setPosition(
        clampPosition(
          {
            x: clientX - offset.dx,
            y: clientY - offset.dy,
          },
          w,
          h,
        ),
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      updateFromClientPoint(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      e.preventDefault();
      updateFromClientPoint(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleEnd = () => {
      setIsDragging(false);
      dragOffsetRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [isDragging]);

  const startDrag = (clientX: number, clientY: number, target: EventTarget | null) => {
    if (target instanceof HTMLElement && target.closest('button')) {
      return;
    }
    const panelEl = panelRef.current;
    if (!panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    hasDraggedRef.current = true;
    dragOffsetRef.current = {
      dx: clientX - rect.left,
      dy: clientY - rect.top,
    };
    setPosition({ x: rect.left, y: rect.top });
    setIsDragging(true);
  };

  if (!isOpen || !verse || !surahMeta) return null;

  const isSajdah = SAJDAH_AYAH_IDS.has(verse.id);
  const mutashabihatCount = getMutashabihatCount(verse.surah, verse.ayah);
  const rukuEnd = settings.showRukuMarkers ? getRukuEndingAt(verse.surah, verse.ayah) : null;
  const primaryVerse = getPrimaryVerse(verse);
  const secondaryVerse = isDual ? getSecondaryVerse(verse) : null;
  const primaryFootnotes = primaryVerse?.fn ?? [];
  const secondaryFootnotes = isDual ? (secondaryVerse?.fn ?? []) : [];
  const footnoteCount = settings.showFootnotes
    ? primaryFootnotes.length + secondaryFootnotes.length
    : 0;
  const effectiveWordsOpen =
    settings.wordByWordEnabled && (wordMode !== 'off' || showWords);

  const handleCopyVerse = async () => {
    sfxService.play('click');
    const lines = [`${surahMeta.nameTr} ${verse.surah}:${verse.ayah}`, verse.ar.t];
    if (primaryVerse?.t) {
      lines.push(`${primaryMeal.shortLabel}: ${primaryVerse.t}`);
    }
    if (isDual && secondaryVerse?.t) {
      lines.push(`${secondaryMeal.shortLabel}: ${secondaryVerse.t}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedId(verse.id);
      window.setTimeout(() => setCopiedId((prev) => (prev === verse.id ? null : prev)), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const posStyle: React.CSSProperties = position
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
      }
    : {
        right: '16px',
        top: '88px',
      };

  return (
    <aside
      ref={panelRef}
      role="region"
      aria-label={`Taşınabilir ayet inceleme penceresi: ${surahMeta.nameTr} ${verse.ayah}. ayet`}
      className="fixed z-[65] w-[calc(100vw-20px)] max-w-md sm:w-[420px] max-h-[68dvh] sm:max-h-[76dvh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
      style={{
        ...posStyle,
        backgroundColor: 'var(--bg-surface)',
        borderColor: isDragging
          ? 'var(--brand-primary)'
          : isSajdah && settings.highlightSajdah
            ? 'rgba(217, 119, 6, 0.55)'
            : 'var(--border-strong)',
        boxShadow: isDragging
          ? '0 22px 48px -12px rgba(0,0,0,0.34), 0 0 0 2px rgba(15,118,110,0.28)'
          : '0 20px 42px -12px rgba(0,0,0,0.28)',
      }}
    >
      {/* Sürüklenebilir Üst Başlık Çubuğu */}
      <div
        onMouseDown={(e) => startDrag(e.clientX, e.clientY, e.target)}
        onTouchStart={(e) => {
          if (e.touches.length > 0) {
            startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
          }
        }}
        title="Sürükleyerek ekran içinde istediğiniz yere taşıyabilirsiniz"
        className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 select-none touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true"
          >
            <GripHorizontal className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm font-extrabold truncate">
                {surahMeta.nameTr} · {verse.ayah}. Ayet
              </span>
              {rukuEnd && (
                <RukuMarkerBadge
                  ruku={rukuEnd}
                  surahNameTr={surahMeta.nameTr}
                  page={verse.page}
                  variant="pill"
                />
              )}
              {isPlaying && (
                <Volume2
                  className="w-3.5 h-3.5 shrink-0 animate-pulse"
                  style={{ color: 'var(--brand-primary-text)' }}
                />
              )}
            </div>
            <p className="text-[11px] tabular-nums truncate" style={{ color: 'var(--text-muted)' }}>
              {verse.cuz}. Cüz · Sayfa {verse.page}
              <span className="hidden sm:inline"> · Taşımak için sürükleyin</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onOpenSurahInfo(surahMeta);
            }}
            title="Sure bilgisi"
            aria-label="Sure bilgisini aç"
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <Info className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onClose();
            }}
            title="İnceleme penceresini kapat"
            aria-label="İnceleme penceresini kapat"
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Kaydırılabilir Kompakt İçerik Gövdesi */}
      <div className="p-3.5 overflow-y-auto flex-1 space-y-3">
        {/* Tilâvet Secdesi Uyarısı */}
        {isSajdah && settings.highlightSajdah && (
          <div
            className="px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-extrabold"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'rgba(217, 119, 6, 0.45)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-base leading-none">۩</span>
              <span>Tilâvet Secdesi Ayeti</span>
            </span>
            <span className="text-[11px] font-semibold opacity-85 tabular-nums">
              {verse.surah}:{verse.ayah}
            </span>
          </div>
        )}

        {/* Hızlı Aksiyon Şeridi */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPlayFromVerse(verse)}
            className="flex-1 min-h-[38px] px-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Headphones className="w-3.5 h-3.5 shrink-0" />
            <span>Bu Ayetten Dinle</span>
          </button>

          <button
            type="button"
            onClick={() => onPlayMealFromVerse(verse)}
            title="Bu ayetten itibaren Türkçe sesli mealini dinle"
            className="flex-1 min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'var(--brand-accent)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
            <span>Sesli Mealini Dinle</span>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onToggleBookmark(verse.id)}
              title={isBookmarked ? 'Yıldızlılardan çıkar' : 'Yıldızla'}
              aria-label={isBookmarked ? 'Yıldızlılardan çıkar' : 'Yıldızla'}
              className="w-9 h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: isBookmarked ? 'var(--brand-accent-soft)' : 'var(--bg-surface)',
                borderColor: isBookmarked ? 'var(--brand-accent)' : 'var(--border-subtle)',
                color: isBookmarked ? 'var(--brand-accent-text)' : 'var(--text-primary)',
              }}
            >
              <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => void handleCopyVerse()}
              title="Ayeti kopyala"
              aria-label="Ayeti kopyala"
              className="w-9 h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: copiedId === verse.id ? '#10B981' : 'var(--text-primary)',
              }}
            >
              {copiedId === verse.id ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onShareVerse(verse, surahMeta);
              }}
              title="Paylaşım kartı oluştur"
              aria-label="Paylaşım kartı oluştur"
              className="w-9 h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
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

        {/* Arapça Ayet Özeti */}
        {(() => {
          const tjWords = settings.tajweedEnabled
            ? getTjVerseWords(verse.surah, verse.ayah)
            : null;
          const useVerseTajweed = Boolean(tjWords && tjWords.length > 0);
          return (
            <div
              dir="rtl"
              className={`${useVerseTajweed ? 'arabic-tajweed' : 'arabic-text'} rounded-xl px-3 py-2.5 text-right leading-[2.1] border`}
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                fontSize: `${Math.min(26, Math.max(20, settings.arabicFontSize - 4))}px`,
                color: 'var(--text-primary)',
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
            </div>
          );
        })()}

        {/* Seçili Meal(ler) */}
        <div
          className="p-3 rounded-xl border space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span
                  className="text-xs font-extrabold"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {primaryMeal.label}
                </span>
                {isPlaying &&
                  isMealAudioFlowActive &&
                  activeSpokenMeal &&
                  activeSpokenMeal.mealId !== primaryMeal.id &&
                  (!isDual || activeSpokenMeal.mealId !== secondaryMeal.id) && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Volume2 className="w-3 h-3 shrink-0" />
                      <span>Ses: {activeSpokenMeal.label}</span>
                    </span>
                  )}
              </div>
              {primaryVerse?.mg && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  <Link2 className="w-3 h-3" />
                  {primaryVerse.mg[0]}–{primaryVerse.mg[1]} Birleşik
                </span>
              )}
            </div>
            {primaryVerse?.t ? (
              (() => {
                const pres = getMealTextPresentation(
                  primaryMeal,
                  Math.max(14, settings.turkishFontSize - 1),
                );
                return (
                  <p
                    dir={pres.dir}
                    lang={pres.lang}
                    className={pres.className}
                    style={{
                      fontSize: `${pres.fontSizePx}px`,
                      fontFamily: pres.fontFamily,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {primaryVerse.t}
                  </p>
                );
              })()
            ) : isLoadingExtra ? (
              <div className="h-4 w-3/4 rounded bg-current/10 animate-pulse" />
            ) : (
              <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                Bu ayet için meal metni bulunamadı.
              </p>
            )}
          </div>

          {isDual && (
            <div
              className="pt-2.5 border-t"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span
                    className="text-xs font-extrabold"
                    style={{ color: 'var(--brand-accent-text)' }}
                  >
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
                {secondaryVerse?.mg && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Link2 className="w-3 h-3" />
                    {secondaryVerse.mg[0]}–{secondaryVerse.mg[1]} Birleşik
                  </span>
                )}
              </div>
              {secondaryVerse?.t ? (
                (() => {
                  const pres = getMealTextPresentation(
                    secondaryMeal,
                    Math.max(14, settings.turkishFontSize - 1),
                  );
                  return (
                    <p
                      dir={pres.dir}
                      lang={pres.lang}
                      className={pres.className}
                      style={{
                        fontSize: `${pres.fontSizePx}px`,
                        fontFamily: pres.fontFamily,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {secondaryVerse.t}
                    </p>
                  );
                })()
              ) : isLoadingExtra ? (
                <div className="h-4 w-3/4 rounded bg-current/10 animate-pulse" />
              ) : (
                <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                  Bu ayet için karşılaştırma meali bulunamadı.
                </p>
              )}
            </div>
          )}

          <div
            className="pt-2 border-t grid grid-cols-1 sm:grid-cols-2 gap-1.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openQuickMemorize(verse.surah, verse.ayah, verse.page);
              }}
              className="w-full min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <BookMarked className="w-3.5 h-3.5 shrink-0" />
              <span>Buradan Ezber Başlat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openMealCompare(verse.surah, verse.ayah);
              }}
              className="w-full min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Scale className="w-3.5 h-3.5 shrink-0" />
              <span>Mealleri Karşılaştır ({MEALS_CATALOG.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                if (manifest && meta) {
                  const sLabel = surahMeta?.nameTr ?? `${verse.surah}. Sure`;
                  void audioQueueService.startSegmentQueue({
                    items: [
                      {
                        id: `loop_${verse.id}`,
                        type: 'ayah_range',
                        label: `${sLabel} ${verse.ayah}. Ayet`,
                        surah: verse.surah,
                        startAyah: verse.ayah,
                        endAyah: verse.ayah,
                      },
                    ],
                    title: `${sLabel} ${verse.ayah}. Ayet`,
                    context: 'single',
                    contextKey: `single:${verse.id}`,
                    manifest,
                    meta,
                    prefs: audioPrefs,
                    queueLoopOverride: 'infinite',
                  });
                }
              }}
              className="w-full min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Repeat className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              <span>Bu Ayeti Döngüde Dinle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                const sLabel = surahMeta?.nameTr ?? `${verse.surah}. Sure`;
                openListeningDrawer({
                  initialTab: 'playlists',
                  pendingAddItem: {
                    type: 'ayah_range',
                    label: `${sLabel} ${verse.ayah}. Ayet`,
                    surah: verse.surah,
                    startAyah: verse.ayah,
                    endAyah: verse.ayah,
                  },
                });
              }}
              className="w-full min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ListPlus className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              <span>Çalma Listesine Ekle</span>
            </button>

            {mutashabihatCount > 0 && (
              <button
                type="button"
                onClick={() => openMutashabihat(verse.surah, verse.ayah)}
                className="w-full min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'rgba(217, 119, 6, 0.45)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span>Benzer Ayetler ({mutashabihatCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openQuickResearch(verse.surah, verse.ayah, verse.ayah, verse.page);
              }}
              className={`${
                mutashabihatCount > 0 ? '' : 'sm:col-span-2 '
              }w-full min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors hover:opacity-90`}
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'rgba(217, 119, 6, 0.35)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Pin className="w-3.5 h-3.5 shrink-0" />
              <span>Araştırmaya Ekle</span>
            </button>
          </div>
        </div>

        {/* Dipnot / Tefsir Açıklaması */}
        {footnoteCount > 0 && (
          <div>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowFootnotes((v) => !v);
              }}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
              style={{
                backgroundColor: showFootnotes
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface)',
                borderColor: showFootnotes ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color: showFootnotes ? 'var(--brand-primary-text)' : 'var(--text-primary)',
              }}
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Dipnot / Tefsir Açıklaması ({footnoteCount})</span>
              </span>
              {showFootnotes ? (
                <ChevronUp className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
            </button>

            {showFootnotes && (
              <div
                className="mt-2 p-3 rounded-xl border space-y-2 text-xs leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {primaryFootnotes.length > 0 && (
                  <div className="space-y-1">
                    <p
                      className="text-xs font-extrabold"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      {primaryMeal.shortLabel} Dipnotları
                    </p>
                    <ol className="space-y-1 list-decimal list-inside">
                      {primaryFootnotes.map((n, idx) => (
                        <li key={`drag-p-fn-${idx}`}>{n}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {isDual && secondaryFootnotes.length > 0 && (
                  <div className="space-y-1">
                    <p
                      className="text-xs font-extrabold"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      {secondaryMeal.shortLabel} Dipnotları
                    </p>
                    <ol className="space-y-1 list-decimal list-inside">
                      {secondaryFootnotes.map((n, idx) => (
                        <li key={`drag-s-fn-${idx}`}>{n}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Kelime-Kelime Meal (yalnızca wordByWordEnabled açıkken) */}
        {settings.wordByWordEnabled && verse.words.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setShowWords((v) => !v);
              }}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
              style={{
                backgroundColor: effectiveWordsOpen
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface)',
                borderColor: effectiveWordsOpen
                  ? 'var(--brand-primary)'
                  : 'var(--border-subtle)',
                color: effectiveWordsOpen ? 'var(--brand-primary-text)' : 'var(--text-primary)',
              }}
            >
              <span className="flex items-center gap-2">
                <Languages className="w-3.5 h-3.5 shrink-0" />
                <span>Kelime-Kelime Meal ({verse.words.length})</span>
              </span>
              <span className="flex items-center gap-1 text-[11px]">
                {wordMode === 'quiz' && <Sparkles className="w-3.5 h-3.5" />}
                {effectiveWordsOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            {effectiveWordsOpen && (
              <div className="mt-2">
                <WordMealGrid
                  ayahId={verse.id}
                  surah={verse.surah}
                  ayah={verse.ayah}
                  words={verse.words}
                  wordMode={wordMode === 'quiz' ? 'quiz' : 'visible'}
                  arabicFontSize={Math.max(20, settings.arabicFontSize - 4)}
                  isPlayingThisAyah={isPlaying}
                  wordSyncEnabled={settings.wordSyncEnabled}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
