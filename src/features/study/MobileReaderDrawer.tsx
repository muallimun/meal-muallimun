import React, { useEffect } from 'react';
import {
  AudioLines,
  BookOpen,
  BookText,
  Bookmark,
  ChevronRight,
  Columns2,
  Eye,
  Languages,
  LayoutList,
  ListMusic,
  MapPin,
  Minus,
  MonitorPlay,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import { sfxService } from '../../services/sfxService';
import type {
  AppSettings,
  BookContentMode,
  MealDefinition,
  StudyViewMode,
  WordMealMode,
} from '../../types/quran';

interface MobileReaderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: StudyViewMode;
  onSwitchViewMode: (mode: StudyViewMode) => void;
  onOpenPresentation: () => void;
  locationLabel: string;
  onOpenLocationPicker: () => void;
  primaryMeal: MealDefinition;
  secondaryMeal: MealDefinition;
  isDualMeal: boolean;
  onOpenMealSelector: () => void;
  onSetMealDisplayMode: (mode: 'single' | 'dual') => void;
  contentMode: BookContentMode;
  onChangeContentMode: (mode: BookContentMode) => void;
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
}

export const MobileReaderDrawer: React.FC<MobileReaderDrawerProps> = ({
  isOpen,
  onClose,
  viewMode,
  onSwitchViewMode,
  onOpenPresentation,
  locationLabel,
  onOpenLocationPicker,
  primaryMeal,
  secondaryMeal,
  isDualMeal,
  onOpenMealSelector,
  onSetMealDisplayMode,
  contentMode,
  onChangeContentMode,
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
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Okuma Menüsü"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 backdrop-blur-xs lg:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[88dvh] rounded-t-3xl border-t border-x shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Tutamak + Başlık */}
        <div
          className="px-4 pt-2.5 pb-3 border-b shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-soft)',
          }}
        >
          <div className="w-10 h-1 rounded-full mx-auto mb-2.5 opacity-30 bg-current" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold tracking-tight">Okuma Menüsü</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Menüyü kapat"
              className="w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer"
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
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
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

          {/* 2. Konum Seçici */}
          <section className="space-y-1.5">
            <p
              className="text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Konum
            </p>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onClose();
                onOpenLocationPicker();
              }}
              className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-left cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                <span className="text-xs font-extrabold truncate">{locationLabel}</span>
              </span>
              <span
                className="inline-flex items-center gap-0.5 text-[11px] font-bold shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                <span>Sure / Sayfa / Rükû</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
          </section>

          {/* 3. İçerik, Meal ve Yazı Boyutu */}
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

            {/* İçerik & Sayfa Düzeni (Mushaf: Tek Sayfa / Mushaf + Meal / Sadece Meal | Kitap & Kartlar: AR + Meal / Sadece AR / Sadece Meal) */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold block" style={{ color: 'var(--text-muted)' }}>
                {viewMode === 'mushaf' ? 'Mushaf Sayfa Düzeni' : 'İçerik Görünümü'}
              </span>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                {(viewMode === 'mushaf'
                  ? ([
                      { id: 'ar_only', label: 'Tek Sayfa' },
                      { id: 'interleaved', label: 'Mushaf + Meal' },
                      { id: 'meal_only', label: 'Sadece Meal' },
                    ] as { id: BookContentMode; label: string }[])
                  : ([
                      { id: 'interleaved', label: 'AR + Meal' },
                      { id: 'ar_only', label: 'Sadece AR' },
                      { id: 'meal_only', label: 'Sadece Meal' },
                    ] as { id: BookContentMode; label: string }[])
                ).map((opt) => {
                  const active = contentMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        onChangeContentMode(opt.id);
                      }}
                      className="min-h-[36px] px-1.5 rounded-lg text-[11px] sm:text-xs font-bold cursor-pointer whitespace-nowrap truncate"
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

            {/* Kelime Meali (Yalnızca Kartlar Modunda) */}
            {settings.wordByWordEnabled && viewMode === 'cards' && (
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

            {/* Renkli Tecvit (Etkileşimli Dokun-Öğren) */}
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
                    Renkli harflere dokunarak tecvit kuralını gör
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
            </div>

            {/* Kelime Takibi (Karaoke) */}
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
            </div>

            {/* Hızlı Font Boyutu */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className="px-2.5 py-2 rounded-xl border flex items-center justify-between gap-1"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  Arapça {settings.arabicFontSize}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        arabicFontSize: Math.max(20, settings.arabicFontSize - 2),
                      })
                    }
                    aria-label="Arapça boyutunu küçült"
                    className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer"
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
                    aria-label="Arapça boyutunu büyült"
                    className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                className="px-2.5 py-2 rounded-xl border flex items-center justify-between gap-1"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  Meal {settings.turkishFontSize}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        turkishFontSize: Math.max(14, settings.turkishFontSize - 1),
                      })
                    }
                    aria-label="Meal boyutunu küçült"
                    className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer"
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
                    aria-label="Meal boyutunu büyült"
                    className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Saf Sayfa Odak Modu (Mushaf/Kitap) */}
            {(viewMode === 'mushaf' || viewMode === 'book') && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  onToggleImmersive();
                  onClose();
                }}
                className="w-full min-h-[42px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer"
                style={{
                  backgroundColor: isImmersive
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: isImmersive ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: isImmersive ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                }}
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span>%100 Saf Sayfa Modu (Üst/Alt Barı Gizle)</span>
                </span>
                <span className="text-[11px] font-extrabold">{isImmersive ? 'Açık' : 'Kapalı'}</span>
              </button>
            )}
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
