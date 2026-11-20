import React from 'react';
import { AppShell } from './components/AppShell';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { PlaceholderScreen } from './components/PlaceholderScreen';
import { PoolSelectorModal } from './components/PoolSelectorModal';
import { SettingsModal } from './components/SettingsModal';
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
      ) : (
        <PlaceholderScreen tab={activeTab} />
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
