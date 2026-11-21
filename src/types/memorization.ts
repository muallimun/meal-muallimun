export type UnitSourceType = 'preset' | 'page' | 'surah' | 'custom';

export type RetentionStage = 'raw' | 'fresh' | 'solid';

export type MemorizationMethod = 'snowball' | 'reverse_snowball' | 'single' | 'block';

export type IntensityProfile = 'fast' | 'balanced' | 'deep' | 'custom';

export type VisibilityMask = 'open' | 'first_word' | 'word_reveal' | 'hidden';

export type PauseMultiplier = 0.8 | 1 | 1.2;

export type ZenViewMode = 'focus' | 'mushaf';

export type CuratedPresetGroupId =
  | 'prayer_surahs'
  | 'duha_to_fil'
  | 'selected_ashrs'
  | 'featured_surahs';

export type SelfEvaluationRating = 'hard' | 'good' | 'easy';

export type ZenSessionMode =
  | 'standard'
  | 'starred_only'
  | 'self_test_ordered'
  | 'self_test_shuffled';

export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export interface AyahRange {
  surah: number;
  startAyah: number;
  endAyah: number;
}

export interface MemorizationUnit {
  id: string;
  title: string;
  subtitle?: string;
  sourceType: UnitSourceType;
  ranges: AyahRange[];
  /** Mushaf sırasıyla düzleştirilmiş ayet anahtarları: ["67:1", "67:2", ...] */
  verseKeys: string[];
  mushafPages: number[];
  stage: RetentionStage;
  completedSessions: number;
  totalMinutes: number;
  /** Zorlanılan / yıldızlı ayet anahtarları */
  starredVerseKeys: string[];
  createdAt: number;
  lastPracticedAt: number | null;
  /** Sabak–Sabkî–Menzil aralıklı tekrar basamağı (0..5 -> 1, 3, 7, 14, 30 gün) */
  reviewStep: number;
  /** Bir sonraki önerilen pekiştirme tekrarı zamanı (ms timestamp) */
  nextReviewAt: number | null;
  /** Son oturum sonu öz-değerlendirmesi */
  lastSelfEval?: SelfEvaluationRating;
}

export interface CustomIntensityConfig {
  newAyahReps: number; // 1..30
  chainReps: number; // 1..10
  blockRounds: number; // 1..10
  windowSize: number; // 3..7 (varsayılan 5)
}

export interface MemorizationPrefs {
  method: MemorizationMethod;
  profile: IntensityProfile;
  customConfig: CustomIntensityConfig;
  /** Boş veya tanımsızsa uygulamanın genel aktif okuyucusu kullanılır */
  reciterId: string | null;
  listenRepeatPauseEnabled: boolean;
  pauseMultiplier: PauseMultiplier;
  viewMode: ZenViewMode;
  autoProgressiveHide: boolean;
  showVaslHook: boolean;
  playbackRate: 0.75 | 1 | 1.25 | 1.5;
}

export type SessionStepPhase =
  | 'encode'
  | 'link'
  | 'checkpoint'
  | 'final_flow'
  | 'block';

export interface SessionStep {
  index: number;
  phase: SessionStepPhase;
  clusterIndex: number;
  totalClusters: number;
  /** Bu adımda okunacak / gösterilecek ayet anahtarları ("sure:ayet") */
  verseKeys: string[];
  /** 1-tabanlı mevcut tekrar sayısı */
  repeatIndex: number;
  totalRepeats: number;
  /** Otomatik kademeli gizleme açıkken önerilen maske */
  suggestedMask: VisibilityMask;
  /** Örn: "Görerek Kodlama", "Ezberden Hatırlama", "Zincir 1–3" */
  stepLabel: string;
  /** Üst barda kompakt gösterim */
  shortLabel: string;
}

export interface ActiveSessionSnapshot {
  unitId: string;
  unitTitle: string;
  method: MemorizationMethod;
  profile: IntensityProfile;
  customConfig: CustomIntensityConfig;
  stepIndex: number;
  totalSteps: number;
  elapsedSec: number;
  completedReps: number;
  mask: VisibilityMask;
  updatedAt: number;
  sessionMode?: ZenSessionMode;
  overrideVerseKeys?: string[];
}

export interface ZenSessionLaunchOptions {
  mode: ZenSessionMode;
}

export interface QuickMemorizeSeed {
  surah: number;
  ayah: number;
  page?: number;
  nonce: number;
}

export interface MemorizeLaunchTarget {
  unitId: string;
  autoStart: boolean;
  nonce: number;
}

export interface CuratedPresetItem {
  id: string;
  group: CuratedPresetGroupId;
  title: string;
  subtitle: string;
  ranges: AyahRange[];
  estimatedAyahs: number;
}

export interface MemorizationBackupPayload {
  app: 'muallimun-memorization';
  version: 2;
  exportedAt: string;
  units: MemorizationUnit[];
  prefs: MemorizationPrefs;
}

export const RETENTION_STAGE_META: Record<
  RetentionStage,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeBg: string;
    badgeColor: string;
    badgeBorder: string;
  }
> = {
  raw: {
    label: 'Ham · Çalışılıyor',
    shortLabel: 'Ham',
    description: 'Yeni başlandı, tekrar ve bağlantı aşamasında',
    badgeBg: 'var(--brand-accent-soft)',
    badgeColor: 'var(--brand-accent-text)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)',
  },
  fresh: {
    label: 'Taze · Pekiştirme',
    shortLabel: 'Taze',
    description: 'Ezberlendi, akıcılık ve pekiştirme tekrarında',
    badgeBg: 'rgba(14, 165, 233, 0.12)',
    badgeColor: '#0369A1',
    badgeBorder: 'rgba(14, 165, 233, 0.35)',
  },
  solid: {
    label: 'Sağlam · Muhafaza',
    shortLabel: 'Sağlam',
    description: 'Oturmuş ezber, dönemsel muhafaza tekrarında',
    badgeBg: 'var(--brand-primary-soft)',
    badgeColor: 'var(--brand-primary-text)',
    badgeBorder: 'rgba(15, 118, 110, 0.35)',
  },
};

export const TEACHER_RECITER_IDS = new Set<string>([
  'husary_muallim',
  'minshawy_teacher',
]);

export function parseVerseKey(key: string): { surah: number; ayah: number } {
  const [sStr, aStr] = key.split(':');
  return {
    surah: Number(sStr) || 1,
    ayah: Number(aStr) || 1,
  };
}

export function formatVerseKey(surah: number, ayah: number): string {
  return `${surah}:${ayah}`;
}
