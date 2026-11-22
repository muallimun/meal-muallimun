import type {
  FihristTopic,
  ResearchBackupPayload,
  ResearchTopic,
  ResearchVerseEntry,
} from '../types/fihrist';
import { clampAyahRange } from '../utils/quranBounds';

export const RESEARCH_NOTEBOOK_STORAGE_KEY = 'muallimun_research_notebooks_v1';

type Listener = () => void;

const listeners = new Set<Listener>();
let memoryTopics: ResearchTopic[] | null = null;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeVerseEntry(raw: unknown, idx: number): ResearchVerseEntry | null {
  if (!raw) return null;

  let surah = NaN;
  let startAyah = NaN;
  let endAyah = NaN;
  let id: string | undefined;
  let note: string | undefined;
  let addedAt: string | undefined;

  if (Array.isArray(raw)) {
    surah = Number(raw[0]);
    startAyah = Number(raw[1]);
    endAyah = raw[2] !== undefined ? Number(raw[2]) : startAyah;
  } else if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    surah = Number(r.surah ?? r.s);
    const rawStart = r.startAyah ?? r.start ?? r.ayah ?? r.a;
    const rawEnd = r.endAyah ?? r.end ?? rawStart;
    startAyah = Number(rawStart);
    endAyah = rawEnd !== undefined ? Number(rawEnd) : startAyah;
    if (typeof r.id === 'string' && r.id.trim()) id = r.id.trim();
    if (typeof r.note === 'string' && r.note.trim()) note = r.note.trim();
    if (typeof r.addedAt === 'string' && r.addedAt) addedAt = r.addedAt;
  }

  if (
    !Number.isInteger(surah) ||
    surah < 1 ||
    surah > 114 ||
    !Number.isInteger(startAyah) ||
    startAyah < 1 ||
    !Number.isInteger(endAyah) ||
    endAyah < 1
  ) {
    return null;
  }

  const clamped = clampAyahRange(surah, startAyah, endAyah);
  if (!clamped) return null;

  return {
    id: id ?? `rv_${idx}_${clamped.surah}_${clamped.startAyah}`,
    surah: clamped.surah,
    startAyah: clamped.startAyah,
    endAyah: clamped.endAyah,
    note,
    addedAt: addedAt ?? new Date().toISOString(),
  };
}

function sanitizeTopic(raw: unknown, idx: number): ResearchTopic | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const rawTitle = typeof t.title === 'string' ? t.title : typeof t.name === 'string' ? t.name : '';
  const title = rawTitle.trim();
  if (!title) return null;

  const rawItems = Array.isArray(t.items)
    ? t.items
    : Array.isArray(t.entries)
      ? t.entries
      : Array.isArray(t.refs)
        ? t.refs
        : [];
  const items: ResearchVerseEntry[] = [];
  const seenItemIds = new Set<string>();

  for (let i = 0; i < rawItems.length; i += 1) {
    const clean = sanitizeVerseEntry(rawItems[i], i);
    if (!clean) continue;
    if (seenItemIds.has(clean.id)) {
      clean.id = `${clean.id}_${i}`;
    }
    seenItemIds.add(clean.id);
    items.push(clean);
  }

  const now = new Date().toISOString();
  return {
    id: typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `rt_${idx}_${Date.now()}`,
    title,
    description:
      typeof t.description === 'string' && t.description.trim()
        ? t.description.trim()
        : undefined,
    items,
    createdAt: typeof t.createdAt === 'string' && t.createdAt ? t.createdAt : now,
    updatedAt: typeof t.updatedAt === 'string' && t.updatedAt ? t.updatedAt : now,
  };
}

function readFromStorage(): ResearchTopic[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RESEARCH_NOTEBOOK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { topics?: unknown[] }).topics)
        ? (parsed as { topics: unknown[] }).topics
        : [];

    const out: ResearchTopic[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < list.length; i += 1) {
      const clean = sanitizeTopic(list[i], i);
      if (!clean) continue;
      if (seenIds.has(clean.id)) {
        clean.id = `${clean.id}_${i}`;
      }
      seenIds.add(clean.id);
      out.push(clean);
    }
    return out;
  } catch {
    return [];
  }
}

