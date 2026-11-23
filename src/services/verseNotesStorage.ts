import { getSurahMaxAyah } from '../utils/quranBounds';
import { isAllPersistencePaused, reportStorageQuotaError } from '../utils/storageQuotaBus';

export const VERSE_NOTES_STORAGE_KEY = 'muallimun_verse_notes_v1';
export const MAX_VERSE_NOTE_LENGTH = 4000;
export const MAX_VERSE_NOTE_TAGS = 8;

export type VerseNoteColor = 'emerald' | 'amber' | 'sky' | 'rose';

export interface VerseNote {
  key: string;
  surah: number;
  ayah: number;
  page?: number;
  text: string;
  tags: string[];
  color: VerseNoteColor;
  createdAt: string;
  updatedAt: string;
}

export interface VerseNoteColorStyle {
  id: VerseNoteColor;
  label: string;
  dot: string;
  softBg: string;
  border: string;
  badgeText: string;
}

export const VERSE_NOTE_COLORS: readonly VerseNoteColor[] = ['emerald', 'amber', 'sky', 'rose'];

export const VERSE_NOTE_COLOR_STYLES: Record<VerseNoteColor, VerseNoteColorStyle> = {
  emerald: {
    id: 'emerald',
    label: 'Zümrüt',
    dot: '#0F766E',
    softBg: 'rgba(15, 118, 110, 0.10)',
    border: 'rgba(15, 118, 110, 0.34)',
    badgeText: '#0F766E',
  },
  amber: {
    id: 'amber',
    label: 'Kehribar',
    dot: '#D97706',
    softBg: 'rgba(217, 119, 6, 0.11)',
    border: 'rgba(217, 119, 6, 0.36)',
    badgeText: '#B45309',
  },
  sky: {
    id: 'sky',
    label: 'Gök Mavisi',
    dot: '#0284C7',
    softBg: 'rgba(2, 132, 199, 0.10)',
    border: 'rgba(2, 132, 199, 0.34)',
    badgeText: '#0369A1',
  },
  rose: {
    id: 'rose',
    label: 'Gül',
    dot: '#E11D48',
    softBg: 'rgba(225, 29, 72, 0.09)',
    border: 'rgba(225, 29, 72, 0.32)',
    badgeText: '#BE123C',
  },
};

export const QUICK_VERSE_NOTE_TAGS: readonly string[] = [
  'Tefekkür',
  'Dua',
  'Ahlak',
  'Hüküm',
  'Ders Notu',
  'Ezber İpucu',
];

export function makeVerseNoteKey(surah: number, ayah: number): string {
  return `${Math.trunc(surah)}:${Math.trunc(ayah)}`;
}

function sanitizeColor(raw: unknown): VerseNoteColor {
  if (raw === 'emerald' || raw === 'amber' || raw === 'sky' || raw === 'rose') {
    return raw;
  }
  return 'emerald';
}

function sanitizeIso(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return fallback;
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().slice(0, 32);
    if (!clean) continue;
    const lower = clean.toLocaleLowerCase('tr-TR');
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(clean);
    if (out.length >= MAX_VERSE_NOTE_TAGS) break;
  }
  return out;
}

export function sanitizeVerseNote(raw: unknown): VerseNote | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const surah = typeof r.surah === 'number' && Number.isFinite(r.surah) ? Math.trunc(r.surah) : 0;
  const ayah = typeof r.ayah === 'number' && Number.isFinite(r.ayah) ? Math.trunc(r.ayah) : 0;
  const maxAyah = getSurahMaxAyah(surah);
  if (maxAyah <= 0 || ayah < 1 || ayah > maxAyah) return null;

  const text = typeof r.text === 'string' ? r.text.trim().slice(0, MAX_VERSE_NOTE_LENGTH) : '';
  const tags = sanitizeTags(r.tags);
  if (!text && tags.length === 0) return null;

  const page =
    typeof r.page === 'number' && Number.isFinite(r.page) && r.page >= 1 && r.page <= 604
      ? Math.trunc(r.page)
      : undefined;

  const nowIso = new Date().toISOString();
  const createdAt = sanitizeIso(r.createdAt, nowIso);
  const updatedAt = sanitizeIso(r.updatedAt, createdAt);

  return {
    key: makeVerseNoteKey(surah, ayah),
    surah,
    ayah,
    ...(page !== undefined ? { page } : {}),
    text,
    tags,
    color: sanitizeColor(r.color),
    createdAt,
    updatedAt,
  };
}

function sortNotesDesc(notes: VerseNote[]): VerseNote[] {
  return [...notes].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.surah - b.surah || a.ayah - b.ayah,
  );
}

function parseRawNotesCollection(parsed: unknown): VerseNote[] {
  const candidates: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { notes?: unknown }).notes)
      ? ((parsed as { notes: unknown[] }).notes)
      : parsed && typeof parsed === 'object'
        ? Object.values(parsed as Record<string, unknown>)
        : [];

  const byKey = new Map<string, VerseNote>();
  for (const item of candidates) {
    const clean = sanitizeVerseNote(item);
    if (!clean) continue;
    const prev = byKey.get(clean.key);
    if (!prev || clean.updatedAt >= prev.updatedAt) {
      byKey.set(clean.key, clean);
    }
  }
  return sortNotesDesc(Array.from(byKey.values()));
}

