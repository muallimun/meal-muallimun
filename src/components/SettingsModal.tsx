import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudDownload,
  Download,
  HardDrive,
  Headphones,
  Info,
  Loader2,
  MessageSquareHeart,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  Sun,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  applyStudyDeskProfile,
  countEnabledDeskRows,
  DEFAULT_DESK_PREFS,
  getStudyDeskProfileLabel,
  STUDY_DESK_PROFILES,
  STUDY_DESK_TOGGLES,
  toggleStudyDeskRow,
} from '../config/studyDeskConfig';
import { findMealById, getAllMeals } from '../config/mealsConfig';
import {
  findReciterById,
  formatReciterBadge,
  getAllReciters,
  RECITER_CATEGORIES,
} from '../config/recitersConfig';
import { audioQueueService } from '../services/audioQueueService';
import { useBackButtonGuard } from '../services/backStackService';
import {
  HATIM_STORAGE_KEY,
  validateHatimBackupJson,
} from '../services/hatimStorage';
import {
  memorizationStorage,
  validateMemorizationBackupPayload,
} from '../services/memorizationStorage';
import { RESEARCH_NOTEBOOK_STORAGE_KEY } from '../services/researchStorage';
import { sfxService } from '../services/sfxService';
import {
  VERSE_NOTES_STORAGE_KEY,
  validateVerseNotesJson,
} from '../services/verseNotesStorage';
import { setStorePersistencePaused, useAppStore } from '../store/useAppStore';
import { setAllPersistencePaused } from '../utils/storageQuotaBus';
import type { MemorizationBackupPayload } from '../types/memorization';
import type { ExamSessionState, ThemeMode } from '../types/quran';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import {
  clearActiveExamSession,
  loadActiveExamSession,
  saveActiveExamSession,
  validateExamSessionPayload,
} from '../utils/examUtils';
import { PwaInstallControl } from './PwaInstallControl';
import { OfflinePackCard } from './OfflinePackCard';
import {
  applyPwaUpdate,
  checkForPwaUpdate,
  isPwaUpdateAvailable,
  subscribePwaUpdate,
} from '../utils/pwaUtils';

const MAX_BACKUP_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

const JSON_LOCAL_STORAGE_KEYS = new Set<string>([
  'muallimun_meal_v1',
  RESEARCH_NOTEBOOK_STORAGE_KEY,
  HATIM_STORAGE_KEY,
  VERSE_NOTES_STORAGE_KEY,
  'muallimun_games_progress_v1',
  'muallimun_recent_searches_v1',
  'muallimun_offline_pack_status_v1',
  'muallimun_memorization_v1_units',
  'muallimun_memorization_v1_prefs',
  'muallimun_memorization_v1_active_session',
  'muallimun_memorization_v1_classical_plan',
  'muallimun_memorization_v1_timestamps',
]);

interface PendingBackupPreview {
  fileName: string;
  exportedAt: string | null;
  backupVersion: number;
  hasFullStorage: boolean;
  localStorageEntries: Record<string, string>;
  memorizationPayload: unknown | null;
  hasActiveExamSessionField: boolean;
  activeExamSession: ExamSessionState | null;
  localKeysCount: number;
  memorizationUnitsCount: number;
  classicalHifzSummary: string;
  researchTopicsCount: number;
  verseNotesCount: number;
  hasActiveHatim: boolean;
  hatimCompletedPagesCount: number;
  hatimPercent: number;
  hatimHistoryCount: number;
  gamePlayedTiersCount: number;
  gameTotalStars: number;
  deskProfileLabel: string | null;
  hasActiveMemorizationSession: boolean;
  hasActiveExamSession: boolean;
}

function formatBackupDate(iso: string | null): string {
  if (!iso) return 'Belirtilmemiş';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'Belirtilmemiş';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(dt);
  } catch {
    return dt.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function countResearchTopicsFromJson(rawJson: string | undefined): number {
  if (!rawJson) return 0;
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { topics?: unknown }).topics)) {
      return (parsed as { topics: unknown[] }).topics.length;
    }
    return 0;
  } catch {
    return 0;
  }
}

function summarizeClassicalPlan(plan: unknown): string {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return 'Başlatılmamış';
  const rec = plan as { currentRound?: unknown; hasPages?: unknown };
  const round =
    typeof rec.currentRound === 'number' && Number.isFinite(rec.currentRound)
      ? Math.max(1, Math.min(24, Math.floor(rec.currentRound)))
      : null;
  const hasCount = Array.isArray(rec.hasPages) ? rec.hasPages.length : 0;
  if (round === null) return 'Başlatılmamış';
  return `${round}. Tur · ${hasCount}/604 Has s.`;
}

function summarizeGamesProgressFromJson(rawJson: string | undefined): {
  tiersCount: number;
  totalStars: number;
} {
  if (!rawJson) return { tiersCount: 0, totalStars: 0 };
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { tiersCount: 0, totalStars: 0 };
    }
    let tiersCount = 0;
    let totalStars = 0;
    for (const entry of Object.values(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as { playsCount?: unknown; bestStars?: unknown };
      const plays = typeof rec.playsCount === 'number' && rec.playsCount > 0 ? rec.playsCount : 0;
      const stars = typeof rec.bestStars === 'number' && rec.bestStars > 0 ? rec.bestStars : 0;
      if (plays > 0 || stars > 0) {
        tiersCount += 1;
        totalStars += stars;
      }
    }
    return { tiersCount, totalStars };
  } catch {
    return { tiersCount: 0, totalStars: 0 };
  }
}

function extractDeskProfileLabelFromJson(rawJson: string | undefined): string | null {
  if (!rawJson) return null;
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const settingsRec = (parsed as { settings?: unknown }).settings;
    if (!settingsRec || typeof settingsRec !== 'object' || Array.isArray(settingsRec)) return null;
    const deskPrefs = (settingsRec as { deskPrefs?: unknown }).deskPrefs;
    if (!deskPrefs || typeof deskPrefs !== 'object' || Array.isArray(deskPrefs)) return null;
    const profile = (deskPrefs as { profile?: unknown }).profile;
    if (
      profile === 'all' ||
      profile === 'reading_hatim' ||
      profile === 'hifz' ||
      profile === 'exam_student' ||
      profile === 'custom'
    ) {
      return getStudyDeskProfileLabel(profile);
    }
    return null;
  } catch {
    return null;
  }
}

