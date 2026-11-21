import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  BookOpen,
  ChevronRight,
  Eye,
  Headphones,
  Layout,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  Type,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ARABIC_FONTS, TURKISH_FONTS } from '../config/assetsConfig';
import { findMealById, getAllMeals } from '../config/mealsConfig';
import {
  findReciterById,
  formatReciterBadge,
  getAllReciters,
  RECITER_CATEGORIES,
} from '../config/recitersConfig';
import { audioQueueService } from '../services/audioQueueService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type {
  BookContentMode,
  PageLayoutMode,
  StudyViewMode,
  ThemeMode,
  WordMealMode,
} from '../types/quran';
import { PwaInstallControl } from './PwaInstallControl';

type SettingsTabId = 'appearance' | 'typography' | 'reading' | 'audio_exam';

const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'appearance', label: 'Görünüm & Sayfa', icon: Layout },
  { id: 'typography', label: 'Yazı Tipi', icon: Type },
  { id: 'reading', label: 'Okuma & Kelime', icon: BookOpen },
  { id: 'audio_exam', label: 'Ses & Sınav', icon: Volume2 },
];

const THEME_OPTIONS: { id: ThemeMode; label: string; desc: string; swatch: string }[] = [
  { id: 'light', label: 'Açık', desc: 'Ferah beyaz', swatch: '#FFFFFF' },
  { id: 'cream', label: 'Krem Mushaf', desc: 'Sıcak kâğıt', swatch: '#FAF6EE' },
  { id: 'dark', label: 'Gece', desc: 'Göz dostu', swatch: '#0B1314' },
];

const VIEW_MODE_OPTIONS: { id: StudyViewMode; label: string; desc: string }[] = [
  { id: 'mushaf', label: 'Mushaf Sayfası', desc: 'Klasik 604 sayfa düzeni' },
  { id: 'book', label: 'Kitap Modu', desc: 'Akışkan okuma sayfası' },
  { id: 'cards', label: 'Ayet Kartları', desc: 'Ayet ayet detaylı analiz' },
];

const PAGE_LAYOUT_OPTIONS: { id: PageLayoutMode; label: string; desc: string }[] = [
  { id: 'single', label: 'Tek Sayfa', desc: 'Mushaf + yan meal paneli' },
  { id: 'double_mushaf', label: '2 Sayfa Mushaf', desc: 'Karşılıklı iki Arapça sayfa' },
  { id: 'double_meal', label: 'Sağ Mushaf · Sol Meal', desc: 'Aynı sayfanın meali solda' },
];

const BOOK_CONTENT_OPTIONS: { id: BookContentMode; label: string; desc: string }[] = [
  { id: 'interleaved', label: 'Arapça + Meal', desc: 'Mushaf ve meal birlikte' },
  { id: 'ar_only', label: 'Sadece Arapça', desc: 'Odaklı Arapça okuma' },
  { id: 'meal_only', label: 'Sadece Türkçe Meal', desc: 'Mushaf çerçevesinde meal' },
];

