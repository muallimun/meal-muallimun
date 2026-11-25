import React, { useEffect, useRef } from 'react';
import {
  AudioLines,
  BookMarked,
  BookOpen,
  BookText,
  Bookmark,
  Check,
  ChevronRight,
  Columns2,
  Compass,
  Home,
  Info,
  Languages,
  LayoutList,
  ListMusic,
  Maximize2,
  Minimize2,
  Minus,
  MonitorPlay,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  Trophy,
  Type,
  X,
} from 'lucide-react';
import { PwaInstallControl } from '../../components/PwaInstallControl';
import { ARABIC_FONTS } from '../../config/assetsConfig';
import { Z_LAYERS } from '../../config/zLayers';
import { useBackButtonGuard } from '../../services/backStackService';
import { sfxService } from '../../services/sfxService';
import type {
  AppSettings,
  MealDefinition,
  ReaderContentMode,
  StudyViewMode,
  ThemeMode,
  WordMealMode,
} from '../../types/quran';
import {
  ARABIC_LINE_HEIGHT_OPTIONS,
  ARABIC_TEXT_DENSITY_OPTIONS,
} from '../../utils/arabicUtils';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import { TAJWEED_DIACRITIC_NOTE } from './TajweedLegendBar';

interface MobileReaderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: StudyViewMode;
  onSwitchViewMode: (mode: StudyViewMode) => void;
  onOpenPresentation: () => void;
  primaryMeal: MealDefinition;
  secondaryMeal: MealDefinition;
  isDualMeal: boolean;
  onOpenMealSelector: () => void;
  onSetMealDisplayMode: (mode: 'single' | 'dual') => void;
  readerContentMode: ReaderContentMode;
  onChangeReaderContentMode: (mode: ReaderContentMode) => void;
  wordMode: WordMealMode;
  onChangeWordMode: (mode: WordMealMode) => void;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  isImmersive: boolean;
  onToggleImmersive: () => void;
  onOpenSearch: () => void;
  activeSurahQuestionCount: number;
  onStartSurahExam: () => void;
  bookmarkCount: number;
  onOpenBookmarks: () => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
  onOpenListeningDrawer: () => void;
  onOpenWaqfGuide: () => void;
  onOpenSettings: () => void;
  onNavigateTab?: (tab: 'home' | 'fihrist' | 'memorize' | 'exam') => void;
}