type SettingsTabId = 'general' | 'offline' | 'backup';

const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'general', label: 'Genel & Görünüm', shortLabel: 'Genel', icon: SlidersHorizontal },
  { id: 'offline', label: 'Çevrimdışı & Kurulum', shortLabel: 'Çevrimdışı', icon: CloudDownload },
  { id: 'backup', label: 'Yedekleme & Veri', shortLabel: 'Yedekleme', icon: HardDrive },
];

const THEME_OPTIONS: {
  id: ThemeMode;
  label: string;
  desc: string;
  swatch: string;
  accent: string;
  border: string;
}[] = [
  {
    id: 'light',
    label: 'Açık',
    desc: 'Ferah beyaz',
    swatch: '#FFFFFF',
    accent: '#0F766E',
    border: '#CBD5E1',
  },
  {
    id: 'cream',
    label: 'Krem Mushaf',
    desc: 'Sıcak kâğıt',
    swatch: '#FAF6EE',
    accent: '#B45309',
    border: '#D6C7A9',
  },
  {
    id: 'dark',
    label: 'Gece',
    desc: 'Göz dostu',
    swatch: '#0B1314',
    accent: '#2DD4BF',
    border: '#334155',
  },
];

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    settings,
    audioPrefs,
    updateSettings,
    setMealDisplayMode,
    resetSettings,
    openIntroSplash,
    openReciterSelector,
    openMealSelector,
    openFeedbackModal,
    manifest,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );
  const pwaUpdateReady = useSyncExternalStore(
    subscribePwaUpdate,
    isPwaUpdateAvailable,
  );

  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [isCheckingPwaUpdate, setIsCheckingPwaUpdate] = useState(false);
  const [pwaUpdateMessage, setPwaUpdateMessage] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleManualPwaUpdateCheck = async () => {
    sfxService.play('click');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPwaUpdateMessage('Çevrimdışı görünüyorsunuz. Güncelleme denetimi için internet bağlantısı gerekir.');
      return;
    }
    setIsCheckingPwaUpdate(true);
    setPwaUpdateMessage(null);
    try {
      const hasUpdate = await checkForPwaUpdate();
      setPwaUpdateMessage(
        hasUpdate
          ? 'Yeni sürüm bulundu! Yüklemek için aşağıdaki düğmeye dokunabilirsiniz.'
          : 'Uygulamanız güncel.',
      );
    } finally {
      setIsCheckingPwaUpdate(false);
    }
  };
  const [pendingBackupRestore, setPendingBackupRestore] = useState<PendingBackupPreview | null>(
    null,
  );
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [isReloadingAfterRestore, setIsReloadingAfterRestore] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  useBackButtonGuard('settings_modal', isSettingsModalOpen, closeSettingsModal);

  useEffect(() => {
    if (!isSettingsModalOpen) {
      setPendingBackupRestore(null);
      return;
    }
    return acquireBodyScrollLock();
  }, [isSettingsModalOpen]);

  const exportCurrentBackupFile = async (): Promise<{
    localKeysCount: number;
    memorizationUnitsCount: number;
  }> => {
    const localEntries: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('muallimun')) continue;
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        localEntries[key] = val;
      }
    }

    const memorizationPayload = await memorizationStorage.createBackupPayload();
    const activeExamSession = loadActiveExamSession();

    const fullBackup = {
      app: 'muallimun-kuran-full-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      localStorage: localEntries,
      memorization: memorizationPayload,
      activeExamSession,
    };

    const jsonStr = JSON.stringify(fullBackup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `muallimun-kuran-yedek-${dateStamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    return {
      localKeysCount: Object.keys(localEntries).length,
      memorizationUnitsCount: memorizationPayload.units.length,
    };
  };

  const handleExportFullBackup = async () => {
    sfxService.play('click');
    setIsBackupBusy(true);
    setBackupStatus(null);
    try {
      const summary = await exportCurrentBackupFile();
      setBackupStatus({
        type: 'success',
        text: `Yedek indirildi (${summary.localKeysCount} kayıt alanı ve ${summary.memorizationUnitsCount} ezber birimi).`,
      });
    } catch {
      setBackupStatus({
        type: 'error',
        text: 'Yedek dosyası hazırlanırken bir hata oluştu.',
      });
    } finally {
      setIsBackupBusy(false);
    }
  };

  // Aşama 1: Dosyayı bellekte doğrula ve önizleme oluştur (depolamaya SIFIR yazım)
  const handleImportFullBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsBackupBusy(true);
    setBackupStatus(null);
    setPendingBackupRestore(null);

    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error(
          'Yedek dosyası 15 MB sınırını aşıyor. Lütfen geçerli bir Muallimun yedeği seçin.',
        );
      }

      const rawText = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error('Seçilen dosya geçerli bir JSON biçiminde değil.');
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Geçersiz JSON yedek dosyası.');
      }

      const record = parsed as {
        app?: unknown;
        version?: unknown;
        exportedAt?: unknown;
        localStorage?: unknown;
        memorization?: unknown;
        activeExamSession?: unknown;
        units?: unknown;
      };

      const hasFullStorage =
        Boolean(record.localStorage) &&
        typeof record.localStorage === 'object' &&
        !Array.isArray(record.localStorage);

      const rawMemorizationCandidate =
        record.memorization && typeof record.memorization === 'object'
          ? record.memorization
          : record.app === 'muallimun-memorization' && Array.isArray(record.units)
            ? record
            : null;

      if (!hasFullStorage && !rawMemorizationCandidate) {
        throw new Error('Bu dosya geçerli bir Muallimun çalışma yedeği içermiyor.');
      }

      const validatedLocalEntries: Record<string, string> = {};
      if (hasFullStorage) {
        for (const [key, value] of Object.entries(
          record.localStorage as Record<string, unknown>,
        )) {
          if (!key.startsWith('muallimun')) continue;
          let serialized: string;
          if (typeof value === 'string') {
            serialized = value;
          } else if (value !== null && value !== undefined) {
            serialized = JSON.stringify(value);
          } else {
            continue;
          }

          if (JSON_LOCAL_STORAGE_KEYS.has(key)) {
            try {
              JSON.parse(serialized);
            } catch {
              throw new Error(
                `Yedek dosyasındaki "${key}" alanı bozuk JSON içeriyor; işlem iptal edildi.`,
              );
            }
          }
          validatedLocalEntries[key] = serialized;
        }

        if (Object.keys(validatedLocalEntries).length === 0 && !rawMemorizationCandidate) {
          throw new Error('Yedek dosyasında geri yüklenecek Muallimun kaydı bulunamadı.');
        }
      }

      let validatedMemorizationPayload: unknown | null = null;
      let memorizationUnitsFromPayload: number | null = null;
      let classicalPlanFromPayload: unknown = null;
      let hasMemActiveSessionFromPayload = false;
      let memorizationExportedAt: string | null = null;

      if (rawMemorizationCandidate) {
        const check = validateMemorizationBackupPayload(rawMemorizationCandidate);
        if (!check.valid) {
          throw new Error(check.error || 'Ezber yedek verisi doğrulanamadı.');
        }
        validatedMemorizationPayload = rawMemorizationCandidate;
        memorizationUnitsFromPayload = check.unitsCount;
        classicalPlanFromPayload = check.classicalPlan ?? null;
        hasMemActiveSessionFromPayload = check.hasActiveSession;
        const memRec = rawMemorizationCandidate as { exportedAt?: unknown };
        if (typeof memRec.exportedAt === 'string' && memRec.exportedAt.trim()) {
          memorizationExportedAt = memRec.exportedAt;
        }
      }

      const hasActiveExamSessionField = 'activeExamSession' in record;
      let validatedExamSession: ExamSessionState | null = null;
      if (
        hasActiveExamSessionField &&
        record.activeExamSession !== null &&
        record.activeExamSession !== undefined
      ) {
        const validExam = validateExamSessionPayload(record.activeExamSession);
        if (!validExam) {
          throw new Error('Yedekteki aktif sınav oturumu geçersiz biçimde; işlem iptal edildi.');
        }
        validatedExamSession = validExam;
      }

      const exportedAt =
        typeof record.exportedAt === 'string' && record.exportedAt.trim()
          ? record.exportedAt
          : memorizationExportedAt;
      const backupVersion =
        typeof record.version === 'number' && Number.isFinite(record.version) ? record.version : 1;

      const localKeysCount = Object.keys(validatedLocalEntries).length;
      const memorizationUnitsCount =
        memorizationUnitsFromPayload !== null
          ? memorizationUnitsFromPayload
          : (() => {
              const rawUnits = validatedLocalEntries['muallimun_memorization_v1_units'];
              if (!rawUnits) return 0;
              try {
                const arr = JSON.parse(rawUnits);
                return Array.isArray(arr) ? arr.length : 0;
              } catch {
                return 0;
              }
            })();

      const classicalHifzSummary = (() => {
        if (classicalPlanFromPayload) {
          return summarizeClassicalPlan(classicalPlanFromPayload);
        }
        const rawClassical = validatedLocalEntries['muallimun_memorization_v1_classical_plan'];
        if (!rawClassical || rawClassical === 'null') return 'Başlatılmamış';
        try {
          return summarizeClassicalPlan(JSON.parse(rawClassical));
        } catch {
          return 'Başlatılmamış';
        }
      })();

      const researchTopicsCount = countResearchTopicsFromJson(
        validatedLocalEntries[RESEARCH_NOTEBOOK_STORAGE_KEY],
      );

      let verseNotesCount = 0;
      if (validatedLocalEntries[VERSE_NOTES_STORAGE_KEY]) {
        const notesCheck = validateVerseNotesJson(validatedLocalEntries[VERSE_NOTES_STORAGE_KEY]);
        if (!notesCheck.valid) {
          throw new Error('Yedekteki kişisel ayet notları verisi doğrulanamadı; işlem iptal edildi.');
        }
        verseNotesCount = notesCheck.notesCount;
      }

      let hasActiveHatim = false;
      let hatimCompletedPagesCount = 0;
      let hatimHistoryCount = 0;
      if (validatedLocalEntries[HATIM_STORAGE_KEY]) {
        const hatimCheck = validateHatimBackupJson(validatedLocalEntries[HATIM_STORAGE_KEY]);
        if (!hatimCheck.valid) {
          throw new Error('Yedekteki 30 Cüz Hatim planı verisi doğrulanamadı; işlem iptal edildi.');
        }
        hasActiveHatim = hatimCheck.hasActivePlan;
        hatimCompletedPagesCount = hatimCheck.completedPagesCount;
        hatimHistoryCount = hatimCheck.historyCount;
      }
      const hatimPercent = Math.min(100, Math.round((hatimCompletedPagesCount / 604) * 100));

      const gamesSummary = summarizeGamesProgressFromJson(
        validatedLocalEntries['muallimun_games_progress_v1'],
      );
      const deskProfileLabel = extractDeskProfileLabelFromJson(
        validatedLocalEntries['muallimun_meal_v1'],
      );

      const hasActiveMemorizationSession = Boolean(
        hasMemActiveSessionFromPayload ||
          (validatedLocalEntries['muallimun_memorization_v1_active_session'] &&
            validatedLocalEntries['muallimun_memorization_v1_active_session'] !== 'null'),
      );

      sfxService.play('click');
      setPendingBackupRestore({
        fileName: file.name,
        exportedAt,
        backupVersion,
        hasFullStorage,
        localStorageEntries: validatedLocalEntries,
        memorizationPayload: validatedMemorizationPayload,
        hasActiveExamSessionField,
        activeExamSession: validatedExamSession,
        localKeysCount,
        memorizationUnitsCount,
        classicalHifzSummary,
        researchTopicsCount,
        verseNotesCount,
        hasActiveHatim,
        hatimCompletedPagesCount,
        hatimPercent,
        hatimHistoryCount,
        gamePlayedTiersCount: gamesSummary.tiersCount,
        gameTotalStars: gamesSummary.totalStars,
        deskProfileLabel,
        hasActiveMemorizationSession,
        hasActiveExamSession: Boolean(validatedExamSession),
      });
    } catch (err) {
      setBackupStatus({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Seçilen dosya geçerli bir Muallimun yedeği değil.',
      });
    } finally {
      setIsBackupBusy(false);
    }
  };

  // Aşama 2: Onay sonrası atomik uygulama + hata halinde eksiksiz rollback
  const handleConfirmBackupRestore = async (downloadCurrentFirst: boolean) => {
    if (!pendingBackupRestore) return;

    sfxService.play('click');
    setIsBackupBusy(true);
    setBackupStatus(null);

    if (downloadCurrentFirst) {
      try {
        await exportCurrentBackupFile();
      } catch {
        setBackupStatus({
          type: 'error',
          text: 'Mevcut veriniz indirilemediği için geri yükleme başlatılmadı.',
        });
        setIsBackupBusy(false);
        return;
      }
    }

    const pending = pendingBackupRestore;

    // 1) Mevcut durumun eksiksiz rollback anlık görüntüsünü al
    const prevLocalEntries: Record<string, string> = {};
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith('muallimun')) continue;
        const val = window.localStorage.getItem(key);
        if (val !== null) {
          prevLocalEntries[key] = val;
        }
      }
    } catch {
      setBackupStatus({
        type: 'error',
        text: 'Tarayıcı yerel depolama alanı okunamadığı için geri yükleme güvenli biçimde iptal edildi.',
      });
      setIsBackupBusy(false);
      return;
    }

    const prevExamSession = loadActiveExamSession();
    let prevMemorization: MemorizationBackupPayload | null = null;
    try {
      prevMemorization = await memorizationStorage.createBackupPayload();
    } catch {
      prevMemorization = null;
    }

    // 2) Tüm otomatik depolama yazımlarını duraklat ki mevcut bellek state'i geri yüklemeyi ezmesin
    setStorePersistencePaused(true);
    setAllPersistencePaused(true);

    try {
      if (pending.hasFullStorage) {
        const existingKeys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith('muallimun')) {
            existingKeys.push(key);
          }
        }
        for (const key of existingKeys) {
          if (!(key in pending.localStorageEntries)) {
            window.localStorage.removeItem(key);
          }
        }
        for (const [key, value] of Object.entries(pending.localStorageEntries)) {
          window.localStorage.setItem(key, value);
        }
      }

      if (pending.hasActiveExamSessionField) {
        if (pending.activeExamSession) {
          saveActiveExamSession(pending.activeExamSession);
        } else {
          clearActiveExamSession();
        }
      }

      if (pending.memorizationPayload) {
        await memorizationStorage.importBackupPayload(pending.memorizationPayload, 'replace');
      }

      setPendingBackupRestore(null);
      setIsReloadingAfterRestore(true);
      sfxService.play('correct');
      setBackupStatus({
        type: 'success',
        text: 'Yedek atomik olarak geri yüklendi. Uygulama yenileniyor...',
      });
      window.setTimeout(() => {
        window.location.reload();
      }, 650);
    } catch (err) {
      // Hata oluştuysa tüm katmanları rollback anlık görüntüsüne geri döndür
      try {
        const currentKeys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith('muallimun')) {
            currentKeys.push(key);
          }
        }
        for (const key of currentKeys) {
          window.localStorage.removeItem(key);
        }
        for (const [key, value] of Object.entries(prevLocalEntries)) {
          window.localStorage.setItem(key, value);
        }
      } catch {
        // ignore rollback storage error
      }

      try {
        if (prevExamSession) {
          saveActiveExamSession(prevExamSession);
        } else {
          clearActiveExamSession();
        }
      } catch {
        // ignore
      }

      if (prevMemorization) {
        try {
          await memorizationStorage.importBackupPayload(prevMemorization, 'replace');
        } catch {
          // ignore
        }
      }

      setAllPersistencePaused(false);
      setStorePersistencePaused(false);
      setIsReloadingAfterRestore(false);
      setBackupStatus({
        type: 'error',
        text:
          err instanceof Error
            ? `Geri yükleme tamamlanamadı (${err.message}). Mevcut verileriniz korundu.`
            : 'Geri yükleme sırasında hata oluştu. Mevcut verileriniz korundu.',
      });
      setIsBackupBusy(false);
    }
  };

  const allMeals = useMemo(() => getAllMeals(manifest), [manifest]);
  const activePrimaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const activeSecondaryMeal = useMemo(
    () => findMealById(settings.secondaryMealId, manifest),
    [settings.secondaryMealId, manifest],
  );
  const isDualMeal = settings.mealDisplayMode === 'dual' || settings.preferredMeal === 'both';

  const allReciters = useMemo(() => getAllReciters(manifest), [manifest]);
  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );
  const activeReciterCategory = useMemo(
    () => RECITER_CATEGORIES.find((c) => c.id === activeReciter.category),
    [activeReciter.category],
  );
  const activeReciterBadge = formatReciterBadge(activeReciter);
  const isPreviewingActive =
    audioState.previewReciterId === activeReciter.id &&
    (audioState.previewStatus === 'playing' || audioState.previewStatus === 'loading');

  if (!isSettingsModalOpen) return null;

  const handleTestSfx = () => {
    sfxService.play('correct');
  };

  return (
    <div
      className={`fixed inset-0 z-[92] flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px] ${
        isReloadingAfterRestore ? 'pointer-events-none select-none' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isReloadingAfterRestore) closeSettingsModal();
      }}
    >
      <div
        className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto md:max-w-2xl lg:max-w-3xl sm:max-h-[86dvh] rounded-none sm:rounded-2xl border-0 sm:border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="sticky top-0 z-10 px-4 pt-[max(0.625rem,env(safe-area-inset-top,0px))] pb-2.5 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div className="min-w-0">
            <h2 id="settings-modal-title" className="text-sm sm:text-lg font-extrabold tracking-tight truncate">
              Ayarlar ve Kişiselleştirme
            </h2>
            <p className="hidden sm:block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              Tüm tercihler cihazınızda otomatik olarak saklanır.
            </p>
          </div>
          <button
            type="button"
            onClick={closeSettingsModal}
            aria-label="Ayarları kapat"
            title="Ayarları kapat"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center cursor-pointer shrink-0 transition-colors hover:bg-[var(--bg-surface-soft)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* 3 Sade Sekme Şeridi: Genel & Görünüm | Çevrimdışı & Kurulum | Yedekleme & Veri */}
        <div
          className="px-3 sm:px-4 py-2 border-b shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="grid grid-cols-3 gap-1">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setActiveTab(tab.id);
                  }}
                  className="min-h-[40px] px-1.5 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate hidden sm:inline">{tab.label}</span>
                  <span className="truncate sm:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sekme İçerikleri */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 pb-[max(2.25rem,env(safe-area-inset-bottom,0px))] space-y-5">
          {/* ================================================================
              SEKME 1: GENEL & GÖRÜNÜM
              ================================================================ */}
          {activeTab === 'general' && (
            <>
              {/* Tema Seçici */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Uygulama Teması
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {THEME_OPTIONS.map((t) => {
                    const active = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ theme: t.id });
                        }}
                        className="relative p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        {active && (
                          <span
                            className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold text-white leading-none"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            <Check className="w-2.5 h-2.5 shrink-0" />
                            <span className="hidden sm:inline">Seçili</span>
                          </span>
                        )}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            aria-hidden="true"
                            className="w-6 h-5 rounded-md border overflow-hidden flex flex-col justify-between p-0.5 shrink-0 shadow-2xs"
                            style={{
                              backgroundColor: t.swatch,
                              borderColor: t.border,
                            }}
                          >
                            <span
                              className="h-1 w-full rounded-xs"
                              style={{ backgroundColor: t.accent }}
                            />
                            <span
                              className="h-0.5 w-2/3 rounded-xs opacity-40"
                              style={{ backgroundColor: t.accent }}
                            />
                          </span>
                          <span className="text-xs sm:text-sm font-extrabold truncate pr-4 sm:pr-10">
                            {t.label}
                          </span>
                        </div>
                        <p className="text-[10.5px] sm:text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {t.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Varsayılan Meal & Kurrâ */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Varsayılan Meal Kartı */}
                <div
                  className="p-3.5 rounded-2xl border space-y-2.5 flex flex-col justify-between"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="text-[10.5px] font-extrabold uppercase tracking-wider"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        Varsayılan Meal ({allMeals.length})
                      </p>
                      <div
                        className="inline-flex items-center p-0.5 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setMealDisplayMode('single')}
                          className="min-h-[26px] px-2 rounded-md text-[10.5px] font-bold cursor-pointer"
                          style={{
                            backgroundColor: !isDualMeal ? 'var(--brand-primary)' : 'transparent',
                            color: !isDualMeal ? '#FFFFFF' : 'var(--text-secondary)',
                          }}
                        >
                          Tek
                        </button>
                        <button
                          type="button"
                          onClick={() => setMealDisplayMode('dual')}
                          className="min-h-[26px] px-2 rounded-md text-[10.5px] font-bold cursor-pointer"
                          style={{
                            backgroundColor: isDualMeal ? 'var(--brand-primary)' : 'transparent',
                            color: isDualMeal ? '#FFFFFF' : 'var(--text-secondary)',
                          }}
                        >
                          Çift
                        </button>
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm font-extrabold truncate">
                      {activePrimaryMeal.label}
                    </p>
                    {isDualMeal && (
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        2. Meal: <strong style={{ color: 'var(--text-secondary)' }}>{activeSecondaryMeal.shortLabel}</strong>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openMealSelector('primary')}
                      className="flex-1 min-h-[38px] px-3 rounded-xl font-extrabold text-xs text-white flex items-center justify-center gap-1 cursor-pointer"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <span>Meal Seç</span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                    {isDualMeal && (
                      <button
                        type="button"
                        onClick={() => openMealSelector('secondary')}
                        className="min-h-[38px] px-2.5 rounded-xl border text-[11px] font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        2. Meal
                      </button>
                    )}
                  </div>
                </div>

                {/* Varsayılan Kurrâ Kartı */}
                <div
                  className="p-3.5 rounded-2xl border space-y-2.5 flex flex-col justify-between"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="space-y-1">
                    <p
                      className="text-[10.5px] font-extrabold uppercase tracking-wider flex items-center gap-1"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      <Headphones className="w-3.5 h-3.5 shrink-0" />
                      <span>Varsayılan Kurrâ ({allReciters.length})</span>
                    </p>
                    <p className="text-xs sm:text-sm font-extrabold truncate">
                      {activeReciter.label}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {[activeReciterCategory?.label, activeReciterBadge].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openReciterSelector();
                      }}
                      className="flex-1 min-h-[38px] px-3 rounded-xl font-extrabold text-xs text-white flex items-center justify-center gap-1 cursor-pointer"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <span>Kurrâ Seç</span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        audioQueueService.previewReciter(activeReciter);
                      }}
                      aria-label={isPreviewingActive ? 'Önizlemeyi durdur' : 'Besmele önizle'}
                      title={isPreviewingActive ? 'Durdur' : 'Besmele Önizle'}
                      className="min-w-[38px] min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: isPreviewingActive
                          ? 'var(--brand-accent)'
                          : 'var(--border-subtle)',
                        color: isPreviewingActive
                          ? 'var(--brand-accent-text)'
                          : 'var(--text-primary)',
                      }}
                    >
                      {audioState.previewReciterId === activeReciter.id &&
                      audioState.previewStatus === 'loading' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isPreviewingActive ? (
                        <Square className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>
                  </div>
                  {audioState.previewReciterId === activeReciter.id &&
                    audioState.previewStatus === 'error' &&
                    audioState.previewErrorMessage && (
                      <p
                        role="alert"
                        className="text-[11px] font-semibold leading-snug px-2.5 py-1.5 rounded-lg"
                        style={{
                          backgroundColor: 'var(--state-danger-bg)',
                          color: 'var(--state-danger-text)',
                        }}
                      >
                        {audioState.previewErrorMessage}
                      </p>
                    )}
                </div>
              </section>

              {/* Genel Yazı Boyutu Özeti */}
              <section
                className="p-3.5 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Genel Yazı Boyutu
                  </h3>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                    AR {settings.arabicFontSize}px · TR {settings.turkishFontSize}px
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span style={{ color: 'var(--text-secondary)' }}>Arapça Metin</span>
                      <span className="tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                        {settings.arabicFontSize} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={44}
                      step={1}
                      value={settings.arabicFontSize}
                      onChange={(e) => updateSettings({ arabicFontSize: Number(e.target.value) })}
                      aria-label="Arapça yazı boyutu"
                      className="w-full accent-teal-700 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span style={{ color: 'var(--text-secondary)' }}>Türkçe Meal</span>
                      <span className="tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                        {settings.turkishFontSize} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={14}
                      max={24}
                      step={1}
                      value={settings.turkishFontSize}
                      onChange={(e) => updateSettings({ turkishFontSize: Number(e.target.value) })}
                      aria-label="Türkçe yazı boyutu"
                      className="w-full accent-teal-700 cursor-pointer"
                    />
                  </div>
                </div>
              </section>

              {/* Ana Sayfa "Çalışma Masam" Odak Profili & Modülleri */}
              {(() => {
                const deskPrefs = settings.deskPrefs ?? DEFAULT_DESK_PREFS;
                const enabledCount = countEnabledDeskRows(deskPrefs);
                return (
                  <section
                    className="p-3.5 rounded-2xl border space-y-3"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: 'var(--brand-primary-soft)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <h3
                            className="text-xs sm:text-sm font-extrabold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Ana Sayfa Çalışma Masam Profili
                          </h3>
                          <p
                            className="text-[11px] mt-0.5 leading-snug"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Ana sayfada görmek istediğiniz satırları profil seçerek veya tek tek
                            düzenleyin.
                          </p>
                        </div>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold shrink-0"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {getStudyDeskProfileLabel(deskPrefs.profile)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STUDY_DESK_PROFILES.map((profile) => {
                        const active = deskPrefs.profile === profile.id;
                        return (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              updateSettings({ deskPrefs: applyStudyDeskProfile(profile.id) });
                            }}
                            className="p-2.5 rounded-xl border text-left cursor-pointer transition-colors"
                            style={{
                              backgroundColor: active
                                ? 'var(--brand-primary-soft)'
                                : 'var(--bg-surface)',
                              borderColor: active
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                            }}
                          >
                            <p
                              className="text-xs font-extrabold"
                              style={{
                                color: active
                                  ? 'var(--brand-primary-text)'
                                  : 'var(--text-primary)',
                              }}
                            >
                              {profile.label}
                            </p>
                            <p
                              className="text-[11px] mt-0.5 leading-snug"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {profile.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      {STUDY_DESK_TOGGLES.map((item) => {
                        const checked = deskPrefs[item.key];
                        const isLastActive = checked && enabledCount <= 1;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            role="switch"
                            aria-checked={checked}
                            disabled={isLastActive}
                            title={
                              isLastActive
                                ? 'Ana sayfada en az bir bölüm görünür olmalıdır.'
                                : item.description
                            }
                            onClick={() => {
                              sfxService.play('click');
                              updateSettings({
                                deskPrefs: toggleStudyDeskRow(deskPrefs, item.key),
                              });
                            }}
                            className="min-h-[40px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer disabled:opacity-65 disabled:cursor-not-allowed transition-colors"
                            style={{
                              backgroundColor: checked ? 'var(--bg-surface)' : 'transparent',
                              borderColor: checked
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                            }}
                          >
                            <span
                              className="text-[11.5px] font-bold leading-snug"
                              style={{
                                color: checked ? 'var(--text-primary)' : 'var(--text-muted)',
                              }}
                            >
                              {item.label}
                            </span>
                            <span
                              className="w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                              style={{
                                backgroundColor: checked
                                  ? 'var(--brand-primary)'
                                  : 'var(--border-strong)',
                                justifyContent: checked ? 'flex-end' : 'flex-start',
                              }}
                            >
                              <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

              {/* Ekranı Açık Tut + Uygulama Ses Efektleri (SFX) + Sınav Şık Harfleri */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Ekran, Ses Efektleri &amp; Sınav
                </h3>

                {/* Ekranı Açık Tut (Wake Lock) */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.keepScreenAwake}
                  onClick={() => {
                    sfxService.play('click');
                    updateSettings({ keepScreenAwake: !settings.keepScreenAwake });
                  }}
                  className="w-full p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: settings.keepScreenAwake
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                    borderColor: settings.keepScreenAwake
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Sun
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{
                        color: settings.keepScreenAwake
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-muted)',
                      }}
                    />
                    <div className="min-w-0">
                      <p
                        className="text-xs sm:text-sm font-extrabold"
                        style={{
                          color: settings.keepScreenAwake
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-primary)',
                        }}
                      >
                        Okuma, Oyun ve Sınavlarda Ekranı Açık Tut
                      </p>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                        Tilavet, Sunum, Ezber, Oyunlar ve aktif Sınav sırasında kesintisiz; sessiz
                        okumada 15 dk hareketsiz kalınırsa pil dostu otomatik kapanma.
                      </p>
                    </div>
                  </div>
                  <span
                    className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                    style={{
                      backgroundColor: settings.keepScreenAwake
                        ? 'var(--brand-primary)'
                        : 'var(--border-strong)',
                    }}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        settings.keepScreenAwake ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>

                {/* SFX Kontrolü */}
                <div
                  className="p-3.5 rounded-xl border space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {settings.sfxEnabled ? (
                        <Volume2 className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                      ) : (
                        <VolumeX className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-extrabold">Uygulama Ses Efektleri (SFX)</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Doğru/yanlış dönütü, tıklama ve başarı sesleri
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.sfxEnabled}
                      onClick={() => updateSettings({ sfxEnabled: !settings.sfxEnabled })}
                      className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center cursor-pointer"
                      style={{
                        backgroundColor: settings.sfxEnabled
                          ? 'var(--brand-primary)'
                          : 'var(--border-strong)',
                        justifyContent: settings.sfxEnabled ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>

                  {settings.sfxEnabled && (
                    <div className="flex items-center gap-2.5 pt-0.5">
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={settings.sfxVolume}
                        onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) })}
                        aria-label="Ses efekti seviyesi"
                        className="flex-1 accent-teal-700 cursor-pointer"
                      />
                      <span className="text-xs font-bold tabular-nums w-9 text-right">
                        %{Math.round(settings.sfxVolume * 100)}
                      </span>
                      <button
                        type="button"
                        onClick={handleTestSfx}
                        className="min-h-[32px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        Test Et
                      </button>
                    </div>
                  )}
                </div>

                {/* Sınav İçi Şık Harfleri */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showOptionLettersInApp}
                  onClick={() => {
                    sfxService.play('click');
                    updateSettings({ showOptionLettersInApp: !settings.showOptionLettersInApp });
                  }}
                  className="w-full p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: settings.showOptionLettersInApp
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                    borderColor: settings.showOptionLettersInApp
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      Sınav Ekranında A / B / C / D Harflerini Göster
                    </p>
                    <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                      Açıkken şıkların solunda harf rozeti görünür (A4 baskıda harfler her zaman görünür).
                    </p>
                  </div>
                  <span
                    className="w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                    style={{
                      backgroundColor: settings.showOptionLettersInApp
                        ? 'var(--brand-primary)'
                        : 'var(--border-strong)',
                      justifyContent: settings.showOptionLettersInApp ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </span>
                </button>
              </section>

              {/* Bağlamsal Okuma Ayarları Yönlendirme Notu */}
              <div
                className="p-3 rounded-xl border flex items-start gap-2.5 text-[11.5px] leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Info
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: 'var(--brand-primary-text)' }}
                />
                <span>
                  Mushaf sayfa düzeni, Arapça hat, renkli tecvit, kelime meali ve rükû/secâvend
                  ayarlarını doğrudan <strong>Okuma</strong> ekranındaki{' '}
                  <strong>Görünüm (Okuma Menüsü)</strong> panelinden değiştirebilirsiniz.
                </span>
              </div>
            </>
          )}

          {/* ================================================================
              SEKME 2: ÇEVRİMDIŞI & KURULUM
              ================================================================ */}
          {activeTab === 'offline' && (
            <div className="space-y-4">
              <section>
                <OfflinePackCard />
              </section>

              <section
                className="p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Smartphone className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h3
                      className="text-xs sm:text-sm font-extrabold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Cihaza Uygulama Olarak Kur (PWA)
                    </h3>
                    <p
                      className="text-[11px] mt-0.5 leading-snug"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Muallimun&apos;u telefonunuzun veya bilgisayarınızın ana ekranına ekleyerek
                      tarayıcı çubuğu olmadan, tam ekran ve hızlı erişimle kullanabilirsiniz.
                    </p>
                  </div>
                </div>
                <div className="pt-0.5">
                  <PwaInstallControl variant="settings" />
                </div>
              </section>

              {/* Uygulama Sürümü & Manuel Güncelleme Kontrolü */}
              <section
                className="p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{
                  backgroundColor: pwaUpdateReady
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: pwaUpdateReady
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: pwaUpdateReady
                        ? 'var(--brand-primary)'
                        : 'var(--brand-primary-soft)',
                      color: pwaUpdateReady ? '#FFFFFF' : 'var(--brand-primary-text)',
                    }}
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isCheckingPwaUpdate ? 'animate-spin' : ''}`}
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3
                        className="text-xs sm:text-sm font-extrabold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Uygulama Sürümü &amp; Güncelleme Kontrolü
                      </h3>
                      {manifest?.dataVersion && (
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          v{manifest.dataVersion}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[11px] mt-0.5 leading-snug"
                      style={{
                        color: pwaUpdateReady
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-muted)',
                      }}
                    >
                      {pwaUpdateReady
                        ? 'Yeni uygulama sürümü hazır. Yenileme işlemini şimdi başlatabilirsiniz.'
                        : pwaUpdateMessage ??
                          'Yeni sürüm olup olmadığını istediğiniz zaman el ile denetleyebilirsiniz.'}
                    </p>
                  </div>
                </div>

                {pwaUpdateReady ? (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      void applyPwaUpdate();
                    }}
                    className="min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Yeni Sürümü Yükle</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isCheckingPwaUpdate}
                    onClick={() => void handleManualPwaUpdateCheck()}
                    className="min-h-[38px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60 transition-colors hover:border-[var(--brand-primary)]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {isCheckingPwaUpdate ? (
                      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{isCheckingPwaUpdate ? 'Denetleniyor…' : 'Güncellemeleri Denetle'}</span>
                  </button>
                )}
              </section>
            </div>
          )}

          {/* ================================================================
              SEKME 3: YEDEKLEME & VERİ
              ================================================================ */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* Çalışma Verilerimi Yedekle & Taşı */}
              <section
                className="p-3.5 sm:p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <HardDrive className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h3
                      className="text-xs sm:text-sm font-extrabold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Çalışma Verilerimi Yedekle &amp; Taşı
                    </h3>
                    <p
                      className="text-[11px] mt-0.5 leading-snug"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Ayarlarınızı, Çalışma Masam tercihlerinizi, ayraçlarınızı, 30 Cüz Hatim
                      planınızı, kişisel ayet notlarınızı, araştırma defterlerinizi, ezber
                      havuzunuzu, Klasik Hafızlık (20 Tur Ham–Has) kaydınızı ve oyun ilerlemenizi
                      tek bir JSON dosyasına aktarın veya başka bir cihaza taşıyın.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isBackupBusy}
                    onClick={() => void handleExportFullBackup()}
                    className="min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Yedeği İndir (.json)</span>
                  </button>

                  <input
                    ref={backupFileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => void handleImportFullBackup(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isBackupBusy}
                    onClick={() => backupFileInputRef.current?.click()}
                    className="min-h-[42px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--brand-primary)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>Yedekten Geri Yükle</span>
                  </button>
                </div>

                {/* İki Aşamalı Yedek Önizleme & Onay Kartı */}
                {pendingBackupRestore && (
                  <div
                    role="region"
                    aria-label="Yedek Önizleme ve Geri Yükleme Onayı"
                    className="p-3.5 rounded-xl border space-y-3"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--brand-primary)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <ShieldCheck
                          className="w-4 h-4 shrink-0 mt-0.5"
                          style={{ color: 'var(--brand-primary)' }}
                        />
                        <div className="min-w-0">
                          <h4
                            className="text-xs sm:text-sm font-extrabold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            Yedek Önizleme &amp; Geri Yükleme Onayı
                          </h4>
                          <p
                            className="text-[11px] truncate mt-0.5"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {pendingBackupRestore.fileName} · Tarih:{' '}
                            {formatBackupDate(pendingBackupRestore.exportedAt)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isBackupBusy}
                        onClick={() => setPendingBackupRestore(null)}
                        aria-label="Önizlemeyi kapat"
                        className="p-1 rounded-lg cursor-pointer shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>Ezber Birimi</p>
                        <p className="font-extrabold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.memorizationUnitsCount} birim
                        </p>
                      </div>
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>Klasik Hafızlık</p>
                        <p className="font-extrabold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.classicalHifzSummary}
                        </p>
                      </div>
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>30 Cüz Hatim</p>
                        <p className="font-extrabold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.hasActiveHatim
                            ? `Aktif (%${pendingBackupRestore.hatimPercent} · ${pendingBackupRestore.hatimCompletedPagesCount}/604 s.)`
                            : 'Aktif plan yok'}
                          {pendingBackupRestore.hatimHistoryCount > 0
                            ? ` · ${pendingBackupRestore.hatimHistoryCount} tamamlanan`
                            : ''}
                        </p>
                      </div>
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>Kişisel Ayet Notu</p>
                        <p className="font-extrabold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.verseNotesCount} kişisel ayet notu
                        </p>
                      </div>
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>Araştırma Konusu</p>
                        <p className="font-extrabold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.researchTopicsCount} konu
                        </p>
                      </div>
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>Oyun İlerlemesi</p>
                        <p className="font-extrabold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.gamePlayedTiersCount > 0
                            ? `${pendingBackupRestore.gamePlayedTiersCount} seviye · ${pendingBackupRestore.gameTotalStars} yıldız`
                            : 'Kayıt yok'}
                        </p>
                      </div>
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>Kayıt Alanı &amp; Masa</p>
                        <p className="font-extrabold mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.localKeysCount} alan
                          {pendingBackupRestore.deskProfileLabel
                            ? ` · ${pendingBackupRestore.deskProfileLabel}`
                            : ''}
                        </p>
                      </div>
                      <div
                        className="px-2.5 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <p style={{ color: 'var(--text-muted)' }}>Aktif Oturum</p>
                        <p className="font-extrabold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                          {pendingBackupRestore.hasActiveMemorizationSession ||
                          pendingBackupRestore.hasActiveExamSession
                            ? [
                                pendingBackupRestore.hasActiveMemorizationSession ? 'Ezber' : null,
                                pendingBackupRestore.hasActiveExamSession ? 'Sınav' : null,
                              ]
                                .filter(Boolean)
                                .join(' + ')
                            : 'Yok'}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-[11px] leading-snug"
                      style={{
                        backgroundColor: 'var(--brand-accent-soft)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Onayladığınızda mevcut çalışma verileriniz bu yedekle değiştirilecektir.
                        Hata durumunda mevcut verileriniz otomatik korunur.
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={isBackupBusy}
                        onClick={() => void handleConfirmBackupRestore(false)}
                        className="min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        {isBackupBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>Onayla ve Geri Yükle</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBackupBusy}
                        onClick={() => void handleConfirmBackupRestore(true)}
                        className="min-h-[40px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--brand-primary)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>Önce Mevcut Verimi İndir, Sonra Yükle</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBackupBusy}
                        onClick={() => setPendingBackupRestore(null)}
                        className="min-h-[38px] px-3.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center cursor-pointer disabled:opacity-60"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}

                {backupStatus && (
                  <p
                    role="status"
                    className="text-xs font-bold px-3 py-2 rounded-xl border"
                    style={{
                      backgroundColor:
                        backupStatus.type === 'success'
                          ? 'var(--brand-primary-soft)'
                          : 'var(--state-danger-bg)',
                      borderColor:
                        backupStatus.type === 'success'
                          ? 'var(--brand-primary)'
                          : 'rgba(239, 68, 68, 0.35)',
                      color:
                        backupStatus.type === 'success'
                          ? 'var(--brand-primary-text)'
                          : 'var(--state-danger-text)',
                    }}
                  >
                    {backupStatus.text}
                  </p>
                )}
              </section>

              {/* Platform Tanıtımı & İletişim Kısayolları */}
              <section className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openIntroSplash}
                  className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--brand-accent-text)' }} />
                  <span>Karşılama İntrosunu Göster</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    closeSettingsModal();
                    openFeedbackModal();
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'rgba(13, 148, 136, 0.35)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <MessageSquareHeart className="w-4 h-4 shrink-0" />
                  <span>Görüş / Hata Bildir</span>
                </button>
              </section>

              {/* Veri Kaynakları ve Bilgilendirme */}
              <section
                className="p-3.5 sm:p-4 rounded-2xl border space-y-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Info
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <h3
                    className="text-xs sm:text-sm font-extrabold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Veri Kaynakları ve Bilgilendirme
                  </h3>
                </div>
                <p
                  className="text-[11.5px] leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Muallimun Kur&apos;an &amp; Meal; ticari bir amaç gütmeksizin eğitim, okuma,
                  hafızlık ve ilmî araştırma amacıyla hazırlanmıştır. Uygulamada sunulan Mushaf
                  metni, 27 meal ve tefsir kataloğu ile 28 okuyucuya ait sesli tilavet arşivi,
                  ilgili müelliflere, kurumlara ve açık ilmî kaynaklara atıfla kullanıcıların
                  istifadesine sunulmaktadır.
                </p>
              </section>

              {/* Varsayılanlara Sıfırla */}
              <section
                className="pt-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                  Çalışma havuzunuz, ayraçlarınız, ezberleriniz, hatminiz ve notlarınız silinmez;
                  yalnızca görünüm tercihleri varsayılana döner.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    resetSettings();
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Varsayılanlara Sıfırla</span>
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
