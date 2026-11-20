import React, { useEffect } from 'react';
import {
  BookOpen,
  Check,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ARABIC_FONTS,
  TURKISH_FONTS,
  resolveArabicFontFamily,
  resolveTurkishFontStack,
} from '../config/assetsConfig';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { PreferredMeal, ThemeMode } from '../types/quran';

const PREVIEW_ARABIC =
  'اِنَّمَا الْمُؤْمِنُونَ اِخْوَةٌ فَاَصْلِحُوا بَيْنَ اَخَوَيْكُمْ وَاتَّقُوا اللّٰهَ لَعَلَّكُمْ تُرْحَمُونَ۟';
const PREVIEW_TDV =
  "Müminler ancak kardeştirler. Öyleyse kardeşlerinizin arasını düzeltin ve Allah'tan korkun ki esirgenesiniz.";
const PREVIEW_DIB =
  "Mü'minler ancak kardeştirler. Öyleyse kardeşlerinizin arasını düzeltin. Allah'a karşı gelmekten sakının ki size merhamet edilsin.";

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  desc: string;
  bg: string;
  card: string;
  ink: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'light',
    label: 'Ferah Açık',
    desc: 'Buz grisi & beyaz',
    bg: '#F4F7F7',
    card: '#FFFFFF',
    ink: '#0F201E',
    icon: Sun,
  },
  {
    id: 'cream',
    label: 'Mushaf Krem',
    desc: 'Göz yormayan sıcak zemin',
    bg: '#FAF6EE',
    card: '#FFFDF8',
    ink: '#1F1B14',
    icon: BookOpen,
  },
  {
    id: 'dark',
    label: 'Gece Okuma',
    desc: 'Düşük ışık modu',
    bg: '#0B1314',
    card: '#121E20',
    ink: '#F1F6F5',
    icon: Moon,
  },
];

