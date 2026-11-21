import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Bookmark,
  Flame,
  Home,
  Layers,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Settings,
  Star,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { audioQueueService } from '../services/audioQueueService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { NavTab } from '../types/quran';
import { formatNumberTr } from '../utils/poolUtils';
import { BrandMark } from './BrandMark';
import { PwaInstallControl } from './PwaInstallControl';

interface NavItemConfig {
  id: NavTab;
  label: string;
  shortLabel: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'home', label: 'Ana Sayfa', shortLabel: 'Ana Sayfa', mobileLabel: 'Ana Sayfa', icon: Home },
  { id: 'reader', label: 'Meal & Okuma', shortLabel: 'Okuma', mobileLabel: 'Okuma', icon: BookOpen },
  { id: 'memorize', label: 'Ezber Modu', shortLabel: 'Ezber', mobileLabel: 'Ezber', icon: BookMarked },
  { id: 'exam', label: 'Sınav Merkezi', shortLabel: 'Sınav', mobileLabel: 'Sınav', icon: Trophy },
  { id: 'mistakes', label: 'Hata Kampı', shortLabel: 'Hata', mobileLabel: 'Hata', icon: RotateCcw },
];

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const {
    activeTab,
    setActiveTab,
    gamification,
    studyPrefs,
    studyProgress,
    poolStats,
    openPoolModal,
    openSettingsModal,
    openBookmarksDrawer,
    openSearchModal,
    dataSourceMode,
    retryCoreLoad,
    isExamActive,
    setIsExamActive,
    isMemorizationZenActive,
    isMobileReaderImmersive,
    isAudioBarExpanded,
    isOnline,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
  } = useAppStore();

  const isMobilePureReader =
    activeTab === 'reader' && (studyPrefs.viewMode === 'mushaf' || studyPrefs.viewMode === 'book');

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const [pendingNavTab, setPendingNavTab] = useState<NavTab | null>(null);

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const isAudioBarVisible =
    !isExamActive &&
    !isMemorizationZenActive &&
    audioState.isVisible &&
    audioState.status !== 'idle';
  const isAudioBarDetailsOpen =
    isAudioBarVisible && (isAudioBarExpanded || audioState.missingMealAudio);

  const currentYear = new Date().getFullYear();
  const bookmarkCount = studyProgress.pageBookmarks.length;

  const contentWidthClass = isSidebarCollapsed
    ? 'max-w-[1600px]'
    : activeTab === 'reader'
      ? 'max-w-7xl'
      : 'max-w-6xl';

  // Genel Tam Ekran Durumu Senkronizasyonu
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Global Ctrl+K / Cmd+K Hızlı Arama Kısayolu
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearchModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSearchModal]);

  const handleToggleFullscreen = useCallback(async () => {
    sfxService.play('click');
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Tarayıcı/iFrame tam ekran kısıtlamasını sessizce geç
    }
  }, []);

  // Aktif sınav sırasında güvenli sekme geçişi
  const handleRequestTab = useCallback(
    (tab: NavTab) => {
      if (tab === activeTab) return;
      if (isExamActive) {
        sfxService.play('click');
        setPendingNavTab(tab);
        return;
      }
      setActiveTab(tab);
    },
    [activeTab, isExamActive, setActiveTab],
  );

  const handleConfirmLeaveExam = () => {
    if (!pendingNavTab) return;
    const target = pendingNavTab;
    setPendingNavTab(null);
    setIsExamActive(false);
    setActiveTab(target);
  };

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* ====================================================================
          Masaüstü (lg+) Sol Sabit Yan Menü (Açılır / Kapanır Sidebar)
          ==================================================================== */}
      {!isSidebarCollapsed && (
        <aside
          className="hidden lg:flex lg:flex-col lg:w-64 xl:w-68 lg:shrink-0 lg:sticky lg:top-0 lg:h-dvh border-r"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Marka Alanı + Sol Paneli Gizle */}
          <div
            className="px-4 h-14 flex items-center justify-between gap-2 border-b shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => handleRequestTab('home')}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left"
            >
              <BrandMark className="w-8 h-8 shrink-0" />
              <div className="min-w-0">
                <span className="block text-sm font-extrabold tracking-tight truncate">
                  Muallimun
                </span>
                <span
                  className="block text-[11px] truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Kur&apos;an &amp; Meal
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="Sol menüyü gizle (Geniş ekran)"
              aria-label="Sol menüyü gizle"
              className="min-w-[34px] min-h-[34px] rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 hover:opacity-85"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Ana Navigasyon Bağlantıları */}
          <nav aria-label="Ana menü" className="p-3 space-y-1 flex-1 overflow-y-auto">
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
                  onClick={() => handleRequestTab(item.id)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl flex items-center justify-between gap-2.5 text-sm font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                  style={{
                    backgroundColor: isActive ? 'var(--brand-primary-soft)' : 'transparent',
                    color: isActive ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  <span className="flex items-center gap-2.5 whitespace-nowrap">
                    <Icon className="w-4 h-4 shrink-0" />
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
              className="mt-5 pt-4 border-t"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="px-2 mb-1.5 flex items-center justify-between">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Aktif Çalışma Havuzu
                </span>
              </div>
              <button
                type="button"
                onClick={openPoolModal}
                className="w-full text-left p-3 rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    <Layers
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Havuzu Yönet</span>
                  </span>
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    Değiştir
                  </span>
                </div>
                <p
                  className="text-[11px] tabular-nums leading-relaxed"
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
            className="p-3 border-t shrink-0 space-y-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <PwaInstallControl variant="sidebar" />
            <button
              type="button"
              onClick={openSettingsModal}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-bold transition-colors cursor-pointer hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-primary)',
              }}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Görünüm ve Ayarlar</span>
            </button>
          </div>
        </aside>
      )}

      {/* ====================================================================
          Sağ Ana İçerik Kabuğu (İnce h-14 Üst Çubuk + İçerik + Alt Bilgi)
          ==================================================================== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Tüm cihazlarda ince, zarif, yüksek işlevli h-14 Üst Çubuk (Mobilde Saf Mushaf/Kitap modunda gizlenir) */}
        <header
          className={`${isMobilePureReader ? 'hidden lg:block' : ''} sticky top-0 z-30 h-14 border-b backdrop-blur-md shrink-0`}
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className={`h-full ${contentWidthClass} mx-auto px-3 sm:px-4 lg:px-5 flex items-center justify-between gap-2`}
          >
            {/* Sol: Menü (Masaüstü) + Marka Logosu/Başlığı + Daraltılmış Hızlı Sekmeler */}
            <div className="flex items-center gap-2 min-w-0">
              {/* Masaüstü Sidebar Aç — Yalnızca sol menü kapalıyken görünür (mükerrer ikon yok) */}
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  title="Sol menüyü aç"
                  aria-label="Sol menüyü aç"
                  className="hidden lg:inline-flex min-h-[36px] px-2.5 rounded-xl border items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <PanelLeftOpen className="w-4 h-4 shrink-0" />
                  <span>Menü</span>
                </button>
              )}

              {/* Marka Kimliği — Mobilde her zaman, masaüstünde sidebar kapalıyken görünür */}
              <button
                type="button"
                onClick={() => handleRequestTab('home')}
                className={`${
                  isSidebarCollapsed ? 'flex' : 'flex lg:hidden'
                } items-center gap-2 min-h-[38px] cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600 rounded-lg shrink-0`}
                aria-label="Muallimun Ana Sayfa"
              >
                <BrandMark className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
                <span className="text-sm sm:text-base font-extrabold tracking-tight whitespace-nowrap">
                  Muallimun
                </span>
              </button>

              {/* Sidebar Kapalıyken Masaüstü Hızlı Sekme Şeridi */}
              {isSidebarCollapsed && (
                <nav
                  aria-label="Hızlı masaüstü menü"
                  className="hidden lg:flex items-center gap-0.5 pl-1 border-l"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleRequestTab(item.id)}
                        className="min-h-[34px] px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.shortLabel}</span>
                      </button>
                    );
                  })}
                </nav>
              )}

              {/* Demo uyarısı (masaüstü) */}
              {dataSourceMode === 'demo' && (
                <button
                  type="button"
                  onClick={retryCoreLoad}
                  className="hidden xl:inline-flex text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    borderColor: 'var(--brand-accent)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  Örnek Veri · Canlıyı Dene
                </button>
              )}
            </div>

            {/* Orta / Sağ Hızlı Araçlar: Mobilde marka adının kesilmemesi için sade, masaüstünde tam */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* 1. Hızlı Arama Tetikleyicisi (Ctrl+K) */}
              <button
                type="button"
                onClick={openSearchModal}
                title="Hızlı Ara (Ctrl+K)"
                aria-label="Sure, ayet veya sayfa ara"
                className="min-w-[36px] min-h-[36px] sm:min-w-[38px] sm:min-h-[38px] px-2 sm:px-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer hover:border-teal-600/50"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                <span className="hidden md:inline whitespace-nowrap">Ara</span>
                <kbd
                  className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Ctrl K
                </kbd>
              </button>

              {/* 2. Sayfa Ayraçlarım Hızlı Çekmece Butonu */}
              <button
                type="button"
                onClick={openBookmarksDrawer}
                title="Sayfa Ayraçlarım"
                aria-label="Sayfa Ayraçlarım"
                className="relative min-w-[36px] min-h-[36px] sm:min-w-[38px] sm:min-h-[38px] px-2 sm:px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    bookmarkCount > 0 ? 'var(--brand-accent-soft)' : 'var(--bg-surface)',
                  borderColor:
                    bookmarkCount > 0 ? 'rgba(217, 119, 6, 0.35)' : 'var(--border-subtle)',
                  color: bookmarkCount > 0 ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                }}
              >
                <Bookmark
                  className={`w-4 h-4 shrink-0 ${bookmarkCount > 0 ? 'fill-current' : ''}`}
                />
                <span className="hidden md:inline whitespace-nowrap">Ayraçlar</span>
                {bookmarkCount > 0 && (
                  <span
                    className="min-w-[16px] h-[16px] px-1 rounded-md text-[10px] font-extrabold tabular-nums flex items-center justify-center text-white"
                    style={{ backgroundColor: 'var(--brand-accent)' }}
                  >
                    {bookmarkCount}
                  </span>
                )}
              </button>

              {/* 3. Kompakt Günlük Seri Rozeti (sm+ ekranlarda) */}
              <div
                className="hidden sm:flex h-[38px] px-2.5 rounded-xl items-center gap-1 text-xs font-bold tabular-nums"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
                title="Günlük çalışma seriniz"
              >
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">
                  {formatNumberTr(gamification.streakDays)}
                  <span className="font-semibold"> g</span>
                </span>
              </div>

              {/* 3b. Kompakt Toplam Puan Rozeti */}
              <div
                className="h-[36px] sm:h-[38px] px-2 sm:px-2.5 rounded-xl flex items-center gap-1 text-xs font-bold tabular-nums"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
                title="Toplam puanınız"
              >
                <Star className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{formatNumberTr(gamification.totalXp)}</span>
              </div>

              {/* 4. Genel Tam Ekran İkonu (sm+ ekranlarda — dar mobilde taşmayı önler) */}
              <button
                type="button"
                onClick={handleToggleFullscreen}
                title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran modu'}
                aria-label={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran modu'}
                className="hidden sm:flex min-w-[38px] min-h-[38px] rounded-xl items-center justify-center border transition-colors cursor-pointer"
                style={{
                  backgroundColor: isFullscreen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isFullscreen ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: isFullscreen ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                }}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              {/* 5. Ayarlar Butonu */}
              <button
                type="button"
                onClick={openSettingsModal}
                title="Ayarlar"
                aria-label="Ayarları aç"
                className="min-w-[36px] min-h-[36px] sm:min-w-[38px] sm:min-h-[38px] rounded-xl flex items-center justify-center border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Çevrimdışı Durum Şeridi */}
        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="px-4 py-1.5 text-xs border-b"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <div className="max-w-6xl mx-auto flex items-center justify-center sm:justify-start gap-2 font-semibold">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>
                Çevrimdışı moddasınız — Önbellekteki sure, meal ve sorular kesintisiz çalışmaya devam
                eder.
              </span>
            </div>
          </div>
        )}

        {/* Demo Modu Mobil Uyarısı */}
        {dataSourceMode === 'demo' && (
          <div
            className="xl:hidden px-4 py-1.5 text-xs flex items-center justify-between gap-2 border-b"
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
        <main
          className={`flex-1 w-full ${contentWidthClass} mx-auto ${
            isMobilePureReader
              ? isMobileReaderImmersive
                ? 'px-1.5 pt-12 sm:px-3 lg:px-6 lg:pt-3.5'
                : 'px-1.5 pt-1 sm:px-3 lg:px-6 lg:pt-3.5'
              : 'px-3.5 pt-3.5 sm:px-5 lg:px-6 lg:pt-4'
          } ${
            isMobileReaderImmersive
              ? isAudioBarDetailsOpen
                ? 'pb-56 lg:pb-6'
                : isAudioBarVisible
                  ? 'pb-28 lg:pb-6'
                  : 'pb-6 lg:pb-6'
              : 'pb-4 lg:pb-6'
          }`}
        >
          {children}
        </main>

        {/* Alt Bilgi (Footer) — Mobilde Saf Odak modunda gizlenir */}
        <footer
          className={`${isMobileReaderImmersive ? 'hidden lg:block' : ''} mt-auto border-t ${
            isExamActive || isMemorizationZenActive
              ? 'pb-5 lg:pb-5'
              : isAudioBarDetailsOpen
                ? 'pb-60 lg:pb-52'
                : isAudioBarVisible
                  ? 'pb-36 lg:pb-24'
                  : 'pb-20 lg:pb-5'
          }`}
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className={`${contentWidthClass} mx-auto px-4 py-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs`}
          >
            <p style={{ color: 'var(--text-muted)' }}>
              © {currentYear} Muallimun.Net — Kur&apos;an &amp; Meal Eğitim Platformu
            </p>
            <p style={{ color: 'var(--text-muted)' }}>
              24 Türkçe meal · 27 Kurrâ · Ezber &amp; Sınav Merkezi
            </p>
          </div>
        </footer>
      </div>

      {/* ====================================================================
          Mobil Alt Sabit Navigasyon Çubuğu (5 Sekme — 360px taşmasız uyum)
          ==================================================================== */}
      {!isExamActive && !isMemorizationZenActive && !isMobileReaderImmersive && (
        <nav
          aria-label="Alt navigasyon"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md pb-safe"
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="grid grid-cols-5 h-15 max-w-lg mx-auto px-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const mistakeCount =
                item.id === 'mistakes' ? gamification.wrongQuestionIds.length : 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleRequestTab(item.id)}
                  className="relative flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-0 px-0.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600"
                  style={{
                    color: isActive ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                  }}
                >
                  {isActive && (
                    <span
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    />
                  )}
                  <Icon className="w-[19px] h-[19px] shrink-0" />
                  {mistakeCount > 0 && (
                    <span
                      className="absolute top-1 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-extrabold tabular-nums flex items-center justify-center leading-none pointer-events-none"
                      style={{ boxShadow: '0 0 0 2px var(--bg-nav)' }}
                    >
                      {mistakeCount > 99 ? '99+' : mistakeCount}
                    </span>
                  )}
                  <span className="text-[10px] sm:text-[11px] font-semibold tracking-tight whitespace-nowrap truncate max-w-full">
                    {item.mobileLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ====================================================================
          Aktif Sınavdan Çıkış Güvenlik Onay Modalı
          ==================================================================== */}
      {pendingNavTab !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nav-leave-exam-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPendingNavTab(null);
          }}
        >
          <div className="surface-card rounded-2xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="nav-leave-exam-title" className="text-base font-extrabold">
                  Aktif sınavdan çıkmak istiyor musunuz?
                </h3>
                <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Şu an devam eden bir sınavın var. Başka bir sekmeye geçersen sınav ilerlemen
                  oturum önbelleğinde saklanır; ancak zamanlayıcı duraklar.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setPendingNavTab(null);
                }}
                className="min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Sınava Dön
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveExam}
                className="min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                Çık ve Sekmeye Geç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