const ToggleRow: React.FC<{
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}> = ({ title, description, checked, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    className="w-full p-3.5 rounded-xl border flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
    style={{
      backgroundColor: checked ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
      borderColor: checked ? 'var(--brand-primary)' : 'var(--border-subtle)',
    }}
  >
    <div className="min-w-0">
      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
    </div>
    <span
      className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
      style={{
        backgroundColor: checked ? 'var(--brand-primary)' : 'var(--border-strong)',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </span>
  </button>
);

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    settings,
    studyPrefs,
    audioPrefs,
    updateSettings,
    setMealDisplayMode,
    updateStudyPrefs,
    updateAudioPrefs,
    resetSettings,
    openIntroSplash,
    openReciterSelector,
    openMealSelector,
    manifest,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const [activeTab, setActiveTab] = useState<SettingsTabId>('appearance');

  const allMeals = useMemo(() => getAllMeals(manifest), [manifest]);
  const activePrimaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const activeSecondaryMeal = useMemo(
    () => findMealById(settings.secondaryMealId, manifest),
    [settings.secondaryMealId, manifest],
  );
  const isDualMeal = settings.mealDisplayMode === 'dual' || settings.preferredMeal === 'both';

  const allReciters = useMemo(() => getAllReciters(manifest), [manifest]);
  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );
  const activeReciterCategory = useMemo(
    () => RECITER_CATEGORIES.find((c) => c.id === activeReciter.category),
    [activeReciter.category],
  );
  const activeReciterBadge = formatReciterBadge(activeReciter);
  const isPreviewingActive =
    audioState.previewReciterId === activeReciter.id &&
    (audioState.previewStatus === 'playing' || audioState.previewStatus === 'loading');

  if (!isSettingsModalOpen) return null;

  const handleTestSfx = () => {
    sfxService.play('correct');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSettingsModal();
      }}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[86dvh] rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2 id="settings-modal-title" className="text-base sm:text-lg font-extrabold tracking-tight">
              Ayarlar ve Kişiselleştirme
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Tüm tercihler cihazında otomatik olarak saklanır.
            </p>
          </div>
          <button
            type="button"
            onClick={closeSettingsModal}
            aria-label="Ayarları kapat"
            className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Kategorik Sekme Şeridi */}
        <div
          className="px-4 py-2 border-b shrink-0 overflow-x-auto"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="grid grid-cols-4 gap-1 min-w-[420px]">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setActiveTab(tab.id);
                  }}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sekme İçerikleri */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ================================================================
              SEKME 1: GÖRÜNÜM & SAYFA
              ================================================================ */}
          {activeTab === 'appearance' && (
            <>
              {/* Tema Seçici */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Renk Teması
                </h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {THEME_OPTIONS.map((t) => {
                    const active = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ theme: t.id });
                        }}
                        className="p-3 rounded-xl border text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-4 h-4 rounded-full border shrink-0"
                            style={{
                              backgroundColor: t.swatch,
                              borderColor: 'var(--border-strong)',
                            }}
                          />
                          <span className="text-xs sm:text-sm font-extrabold">{t.label}</span>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {t.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Varsayılan Okuma Görünümü */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Varsayılan Okuma Görünümü
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {VIEW_MODE_OPTIONS.map((v) => {
                    const active = studyPrefs.viewMode === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateStudyPrefs({ viewMode: v.id });
                        }}
                        className="p-3 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs sm:text-sm font-extrabold"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {v.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {v.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Masaüstü Sayfa Düzeni */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Masaüstü Mushaf Sayfa Düzeni
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PAGE_LAYOUT_OPTIONS.map((layout) => {
                    const active = studyPrefs.pageLayout === layout.id;
                    return (
                      <button
                        key={layout.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateStudyPrefs({ pageLayout: layout.id });
                        }}
                        className="p-3 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs sm:text-sm font-extrabold"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {layout.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {layout.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Okuma İçerik Tercihi (Mushaf & Kitap) */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Okuma İçerik Tercihi (Mushaf &amp; Kitap)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {BOOK_CONTENT_OPTIONS.map((opt) => {
                    const active = studyPrefs.bookContentMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateStudyPrefs({ bookContentMode: opt.id });
                        }}
                        className="p-3 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs sm:text-sm font-extrabold"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {opt.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Akıllı Ekran Açık Tutma (Wake Lock) */}
              <section className="space-y-2">
                <h3
                  className="text-xs font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Ekran &amp; Pil Koruması
                </h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.keepScreenAwake}
                  onClick={() => {
                    sfxService.play('click');
                    updateSettings({ keepScreenAwake: !settings.keepScreenAwake });
                  }}
                  className="w-full p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: settings.keepScreenAwake
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                    borderColor: settings.keepScreenAwake
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Sun
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{
                        color: settings.keepScreenAwake
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-muted)',
                      }}
                    />
                    <div className="min-w-0">
                      <p
                        className="text-xs sm:text-sm font-extrabold"
                        style={{
                          color: settings.keepScreenAwake
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-primary)',
                        }}
                      >
                        Okuma ve Dinlemede Ekranı Açık Tut
                      </p>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                        Sesli tilavet, Sunum ve Ezber sırasında kesintisiz; sessiz okumada 15 dk
                        hareketsiz kalınırsa pil dostu otomatik kapanma.
                      </p>
                    </div>
                  </div>
                  <span
                    className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                    style={{
                      backgroundColor: settings.keepScreenAwake
                        ? 'var(--brand-primary)'
                        : 'var(--border-strong)',
                    }}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        settings.keepScreenAwake ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </section>

              {/* İntro & Uygulama Kurulumu */}
              <section
                className="pt-3 border-t flex flex-wrap items-center justify-between gap-2.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  onClick={openIntroSplash}
                  className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--brand-accent-text)' }} />
                  <span>Karşılama İntrosunu Göster</span>
                </button>
                <PwaInstallControl variant="settings" />
              </section>
            </>
          )}

          {/* ================================================================
              SEKME 2: YAZI TİPİ
              ================================================================ */}
          {activeTab === 'typography' && (
            <>
              {/* Canlı Önizleme */}
              <section
                className="p-4 rounded-2xl border space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Canlı Önizleme
                  </span>
                  <span className="tabular-nums">
                    AR {settings.arabicFontSize}px · TR {settings.turkishFontSize}px
                  </span>
                </div>
                <p
                  className="arabic-text text-right"
                  style={{ fontSize: `${settings.arabicFontSize}px`, color: 'var(--text-primary)' }}
                >
                  إِنَّمَا الْمُؤْمِنُونَ إِخْوَةٌ فَأَصْلِحُوا بَيْنَ أَخَوَيْكُمْ
                </p>
                <p
                  className="turkish-reading"
                  style={{ fontSize: `${settings.turkishFontSize}px`, color: 'var(--text-secondary)' }}
                >
                  Müminler ancak kardeştirler. Öyleyse kardeşlerinizin arasını düzeltin. (Hucurât, 10)
                </p>
              </section>

              {/* Tercih Edilen Türkçe Meal (24 Meal Kataloğu) */}
              <section
                className="p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p
                      className="text-[11px] font-extrabold uppercase tracking-wider"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Tercih Edilen Türkçe Meal ({allMeals.length} Meal)
                    </p>
                    <p className="text-sm sm:text-base font-extrabold mt-0.5 truncate">
                      {activePrimaryMeal.label}
                    </p>
                    {isDualMeal && (
                      <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        2. Karşılaştırma Meali: <span className="font-extrabold">{activeSecondaryMeal.label}</span>
                      </p>
                    )}
                  </div>

                  <div
                    className="flex items-center p-0.5 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setMealDisplayMode('single')}
                      className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: !isDualMeal ? 'var(--brand-primary)' : 'transparent',
                        color: !isDualMeal ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      Tek Meal
                    </button>
                    <button
                      type="button"
                      onClick={() => setMealDisplayMode('dual')}
                      className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: isDualMeal ? 'var(--brand-primary)' : 'transparent',
                        color: isDualMeal ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      Çift Meal
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openMealSelector('primary')}
                    className="flex-1 min-w-[180px] min-h-[40px] px-4 rounded-xl font-extrabold text-xs sm:text-sm text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <span>Meal Değiştir ({allMeals.length} Meal)</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                  {isDualMeal && (
                    <button
                      type="button"
                      onClick={() => openMealSelector('secondary')}
                      className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      2. Meali Değiştir
                    </button>
                  )}
                </div>
              </section>

              {/* Arapça Hat Seçici (9 Hat) */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Arapça Mushaf Hattı (9 Font)
                  </h3>
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                    {settings.arabicFontSize} px
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={44}
                  step={1}
                  value={settings.arabicFontSize}
                  onChange={(e) => updateSettings({ arabicFontSize: Number(e.target.value) })}
                  aria-label="Arapça yazı boyutu"
                  className="w-full accent-teal-700 cursor-pointer"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ARABIC_FONTS.map((font) => {
                    const active = settings.arabicFont === font.label;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ arabicFont: font.label });
                        }}
                        className="p-2.5 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs font-bold truncate"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {font.label}
                        </p>
                        <p
                          dir="rtl"
                          className="text-base mt-0.5 truncate"
                          style={{
                            fontFamily: `${font.fontFamily}, serif`,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          بِسْمِ اللّٰهِ الرَّحْمٰنِ
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Türkçe Font Seçici (4 Font) */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Türkçe Meal Yazı Tipi
                  </h3>
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                    {settings.turkishFontSize} px
                  </span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={24}
                  step={1}
                  value={settings.turkishFontSize}
                  onChange={(e) => updateSettings({ turkishFontSize: Number(e.target.value) })}
                  aria-label="Türkçe yazı boyutu"
                  className="w-full accent-teal-700 cursor-pointer"
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TURKISH_FONTS.map((font) => {
                    const active = settings.turkishFont === font.label;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ turkishFont: font.label });
                        }}
                        className="min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors"
                        style={{
                          fontFamily: font.fontStack,
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                        }}
                      >
                        {font.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* ================================================================
              SEKME 3: OKUMA & KELİME
              ================================================================ */}
          {activeTab === 'reading' && (
            <div className="space-y-3">
              <ToggleRow
                title="Kelime Meali (Kelime-Kelime Analiz)"
                description="Kapatıldığında okuma kartları ve Mushaf panelindeki kelime meali blokları gizlenir; sade okuma deneyimi sunar."
                checked={settings.wordByWordEnabled}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ wordByWordEnabled: !settings.wordByWordEnabled });
                }}
              />

              {settings.wordByWordEnabled && (
                <div
                  className="p-3.5 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                    Kelime Meali Varsayılan Modu
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'off', label: 'İsteğe Bağlı' },
                        { id: 'visible', label: 'Her Zaman Açık' },
                        { id: 'quiz', label: 'Kendini Sına' },
                      ] as { id: WordMealMode; label: string }[]
                    ).map((m) => {
                      const active = studyPrefs.wordMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateStudyPrefs({ wordMode: m.id });
                          }}
                          className="min-h-[38px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <ToggleRow
                title="Sesle Otomatik Kaydırma"
                description="Tilavet veya sesli meal akarken çalan ayeti ekranda otomatik olarak ortalar."
                checked={audioPrefs.autoScroll}
                onToggle={() => {
                  sfxService.play('click');
                  updateAudioPrefs({ autoScroll: !audioPrefs.autoScroll });
                }}
              />

              <ToggleRow
                title="Dipnotları ve Açıklamaları Göster"
                description="Seçili Türkçe meallerdeki ayet dipnotlarını okuma ekranında görüntüle."
                checked={settings.showFootnotes}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ showFootnotes: !settings.showFootnotes });
                }}
              />

              <ToggleRow
                title="Tilâvet Secdesi İşaretlerini Vurgula"
                description="Secde ayetlerinde özel ۩ Tilâvet Secdesi işaretini belirgin göster."
                checked={settings.highlightSajdah}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ highlightSajdah: !settings.highlightSajdah });
                }}
              />
            </div>
          )}

          {/* ================================================================
              SEKME 4: SES & SINAV
              ================================================================ */}
          {activeTab === 'audio_exam' && (
            <div className="space-y-4">
              {/* Kur'an Okuyucu (Tilavet / Kurrâ) Seçici Kartı */}
              <div
                className="p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Headphones className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-[11px] font-extrabold uppercase tracking-wider"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        Kur&apos;an Okuyucu (Arapça Tilavet)
                      </p>
                      <p
                        className="text-sm sm:text-base font-extrabold truncate mt-0.5"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {activeReciter.label}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {activeReciterCategory && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {activeReciterCategory.label}
                          </span>
                        )}
                        {activeReciterBadge && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            {activeReciterBadge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openReciterSelector();
                    }}
                    className="flex-1 min-w-[180px] min-h-[42px] px-4 rounded-xl font-extrabold text-xs sm:text-sm text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-transform active:scale-[0.99]"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <span>Okuyucu Değiştir ({allReciters.length} Kurrâ)</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      audioQueueService.previewReciter(activeReciter);
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: isPreviewingActive
                        ? 'var(--brand-accent)'
                        : 'var(--border-subtle)',
                      color: isPreviewingActive
                        ? 'var(--brand-accent-text)'
                        : 'var(--text-primary)',
                    }}
                  >
                    {audioState.previewReciterId === activeReciter.id &&
                    audioState.previewStatus === 'loading' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isPreviewingActive ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isPreviewingActive ? 'Durdur' : 'Besmele Önizle'}</span>
                  </button>
                </div>
              </div>

              {/* SFX Kontrolü */}
              <div
                className="p-4 rounded-2xl border space-y-3.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {settings.sfxEnabled ? (
                      <Volume2 className="w-5 h-5" style={{ color: 'var(--brand-primary-text)' }} />
                    ) : (
                      <VolumeX className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    )}
                    <div>
                      <p className="text-sm font-bold">Uygulama Ses Efektleri (SFX)</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Doğru/yanlış dönütü, tıklama ve başarı sesleri
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.sfxEnabled}
                    onClick={() => updateSettings({ sfxEnabled: !settings.sfxEnabled })}
                    className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center cursor-pointer"
                    style={{
                      backgroundColor: settings.sfxEnabled
                        ? 'var(--brand-primary)'
                        : 'var(--border-strong)',
                      justifyContent: settings.sfxEnabled ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>

                {settings.sfxEnabled && (
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={settings.sfxVolume}
                      onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) })}
                      aria-label="Ses efekti seviyesi"
                      className="flex-1 accent-teal-700 cursor-pointer"
                    />
                    <span className="text-xs font-bold tabular-nums w-10 text-right">
                      %{Math.round(settings.sfxVolume * 100)}
                    </span>
                    <button
                      type="button"
                      onClick={handleTestSfx}
                      className="min-h-[34px] px-3 rounded-lg border text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      Test Et
                    </button>
                  </div>
                )}
              </div>

              {/* Sınav İçi Şık Harfleri */}
              <ToggleRow
                title="Sınav Ekranında A / B / C / D Harflerini Göster"
                description="Açık olduğunda şıkların solunda harf rozeti görünür; kapalıyken modern seçim halkası kullanılır. (A4 baskıda harfler her zaman görünür.)"
                checked={settings.showOptionLettersInApp}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ showOptionLettersInApp: !settings.showOptionLettersInApp });
                }}
              />

              {/* Varsayılanlara Sıfırla */}
              <div
                className="pt-3 border-t flex items-center justify-between gap-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Çalışma havuzun, ayraçların ve puanların silinmez; sadece görünüm ayarları
                  sıfırlanır.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    resetSettings();
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Varsayılanlara Sıfırla</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