export const MobileReaderDrawer: React.FC<MobileReaderDrawerProps> = ({
  isOpen,
  onClose,
  viewMode,
  onSwitchViewMode,
  onOpenPresentation,
  primaryMeal,
  secondaryMeal,
  isDualMeal,
  onOpenMealSelector,
  onSetMealDisplayMode,
  readerContentMode,
  onChangeReaderContentMode,
  wordMode,
  onChangeWordMode,
  settings,
  onUpdateSettings,
  isImmersive,
  onToggleImmersive,
  onOpenSearch,
  activeSurahQuestionCount,
  onStartSurahExam,
  bookmarkCount,
  onOpenBookmarks,
  favoritesCount,
  onOpenFavorites,
  onOpenListeningDrawer,
  onOpenWaqfGuide,
  onOpenSettings,
  onNavigateTab,
}) => {
  const isMealOnlyContent = readerContentMode === 'meal_only';
  const isArOnlyContent = readerContentMode === 'ar_only';
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useBackButtonGuard('mobile_reader_drawer', isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    return acquireBodyScrollLock();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Okuma Menüsü"
      className={`fixed inset-0 ${Z_LAYERS.DRAWER} flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs lg:hidden`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[88dvh] rounded-none sm:rounded-2xl border-0 sm:border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Sabit Üst Başlık */}
        <div
          className="sticky top-0 z-10 px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-3 sm:py-3 border-b shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-soft)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-extrabold tracking-tight">Okuma Menüsü</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Okuma menüsünü kapat"
              title="Okuma menüsünü kapat"
              className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Kaydırılabilir İçerik */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 pt-3.5 pb-[max(1.75rem,calc(env(safe-area-inset-bottom,0px)+1.25rem))] space-y-4"
        >
          {/* 0. Modüller / Hızlı Sayfa Geçişi (Tam Ekran açıkken dahi tek dokunuşla diğer sekmelere geçer) */}
          {onNavigateTab && (
            <section className="space-y-1.5">
              <p
                className="text-[11px] font-extrabold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Modüller / Sayfa Geçişi
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'home', label: 'Ana Sayfa', icon: Home },
                    { id: 'fihrist', label: 'Fihrist', icon: Compass },
                    { id: 'memorize', label: 'Ezber', icon: BookMarked },
                    { id: 'exam', label: 'Sınav', icon: Trophy },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onNavigateTab(item.id);
                      }}
                      className="min-h-[52px] px-1.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer transition-colors active:scale-95"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Icon
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--brand-primary-text)' }}
                      />
                      <span className="truncate max-w-full">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 1. Okuma Modu */}
          <section className="space-y-1.5">
            <p
              className="text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Okuma Modu
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'mushaf', label: 'Mushaf', icon: BookOpen },
                  { id: 'book', label: 'Kitap', icon: BookText },
                  { id: 'cards', label: 'Kartlar', icon: LayoutList },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = viewMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSwitchViewMode(item.id);
                      onClose();
                    }}
                    className="min-h-[54px] px-1.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate max-w-full">{item.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPresentation();
                }}
                className="min-h-[54px] px-1.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <MonitorPlay className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-full">Sunum</span>
              </button>
            </div>
          </section>

          {/* 2. İçerik, Meal ve Yazı Boyutu */}
          <section className="space-y-2.5">
            <p
              className="text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              İçerik & Meal
            </p>

            {/* Meal Seçici + Tek/Çift */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onClose();
                  onOpenMealSelector();
                }}
                className="flex-1 min-w-0 min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {isDualMeal
                      ? `${primaryMeal.shortLabel} + ${secondaryMeal.shortLabel}`
                      : primaryMeal.shortLabel}
                  </span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>

              <div
                className="inline-flex items-center p-0.5 rounded-xl border shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => onSetMealDisplayMode('single')}
                  className="min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer"
                  style={{
                    backgroundColor: !isDualMeal ? 'var(--bg-surface)' : 'transparent',
                    color: !isDualMeal ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                  }}
                >
                  Tek
                </button>
                <button
                  type="button"
                  onClick={() => onSetMealDisplayMode('dual')}
                  className="min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: isDualMeal ? 'var(--bg-surface)' : 'transparent',
                    color: isDualMeal ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                  }}
                >
                  <Columns2 className="w-3 h-3" />
                  <span>Çift</span>
                </button>
              </div>
            </div>

            {/* Aşama 1 — İçerik (Tüm Okuma Modlarında Birleşik 3'lü Seçim) */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold block" style={{ color: 'var(--text-muted)' }}>
                İçerik
              </span>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {(
                  [
                    { id: 'ar_only', label: 'Sadece Arapça' },
                    { id: 'ar_meal', label: 'Arapça + Meal' },
                    { id: 'meal_only', label: 'Sadece Meal' },
                  ] as { id: ReaderContentMode; label: string }[]
                ).map((opt) => {
                  const active = readerContentMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onChangeReaderContentMode(opt.id);
                      }}
                      className="min-h-[38px] px-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap truncate"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Kelime Meali (Yalnızca Kartlar Modunda ve Arapça Görünürken) */}
            {settings.wordByWordEnabled && viewMode === 'cards' && !isMealOnlyContent && (
              <div className="space-y-1">
                <span
                  className="text-[11px] font-bold flex items-center gap-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>Kelime Meali</span>
                </span>
                <div
                  className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
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
                        className="min-h-[36px] px-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap"
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
            )}

            {/* Renkli Tecvit (Yalnızca Arapça Görünürken) */}
            {!isMealOnlyContent && (
              <div
                className="px-3 py-2.5 rounded-xl border space-y-2"
                style={{
                  backgroundColor: settings.tajweedEnabled
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: settings.tajweedEnabled
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.tajweedEnabled}
                  onClick={() => {
                    sfxService.play('click');
                    onUpdateSettings({ tajweedEnabled: !settings.tajweedEnabled });
                  }}
                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <span
                      className="text-xs font-extrabold flex items-center gap-1.5"
                      style={{
                        color: settings.tajweedEnabled
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-primary)',
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>Renkli Tecvit</span>
                    </span>
                    <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Renkli harflere dokunarak tecvit kuralını inceleyin
                    </span>
                  </div>
                  <span
                    className="w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                    style={{
                      backgroundColor: settings.tajweedEnabled
                        ? 'var(--brand-primary)'
                        : 'var(--border-strong)',
                    }}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        settings.tajweedEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>

                {settings.tajweedEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onUpdateSettings({ showTajweedLegend: !settings.showTajweedLegend });
                    }}
                    className="w-full min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center justify-between cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: settings.showTajweedLegend
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    <span>Tecvit Renk Şeridini Göster</span>
                    <span>{settings.showTajweedLegend ? 'Açık' : 'Gizli'}</span>
                  </button>
                )}

                <div
                  className="w-full max-w-full min-w-0 rounded-lg border px-2.5 py-2 flex items-start gap-2"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Info
                    className="w-3.5 h-3.5 shrink-0 mt-0.5"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <p
                    className="w-full max-w-full min-w-0 flex-1 whitespace-normal break-words text-xs leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {TAJWEED_DIACRITIC_NOTE}
                  </p>
                </div>
              </div>
            )}

            {/* Kelime Takibi (Karaoke — Yalnızca Arapça Görünürken) */}
            {!isMealOnlyContent && (
              <div
                className="px-3 py-2.5 rounded-xl border"
                style={{
                  backgroundColor: settings.wordSyncEnabled
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: settings.wordSyncEnabled
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.wordSyncEnabled}
                  onClick={() => {
                    sfxService.play('click');
                    onUpdateSettings({ wordSyncEnabled: !settings.wordSyncEnabled });
                  }}
                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <span
                      className="text-xs font-extrabold flex items-center gap-1.5"
                      style={{
                        color: settings.wordSyncEnabled
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-primary)',
                      }}
                    >
                      <AudioLines className="w-3.5 h-3.5 shrink-0" />
                      <span>Kelime Takibi (Karaoke)</span>
                    </span>
                    <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Destekli kurrâlarda okunan kelimeyi anlık vurgula
                    </span>
                  </div>
                  <span
                    className="w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                    style={{
                      backgroundColor: settings.wordSyncEnabled
                        ? 'var(--brand-primary)'
                        : 'var(--border-strong)',
                    }}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        settings.wordSyncEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </div>
            )}

            {/* Rükû (ع) İşaretleri + Secâvend Durak Rehberi */}
            <div
              className="px-3 py-2.5 rounded-xl border space-y-2"
              style={{
                backgroundColor: settings.showRukuMarkers
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: settings.showRukuMarkers
                  ? 'var(--brand-primary)'
                  : 'var(--border-subtle)',
              }}
            >
              <button
                type="button"
                role="switch"
                aria-checked={settings.showRukuMarkers}
                onClick={() => {
                  sfxService.play('click');
                  onUpdateSettings({ showRukuMarkers: !settings.showRukuMarkers });
                }}
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <div className="min-w-0">
                  <span
                    className="text-xs font-extrabold flex items-center gap-1.5"
                    style={{
                      color: settings.showRukuMarkers
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-primary)',
                    }}
                  >
                    <span className="arabic-title text-sm leading-none">ع</span>
                    <span>Rükû (ع) İşaretleri</span>
                  </span>
                  <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Konu bölümlerinin sonunda tıklanabilir ع rozetini göster
                  </span>
                </div>
                <span
                  className="w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                  style={{
                    backgroundColor: settings.showRukuMarkers
                      ? 'var(--brand-primary)'
                      : 'var(--border-strong)',
                  }}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      settings.showRukuMarkers ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>

              {!isMealOnlyContent && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onClose();
                    onOpenWaqfGuide();
                  }}
                  className="w-full min-h-[34px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center justify-between cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Secâvend Durak Rehberi</span>
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span>8 İşaret</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              )}
            </div>

            {/* Hızlı Font Boyutu (Bağlama Duyarlı) */}
            <div
              className={`grid gap-2 ${
                !isMealOnlyContent && !isArOnlyContent ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {!isMealOnlyContent && (
                <div
                  className="px-2.5 py-2 rounded-xl border flex items-center justify-between gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-col leading-tight min-w-0">
                    <span
                      className="text-[11px] font-semibold leading-tight"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Arapça
                    </span>
                    <span
                      className="text-sm font-extrabold tabular-nums leading-tight shrink-0"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {settings.arabicFontSize}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          arabicFontSize: Math.max(20, settings.arabicFontSize - 2),
                        })
                      }
                      aria-label="Arapça yazı boyutunu küçült"
                      title="Arapça yazı boyutunu küçült"
                      className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          arabicFontSize: Math.min(44, settings.arabicFontSize + 2),
                        })
                      }
                      aria-label="Arapça yazı boyutunu büyüt"
                      title="Arapça yazı boyutunu büyüt"
                      className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {!isArOnlyContent && (
                <div
                  className="px-2.5 py-2 rounded-xl border flex items-center justify-between gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-col leading-tight min-w-0">
                    <span
                      className="text-[11px] font-semibold leading-tight"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Meal
                    </span>
                    <span
                      className="text-sm font-extrabold tabular-nums leading-tight shrink-0"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {settings.turkishFontSize}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          turkishFontSize: Math.max(14, settings.turkishFontSize - 1),
                        })
                      }
                      aria-label="Meal yazı boyutunu küçült"
                      title="Meal yazı boyutunu küçült"
                      className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          turkishFontSize: Math.min(24, settings.turkishFontSize + 1),
                        })
                      }
                      aria-label="Meal yazı boyutunu büyüt"
                      title="Meal yazı boyutunu büyüt"
                      className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Arapça Kelime Sıklığı ve Satır Aralığı */}
            {!isMealOnlyContent && (
              <div
                className="px-3 py-2.5 rounded-xl border space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-extrabold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Kelime Sıklığı
                    </span>
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Kelime aralığı
                    </span>
                  </div>
                  <div
                    className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    role="group"
                    aria-label="Arapça kelime sıklığı"
                  >
                    {ARABIC_TEXT_DENSITY_OPTIONS.map((opt) => {
                      const active = (settings.arabicTextDensity ?? 'balanced') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          title={opt.description}
                          onClick={() => {
                            sfxService.play('click');
                            onUpdateSettings({ arabicTextDensity: opt.id });
                          }}
                          className="min-h-[36px] px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-extrabold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Satır Aralığı
                    </span>
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Satır yüksekliği
                    </span>
                  </div>
                  <div
                    className="grid grid-cols-4 gap-1 p-1 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                    role="group"
                    aria-label="Arapça satır aralığı"
                  >
                    {ARABIC_LINE_HEIGHT_OPTIONS.map((opt) => {
                      const active = (settings.arabicLineHeight ?? 'balanced') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={active}
                          title={opt.description}
                          onClick={() => {
                            sfxService.play('click');
                            onUpdateSettings({ arabicLineHeight: opt.id });
                          }}
                          className="min-h-[36px] px-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Arapça Mushaf Hattı Seçici (Yalnızca Arapça Görünürken) */}
            {!isMealOnlyContent && (
              <div
                className="px-3 py-2.5 rounded-xl border space-y-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="mobile-reader-arabic-font"
                    className="text-[11px] font-extrabold flex items-center gap-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Type className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Arapça Mushaf Hattı</span>
                  </label>
                  {settings.tajweedEnabled && (
                    <span className="text-[10px] font-bold" style={{ color: 'var(--brand-accent-text)' }}>
                      Tecvit: Scheherazade
                    </span>
                  )}
                </div>
                <select
                  id="mobile-reader-arabic-font"
                  value={settings.arabicFont}
                  onChange={(e) => {
                    sfxService.play('click');
                    onUpdateSettings({ arabicFont: e.target.value });
                  }}
                  className="w-full min-h-[40px] px-2.5 rounded-lg border text-base sm:text-xs font-bold outline-none cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {ARABIC_FONTS.map((font) => (
                    <option key={font.id} value={font.label}>
                      {font.label}
                    </option>
                  ))}
                </select>

                {/* Hızlı Arapça Yazı Boyutu Kontrolü */}
                <div
                  className="pt-2 mt-1 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Arapça Yazı Boyutu
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onUpdateSettings({
                          arabicFontSize: Math.max(20, settings.arabicFontSize - 2),
                        });
                      }}
                      disabled={settings.arabicFontSize <= 20}
                      aria-label="Arapça yazı boyutunu küçült"
                      title="Küçült"
                      className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-35"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span
                      className="min-w-[44px] text-center text-xs font-extrabold tabular-nums"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {settings.arabicFontSize}px
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onUpdateSettings({
                          arabicFontSize: Math.min(44, settings.arabicFontSize + 2),
                        });
                      }}
                      disabled={settings.arabicFontSize >= 44}
                      aria-label="Arapça yazı boyutunu büyüt"
                      title="Büyüt"
                      className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-35"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tam Ekran Modu (Mushaf/Kitap) */}
            {(viewMode === 'mushaf' || viewMode === 'book') && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onToggleImmersive();
                  onClose();
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-3 cursor-pointer"
                style={{
                  backgroundColor: isImmersive
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: isImmersive ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: isImmersive ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                }}
              >
                <span className="flex items-center gap-2 text-left min-w-0 leading-snug">
                  {isImmersive ? (
                    <Minimize2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <Maximize2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>Tam Ekran</span>
                </span>
                <span className="text-[11px] font-extrabold shrink-0">
                  {isImmersive ? 'Açık' : 'Kapalı'}
                </span>
              </button>
            )}

            {/* Hızlı Tema Seçimi (Açık | Krem Mushaf | Gece) */}
            <div
              className="px-3 py-2.5 rounded-xl border space-y-1.5"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[11px] font-extrabold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Tema
                </span>
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Sayfa zemini
                </span>
              </div>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface)' }}
                role="group"
                aria-label="Okuma teması"
              >
                {(
                  [
                    { id: 'light', label: 'Açık', icon: Sun },
                    { id: 'cream', label: 'Krem Mushaf', icon: BookOpen },
                    { id: 'dark', label: 'Gece', icon: Moon },
                  ] as Array<{ id: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }>
                ).map((opt) => {
                  const active = settings.theme === opt.id;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        sfxService.play('click');
                        onUpdateSettings({ theme: opt.id });
                      }}
                      className="min-h-[36px] px-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1 whitespace-nowrap"
                      style={{
                        backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                        borderColor: active ? 'var(--brand-primary)' : 'transparent',
                        color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      }}
                    >
                      {active ? (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Icon className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      )}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Ekranı Açık Tut (Akıllı Wake Lock) */}
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onUpdateSettings({ keepScreenAwake: !settings.keepScreenAwake });
              }}
              className="w-full min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
              style={{
                backgroundColor: settings.keepScreenAwake
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: settings.keepScreenAwake
                  ? 'var(--brand-primary)'
                  : 'var(--border-subtle)',
                color: settings.keepScreenAwake
                  ? 'var(--brand-primary-text)'
                  : 'var(--text-primary)',
              }}
            >
              <span className="flex items-center gap-2 text-left">
                <Sun className="w-4 h-4 shrink-0" />
                <span>Okuma ve Dinlemede Ekranı Açık Tut</span>
              </span>
              <span className="text-[11px] font-extrabold shrink-0">
                {settings.keepScreenAwake ? 'Açık' : 'Kapalı'}
              </span>
            </button>
          </section>

          {/* 4. Hızlı Araçlar */}
          <section className="space-y-1.5">
            <p
              className="text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Hızlı Araçlar
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onClose();
                  onOpenListeningDrawer();
                }}
                className="w-full min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <span className="flex items-center gap-2.5">
                  <ListMusic className="w-4 h-4" />
                  <span>Dinleme Kapsamı &amp; Çalma Listelerim</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-70" />
              </button>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onClose();
                  onOpenSearch();
                }}
                className="w-full min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="flex items-center gap-2.5">
                  <Search className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Kur&apos;an & Mealde Ara</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {activeSurahQuestionCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onClose();
                    onStartSurahExam();
                  }}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border text-xs font-extrabold flex items-center justify-between cursor-pointer"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    borderColor: 'var(--brand-accent)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <Trophy className="w-4 h-4" />
                    <span>Bu Sureden Test ({activeSurahQuestionCount} Soru)</span>
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onClose();
                    onOpenBookmarks();
                  }}
                  className="min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Bookmark className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Ayraçlar ({bookmarkCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    onClose();
                    onOpenFavorites();
                  }}
                  className="min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Star className="w-4 h-4" style={{ color: 'var(--brand-accent-text)' }} />
                  <span>Yıldızlı ({favoritesCount})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onClose();
                  onOpenSettings();
                }}
                className="w-full min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  <span>Tema, Font & Ses Ayarları</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <PwaInstallControl variant="sidebar" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
