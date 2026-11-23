import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ARABIC_FONTS,
  DEFAULT_ARABIC_FONT_LABEL,
  TURKISH_FONTS,
  resolveArabicFontFamily,
  resolveTurkishFontStack,
} from '../config/assetsConfig';
import {
  DEFAULT_FAVORITE_MEAL_IDS,
  DEFAULT_PRIMARY_MEAL_ID,
  DEFAULT_SECONDARY_MEAL_ID,
  findMealById,
} from '../config/mealsConfig';
import {
  DEFAULT_DESK_PREFS,
  sanitizeStudyDeskPrefs,
} from '../config/studyDeskConfig';
import { audioQueueService } from '../services/audioQueueService';
import { dataService, type DataSourceMode } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { wakeLockService } from '../services/wakeLockService';
import {
  STORAGE_QUOTA_EVENT,
  isAllPersistencePaused,
  setAllPersistencePaused,
} from '../utils/storageQuotaBus';
import type { QuickResearchSeed } from '../types/fihrist';
import type {
  MemorizeLaunchTarget,
  QuickMemorizeSeed,
} from '../types/memorization';
import type {
  AppSettings,
  AudioPlayMode,
  AudioPlaylist,
  AudioPlaylistItem,
  AudioPrefs,
  BookContentMode,
  DesktopCombinedLayout,
  DesktopPageLayout,
  ExamHistoryRecord,
  ExamMode,
  ExamNavigationTarget,
  FeedbackModalSeed,
  FihristNavigationTarget,
  GamificationState,
  LastReadPosition,
  ListeningDrawerSeed,
  ManifestData,
  MealDisplayMode,
  MealKey,
  MetaData,
  MushafLayout,
  NavTab,
  PageBookmark,
  PageBookmarkColor,
  PageLayoutMode,
  PersistedAppState,
  PlaylistItemType,
  PoolStatsSummary,
  QueueLoopOption,
  QuestionAuditState,
  QuestionIndexFile,
  QuestionIssueReason,
  QuestionIssueReport,
  ReaderContentMode,
  RepeatCountOption,
  StudyNavigationTarget,
  StudyPool,
  StudyPrefs,
  StudyProgress,
} from '../types/quran';
import { computePoolStats } from '../utils/poolUtils';
import {
  detectIosDevice,
  getDeferredInstallPrompt,
  getInitialOnlineStatus,
  isStandaloneMode,
  subscribeInstallPrompt,
  triggerPwaInstallPrompt,
} from '../utils/pwaUtils';
import {
  hasInitialDeepLinkTarget,
  isKnownAppSubroutePath,
  isReaderSubroutePath,
  parseInitialPathnameTarget,
  parseInitialUrlTarget,
} from '../utils/urlDeepLink';

export type UserGuideTabId = 'quickstart' | 'modules' | 'offline_backup' | 'shortcuts';

export const STORAGE_KEY = 'muallimun_meal_v1';
export const INTRO_DISMISSED_KEY = 'muallimun_intro_dismissed_v1';
export const SIDEBAR_COLLAPSED_KEY = 'muallimun_sidebar_collapsed_v1';
export const READING_DEFAULTS_MIGRATION_KEY = 'muallimun_reading_defaults_v2';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'cream',
  preferredMeal: 'm1',
  primaryMealId: DEFAULT_PRIMARY_MEAL_ID,
  secondaryMealId: DEFAULT_SECONDARY_MEAL_ID,
  mealDisplayMode: 'single',
  favoriteMealIds: [...DEFAULT_FAVORITE_MEAL_IDS],
  compareMealIds: [],
  arabicFont: DEFAULT_ARABIC_FONT_LABEL, // 'Şeyh Hamdullah Klasik'
  turkishFont: TURKISH_FONTS[0].label, // 'Plus Jakarta Sans'
  arabicFontSize: 28,
  turkishFontSize: 16,
  arabicTextDensity: 'balanced',
  sfxEnabled: true,
  sfxVolume: 0.75,
  showOptionLettersInApp: false,
  wordByWordEnabled: true,
  showFootnotes: true,
  highlightSajdah: true,
  keepScreenAwake: true,
  tajweedEnabled: false,
  showTajweedLegend: false,
  wordSyncEnabled: true,
  showRukuMarkers: true,
  readerContentMode: 'ar_meal',
  desktopPageLayout: 'single',
  desktopCombinedLayout: 'side_by_side',
  mushafLayout: 'mushaf_meal',
  deskPrefs: { ...DEFAULT_DESK_PREFS },
};

export const DEFAULT_STUDY_POOL: StudyPool = {
  selectedSurahs: [17, 24, 31, 49],
  selectedJuzs: [],
  isCustomized: false,
};

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  viewMode: 'mushaf',
  wordMode: 'off',
  bookContentMode: 'interleaved',
  mealAudioFocusOnly: false,
  pageLayout: 'double_meal',
  mushafSidePanelOpen: true,
};

export const DEFAULT_STUDY_PROGRESS: StudyProgress = {
  lastRead: null,
  bookmarkedAyahIds: [],
  pageBookmarks: [],
};

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  mode: 'ar',
  arabicAudioSource: 'maher_al_muaiqly',
  arabicReciterId: 'maher_al_muaiqly',
  favoriteReciterIds: ['maher_al_muaiqly'],
  mealAudioSource: 'tdv',
  playbackRate: 1,
  repeatCount: 1,
  queueLoop: 1,
  autoScroll: true,
  showTextOnStart: true,
};

function createDefaultAudioPlaylists(): AudioPlaylist[] {
  const now = new Date().toISOString();
  const shortSurahs: { no: number; name: string }[] = [
    { no: 93, name: 'Duhâ Suresi' },
    { no: 94, name: 'İnşirâh Suresi' },
    { no: 95, name: 'Tîn Suresi' },
    { no: 96, name: 'Alak Suresi' },
    { no: 97, name: 'Kadir Suresi' },
    { no: 98, name: 'Beyyine Suresi' },
    { no: 99, name: 'Zilzâl Suresi' },
    { no: 100, name: 'Âdiyât Suresi' },
    { no: 101, name: 'Kâria Suresi' },
    { no: 102, name: 'Tekâsür Suresi' },
    { no: 103, name: 'Asr Suresi' },
    { no: 104, name: 'Hümeze Suresi' },
    { no: 105, name: 'Fîl Suresi' },
    { no: 106, name: 'Kureyş Suresi' },
    { no: 107, name: 'Mâûn Suresi' },
    { no: 108, name: 'Kevser Suresi' },
    { no: 109, name: 'Kâfirûn Suresi' },
    { no: 110, name: 'Nasr Suresi' },
    { no: 111, name: 'Tebbet Suresi' },
    { no: 112, name: 'İhlâs Suresi' },
    { no: 113, name: 'Felak Suresi' },
    { no: 114, name: 'Nâs Suresi' },
  ];

  return [
    {
      id: 'preset_yasin_mulk_nebe',
      name: 'Yâsîn · Mülk · Nebe',
      isPreset: true,
      createdAt: now,
      updatedAt: now,
      items: [
        { id: 'p1_s36', type: 'surah', label: 'Yâsîn Suresi', surah: 36 },
        { id: 'p1_s67', type: 'surah', label: 'Mülk Suresi', surah: 67 },
        { id: 'p1_s78', type: 'surah', label: 'Nebe Suresi', surah: 78 },
      ],
    },
    {
      id: 'preset_namaz_kisa_sureler',
      name: 'Namaz & Kısa Sureler (Duhâ–Nâs)',
      isPreset: true,
      createdAt: now,
      updatedAt: now,
      items: shortSurahs.map((s) => ({
        id: `p2_s${s.no}`,
        type: 'surah' as const,
        label: s.name,
        surah: s.no,
      })),
    },
    {
      id: 'preset_sifa_korunma',
      name: 'Seçme Aşırlar',
      isPreset: true,
      createdAt: now,
      updatedAt: now,
      items: [
        { id: 'p3_fatiha', type: 'surah', label: 'Fâtiha Suresi', surah: 1 },
        {
          id: 'p3_kursi',
          type: 'ayah_range',
          label: "Âyetü'l-Kürsî (Bakara 255)",
          surah: 2,
          startAyah: 255,
          endAyah: 255,
        },
        {
          id: 'p3_amenerrasulu',
          type: 'ayah_range',
          label: 'Âmenerrasûlü (Bakara 285–286)',
          surah: 2,
          startAyah: 285,
          endAyah: 286,
        },
        {
          id: 'p3_huvallahullezi',
          type: 'ayah_range',
          label: 'Hüvallâhüllezî (Haşr 22–24)',
          surah: 59,
          startAyah: 22,
          endAyah: 24,
        },
        { id: 'p3_ihlas', type: 'surah', label: 'İhlâs Suresi', surah: 112 },
        { id: 'p3_felak', type: 'surah', label: 'Felak Suresi', surah: 113 },
        { id: 'p3_nas', type: 'surah', label: 'Nâs Suresi', surah: 114 },
      ],
    },
  ];
}

function isValidRepeatCount(val: unknown): val is RepeatCountOption {
  return val === 1 || val === 2 || val === 3 || val === 5 || val === 10 || val === 'infinite';
}

function isValidQueueLoop(val: unknown): val is QueueLoopOption {
  return val === 1 || val === 2 || val === 3 || val === 5 || val === 10 || val === 'infinite';
}

export function computeMushafLayout(
  contentMode: ReaderContentMode,
  desktopPageLayout: DesktopPageLayout,
  desktopCombinedLayout: DesktopCombinedLayout,
): MushafLayout {
  if (contentMode === 'ar_only') {
    return desktopPageLayout === 'dual' ? 'dual' : 'single';
  }
  if (contentMode === 'meal_only') {
    return desktopPageLayout === 'dual' ? 'meal_dual' : 'meal_only';
  }
  return desktopCombinedLayout === 'rahle_dual' ? 'rahle_dual' : 'mushaf_meal';
}

export function readerContentToBookMode(mode: ReaderContentMode): BookContentMode {
  if (mode === 'ar_only') return 'ar_only';
  if (mode === 'meal_only') return 'meal_only';
  return 'interleaved';
}

export function bookModeToReaderContent(mode: BookContentMode): ReaderContentMode {
  if (mode === 'ar_only') return 'ar_only';
  if (mode === 'meal_only') return 'meal_only';
  return 'ar_meal';
}

export function mushafLayoutToLegacyPageLayout(layout: MushafLayout): PageLayoutMode {
  switch (layout) {
    case 'dual':
    case 'rahle_dual':
      return 'double_mushaf';
    case 'mushaf_meal':
      return 'double_meal';
    case 'meal_only':
    case 'meal_dual':
      return 'meal_only';
    case 'single':
    default:
      return 'single';
  }
}

function deriveStageFromLayoutToken(
  token: string,
  fallbackPageLayout: DesktopPageLayout = 'single',
  fallbackCombinedLayout: DesktopCombinedLayout = 'side_by_side',
): {
  readerContentMode: ReaderContentMode;
  desktopPageLayout: DesktopPageLayout;
  desktopCombinedLayout: DesktopCombinedLayout;
  mushafLayout: MushafLayout;
} | null {
  switch (token) {
    case 'single':
      return {
        readerContentMode: 'ar_only',
        desktopPageLayout: 'single',
        desktopCombinedLayout: fallbackCombinedLayout,
        mushafLayout: 'single',
      };
    case 'dual':
    case 'double_mushaf':
    case 'double':
      return {
        readerContentMode: 'ar_only',
        desktopPageLayout: 'dual',
        desktopCombinedLayout: fallbackCombinedLayout,
        mushafLayout: 'dual',
      };
    case 'mushaf_meal':
    case 'double_meal':
      return {
        readerContentMode: 'ar_meal',
        desktopPageLayout: fallbackPageLayout,
        desktopCombinedLayout: 'side_by_side',
        mushafLayout: 'mushaf_meal',
      };
    case 'rahle_dual':
      return {
        readerContentMode: 'ar_meal',
        desktopPageLayout: fallbackPageLayout,
        desktopCombinedLayout: 'rahle_dual',
        mushafLayout: 'rahle_dual',
      };
    case 'meal_only':
      return {
        readerContentMode: 'meal_only',
        desktopPageLayout: 'single',
        desktopCombinedLayout: fallbackCombinedLayout,
        mushafLayout: 'meal_only',
      };
    case 'meal_dual':
      return {
        readerContentMode: 'meal_only',
        desktopPageLayout: 'dual',
        desktopCombinedLayout: fallbackCombinedLayout,
        mushafLayout: 'meal_dual',
      };
    default:
      return null;
  }
}

function resolveAudioModeForContent(contentMode: ReaderContentMode): AudioPlayMode {
  if (contentMode === 'ar_only') return 'ar';
  if (contentMode === 'meal_only') return 'meal';
  return 'ar_then_meal';
}

function resolveAudioModeForStudyPrefs(
  prefs: StudyPrefs,
  readerContentMode?: ReaderContentMode,
): AudioPlayMode {
  if (readerContentMode) {
    return resolveAudioModeForContent(readerContentMode);
  }
  if (prefs.viewMode === 'mushaf') {
    if (prefs.pageLayout === 'double_meal') return 'ar_then_meal';
    if (prefs.pageLayout === 'meal_only') return 'meal';
    return 'ar';
  }
  if (prefs.bookContentMode === 'ar_only') return 'ar';
  if (prefs.bookContentMode === 'meal_only') return 'meal';
  return 'ar_then_meal';
}

export const DEFAULT_GAMIFICATION: GamificationState = {
  totalXp: 0,
  streakDays: 1,
  lastActiveDate: null,
  solvedCount: 0,
  correctCount: 0,
  wrongQuestionIds: [],
  bookmarkedQuestionIds: [],
  masteredQuestionIds: [],
  solvedQuestionUids: [],
  examHistory: [],
};