function writeToStorage(topics: ResearchTopic[]): void {
  memoryTopics = topics;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RESEARCH_NOTEBOOK_STORAGE_KEY, JSON.stringify(topics));
    } catch {
      // Depolama kotası doluysa bellek kopyasıyla devam et
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

export function getResearchTopicsSnapshot(): ResearchTopic[] {
  if (memoryTopics === null) {
    memoryTopics = readFromStorage();
  }
  return memoryTopics;
}

export function subscribeResearchTopics(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createResearchTopic(title: string, description?: string): ResearchTopic {
  const cleanTitle = title.trim() || 'Yeni Araştırma Konusu';
  const now = new Date().toISOString();
  const topic: ResearchTopic = {
    id: generateId('rt'),
    title: cleanTitle,
    description: description?.trim() || undefined,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
  const current = getResearchTopicsSnapshot();
  writeToStorage([topic, ...current]);
  return topic;
}

export function updateResearchTopicMeta(
  topicId: string,
  patch: { title?: string; description?: string },
): void {
  const current = getResearchTopicsSnapshot();
  const now = new Date().toISOString();
  const next = current.map((topic) => {
    if (topic.id !== topicId) return topic;
    return {
      ...topic,
      title: patch.title !== undefined ? patch.title.trim() || topic.title : topic.title,
      description:
        patch.description !== undefined
          ? patch.description.trim() || undefined
          : topic.description,
      updatedAt: now,
    };
  });
  writeToStorage(next);
}

export function deleteResearchTopic(topicId: string): void {
  const current = getResearchTopicsSnapshot();
  writeToStorage(current.filter((t) => t.id !== topicId));
}

export function addVersesToResearchTopic(
  topicId: string,
  ranges: readonly { surah: number; startAyah: number; endAyah: number; note?: string }[],
): { addedCount: number; skippedDuplicates: number } {
  if (ranges.length === 0) return { addedCount: 0, skippedDuplicates: 0 };

  const current = getResearchTopicsSnapshot();
  const now = new Date().toISOString();
  let addedCount = 0;
  let skippedDuplicates = 0;

  const next = current.map((topic) => {
    if (topic.id !== topicId) return topic;
    const existingKeys = new Set(
      topic.items.map((it) => `${it.surah}:${it.startAyah}-${it.endAyah}`),
    );
    const newEntries: ResearchVerseEntry[] = [];

    for (const r of ranges) {
      const clamped = clampAyahRange(r.surah, r.startAyah, r.endAyah);
      if (!clamped) continue;
      const { surah: s, startAyah: a1, endAyah: a2 } = clamped;
      const sig = `${s}:${a1}-${a2}`;
      if (existingKeys.has(sig)) {
        skippedDuplicates += 1;
        continue;
      }
      existingKeys.add(sig);
      addedCount += 1;
      newEntries.push({
        id: generateId('rv'),
        surah: s,
        startAyah: a1,
        endAyah: a2,
        note: r.note?.trim() || undefined,
        addedAt: now,
      });
    }

    if (newEntries.length === 0) return topic;
    return {
      ...topic,
      items: [...topic.items, ...newEntries],
      updatedAt: now,
    };
  });

  if (addedCount > 0) {
    writeToStorage(next);
  }
  return { addedCount, skippedDuplicates };
}

export function updateResearchVerseNote(
  topicId: string,
  entryId: string,
  note: string,
): void {
  const current = getResearchTopicsSnapshot();
  const now = new Date().toISOString();
  const cleanNote = note.trim();
  const next = current.map((topic) => {
    if (topic.id !== topicId) return topic;
    return {
      ...topic,
      items: topic.items.map((it) =>
        it.id === entryId ? { ...it, note: cleanNote || undefined } : it,
      ),
      updatedAt: now,
    };
  });
  writeToStorage(next);
}

export function updateResearchVerse(
  topicId: string,
  entryId: string,
  patch: { surah: number; startAyah: number; endAyah: number; note?: string },
): void {
  const clamped = clampAyahRange(
    Math.trunc(patch.surah),
    Math.trunc(patch.startAyah),
    Math.trunc(patch.endAyah),
  );
  if (!clamped) return;
  const { surah: s, startAyah: a1, endAyah: a2 } = clamped;
  const cleanNote = patch.note !== undefined ? patch.note.trim() || undefined : undefined;

  const current = getResearchTopicsSnapshot();
  const now = new Date().toISOString();
  const next = current.map((topic) => {
    if (topic.id !== topicId) return topic;
    return {
      ...topic,
      items: topic.items.map((it) =>
        it.id === entryId
          ? {
              ...it,
              surah: s,
              startAyah: a1,
              endAyah: a2,
              note: patch.note !== undefined ? cleanNote : it.note,
            }
          : it,
      ),
      updatedAt: now,
    };
  });
  writeToStorage(next);
}

export function removeResearchVerse(topicId: string, entryId: string): void {
  const current = getResearchTopicsSnapshot();
  const now = new Date().toISOString();
  const next = current.map((topic) => {
    if (topic.id !== topicId) return topic;
    return {
      ...topic,
      items: topic.items.filter((it) => it.id !== entryId),
      updatedAt: now,
    };
  });
  writeToStorage(next);
}

export function moveResearchVerse(
  topicId: string,
  entryId: string,
  direction: 'up' | 'down',
): void {
  const current = getResearchTopicsSnapshot();
  const now = new Date().toISOString();
  const next = current.map((topic) => {
    if (topic.id !== topicId) return topic;
    const idx = topic.items.findIndex((it) => it.id === entryId);
    if (idx === -1) return topic;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= topic.items.length) return topic;
    const copy = [...topic.items];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    return {
      ...topic,
      items: copy,
      updatedAt: now,
    };
  });
  writeToStorage(next);
}

export function copyFihristTopicToNotebook(fihristTopic: FihristTopic): ResearchTopic {
  const now = new Date().toISOString();
  const items: ResearchVerseEntry[] = fihristTopic.refs.map(([surah, startAyah, endAyah], idx) => ({
    id: `${generateId('rv')}_${idx}`,
    surah,
    startAyah,
    endAyah,
    addedAt: now,
  }));

  const newTopic: ResearchTopic = {
    id: generateId('rt'),
    title: fihristTopic.title,
    description: fihristTopic.tags?.length
      ? `Konu fihristinden kopyalandı · Etiketler: ${fihristTopic.tags.join(', ')}`
      : 'Konu fihristinden kopyalandı',
    items,
    createdAt: now,
    updatedAt: now,
  };

  const current = getResearchTopicsSnapshot();
  writeToStorage([newTopic, ...current]);
  return newTopic;
}

export function createResearchBackupPayload(): ResearchBackupPayload {
  return {
    schema: 'muallimun_research_backup_v1',
    exportedAt: new Date().toISOString(),
    topics: getResearchTopicsSnapshot(),
  };
}

function extractRawTopicsFromBackup(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.topics)) return obj.topics;
  if (Array.isArray(obj.notebooks)) return obj.notebooks;
  if (Array.isArray(obj.items) && (typeof obj.title === 'string' || typeof obj.name === 'string')) {
    return [obj];
  }
  if (Array.isArray(obj.refs) && (typeof obj.title === 'string' || typeof obj.name === 'string')) {
    return [obj];
  }
  if (obj.data && typeof obj.data === 'object') {
    if (Array.isArray(obj.data)) return obj.data;
    const nested = obj.data as Record<string, unknown>;
    if (Array.isArray(nested.topics)) return nested.topics;
    if (Array.isArray(nested.notebooks)) return nested.notebooks;
  }
  return null;
}

