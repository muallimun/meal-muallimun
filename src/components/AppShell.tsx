import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Bookmark,
  ChevronDown,
  Compass,
  HardDrive,
  HelpCircle,
  Home,
  Maximize2,
  MessageSquareHeart,
  Minimize2,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sparkles,
  Trophy,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Z_LAYERS } from '../config/zLayers';
import { audioQueueService } from '../services/audioQueueService';
import { hasActiveBackStackEntries, useBackButtonGuard } from '../services/backStackService';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { NavTab } from '../types/quran';
import {
  getHijriOffset,
  getIslamicCalendarSnapshot,
  subscribeHijriOffset,
} from '../utils/islamicCalendar';
import {
  applyPwaUpdate,
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from '../utils/pwaUtils';
import { BrandMark } from './BrandMark';

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
  {
    id: 'fihrist',
    label: 'Fihrist & Araştırma',
    shortLabel: 'Fihrist',
    mobileLabel: 'Fihrist',
    icon: Compass,
  },
  { id: 'memorize', label: 'Ezber Modu', shortLabel: 'Ezber', mobileLabel: 'Ezber', icon: BookMarked },
  { id: 'exam', label: 'Sınav Merkezi', shortLabel: 'Sınav', mobileLabel: 'Sınav', icon: Trophy },
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
    openSettingsModal,
    openUserGuide,
    openFeedbackModal,
    openBookmarksDrawer,
    openCalendarModal,
    openSearchModal,
    openPresentationMode,
    dataSourceMode,
    retryCoreLoad,
    isExamActive,
    setIsExamActive,
    isMemorizationZenActive,
    isMobileReaderImmersive,
    isAudioBarMinimized,
    isOnline,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    storageQuotaWarning,
    dismissStorageQuotaWarning,
  } = useAppStore();

  const isReaderTab = activeTab === 'reader';
  const isDesktopMushaf = isReaderTab && studyPrefs.viewMode === 'mushaf';
  const isMobilePureReader =
    isReaderTab && (studyPrefs.viewMode === 'mushaf' || studyPrefs.viewMode === 'book');

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );
  const [pendingNavTab, setPendingNavTab] = useState<NavTab | null>(null);
  const [pendingOpenPresentation, setPendingOpenPresentation] = useState(false);
  const [isModuleMenuOpen, setIsModuleMenuOpen] = useState(false);
  const [dismissedPwaUpdate, setDismissedPwaUpdate] = useState(false);
  const [dismissedOfflineBanner, setDismissedOfflineBanner] = useState(false);
  const [showReconnectedBanner, setShowReconnectedBanner] = useState(false);
  const wasOfflineRef = useRef(!isOnline);
  const moduleMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setDismissedOfflineBanner(false);
      setShowReconnectedBanner(false);
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowReconnectedBanner(true);
      const timerId = window.setTimeout(() => {
        setShowReconnectedBanner(false);
      }, 3000);
      return () => window.clearTimeout(timerId);
    }
  }, [isOnline]);

  const pwaUpdateAvailable = useSyncExternalStore(
    subscribePwaUpdate,
    isPwaUpdateAvailable,
  );
  const hijriOffset = useSyncExternalStore(subscribeHijriOffset, getHijriOffset);
  const calendarSnapshot = useMemo(
    () => getIslamicCalendarSnapshot(new Date(), hijriOffset),
    [hijriOffset],
  );
  const showDesktopTopbarTools = !isSidebarCollapsed && !isReaderTab;

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const isAudioBarVisible =
    !isExamActive &&
    !isMemorizationZenActive &&
    audioState.isVisible &&
    audioState.status !== 'idle';
  const isFullAudioBarDocked = isAudioBarVisible && !isAudioBarMinimized;

  const currentYear = new Date().getFullYear();
  const bookmarkCount = studyProgress.pageBookmarks.length;

  const contentWidthClass = isSidebarCollapsed
    ? 'max-w-[1600px]'
    : isReaderTab
      ? 'max-w-7xl'
      : 'max-w-6xl';

  useEffect(() => {
    if (!isModuleMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (moduleMenuRef.current && !moduleMenuRef.current.contains(e.target as Node)) {
        setIsModuleMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModuleMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isModuleMenuOpen]);

  useEffect(() => {
    setIsModuleMenuOpen(false);
  }, [activeTab, isSidebarCollapsed]);

  // Yalnızca mobilde (<1024px) donanım/kaydırmalı Geri tuşu ile alt sekmeden Ana Sayfaya dön.
  // Masaüstünde sol panel tıklamaları asla history.back()/history.go(-1) tetiklemez.
  const mobileTabGuardPushedRef = useRef(false);
  const navStateRef = useRef({ activeTab, isExamActive, isMemorizationZenActive });
  navStateRef.current = { activeTab, isExamActive, isMemorizationZenActive };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isTopLevel = false;
    try {
      isTopLevel = window.self === window.top;
    } catch {
      isTopLevel = false;
    }
    if (!isTopLevel) return;

    const isMobileViewport = window.innerWidth < 1024;
    if (
      isMobileViewport &&
      activeTab !== 'home' &&
      !isExamActive &&
      !isMemorizationZenActive
    ) {
      if (!mobileTabGuardPushedRef.current) {
        try {
          window.history.pushState(
            { ...(window.history.state ?? {}), __muallimunMobileTabGuard: true },
            '',
          );
          mobileTabGuardPushedRef.current = true;
        } catch {
          // Geçmiş API kısıtlıysa sessizce devam et
        }
      }
    } else if (activeTab === 'home') {
      // Kullanıcı UI üzerinden Ana Sayfaya döndü; geçmişi geri sarmadan sadece işareti sıfırla
      mobileTabGuardPushedRef.current = false;
    }
  }, [activeTab, isExamActive, isMemorizationZenActive]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let isTopLevel = false;
    try {
      isTopLevel = window.self === window.top;
    } catch {
      isTopLevel = false;
    }
    if (!isTopLevel) return;

    const handleMobileTabPopState = () => {
      if (window.innerWidth >= 1024) return;
      if (!mobileTabGuardPushedRef.current) return;
      const { activeTab: curTab, isExamActive: examOn, isMemorizationZenActive: zenOn } =
        navStateRef.current;
      if (examOn || zenOn || curTab === 'home') return;
      if (hasActiveBackStackEntries()) return;

      mobileTabGuardPushedRef.current = false;
      setActiveTab('home');
    };

    window.addEventListener('popstate', handleMobileTabPopState);
    return () => window.removeEventListener('popstate', handleMobileTabPopState);
  }, [setActiveTab]);

  useBackButtonGuard(
    'nav_leave_exam_modal',
    pendingNavTab !== null,
    () => {
      setPendingNavTab(null);
      setPendingOpenPresentation(false);
    },
  );

  useEffect(() => {
    if (pendingNavTab === null) return;
    return acquireBodyScrollLock();
  }, [pendingNavTab]);

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

  // Aktif sınav sırasında güvenli sekme geçişi; aktif sekmeye yeniden tıklanırsa yukarı kaydır
  const handleRequestTab = useCallback(
    (tab: NavTab) => {
      if (tab === activeTab) {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
      if (isExamActive) {
        sfxService.play('click');
        setPendingOpenPresentation(false);
        setPendingNavTab(tab);
        return;
      }
      setActiveTab(tab);
    },
    [activeTab, isExamActive, setActiveTab],
  );

  const handleRequestPresentationMode = useCallback(() => {
    if (isExamActive) {
      sfxService.play('click');
      setPendingOpenPresentation(true);
      setPendingNavTab('reader');
      return;
    }
    openPresentationMode();
  }, [isExamActive, openPresentationMode]);

  const handleConfirmLeaveExam = () => {
    if (!pendingNavTab) return;
    const target = pendingNavTab;
    const shouldOpenPresentation = pendingOpenPresentation;
    setPendingNavTab(null);
    setPendingOpenPresentation(false);
    setIsExamActive(false);
    if (shouldOpenPresentation) {
      openPresentationMode();
    } else {
      setActiveTab(target);
    }
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
              const isActive =
                activeTab === item.id || (item.id === 'exam' && activeTab === 'mistakes');
              const mistakeBadge =
                item.id === 'exam' && gamification.wrongQuestionIds.length > 0
                  ? gamification.wrongQuestionIds.length
                  : null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleRequestTab(item.id)}
                  className={`w-full min-h-[42px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2.5 text-sm font-semibold transition-colors cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                    isActive
                      ? ''
                      : 'border-transparent hover:bg-[var(--bg-surface-soft)] hover:border-[var(--border-subtle)]'
                  }`}
                  style={{
                    backgroundColor: isActive ? 'var(--brand-primary-soft)' : undefined,
                    borderColor: isActive ? 'rgba(15, 118, 110, 0.28)' : undefined,
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
          </nav>

          {/* Alt Yardımcı Kısayollar: Veri Yedekle & Taşı + Sunum Modu + İletişim & Geri Bildirim */}
          <div
            className="mt-auto p-3 border-t shrink-0 space-y-1"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openSettingsModal('backup');
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-semibold transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{ color: 'var(--text-secondary)' }}
            >
              <HardDrive
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span className="truncate">Veri Yedekle &amp; Taşı</span>
            </button>

            <button
              type="button"
              onClick={handleRequestPresentationMode}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-semibold transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MonitorPlay
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span className="truncate">Sunum Modu</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                openFeedbackModal();
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-semibold transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MessageSquareHeart
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span className="truncate">İletişim &amp; Geri Bildirim</span>
            </button>
          </div>
        </aside>
      )}

      {/* ====================================================================
          Sağ Ana İçerik Kabuğu (İnce h-14 Üst Çubuk + İçerik + Alt Bilgi)
          ==================================================================== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobilde kompakt h-12 (48px), masaüstünde h-14 (56px) Üst Çubuk — Mobilde Okuma modunun tamamında gizlenir */}
        <header
          className={`${isReaderTab ? 'hidden lg:block' : ''} sticky top-0 z-30 h-12 lg:h-14 border-b backdrop-blur-md shrink-0`}
          style={{
            backgroundColor: 'var(--bg-nav)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className={`h-full ${contentWidthClass} mx-auto px-2.5 sm:px-4 ${
              isReaderTab ? 'lg:px-4 xl:px-5' : 'lg:px-6'
            } flex items-center justify-between gap-1.5 sm:gap-2`}
          >
            {/* Sol: Menü (Masaüstü) + Marka + Kompakt Arama & Hicrî Takvim / Kompakt Navigasyon */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              {/* Masaüstü Sidebar Aç — Yalnızca sol menü kapalıyken görünür */}
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  title="Sol menüyü aç"
                  aria-label="Sol menüyü aç"
                  className={`hidden lg:inline-flex h-9 ${
                    isReaderTab ? 'w-9 justify-center' : 'px-2.5 gap-1.5'
                  } rounded-xl border items-center text-xs font-bold transition-colors cursor-pointer shrink-0 hover:opacity-90`}
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <PanelLeftOpen className="w-4 h-4 shrink-0" />
                  {!isReaderTab && <span>Menü</span>}
                </button>
              )}

              {/* Marka Kimliği — Mobilde her zaman, masaüstünde sidebar kapalıyken (Okuma'da yalnızca amblem) */}
              <button
                type="button"
                onClick={() => handleRequestTab('home')}
                title="Muallimun Ana Sayfa"
                className={`${
                  isSidebarCollapsed ? 'flex' : 'flex lg:hidden'
                } items-center gap-2 min-h-[36px] cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600 rounded-lg shrink-0`}
                aria-label="Muallimun Ana Sayfa"
              >
                <BrandMark className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
                <span
                  className={`${
                    isReaderTab ? 'hidden' : 'inline'
                  } text-sm sm:text-base font-extrabold tracking-tight whitespace-nowrap`}
                >
                  Muallimun
                </span>
              </button>

              {/* Sol Panel Açıkken & Okuma Dışında Masaüstü Araçları: Kompakt Arama + Vurgulu Hicrî Takvim */}
              {showDesktopTopbarTools && (
                <div className="hidden lg:flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={openSearchModal}
                    title="Sure, ayet veya meal ara (Ctrl+K)"
                    aria-label="Hızlı Ara (Ctrl+K)"
                    className="w-44 xl:w-52 h-9 px-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer hover:border-[var(--brand-primary)]/60 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Search
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: 'var(--brand-primary-text)' }}
                      />
                      <span
                        className="font-semibold truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Ara…
                      </span>
                    </span>
                    <kbd
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 leading-none"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Ctrl K
                    </kbd>
                  </button>

                  <button
                    type="button"
                    onClick={openCalendarModal}
                    title={`Takvim Yaprağını Aç · ${calendarSnapshot.hijri.formattedTr} / ${calendarSnapshot.gregorian.formattedFullTr}`}
                    aria-label={`Hicrî takvim: ${calendarSnapshot.hijri.formattedTr}, Milâdî: ${calendarSnapshot.gregorian.formattedTr}. Takvim yaprağını aç`}
                    className="h-9 px-3 rounded-xl border flex items-center gap-2 transition-colors cursor-pointer hover:border-[var(--brand-primary)]/60 min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                    style={{
                      backgroundColor:
                        'color-mix(in srgb, var(--brand-primary-soft) 55%, var(--bg-surface))',
                      borderColor:
                        'color-mix(in srgb, var(--brand-primary) 26%, var(--border-subtle))',
                    }}
                  >
                    <span
                      className="text-sm leading-none shrink-0"
                      aria-hidden="true"
                      title={calendarSnapshot.moonPhase.label}
                    >
                      {calendarSnapshot.moonPhase.symbol}
                    </span>
                    <span
                      className="text-xs font-extrabold tracking-tight whitespace-nowrap"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      {calendarSnapshot.hijri.formattedTr}
                    </span>
                    <span
                      className="text-[11px] opacity-40 select-none shrink-0"
                      aria-hidden="true"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      ·
                    </span>
                    <span
                      className="text-[11.5px] font-semibold whitespace-nowrap truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {calendarSnapshot.gregorian.day} {calendarSnapshot.gregorian.monthNameTr}
                      <span className="hidden xl:inline"> {calendarSnapshot.gregorian.year}</span>
                    </span>
                    {calendarSnapshot.holyDay && (
                      <span
                        className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold whitespace-nowrap shrink-0"
                        style={{
                          backgroundColor: 'var(--brand-accent-soft)',
                          color: 'var(--brand-accent-text)',
                        }}
                      >
                        <Sparkles className="w-2.5 h-2.5 shrink-0" />
                        <span>{calendarSnapshot.holyDay.name}</span>
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Sidebar Kapalıyken Masaüstü Navigasyon: Okuma'da kompakt dropdown, diğerlerinde 5-sekme şerit */}
              {isSidebarCollapsed && isReaderTab && (
                <div ref={moduleMenuRef} className="hidden lg:block relative">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsModuleMenuOpen((v) => !v);
                    }}
                    aria-expanded={isModuleMenuOpen}
                    aria-label="Modül değiştir"
                    title="Diğer bölümlere geç"
                    className="h-9 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: isModuleMenuOpen
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: isModuleMenuOpen
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                      color: isModuleMenuOpen
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-primary)',
                    }}
                  >
                    <BookOpen
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Okuma</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-65 shrink-0" />
                  </button>

                  {isModuleMenuOpen && (
                    <div
                      className="absolute left-0 top-11 z-50 w-52 max-w-[calc(100vw-1.5rem)] rounded-2xl border shadow-2xl p-1.5 space-y-0.5"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                      }}
                    >
                      {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = item.id === 'reader';
                        const mistakeBadge =
                          item.id === 'exam' && gamification.wrongQuestionIds.length > 0
                            ? gamification.wrongQuestionIds.length
                            : null;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setIsModuleMenuOpen(false);
                              handleRequestTab(item.id);
                            }}
                            className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs font-bold transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)]"
                            style={{
                              backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                              color: active
                                ? 'var(--brand-primary-text)'
                                : 'var(--text-primary)',
                            }}
                          >
                            <span className="flex items-center gap-2 whitespace-nowrap">
                              <Icon className="w-4 h-4 shrink-0" />
                              <span>{item.label}</span>
                            </span>
                            {mistakeBadge !== null && (
                              <span
                                className="text-[10px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md leading-none"
                                style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.14)',
                                  color: '#EF4444',
                                }}
                              >
                                {mistakeBadge > 99 ? '99+' : mistakeBadge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {isSidebarCollapsed && !isReaderTab && (
                <nav
                  aria-label="Hızlı masaüstü menü"
                  className="hidden lg:flex items-center gap-0.5 pl-1.5 border-l min-w-0 overflow-x-auto no-scrollbar"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active =
                      activeTab === item.id || (item.id === 'exam' && activeTab === 'mistakes');
                    const mistakeBadge =
                      item.id === 'exam' && gamification.wrongQuestionIds.length > 0
                        ? gamification.wrongQuestionIds.length
                        : null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleRequestTab(item.id)}
                        className="min-h-[34px] px-2 xl:px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        style={{
                          backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                        }}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.shortLabel}</span>
                        {mistakeBadge !== null && (
                          <span
                            className="text-[10px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md leading-none"
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.14)',
                              color: '#EF4444',
                            }}
                          >
                            {mistakeBadge > 99 ? '99+' : mistakeBadge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              )}

              {/* Demo uyarısı (yalnızca okuma dışındaki sekmelerde geniş masaüstü) */}
              {dataSourceMode === 'demo' && !isReaderTab && (
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

            {/* Sol Menü Kapalıyken & Okuma Dışında: 5'li Menü ile Sağ İkonlar Arasında Hicrî–Milâdî Takvim Rozeti */}
            {isSidebarCollapsed && !isReaderTab && (
              <button
                type="button"
                onClick={openCalendarModal}
                title={`Takvim Yaprağını Aç · ${calendarSnapshot.hijri.formattedTr} / ${calendarSnapshot.gregorian.formattedFullTr}`}
                aria-label={`Hicrî takvim: ${calendarSnapshot.hijri.formattedTr}, Milâdî: ${calendarSnapshot.gregorian.formattedTr}. Takvim yaprağını aç`}
                className="hidden lg:inline-flex h-9 px-2.5 xl:px-3 rounded-xl border items-center gap-1.5 xl:gap-2 transition-colors cursor-pointer hover:border-[var(--brand-primary)]/60 min-w-0 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--brand-primary-soft) 55%, var(--bg-surface))',
                  borderColor:
                    'color-mix(in srgb, var(--brand-primary) 26%, var(--border-subtle))',
                }}
              >
                <span
                  className="text-sm leading-none shrink-0"
                  aria-hidden="true"
                  title={calendarSnapshot.moonPhase.label}
                >
                  {calendarSnapshot.moonPhase.symbol}
                </span>
                <span
                  className="text-xs font-extrabold tracking-tight whitespace-nowrap"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {calendarSnapshot.hijri.formattedTr}
                </span>
                <span
                  className="hidden xl:inline text-[11px] opacity-40 select-none shrink-0"
                  aria-hidden="true"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ·
                </span>
                <span
                  className="hidden xl:inline text-[11.5px] font-semibold whitespace-nowrap"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {calendarSnapshot.gregorian.day} {calendarSnapshot.gregorian.monthNameTr}
                  <span className="hidden 2xl:inline"> {calendarSnapshot.gregorian.year}</span>
                </span>
                {calendarSnapshot.holyDay && (
                  <span
                    className="hidden 2xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold whitespace-nowrap shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                    <span>{calendarSnapshot.holyDay.name}</span>
                  </span>
                )}
              </button>
            )}

            {/* Orta Bağlam Yuvası (Masaüstü Okuma Araç Çubuğu Portal Alanı) */}
            <div
              id="app-topbar-context-slot"
              className={
                isReaderTab
                  ? 'hidden lg:flex flex-1 min-w-0 items-center justify-center'
                  : 'hidden'
              }
            />

            {/* Sağ Global Araçlar: Mobilde 36px, tablet/masaüstünde 40px dokunma hedefli ikon butonları */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* 0. Sol Panel Kapalıyken Masaüstü Sunum Modu Kısayolu (Yalnızca İkon, w-9 h-9) */}
              {isSidebarCollapsed && !isReaderTab && (
                <button
                  type="button"
                  onClick={handleRequestPresentationMode}
                  title="Sunum Modu"
                  aria-label="Sunum Modu"
                  className="hidden lg:inline-flex w-9 h-9 rounded-xl border items-center justify-center transition-colors cursor-pointer hover:border-teal-600/50 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <MonitorPlay className="w-4 h-4 shrink-0" />
                </button>
              )}

              {/* 1. Hızlı Arama Tetikleyicisi (Ctrl+K) — Solda kompakt arama varken lg+ gizlenir */}
              <button
                type="button"
                onClick={openSearchModal}
                title="Hızlı Ara (Ctrl+K)"
                aria-label="Hızlı Ara (Ctrl+K)"
                className={`${
                  showDesktopTopbarTools ? 'lg:hidden ' : ''
                }w-9 h-9 sm:min-w-[40px] sm:min-h-[40px] sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-colors cursor-pointer hover:border-teal-600/50 touch-manipulation`}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Search className="w-4 h-4 shrink-0" />
              </button>

              {/* 2. Sayfa Ayraçlarım & Hatim — İkon + Mini Köşe Sayaç */}
              <button
                type="button"
                onClick={openBookmarksDrawer}
                title={
                  bookmarkCount > 0
                    ? `Sayfa Ayraçlarım & Hatim (${bookmarkCount})`
                    : 'Sayfa Ayraçlarım & Hatim'
                }
                aria-label="Sayfa Ayraçlarım ve Hatim"
                className="relative w-9 h-9 sm:min-w-[40px] sm:min-h-[40px] sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-colors cursor-pointer touch-manipulation"
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
                {bookmarkCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-extrabold tabular-nums flex items-center justify-center text-white dark:text-[#0b1314] leading-none pointer-events-none"
                    style={{
                      backgroundColor: 'var(--brand-accent-text)',
                      boxShadow: '0 0 0 1.5px var(--bg-nav)',
                    }}
                  >
                    {bookmarkCount > 99 ? '99+' : bookmarkCount}
                  </span>
                )}
              </button>

              {/* 3. Genel Tam Ekran İkonu */}
              <button
                type="button"
                onClick={handleToggleFullscreen}
                title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran modu'}
                aria-label={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran modu'}
                className="hidden sm:flex min-w-[40px] min-h-[40px] w-10 h-10 rounded-xl items-center justify-center border transition-colors cursor-pointer touch-manipulation"
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

              {/* 5. Kullanım Rehberi Butonu */}
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  openUserGuide('quickstart');
                }}
                title="Kullanım Rehberi"
                aria-label="Kullanım Rehberi"
                className="w-9 h-9 sm:min-w-[40px] sm:min-h-[40px] sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border transition-colors cursor-pointer hover:border-teal-600/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 touch-manipulation"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {/* 6. Ayarlar Butonu */}
              <button
                type="button"
                onClick={() => openSettingsModal()}
                title="Görünüm ve Ayarlar"
                aria-label="Ayarları aç"
                className="w-9 h-9 sm:min-w-[40px] sm:min-h-[40px] sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 touch-manipulation"
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

        {/* Çevrimdışı / Yeniden Bağlandı Durum Şeridi */}
        {!isOnline && !dismissedOfflineBanner && (
          <div
            role="status"
            aria-live="polite"
            className="px-3 sm:px-4 py-1.5 text-xs border-b shrink-0"
            style={{
              backgroundColor: 'var(--brand-accent-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-accent-text)',
            }}
          >
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 font-semibold">
              <span className="flex items-center gap-2 min-w-0">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate sm:whitespace-normal">
                  Çevrimdışı Mod — İndirilen sure ve mealler kullanıma hazır
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDismissedOfflineBanner(true)}
                aria-label="Çevrimdışı bildirimini kapat"
                className="p-1 rounded-lg cursor-pointer hover:opacity-80 shrink-0"
                style={{ color: 'var(--brand-accent-text)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {isOnline && showReconnectedBanner && (
          <div
            role="status"
            aria-live="polite"
            className="px-3 sm:px-4 py-1.5 text-xs border-b shrink-0"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
              borderColor: 'rgba(16, 185, 129, 0.35)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <div className="max-w-6xl mx-auto flex items-center justify-center sm:justify-start gap-2 font-bold">
              <Wifi className="w-3.5 h-3.5 shrink-0" />
              <span>İnternet bağlantısı yeniden kuruldu</span>
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

        {/* Depolama Kotası Uyarısı */}
        {storageQuotaWarning && (
          <div
            role="alert"
            className="px-4 py-2 text-xs border-b"
            style={{
              backgroundColor: 'rgba(217, 119, 6, 0.12)',
              borderColor: 'rgba(217, 119, 6, 0.35)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold leading-snug">{storageQuotaWarning}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    openSettingsModal('backup');
                  }}
                  className="px-2.5 py-1 rounded-lg font-extrabold cursor-pointer text-[11px] text-white"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  Ayarlar / Yedekle
                </button>
                <button
                  type="button"
                  onClick={dismissStorageQuotaWarning}
                  aria-label="Depolama uyarısını kapat"
                  className="p-1 rounded-lg cursor-pointer hover:opacity-80"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Güvenli PWA Yeni Sürüm Bildirim Şeridi (Sınav, Ezber Zen veya Tam Ekran Okuma aktifken gösterilmez) */}
        {pwaUpdateAvailable &&
          !dismissedPwaUpdate &&
          !isExamActive &&
          !isMemorizationZenActive &&
          !isMobileReaderImmersive && (
            <div
              role="status"
              className="relative z-20 px-4 py-1.5 text-xs border-b shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    void applyPwaUpdate();
                  }}
                  className="inline-flex items-center gap-1.5 font-extrabold cursor-pointer hover:underline text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Yeni sürüm hazır · Şimdi Güncelle</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedPwaUpdate(true)}
                  aria-label="Güncelleme bildirimini kapat"
                  className="p-1 rounded-lg cursor-pointer hover:opacity-80 shrink-0"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

        {/* Sayfa İçeriği */}
        <main
          className={`flex-1 w-full ${contentWidthClass} mx-auto ${
            isMobilePureReader
              ? isMobileReaderImmersive
                ? `px-1.5 pt-[calc(2.85rem+env(safe-area-inset-top,0px))] sm:px-3 lg:px-6 ${isDesktopMushaf ? 'lg:pt-2' : 'lg:pt-3.5'}`
                : `px-1.5 pt-0 sm:px-3 lg:px-6 ${isDesktopMushaf ? 'lg:pt-2' : 'lg:pt-3.5'}`
              : isReaderTab
                ? 'px-2.5 pt-0 sm:px-4 lg:px-6 lg:pt-3.5'
                : 'px-2.5 pt-2 sm:px-4 sm:pt-4 lg:px-6 lg:pt-4'
          } ${
            isMobileReaderImmersive
              ? isFullAudioBarDocked
                ? `pb-[calc(6rem+env(safe-area-inset-bottom,0px))] ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-24'}`
                : isAudioBarVisible
                  ? `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-6'}`
                  : `pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-6'}`
              : activeTab !== 'home'
                ? isExamActive || isMemorizationZenActive
                  ? `pb-6 ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-6'}`
                  : isFullAudioBarDocked
                    ? `pb-[calc(var(--bottom-nav-h)+6rem)] ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-24'}`
                    : isAudioBarVisible
                      ? `pb-[calc(var(--bottom-nav-h)+4.25rem)] ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-6'}`
                      : isReaderTab
                        ? `pb-[calc(var(--bottom-nav-h)+0.375rem)] ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-6'}`
                        : `pb-[calc(var(--bottom-nav-h)+1rem)] ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-6'}`
                : isFullAudioBarDocked
                  ? `pb-10 ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-24'}`
                  : `pb-4 ${isDesktopMushaf ? 'lg:pb-2' : 'lg:pb-6'}`
          }`}
        >
          {children}
        </main>

        {/* Alt Bilgi (Footer) — Mobilde yalnızca Ana Sayfa'da görünür; masaüstünde Mushaf sahnesinde gizlenir */}
        <footer
          className={`${
            isMobileReaderImmersive || activeTab !== 'home'
              ? isDesktopMushaf
                ? 'hidden'
                : 'hidden lg:block'
              : isDesktopMushaf
                ? 'lg:hidden'
                : ''
          } mt-auto border-t ${
            isExamActive || isMemorizationZenActive
              ? 'pb-5 lg:pb-5'
              : isFullAudioBarDocked
                ? 'pb-[calc(var(--bottom-nav-h)+6.25rem)] lg:pb-24'
                : isAudioBarVisible
                  ? 'pb-[calc(var(--bottom-nav-h)+4rem)] lg:pb-14'
                  : 'pb-[calc(var(--bottom-nav-h)+1rem)] lg:pb-5'
          }`}
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className={`${contentWidthClass} mx-auto px-4 py-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs`}
          >
            <p style={{ color: 'var(--text-muted)' }}>
              © {currentYear} kuran.muallimun.net — Muallimun Kur&apos;an &amp; Meal
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-2.5 gap-y-1">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  openUserGuide('quickstart');
                }}
                className="font-semibold hover:underline cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                Kullanım Rehberi
              </button>
              <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
                ·
              </span>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  openFeedbackModal();
                }}
                className="font-semibold hover:underline cursor-pointer"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                İletişim &amp; Geri Bildirim
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* ====================================================================
          Mobil Alt Sabit Navigasyon Çubuğu (5 Ferah Sekme — 360px taşmasız uyum)
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
          <div className="grid grid-cols-5 h-15 max-w-lg mx-auto px-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeTab === item.id || (item.id === 'exam' && activeTab === 'mistakes');
              const mistakeCount =
                item.id === 'exam' ? gamification.wrongQuestionIds.length : 0;

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
                      className="absolute top-1 right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-extrabold tabular-nums flex items-center justify-center leading-none pointer-events-none"
                      style={{ boxShadow: '0 0 0 1.5px var(--bg-nav)' }}
                    >
                      {mistakeCount > 99 ? '99+' : mistakeCount}
                    </span>
                  )}
                  <span className="text-[10.5px] sm:text-[11px] font-semibold leading-tight tracking-tight truncate max-w-full">
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
          className={`fixed inset-0 ${Z_LAYERS.NESTED_MODAL} flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="nav-leave-exam-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPendingNavTab(null);
              setPendingOpenPresentation(false);
            }
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
                  Şu an devam eden bir sınavınız var. Başka bir sekmeye geçerseniz sınav ilerlemeniz
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
                  setPendingOpenPresentation(false);
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
