import type { StudyDeskPrefs, StudyDeskProfileId } from '../types/quran';

export type StudyDeskRowToggleKey = Exclude<keyof StudyDeskPrefs, 'profile'>;

export const DEFAULT_DESK_PREFS: StudyDeskPrefs = {
  profile: 'all',
  showReadingRow: true,
  showHatimRow: true,
  showMemorizationRow: true,
  showListeningRow: true,
  showNotesRow: true,
  showPoolAndExamSection: true,
};

export interface StudyDeskProfileOption {
  id: Exclude<StudyDeskProfileId, 'custom'>;
  label: string;
  shortLabel: string;
  description: string;
  prefs: StudyDeskPrefs;
}

export const STUDY_DESK_PROFILES: readonly StudyDeskProfileOption[] = [
  {
    id: 'reading_hatim',
    label: 'Okuma & Hatim Odaklı',
    shortLabel: 'Okuma & Hatim',
    description: 'Sade okuma, 30 cüz hatim, dinleme ve ayet notları (ezber ve sınav vitrini gizli).',
    prefs: {
      profile: 'reading_hatim',
      showReadingRow: true,
      showHatimRow: true,
      showListeningRow: true,
      showNotesRow: true,
      showMemorizationRow: false,
      showPoolAndExamSection: false,
    },
  },
  {
    id: 'hifz',
    label: 'Hafızlık & Ezber Odaklı',
    shortLabel: 'Hafızlık & Ezber',
    description: 'Klasik/modern ezber, okuma, dinleme ve hatim satırları (sınav kartları gizli).',
    prefs: {
      profile: 'hifz',
      showMemorizationRow: true,
      showReadingRow: true,
      showListeningRow: true,
      showHatimRow: true,
      showNotesRow: false,
      showPoolAndExamSection: false,
    },
  },
  {
    id: 'exam_student',
    label: 'Öğrenci & Sınav Odaklı',
    shortLabel: 'Öğrenci & Sınav',
    description: 'Okuma, soru bankası vitrini, çalışma havuzu sınavları, notlar ve dinleme.',
    prefs: {
      profile: 'exam_student',
      showReadingRow: true,
      showPoolAndExamSection: true,
      showNotesRow: true,
      showListeningRow: true,
      showMemorizationRow: false,
      showHatimRow: false,
    },
  },
  {
    id: 'all',
    label: 'Tam Kapsamlı',
    shortLabel: 'Tam Kapsamlı',
    description: 'Tüm okuma, hatim, ezber, dinleme, notlar ve sınav bölümleri görünür.',
    prefs: { ...DEFAULT_DESK_PREFS },
  },
];

export interface StudyDeskToggleMeta {
  key: StudyDeskRowToggleKey;
  label: string;
  description: string;
}

export const STUDY_DESK_TOGGLES: readonly StudyDeskToggleMeta[] = [
  {
    key: 'showReadingRow',
    label: 'Okuma & Kaldığım Yer',
    description: 'Son okunan sure/sayfa ve ayraç kısayolları.',
  },
  {
    key: 'showHatimRow',
    label: '30 Cüz Hatim Planım',
    description: 'Aktif hatim yüzdesi, günlük hedef ve hızlı planlama.',
  },
  {
    key: 'showMemorizationRow',
    label: 'Ezber & Klasik Hafızlık',
    description: 'Devam eden oturum, Klasik 20 Tur Ham–Has ve günlük tekrarlar.',
  },
  {
    key: 'showListeningRow',
    label: 'Dinleme & Çalma Listeleri',
    description: 'Seçili kurrâ ve hazır çalma listelerine tek tıkla erişim.',
  },
  {
    key: 'showNotesRow',
    label: 'Kişisel Ayet Notlarım & Defterim',
    description: 'Son eklenen ayet notunuz ve araştırma konularına hızlı geçiş.',
  },
  {
    key: 'showPoolAndExamSection',
    label: 'Sınav Vurgusu & Soru Bankası Vitrini',
    description: 'Üst soru sayaçları, Hata Kampı rozeti, Sınav Başlat ve Soru Bankası sureleri.',
  },
];

const TOGGLE_KEYS: readonly StudyDeskRowToggleKey[] = [
  'showReadingRow',
  'showHatimRow',
  'showMemorizationRow',
  'showListeningRow',
  'showNotesRow',
  'showPoolAndExamSection',
];

export function countEnabledDeskRows(prefs: StudyDeskPrefs): number {
  let count = 0;
  for (const key of TOGGLE_KEYS) {
    if (prefs[key]) count += 1;
  }
  return count;
}

export function applyStudyDeskProfile(
  profileId: Exclude<StudyDeskProfileId, 'custom'>,
): StudyDeskPrefs {
  const found = STUDY_DESK_PROFILES.find((p) => p.id === profileId);
  return found ? { ...found.prefs } : { ...DEFAULT_DESK_PREFS };
}

export function toggleStudyDeskRow(
  current: StudyDeskPrefs,
  key: StudyDeskRowToggleKey,
): StudyDeskPrefs {
  const nextVal = !current[key];
  if (!nextVal && countEnabledDeskRows(current) <= 1) {
    return current;
  }
  return {
    ...current,
    [key]: nextVal,
    profile: 'custom',
  };
}

export function sanitizeStudyDeskPrefs(raw: unknown): StudyDeskPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_DESK_PREFS };
  }
  const rec = raw as Partial<StudyDeskPrefs>;
  const validProfile: StudyDeskProfileId =
    rec.profile === 'all' ||
    rec.profile === 'reading_hatim' ||
    rec.profile === 'hifz' ||
    rec.profile === 'exam_student' ||
    rec.profile === 'custom'
      ? rec.profile
      : DEFAULT_DESK_PREFS.profile;

  const hydrated: StudyDeskPrefs = {
    profile: validProfile,
    showReadingRow:
      typeof rec.showReadingRow === 'boolean' ? rec.showReadingRow : DEFAULT_DESK_PREFS.showReadingRow,
    showHatimRow:
      typeof rec.showHatimRow === 'boolean' ? rec.showHatimRow : DEFAULT_DESK_PREFS.showHatimRow,
    showMemorizationRow:
      typeof rec.showMemorizationRow === 'boolean'
        ? rec.showMemorizationRow
        : DEFAULT_DESK_PREFS.showMemorizationRow,
    showListeningRow:
      typeof rec.showListeningRow === 'boolean'
        ? rec.showListeningRow
        : DEFAULT_DESK_PREFS.showListeningRow,
    showNotesRow:
      typeof rec.showNotesRow === 'boolean' ? rec.showNotesRow : DEFAULT_DESK_PREFS.showNotesRow,
    showPoolAndExamSection:
      typeof rec.showPoolAndExamSection === 'boolean'
        ? rec.showPoolAndExamSection
        : DEFAULT_DESK_PREFS.showPoolAndExamSection,
  };

  if (countEnabledDeskRows(hydrated) === 0) {
    hydrated.showReadingRow = true;
  }

  return hydrated;
}

export function getStudyDeskProfileLabel(profile: StudyDeskProfileId): string {
  if (profile === 'custom') return 'Özel Düzen';
  return STUDY_DESK_PROFILES.find((p) => p.id === profile)?.label ?? 'Tam Kapsamlı';
}
