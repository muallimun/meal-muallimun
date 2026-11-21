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
import {
  DEFAULT_FAVORITE_MEAL_IDS,
  DEFAULT_PRIMARY_MEAL_ID,
  DEFAULT_SECONDARY_MEAL_ID,
  findMealById,
} from '../config/mealsConfig';
import { dataService, type DataSourceMode } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import type {
  MemorizeLaunchTarget,
  QuickMemorizeSeed,
} from '../types/memorization';
import type {
  AppSettings,
  AudioPlayMode,
  AudioPrefs,
  ExamHistoryRecord,
  ExamMode,
  ExamNavigationTarget,
  GamificationState,
  LastReadPosition,
  ManifestData,
  MealDisplayMode,
  MealKey,
  MetaData,
  NavTab,
  PageBookmark,
  PageBookmarkColor,
  PageLayoutMode,
  PersistedAppState,
  PoolStatsSummary,
  QuestionAuditState,
  QuestionIndexFile,
  QuestionIssueReason,
  QuestionIssueReport,
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

export const STORAGE_KEY = 'muallimun_meal_v1';
export const INTRO_DISMISSED_KEY = 'muallimun_intro_dismissed_v1';
export const SIDEBAR_COLLAPSED_KEY = 'muallimun_sidebar_collapsed_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'cream',
  preferredMeal: 'm1',
  primaryMealId: DEFAULT_PRIMARY_MEAL_ID,
  secondaryMealId: DEFAULT_SECONDARY_MEAL_ID,
  mealDisplayMode: 'single',
  favoriteMealIds: [...DEFAULT_FAVORITE_MEAL_IDS],
  compareMealIds: [],
  arabicFont: ARABIC_FONTS[0].label, // 'Elif Mushaf Hattı'
  turkishFont: TURKISH_FONTS[0].label, // 'Plus Jakarta Sans'
  arabicFontSize: 28,
  turkishFontSize: 16,
  sfxEnabled: true,
  sfxVolume: 0.75,
  showOptionLettersInApp: false,
  wordByWordEnabled: true,
  showFootnotes: true,
  highlightSajdah: true,
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
  pageLayout: 'single',
  mushafSidePanelOpen: true,
};

export const DEFAULT_STUDY_PROGRESS: StudyProgress = {
  lastRead: null,
  bookmarkedAyahIds: [],
  pageBookmarks: [],
};

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  mode: 'ar',
  arabicAudioSource: 'hatim',
  arabicReciterId: 'hatim',
  favoriteReciterIds: ['hatim'],
  mealAudioSource: 'tdv',
  playbackRate: 1,
  repeatCount: 1,
  autoScroll: true,
};

