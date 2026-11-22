import React from 'react';
import { AppShell } from './components/AppShell';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IntroSplash } from './components/IntroSplash';
import { PageBookmarksDrawer } from './components/PageBookmarksDrawer';
import { PoolSelectorModal } from './components/PoolSelectorModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { HatimPlannerModal } from './components/HatimPlannerModal';
import { ListeningDrawerModal } from './components/ListeningDrawerModal';
import { MealCompareModal } from './components/MealCompareModal';
import { MealSelectorModal } from './components/MealSelectorModal';
import { MutashabihatModal } from './components/MutashabihatModal';
import { ReciterSelectorModal } from './components/ReciterSelectorModal';
import { SettingsModal } from './components/SettingsModal';
import { UserGuideModal } from './components/UserGuideModal';
import { VerseNoteModal } from './components/VerseNoteModal';
import { WaqfGuideModal } from './components/WaqfGuideModal';
import { ExamCenterPage } from './features/exam/ExamCenterPage';
import { FihristHubPage } from './features/fihrist/FihristHubPage';
import { QuickAddToResearchModal } from './features/fihrist/QuickAddToResearchModal';
import { MemorizationHubPage } from './features/memorization/MemorizationHubPage';
import { QuickMemorizeFromVerseModal } from './features/memorization/QuickMemorizeFromVerseModal';
import { StudyPage } from './features/study/StudyPage';
import { RukuPopoverHost, WaqfPopoverHost } from './features/study/StudyPopovers';
import { TajweedRulePopoverHost } from './features/study/TajweedRulePopover';
import { HomePage } from './pages/HomePage';
import { AppProvider, useAppStore } from './store/useAppStore';

const MainRouter: React.FC = () => {
  const { activeTab, setActiveTab, settings } = useAppStore();

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
        ) : activeTab === 'fihrist' ? (
          <FihristHubPage />
        ) : activeTab === 'memorize' ? (
          <MemorizationHubPage />
        ) : (
          <ExamCenterPage />
        )}
      </ErrorBoundary>

      <ErrorBoundary scope="modals">
        <AudioPlayerBar />
        <ListeningDrawerModal />
        <PoolSelectorModal />
        <SettingsModal />
        <ReciterSelectorModal />
        <MealSelectorModal />
        <MealCompareModal />
        <MutashabihatModal />
        <WaqfGuideModal />
        <WaqfPopoverHost />
        <RukuPopoverHost />
        <TajweedRulePopoverHost theme={settings.theme} enabled={settings.tajweedEnabled} />
        <QuickMemorizeFromVerseModal />
        <QuickAddToResearchModal />
        <PageBookmarksDrawer />
        <HatimPlannerModal />
        <VerseNoteModal />
        <GlobalSearchModal />
        <UserGuideModal />
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