export const DEFAULT_QUESTION_AUDIT: QuestionAuditState = {
  reports: {},
  skipReportedInExams: true,
};

export interface RecordExamResultInput {
  id: string;
  mode: ExamMode;
  surahs: number[];
  totalQuestions: number;
  correctUids: string[];
  wrongUids: string[];
  blankCount: number;
  durationSec: number;
  maxStreak: number;
  isMistakeCamp?: boolean;
}

export interface RecordExamResultOutput {
  earnedXp: number;
  newlyMasteredCount: number;
  scorePct: number;
}

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

function createDefaultState(today: string): PersistedAppState {
  return {
    settings: DEFAULT_SETTINGS,
    studyPool: DEFAULT_STUDY_POOL,
    studyPrefs: DEFAULT_STUDY_PREFS,
    studyProgress: DEFAULT_STUDY_PROGRESS,
    audioPrefs: DEFAULT_AUDIO_PREFS,
    audioPlaylists: createDefaultAudioPlaylists(),
    gamification: { ...DEFAULT_GAMIFICATION, lastActiveDate: today },
    questionAudit: DEFAULT_QUESTION_AUDIT,
  };
}

function hydrateState(): PersistedAppState {
  const today = getTodayIsoDate();

  if (typeof window === 'undefined') {
    return createDefaultState(today);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    let hasReadingDefaultsMigrationV2 = false;
    try {
      hasReadingDefaultsMigrationV2 =
        window.localStorage.getItem(READING_DEFAULTS_MIGRATION_KEY) === '1';
    } catch {
      hasReadingDefaultsMigrationV2 = false;
    }

    if (!raw) {
      if (!hasReadingDefaultsMigrationV2) {
        try {
          window.localStorage.setItem(READING_DEFAULTS_MIGRATION_KEY, '1');
        } catch {
          // Gizli mod / kota kısıtında sessizce devam et
        }
      }
      return createDefaultState(today);
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    const rawSettings = parsed.settings ?? ({} as Partial<AppSettings>);
    const validArabicFont = ARABIC_FONTS.some((f) => f.label === rawSettings.arabicFont)
      ? (rawSettings.arabicFont as string)
      : DEFAULT_SETTINGS.arabicFont;
    const validTurkishFont = TURKISH_FONTS.some((f) => f.label === rawSettings.turkishFont)
      ? (rawSettings.turkishFont as string)
      : DEFAULT_SETTINGS.turkishFont;

    const hydratedLegacyMeal: MealKey | 'both' =
      rawSettings.preferredMeal === 'm1' ||
      rawSettings.preferredMeal === 'm2' ||
      rawSettings.preferredMeal === 'both'
        ? rawSettings.preferredMeal
        : DEFAULT_SETTINGS.preferredMeal;

    const hydratedPrimaryMealId =
      typeof rawSettings.primaryMealId === 'string' && rawSettings.primaryMealId.trim()
        ? rawSettings.primaryMealId.trim()
        : hydratedLegacyMeal === 'm2'
          ? 'm2'
          : DEFAULT_PRIMARY_MEAL_ID;

    const hydratedSecondaryMealId =
      typeof rawSettings.secondaryMealId === 'string' && rawSettings.secondaryMealId.trim()
        ? rawSettings.secondaryMealId.trim()
        : hydratedPrimaryMealId === 'm2'
          ? 'm1'
          : DEFAULT_SECONDARY_MEAL_ID;

    const hydratedMealDisplayMode: MealDisplayMode =
      rawSettings.mealDisplayMode === 'single' || rawSettings.mealDisplayMode === 'dual'
        ? rawSettings.mealDisplayMode
        : hydratedLegacyMeal === 'both'
          ? 'dual'
          : 'single';

    const hydratedFavoriteMealIds = Array.isArray(rawSettings.favoriteMealIds)
      ? Array.from(
          new Set(
            rawSettings.favoriteMealIds.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0,
            ),
          ),
        )
      : [...DEFAULT_FAVORITE_MEAL_IDS];

    const hydratedCompareMealIds = Array.isArray(rawSettings.compareMealIds)
      ? Array.from(
          new Set(
            rawSettings.compareMealIds.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0,
            ),
          ),
        )
      : [];

    const syncedPreferredMeal: MealKey | 'both' =
      hydratedMealDisplayMode === 'dual'
        ? 'both'
        : hydratedPrimaryMealId === 'm2'
          ? 'm2'
          : 'm1';

    const settings: AppSettings = {
      theme:
        rawSettings.theme === 'light' ||
        rawSettings.theme === 'cream' ||
        rawSettings.theme === 'dark'
          ? rawSettings.theme
          : DEFAULT_SETTINGS.theme,
      preferredMeal: syncedPreferredMeal,
      primaryMealId: hydratedPrimaryMealId,
      secondaryMealId: hydratedSecondaryMealId,
      mealDisplayMode: hydratedMealDisplayMode,
      favoriteMealIds: hydratedFavoriteMealIds,
      compareMealIds: hydratedCompareMealIds,
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
      arabicTextDensity:
        rawSettings.arabicTextDensity === 'compact' ||
        rawSettings.arabicTextDensity === 'balanced' ||
        rawSettings.arabicTextDensity === 'relaxed'
          ? rawSettings.arabicTextDensity
          : DEFAULT_SETTINGS.arabicTextDensity,
      wordByWordEnabled:
        typeof rawSettings.wordByWordEnabled === 'boolean'
          ? rawSettings.wordByWordEnabled
          : DEFAULT_SETTINGS.wordByWordEnabled,
      showFootnotes:
        typeof rawSettings.showFootnotes === 'boolean'
          ? rawSettings.showFootnotes
          : DEFAULT_SETTINGS.showFootnotes,
      highlightSajdah:
        typeof rawSettings.highlightSajdah === 'boolean'
          ? rawSettings.highlightSajdah
          : DEFAULT_SETTINGS.highlightSajdah,
      keepScreenAwake:
        typeof rawSettings.keepScreenAwake === 'boolean'
          ? rawSettings.keepScreenAwake
          : DEFAULT_SETTINGS.keepScreenAwake,
      tajweedEnabled:
        typeof rawSettings.tajweedEnabled === 'boolean'
          ? rawSettings.tajweedEnabled
          : DEFAULT_SETTINGS.tajweedEnabled,
      showTajweedLegend:
        typeof rawSettings.showTajweedLegend === 'boolean'
          ? rawSettings.showTajweedLegend
          : DEFAULT_SETTINGS.showTajweedLegend,
      wordSyncEnabled:
        typeof rawSettings.wordSyncEnabled === 'boolean'
          ? rawSettings.wordSyncEnabled
          : DEFAULT_SETTINGS.wordSyncEnabled,
      showRukuMarkers:
        typeof rawSettings.showRukuMarkers === 'boolean'
          ? rawSettings.showRukuMarkers
          : DEFAULT_SETTINGS.showRukuMarkers,
      readerContentMode: DEFAULT_SETTINGS.readerContentMode,
      desktopPageLayout: DEFAULT_SETTINGS.desktopPageLayout,
      desktopCombinedLayout: DEFAULT_SETTINGS.desktopCombinedLayout,
      mushafLayout: DEFAULT_SETTINGS.mushafLayout,
      deskPrefs: sanitizeStudyDeskPrefs(rawSettings.deskPrefs),
    };

    // Tek seferlik güvenli varsayılan okuma ayarları migrasyonu (v2):
    // Mevcut kullanıcıları bir kez yeni varsayılanlara taşır; sonraki tüm tercihler korunur.
    if (!hasReadingDefaultsMigrationV2) {
      settings.tajweedEnabled = DEFAULT_SETTINGS.tajweedEnabled;
      settings.arabicFont = DEFAULT_SETTINGS.arabicFont;
      settings.arabicFontSize = DEFAULT_SETTINGS.arabicFontSize;
      try {
        window.localStorage.setItem(READING_DEFAULTS_MIGRATION_KEY, '1');
      } catch {
        // Gizli mod / kota kısıtında sessizce devam et
      }
    }

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

    const rawStudyPrefs = parsed.studyPrefs as
      | (Omit<Partial<StudyPrefs>, 'pageLayout'> & { pageLayout?: string })
      | undefined;
    const hydratedViewMode: StudyPrefs['viewMode'] =
      rawStudyPrefs?.viewMode === 'mushaf' ||
      rawStudyPrefs?.viewMode === 'cards' ||
      rawStudyPrefs?.viewMode === 'book'
        ? rawStudyPrefs.viewMode
        : DEFAULT_STUDY_PREFS.viewMode;

    // İki Aşamalı İçerik & Sahne Mimarisi: Eski localStorage/yedek kayıtlarından kayıpsız eşleme
    const rawSettingsExt = rawSettings as Partial<AppSettings> & {
      readerContentMode?: string;
      desktopPageLayout?: string;
      desktopCombinedLayout?: string;
      mushafLayout?: string;
    };
    const hasExplicitContentMode =
      rawSettingsExt.readerContentMode === 'ar_only' ||
      rawSettingsExt.readerContentMode === 'ar_meal' ||
      rawSettingsExt.readerContentMode === 'meal_only';
    const explicitDesktopPage: DesktopPageLayout =
      rawSettingsExt.desktopPageLayout === 'dual' ? 'dual' : 'single';
    const explicitDesktopCombined: DesktopCombinedLayout =
      rawSettingsExt.desktopCombinedLayout === 'rahle_dual' ? 'rahle_dual' : 'side_by_side';

    let resolvedStage: {
      readerContentMode: ReaderContentMode;
      desktopPageLayout: DesktopPageLayout;
      desktopCombinedLayout: DesktopCombinedLayout;
      mushafLayout: MushafLayout;
    };

    if (hasExplicitContentMode) {
      const contentMode = rawSettingsExt.readerContentMode as ReaderContentMode;
      resolvedStage = {
        readerContentMode: contentMode,
        desktopPageLayout: explicitDesktopPage,
        desktopCombinedLayout: explicitDesktopCombined,
        mushafLayout: computeMushafLayout(contentMode, explicitDesktopPage, explicitDesktopCombined),
      };
    } else if (typeof rawSettingsExt.mushafLayout === 'string') {
      const derived = deriveStageFromLayoutToken(
        rawSettingsExt.mushafLayout,
        explicitDesktopPage,
        explicitDesktopCombined,
      );
      resolvedStage = derived ?? {
        readerContentMode: DEFAULT_SETTINGS.readerContentMode,
        desktopPageLayout: DEFAULT_SETTINGS.desktopPageLayout,
        desktopCombinedLayout: DEFAULT_SETTINGS.desktopCombinedLayout,
        mushafLayout: DEFAULT_SETTINGS.mushafLayout,
      };
    } else if (hydratedViewMode === 'mushaf' && typeof rawStudyPrefs?.pageLayout === 'string') {
      const derived = deriveStageFromLayoutToken(rawStudyPrefs.pageLayout);
      resolvedStage = derived ?? {
        readerContentMode: DEFAULT_SETTINGS.readerContentMode,
        desktopPageLayout: DEFAULT_SETTINGS.desktopPageLayout,
        desktopCombinedLayout: DEFAULT_SETTINGS.desktopCombinedLayout,
        mushafLayout: DEFAULT_SETTINGS.mushafLayout,
      };
    } else if (
      rawStudyPrefs?.bookContentMode === 'ar_only' ||
      rawStudyPrefs?.bookContentMode === 'meal_only' ||
      rawStudyPrefs?.bookContentMode === 'interleaved'
    ) {
      const contentMode = bookModeToReaderContent(rawStudyPrefs.bookContentMode);
      const legacyDual: DesktopPageLayout =
        rawStudyPrefs.pageLayout === 'double_mushaf' || rawStudyPrefs.pageLayout === 'double'
          ? 'dual'
          : 'single';
      resolvedStage = {
        readerContentMode: contentMode,
        desktopPageLayout: legacyDual,
        desktopCombinedLayout: 'side_by_side',
        mushafLayout: computeMushafLayout(contentMode, legacyDual, 'side_by_side'),
      };
    } else {
      resolvedStage = {
        readerContentMode: DEFAULT_SETTINGS.readerContentMode,
        desktopPageLayout: DEFAULT_SETTINGS.desktopPageLayout,
        desktopCombinedLayout: DEFAULT_SETTINGS.desktopCombinedLayout,
        mushafLayout: DEFAULT_SETTINGS.mushafLayout,
      };
    }

    settings.readerContentMode = resolvedStage.readerContentMode;
    settings.desktopPageLayout = resolvedStage.desktopPageLayout;
    settings.desktopCombinedLayout = resolvedStage.desktopCombinedLayout;
    settings.mushafLayout = resolvedStage.mushafLayout;

    const studyPrefs: StudyPrefs = {
      viewMode: hydratedViewMode,
      wordMode:
        rawStudyPrefs?.wordMode === 'off' ||
        rawStudyPrefs?.wordMode === 'visible' ||
        rawStudyPrefs?.wordMode === 'quiz'
          ? rawStudyPrefs.wordMode
          : DEFAULT_STUDY_PREFS.wordMode,
      bookContentMode: readerContentToBookMode(resolvedStage.readerContentMode),
      mealAudioFocusOnly:
        typeof rawStudyPrefs?.mealAudioFocusOnly === 'boolean'
          ? rawStudyPrefs.mealAudioFocusOnly
          : DEFAULT_STUDY_PREFS.mealAudioFocusOnly,
      pageLayout: mushafLayoutToLegacyPageLayout(resolvedStage.mushafLayout),
      mushafSidePanelOpen:
        typeof rawStudyPrefs?.mushafSidePanelOpen === 'boolean'
          ? rawStudyPrefs.mushafSidePanelOpen
          : DEFAULT_STUDY_PREFS.mushafSidePanelOpen,
    };

    const rawProgress = parsed.studyProgress;
    const rawLast = rawProgress?.lastRead;
    const lastRead: LastReadPosition | null =
      rawLast &&
      typeof rawLast.surah === 'number' &&
      typeof rawLast.ayah === 'number' &&
      typeof rawLast.page === 'number'
        ? {
            surah: rawLast.surah,
            ayah: rawLast.ayah,
            page: rawLast.page,
            viewMode:
              rawLast.viewMode === 'mushaf' ||
              rawLast.viewMode === 'cards' ||
              rawLast.viewMode === 'book'
                ? rawLast.viewMode
                : 'mushaf',
            updatedAt:
              typeof rawLast.updatedAt === 'string'
                ? rawLast.updatedAt
                : new Date().toISOString(),
          }
        : null;

    const validColors: PageBookmarkColor[] = ['emerald', 'amber', 'rose', 'indigo'];
    const rawPageBookmarks = Array.isArray(rawProgress?.pageBookmarks)
      ? rawProgress.pageBookmarks
      : [];
    const hydratedPageBookmarks: PageBookmark[] = [];
    const seenBookmarkIds = new Set<string>();
    for (const item of rawPageBookmarks) {
      if (!item || typeof item !== 'object') continue;
      const b = item as Partial<PageBookmark>;
      if (typeof b.page !== 'number' || b.page < 0 || b.page > 604) continue;
      const id =
        typeof b.id === 'string' && b.id.trim()
          ? b.id.trim()
          : b.isHatim
            ? 'hatim'
            : `bm_p${b.page}_${hydratedPageBookmarks.length}`;
      if (seenBookmarkIds.has(id)) continue;
      seenBookmarkIds.add(id);
      hydratedPageBookmarks.push({
        id,
        page: b.page,
        surah: typeof b.surah === 'number' && b.surah >= 1 && b.surah <= 114 ? b.surah : 1,
        ayah: typeof b.ayah === 'number' && b.ayah >= 1 ? b.ayah : 1,
        label:
          typeof b.label === 'string' && b.label.trim()
            ? b.label.trim()
            : b.isHatim
              ? 'Hatim Ayracım'
              : `Sayfa ${b.page}`,
        color: validColors.includes(b.color as PageBookmarkColor)
          ? (b.color as PageBookmarkColor)
          : b.isHatim
            ? 'emerald'
            : 'amber',
        isHatim: Boolean(b.isHatim),
        updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : new Date().toISOString(),
      });
    }

    const studyProgress: StudyProgress = {
      lastRead,
      bookmarkedAyahIds: Array.isArray(rawProgress?.bookmarkedAyahIds)
        ? Array.from(
            new Set(
              rawProgress.bookmarkedAyahIds.filter(
                (id): id is number => typeof id === 'number' && id > 0,
              ),
            ),
          )
        : [],
      pageBookmarks: hydratedPageBookmarks,
    };

    const rawAudio = parsed.audioPrefs;
    const hydratedReciterId =
      typeof rawAudio?.arabicReciterId === 'string' && rawAudio.arabicReciterId.trim()
        ? rawAudio.arabicReciterId.trim()
        : typeof rawAudio?.arabicAudioSource === 'string' && rawAudio.arabicAudioSource.trim()
          ? rawAudio.arabicAudioSource.trim()
          : DEFAULT_AUDIO_PREFS.arabicReciterId;

    const hydratedFavoriteReciters = Array.isArray(rawAudio?.favoriteReciterIds)
      ? Array.from(
          new Set(
            rawAudio.favoriteReciterIds.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0,
            ),
          ),
        )
      : [...DEFAULT_AUDIO_PREFS.favoriteReciterIds];

    const audioPrefs: AudioPrefs = {
      mode:
        rawAudio?.mode === 'ar' ||
        rawAudio?.mode === 'meal' ||
        rawAudio?.mode === 'ar_then_meal'
          ? rawAudio.mode
          : DEFAULT_AUDIO_PREFS.mode,
      arabicAudioSource: hydratedReciterId,
      arabicReciterId: hydratedReciterId,
      favoriteReciterIds: hydratedFavoriteReciters,
      mealAudioSource:
        typeof rawAudio?.mealAudioSource === 'string' && rawAudio.mealAudioSource.trim()
          ? rawAudio.mealAudioSource.trim()
          : DEFAULT_AUDIO_PREFS.mealAudioSource,
      playbackRate:
        rawAudio?.playbackRate === 0.75 ||
        rawAudio?.playbackRate === 1 ||
        rawAudio?.playbackRate === 1.25 ||
        rawAudio?.playbackRate === 1.5
          ? rawAudio.playbackRate
          : DEFAULT_AUDIO_PREFS.playbackRate,
      repeatCount: isValidRepeatCount(rawAudio?.repeatCount)
        ? rawAudio.repeatCount
        : DEFAULT_AUDIO_PREFS.repeatCount,
      queueLoop: isValidQueueLoop(rawAudio?.queueLoop)
        ? rawAudio.queueLoop
        : DEFAULT_AUDIO_PREFS.queueLoop,
      autoScroll:
        typeof rawAudio?.autoScroll === 'boolean'
          ? rawAudio.autoScroll
          : DEFAULT_AUDIO_PREFS.autoScroll,
      showTextOnStart:
        typeof rawAudio?.showTextOnStart === 'boolean'
          ? rawAudio.showTextOnStart
          : DEFAULT_AUDIO_PREFS.showTextOnStart,
    };

    const validPlaylistItemTypes: PlaylistItemType[] = [
      'surah',
      'page_range',
      'juz',
      'ayah_range',
    ];
    let audioPlaylists: AudioPlaylist[];
    if (Array.isArray(parsed.audioPlaylists)) {
      const cleaned: AudioPlaylist[] = [];
      const seenPlaylistIds = new Set<string>();
      for (const rawPl of parsed.audioPlaylists) {
        if (!rawPl || typeof rawPl !== 'object') continue;
        const pl = rawPl as Partial<AudioPlaylist>;
        const plId =
          typeof pl.id === 'string' && pl.id.trim()
            ? pl.id.trim()
            : `pl_${cleaned.length}_${Date.now()}`;
        if (seenPlaylistIds.has(plId)) continue;
        seenPlaylistIds.add(plId);
        const rawName =
          typeof pl.name === 'string' && pl.name.trim() ? pl.name.trim() : 'Çalma Listesi';
        const name =
          plId === 'preset_sifa_korunma' && /Korunma/i.test(rawName) ? 'Seçme Aşırlar' : rawName;
        const rawItems = Array.isArray(pl.items) ? pl.items : [];
        const items: AudioPlaylistItem[] = [];
        for (let idx = 0; idx < rawItems.length; idx += 1) {
          const it = rawItems[idx] as Partial<AudioPlaylistItem> | null;
          if (!it || typeof it !== 'object') continue;
          if (!validPlaylistItemTypes.includes(it.type as PlaylistItemType)) continue;
          items.push({
            id:
              typeof it.id === 'string' && it.id.trim()
                ? it.id.trim()
                : `${plId}_item_${idx}`,
            type: it.type as PlaylistItemType,
            label: typeof it.label === 'string' && it.label.trim() ? it.label.trim() : 'Bölüm',
            surah: typeof it.surah === 'number' ? it.surah : undefined,
            startAyah: typeof it.startAyah === 'number' ? it.startAyah : undefined,
            endAyah: typeof it.endAyah === 'number' ? it.endAyah : undefined,
            startPage: typeof it.startPage === 'number' ? it.startPage : undefined,
            endPage: typeof it.endPage === 'number' ? it.endPage : undefined,
            juz: typeof it.juz === 'number' ? it.juz : undefined,
          });
        }
        cleaned.push({
          id: plId,
          name,
          items,
          createdAt: typeof pl.createdAt === 'string' ? pl.createdAt : new Date().toISOString(),
          updatedAt: typeof pl.updatedAt === 'string' ? pl.updatedAt : new Date().toISOString(),
          isPreset: Boolean(pl.isPreset),
        });
      }
      audioPlaylists = cleaned;
    } else {
      audioPlaylists = createDefaultAudioPlaylists();
    }

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

    const rawHistory = Array.isArray(rawGam?.examHistory) ? rawGam.examHistory : [];
    const normalizedHistory: ExamHistoryRecord[] = rawHistory
      .slice(0, 25)
      .map((entry, idx) => {
        const legacy = entry as Partial<ExamHistoryRecord> & {
          correctCount?: number;
          wrongCount?: number;
          xpEarned?: number;
          durationSeconds?: number;
        };
        const total = typeof legacy.totalQuestions === 'number' ? Math.max(0, legacy.totalQuestions) : 0;
        const correct =
          typeof legacy.correct === 'number'
            ? legacy.correct
            : typeof legacy.correctCount === 'number'
              ? legacy.correctCount
              : 0;
        const wrong =
          typeof legacy.wrong === 'number'
            ? legacy.wrong
            : typeof legacy.wrongCount === 'number'
              ? legacy.wrongCount
              : 0;
        const blank =
          typeof legacy.blank === 'number'
            ? legacy.blank
            : Math.max(0, total - correct - wrong);
        const scorePct =
          typeof legacy.scorePct === 'number'
            ? legacy.scorePct
            : total > 0
              ? Math.round((correct / total) * 100)
              : 0;
        const earnedXp =
          typeof legacy.earnedXp === 'number'
            ? legacy.earnedXp
            : typeof legacy.xpEarned === 'number'
              ? legacy.xpEarned
              : 0;
        const durationSec =
          typeof legacy.durationSec === 'number'
            ? legacy.durationSec
            : typeof legacy.durationSeconds === 'number'
              ? legacy.durationSeconds
              : 0;
        const mode: ExamMode =
          legacy.mode === 'practice' || legacy.mode === 'arena' || legacy.mode === 'mock'
            ? legacy.mode
            : 'practice';

        return {
          id: typeof legacy.id === 'string' ? legacy.id : `exam_legacy_${idx}`,
          date: typeof legacy.date === 'string' ? legacy.date : new Date().toISOString(),
          mode,
          surahs: Array.isArray(legacy.surahs)
            ? legacy.surahs.filter((n): n is number => typeof n === 'number')
            : [],
          totalQuestions: total,
          correct,
          wrong,
          blank,
          scorePct,
          earnedXp,
          durationSec,
          isMistakeCamp: Boolean(legacy.isMistakeCamp),
        };
      });

    const gamification: GamificationState = {
      totalXp: typeof rawGam?.totalXp === 'number' ? Math.max(0, rawGam.totalXp) : 0,
      streakDays,
      lastActiveDate: today,
      solvedCount: typeof rawGam?.solvedCount === 'number' ? Math.max(0, rawGam.solvedCount) : 0,
      correctCount: typeof rawGam?.correctCount === 'number' ? Math.max(0, rawGam.correctCount) : 0,
      wrongQuestionIds: Array.isArray(rawGam?.wrongQuestionIds)
        ? Array.from(
            new Set(rawGam.wrongQuestionIds.filter((id): id is string => typeof id === 'string')),
          )
        : [],
      bookmarkedQuestionIds: Array.isArray(rawGam?.bookmarkedQuestionIds)
        ? Array.from(
            new Set(
              rawGam.bookmarkedQuestionIds.filter((id): id is string => typeof id === 'string'),
            ),
          )
        : [],
      masteredQuestionIds: Array.isArray(rawGam?.masteredQuestionIds)
        ? Array.from(
            new Set(
              rawGam.masteredQuestionIds.filter((id): id is string => typeof id === 'string'),
            ),
          )
        : [],
      solvedQuestionUids: Array.isArray(rawGam?.solvedQuestionUids)
        ? Array.from(
            new Set(
              rawGam.solvedQuestionUids.filter((id): id is string => typeof id === 'string'),
            ),
          )
        : [],
      examHistory: normalizedHistory,
    };

    const rawAudit = parsed.questionAudit;
    const validReasons: QuestionIssueReason[] = [
      'logic_contradiction',
      'language_typo',
      'option_answer_error',
      'other',
    ];
    const cleanReports: Record<string, QuestionIssueReport> = {};
    if (rawAudit && rawAudit.reports && typeof rawAudit.reports === 'object') {
      for (const [key, item] of Object.entries(rawAudit.reports)) {
        if (!item || typeof item !== 'object') continue;
        const r = item as Partial<QuestionIssueReport>;
        const uid = typeof r.uid === 'string' && r.uid.trim() ? r.uid.trim() : key;
        if (!uid) continue;
        cleanReports[uid] = {
          uid,
          id: typeof r.id === 'string' ? r.id : uid,
          surah: typeof r.surah === 'number' ? r.surah : 0,
          sourceRef: typeof r.sourceRef === 'string' ? r.sourceRef : '',
          verseRefs: Array.isArray(r.verseRefs)
            ? r.verseRefs.filter((v): v is number => typeof v === 'number')
            : [],
          reason: validReasons.includes(r.reason as QuestionIssueReason)
            ? (r.reason as QuestionIssueReason)
            : 'other',
          note: typeof r.note === 'string' ? r.note : '',
          stemSnippet: typeof r.stemSnippet === 'string' ? r.stemSnippet : '',
          reportedAt:
            typeof r.reportedAt === 'string' ? r.reportedAt : new Date().toISOString(),
        };
      }
    }

    const questionAudit: QuestionAuditState = {
      reports: cleanReports,
      skipReportedInExams:
        typeof rawAudit?.skipReportedInExams === 'boolean'
          ? rawAudit.skipReportedInExams
          : DEFAULT_QUESTION_AUDIT.skipReportedInExams,
    };

    return {
      settings,
      studyPool,
      studyPrefs,
      studyProgress,
      audioPrefs,
      audioPlaylists,
      gamification,
      questionAudit,
    };
  } catch {
    return createDefaultState(today);
  }
}

