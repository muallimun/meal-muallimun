import React from 'react';
import {
  BookOpen,
  Flame,
  Home,
  Layers,
  RotateCcw,
  Settings,
  Star,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { NavTab } from '../types/quran';
import { formatNumberTr } from '../utils/poolUtils';
import { BrandMark } from './BrandMark';
import { PwaInstallControl } from './PwaInstallControl';

interface NavItemConfig {
  id: NavTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'home', label: 'Ana Sayfa', shortLabel: 'Ana Sayfa', icon: Home },
  { id: 'reader', label: 'Meal & Okuma', shortLabel: 'Meal/Okuma', icon: BookOpen },
  { id: 'exam', label: 'Sınav Merkezi', shortLabel: 'Sınav', icon: Trophy },
  { id: 'mistakes', label: 'Hata Kampı', shortLabel: 'Hata Kampı', icon: RotateCcw },
];

const TAB_TITLES: Record<NavTab, string> = {
  home: 'Genel Bakış',
  reader: 'Mushaf & Çift Meal',
  exam: 'Sınav Merkezi',
  mistakes: 'Hata Kampı',
};

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const {
    activeTab,
    setActiveTab,
    gamification,
    poolStats,
    openPoolModal,
    openSettingsModal,
    dataSourceMode,
    retryCoreLoad,
    isExamActive,
    isOnline,
  } = useAppStore();

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* ====================================================================
          Masaüstü (lg+) Sol Sabit Yan Menü (Sidebar)
          ==================================================================== */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-72 lg:shrink-0 lg:sticky lg:top-0 lg:h-dvh border-r"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Marka Alanı */}
        <div
          className="px-5 h-16 flex items-center gap-3 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <BrandMark className="w-9 h-9 shrink-0" />
          <div className="min-w-0">
            <span className="block text-base font-extrabold tracking-tight truncate">
              Muallimun
            </span>
            <span
              className="block text-xs truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              Kur&apos;an &amp; Meal Platformu
            </span>
          </div>
        </div>

        {/* Ana Navigasyon Bağlantıları */}
        <nav aria-label="Ana menü" className="p-3.5 space-y-1 flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const mistakeBadge =
              item.id === 'mistakes' && gamification.wrongQuestionIds.length > 0
                ? gamification.wrongQuestionIds.length
                : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor: isActive ? 'var(--brand-primary-soft)' : 'transparent',
                  color: isActive ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                }}
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {mistakeBadge !== null && (
                  <span
                    className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      color: '#EF4444',
                    }}
                  >
                    {mistakeBadge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Hızlı Çalışma Havuzu Özeti */}
          <div
            className="mt-6 pt-5 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="px-2 mb-2 flex items-center justify-between">
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--text-muted)' }}
              >
                Aktif Çalışma Havuzu
              </span>
            </div>
            <button
              type="button"
              onClick={openPoolModal}
              className="w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Layers
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <span>Havuzu Yönet</span>
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  Değiştir
                </span>
              </div>
              <p
                className="text-xs tabular-nums leading-relaxed"
                style={{ color: 'var(--text-muted)' }}
              >
                {formatNumberTr(poolStats.surahCount)} Sure ·{' '}
                {formatNumberTr(poolStats.ayahCount)} Ayet ·{' '}
                {formatNumberTr(poolStats.questionCount)} Soru
              </p>
            </button>
          </div>
        </nav>

        {/* Alt Kurulum & Ayarlar Tetikleyicisi */}
        <div
          className="p-3.5 border-t shrink-0 space-y-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <PwaInstallControl variant="sidebar" />
          <button
            type="button"
            onClick={openSettingsModal}
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors cursor-pointer hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-primary)',
            }}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Görünüm ve Yazı Tipi</span>
          </button>
        </div>
      </aside>

      {/* ====================================================================
          Sağ Ana İçerik Kabuğu (Üst Çubuk + İçerik + Alt Bilgi)
          ==================================================================== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobil & Masaüstü Üst Çubuk */}
        <header
          className="sticky top-0 z-30 h-14 lg:h-16 border-b backdrop-blur-md shrink-0"
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="h-full max-w-6xl mx-auto px-4 lg:px-8 flex items-center justify-between gap-3">
            {/* Sol: Mobilde Logo/Başlık, Masaüstünde Sayfa Başlığı */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className="lg:hidden flex items-center gap-2.5 min-h-[44px] cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600 rounded-lg"
                aria-label="Muallimun Ana Sayfa"
              >
                <BrandMark className="w-8 h-8 shrink-0" />
                <span className="text-base font-extrabold tracking-tight whitespace-nowrap">
                  Muallimun
                </span>
              </button>

              <div className="hidden lg:flex items-center gap-3 min-w-0">
                <h1 className="text-lg font-bold tracking-tight whitespace-nowrap">
                  {TAB_TITLES[activeTab]}
                </h1>
                {dataSourceMode === 'demo' && (
                  <button
                    type="button"
                    onClick={retryCoreLoad}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      borderColor: 'var(--brand-accent)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    Örnek Veri Modu · Canlı Veriyi Dene
                  </button>
                )}
              </div>
            </div>

            {/* Sağ: Günlük Seri, Toplam Puan ve Ayarlar Butonu */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Günlük Seri Rozeti */}
              <div
                className="h-9 px-2.5 sm:px-3 rounded-xl flex items-center gap-1.5 text-xs sm:text-sm font-bold tabular-nums border"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'transparent',
                  color: 'var(--brand-accent-text)',
                }}
                title="Günlük çalışma seriniz"
              >
                <Flame className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">
                  {formatNumberTr(gamification.streakDays)}
                  <span className="hidden sm:inline font-semibold"> gün</span>
                </span>
              </div>

              {/* Toplam Puan Rozeti */}
              <div
                className="h-9 px-2.5 sm:px-3 rounded-xl flex items-center gap-1.5 text-xs sm:text-sm font-bold tabular-nums border"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'transparent',
                  color: 'var(--brand-primary-text)',
                }}
                title="Toplam puanınız"
              >
                <Star className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">
                  {formatNumberTr(gamification.totalXp)}
                  <span className="hidden sm:inline font-semibold"> Puan</span>
                </span>
              </div>

              {/* Ayarlar Butonu (min 44px dokunma hedefi) */}
              <button
                type="button"
                onClick={openSettingsModal}
                aria-label="Ayarları aç"
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Çevrimdışı Durum Şeridi */}
        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="px-4 py-2 text-xs border-b"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <div className="max-w-6xl mx-auto flex items-center justify-center sm:justify-start gap-2 font-semibold">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>
                Çevrimdışı moddasınız — Daha önce yüklenen sure, meal ve sorular önbellekten
                kesintisiz çalışmaya devam eder.
              </span>
            </div>
          </div>
        )}

        {/* Demo Modu Mobil Uyarısı */}
        {dataSourceMode === 'demo' && (
          <div
            className="lg:hidden px-4 py-2 text-xs flex items-center justify-between gap-2 border-b"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <span className="font-medium">Örnek veri ile görüntüleniyor.</span>
            <button
              type="button"
              onClick={retryCoreLoad}
              className="font-bold underline cursor-pointer shrink-0"
            >
              Canlı veriyi dene
            </button>
          </div>
        )}

        {/* Sayfa İçeriği */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>

        {/* Alt Bilgi (Footer) — Mobilde alt sabit nav bar için güvenli boşluk */}
        <footer
          className={`mt-auto border-t ${isExamActive ? 'pb-6' : 'pb-20'} lg:pb-6`}
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <p style={{ color: 'var(--text-muted)' }}>
              © {currentYear} Muallimun.Net — Kur&apos;an &amp; Meal Eğitim Platformu
            </p>
            <p style={{ color: 'var(--text-muted)' }}>
              TDV ve DİB mealleri · Editoryal soru bankası
            </p>
          </div>
        </footer>
      </div>

      {/* ====================================================================
          Mobil Alt Sabit Navigasyon Çubuğu (4 Sekme — Aktif sınavda gizlenir)
          ==================================================================== */}
      {!isExamActive && (
        <nav
          aria-label="Alt navigasyon"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md pb-safe"
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="grid grid-cols-4 h-16 max-w-lg mx-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const mistakeCount =
                item.id === 'mistakes' ? gamification.wrongQuestionIds.length : 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className="relative flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600"
                  style={{
                    color: isActive ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                  }}
                >
                  {isActive && (
                    <span
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    />
                  )}
                  <span className="relative">
                    <Icon className="w-5 h-5" />
                    {mistakeCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold tabular-nums flex items-center justify-center">
                        {mistakeCount > 99 ? '99+' : mistakeCount}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
                    {item.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};
