import React from 'react';
import { AppShell } from './components/AppShell';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { PoolSelectorModal } from './components/PoolSelectorModal';
import { SettingsModal } from './components/SettingsModal';
import { ExamCenterPage } from './features/exam/ExamCenterPage';
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
      ) : activeTab === 'exam' ? (
        <ExamCenterPage />
      ) : (
        <MistakeCampPage />
      )}
      <AudioPlayerBar />
      <PoolSelectorModal />
      <SettingsModal />
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