interface AppContextValue {
  // Kalıcı durumlar
  settings: AppSettings;
  studyPool: StudyPool;
  studyPrefs: StudyPrefs;
  studyProgress: StudyProgress;
  audioPrefs: AudioPrefs;
  audioPlaylists: AudioPlaylist[];
  gamification: GamificationState;
  questionAudit: QuestionAuditState;

  // Güncelleyiciler
  updateSettings: (patch: Partial<AppSettings>) => void;
  setPrimaryMeal: (mealId: string) => void;
  setSecondaryMeal: (mealId: string) => void;
  setMealDisplayMode: (mode: MealDisplayMode) => void;
  toggleFavoriteMeal: (mealId: string) => void;
  setCompareMealIds: (ids: string[]) => void;
  resetSettings: () => void;
  setStudyPool: (next: { selectedSurahs: number[]; selectedJuzs: number[] }) => void;
  updateStudyPrefs: (patch: Partial<StudyPrefs>) => void;
  setLastRead: (pos: Omit<LastReadPosition, 'updatedAt'>) => void;
  toggleBookmarkAyah: (ayahId: number) => void;
  upsertPageBookmark: (input: {
    page: number;
    surah: number;
    ayah: number;
    label?: string;
    color?: PageBookmarkColor;
  }) => void;
  moveHatimBookmark: (input: { page: number; surah: number; ayah: number }) => void;
  renamePageBookmark: (id: string, label: string, color?: PageBookmarkColor) => void;
  removePageBookmark: (id: string) => void;
  updateAudioPrefs: (patch: Partial<AudioPrefs>) => void;
  setArabicReciter: (id: string) => void;
  toggleFavoriteReciter: (id: string) => void;
  createPlaylist: (name: string, items?: Omit<AudioPlaylistItem, 'id'>[]) => AudioPlaylist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addItemToPlaylist: (playlistId: string, item: Omit<AudioPlaylistItem, 'id'>) => void;
  removeItemFromPlaylist: (playlistId: string, itemId: string) => void;
  movePlaylistItem: (playlistId: string, itemId: string, direction: 'up' | 'down') => void;
  recordExamResult: (input: RecordExamResultInput) => RecordExamResultOutput;
  awardGameXp: (earnedXp: number) => void;
  toggleBookmarkQuestion: (questionUid: string) => void;
  markQuestionMastered: (questionUid: string) => void;
  reportQuestionIssue: (report: QuestionIssueReport) => void;
  removeQuestionIssueReport: (uid: string) => void;
  clearAllQuestionIssueReports: () => void;
  setSkipReportedInExams: (skip: boolean) => void;

