import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  HardDrive,
  Headphones,
  Layout,
  Loader2,
  MessageSquareHeart,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Type,
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
import { ARABIC_FONTS, TURKISH_FONTS } from '../config/assetsConfig';
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
import type { MemorizationBackupPayload } from '../types/memorization';
import type {
  BookContentMode,
  ExamSessionState,
  PageLayoutMode,
  StudyViewMode,
  ThemeMode,
  WordMealMode,
} from '../types/quran';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import {
  clearActiveExamSession,
  loadActiveExamSession,
  saveActiveExamSession,
  validateExamSessionPayload,
} from '../utils/examUtils';
import { PwaInstallControl } from './PwaInstallControl';
import { OfflinePackCard } from './OfflinePackCard';

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
      ? Math.max(1, Math.min(20, Math.floor(rec.currentRound)))
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

type SettingsTabId = 'appearance' | 'typography' | 'reading' | 'audio_exam';

const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'appearance', label: 'Görünüm & Sayfa', icon: Layout },
  { id: 'typography', label: 'Yazı Tipi', icon: Type },
  { id: 'reading', label: 'Okuma & Kelime', icon: BookOpen },
  { id: 'audio_exam', label: 'Ses & Sınav', icon: Volume2 },
];

const THEME_OPTIONS: { id: ThemeMode; label: string; desc: string; swatch: string }[] = [
  { id: 'light', label: 'Açık', desc: 'Ferah beyaz', swatch: '#FFFFFF' },
  { id: 'cream', label: 'Krem Mushaf', desc: 'Sıcak kâğıt', swatch: '#FAF6EE' },
  { id: 'dark', label: 'Gece', desc: 'Göz dostu', swatch: '#0B1314' },
];

const VIEW_MODE_OPTIONS: { id: StudyViewMode; label: string; desc: string }[] = [
  { id: 'mushaf', label: 'Mushaf Sayfası', desc: 'Klasik 604 sayfa düzeni' },
  { id: 'book', label: 'Kitap Modu', desc: 'Akışkan okuma sayfası' },
  { id: 'cards', label: 'Ayet Kartları', desc: 'Ayet ayet detaylı analiz' },
];

const PAGE_LAYOUT_OPTIONS: { id: PageLayoutMode; label: string; desc: string }[] = [
  { id: 'single', label: 'Tek Sayfa', desc: 'Mushaf + yan meal paneli' },
  { id: 'double_mushaf', label: '2 Sayfa Mushaf', desc: 'Karşılıklı iki Arapça sayfa' },
  { id: 'double_meal', label: 'Sağ Mushaf · Sol Meal', desc: 'Aynı sayfanın meali solda' },
];

const BOOK_CONTENT_OPTIONS: { id: BookContentMode; label: string; desc: string }[] = [
  { id: 'interleaved', label: 'Arapça + Meal', desc: 'Mushaf ve meal birlikte' },
  { id: 'ar_only', label: 'Sadece Arapça', desc: 'Odaklı Arapça okuma' },
  { id: 'meal_only', label: 'Sadece Türkçe Meal', desc: 'Mushaf çerçevesinde meal' },
];