function resolveAudioModeForStudyPrefs(prefs: StudyPrefs): AudioPlayMode {
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
    if (!raw) {
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

    const rawStudyPrefs = parsed.studyPrefs as
      | (Partial<StudyPrefs> & { pageLayout?: string })
      | undefined;
    const hydratedPageLayout: PageLayoutMode =
      rawStudyPrefs?.pageLayout === 'double_mushaf' ||
      rawStudyPrefs?.pageLayout === 'double_meal' ||
      rawStudyPrefs?.pageLayout === 'meal_only' ||
      rawStudyPrefs?.pageLayout === 'single'
        ? rawStudyPrefs.pageLayout
        : rawStudyPrefs?.pageLayout === 'double'
          ? 'double_mushaf'
          : DEFAULT_STUDY_PREFS.pageLayout;

    const studyPrefs: StudyPrefs = {
      viewMode:
        rawStudyPrefs?.viewMode === 'mushaf' ||
        rawStudyPrefs?.viewMode === 'cards' ||
        rawStudyPrefs?.viewMode === 'book'
          ? rawStudyPrefs.viewMode
          : DEFAULT_STUDY_PREFS.viewMode,
      wordMode:
        rawStudyPrefs?.wordMode === 'off' ||
        rawStudyPrefs?.wordMode === 'visible' ||
        rawStudyPrefs?.wordMode === 'quiz'
          ? rawStudyPrefs.wordMode
          : DEFAULT_STUDY_PREFS.wordMode,
      bookContentMode:
        rawStudyPrefs?.bookContentMode === 'ar_only' ||
        rawStudyPrefs?.bookContentMode === 'meal_only' ||
        rawStudyPrefs?.bookContentMode === 'interleaved'
          ? rawStudyPrefs.bookContentMode
          : DEFAULT_STUDY_PREFS.bookContentMode,
      mealAudioFocusOnly:
        typeof rawStudyPrefs?.mealAudioFocusOnly === 'boolean'
          ? rawStudyPrefs.mealAudioFocusOnly
          : DEFAULT_STUDY_PREFS.mealAudioFocusOnly,
      pageLayout: hydratedPageLayout,
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
      repeatCount:
        rawAudio?.repeatCount === 1 ||
        rawAudio?.repeatCount === 2 ||
        rawAudio?.repeatCount === 3
          ? rawAudio.repeatCount
          : DEFAULT_AUDIO_PREFS.repeatCount,
      autoScroll:
        typeof rawAudio?.autoScroll === 'boolean'
          ? rawAudio.autoScroll
          : DEFAULT_AUDIO_PREFS.autoScroll,
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
  recordExamResult: (input: RecordExamResultInput) => RecordExamResultOutput;
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
  isExamActive: boolean;
  setIsExamActive: (active: boolean) => void;
  isMemorizationZenActive: boolean;
  setIsMemorizationZenActive: (active: boolean) => void;
  isMobileReaderImmersive: boolean;
  setIsMobileReaderImmersive: (active: boolean) => void;
  isAudioBarExpanded: boolean;
  setIsAudioBarExpanded: (expanded: boolean) => void;
  quickMemorizeSeed: QuickMemorizeSeed | null;
  openQuickMemorize: (surah: number, ayah: number, page?: number) => void;
  closeQuickMemorize: () => void;
  memorizeLaunchTarget: MemorizeLaunchTarget | null;
  navigateToMemorizeUnit: (unitId: string, autoStart?: boolean) => void;
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
  isBookmarksDrawerOpen: boolean;
  openBookmarksDrawer: () => void;
  closeBookmarksDrawer: () => void;
  isSearchModalOpen: boolean;
  openSearchModal: () => void;
  closeSearchModal: () => void;
  isIntroOpen: boolean;
  introDismissed: boolean;
  openIntroSplash: () => void;
  closeIntroSplash: (dontShowAgain?: boolean) => void;

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

  // PWA & Bağlantı Durumu
  isOnline: boolean;
  canInstallPwa: boolean;
  isPwaInstalled: boolean;
  isIosDevice: boolean;
  promptPwaInstall: () => Promise<boolean>;
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
  const [isExamActive, setIsExamActive] = useState(false);
  const [isMemorizationZenActive, setIsMemorizationZenActive] = useState(false);
  const [isMobileReaderImmersive, setIsMobileReaderImmersive] = useState(false);
  const [isAudioBarExpanded, setIsAudioBarExpanded] = useState(false);
  const [quickMemorizeSeed, setQuickMemorizeSeed] = useState<QuickMemorizeSeed | null>(null);

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
  const [isReciterSelectorOpen, setIsReciterSelectorOpen] = useState(false);
  const [reciterSelectorContext, setReciterSelectorContext] = useState<'default' | 'memorize'>(
    'default',
  );
  const [isMealSelectorOpen, setIsMealSelectorOpen] = useState(false);
  const [mealSelectorTarget, setMealSelectorTarget] = useState<'primary' | 'secondary'>('primary');
  const [compareTarget, setCompareTarget] = useState<{ surah: number; ayah: number } | null>(null);
  const [isBookmarksDrawerOpen, setIsBookmarksDrawerOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [introDismissed, setIntroDismissed] = useState<boolean>(() => readIntroDismissed());
  const [isIntroOpen, setIsIntroOpen] = useState<boolean>(() => !readIntroDismissed());

  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [questionIndex, setQuestionIndex] = useState<QuestionIndexFile | null>(null);
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

  // Kalıcı localStorage kaydı
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Depolama kotası dolu veya gizli sekme kısıtlıysa sessizce devam et
    }
  }, [persisted]);

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
      themeColorMeta.setAttribute('content', theme === 'dark' ? '#0B1314' : '#0F766E');
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

      return {
        ...prev,
        settings: {
          ...prev.settings,
          ...patch,
          primaryMealId: nextPrimary,
          secondaryMealId: nextSecondary,
          mealDisplayMode: nextDisplayMode,
          preferredMeal: nextPreferredMeal,
        },
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

  const updateStudyPrefs = useCallback((patch: Partial<StudyPrefs>) => {
    setPersisted((prev) => {
      const nextStudyPrefs: StudyPrefs = {
        ...prev.studyPrefs,
        ...patch,
      };
      const shouldSyncAudioMode =
        patch.viewMode !== undefined ||
        patch.pageLayout !== undefined ||
        patch.bookContentMode !== undefined;
      return {
        ...prev,
        studyPrefs: nextStudyPrefs,
        ...(shouldSyncAudioMode
          ? {
              audioPrefs: {
                ...prev.audioPrefs,
                mode: resolveAudioModeForStudyPrefs(nextStudyPrefs),
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
    setActiveTabState(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToStudy = useCallback((target: Omit<StudyNavigationTarget, 'nonce'>) => {
    sfxService.play('click');
    if (target.viewMode) {
      setPersisted((prev) => ({
        ...prev,
        studyPrefs: {
          ...prev.studyPrefs,
          viewMode: target.viewMode!,
        },
      }));
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

  const openQuickMemorize = useCallback((surah: number, ayah: number, page?: number) => {
    sfxService.play('click');
    setQuickMemorizeSeed({ surah, ayah, page, nonce: Date.now() });
  }, []);

  const closeQuickMemorize = useCallback(() => {
    setQuickMemorizeSeed(null);
  }, []);

  const navigateToMemorizeUnit = useCallback((unitId: string, autoStart = true) => {
    sfxService.play('click');
    setIsExamActive(false);
    setMemorizeLaunchTarget({ unitId, autoStart, nonce: Date.now() });
    setActiveTabState('memorize');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const clearMemorizeLaunchTarget = useCallback(() => {
    setMemorizeLaunchTarget(null);
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

  const openBookmarksDrawer = useCallback(() => {
    sfxService.play('click');
    setIsBookmarksDrawerOpen(true);
  }, []);

  const closeBookmarksDrawer = useCallback(() => {
    setIsBookmarksDrawerOpen(false);
  }, []);

  const openSearchModal = useCallback(() => {
    sfxService.play('click');
    setIsSearchModalOpen(true);
  }, []);

  const closeSearchModal = useCallback(() => {
    setIsSearchModalOpen(false);
  }, []);

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
      recordExamResult,
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
      isExamActive,
      setIsExamActive,
      isMemorizationZenActive,
      setIsMemorizationZenActive,
      isMobileReaderImmersive,
      setIsMobileReaderImmersive,
      isAudioBarExpanded,
      setIsAudioBarExpanded,
      quickMemorizeSeed,
      openQuickMemorize,
      closeQuickMemorize,
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
      isBookmarksDrawerOpen,
      openBookmarksDrawer,
      closeBookmarksDrawer,
      isSearchModalOpen,
      openSearchModal,
      closeSearchModal,
      isIntroOpen,
      introDismissed,
      openIntroSplash,
      closeIntroSplash,
      manifest,
      meta,
      questionIndex,
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
    }),
    [
      persisted.settings,
      persisted.studyPool,
      persisted.studyPrefs,
      persisted.studyProgress,
      persisted.audioPrefs,
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
      recordExamResult,
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
      isExamActive,
      isMemorizationZenActive,
      isMobileReaderImmersive,
      isAudioBarExpanded,
      quickMemorizeSeed,
      openQuickMemorize,
      closeQuickMemorize,
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
      isBookmarksDrawerOpen,
      openBookmarksDrawer,
      closeBookmarksDrawer,
      isSearchModalOpen,
      openSearchModal,
      closeSearchModal,
      isIntroOpen,
      introDismissed,
      openIntroSplash,
      closeIntroSplash,
      manifest,
      meta,
      questionIndex,
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