const MEAL_OPTIONS: { id: PreferredMeal; label: string; short: string }[] = [
  { id: 'm1', label: 'Diyanet Vakfı (TDV)', short: 'TDV Meali' },
  { id: 'm2', label: 'Diyanet İşleri (Yeni)', short: 'DİB Yeni' },
  { id: 'both', label: 'Çift Meal (İkisi Birden)', short: 'Çift Meal' },
];

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    settings,
    updateSettings,
    resetSettings,
  } = useAppStore();

  useEffect(() => {
    if (!isSettingsModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettingsModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isSettingsModalOpen, closeSettingsModal]);

  if (!isSettingsModalOpen) return null;

  const handleTestSfx = () => {
    sfxService.play('correct', {
      force: true,
      volumeOverride: settings.sfxVolume > 0 ? settings.sfxVolume : 0.6,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={closeSettingsModal}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[88dvh] rounded-t-3xl sm:rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Mobil Tutamaç */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div
            className="w-10 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--border-strong)' }}
          />
        </div>

        {/* Üst Başlık */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Settings className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="settings-modal-title"
                className="text-lg font-extrabold tracking-tight truncate"
              >
                Görünüm, Yazı Tipi ve Ses Ayarları
              </h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Tüm tercihleriniz cihazınızda otomatik olarak saklanır.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeSettingsModal}
            aria-label="Ayarları kapat"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Kaydırılabilir Ayarlar Gövdesi */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 1. CANLI ÖNİZLEME KUTUSU */}
          <section aria-label="Canlı önizleme">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-extrabold">Canlı Arapça ve Türkçe Önizleme</h3>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Hucurât Suresi · 10. Ayet
              </span>
            </div>

            <div
              className="rounded-2xl p-4 sm:p-5 border space-y-3"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p
                className="arabic-text text-right break-words"
                style={{
                  fontFamily: resolveArabicFontFamily(settings.arabicFont),
                  fontSize: `${settings.arabicFontSize}px`,
                  color: 'var(--text-primary)',
                }}
              >
                {PREVIEW_ARABIC}
              </p>

              <div
                className="pt-3 border-t space-y-2.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                {(settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') && (
                  <div>
                    <span
                      className="block text-[11px] font-bold mb-0.5"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Diyanet Vakfı Meali (TDV)
                    </span>
                    <p
                      className="turkish-reading"
                      style={{
                        fontFamily: resolveTurkishFontStack(settings.turkishFont),
                        fontSize: `${settings.turkishFontSize}px`,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {PREVIEW_TDV}
                    </p>
                  </div>
                )}

                {(settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') && (
                  <div>
                    <span
                      className="block text-[11px] font-bold mb-0.5"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      Diyanet İşleri Meali (DİB Yeni)
                    </span>
                    <p
                      className="turkish-reading"
                      style={{
                        fontFamily: resolveTurkishFontStack(settings.turkishFont),
                        fontSize: `${settings.turkishFontSize}px`,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {PREVIEW_DIB}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 2. TEMA SEÇİMİ */}
          <section>
            <h3 className="text-sm font-extrabold mb-2.5">Tema</h3>
            <div className="grid grid-cols-3 gap-2.5">
              {THEME_OPTIONS.map((t) => {
                const Icon = t.icon;
                const active = settings.theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      updateSettings({ theme: t.id });
                    }}
                    className="min-h-[82px] p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="w-7 h-7 rounded-lg border flex items-center justify-center"
                        style={{
                          backgroundColor: t.bg,
                          borderColor: 'rgba(128,128,128,0.28)',
                          color: t.ink,
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      {active && (
                        <Check
                          className="w-4 h-4 shrink-0"
                          style={{ color: 'var(--brand-primary-text)' }}
                        />
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="text-xs sm:text-sm font-bold leading-tight">{t.label}</p>
                      <p
                        className="text-[11px] leading-tight mt-0.5 hidden sm:block"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {t.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. MEAL TERCİHİ */}
          <section>
            <h3 className="text-sm font-extrabold mb-2.5">Meal Tercihi</h3>
            <div
              className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {MEAL_OPTIONS.map((opt) => {
                const active = settings.preferredMeal === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      updateSettings({ preferredMeal: opt.id });
                    }}
                    className="min-h-[44px] px-2.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <span className="sm:hidden">{opt.short}</span>
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 4. ARAPÇA YAZI TİPİ (9 FONT) VE PUNTO KAYDIRICISI (20-44px) */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold">Arapça Mushaf Yazı Tipi (9 Hat)</h3>
              <span className="text-xs font-semibold" style={{ color: 'var(--brand-primary-text)' }}>
                {settings.arabicFont}
              </span>
            </div>

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
                    className="min-h-[72px] p-3 rounded-xl border text-left flex flex-col justify-between transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <span
                      className="block text-right text-xl leading-snug"
                      dir="rtl"
                      style={{
                        fontFamily: `${font.fontFamily}, serif`,
                        color: 'var(--text-primary)',
                      }}
                    >
                      بِسْمِ اللّٰهِ
                    </span>
                    <span className="text-xs font-bold truncate mt-1">{font.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Arapça Punto Kaydırıcısı */}
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <label htmlFor="arabic-size-slider" className="text-xs sm:text-sm font-bold">
                  Arapça Punto Boyutu
                </label>
                <span
                  className="text-xs font-extrabold tabular-nums px-2 py-0.5 rounded-md"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  {settings.arabicFontSize} px
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      arabicFontSize: Math.max(20, settings.arabicFontSize - 2),
                    })
                  }
                  aria-label="Arapça yazı boyutunu küçült"
                  className="min-w-[40px] min-h-[40px] rounded-lg border flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  id="arabic-size-slider"
                  type="range"
                  min={20}
                  max={44}
                  step={1}
                  value={settings.arabicFontSize}
                  onChange={(e) =>
                    updateSettings({ arabicFontSize: Number(e.target.value) })
                  }
                  className="flex-1 accent-teal-700 h-2 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      arabicFontSize: Math.min(44, settings.arabicFontSize + 2),
                    })
                  }
                  aria-label="Arapça yazı boyutunu büyüt"
                  className="min-w-[40px] min-h-[40px] rounded-lg border flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div
                className="flex justify-between text-[11px] tabular-nums mt-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>20 px (Kompakt)</span>
                <span>28 px (Önerilen)</span>
                <span>44 px (Büyük)</span>
              </div>
            </div>
          </section>

          {/* 5. TÜRKÇE YAZI TİPİ VE PUNTO KAYDIRICISI (14-24px) */}
          <section className="space-y-4">
            <h3 className="text-sm font-extrabold">Türkçe Yazı Tipi</h3>

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
                    className="min-h-[54px] px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between gap-2"
                    style={{
                      fontFamily: font.fontStack,
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <span className="text-xs sm:text-sm font-bold truncate">{font.label}</span>
                    {active && (
                      <Check
                        className="w-4 h-4 shrink-0"
                        style={{ color: 'var(--brand-primary-text)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Türkçe Punto Kaydırıcısı */}
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <label htmlFor="turkish-size-slider" className="text-xs sm:text-sm font-bold">
                  Türkçe Meal Punto Boyutu
                </label>
                <span
                  className="text-xs font-extrabold tabular-nums px-2 py-0.5 rounded-md"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  {settings.turkishFontSize} px
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      turkishFontSize: Math.max(14, settings.turkishFontSize - 1),
                    })
                  }
                  aria-label="Türkçe yazı boyutunu küçült"
                  className="min-w-[40px] min-h-[40px] rounded-lg border flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  id="turkish-size-slider"
                  type="range"
                  min={14}
                  max={24}
                  step={1}
                  value={settings.turkishFontSize}
                  onChange={(e) =>
                    updateSettings({ turkishFontSize: Number(e.target.value) })
                  }
                  className="flex-1 accent-teal-700 h-2 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      turkishFontSize: Math.min(24, settings.turkishFontSize + 1),
                    })
                  }
                  aria-label="Türkçe yazı boyutunu büyüt"
                  className="min-w-[40px] min-h-[40px] rounded-lg border flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div
                className="flex justify-between text-[11px] tabular-nums mt-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>14 px</span>
                <span>16 px (Önerilen)</span>
                <span>24 px</span>
              </div>
            </div>
          </section>

          {/* 6. SES EFEKTLERİ VE SINAV ŞIK HARFİ AYARLARI */}
          <section className="space-y-3">
            <h3 className="text-sm font-extrabold">Ses Efektleri ve Sınav Tercihleri</h3>

            {/* Ses Efektleri Anahtarı + Ses Seviyesi */}
            <div
              className="p-4 rounded-xl border space-y-3"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {settings.sfxEnabled ? (
                    <Volume2
                      className="w-5 h-5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                  ) : (
                    <VolumeX className="w-5 h-5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold">Ses Efektleri (SFX)</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Doğru, yanlış ve başarı bildirim sesleri
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.sfxEnabled}
                  aria-label="Ses efektlerini aç veya kapat"
                  onClick={() => {
                    const next = !settings.sfxEnabled;
                    updateSettings({ sfxEnabled: next });
                    if (next) sfxService.play('click', { force: true });
                  }}
                  className="relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0"
                  style={{
                    backgroundColor: settings.sfxEnabled
                      ? 'var(--brand-primary)'
                      : 'var(--border-strong)',
                  }}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      settings.sfxEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.sfxEnabled && (
                <div
                  className="pt-3 border-t flex flex-col sm:flex-row sm:items-center gap-3"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex-1 flex items-center gap-3">
                    <label
                      htmlFor="sfx-volume-slider"
                      className="text-xs font-semibold whitespace-nowrap"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Ses Düzeyi
                    </label>
                    <input
                      id="sfx-volume-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.sfxVolume}
                      onChange={(e) =>
                        updateSettings({ sfxVolume: Number(e.target.value) })
                      }
                      className="flex-1 accent-teal-700 h-2 cursor-pointer"
                    />
                    <span className="text-xs font-bold tabular-nums w-9 text-right">
                      %{Math.round(settings.sfxVolume * 100)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestSfx}
                    className="min-h-[38px] px-3.5 rounded-lg border text-xs font-bold whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Sesi Test Et
                  </button>
                </div>
              )}
            </div>

            {/* Dijital Ekranda Şık Harfi Göster */}
            <div
              className="p-4 rounded-xl border flex items-center justify-between gap-4"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold">Dijital Ekranda Şık Harfi Göster (A, B, C, D)</p>
                <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Kapalıyken mobil ekranda harfsiz ve sade seçenek kartları görünür; A4 PDF
                  çıktılarında şık harfleri her zaman yer alır.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.showOptionLettersInApp}
                aria-label="Dijital ekranda şık harfi göster"
                onClick={() => {
                  sfxService.play('click');
                  updateSettings({
                    showOptionLettersInApp: !settings.showOptionLettersInApp,
                  });
                }}
                className="relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0"
                style={{
                  backgroundColor: settings.showOptionLettersInApp
                    ? 'var(--brand-primary)'
                    : 'var(--border-strong)',
                }}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    settings.showOptionLettersInApp ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </section>
        </div>

        {/* Alt Çubuk */}
        <div
          className="px-5 py-3.5 border-t flex items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              resetSettings();
            }}
            className="min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Varsayılanlara Sıfırla</span>
          </button>

          <button
            type="button"
            onClick={closeSettingsModal}
            className="min-h-[44px] px-6 rounded-xl text-sm font-bold text-white cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
