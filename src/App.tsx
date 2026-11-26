import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeedbackModal } from './components/FeedbackModal';
import { IntroSplash } from './components/IntroSplash';
import { MealSelectorModal } from './components/MealSelectorModal';
import { PageBookmarksDrawer } from './components/PageBookmarksDrawer';
import { PoolSelectorModal } from './components/PoolSelectorModal';
import { ReciterSelectorModal } from './components/ReciterSelectorModal';
import { VerseNoteModal } from './components/VerseNoteModal';
import { WaqfGuideModal } from './components/WaqfGuideModal';
import { QuickAddToResearchModal } from './features/fihrist/QuickAddToResearchModal';
import { QuickMemorizeFromVerseModal } from './features/memorization/QuickMemorizeFromVerseModal';
import { StudyPage } from './features/study/StudyPage';
import { RukuPopoverHost, WaqfPopoverHost } from './features/study/StudyPopovers';
import { TajweedRulePopoverHost } from './features/study/TajweedRulePopover';
import { HomePage } from './pages/HomePage';
import { AppProvider, useAppStore } from './store/useAppStore';
import { lazyWithRetry } from './utils/lazyWithRetry';

const FihristHubPage = lazyWithRetry(() =>
  import('./features/fihrist/FihristHubPage').then((m) => ({ default: m.FihristHubPage })),
);
const MemorizationHubPage = lazyWithRetry(() =>
  import('./features/memorization/MemorizationHubPage').then((m) => ({
    default: m.MemorizationHubPage,
  })),
);
const ExamCenterPage = lazyWithRetry(() =>
  import('./features/exam/ExamCenterPage').then((m) => ({ default: m.ExamCenterPage })),
);

const GlobalSearchModal = lazyWithRetry(() =>
  import('./components/GlobalSearchModal').then((m) => ({ default: m.GlobalSearchModal })),
);
const HatimPlannerModal = lazyWithRetry(() =>
  import('./components/HatimPlannerModal').then((m) => ({ default: m.HatimPlannerModal })),
);
const IslamicCalendarModal = lazyWithRetry(() =>
  import('./components/IslamicCalendarModal').then((m) => ({
    default: m.IslamicCalendarModal,
  })),
);
const SettingsModal = lazyWithRetry(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const UserGuideModal = lazyWithRetry(() =>
  import('./components/UserGuideModal').then((m) => ({ default: m.UserGuideModal })),
);
const ListeningDrawerModal = lazyWithRetry(() =>
  import('./components/ListeningDrawerModal').then((m) => ({ default: m.ListeningDrawerModal })),
);
const MealCompareModal = lazyWithRetry(() =>
  import('./components/MealCompareModal').then((m) => ({ default: m.MealCompareModal })),
);
const MutashabihatModal = lazyWithRetry(() =>
  import('./components/MutashabihatModal').then((m) => ({ default: m.MutashabihatModal })),
);

const RouteLoadingFallback: React.FC = () => (
  <div
    className="min-h-[42vh] flex flex-col items-center justify-center gap-2.5 text-xs font-bold"
    style={{ color: 'var(--text-muted)' }}
    role="status"
    aria-live="polite"
  >
    <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-primary)' }} />
    <span>Modül yükleniyor…</span>
  </div>
);

const MainRouter: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    settings,
    isSearchModalOpen,
    isHatimModalOpen,
    isCalendarModalOpen,
    isSettingsModalOpen,
    isUserGuideOpen,
    isListeningDrawerOpen,
    compareTarget,
    mutashabihatTarget,
    closeListeningDrawer,
    closePoolModal,
    closeSettingsModal,
    closeReciterSelector,
    closeMealSelector,
    closeMealCompare,
    closeMutashabihat,
    closeWaqfGuide,
    closeQuickMemorize,
    closeQuickResearch,
    closeBookmarksDrawer,
    closeHatimModal,
    closeCalendarModal,
    closeVerseNoteModal,
    closeSearchModal,
    closeUserGuide,
    closeFeedbackModal,
    closeIntroSplash,
  } = useAppStore();

  const handleResetModals = React.useCallback(() => {
    closeListeningDrawer();
    closePoolModal();
    closeSettingsModal();
    closeReciterSelector();
    closeMealSelector();
    closeMealCompare();
    closeMutashabihat();
    closeWaqfGuide();
    closeQuickMemorize();
    closeQuickResearch();
    closeBookmarksDrawer();
    closeHatimModal();
    closeCalendarModal();
    closeVerseNoteModal();
    closeSearchModal();
    closeUserGuide();
    closeFeedbackModal();
    closeIntroSplash(false);
  }, [
    closeBookmarksDrawer,
    closeCalendarModal,
    closeFeedbackModal,
    closeHatimModal,
    closeIntroSplash,
    closeListeningDrawer,
    closeMealCompare,
    closeMealSelector,
    closeMutashabihat,
    closePoolModal,
    closeQuickMemorize,
    closeQuickResearch,
    closeReciterSelector,
    closeSearchModal,
    closeSettingsModal,
    closeUserGuide,
    closeVerseNoteModal,
    closeWaqfGuide,
  ]);

  return (
    <AppShell>
      <ErrorBoundary
        scope="page"
        resetKey={activeTab}
        onNavigateHome={() => setActiveTab('home')}
      >
        {activeTab === 'home' ? (
          <HomePage />
        ) : activeTab === 'reader' ? (
          <StudyPage />
        ) : (
          <Suspense fallback={<RouteLoadingFallback />}>
            {activeTab === 'fihrist' ? (
              <FihristHubPage />
            ) : activeTab === 'memorize' ? (
              <MemorizationHubPage />
            ) : (
              <ExamCenterPage />
            )}
          </Suspense>
        )}
      </ErrorBoundary>

      <ErrorBoundary scope="modals">
        <AudioPlayerBar />
        <WaqfPopoverHost />
        <RukuPopoverHost />
        <TajweedRulePopoverHost theme={settings.theme} enabled={settings.tajweedEnabled} />
      </ErrorBoundary>

      <ErrorBoundary scope="modals" onReset={handleResetModals}>
        {isListeningDrawerOpen && (
          <Suspense fallback={null}>
            <ListeningDrawerModal />
          </Suspense>
        )}
        <PoolSelectorModal />
        {isSettingsModalOpen && (
          <Suspense fallback={null}>
            <SettingsModal />
          </Suspense>
        )}
        <ReciterSelectorModal />
        <MealSelectorModal />
        {compareTarget !== null && (
          <Suspense fallback={null}>
            <MealCompareModal />
          </Suspense>
        )}
        {mutashabihatTarget !== null && (
          <Suspense fallback={null}>
            <MutashabihatModal />
          </Suspense>
        )}
        <WaqfGuideModal />
        <QuickMemorizeFromVerseModal />
        <QuickAddToResearchModal />
        <PageBookmarksDrawer />
        {isHatimModalOpen && (
          <Suspense fallback={null}>
            <HatimPlannerModal />
          </Suspense>
        )}
        {isCalendarModalOpen && (
          <Suspense fallback={null}>
            <IslamicCalendarModal />
          </Suspense>
        )}
        <VerseNoteModal />
        {isSearchModalOpen && (
          <Suspense fallback={null}>
            <GlobalSearchModal />
          </Suspense>
        )}
        {isUserGuideOpen && (
          <Suspense fallback={null}>
            <UserGuideModal />
          </Suspense>
        )}
        <FeedbackModal />
        <IntroSplash />
      </ErrorBoundary>
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <MainRouter />
    </AppProvider>
  );
};

export default App;