const ToggleRow: React.FC<{
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}> = ({ title, description, checked, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    className="w-full p-3.5 rounded-xl border flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
    style={{
      backgroundColor: checked ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
      borderColor: checked ? 'var(--brand-primary)' : 'var(--border-subtle)',
    }}
  >
    <div className="min-w-0">
      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
    </div>
    <span
      className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
      style={{
        backgroundColor: checked ? 'var(--brand-primary)' : 'var(--border-strong)',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}
    >
      <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
    </span>
  </button>
);

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    settings,
    studyPrefs,
    audioPrefs,
    updateSettings,
    setMealDisplayMode,
    updateStudyPrefs,
    updateAudioPrefs,
    resetSettings,
    openIntroSplash,
    openReciterSelector,
    openMealSelector,
    openWaqfGuide,
    openFeedbackModal,
    manifest,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const [activeTab, setActiveTab] = useState<SettingsTabId>('appearance');
  const [backupStatus, setBackupStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [pendingBackupRestore, setPendingBackupRestore] = useState<PendingBackupPreview | null>(
    null,
  );
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const backupSectionRef = useRef<HTMLElement | null>(null);

  useBackButtonGuard('settings_modal', isSettingsModalOpen, closeSettingsModal);

  useEffect(() => {
    if (!isSettingsModalOpen) {
      setPendingBackupRestore(null);
      return;
    }
    return acquireBodyScrollLock();
  }, [isSettingsModalOpen]);

  const handleJumpToBackup = () => {
    sfxService.play('click');
    setActiveTab('appearance');
    window.setTimeout(() => {
      backupSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

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
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('muallimun')) continue;
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        prevLocalEntries[key] = val;
      }
    }
    const prevExamSession = loadActiveExamSession();
    let prevMemorization: MemorizationBackupPayload | null = null;
    try {
      prevMemorization = await memorizationStorage.createBackupPayload();
    } catch {
      prevMemorization = null;
    }

    // 2) Store otomatik yazımını duraklat ki mevcut bellek state'i geri yüklemeyi ezmesin
    setStorePersistencePaused(true);

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

      setStorePersistencePaused(false);
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
      className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSettingsModal();
      }}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[86dvh] rounded-t-3xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="min-w-0">
            <h2 id="settings-modal-title" className="text-sm sm:text-lg font-extrabold tracking-tight truncate">
              Ayarlar ve Kişiselleştirme
            </h2>
            <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              Tüm tercihler cihazında otomatik olarak saklanır.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleJumpToBackup}
              title="Çalışma verilerini yedekle veya geri yükle"
              className="min-h-[36px] px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'rgba(13, 148, 136, 0.35)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Yedekle / Taşı</span>
              <span className="sm:hidden">Yedekle</span>
            </button>
            <button
              type="button"
              onClick={closeSettingsModal}
              aria-label="Ayarları kapat"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 4 Kategorik Sekme Şeridi — 360px mobilde taşmasız 2x2, masaüstünde 4'lü */}
        <div
          className="px-3 sm:px-4 py-2 border-b shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
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
                  className="min-h-[38px] px-2 py-1.5 rounded-xl text-[11.5px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sekme İçerikleri */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ================================================================
              SEKME 1: GÖRÜNÜM & SAYFA
              ================================================================ */}
          {activeTab === 'appearance' && (
            <>
              {/* Tema Seçici */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Renk Teması
                </h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {THEME_OPTIONS.map((t) => {
                    const active = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ theme: t.id });
                        }}
                        className="p-3 rounded-xl border text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-4 h-4 rounded-full border shrink-0"
                            style={{
                              backgroundColor: t.swatch,
                              borderColor: 'var(--border-strong)',
                            }}
                          />
                          <span className="text-xs sm:text-sm font-extrabold">{t.label}</span>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {t.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Varsayılan Okuma Görünümü */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Varsayılan Okuma Görünümü
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {VIEW_MODE_OPTIONS.map((v) => {
                    const active = studyPrefs.viewMode === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateStudyPrefs({ viewMode: v.id });
                        }}
                        className="p-3 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs sm:text-sm font-extrabold"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {v.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {v.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Masaüstü Sayfa Düzeni */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Masaüstü Mushaf Sayfa Düzeni
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PAGE_LAYOUT_OPTIONS.map((layout) => {
                    const active = studyPrefs.pageLayout === layout.id;
                    return (
                      <button
                        key={layout.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateStudyPrefs({ pageLayout: layout.id });
                        }}
                        className="p-3 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs sm:text-sm font-extrabold"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {layout.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {layout.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Okuma İçerik Tercihi (Mushaf & Kitap) */}
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Okuma İçerik Tercihi (Mushaf &amp; Kitap)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {BOOK_CONTENT_OPTIONS.map((opt) => {
                    const active = studyPrefs.bookContentMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateStudyPrefs({ bookContentMode: opt.id });
                        }}
                        className="p-3 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs sm:text-sm font-extrabold"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {opt.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Akıllı Ekran Açık Tutma (Wake Lock) */}
              <section className="space-y-2">
                <h3
                  className="text-xs font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Ekran &amp; Pil Koruması
                </h3>
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
                        Okuma ve Dinlemede Ekranı Açık Tut
                      </p>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                        Sesli tilavet, Sunum ve Ezber sırasında kesintisiz; sessiz okumada 15 dk
                        hareketsiz kalınırsa pil dostu otomatik kapanma.
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
                            Ana sayfada görmek istediğiniz satırları ve sınav vurgusunu profil
                            seçerek veya tek tek düzenleyin.
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
                              backgroundColor: checked
                                ? 'var(--bg-surface)'
                                : 'transparent',
                              borderColor: checked
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                            }}
                          >
                            <span
                              className="text-[11.5px] font-bold leading-snug"
                              style={{
                                color: checked
                                  ? 'var(--text-primary)'
                                  : 'var(--text-muted)',
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

              {/* Çalışma Verilerimi Yedekle & Taşı */}
              <section
                ref={backupSectionRef}
                className="p-3.5 rounded-2xl border space-y-3"
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
                    className="min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
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
                    className="min-h-[40px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
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
                          : 'rgba(239, 68, 68, 0.08)',
                      borderColor:
                        backupStatus.type === 'success'
                          ? 'var(--brand-primary)'
                          : 'rgba(239, 68, 68, 0.35)',
                      color:
                        backupStatus.type === 'success'
                          ? 'var(--brand-primary-text)'
                          : '#B91C1C',
                    }}
                  >
                    {backupStatus.text}
                  </p>
                )}
              </section>

              {/* Tek Tıkla Çevrimdışı Metin Paketi */}
              <section>
                <OfflinePackCard compact />
              </section>

              {/* İntro, Geri Bildirim & Uygulama Kurulumu */}
              <section
                className="pt-3 border-t flex flex-wrap items-center justify-between gap-2.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
                <PwaInstallControl variant="settings" />
              </section>
            </>
          )}

          {/* ================================================================
              SEKME 2: YAZI TİPİ
              ================================================================ */}
          {activeTab === 'typography' && (
            <>
              {/* Canlı Önizleme */}
              <section
                className="p-4 rounded-2xl border space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold flex-wrap" style={{ color: 'var(--text-muted)' }}>
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Canlı Önizleme
                    {settings.tajweedEnabled && (
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold"
                        style={{
                          backgroundColor: 'var(--brand-accent-soft)',
                          color: 'var(--brand-accent-text)',
                        }}
                      >
                        Renkli Tecvit Açık · Scheherazade New
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    AR {settings.arabicFontSize}px · TR {settings.turkishFontSize}px
                  </span>
                </div>
                <p
                  dir="rtl"
                  lang="ar"
                  className={`${settings.tajweedEnabled ? 'arabic-tajweed' : 'arabic-text'} text-right`}
                  style={{ fontSize: `${settings.arabicFontSize}px`, color: 'var(--text-primary)' }}
                >
                  إِنَّمَا الْمُؤْمِنُونَ إِخْوَةٌ فَأَصْلِحُوا بَيْنَ أَخَوَيْكُمْ
                </p>
                <p
                  className="turkish-reading"
                  style={{ fontSize: `${settings.turkishFontSize}px`, color: 'var(--text-secondary)' }}
                >
                  Müminler ancak kardeştirler. Öyleyse kardeşlerinizin arasını düzeltin. (Hucurât, 10)
                </p>
              </section>

              {/* Tercih Edilen Türkçe Meal (24 Meal Kataloğu) */}
              <section
                className="p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p
                      className="text-[11px] font-extrabold uppercase tracking-wider"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Tercih Edilen Türkçe Meal ({allMeals.length} Meal)
                    </p>
                    <p className="text-sm sm:text-base font-extrabold mt-0.5 truncate">
                      {activePrimaryMeal.label}
                    </p>
                    {isDualMeal && (
                      <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        2. Karşılaştırma Meali: <span className="font-extrabold">{activeSecondaryMeal.label}</span>
                      </p>
                    )}
                  </div>

                  <div
                    className="flex items-center p-0.5 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setMealDisplayMode('single')}
                      className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: !isDualMeal ? 'var(--brand-primary)' : 'transparent',
                        color: !isDualMeal ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      Tek Meal
                    </button>
                    <button
                      type="button"
                      onClick={() => setMealDisplayMode('dual')}
                      className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: isDualMeal ? 'var(--brand-primary)' : 'transparent',
                        color: isDualMeal ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      Çift Meal
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openMealSelector('primary')}
                    className="flex-1 min-w-[180px] min-h-[40px] px-4 rounded-xl font-extrabold text-xs sm:text-sm text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <span>Meal Değiştir ({allMeals.length} Meal)</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                  {isDualMeal && (
                    <button
                      type="button"
                      onClick={() => openMealSelector('secondary')}
                      className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      2. Meali Değiştir
                    </button>
                  )}
                </div>
              </section>

              {/* Arapça Hat Seçici (9 Hat) */}
              <section className="space-y-2.5">
                {settings.tajweedEnabled && (
                  <div
                    className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      borderColor: 'rgba(217, 119, 6, 0.35)',
                    }}
                  >
                    <p
                      className="text-xs leading-relaxed font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Renkli Tecvit açıkken hareke ve tecvit uyumu için{' '}
                      <strong>Scheherazade New</strong> hattı kullanılır. Seçtiğiniz Mushaf hattını
                      uygulamak için Renkli Tecvit&apos;i kapatabilirsiniz.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        updateSettings({ tajweedEnabled: false });
                      }}
                      className="min-h-[34px] px-3 rounded-lg border text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--brand-accent)',
                        color: 'var(--brand-accent-text)',
                      }}
                    >
                      Tecviti Kapat
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Arapça Mushaf Hattı (9 Font)
                  </h3>
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ARABIC_FONTS.map((font) => {
                    const active = settings.arabicFont === font.label;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ arabicFont: font.label });
                        }}
                        className="p-2.5 rounded-xl border text-left cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs font-bold truncate"
                          style={{
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                          }}
                        >
                          {font.label}
                        </p>
                        <p
                          dir="rtl"
                          className="text-base mt-0.5 truncate"
                          style={{
                            fontFamily: `${font.fontFamily}, serif`,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          بِسْمِ اللّٰهِ الرَّحْمٰنِ
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Türkçe Font Seçici (4 Font) */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Türkçe Meal Yazı Tipi
                  </h3>
                  <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TURKISH_FONTS.map((font) => {
                    const active = settings.turkishFont === font.label;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          updateSettings({ turkishFont: font.label });
                        }}
                        className="min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors"
                        style={{
                          fontFamily: font.fontStack,
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                        }}
                      >
                        {font.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* ================================================================
              SEKME 3: OKUMA & KELİME
              ================================================================ */}
          {activeTab === 'reading' && (
            <div className="space-y-3">
              <ToggleRow
                title="Kelime Meali (Kelime-Kelime Analiz)"
                description="Kapatıldığında okuma kartları ve Mushaf panelindeki kelime meali blokları gizlenir; sade okuma deneyimi sunar."
                checked={settings.wordByWordEnabled}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ wordByWordEnabled: !settings.wordByWordEnabled });
                }}
              />

              {settings.wordByWordEnabled && (
                <div
                  className="p-3.5 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                    Kelime Meali Varsayılan Modu
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'off', label: 'İsteğe Bağlı' },
                        { id: 'visible', label: 'Her Zaman Açık' },
                        { id: 'quiz', label: 'Kendini Sına' },
                      ] as { id: WordMealMode; label: string }[]
                    ).map((m) => {
                      const active = studyPrefs.wordMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            updateStudyPrefs({ wordMode: m.id });
                          }}
                          className="min-h-[38px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <ToggleRow
                title="Sesle Otomatik Kaydırma"
                description="Tilavet veya sesli meal akarken çalan ayeti ekranda otomatik olarak ortalar."
                checked={audioPrefs.autoScroll}
                onToggle={() => {
                  sfxService.play('click');
                  updateAudioPrefs({ autoScroll: !audioPrefs.autoScroll });
                }}
              />

              <ToggleRow
                title="Dipnotları ve Açıklamaları Göster"
                description="Seçili Türkçe meallerdeki ayet dipnotlarını okuma ekranında görüntüle."
                checked={settings.showFootnotes}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ showFootnotes: !settings.showFootnotes });
                }}
              />

              <ToggleRow
                title="Renkli Tecvit (Etkileşimli Tecvit Rehberi)"
                description="Arapça ayetleri tecvit kurallarına göre renklendirir; renkli harflere dokunarak kuralın Türkçe açıklamasını gösterir. Harf birleşmelerini korumak için Uthmani OpenType yazı tipi kullanılır."
                checked={settings.tajweedEnabled}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ tajweedEnabled: !settings.tajweedEnabled });
                }}
              />

              {settings.tajweedEnabled && (
                <ToggleRow
                  title="Tecvit Renk Şeridini Göster"
                  description="Okuma alanının üstünde tek satırlık özet renk anahtarını (Medler, Gunne, İdgam, İklâb, Kalkale) gösterir."
                  checked={settings.showTajweedLegend}
                  onToggle={() => {
                    sfxService.play('click');
                    updateSettings({ showTajweedLegend: !settings.showTajweedLegend });
                  }}
                />
              )}

              <ToggleRow
                title="Kelime Takibi (Karaoke)"
                description="Kelime senkronu destekli kurrâlarda (Husrî, Mâhir, Minşâvî, Şureym) tilavet sırasında okunan kelimeyi satır kayması olmadan anlık vurgular."
                checked={settings.wordSyncEnabled}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ wordSyncEnabled: !settings.wordSyncEnabled });
                }}
              />

              <ToggleRow
                title="Rükû (ع) İşaretlerini Göster"
                description="556 konu bölümünün bittiği ayetlerde tıklanabilir ع rozetini gösterir; dokunulduğunda bölümü dinleme veya ezber havuzuna ekleme seçenekleri açılır."
                checked={settings.showRukuMarkers}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ showRukuMarkers: !settings.showRukuMarkers });
                }}
              />

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  closeSettingsModal();
                  openWaqfGuide();
                }}
                className="w-full p-3.5 rounded-xl border flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <BookOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Secâvend Durak (Vakıf) Rehberi</span>
                  </p>
                  <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                    Ayet içindeki 8 vakıf işaretinin (مـ، ۖ، ۗ، ۚ، ۙ، ۛ) okuma hükmünü ve örneklerini inceleyin.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              </button>

              <ToggleRow
                title="Tilâvet Secdesi İşaretlerini Vurgula"
                description="Secde ayetlerinde özel ۩ Tilâvet Secdesi işaretini belirgin göster."
                checked={settings.highlightSajdah}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ highlightSajdah: !settings.highlightSajdah });
                }}
              />
            </div>
          )}

          {/* ================================================================
              SEKME 4: SES & SINAV
              ================================================================ */}
          {activeTab === 'audio_exam' && (
            <div className="space-y-4">
              {/* Kur'an Okuyucu (Tilavet / Kurrâ) Seçici Kartı */}
              <div
                className="p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  borderColor: 'var(--brand-primary)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Headphones className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-[11px] font-extrabold uppercase tracking-wider"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        Kur&apos;an Okuyucu (Arapça Tilavet)
                      </p>
                      <p
                        className="text-sm sm:text-base font-extrabold truncate mt-0.5"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {activeReciter.label}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {activeReciterCategory && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {activeReciterCategory.label}
                          </span>
                        )}
                        {activeReciterBadge && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            {activeReciterBadge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openReciterSelector();
                    }}
                    className="flex-1 min-w-[180px] min-h-[42px] px-4 rounded-xl font-extrabold text-xs sm:text-sm text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-transform active:scale-[0.99]"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <span>Okuyucu Değiştir ({allReciters.length} Kurrâ)</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      audioQueueService.previewReciter(activeReciter);
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
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
                    <span>{isPreviewingActive ? 'Durdur' : 'Besmele Önizle'}</span>
                  </button>
                </div>
              </div>

              {/* SFX Kontrolü */}
              <div
                className="p-4 rounded-2xl border space-y-3.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {settings.sfxEnabled ? (
                      <Volume2 className="w-5 h-5" style={{ color: 'var(--brand-primary-text)' }} />
                    ) : (
                      <VolumeX className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    )}
                    <div>
                      <p className="text-sm font-bold">Uygulama Ses Efektleri (SFX)</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Doğru/yanlış dönütü, tıklama ve başarı sesleri
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.sfxEnabled}
                    onClick={() => updateSettings({ sfxEnabled: !settings.sfxEnabled })}
                    className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center cursor-pointer"
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
                  <div className="flex items-center gap-3 pt-1">
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
                    <span className="text-xs font-bold tabular-nums w-10 text-right">
                      %{Math.round(settings.sfxVolume * 100)}
                    </span>
                    <button
                      type="button"
                      onClick={handleTestSfx}
                      className="min-h-[34px] px-3 rounded-lg border text-xs font-bold cursor-pointer"
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
              <ToggleRow
                title="Sınav Ekranında A / B / C / D Harflerini Göster"
                description="Açık olduğunda şıkların solunda harf rozeti görünür; kapalıyken modern seçim halkası kullanılır. (A4 baskıda harfler her zaman görünür.)"
                checked={settings.showOptionLettersInApp}
                onToggle={() => {
                  sfxService.play('click');
                  updateSettings({ showOptionLettersInApp: !settings.showOptionLettersInApp });
                }}
              />

              {/* Varsayılanlara Sıfırla */}
              <div
                className="pt-3 border-t flex items-center justify-between gap-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Çalışma havuzun, ayraçların ve puanların silinmez; sadece görünüm ayarları
                  sıfırlanır.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    resetSettings();
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Varsayılanlara Sıfırla</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