export function importResearchBackupPayload(
  rawJson: string,
  mode: 'merge' | 'replace',
): { importedTopics: number; totalTopics: number } {
  const parsed = JSON.parse(rawJson) as unknown;
  const rawTopics = extractRawTopicsFromBackup(parsed);

  if (!rawTopics) {
    throw new Error('Geçersiz yedek dosyası formatı. Geçerli bir Araştırma Defteri JSON dosyası seçin.');
  }

  const incoming: ResearchTopic[] = [];
  for (let i = 0; i < rawTopics.length; i += 1) {
    const clean = sanitizeTopic(rawTopics[i], i);
    if (clean) incoming.push(clean);
  }

  if (incoming.length === 0) {
    throw new Error('Yedek dosyasında geçerli araştırma konusu bulunamadı.');
  }

  if (mode === 'replace') {
    writeToStorage(incoming);
    return { importedTopics: incoming.length, totalTopics: incoming.length };
  }

  const current = getResearchTopicsSnapshot();
  const existingIds = new Set(current.map((t) => t.id));
  const merged = [...current];
  let importedCount = 0;

  for (const topic of incoming) {
    const finalTopic = existingIds.has(topic.id)
      ? { ...topic, id: generateId('rt') }
      : topic;
    existingIds.add(finalTopic.id);
    merged.unshift(finalTopic);
    importedCount += 1;
  }

  writeToStorage(merged);
  return { importedTopics: importedCount, totalTopics: merged.length };
}

export const researchStorage = {
  getSnapshot: getResearchTopicsSnapshot,
  subscribe: subscribeResearchTopics,
  createTopic: createResearchTopic,
  updateTopicMeta: updateResearchTopicMeta,
  deleteTopic: deleteResearchTopic,
  addVerses: addVersesToResearchTopic,
  updateNote: updateResearchVerseNote,
  updateVerse: updateResearchVerse,
  removeVerse: removeResearchVerse,
  moveVerse: moveResearchVerse,
  copyFromFihrist: copyFihristTopicToNotebook,
  createBackup: createResearchBackupPayload,
  importBackup: importResearchBackupPayload,
};
