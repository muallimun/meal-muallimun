import React from 'react';
import { AppShell } from './components/AppShell';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { IntroSplash } from './components/IntroSplash';
import { PageBookmarksDrawer } from './components/PageBookmarksDrawer';
import { PoolSelectorModal } from './components/PoolSelectorModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { MealCompareModal } from './components/MealCompareModal';
import { MealSelectorModal } from './components/MealSelectorModal';
import { ReciterSelectorModal } from './components/ReciterSelectorModal';
import { SettingsModal } from './components/SettingsModal';
import { ExamCenterPage } from './features/exam/ExamCenterPage';
import { MemorizationHubPage } from './features/memorization/MemorizationHubPage';
import { QuickMemorizeFromVerseModal } from './features/memorization/QuickMemorizeFromVerseModal';
import { MistakeCampPage } from './features/mistakes/MistakeCampPage';
import { StudyPage } from './features/study/StudyPage';
import { HomePage } from './pages/HomePage';
import { AppProvider, useAppStore } from './store/useAppStore';

const MainRouter: React.FC = () => {
  const { activeTab } = useAppStore();

  return (
    <AppShell>
      {activeTab === 'home' ? (
        <HomePage />
      ) : activeTab === 'reader' ? (
        <StudyPage />
      ) : activeTab === 'memorize' ? (
        <MemorizationHubPage />
      ) : activeTab === 'exam' ? (
        <ExamCenterPage />
      ) : (
        <MistakeCampPage />
      )}
      <AudioPlayerBar />
      <PoolSelectorModal />
      <SettingsModal />
      <ReciterSelectorModal />
      <MealSelectorModal />
      <MealCompareModal />
      <QuickMemorizeFromVerseModal />
      <PageBookmarksDrawer />
      <GlobalSearchModal />
      <IntroSplash />
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
