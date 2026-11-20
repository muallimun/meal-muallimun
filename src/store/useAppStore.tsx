import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ARABIC_FONTS,
  TURKISH_FONTS,
  resolveArabicFontFamily,
  resolveTurkishFontStack,
} from '../config/assetsConfig';
import { dataService, type DataSourceMode } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import type {
  AppSettings,
  GamificationState,
  ManifestData,
  MetaData,
  NavTab,
  PersistedAppState,
  PoolStatsSummary,
  QuestionIndexFile,
  StudyPool,
} from '../types/quran';
import { computePoolStats } from '../utils/poolUtils';

export const STORAGE_KEY = 'muallimun_meal_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'cream',
  preferredMeal: 'm1',
  arabicFont: ARABIC_FONTS[0].label, // 'Elif Mushaf Hattı'
  turkishFont: TURKISH_FONTS[0].label, // 'Plus Jakarta Sans'
  arabicFontSize: 28,
  turkishFontSize: 16,
  sfxEnabled: true,
  sfxVolume: 0.75,
  showOptionLettersInApp: false,
};

export const DEFAULT_STUDY_POOL: StudyPool = {
  selectedSurahs: [17, 24, 31, 49],
  selectedJuzs: [],
  isCustomized: false,
};

export const DEFAULT_GAMIFICATION: GamificationState = {
  totalXp: 0,
  streakDays: 1,
  lastActiveDate: null,
  solvedCount: 0,
  correctCount: 0,
  wrongQuestionIds: [],
  examHistory: [],
};

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetweenIso(prevIso: string, currIso: string): number {
  const prev = new Date(`${prevIso}T00:00:00`);
  const curr = new Date(`${currIso}T00:00:00`);
  const diffMs = curr.getTime() - prev.getTime();
  return Math.round(diffMs / 86_400_000);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function hydrateState(): PersistedAppState {
  const today = getTodayIsoDate();

  if (typeof window === 'undefined') {
    return {
      settings: DEFAULT_SETTINGS,
      studyPool: DEFAULT_STUDY_POOL,
      gamification: { ...DEFAULT_GAMIFICATION, lastActiveDate: today },
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        settings: DEFAULT_SETTINGS,
        studyPool: DEFAULT_STUDY_POOL,
        gamification: { ...DEFAULT_GAMIFICATION, lastActiveDate: today },
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    const rawSettings = parsed.settings ?? ({} as Partial<AppSettings>);
    const validArabicFont = ARABIC_FONTS.some((f) => f.label === rawSettings.arabicFont)
      ? (rawSettings.arabicFont as string)
      : DEFAULT_SETTINGS.arabicFont;
    const validTurkishFont = TURKISH_FONTS.some((f) => f.label === rawSettings.turkishFont)
      ? (rawSettings.turkishFont as string)
      : DEFAULT_SETTINGS.turkishFont;

    const settings: AppSettings = {
      theme:
        rawSettings.theme === 'light' ||
        rawSettings.theme === 'cream' ||
        rawSettings.theme === 'dark'
          ? rawSettings.theme
          : DEFAULT_SETTINGS.theme,
      preferredMeal:
        rawSettings.preferredMeal === 'm1' ||
        rawSettings.preferredMeal === 'm2' ||
        rawSettings.preferredMeal === 'both'
          ? rawSettings.preferredMeal
          : DEFAULT_SETTINGS.preferredMeal,
      arabicFont: validArabicFont,
      turkishFont: validTurkishFont,
      arabicFontSize: clamp(
        typeof rawSettings.arabicFontSize === 'number'
          ? rawSettings.arabicFontSize
          : DEFAULT_SETTINGS.arabicFontSize,
        20,
        44,
      ),
      turkishFontSize: clamp(
        typeof rawSettings.turkishFontSize === 'number'
          ? rawSettings.turkishFontSize
          : DEFAULT_SETTINGS.turkishFontSize,
        14,
        24,
      ),
      sfxEnabled:
        typeof rawSettings.sfxEnabled === 'boolean'
          ? rawSettings.sfxEnabled
          : DEFAULT_SETTINGS.sfxEnabled,
      sfxVolume: clamp(
        typeof rawSettings.sfxVolume === 'number'
          ? rawSettings.sfxVolume
          : DEFAULT_SETTINGS.sfxVolume,
        0,
        1,
      ),
      showOptionLettersInApp:
        typeof rawSettings.showOptionLettersInApp === 'boolean'
          ? rawSettings.showOptionLettersInApp
          : DEFAULT_SETTINGS.showOptionLettersInApp,
    };

    const rawPool = parsed.studyPool;
    const studyPool: StudyPool = {
      selectedSurahs: Array.isArray(rawPool?.selectedSurahs)
        ? rawPool.selectedSurahs.filter((n) => typeof n === 'number' && n >= 1 && n <= 114)
        : DEFAULT_STUDY_POOL.selectedSurahs,
      selectedJuzs: Array.isArray(rawPool?.selectedJuzs)
        ? rawPool.selectedJuzs.filter((n) => typeof n === 'number' && n >= 1 && n <= 30)
        : [],
      isCustomized: Boolean(rawPool?.isCustomized),
    };

    const rawGam = parsed.gamification;
    let streakDays =
      typeof rawGam?.streakDays === 'number' && rawGam.streakDays >= 1 ? rawGam.streakDays : 1;
    const lastActive = typeof rawGam?.lastActiveDate === 'string' ? rawGam.lastActiveDate : null;

    if (lastActive && lastActive !== today) {
      const gap = daysBetweenIso(lastActive, today);
      if (gap === 1) {
        streakDays += 1;
      } else if (gap > 1) {
        streakDays = 1;
      }
    }

    const gamification: GamificationState = {
      totalXp: typeof rawGam?.totalXp === 'number' ? Math.max(0, rawGam.totalXp) : 0,
      streakDays,
      lastActiveDate: today,
      solvedCount: typeof rawGam?.solvedCount === 'number' ? Math.max(0, rawGam.solvedCount) : 0,
      correctCount: typeof rawGam?.correctCount === 'number' ? Math.max(0, rawGam.correctCount) : 0,
      wrongQuestionIds: Array.isArray(rawGam?.wrongQuestionIds)
        ? rawGam.wrongQuestionIds.filter((id) => typeof id === 'string')
        : [],
      examHistory: Array.isArray(rawGam?.examHistory) ? rawGam.examHistory : [],
    };

    return { settings, studyPool, gamification };
  } catch {
    return {
      settings: DEFAULT_SETTINGS,
      studyPool: DEFAULT_STUDY_POOL,
      gamification: { ...DEFAULT_GAMIFICATION, lastActiveDate: today },
    };
  }
}

interface AppContextValue {
  // Kalıcı durumlar
  settings: AppSettings;
  studyPool: StudyPool;
  gamification: GamificationState;

  // Güncelleyiciler
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
  setStudyPool: (next: { selectedSurahs: number[]; selectedJuzs: number[] }) => void;

  // Navigasyon & Modallar
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isPoolModalOpen: boolean;
  openPoolModal: () => void;
  closePoolModal: () => void;
  isSettingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;

  // Çekirdek Veri Katmanı
  manifest: ManifestData | null;
  meta: MetaData | null;
  questionIndex: QuestionIndexFile | null;
  isLoadingCore: boolean;
  coreError: string | null;
  dataSourceMode: DataSourceMode;
  retryCoreLoad: () => void;
  activateDemoData: () => void;

  // Türetilmiş İstatistikler
  poolStats: PoolStatsSummary;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [persisted, setPersisted] = useState<PersistedAppState>(() => hydrateState());
  const [activeTab, setActiveTabState] = useState<NavTab>('home');
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [questionIndex, setQuestionIndex] = useState<QuestionIndexFile | null>(null);
  const [isLoadingCore, setIsLoadingCore] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('local');
  const [reloadTick, setReloadTick] = useState(0);

  // Kalıcı localStorage kaydı
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Depolama kotası dolu veya gizli sekme kısıtlıysa sessizce devam et
    }
  }, [persisted]);

  // Tema, yazı tipi ve SFX senkronizasyonu
  useEffect(() => {
    const root = document.documentElement;
    const { theme, arabicFont, turkishFont, sfxEnabled, sfxVolume } = persisted.settings;

    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    root.style.setProperty('--font-arabic', resolveArabicFontFamily(arabicFont));
    root.style.setProperty('--font-turkish', resolveTurkishFontStack(turkishFont));

    sfxService.configure(sfxEnabled, sfxVolume);
  }, [persisted.settings]);

  // Çekirdek veri dosyalarını paralel yükle
  useEffect(() => {
    let cancelled = false;

    async function loadCore() {
      setIsLoadingCore(true);
      setCoreError(null);
      try {
        const [manifestRes, metaRes, qIndexRes] = await Promise.all([
          dataService.getManifest(),
          dataService.getMeta(),
          dataService.getQuestionIndex(),
        ]);

        if (cancelled) return;
        setManifest(manifestRes);
        setMeta(metaRes);
        setQuestionIndex(qIndexRes);
        setDataSourceMode(dataService.getActiveDataSource());

        // Kullanıcı havuzu özelleştirmediyse q/index.json availableSurahs ile otomatik eşle
        if (qIndexRes.availableSurahs.length > 0) {
          setPersisted((prev) => {
            if (prev.studyPool.isCustomized) return prev;
            const sameLength =
              prev.studyPool.selectedSurahs.length === qIndexRes.availableSurahs.length;
            const sameItems =
              sameLength &&
              prev.studyPool.selectedSurahs.every((s, idx) => s === qIndexRes.availableSurahs[idx]);
            if (sameItems && prev.studyPool.selectedJuzs.length === 0) return prev;
            return {
              ...prev,
              studyPool: {
                selectedSurahs: [...qIndexRes.availableSurahs],
                selectedJuzs: [],
                isCustomized: false,
              },
            };
          });
        }
      } catch (err) {
        if (cancelled) return;
        setCoreError(
          err instanceof Error
            ? err.message
            : 'Kur’an ve meal verileri yüklenirken beklenmeyen bir ağ hatası oluştu.',
        );
      } finally {
        if (!cancelled) {
          setIsLoadingCore(false);
        }
      }
    }

    loadCore();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setPersisted((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch,
      },
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      settings: { ...DEFAULT_SETTINGS },
    }));
  }, []);

  const setStudyPool = useCallback((next: { selectedSurahs: number[]; selectedJuzs: number[] }) => {
    const cleanSurahs = Array.from(new Set(next.selectedSurahs)).sort((a, b) => a - b);
    const cleanJuzs = Array.from(new Set(next.selectedJuzs)).sort((a, b) => a - b);

    setPersisted((prev) => ({
      ...prev,
      studyPool: {
        selectedSurahs: cleanSurahs,
        selectedJuzs: cleanJuzs,
        isCustomized: true,
      },
    }));
  }, []);

  const setActiveTab = useCallback((tab: NavTab) => {
    sfxService.play('click');
    setActiveTabState(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openPoolModal = useCallback(() => {
    sfxService.play('click');
    setIsPoolModalOpen(true);
  }, []);

  const closePoolModal = useCallback(() => {
    setIsPoolModalOpen(false);
  }, []);

  const openSettingsModal = useCallback(() => {
    sfxService.play('click');
    setIsSettingsModalOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const retryCoreLoad = useCallback(() => {
    sfxService.play('click');
    dataService.disableDemoMode();
    setReloadTick((t) => t + 1);
  }, []);

  const activateDemoData = useCallback(() => {
    sfxService.play('click');
    dataService.enableDemoMode();
    setReloadTick((t) => t + 1);
  }, []);

  const poolStats = useMemo(
    () => computePoolStats(persisted.studyPool, meta, questionIndex),
    [persisted.studyPool, meta, questionIndex],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      settings: persisted.settings,
      studyPool: persisted.studyPool,
      gamification: persisted.gamification,
      updateSettings,
      resetSettings,
      setStudyPool,
      activeTab,
      setActiveTab,
      isPoolModalOpen,
      openPoolModal,
      closePoolModal,
      isSettingsModalOpen,
      openSettingsModal,
      closeSettingsModal,
      manifest,
      meta,
      questionIndex,
      isLoadingCore,
      coreError,
      dataSourceMode,
      retryCoreLoad,
      activateDemoData,
      poolStats,
    }),
    [
      persisted.settings,
      persisted.studyPool,
      persisted.gamification,
      updateSettings,
      resetSettings,
      setStudyPool,
      activeTab,
      setActiveTab,
      isPoolModalOpen,
      openPoolModal,
      closePoolModal,
      isSettingsModalOpen,
      openSettingsModal,
      closeSettingsModal,
      manifest,
      meta,
      questionIndex,
      isLoadingCore,
      coreError,
      dataSourceMode,
      retryCoreLoad,
      activateDemoData,
      poolStats,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppStore must be used inside AppProvider');
  }
  return ctx;
}