export function validateVerseNotesJson(rawJson: string): {
  valid: boolean;
  notesCount: number;
} {
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, notesCount: 0 };
    }
    const notes = parseRawNotesCollection(parsed);
    return { valid: true, notesCount: notes.length };
  } catch {
    return { valid: false, notesCount: 0 };
  }
}

// ============================================================================
// Reaktif localStorage Servisi (useSyncExternalStore + Çoklu Sekme Senkronlu)
// ============================================================================

const listeners = new Set<() => void>();
let cachedNotes: VerseNote[] = [];
let cachedMap: Map<string, VerseNote> = new Map();
let hydrated = false;

function rebuildCaches(notes: VerseNote[]): void {
  cachedNotes = sortNotesDesc(notes);
  cachedMap = new Map(cachedNotes.map((n) => [n.key, n]));
  hydrated = true;
}

function readFromStorage(): VerseNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(VERSE_NOTES_STORAGE_KEY);
    if (!raw) return [];
    return parseRawNotesCollection(JSON.parse(raw));
  } catch {
    return [];
  }
}

function ensureHydrated(): void {
  if (!hydrated) {
    rebuildCaches(readFromStorage());
  }
}

function emitChange(): void {
  listeners.forEach((fn) => fn());
}

function persistNotes(next: VerseNote[]): void {
  rebuildCaches(next);
  if (typeof window !== 'undefined' && !isAllPersistencePaused()) {
    try {
      window.localStorage.setItem(
        VERSE_NOTES_STORAGE_KEY,
        JSON.stringify({ version: 1, notes: cachedNotes }),
      );
    } catch {
      reportStorageQuotaError();
    }
  }
  emitChange();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === VERSE_NOTES_STORAGE_KEY) {
      rebuildCaches(readFromStorage());
      emitChange();
    }
  });
}

export const verseNotesStorage = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): readonly VerseNote[] {
    ensureHydrated();
    return cachedNotes;
  },

  getMapSnapshot(): ReadonlyMap<string, VerseNote> {
    ensureHydrated();
    return cachedMap;
  },

  getVerseNote(surah: number, ayah: number): VerseNote | null {
    ensureHydrated();
    return cachedMap.get(makeVerseNoteKey(surah, ayah)) ?? null;
  },

  getNotesForSurah(surah: number): VerseNote[] {
    ensureHydrated();
    const cleanSurah = Math.trunc(surah);
    return cachedNotes
      .filter((n) => n.surah === cleanSurah)
      .sort((a, b) => a.ayah - b.ayah);
  },

  upsertVerseNote(input: {
    surah: number;
    ayah: number;
    page?: number;
    text: string;
    tags?: string[];
    color?: VerseNoteColor;
  }): VerseNote | null {
    ensureHydrated();
    const surah = Math.trunc(input.surah);
    const ayah = Math.trunc(input.ayah);
    const maxAyah = getSurahMaxAyah(surah);
    if (maxAyah <= 0 || ayah < 1 || ayah > maxAyah) return null;

    const cleanText = input.text.trim().slice(0, MAX_VERSE_NOTE_LENGTH);
    const cleanTags = sanitizeTags(input.tags ?? []);
    const key = makeVerseNoteKey(surah, ayah);

    if (!cleanText && cleanTags.length === 0) {
      this.deleteVerseNote(surah, ayah);
      return null;
    }

    const existing = cachedMap.get(key);
    const nowIso = new Date().toISOString();
    const page =
      typeof input.page === 'number' && Number.isFinite(input.page) && input.page >= 1 && input.page <= 604
        ? Math.trunc(input.page)
        : existing?.page;

    const saved: VerseNote = {
      key,
      surah,
      ayah,
      ...(page !== undefined ? { page } : {}),
      text: cleanText,
      tags: cleanTags,
      color: sanitizeColor(input.color ?? existing?.color ?? 'emerald'),
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    const next = cachedNotes.filter((n) => n.key !== key);
    next.push(saved);
    persistNotes(next);
    return saved;
  },

  deleteVerseNote(surah: number, ayah: number): void {
    ensureHydrated();
    const key = makeVerseNoteKey(surah, ayah);
    if (!cachedMap.has(key)) return;
    persistNotes(cachedNotes.filter((n) => n.key !== key));
  },

  exportNotesJson(): string {
    ensureHydrated();
    return JSON.stringify(
      {
        app: 'muallimun-verse-notes',
        version: 1,
        exportedAt: new Date().toISOString(),
        notes: cachedNotes,
      },
      null,
      2,
    );
  },

  importNotesJson(
    raw: string | unknown,
    mode: 'merge' | 'replace' = 'merge',
  ): { importedCount: number; totalNotes: number } {
    ensureHydrated();
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error('Seçilen dosya geçerli bir JSON biçiminde değil.');
      }
    }
    const incoming = parseRawNotesCollection(parsed);
    if (mode === 'replace') {
      persistNotes(incoming);
      return { importedCount: incoming.length, totalNotes: cachedNotes.length };
    }

    const merged = new Map<string, VerseNote>(cachedMap);
    let importedCount = 0;
    for (const note of incoming) {
      const prev = merged.get(note.key);
      if (!prev || note.updatedAt >= prev.updatedAt) {
        merged.set(note.key, note);
        importedCount += 1;
      }
    }
    persistNotes(Array.from(merged.values()));
    return { importedCount, totalNotes: cachedNotes.length };
  },
};