  // Navigasyon, Görünüm & Modallar
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  studyNavTarget: StudyNavigationTarget | null;
  navigateToStudy: (target: Omit<StudyNavigationTarget, 'nonce'>) => void;
  clearStudyNavTarget: () => void;
  examNavTarget: ExamNavigationTarget | null;
  navigateToExam: (target?: Omit<ExamNavigationTarget, 'nonce'>) => void;
  clearExamNavTarget: () => void;
  fihristNavTarget: FihristNavigationTarget | null;
  navigateToFihrist: (target?: Omit<FihristNavigationTarget, 'nonce'>) => void;
  clearFihristNavTarget: () => void;
  isExamActive: boolean;
  setIsExamActive: (active: boolean) => void;
  isGameArenaActive: boolean;
  setIsGameArenaActive: (active: boolean) => void;
  isMemorizationZenActive: boolean;
  setIsMemorizationZenActive: (active: boolean) => void;
  isMobileReaderImmersive: boolean;
  setIsMobileReaderImmersive: (active: boolean) => void;
  isAudioBarExpanded: boolean;
  setIsAudioBarExpanded: (expanded: boolean) => void;
  isAudioBarMinimized: boolean;
  setIsAudioBarMinimized: (minimized: boolean) => void;
  selectedVerseKey: string | null;
  setSelectedVerseKey: (verseKey: string | null) => void;
  registerReaderSmartPlay: (
    handler: ((options?: { forceSwitchToSelected?: boolean }) => void) | null,
  ) => void;
  triggerSmartReaderPlay: (options?: { forceSwitchToSelected?: boolean }) => boolean;
  quickMemorizeSeed: QuickMemorizeSeed | null;
  openQuickMemorize: (
    surah: number,
    ayah: number,
    page?: number,
    endAyah?: number,
    title?: string,
  ) => void;
  closeQuickMemorize: () => void;
  quickResearchSeed: QuickResearchSeed | null;
  openQuickResearch: (
    surah: number,
    startAyah: number,
    endAyah?: number,
    page?: number,
    initialNote?: string,
  ) => void;
  closeQuickResearch: () => void;
  memorizeLaunchTarget: MemorizeLaunchTarget | null;
  navigateToMemorizeUnit: (
    unitId?: string,
    autoStart?: boolean,
    openHubTab?: 'pool' | 'classical' | 'hifz_map',
  ) => void;
  clearMemorizeLaunchTarget: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  isPresentationOpen: boolean;
  openPresentationMode: () => void;
  closePresentationMode: () => void;
  isPoolModalOpen: boolean;
  openPoolModal: () => void;
  closePoolModal: () => void;
  isSettingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  isReciterSelectorOpen: boolean;
  reciterSelectorContext: 'default' | 'memorize';
  openReciterSelector: (context?: 'default' | 'memorize') => void;
  closeReciterSelector: () => void;
  isMealSelectorOpen: boolean;
  mealSelectorTarget: 'primary' | 'secondary';
  openMealSelector: (target?: 'primary' | 'secondary') => void;
  closeMealSelector: () => void;
  compareTarget: { surah: number; ayah: number } | null;
  openMealCompare: (surah: number, ayah: number) => void;
  closeMealCompare: () => void;
  mutashabihatTarget: { surah: number; ayah: number } | null;
  openMutashabihat: (surah: number, ayah: number) => void;
  closeMutashabihat: () => void;
  isWaqfGuideOpen: boolean;
  openWaqfGuide: () => void;
  closeWaqfGuide: () => void;
  isBookmarksDrawerOpen: boolean;
  openBookmarksDrawer: () => void;
  closeBookmarksDrawer: () => void;
  isHatimModalOpen: boolean;
  openHatimModal: () => void;
  closeHatimModal: () => void;
  verseNoteTarget: { surah: number; ayah: number; page?: number } | null;
  openVerseNoteModal: (surah: number, ayah: number, page?: number) => void;
  closeVerseNoteModal: () => void;
  isSearchModalOpen: boolean;
  openSearchModal: () => void;
  closeSearchModal: () => void;
  isUserGuideOpen: boolean;
  userGuideTab: UserGuideTabId;
  openUserGuide: (tab?: UserGuideTabId) => void;
  closeUserGuide: () => void;
  feedbackSeed: FeedbackModalSeed | null;
  isFeedbackModalOpen: boolean;
  openFeedbackModal: (seed?: FeedbackModalSeed) => void;
  closeFeedbackModal: () => void;
  isListeningDrawerOpen: boolean;
  listeningDrawerSeed: ListeningDrawerSeed | null;
  openListeningDrawer: (seed?: Omit<ListeningDrawerSeed, 'nonce'>) => void;
  closeListeningDrawer: () => void;
  isIntroOpen: boolean;
  introDismissed: boolean;
  openIntroSplash: () => void;
  closeIntroSplash: (dontShowAgain?: boolean) => void;

  // Çekirdek Veri Katmanı
  manifest: ManifestData | null;
  meta: MetaData | null;
  questionIndex: QuestionIndexFile | null;
  questionIndexError: string | null;
  retryLoadQuestionIndex: () => Promise<void>;
  isLoadingCore: boolean;
  coreError: string | null;
  dataSourceMode: DataSourceMode;
  retryCoreLoad: () => void;
  activateDemoData: () => void;

  // Türetilmiş İstatistikler
  poolStats: PoolStatsSummary;

  // PWA & Bağlantı Durumu
  isOnline: boolean;
  canInstallPwa: boolean;
  isPwaInstalled: boolean;
  isIosDevice: boolean;
  promptPwaInstall: () => Promise<boolean>;

  // Depolama Kotası Uyarısı
  storageQuotaWarning: string | null;
  dismissStorageQuotaWarning: () => void;
}

const STORAGE_QUOTA_WARNING_TEXT =
  "Cihaz depolama alanı dolduğu için son değişiklik kaydedilemedi. Ayarlar'dan yedek alabilirsiniz.";

let storePersistencePaused = false;

export function setStorePersistencePaused(paused: boolean): void {
  storePersistencePaused = paused;
  setAllPersistencePaused(paused);
}

function readIntroDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INTRO_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [persisted, setPersisted] = useState<PersistedAppState>(() => hydrateState());
  const [activeTab, setActiveTabState] = useState<NavTab>('home');
  const [studyNavTarget, setStudyNavTarget] = useState<StudyNavigationTarget | null>(null);
  const [examNavTarget, setExamNavTarget] = useState<ExamNavigationTarget | null>(null);
  const [fihristNavTarget, setFihristNavTarget] = useState<FihristNavigationTarget | null>(null);
  const [isExamActive, setIsExamActive] = useState(false);
  const [isGameArenaActive, setIsGameArenaActive] = useState(false);
  const [isMemorizationZenActive, setIsMemorizationZenActive] = useState(false);
  const [isMobileReaderImmersive, setIsMobileReaderImmersive] = useState(false);
  const [isAudioBarExpanded, setIsAudioBarExpanded] = useState(false);
  const [isAudioBarMinimized, setIsAudioBarMinimized] = useState(false);
  const [selectedVerseKey, setSelectedVerseKey] = useState<string | null>(null);
  const readerSmartPlayHandlerRef = useRef<
    ((options?: { forceSwitchToSelected?: boolean }) => void) | null
  >(null);
  const registerReaderSmartPlay = useCallback(
    (handler: ((options?: { forceSwitchToSelected?: boolean }) => void) | null) => {
      readerSmartPlayHandlerRef.current = handler;
    },
    [],
  );
  const triggerSmartReaderPlay = useCallback(
    (options?: { forceSwitchToSelected?: boolean }): boolean => {
      if (readerSmartPlayHandlerRef.current) {
        readerSmartPlayHandlerRef.current(options);
        return true;
      }
      return false;
    },
    [],
  );
  const [quickMemorizeSeed, setQuickMemorizeSeed] = useState<QuickMemorizeSeed | null>(null);
  const [quickResearchSeed, setQuickResearchSeed] = useState<QuickResearchSeed | null>(null);

  useEffect(() => {
    if (activeTab !== 'reader' || persisted.studyPrefs.viewMode === 'cards') {
      setIsMobileReaderImmersive(false);
    }
  }, [activeTab, persisted.studyPrefs.viewMode]);
  const [memorizeLaunchTarget, setMemorizeLaunchTarget] = useState<MemorizeLaunchTarget | null>(
    null,
  );
  const [isSidebarCollapsed, setIsSidebarCollapsedState] = useState<boolean>(() =>
    readSidebarCollapsed(),
  );
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isListeningDrawerOpen, setIsListeningDrawerOpen] = useState(false);
  const [listeningDrawerSeed, setListeningDrawerSeed] = useState<ListeningDrawerSeed | null>(null);
  const [isReciterSelectorOpen, setIsReciterSelectorOpen] = useState(false);

  // Merkezi Akıllı Ekran Açık Tutma (Wake Lock) Senkronizasyonu
  useEffect(() => {
    wakeLockService.setEnabled(persisted.settings.keepScreenAwake);
  }, [persisted.settings.keepScreenAwake]);

  useEffect(() => {
    wakeLockService.setSilentReaderActive(activeTab === 'reader');
  }, [activeTab]);

  useEffect(() => {
    wakeLockService.setContinuousReason('presentation', isPresentationOpen);
  }, [isPresentationOpen]);

  useEffect(() => {
    wakeLockService.setContinuousReason('memorize_zen', isMemorizationZenActive);
  }, [isMemorizationZenActive]);

  useEffect(() => {
    wakeLockService.setContinuousReason('game_arena', isGameArenaActive);
  }, [isGameArenaActive]);

  useEffect(() => {
    wakeLockService.setContinuousReason('exam_active', isExamActive);
  }, [isExamActive]);

  const lastReadPage = persisted.studyProgress.lastRead?.page;
  const lastReadSurah = persisted.studyProgress.lastRead?.surah;
  const lastReadAyah = persisted.studyProgress.lastRead?.ayah;
  useEffect(() => {
    if (
      activeTab === 'reader' &&
      (lastReadPage !== undefined || lastReadSurah !== undefined || lastReadAyah !== undefined)
    ) {
      wakeLockService.notifyUserActivity();
    }
  }, [activeTab, lastReadPage, lastReadSurah, lastReadAyah]);
  const [reciterSelectorContext, setReciterSelectorContext] = useState<'default' | 'memorize'>(
    'default',
  );
  const [isMealSelectorOpen, setIsMealSelectorOpen] = useState(false);
  const [mealSelectorTarget, setMealSelectorTarget] = useState<'primary' | 'secondary'>('primary');
  const [compareTarget, setCompareTarget] = useState<{ surah: number; ayah: number } | null>(null);
  const [mutashabihatTarget, setMutashabihatTarget] = useState<{
    surah: number;
    ayah: number;
  } | null>(null);
  const [isWaqfGuideOpen, setIsWaqfGuideOpen] = useState(false);
  const [isBookmarksDrawerOpen, setIsBookmarksDrawerOpen] = useState(false);
  const [isHatimModalOpen, setIsHatimModalOpen] = useState(false);
  const [verseNoteTarget, setVerseNoteTarget] = useState<{
    surah: number;
    ayah: number;
    page?: number;
  } | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);
  const [userGuideTab, setUserGuideTab] = useState<UserGuideTabId>('quickstart');
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackSeed, setFeedbackSeed] = useState<FeedbackModalSeed | null>(null);
  const initialUrlHandledRef = useRef(false);
  const [introDismissed, setIntroDismissed] = useState<boolean>(() => readIntroDismissed());
  const [isIntroOpen, setIsIntroOpen] = useState<boolean>(
    () => !readIntroDismissed() && !hasInitialDeepLinkTarget(),
  );

  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [questionIndex, setQuestionIndex] = useState<QuestionIndexFile | null>(null);
  const [questionIndexError, setQuestionIndexError] = useState<string | null>(null);
  const [isLoadingCore, setIsLoadingCore] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('local');
  const [reloadTick, setReloadTick] = useState(0);

  // PWA & Çevrimiçi/Çevrimdışı Durumu
  const [isOnline, setIsOnline] = useState<boolean>(() => getInitialOnlineStatus());
  const [canInstallPwa, setCanInstallPwa] = useState<boolean>(
    () => getDeferredInstallPrompt() !== null,
  );
  const [isPwaInstalled, setIsPwaInstalled] = useState<boolean>(() => isStandaloneMode());
  const [isIosDevice] = useState<boolean>(() => detectIosDevice());

  // Çevrimiçi/Çevrimdışı ve PWA kurulum olaylarını izle
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstalled = () => {
      setIsPwaInstalled(true);
      setCanInstallPwa(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('appinstalled', handleInstalled);

    const unsubscribePrompt = subscribeInstallPrompt((evt) => {
      setCanInstallPwa(evt !== null);
    });

    const standaloneQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleDisplayModeChange = () => {
      setIsPwaInstalled(isStandaloneMode());
    };
    standaloneQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('appinstalled', handleInstalled);
      unsubscribePrompt();
      standaloneQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const [storageQuotaWarning, setStorageQuotaWarning] = useState<string | null>(null);
  const dismissStorageQuotaWarning = useCallback(() => {
    setStorageQuotaWarning(null);
  }, []);

  useEffect(() => {
    const handleQuotaEvent = () => {
      setStorageQuotaWarning(STORAGE_QUOTA_WARNING_TEXT);
    };
    window.addEventListener(STORAGE_QUOTA_EVENT, handleQuotaEvent);
    return () => {
      window.removeEventListener(STORAGE_QUOTA_EVENT, handleQuotaEvent);
    };
  }, []);

  const latestPersistedRef = useRef<PersistedAppState>(persisted);
  const hasPendingPersistRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const isExamActiveRef = useRef(isExamActive);
  const isMemorizationZenActiveRef = useRef(isMemorizationZenActive);

  useEffect(() => {
    isExamActiveRef.current = isExamActive;
  }, [isExamActive]);

  useEffect(() => {
    isMemorizationZenActiveRef.current = isMemorizationZenActive;
  }, [isMemorizationZenActive]);

  const flushPersistedState = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (!hasPendingPersistRef.current || storePersistencePaused || isAllPersistencePaused()) return;
    hasPendingPersistRef.current = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(latestPersistedRef.current));
      setStorageQuotaWarning((prev) => (prev !== null ? null : prev));
    } catch {
      setStorageQuotaWarning(STORAGE_QUOTA_WARNING_TEXT);
    }
  }, []);

  // Kalıcı localStorage kaydı (350ms debounce + sekme kapanışında senkron flush)
  useEffect(() => {
    latestPersistedRef.current = persisted;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (storePersistencePaused || isAllPersistencePaused()) return;

    hasPendingPersistRef.current = true;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      flushPersistedState();
    }, 350);

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [persisted, flushPersistedState]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPersistedState();
      }
    };
    const handlePageHide = () => {
      flushPersistedState();
    };
    const handleBeforeUnload = () => {
      flushPersistedState();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushPersistedState]);

  // Sekmeler arası depolama senkronizasyonu (aktif sınav veya ezber oturumu sırasında kesinti yapmaz)
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || storePersistencePaused || isAllPersistencePaused()) return;
      if (isExamActiveRef.current || isMemorizationZenActiveRef.current) return;
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      hasPendingPersistRef.current = false;
      skipNextPersistRef.current = true;
      setPersisted(hydrateState());
    };
    window.addEventListener('storage', handleStorageSync);
    return () => {
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  // Tema, yazı tipi, theme-color ve SFX senkronizasyonu
  useEffect(() => {
    const root = document.documentElement;
    const { theme, arabicFont, turkishFont, sfxEnabled, sfxVolume } = persisted.settings;

    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      const themeColor =
        theme === 'dark' ? '#0b1314' : theme === 'light' ? '#f4f7f7' : '#faf6ee';
      themeColorMeta.setAttribute('content', themeColor);
    }

    root.style.setProperty('--font-arabic', resolveArabicFontFamily(arabicFont));
    root.style.setProperty('--font-turkish', resolveTurkishFontStack(turkishFont));

    sfxService.configure(sfxEnabled, sfxVolume);
    audioQueueService.setWordSyncEnabled(persisted.settings.wordSyncEnabled);
  }, [persisted.settings]);

  // Kelime zamanlama meta dosyasını (seg/meta.json) arka planda sessizce ısıt
  useEffect(() => {
    if (persisted.settings.wordSyncEnabled) {
      void audioQueueService.ensureSegMetaLoaded();
    }
  }, [persisted.settings.wordSyncEnabled]);

  const applyDefaultStudyPoolSurahs = useCallback((surahs: number[]) => {
    if (surahs.length === 0) return;
    setPersisted((prev) => {
      if (prev.studyPool.isCustomized) return prev;
      const sameLength = prev.studyPool.selectedSurahs.length === surahs.length;
      const sameItems =
        sameLength && prev.studyPool.selectedSurahs.every((s, idx) => s === surahs[idx]);
      if (sameItems && prev.studyPool.selectedJuzs.length === 0) return prev;
      return {
        ...prev,
        studyPool: {
          selectedSurahs: [...surahs],
          selectedJuzs: [],
          isCustomized: false,
        },
      };
    });
  }, []);

  const loadQuestionIndexSafely = useCallback(
    async (fallbackSurahs?: number[], isCancelled?: () => boolean) => {
      try {
        const qIndexRes = await dataService.getQuestionIndex();
        if (isCancelled?.()) return;
        setQuestionIndex(qIndexRes);
        setQuestionIndexError(null);
        if (qIndexRes.availableSurahs.length > 0) {
          applyDefaultStudyPoolSurahs(qIndexRes.availableSurahs);
        }
      } catch {
        if (isCancelled?.()) return;
        setQuestionIndex(null);
        setQuestionIndexError('Soru bankası dizini şu anda yüklenemedi.');
        if (fallbackSurahs && fallbackSurahs.length > 0) {
          applyDefaultStudyPoolSurahs(fallbackSurahs);
        }
      }
    },
    [applyDefaultStudyPoolSurahs],
  );

  const retryLoadQuestionIndex = useCallback(async () => {
    setQuestionIndexError(null);
    await loadQuestionIndexSafely(manifest?.stats?.questionSurahs);
  }, [loadQuestionIndexSafely, manifest?.stats?.questionSurahs]);

  // Çekirdek veri dosyalarını paralel yükle (q/index.json bağımsızdır; çekirdek açılışı kilitlemez)
  useEffect(() => {
    let cancelled = false;

    async function loadCore() {
      setIsLoadingCore(true);
      setCoreError(null);
      setQuestionIndexError(null);
      try {
        const [manifestRes, metaRes] = await Promise.all([
          dataService.getManifest(),
          dataService.getMeta(),
        ]);

        if (cancelled) return;
        setManifest(manifestRes);
        setMeta(metaRes);
        setDataSourceMode(dataService.getActiveDataSource());

        const fallbackSurahs = Array.isArray(manifestRes.stats?.questionSurahs)
          ? manifestRes.stats.questionSurahs
          : undefined;
        void loadQuestionIndexSafely(fallbackSurahs, () => cancelled);
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
  }, [reloadTick, loadQuestionIndexSafely]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setPersisted((prev) => {
      let nextPrimary = patch.primaryMealId ?? prev.settings.primaryMealId;
      let nextSecondary = patch.secondaryMealId ?? prev.settings.secondaryMealId;
      let nextDisplayMode: MealDisplayMode = patch.mealDisplayMode ?? prev.settings.mealDisplayMode;

      // Eski preferredMeal çağrılarıyla tam geriye dönük uyum
      if (patch.preferredMeal !== undefined && patch.primaryMealId === undefined && patch.mealDisplayMode === undefined) {
        if (patch.preferredMeal === 'both') {
          nextDisplayMode = 'dual';
        } else {
          nextDisplayMode = 'single';
          nextPrimary = patch.preferredMeal;
          if (nextSecondary === nextPrimary) {
            nextSecondary = nextPrimary === 'm1' ? 'm2' : 'm1';
          }
        }
      }

      const nextPreferredMeal: MealKey | 'both' =
        nextDisplayMode === 'dual' ? 'both' : nextPrimary === 'm2' ? 'm2' : 'm1';

      const hasStagePatch =
        patch.readerContentMode !== undefined ||
        patch.desktopPageLayout !== undefined ||
        patch.desktopCombinedLayout !== undefined ||
        patch.mushafLayout !== undefined;

      let nextReaderContentMode = prev.settings.readerContentMode;
      let nextDesktopPageLayout = prev.settings.desktopPageLayout;
      let nextDesktopCombinedLayout = prev.settings.desktopCombinedLayout;
      let nextMushafLayout = prev.settings.mushafLayout;

      if (hasStagePatch) {
        if (
          patch.mushafLayout !== undefined &&
          patch.readerContentMode === undefined &&
          patch.desktopPageLayout === undefined &&
          patch.desktopCombinedLayout === undefined
        ) {
          const derived = deriveStageFromLayoutToken(
            patch.mushafLayout,
            prev.settings.desktopPageLayout,
            prev.settings.desktopCombinedLayout,
          );
          if (derived) {
            nextReaderContentMode = derived.readerContentMode;
            nextDesktopPageLayout = derived.desktopPageLayout;
            nextDesktopCombinedLayout = derived.desktopCombinedLayout;
            nextMushafLayout = derived.mushafLayout;
          }
        } else {
          nextReaderContentMode = patch.readerContentMode ?? prev.settings.readerContentMode;
          nextDesktopPageLayout = patch.desktopPageLayout ?? prev.settings.desktopPageLayout;
          nextDesktopCombinedLayout =
            patch.desktopCombinedLayout ?? prev.settings.desktopCombinedLayout;
          nextMushafLayout = computeMushafLayout(
            nextReaderContentMode,
            nextDesktopPageLayout,
            nextDesktopCombinedLayout,
          );
        }
      }

      const nextStudyPrefs: StudyPrefs = hasStagePatch
        ? {
            ...prev.studyPrefs,
            bookContentMode: readerContentToBookMode(nextReaderContentMode),
            pageLayout: mushafLayoutToLegacyPageLayout(nextMushafLayout),
          }
        : prev.studyPrefs;

      const audioSnap = audioQueueService.getSnapshot();
      const isAudioActive = audioSnap.isVisible && audioSnap.status !== 'idle';
      const shouldSyncAudioMode =
        hasStagePatch &&
        !isAudioActive &&
        nextReaderContentMode !== prev.settings.readerContentMode;

      return {
        ...prev,
        settings: {
          ...prev.settings,
          ...patch,
          primaryMealId: nextPrimary,
          secondaryMealId: nextSecondary,
          mealDisplayMode: nextDisplayMode,
          preferredMeal: nextPreferredMeal,
          readerContentMode: nextReaderContentMode,
          desktopPageLayout: nextDesktopPageLayout,
          desktopCombinedLayout: nextDesktopCombinedLayout,
          mushafLayout: nextMushafLayout,
        },
        studyPrefs: nextStudyPrefs,
        ...(shouldSyncAudioMode
          ? {
              audioPrefs: {
                ...prev.audioPrefs,
                mode: resolveAudioModeForContent(nextReaderContentMode),
              },
            }
          : {}),
      };
    });
  }, []);

  const setPrimaryMeal = useCallback(
    (mealId: string) => {
      const cleanId = mealId.trim();
      if (!cleanId) return;
      sfxService.play('click');
      const mealDef = findMealById(cleanId, manifest);
      setPersisted((prev) => {
        const nextSecondary =
          prev.settings.secondaryMealId === cleanId
            ? cleanId === 'm1'
              ? 'm2'
              : 'm1'
            : prev.settings.secondaryMealId;
        const nextPreferredMeal: MealKey | 'both' =
          prev.settings.mealDisplayMode === 'dual'
            ? 'both'
            : cleanId === 'm2'
              ? 'm2'
              : 'm1';

        // Sesli bir meal seçildiyse sesli meal kaynağını otomatik eşleştir;
        // seslendirmesiz meal seçildiyse mevcut sesli meal kaynağını (TDV/DİB) koru!
        const nextAudioPrefs =
          mealDef.hasAudio && mealDef.audioSource
            ? { ...prev.audioPrefs, mealAudioSource: mealDef.audioSource }
            : prev.audioPrefs;

        return {
          ...prev,
          settings: {
            ...prev.settings,
            primaryMealId: cleanId,
            secondaryMealId: nextSecondary,
            preferredMeal: nextPreferredMeal,
          },
          audioPrefs: nextAudioPrefs,
        };
      });
    },
    [manifest],
  );

  const setSecondaryMeal = useCallback((mealId: string) => {
    const cleanId = mealId.trim();
    if (!cleanId) return;
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        secondaryMealId: cleanId,
      },
    }));
  }, []);

  const setMealDisplayMode = useCallback((mode: MealDisplayMode) => {
    sfxService.play('click');
    setPersisted((prev) => {
      const nextPreferredMeal: MealKey | 'both' =
        mode === 'dual' ? 'both' : prev.settings.primaryMealId === 'm2' ? 'm2' : 'm1';
      return {
        ...prev,
        settings: {
          ...prev.settings,
          mealDisplayMode: mode,
          preferredMeal: nextPreferredMeal,
        },
      };
    });
  }, []);

  const toggleFavoriteMeal = useCallback((mealId: string) => {
    const cleanId = mealId.trim();
    if (!cleanId) return;
    sfxService.play('click');
    setPersisted((prev) => {
      const current = prev.settings.favoriteMealIds ?? [];
      const exists = current.includes(cleanId);
      const next = exists ? current.filter((id) => id !== cleanId) : [cleanId, ...current];
      return {
        ...prev,
        settings: {
          ...prev.settings,
          favoriteMealIds: next,
        },
      };
    });
  }, []);

  const setCompareMealIds = useCallback((ids: string[]) => {
    setPersisted((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        compareMealIds: Array.from(new Set(ids)),
      },
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      settings: {
        ...DEFAULT_SETTINGS,
        deskPrefs: { ...DEFAULT_DESK_PREFS },
      },
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

  const updateStudyPrefs = useCallback((patch: Partial<StudyPrefs>) => {
    setPersisted((prev) => {
      let nextReaderContentMode = prev.settings.readerContentMode;
      let nextDesktopPageLayout = prev.settings.desktopPageLayout;
      let nextDesktopCombinedLayout = prev.settings.desktopCombinedLayout;
      let nextMushafLayout = prev.settings.mushafLayout;
      let stageChanged = false;

      if (patch.bookContentMode !== undefined) {
        nextReaderContentMode = bookModeToReaderContent(patch.bookContentMode);
        nextMushafLayout = computeMushafLayout(
          nextReaderContentMode,
          nextDesktopPageLayout,
          nextDesktopCombinedLayout,
        );
        stageChanged = true;
      } else if (patch.pageLayout !== undefined) {
        const derived = deriveStageFromLayoutToken(
          patch.pageLayout,
          prev.settings.desktopPageLayout,
          prev.settings.desktopCombinedLayout,
        );
        if (derived) {
          nextReaderContentMode = derived.readerContentMode;
          nextDesktopPageLayout = derived.desktopPageLayout;
          nextDesktopCombinedLayout = derived.desktopCombinedLayout;
          nextMushafLayout = derived.mushafLayout;
          stageChanged = true;
        }
      }

      const nextStudyPrefs: StudyPrefs = {
        ...prev.studyPrefs,
        ...patch,
        ...(stageChanged
          ? {
              bookContentMode: readerContentToBookMode(nextReaderContentMode),
              pageLayout: mushafLayoutToLegacyPageLayout(nextMushafLayout),
            }
          : {}),
      };

      const audioSnap = audioQueueService.getSnapshot();
      const isAudioActive = audioSnap.isVisible && audioSnap.status !== 'idle';
      const shouldSyncAudioMode =
        !isAudioActive &&
        (patch.viewMode !== undefined ||
          patch.pageLayout !== undefined ||
          patch.bookContentMode !== undefined);

      return {
        ...prev,
        settings: stageChanged
          ? {
              ...prev.settings,
              readerContentMode: nextReaderContentMode,
              desktopPageLayout: nextDesktopPageLayout,
              desktopCombinedLayout: nextDesktopCombinedLayout,
              mushafLayout: nextMushafLayout,
            }
          : prev.settings,
        studyPrefs: nextStudyPrefs,
        ...(shouldSyncAudioMode
          ? {
              audioPrefs: {
                ...prev.audioPrefs,
                mode: resolveAudioModeForStudyPrefs(nextStudyPrefs, nextReaderContentMode),
              },
            }
          : {}),
      };
    });
  }, []);

  const setLastRead = useCallback((pos: Omit<LastReadPosition, 'updatedAt'>) => {
    setPersisted((prev) => {
      const prevLast = prev.studyProgress.lastRead;
      if (
        prevLast &&
        prevLast.surah === pos.surah &&
        prevLast.ayah === pos.ayah &&
        prevLast.page === pos.page &&
        prevLast.viewMode === pos.viewMode
      ) {
        return prev;
      }
      return {
        ...prev,
        studyProgress: {
          ...prev.studyProgress,
          lastRead: {
            ...pos,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }, []);

  const toggleBookmarkAyah = useCallback((ayahId: number) => {
    sfxService.play('click');
    setPersisted((prev) => {
      const exists = prev.studyProgress.bookmarkedAyahIds.includes(ayahId);
      const nextIds = exists
        ? prev.studyProgress.bookmarkedAyahIds.filter((id) => id !== ayahId)
        : [...prev.studyProgress.bookmarkedAyahIds, ayahId];
      return {
        ...prev,
        studyProgress: {
          ...prev.studyProgress,
          bookmarkedAyahIds: nextIds,
        },
      };
    });
  }, []);

  const upsertPageBookmark = useCallback(
    (input: {
      page: number;
      surah: number;
      ayah: number;
      label?: string;
      color?: PageBookmarkColor;
    }) => {
      sfxService.play('click');
      const now = new Date().toISOString();
      setPersisted((prev) => {
        const list = prev.studyProgress.pageBookmarks;
        const existingIdx = list.findIndex((b) => !b.isHatim && b.page === input.page);
        let nextList: PageBookmark[];
        if (existingIdx >= 0) {
          nextList = list.map((b, idx) =>
            idx === existingIdx
              ? {
                  ...b,
                  surah: input.surah,
                  ayah: input.ayah,
                  label: input.label?.trim() || b.label,
                  color: input.color ?? b.color,
                  updatedAt: now,
                }
              : b,
          );
        } else {
          const newBookmark: PageBookmark = {
            id: `bm_${input.page}_${Date.now()}`,
            page: input.page,
            surah: input.surah,
            ayah: input.ayah,
            label: input.label?.trim() || `Sayfa ${input.page}`,
            color: input.color ?? 'amber',
            isHatim: false,
            updatedAt: now,
          };
          nextList = [newBookmark, ...list];
        }
        return {
          ...prev,
          studyProgress: {
            ...prev.studyProgress,
            pageBookmarks: nextList,
          },
        };
      });
    },
    [],
  );

  const moveHatimBookmark = useCallback(
    (input: { page: number; surah: number; ayah: number }) => {
      sfxService.play('click');
      const now = new Date().toISOString();
      setPersisted((prev) => {
        const existing = prev.studyProgress.pageBookmarks.find((b) => b.isHatim);
        const hatimItem: PageBookmark = {
          id: existing?.id ?? 'hatim',
          page: input.page,
          surah: input.surah,
          ayah: input.ayah,
          label: existing?.label || 'Hatim Ayracım',
          color: existing?.color ?? 'emerald',
          isHatim: true,
          updatedAt: now,
        };
        const others = prev.studyProgress.pageBookmarks.filter((b) => !b.isHatim);
        return {
          ...prev,
          studyProgress: {
            ...prev.studyProgress,
            pageBookmarks: [hatimItem, ...others],
          },
        };
      });
    },
    [],
  );

  const renamePageBookmark = useCallback(
    (id: string, label: string, color?: PageBookmarkColor) => {
      const cleanLabel = label.trim();
      if (!cleanLabel) return;
      sfxService.play('click');
      setPersisted((prev) => ({
        ...prev,
        studyProgress: {
          ...prev.studyProgress,
          pageBookmarks: prev.studyProgress.pageBookmarks.map((b) =>
            b.id === id
              ? {
                  ...b,
                  label: cleanLabel,
                  color: color ?? b.color,
                  updatedAt: new Date().toISOString(),
                }
              : b,
          ),
        },
      }));
    },
    [],
  );

  const removePageBookmark = useCallback((id: string) => {
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      studyProgress: {
        ...prev.studyProgress,
        pageBookmarks: prev.studyProgress.pageBookmarks.filter((b) => b.id !== id),
      },
    }));
  }, []);

  const updateAudioPrefs = useCallback((patch: Partial<AudioPrefs>) => {
    setPersisted((prev) => {
      const nextReciterId =
        patch.arabicReciterId ?? patch.arabicAudioSource ?? prev.audioPrefs.arabicReciterId;
      return {
        ...prev,
        audioPrefs: {
          ...prev.audioPrefs,
          ...patch,
          arabicReciterId: nextReciterId,
          arabicAudioSource: nextReciterId,
        },
      };
    });
  }, []);

  const setArabicReciter = useCallback((id: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      audioPrefs: {
        ...prev.audioPrefs,
        arabicReciterId: cleanId,
        arabicAudioSource: cleanId,
      },
    }));
  }, []);

  const toggleFavoriteReciter = useCallback((id: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;
    sfxService.play('click');
    setPersisted((prev) => {
      const current = prev.audioPrefs.favoriteReciterIds ?? [];
      const exists = current.includes(cleanId);
      const next = exists ? current.filter((item) => item !== cleanId) : [cleanId, ...current];
      return {
        ...prev,
        audioPrefs: {
          ...prev.audioPrefs,
          favoriteReciterIds: next,
        },
      };
    });
  }, []);

  const recordExamResult = useCallback(
    (input: RecordExamResultInput): RecordExamResultOutput => {
      const correct = input.correctUids.length;
      const wrong = input.wrongUids.length;
      const blank = Math.max(0, input.blankCount);
      const totalQuestions = Math.max(1, input.totalQuestions);
      const scorePct = Math.round((correct / totalQuestions) * 100);

      // Mevcut wrongQuestionIds ile yeni temizlenen sayısını hesapla
      const currentWrongSet = new Set(persisted.gamification.wrongQuestionIds);
      const newlyMasteredUids = input.isMistakeCamp
        ? input.correctUids.filter((uid) => currentWrongSet.has(uid))
        : [];
      const newlyMasteredCount = newlyMasteredUids.length;

      // XP Hesabı: Doğru +10 XP, seri bonusu, tamamlama bonusu ve hata temizleme bonusu
      const baseXp = correct * 10;
      const streakBonus = input.maxStreak >= 3 ? input.maxStreak * 5 : 0;
      const completionBonus =
        correct + wrong >= Math.ceil(totalQuestions / 2)
          ? totalQuestions >= 10
            ? 25
            : 15
          : 0;
      const masteryBonus = newlyMasteredCount * 5;
      const earnedXp = baseXp + streakBonus + completionBonus + masteryBonus;

      const today = getTodayIsoDate();

      setPersisted((prev) => {
        const prevGam = prev.gamification;

        // Günlük seri güncellemesi
        let nextStreakDays = Math.max(1, prevGam.streakDays);
        if (prevGam.lastActiveDate && prevGam.lastActiveDate !== today) {
          const gap = daysBetweenIso(prevGam.lastActiveDate, today);
          if (gap === 1) {
            nextStreakDays += 1;
          } else if (gap > 1) {
            nextStreakDays = 1;
          }
        }

        const nextWrongSet = new Set(prevGam.wrongQuestionIds);
        const nextMasteredSet = new Set(prevGam.masteredQuestionIds);
        const nextSolvedSet = new Set(prevGam.solvedQuestionUids);

        for (const uid of input.wrongUids) {
          nextWrongSet.add(uid);
          nextMasteredSet.delete(uid);
          nextSolvedSet.add(uid);
        }

        for (const uid of input.correctUids) {
          nextSolvedSet.add(uid);
          if (input.isMistakeCamp && nextWrongSet.has(uid)) {
            nextWrongSet.delete(uid);
            nextMasteredSet.add(uid);
          }
        }

        const historyRecord: ExamHistoryRecord = {
          id: input.id,
          date: new Date().toISOString(),
          mode: input.mode,
          surahs: Array.from(new Set(input.surahs)).sort((a, b) => a - b),
          totalQuestions: input.totalQuestions,
          correct,
          wrong,
          blank,
          scorePct,
          earnedXp,
          durationSec: Math.max(0, Math.round(input.durationSec)),
          isMistakeCamp: Boolean(input.isMistakeCamp),
        };

        return {
          ...prev,
          gamification: {
            ...prevGam,
            totalXp: prevGam.totalXp + earnedXp,
            streakDays: nextStreakDays,
            lastActiveDate: today,
            solvedCount: prevGam.solvedCount + correct + wrong,
            correctCount: prevGam.correctCount + correct,
            wrongQuestionIds: Array.from(nextWrongSet),
            masteredQuestionIds: Array.from(nextMasteredSet),
            solvedQuestionUids: Array.from(nextSolvedSet),
            examHistory: [historyRecord, ...prevGam.examHistory].slice(0, 25),
          },
        };
      });

      return { earnedXp, newlyMasteredCount, scorePct };
    },
    [persisted.gamification.wrongQuestionIds],
  );

  const awardGameXp = useCallback((earnedXp: number) => {
    const safeXp = Math.max(0, Math.round(earnedXp));
    if (safeXp <= 0) return;
    const today = getTodayIsoDate();
    setPersisted((prev) => {
      const prevGam = prev.gamification;
      let nextStreakDays = Math.max(1, prevGam.streakDays);
      if (prevGam.lastActiveDate && prevGam.lastActiveDate !== today) {
        const gap = daysBetweenIso(prevGam.lastActiveDate, today);
        if (gap === 1) {
          nextStreakDays += 1;
        } else if (gap > 1) {
          nextStreakDays = 1;
        }
      }
      return {
        ...prev,
        gamification: {
          ...prevGam,
          totalXp: prevGam.totalXp + safeXp,
          streakDays: nextStreakDays,
          lastActiveDate: today,
        },
      };
    });
  }, []);

  const toggleBookmarkQuestion = useCallback((questionUid: string) => {
    sfxService.play('click');
    setPersisted((prev) => {
      const exists = prev.gamification.bookmarkedQuestionIds.includes(questionUid);
      const nextIds = exists
        ? prev.gamification.bookmarkedQuestionIds.filter((id) => id !== questionUid)
        : [questionUid, ...prev.gamification.bookmarkedQuestionIds];
      return {
        ...prev,
        gamification: {
          ...prev.gamification,
          bookmarkedQuestionIds: nextIds,
        },
      };
    });
  }, []);

  const markQuestionMastered = useCallback((questionUid: string) => {
    sfxService.play('click');
    setPersisted((prev) => {
      const nextWrong = prev.gamification.wrongQuestionIds.filter((id) => id !== questionUid);
      const nextMastered = prev.gamification.masteredQuestionIds.includes(questionUid)
        ? prev.gamification.masteredQuestionIds
        : [questionUid, ...prev.gamification.masteredQuestionIds];
      return {
        ...prev,
        gamification: {
          ...prev.gamification,
          wrongQuestionIds: nextWrong,
          masteredQuestionIds: nextMastered,
        },
      };
    });
  }, []);

  const reportQuestionIssue = useCallback((report: QuestionIssueReport) => {
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      questionAudit: {
        ...prev.questionAudit,
        reports: {
          ...prev.questionAudit.reports,
          [report.uid]: report,
        },
      },
    }));
  }, []);

  const removeQuestionIssueReport = useCallback((uid: string) => {
    sfxService.play('click');
    setPersisted((prev) => {
      const nextReports = { ...prev.questionAudit.reports };
      delete nextReports[uid];
      return {
        ...prev,
        questionAudit: {
          ...prev.questionAudit,
          reports: nextReports,
        },
      };
    });
  }, []);

  const clearAllQuestionIssueReports = useCallback(() => {
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      questionAudit: {
        ...prev.questionAudit,
        reports: {},
      },
    }));
  }, []);

  const setSkipReportedInExams = useCallback((skip: boolean) => {
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      questionAudit: {
        ...prev.questionAudit,
        skipReportedInExams: skip,
      },
    }));
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setIsSidebarCollapsedState(collapsed);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    sfxService.play('click');
    setIsSidebarCollapsedState((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const openPresentationMode = useCallback(() => {
    sfxService.play('click');
    setIsPresentationOpen(true);
  }, []);

  const closePresentationMode = useCallback(() => {
    setIsPresentationOpen(false);
  }, []);

  const setActiveTab = useCallback((tab: NavTab) => {
    sfxService.play('click');
    if (tab === 'mistakes') {
      setExamNavTarget({ openMistakeCamp: true, nonce: Date.now() });
      setActiveTabState('exam');
    } else {
      setActiveTabState(tab);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToStudy = useCallback((target: Omit<StudyNavigationTarget, 'nonce'>) => {
    sfxService.play('click');
    if (
      target.viewMode ||
      target.contentMode ||
      target.ensureMealVisible ||
      target.ensureArabicVisible
    ) {
      const isCompactViewport = typeof window !== 'undefined' && window.innerWidth < 1024;
      setPersisted((prev) => {
        const currentPrefs = prev.studyPrefs;
        let nextViewMode = target.viewMode ?? currentPrefs.viewMode;
        let nextReaderContentMode: ReaderContentMode = target.contentMode
          ? bookModeToReaderContent(target.contentMode)
          : prev.settings.readerContentMode;
        let nextDesktopCombinedLayout = prev.settings.desktopCombinedLayout;

        if (!target.contentMode) {
          if (target.ensureMealVisible && nextReaderContentMode === 'ar_only') {
            nextReaderContentMode = 'ar_meal';
          }
          if (target.ensureArabicVisible && nextReaderContentMode === 'meal_only') {
            nextReaderContentMode = 'ar_meal';
          }
        }

        // Meal/anlam odaklı geçişlerde:
        // - Mobilde (< 1024px) Mushaf görünümü meali doğrudan göstermediği için Kartlar görünümüne geç
        //   (doğrudan Mushaf hedeflenmemişse).
        // - Masaüstünde (>= 1024px) Mushaf + Rahle (tıklanan meal) modundaysa yan yana Meal panelini aç.
        if (target.ensureMealVisible) {
          if (
            isCompactViewport &&
            nextViewMode === 'mushaf' &&
            !(target.viewMode === 'mushaf' && target.ensureArabicVisible)
          ) {
            nextViewMode = 'cards';
          } else if (
            !isCompactViewport &&
            nextViewMode === 'mushaf' &&
            nextDesktopCombinedLayout !== 'side_by_side'
          ) {
            nextDesktopCombinedLayout = 'side_by_side';
          }
        }

        const nextMushafLayout = computeMushafLayout(
          nextReaderContentMode,
          prev.settings.desktopPageLayout,
          nextDesktopCombinedLayout,
        );
        const nextBookContentMode = readerContentToBookMode(nextReaderContentMode);
        const nextPageLayout = mushafLayoutToLegacyPageLayout(nextMushafLayout);
        const nextMealAudioFocusOnly = target.ensureMealVisible
          ? false
          : currentPrefs.mealAudioFocusOnly;
        const nextMushafSidePanelOpen = target.ensureMealVisible
          ? true
          : currentPrefs.mushafSidePanelOpen;

        if (
          nextViewMode === currentPrefs.viewMode &&
          nextReaderContentMode === prev.settings.readerContentMode &&
          nextDesktopCombinedLayout === prev.settings.desktopCombinedLayout &&
          nextMushafLayout === prev.settings.mushafLayout &&
          nextBookContentMode === currentPrefs.bookContentMode &&
          nextPageLayout === currentPrefs.pageLayout &&
          nextMealAudioFocusOnly === currentPrefs.mealAudioFocusOnly &&
          nextMushafSidePanelOpen === currentPrefs.mushafSidePanelOpen
        ) {
          return prev;
        }

        return {
          ...prev,
          settings: {
            ...prev.settings,
            readerContentMode: nextReaderContentMode,
            desktopCombinedLayout: nextDesktopCombinedLayout,
            mushafLayout: nextMushafLayout,
          },
          studyPrefs: {
            ...currentPrefs,
            viewMode: nextViewMode,
            bookContentMode: nextBookContentMode,
            pageLayout: nextPageLayout,
            mealAudioFocusOnly: nextMealAudioFocusOnly,
            mushafSidePanelOpen: nextMushafSidePanelOpen,
          },
        };
      });
    }
    setIsExamActive(false);
    setStudyNavTarget({ ...target, nonce: Date.now() });
    setActiveTabState('reader');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const clearStudyNavTarget = useCallback(() => {
    setStudyNavTarget(null);
  }, []);

  const navigateToExam = useCallback((target?: Omit<ExamNavigationTarget, 'nonce'>) => {
    sfxService.play('click');
    setExamNavTarget({ ...(target ?? {}), nonce: Date.now() });
    setActiveTabState('exam');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const clearExamNavTarget = useCallback(() => {
    setExamNavTarget(null);
  }, []);

  const navigateToFihrist = useCallback((target?: Omit<FihristNavigationTarget, 'nonce'>) => {
    sfxService.play('click');
    setIsExamActive(false);
    setFihristNavTarget({ ...(target ?? {}), nonce: Date.now() });
    setActiveTabState('fihrist');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const clearFihristNavTarget = useCallback(() => {
    setFihristNavTarget(null);
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

  const openQuickMemorize = useCallback(
    (surah: number, ayah: number, page?: number, endAyah?: number, title?: string) => {
      sfxService.play('click');
      setQuickMemorizeSeed({ surah, ayah, endAyah, title, page, nonce: Date.now() });
    },
    [],
  );

  const closeQuickMemorize = useCallback(() => {
    setQuickMemorizeSeed(null);
  }, []);

  const navigateToMemorizeUnit = useCallback(
    (unitId?: string, autoStart = true, openHubTab?: 'pool' | 'classical' | 'hifz_map') => {
      sfxService.play('click');
      setIsExamActive(false);
      setMemorizeLaunchTarget({ unitId, autoStart, openHubTab, nonce: Date.now() });
      setActiveTabState('memorize');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [],
  );

  const clearMemorizeLaunchTarget = useCallback(() => {
    setMemorizeLaunchTarget(null);
  }, []);

  const openQuickResearch = useCallback(
    (surah: number, startAyah: number, endAyah?: number, page?: number, initialNote?: string) => {
      sfxService.play('click');
      setQuickResearchSeed({
        surah,
        startAyah,
        endAyah: endAyah ?? startAyah,
        page,
        initialNote,
        nonce: Date.now(),
      });
    },
    [],
  );

  const closeQuickResearch = useCallback(() => {
    setQuickResearchSeed(null);
  }, []);

  const openReciterSelector = useCallback((context: 'default' | 'memorize' = 'default') => {
    sfxService.play('click');
    setReciterSelectorContext(context);
    setIsReciterSelectorOpen(true);
  }, []);

  const closeReciterSelector = useCallback(() => {
    setIsReciterSelectorOpen(false);
  }, []);

  const openMealSelector = useCallback((target: 'primary' | 'secondary' = 'primary') => {
    sfxService.play('click');
    setMealSelectorTarget(target);
    setIsMealSelectorOpen(true);
  }, []);

  const closeMealSelector = useCallback(() => {
    setIsMealSelectorOpen(false);
  }, []);

  const openMealCompare = useCallback((surah: number, ayah: number) => {
    sfxService.play('click');
    setCompareTarget({ surah, ayah });
  }, []);

  const closeMealCompare = useCallback(() => {
    setCompareTarget(null);
  }, []);

  const openMutashabihat = useCallback((surah: number, ayah: number) => {
    sfxService.play('click');
    setMutashabihatTarget({ surah, ayah });
  }, []);

  const closeMutashabihat = useCallback(() => {
    setMutashabihatTarget(null);
  }, []);

  const openWaqfGuide = useCallback(() => {
    sfxService.play('click');
    setIsWaqfGuideOpen(true);
  }, []);

  const closeWaqfGuide = useCallback(() => {
    setIsWaqfGuideOpen(false);
  }, []);

  const openBookmarksDrawer = useCallback(() => {
    sfxService.play('click');
    setIsBookmarksDrawerOpen(true);
  }, []);

  const closeBookmarksDrawer = useCallback(() => {
    setIsBookmarksDrawerOpen(false);
  }, []);

  const openHatimModal = useCallback(() => {
    sfxService.play('click');
    setIsHatimModalOpen(true);
  }, []);

  const closeHatimModal = useCallback(() => {
    setIsHatimModalOpen(false);
  }, []);

  const openVerseNoteModal = useCallback((surah: number, ayah: number, page?: number) => {
    sfxService.play('click');
    setVerseNoteTarget({ surah, ayah, page });
  }, []);

  const closeVerseNoteModal = useCallback(() => {
    setVerseNoteTarget(null);
  }, []);

  const openSearchModal = useCallback(() => {
    sfxService.play('click');
    setIsSearchModalOpen(true);
  }, []);

  const closeSearchModal = useCallback(() => {
    setIsSearchModalOpen(false);
  }, []);

  const openListeningDrawer = useCallback((seed?: Omit<ListeningDrawerSeed, 'nonce'>) => {
    sfxService.play('click');
    setListeningDrawerSeed({ ...(seed ?? {}), nonce: Date.now() });
    setIsListeningDrawerOpen(true);
  }, []);

  const closeListeningDrawer = useCallback(() => {
    setIsListeningDrawerOpen(false);
  }, []);

  const createPlaylist = useCallback(
    (name: string, items: Omit<AudioPlaylistItem, 'id'>[] = []): AudioPlaylist => {
      const now = new Date().toISOString();
      const plId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const cleanName = name.trim() || 'Yeni Çalma Listesi';
      const hydratedItems: AudioPlaylistItem[] = items.map((it, idx) => ({
        ...it,
        id: `${plId}_i_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      }));
      const created: AudioPlaylist = {
        id: plId,
        name: cleanName,
        items: hydratedItems,
        createdAt: now,
        updatedAt: now,
        isPreset: false,
      };
      setPersisted((prev) => ({
        ...prev,
        audioPlaylists: [created, ...prev.audioPlaylists],
      }));
      return created;
    },
    [],
  );

  const renamePlaylist = useCallback((id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setPersisted((prev) => ({
      ...prev,
      audioPlaylists: prev.audioPlaylists.map((pl) =>
        pl.id === id ? { ...pl, name: clean, updatedAt: new Date().toISOString() } : pl,
      ),
    }));
  }, []);

  const deletePlaylist = useCallback((id: string) => {
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      audioPlaylists: prev.audioPlaylists.filter((pl) => pl.id !== id),
    }));
  }, []);

  const addItemToPlaylist = useCallback(
    (playlistId: string, item: Omit<AudioPlaylistItem, 'id'>) => {
      const itemId = `${playlistId}_i_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const nextItem: AudioPlaylistItem = { ...item, id: itemId };
      setPersisted((prev) => ({
        ...prev,
        audioPlaylists: prev.audioPlaylists.map((pl) =>
          pl.id === playlistId
            ? {
                ...pl,
                items: [...pl.items, nextItem],
                updatedAt: new Date().toISOString(),
              }
            : pl,
        ),
      }));
    },
    [],
  );

  const removeItemFromPlaylist = useCallback((playlistId: string, itemId: string) => {
    sfxService.play('click');
    setPersisted((prev) => ({
      ...prev,
      audioPlaylists: prev.audioPlaylists.map((pl) =>
        pl.id === playlistId
          ? {
              ...pl,
              items: pl.items.filter((it) => it.id !== itemId),
              updatedAt: new Date().toISOString(),
            }
          : pl,
      ),
    }));
  }, []);

  const movePlaylistItem = useCallback(
    (playlistId: string, itemId: string, direction: 'up' | 'down') => {
      sfxService.play('click');
      setPersisted((prev) => ({
        ...prev,
        audioPlaylists: prev.audioPlaylists.map((pl) => {
          if (pl.id !== playlistId) return pl;
          const idx = pl.items.findIndex((it) => it.id === itemId);
          if (idx === -1) return pl;
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= pl.items.length) return pl;
          const nextItems = [...pl.items];
          const [moved] = nextItems.splice(idx, 1);
          nextItems.splice(targetIdx, 0, moved);
          return {
            ...pl,
            items: nextItems,
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
    },
    [],
  );

  const openIntroSplash = useCallback(() => {
    sfxService.play('click');
    setIsSettingsModalOpen(false);
    setIsIntroOpen(true);
  }, []);

  const closeIntroSplash = useCallback((dontShowAgain?: boolean) => {
    if (dontShowAgain === true) {
      setIntroDismissed(true);
      try {
        window.localStorage.setItem(INTRO_DISMISSED_KEY, '1');
      } catch {
        // ignore storage restrictions
      }
    } else if (dontShowAgain === false) {
      setIntroDismissed(false);
      try {
        window.localStorage.removeItem(INTRO_DISMISSED_KEY);
      } catch {
        // ignore storage restrictions
      }
    }
    setIsIntroOpen(false);
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

  const promptPwaInstall = useCallback(async (): Promise<boolean> => {
    sfxService.play('click');
    const outcome = await triggerPwaInstallPrompt();
    if (outcome === 'accepted') {
      setIsPwaInstalled(true);
      setCanInstallPwa(false);
      return true;
    }
    return false;
  }, []);

  const openUserGuide = useCallback((tab: UserGuideTabId = 'quickstart') => {
    setUserGuideTab(tab);
    setIsUserGuideOpen(true);
  }, []);

  const closeUserGuide = useCallback(() => {
    setIsUserGuideOpen(false);
  }, []);

  const openFeedbackModal = useCallback((seed?: FeedbackModalSeed) => {
    setFeedbackSeed(seed ?? null);
    setIsFeedbackModalOpen(true);
  }, []);

  const closeFeedbackModal = useCallback(() => {
    setIsFeedbackModalOpen(false);
    setFeedbackSeed(null);
  }, []);

  // Açılışta URL doğrudan bağlantı (Deep-Link) parametrelerini ve /mushaf/ gibi alt yolları tek seferlik çözümle
  useEffect(() => {
    if (initialUrlHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const target =
      parseInitialUrlTarget(window.location.search) ??
      parseInitialPathnameTarget(window.location.pathname);
    if (!target) {
      initialUrlHandledRef.current = true;
      return;
    }

    if ((target.kind === 'verse' || target.kind === 'juz') && !meta) {
      return;
    }

    initialUrlHandledRef.current = true;
    setIsIntroOpen(false);

    if (target.kind === 'verse') {
      const page = meta
        ? dataService.findPageForSurahAyah(meta, target.surah, target.ayah)
        : undefined;
      navigateToStudy({
        surah: target.surah,
        ayah: target.ayah,
        page,
        ensureMealVisible: true,
      });
    } else if (target.kind === 'page') {
      navigateToStudy({
        page: target.page,
        viewMode: 'mushaf',
      });
    } else if (target.kind === 'juz' && meta) {
      const loc = dataService.findFirstLocationForJuz(meta, target.juz);
      navigateToStudy({
        surah: loc.surah,
        ayah: loc.ayah,
        page: loc.page,
      });
    } else if (target.kind === 'tab') {
      if (target.tab === 'games') {
        navigateToExam({ openGames: true });
      } else {
        setActiveTab(target.tab);
      }
    } else if (target.kind === 'guide') {
      openUserGuide(target.guideTab);
    }

    const isShareableReaderLink =
      target.kind === 'verse' || target.kind === 'page' || target.kind === 'juz';

    try {
      if (!isShareableReaderLink && window.self === window.top && window.location.search) {
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.hash}`,
        );
      }
    } catch {
      // Çapraz kaynak iframe ortamında sessiz geç
    }
  }, [meta, navigateToStudy, navigateToExam, setActiveTab, openUserGuide]);

  // Okuma sekmesi dışına geçildiğinde /mushaf/ gibi eski alt rotaları ve okuma sorgu parametrelerini temizle
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!initialUrlHandledRef.current) return;
    if (activeTab === 'reader') return;

    try {
      if (window.self !== window.top) return;
      const { pathname, search, hash } = window.location;
      const shouldCleanPath =
        isReaderSubroutePath(pathname) ||
        (activeTab === 'home' && isKnownAppSubroutePath(pathname));
      if (shouldCleanPath || Boolean(search)) {
        const cleanPath = shouldCleanPath ? '/' : pathname;
        window.history.replaceState(window.history.state, '', `${cleanPath}${hash}`);
      }
    } catch {
      // Kısıtlı ortamda sessiz geç
    }
  }, [activeTab]);

  // Sekme ve aktif okuma konumuna göre tarayıcı sekmesi başlığını (document.title) dinamik güncelle
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const baseTitle = "Muallimun Kur'an & Meal";

    if (activeTab === 'home') {
      document.title = "Muallimun Kur'an, Meal & Araştırma Platformu";
      return;
    }

    if (activeTab === 'reader') {
      const activeSurahNo = lastReadSurah ?? 1;
      const activePageNo = lastReadPage ?? 1;
      const surahMeta = meta?.surahs.find((s) => s.no === activeSurahNo);
      if (surahMeta) {
        document.title = `${surahMeta.nameTr} · Sayfa ${activePageNo} — ${baseTitle}`;
      } else {
        document.title = `Sayfa ${activePageNo} — ${baseTitle}`;
      }
      return;
    }

    if (activeTab === 'fihrist') {
      document.title = `Fihrist & Araştırma — ${baseTitle}`;
      return;
    }

    if (activeTab === 'memorize') {
      document.title = `Ezber & Hafızlık — ${baseTitle}`;
      return;
    }

    document.title = `Sınav Merkezi & Oyunlar — ${baseTitle}`;
  }, [activeTab, meta, lastReadSurah, lastReadPage]);

  const poolStats = useMemo(
    () => computePoolStats(persisted.studyPool, meta, questionIndex),
    [persisted.studyPool, meta, questionIndex],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      settings: persisted.settings,
      studyPool: persisted.studyPool,
      studyPrefs: persisted.studyPrefs,
      studyProgress: persisted.studyProgress,
      audioPrefs: persisted.audioPrefs,
      audioPlaylists: persisted.audioPlaylists,
      gamification: persisted.gamification,
      questionAudit: persisted.questionAudit,
      updateSettings,
      setPrimaryMeal,
      setSecondaryMeal,
      setMealDisplayMode,
      toggleFavoriteMeal,
      setCompareMealIds,
      resetSettings,
      setStudyPool,
      updateStudyPrefs,
      setLastRead,
      toggleBookmarkAyah,
      upsertPageBookmark,
      moveHatimBookmark,
      renamePageBookmark,
      removePageBookmark,
      updateAudioPrefs,
      setArabicReciter,
      toggleFavoriteReciter,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addItemToPlaylist,
      removeItemFromPlaylist,
      movePlaylistItem,
      recordExamResult,
      awardGameXp,
      toggleBookmarkQuestion,
      markQuestionMastered,
      reportQuestionIssue,
      removeQuestionIssueReport,
      clearAllQuestionIssueReports,
      setSkipReportedInExams,
      activeTab,
      setActiveTab,
      studyNavTarget,
      navigateToStudy,
      clearStudyNavTarget,
      examNavTarget,
      navigateToExam,
      clearExamNavTarget,
      fihristNavTarget,
      navigateToFihrist,
      clearFihristNavTarget,
      isExamActive,
      setIsExamActive,
      isGameArenaActive,
      setIsGameArenaActive,
      isMemorizationZenActive,
      setIsMemorizationZenActive,
      isMobileReaderImmersive,
      setIsMobileReaderImmersive,
      isAudioBarExpanded,
      setIsAudioBarExpanded,
      isAudioBarMinimized,
      setIsAudioBarMinimized,
      selectedVerseKey,
      setSelectedVerseKey,
      registerReaderSmartPlay,
      triggerSmartReaderPlay,
      quickMemorizeSeed,
      openQuickMemorize,
      closeQuickMemorize,
      quickResearchSeed,
      openQuickResearch,
      closeQuickResearch,
      memorizeLaunchTarget,
      navigateToMemorizeUnit,
      clearMemorizeLaunchTarget,
      isSidebarCollapsed,
      toggleSidebarCollapsed,
      setSidebarCollapsed,
      isPresentationOpen,
      openPresentationMode,
      closePresentationMode,
      isPoolModalOpen,
      openPoolModal,
      closePoolModal,
      isSettingsModalOpen,
      openSettingsModal,
      closeSettingsModal,
      isReciterSelectorOpen,
      reciterSelectorContext,
      openReciterSelector,
      closeReciterSelector,
      isMealSelectorOpen,
      mealSelectorTarget,
      openMealSelector,
      closeMealSelector,
      compareTarget,
      openMealCompare,
      closeMealCompare,
      mutashabihatTarget,
      openMutashabihat,
      closeMutashabihat,
      isWaqfGuideOpen,
      openWaqfGuide,
      closeWaqfGuide,
      isBookmarksDrawerOpen,
      openBookmarksDrawer,
      closeBookmarksDrawer,
      isHatimModalOpen,
      openHatimModal,
      closeHatimModal,
      verseNoteTarget,
      openVerseNoteModal,
      closeVerseNoteModal,
      isSearchModalOpen,
      openSearchModal,
      closeSearchModal,
      isUserGuideOpen,
      userGuideTab,
      openUserGuide,
      closeUserGuide,
      feedbackSeed,
      isFeedbackModalOpen,
      openFeedbackModal,
      closeFeedbackModal,
      isListeningDrawerOpen,
      listeningDrawerSeed,
      openListeningDrawer,
      closeListeningDrawer,
      isIntroOpen,
      introDismissed,
      openIntroSplash,
      closeIntroSplash,
      manifest,
      meta,
      questionIndex,
      questionIndexError,
      retryLoadQuestionIndex,
      isLoadingCore,
      coreError,
      dataSourceMode,
      retryCoreLoad,
      activateDemoData,
      poolStats,
      isOnline,
      canInstallPwa,
      isPwaInstalled,
      isIosDevice,
      promptPwaInstall,
      storageQuotaWarning,
      dismissStorageQuotaWarning,
    }),
    [
      persisted.settings,
      persisted.studyPool,
      persisted.studyPrefs,
      persisted.studyProgress,
      persisted.audioPrefs,
      persisted.audioPlaylists,
      persisted.gamification,
      persisted.questionAudit,
      updateSettings,
      setPrimaryMeal,
      setSecondaryMeal,
      setMealDisplayMode,
      toggleFavoriteMeal,
      setCompareMealIds,
      resetSettings,
      setStudyPool,
      updateStudyPrefs,
      setLastRead,
      toggleBookmarkAyah,
      upsertPageBookmark,
      moveHatimBookmark,
      renamePageBookmark,
      removePageBookmark,
      updateAudioPrefs,
      setArabicReciter,
      toggleFavoriteReciter,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addItemToPlaylist,
      removeItemFromPlaylist,
      movePlaylistItem,
      recordExamResult,
      awardGameXp,
      toggleBookmarkQuestion,
      markQuestionMastered,
      reportQuestionIssue,
      removeQuestionIssueReport,
      clearAllQuestionIssueReports,
      setSkipReportedInExams,
      activeTab,
      setActiveTab,
      studyNavTarget,
      navigateToStudy,
      clearStudyNavTarget,
      examNavTarget,
      navigateToExam,
      clearExamNavTarget,
      fihristNavTarget,
      navigateToFihrist,
      clearFihristNavTarget,
      isExamActive,
      isGameArenaActive,
      isMemorizationZenActive,
      isMobileReaderImmersive,
      isAudioBarExpanded,
      isAudioBarMinimized,
      selectedVerseKey,
      registerReaderSmartPlay,
      triggerSmartReaderPlay,
      quickMemorizeSeed,
      openQuickMemorize,
      closeQuickMemorize,
      quickResearchSeed,
      openQuickResearch,
      closeQuickResearch,
      memorizeLaunchTarget,
      navigateToMemorizeUnit,
      clearMemorizeLaunchTarget,
      isSidebarCollapsed,
      toggleSidebarCollapsed,
      setSidebarCollapsed,
      isPresentationOpen,
      openPresentationMode,
      closePresentationMode,
      isPoolModalOpen,
      openPoolModal,
      closePoolModal,
      isSettingsModalOpen,
      openSettingsModal,
      closeSettingsModal,
      isReciterSelectorOpen,
      reciterSelectorContext,
      openReciterSelector,
      closeReciterSelector,
      isMealSelectorOpen,
      mealSelectorTarget,
      openMealSelector,
      closeMealSelector,
      compareTarget,
      openMealCompare,
      closeMealCompare,
      mutashabihatTarget,
      openMutashabihat,
      closeMutashabihat,
      isWaqfGuideOpen,
      openWaqfGuide,
      closeWaqfGuide,
      isBookmarksDrawerOpen,
      openBookmarksDrawer,
      closeBookmarksDrawer,
      isHatimModalOpen,
      openHatimModal,
      closeHatimModal,
      verseNoteTarget,
      openVerseNoteModal,
      closeVerseNoteModal,
      isSearchModalOpen,
      openSearchModal,
      closeSearchModal,
      isUserGuideOpen,
      userGuideTab,
      openUserGuide,
      closeUserGuide,
      feedbackSeed,
      isFeedbackModalOpen,
      openFeedbackModal,
      closeFeedbackModal,
      isListeningDrawerOpen,
      listeningDrawerSeed,
      openListeningDrawer,
      closeListeningDrawer,
      isIntroOpen,
      introDismissed,
      openIntroSplash,
      closeIntroSplash,
      manifest,
      meta,
      questionIndex,
      questionIndexError,
      retryLoadQuestionIndex,
      isLoadingCore,
      coreError,
      dataSourceMode,
      retryCoreLoad,
      activateDemoData,
      poolStats,
      isOnline,
      canInstallPwa,
      isPwaInstalled,
      isIosDevice,
      promptPwaInstall,
      storageQuotaWarning,
      dismissStorageQuotaWarning,
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
