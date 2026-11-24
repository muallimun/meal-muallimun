import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronRight,
  ChevronUp,
  ClipboardCopy,
  Download,
  Edit3,
  FolderPlus,
  Headphones,
  ListPlus,
  ListTree,
  MoreHorizontal,
  NotebookPen,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Printer,
  Scale,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ResponsiveActionMenu } from '../../components/ResponsiveActionMenu';
import { audioQueueService } from '../../services/audioQueueService';
import { useBackButtonGuard } from '../../services/backStackService';
import {
  buildAudioSegmentsFromItems,
  countEntriesAyahs,
  parseBulkVerseReferences,
} from '../../services/fihristService';
import { researchStorage } from '../../services/researchStorage';
import { sfxService } from '../../services/sfxService';
import { verseNotesStorage } from '../../services/verseNotesStorage';
import { useAppStore } from '../../store/useAppStore';
import type {
  FihristPrintMode,
  FihristViewMode,
  ResearchSortMode,
  ResearchTopic,
  ResearchVerseEntry,
} from '../../types/fihrist';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import { getSurahMap } from '../../utils/poolUtils';
import { PersonalVerseNotesPanel } from './PersonalVerseNotesPanel';
import { PrintableFihristModal } from './PrintableFihristModal';
import {
  VerseCollectionRenderer,
  type CollectionDisplayItem,
} from './VerseCollectionRenderer';

interface ResearchNotebookTabProps {
  selectedTopicIdOverride?: string | null;
  onClearTopicOverride?: () => void;
  initialSubViewOverride?: 'topics' | 'notes' | null;
  onClearSubViewOverride?: () => void;
}

const VIEW_MODE_OPTIONS: readonly {
  id: FihristViewMode;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'index', label: 'Fihrist', shortLabel: 'Fihrist', icon: ListTree },
  { id: 'ar', label: 'Sadece Arapça', shortLabel: 'Arapça', icon: BookOpen },
  { id: 'meal', label: 'Sadece Meal', shortLabel: 'Meal', icon: BookOpen },
  { id: 'ar_meal', label: 'AR + Meal', shortLabel: 'AR+Meal', icon: Scale },
];

const SORT_MODE_OPTIONS: readonly { id: ResearchSortMode; label: string }[] = [
  { id: 'custom', label: 'Kendi Sıram' },
  { id: 'mushaf', label: 'Mushaf' },
  { id: 'nuzul', label: 'Nüzul' },
];

const NOTEBOOK_SIDEBAR_STORAGE_KEY = 'muallimun_notebook_sidebar_open';
type SidebarPreference = 'open' | 'closed' | null;

function readNotebookSidebarPref(): SidebarPreference {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_SIDEBAR_STORAGE_KEY);
    if (raw === '1' || raw === 'true') return 'open';
    if (raw === '0' || raw === 'false') return 'closed';
    return null;
  } catch {
    return null;
  }
}

function writeNotebookSidebarPref(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTEBOOK_SIDEBAR_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Gizli mod / kota kısıtında sessizce devam et
  }
}

/**
 * Kayıt listesini akademik referans biçiminde biçimlendirir:
 * Örn: "2/153-157, 253, 270; 3/13, 123"
 */
function formatAcademicReferences(entries: readonly ResearchVerseEntry[]): string {
  if (entries.length === 0) return '';
  const groups = new Map<number, string[]>();
  const surahOrder: number[] = [];

  for (const entry of entries) {
    let list = groups.get(entry.surah);
    if (!list) {
      list = [];
      groups.set(entry.surah, list);
      surahOrder.push(entry.surah);
    }
    const token =
      entry.startAyah === entry.endAyah
        ? `${entry.startAyah}`
        : `${entry.startAyah}-${entry.endAyah}`;
    if (!list.includes(token)) {
      list.push(token);
    }
  }

  return surahOrder.map((sNo) => `${sNo}/${groups.get(sNo)!.join(', ')}`).join('; ');
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const ResearchNotebookTab: React.FC<ResearchNotebookTabProps> = ({
  selectedTopicIdOverride,
  onClearTopicOverride,
  initialSubViewOverride,
  onClearSubViewOverride,
}) => {
  const { meta, manifest, audioPrefs, settings, openMealSelector } = useAppStore();
  const topics = useSyncExternalStore(
    researchStorage.subscribe,
    researchStorage.getSnapshot,
  );
  const verseNotes = useSyncExternalStore(
    verseNotesStorage.subscribe,
    verseNotesStorage.getSnapshot,
  );
  const [notebookSubView, setNotebookSubView] = useState<'topics' | 'notes'>('topics');

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const surahsList = useMemo(() => meta?.surahs ?? [], [meta]);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    () => topics[0]?.id ?? null,
  );
  const [viewMode, setViewMode] = useState<FihristViewMode>('ar_meal');
  const [sortMode, setSortMode] = useState<ResearchSortMode>('custom');

  // Akıllı sol başlık paneli (masaüstü) + mobil üst çekmece + arama
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  const [manualSidebarPref, setManualSidebarPref] = useState<SidebarPreference>(() =>
    readNotebookSidebarPref(),
  );
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState<boolean>(() => {
    const pref = readNotebookSidebarPref();
    if (pref === 'open') return true;
    if (pref === 'closed') return false;
    return topics.length >= 2;
  });
  const [isMobileTopicsDrawerOpen, setIsMobileTopicsDrawerOpen] = useState(false);
  const [topicSearchQuery, setTopicSearchQuery] = useState('');

  // Katlanabilir "Ayet / Pasaj / Not Ekleme" alanı
  const [isAddPanelOpen, setIsAddPanelOpen] = useState<boolean>(() => {
    const initialTopic = topics[0] ?? null;
    return initialTopic ? initialTopic.items.length === 0 : false;
  });
  const lastTopicIdForAddPanelRef = useRef<string | null>(null);

  // Yeni konu oluşturma
  const [isNewTopicFormOpen, setIsNewTopicFormOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');

  // Konu başlığı düzenleme & silme onayı & '⋯' menü
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editTitleDraft, setEditTitleDraft] = useState('');
  const [editDescDraft, setEditDescDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Hızlı Ayet Ekleme — Serbest klavye girişi için STRING state (onChange içinde zorla sınırlama YOK!)
  const [pickerSurah, setPickerSurah] = useState<number>(2);
  const [pickerStartText, setPickerStartText] = useState<string>('');
  const [pickerEndText, setPickerEndText] = useState<string>('');
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);
  const [pickerNote, setPickerNote] = useState('');
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [addToast, setAddToast] = useState<string | null>(null);

  // A4 PDF & Yedekleme Modalları
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    setIsDesktopViewport(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (manualSidebarPref === null) {
      setIsDesktopSidebarOpen(topics.length >= 2);
    }
  }, [topics.length, manualSidebarPref]);

  useEffect(() => {
    if (isDesktopViewport && isMobileTopicsDrawerOpen) {
      setIsMobileTopicsDrawerOpen(false);
    }
  }, [isDesktopViewport, isMobileTopicsDrawerOpen]);

  useBackButtonGuard('research_topics_drawer', isMobileTopicsDrawerOpen, () => {
    setIsMobileTopicsDrawerOpen(false);
  });

  useEffect(() => {
    if (!isMobileTopicsDrawerOpen) return;
    const releaseLock = acquireBodyScrollLock();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileTopicsDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      releaseLock();
    };
  }, [isMobileTopicsDrawerOpen]);

  useBackButtonGuard('research_backup_modal', isBackupModalOpen, () => {
    setIsBackupModalOpen(false);
  });

  useEffect(() => {
    if (!isBackupModalOpen) return;
    return acquireBodyScrollLock();
  }, [isBackupModalOpen]);

  // Dışarıdan kopyalanan veya yönlendirilen bir konuya doğrudan geçiş
  useEffect(() => {
    if (!selectedTopicIdOverride) return;
    setNotebookSubView('topics');
    setSelectedTopicId(selectedTopicIdOverride);
    onClearTopicOverride?.();
  }, [selectedTopicIdOverride, onClearTopicOverride]);

  useEffect(() => {
    if (!initialSubViewOverride) return;
    setNotebookSubView(initialSubViewOverride);
    onClearSubViewOverride?.();
  }, [initialSubViewOverride, onClearSubViewOverride]);

  // Seçili konu silindiyse ilk konuya dön
  const activeTopic = useMemo<ResearchTopic | null>(() => {
    if (selectedTopicId) {
      const found = topics.find((t) => t.id === selectedTopicId);
      if (found) return found;
    }
    return topics[0] ?? null;
  }, [selectedTopicId, topics]);

  // Akıllı Ekleme Paneli açılış kuralı:
  // Konu değiştiğinde 0 pasaj varsa otomatik açık, >=1 pasaj varsa kapalı başlar.
  // Aynı konuda ekleme yapıldıktan sonra kullanıcı kapatana kadar açık kalmaya devam eder.
  useEffect(() => {
    if (!activeTopic) {
      lastTopicIdForAddPanelRef.current = null;
      return;
    }
    if (lastTopicIdForAddPanelRef.current !== activeTopic.id) {
      lastTopicIdForAddPanelRef.current = activeTopic.id;
      setIsAddPanelOpen(activeTopic.items.length === 0);
    } else if (activeTopic.items.length === 0) {
      setIsAddPanelOpen(true);
    }
  }, [activeTopic]);

  const filteredTopics = useMemo(() => {
    const q = topicSearchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return topics;
    return topics.filter((t) => {
      const titleMatch = t.title.toLocaleLowerCase('tr-TR').includes(q);
      const descMatch = (t.description ?? '').toLocaleLowerCase('tr-TR').includes(q);
      return titleMatch || descMatch;
    });
  }, [topics, topicSearchQuery]);

  const handleToggleTopicsPanel = () => {
    sfxService.play('click');
    if (isDesktopViewport) {
      setIsDesktopSidebarOpen((prev) => {
        const next = !prev;
        setManualSidebarPref(next ? 'open' : 'closed');
        writeNotebookSidebarPref(next);
        return next;
      });
    } else {
      setIsMobileTopicsDrawerOpen((prev) => !prev);
    }
  };

  const handleCloseDesktopSidebar = () => {
    sfxService.play('click');
    setIsDesktopSidebarOpen(false);
    setManualSidebarPref('closed');
    writeNotebookSidebarPref(false);
  };

  const handleSelectTopic = (topicId: string, closeDrawer = false) => {
    sfxService.play('click');
    setSelectedTopicId(topicId);
    setIsEditingMeta(false);
    setConfirmDeleteId(null);
    if (closeDrawer) {
      setIsMobileTopicsDrawerOpen(false);
    }
  };

  useEffect(() => {
    if (!addToast) return;
    const t = window.setTimeout(() => setAddToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [addToast]);

  const pickerSurahMeta = surahMap.get(pickerSurah);
  const pickerSurahMax = pickerSurahMeta?.ayahCount ?? 286;

  // Sıralanmış kayıtlar (Kendi Sıram / Mushaf / Nüzul)
  const sortedEntries = useMemo<ResearchVerseEntry[]>(() => {
    if (!activeTopic) return [];
    const copy = [...activeTopic.items];
    if (sortMode === 'mushaf') {
      copy.sort((a, b) => a.surah - b.surah || a.startAyah - b.startAyah || a.endAyah - b.endAyah);
    } else if (sortMode === 'nuzul') {
      copy.sort((a, b) => {
        const na = surahMap.get(a.surah)?.nuzulSirasi ?? a.surah;
        const nb = surahMap.get(b.surah)?.nuzulSirasi ?? b.surah;
        return na - nb || a.startAyah - b.startAyah || a.endAyah - b.endAyah;
      });
    }
    return copy;
  }, [activeTopic, sortMode, surahMap]);

  const displayItems = useMemo<CollectionDisplayItem[]>(
    () =>
      sortedEntries.map((entry) => ({
        key: entry.id,
        entryId: entry.id,
        surah: entry.surah,
        startAyah: entry.startAyah,
        endAyah: entry.endAyah,
        note: entry.note,
      })),
    [sortedEntries],
  );

  const parsedBulk = useMemo(
    () => parseBulkVerseReferences(bulkInput, meta),
    [bulkInput, meta],
  );

  const handleCreateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTopicTitle.trim();
    if (!clean) return;
    sfxService.play('click');
    const created = researchStorage.createTopic(clean, newTopicDesc);
    setSelectedTopicId(created.id);
    setTopicSearchQuery('');
    setNewTopicTitle('');
    setNewTopicDesc('');
    setIsNewTopicFormOpen(false);
    setIsMobileTopicsDrawerOpen(false);
    setIsEditingMeta(false);
    setConfirmDeleteId(null);
  };

  const handleStartEditMeta = () => {
    if (!activeTopic) return;
    sfxService.play('click');
    setEditTitleDraft(activeTopic.title);
    setEditDescDraft(activeTopic.description ?? '');
    setIsEditingMeta(true);
    setIsActionsMenuOpen(false);
  };

  const handleSaveEditMeta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTopic || !editTitleDraft.trim()) return;
    sfxService.play('click');
    researchStorage.updateTopicMeta(activeTopic.id, {
      title: editTitleDraft,
      description: editDescDraft,
    });
    setIsEditingMeta(false);
  };

  const handleDeleteTopic = (topicId: string) => {
    sfxService.play('click');
    researchStorage.deleteTopic(topicId);
    setConfirmDeleteId(null);
    setIsActionsMenuOpen(false);
    if (selectedTopicId === topicId) {
      setSelectedTopicId(null);
    }
  };

  const handleAddFromPicker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTopic) return;

    const rawStart = pickerStartText.trim();
    const rawEnd = pickerEndText.trim();

    if (!rawStart || !/^\d+$/.test(rawStart)) {
      setPickerError('Lütfen geçerli bir başlangıç ayet numarası girin.');
      return;
    }

    const startNum = Number(rawStart);
    if (startNum < 1 || startNum > pickerSurahMax) {
      setPickerError(
        `${pickerSurahMeta?.nameTr ?? `${pickerSurah}. Sure`} için ayet numarası 1 ile ${pickerSurahMax} arasında olmalıdır.`,
      );
      return;
    }

    let endNum = startNum;
    if (rawEnd !== '') {
      if (!/^\d+$/.test(rawEnd)) {
        setPickerError('Bitiş ayeti sayısal olmalı veya tek ayet için boş bırakılmalıdır.');
        return;
      }
      endNum = Number(rawEnd);
      if (endNum < startNum || endNum > pickerSurahMax) {
        setPickerError(
          `Bitiş ayeti ${startNum} ile ${pickerSurahMax} arasında olmalıdır (tek ayet için boş bırakın).`,
        );
        return;
      }
    }

    setPickerError(null);
    sfxService.play('click');

    const res = researchStorage.addVerses(activeTopic.id, [
      {
        surah: pickerSurah,
        startAyah: startNum,
        endAyah: endNum,
        note: pickerNote.trim() || undefined,
      },
    ]);

    if (res.addedCount > 0) {
      setPickerStartText('');
      setPickerEndText('');
      setPickerNote('');
      setShowNoteDrawer(false);
      const label =
        startNum === endNum
          ? `${pickerSurah}/${startNum}`
          : `${pickerSurah}/${startNum}-${endNum}`;
      setAddToast(`${label} araştırma listenize eklendi.`);
    } else {
      setAddToast('Bu ayet aralığı listede zaten kayıtlı.');
    }
  };

  const handleAddFromBulk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTopic || parsedBulk.valid.length === 0) return;
    sfxService.play('click');
    const res = researchStorage.addVerses(activeTopic.id, parsedBulk.valid);
    setBulkInput('');
    setShowBulkDrawer(false);
    setAddToast(
      res.skippedDuplicates > 0
        ? `${res.addedCount} pasaj eklendi (${res.skippedDuplicates} mükerrer atlandı).`
        : `${res.addedCount} pasaj tek seferde eklendi.`,
    );
  };

  const handleCopyReferences = async () => {
    if (!activeTopic || sortedEntries.length === 0) return;
    sfxService.play('click');
    setIsActionsMenuOpen(false);
    const formatted = formatAcademicReferences(sortedEntries);
    const copied = await copyTextToClipboard(formatted);
    if (copied) {
      setAddToast(`Referanslar kopyalandı: ${formatted.slice(0, 68)}${formatted.length > 68 ? '…' : ''}`);
    } else {
      setAddToast(`Referanslar: ${formatted}`);
    }
  };

  const handleListenTopic = () => {
    if (!activeTopic || !manifest || !meta || displayItems.length === 0) return;
    sfxService.play('click');
    const segments = buildAudioSegmentsFromItems(
      displayItems,
      meta,
      `research_${activeTopic.id}`,
    );
    void audioQueueService.startSegmentQueue({
      items: segments,
      title: `Araştırma · ${activeTopic.title}`,
      context: 'custom',
      contextKey: `research_topic:${activeTopic.id}`,
      manifest,
      meta,
      prefs: audioPrefs,
    });
  };

  const handleExportBackup = () => {
    sfxService.play('click');
    const payload = researchStorage.createBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muallimun-arastirma-defteri-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupFeedback({
      type: 'success',
      text: `${payload.topics.length} araştırma konusu JSON dosyası olarak indirildi.`,
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error(
          'Yedek dosyası 5 MB sınırını aşıyor. Lütfen geçerli bir Araştırma Defteri JSON dosyası seçin.',
        );
      }
      const text = await file.text();
      const res = researchStorage.importBackup(text, importMode);
      sfxService.play('click');
      setBackupFeedback({
        type: 'success',
        text: `${res.importedTopics} konu başarıyla içe aktarıldı (Toplam ${res.totalTopics} konu).`,
      });
    } catch (err) {
      setBackupFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Yedek dosyası okunamadı.',
      });
    }
  };

  const defaultPrintMode: FihristPrintMode =
    viewMode === 'index' ? 'index' : viewMode === 'meal' ? 'meal' : 'ar_meal';

  const renderNewTopicForm = () => (
    <form
      onSubmit={handleCreateTopic}
      className="p-3.5 rounded-2xl border space-y-2.5"
      style={{
        backgroundColor: 'var(--brand-primary-soft)',
        borderColor: 'var(--brand-primary)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-extrabold inline-flex items-center gap-1.5"
          style={{ color: 'var(--brand-primary-text)' }}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span>Yeni Araştırma Başlığı</span>
        </span>
        <button
          type="button"
          onClick={() => setIsNewTopicFormOpen(false)}
          aria-label="Formu kapat"
          className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        type="text"
        value={newTopicTitle}
        onChange={(e) => setNewTopicTitle(e.target.value)}
        placeholder="Konu başlığı (örn: Kur'an'da Aile Ahlakı)"
        className="w-full min-h-[38px] px-3 rounded-xl border text-xs sm:text-sm font-bold outline-none focus:border-[var(--brand-primary)]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-primary)',
        }}
      />
      <input
        type="text"
        value={newTopicDesc}
        onChange={(e) => setNewTopicDesc(e.target.value)}
        placeholder="Kısa açıklama / hedef (isteğe bağlı)"
        className="w-full min-h-[36px] px-3 rounded-xl border text-xs outline-none focus:border-[var(--brand-primary)]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setIsNewTopicFormOpen(false)}
          className="px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={!newTopicTitle.trim()}
          className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold text-white cursor-pointer disabled:opacity-45"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Oluştur
        </button>
      </div>
    </form>
  );

  const isTopicsPanelActive =
    topics.length > 0 && (isDesktopViewport ? isDesktopSidebarOpen : isMobileTopicsDrawerOpen);

  const renderTopicSearchBox = (inputId: string) => (
    <div className="relative">
      <Search
        className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--text-muted)' }}
      />
      <input
        id={inputId}
        type="text"
        value={topicSearchQuery}
        onChange={(e) => setTopicSearchQuery(e.target.value)}
        placeholder="Başlıklarda ara..."
        aria-label="Araştırma başlıklarında ara"
        className="w-full min-h-[34px] pl-8 pr-7 rounded-xl border text-xs font-semibold outline-none focus:border-[var(--brand-primary)]"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      />
      {topicSearchQuery && (
        <button
          type="button"
          onClick={() => setTopicSearchQuery('')}
          aria-label="Aramayı temizle"
          className="w-6 h-6 rounded-md flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const renderTopicListItems = (closeDrawerOnSelect: boolean) => {
    if (filteredTopics.length === 0) {
      return (
        <div className="px-4 py-6 text-center space-y-1.5">
          <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
            Eşleşen başlık bulunamadı
          </p>
          <button
            type="button"
            onClick={() => setTopicSearchQuery('')}
            className="text-[11px] font-extrabold cursor-pointer underline"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            Aramayı temizle
          </button>
        </div>
      );
    }

    return filteredTopics.map((topic) => {
      const isSelected = activeTopic?.id === topic.id;
      const totalAyahs = countEntriesAyahs(topic.items);

      return (
        <button
          key={topic.id}
          type="button"
          onClick={() => handleSelectTopic(topic.id, closeDrawerOnSelect)}
          className="w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)]"
          style={{
            backgroundColor: isSelected ? 'var(--brand-primary-soft)' : 'transparent',
          }}
        >
          <div className="min-w-0">
            <p
              className="text-xs sm:text-[13px] font-extrabold truncate"
              style={{
                color: isSelected ? 'var(--brand-primary-text)' : 'var(--text-primary)',
              }}
            >
              {topic.title}
            </p>
            <p
              className="text-[11px] tabular-nums mt-0.5 truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {topic.items.length} pasaj · {totalAyahs} ayet
            </p>
          </div>
          <ChevronRight
            className="w-4 h-4 shrink-0 opacity-60"
            style={{
              color: isSelected ? 'var(--brand-primary-text)' : 'var(--text-muted)',
            }}
          />
        </button>
      );
    });
  };

  return (
    <div className="space-y-3">
      {/* Üst Dengeli Araç Çubuğu: Sol (Araştırma Konularım | Ayet Notlarım) + Sağ (Başlıklar | Yedekle | + Yeni Başlık) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Defterim görünüm seçici"
          className="grid grid-cols-2 p-1 rounded-2xl border gap-1 w-full sm:w-auto sm:min-w-[330px]"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={notebookSubView === 'topics'}
            onClick={() => {
              sfxService.play('click');
              setNotebookSubView('topics');
            }}
            className="min-h-[38px] px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-w-0"
            style={{
              backgroundColor: notebookSubView === 'topics' ? 'var(--bg-surface)' : 'transparent',
              color:
                notebookSubView === 'topics' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              boxShadow: notebookSubView === 'topics' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <NotebookPen className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Araştırma Konularım</span>
            <span
              className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none shrink-0"
              style={{
                backgroundColor:
                  notebookSubView === 'topics' ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                color:
                  notebookSubView === 'topics' ? 'var(--brand-primary-text)' : 'var(--text-muted)',
              }}
            >
              {topics.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={notebookSubView === 'notes'}
            onClick={() => {
              sfxService.play('click');
              setNotebookSubView('notes');
            }}
            className="min-h-[38px] px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-w-0"
            style={{
              backgroundColor: notebookSubView === 'notes' ? 'var(--bg-surface)' : 'transparent',
              color:
                notebookSubView === 'notes' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
              boxShadow: notebookSubView === 'notes' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <StickyNote className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Ayet Notlarım</span>
            <span
              className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none shrink-0"
              style={{
                backgroundColor:
                  notebookSubView === 'notes' ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                color:
                  notebookSubView === 'notes' ? 'var(--brand-primary-text)' : 'var(--text-muted)',
              }}
            >
              {verseNotes.length}
            </span>
          </button>
        </div>

        {notebookSubView === 'topics' && (
          <div className="flex flex-wrap items-center justify-end gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              disabled={topics.length === 0}
              aria-expanded={isTopicsPanelActive}
              onClick={handleToggleTopicsPanel}
              title={isTopicsPanelActive ? 'Başlıklar panelini gizle' : 'Başlıklar panelini aç'}
              className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45 whitespace-nowrap"
              style={{
                backgroundColor: isTopicsPanelActive
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface)',
                borderColor: isTopicsPanelActive
                  ? 'var(--brand-primary)'
                  : 'var(--border-subtle)',
                color: isTopicsPanelActive
                  ? 'var(--brand-primary-text)'
                  : 'var(--text-primary)',
              }}
            >
              <PanelLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Başlıklar</span>
              <span
                className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none"
                style={{
                  backgroundColor: isTopicsPanelActive
                    ? 'var(--bg-surface)'
                    : 'var(--bg-surface-soft)',
                  color: isTopicsPanelActive
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-muted)',
                }}
              >
                {topics.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setBackupFeedback(null);
                setIsBackupModalOpen(true);
              }}
              title="JSON Yedekle / İçe Aktar"
              className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <ArrowUpDown
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <span>Yedekle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsNewTopicFormOpen((v) => !v);
              }}
              className="min-h-[38px] px-3 sm:px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95 whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Yeni Başlık</span>
            </button>
          </div>
        )}
      </div>

      {notebookSubView === 'notes' ? (
        <PersonalVerseNotesPanel />
      ) : (
        <>
          {topics.length === 0 ? (
            <section className="surface-card rounded-2xl p-6 sm:p-10 text-center space-y-4">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <NotebookPen className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-lg mx-auto">
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                  Kişisel Araştırma Defteriniz Henüz Boş
                </h3>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Kendi araştırma başlığınızı oluşturarak ayet ve pasajları toplayabilir, notlar
                  alabilir veya Konu Fihristi&apos;ndeki hazır başlıkları tek tıkla defterinize
                  aktarabilirsiniz.
                </p>
              </div>

              {isNewTopicFormOpen ? (
                <div className="max-w-lg mx-auto text-left pt-1">{renderNewTopicForm()}</div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsNewTopicFormOpen(true);
                    }}
                    className="min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>İlk Araştırma Başlığımı Oluştur</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setBackupFeedback(null);
                      setIsBackupModalOpen(true);
                    }}
                    className="min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <ArrowUpDown
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <span>Yedekten Yükle / Yedekle</span>
                  </button>
                </div>
              )}
            </section>
          ) : (
            <>
              {/* Panel kapalıyken veya mobilde çekmece kapalıyken + Yeni Başlık tıklandıysa doğrudan görünür form */}
              {isNewTopicFormOpen &&
                !isMobileTopicsDrawerOpen &&
                (!isDesktopViewport || !isDesktopSidebarOpen) && (
                  <div className="max-w-xl">{renderNewTopicForm()}</div>
                )}

              {/* ====================================================================
                  ANA ÇALIŞMA DÜZENİ: AKILLI SOL BAŞLIK PANELİ (lg+) + SAĞ ÇALIŞMA ALANI
                  ==================================================================== */}
              <div className="flex flex-col lg:flex-row gap-3.5 items-start">
                {/* MASAÜSTÜ (lg+) AÇILIR-KAPANIR KOMPAKT SOL BAŞLIK PANELİ */}
                {isDesktopSidebarOpen && (
                  <aside className="hidden lg:flex w-[270px] xl:w-[290px] shrink-0 surface-card rounded-2xl overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] flex-col">
                    <div
                      className="px-3.5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-xs font-extrabold truncate">Araştırma Başlıklarım</h3>
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none shrink-0"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {topics.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseDesktopSidebar}
                        title="Başlık panelini gizle"
                        aria-label="Başlık panelini gizle"
                        className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:bg-[var(--bg-surface)]"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <PanelLeftClose className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isNewTopicFormOpen && (
                      <div
                        className="p-2.5 border-b shrink-0"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {renderNewTopicForm()}
                      </div>
                    )}

                    {topics.length >= 5 && (
                      <div
                        className="px-2.5 py-2 border-b shrink-0"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {renderTopicSearchBox('desktop-notebook-topic-search')}
                      </div>
                    )}

                    <div
                      className="divide-y overflow-y-auto scrollbar-thin flex-1 min-h-0"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {renderTopicListItems(false)}
                    </div>
                  </aside>
                )}

                {/* SAĞ ÇALIŞMA ALANI (Sol panel kapalıyken tam genişliğe yayılır) */}
                <section className="flex-1 min-w-0 w-full space-y-3">
                  {activeTopic && (
                    <>
              {/* Konu Üst Kartı — Kompakt Dikey Ritim */}
              <div className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-2.5">
                {isEditingMeta ? (
                  <form onSubmit={handleSaveEditMeta} className="space-y-2.5">
                    <input
                      type="text"
                      value={editTitleDraft}
                      onChange={(e) => setEditTitleDraft(e.target.value)}
                      className="w-full min-h-[40px] px-3 rounded-xl border text-sm font-extrabold outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="text"
                      value={editDescDraft}
                      onChange={(e) => setEditDescDraft(e.target.value)}
                      placeholder="Açıklama (isteğe bağlı)"
                      className="w-full min-h-[38px] px-3 rounded-xl border text-xs outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsEditingMeta(false)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        İptal
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold text-white inline-flex items-center gap-1 cursor-pointer"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Kaydet</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <h3 className="text-base sm:text-lg font-extrabold tracking-tight break-words">
                        {activeTopic.title}
                      </h3>
                      {activeTopic.description && (
                        <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                          {activeTopic.description}
                        </p>
                      )}
                      <p className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {activeTopic.items.length} Pasaj · {countEntriesAyahs(activeTopic.items)} Ayet
                      </p>
                    </div>

                    {/* Ana Aksiyonlar: + Ayet / Not Ekle + Dinle + Referansları Kopyala + A4 PDF + '⋯' Menü */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setIsAddPanelOpen((v) => !v);
                        }}
                        aria-expanded={isAddPanelOpen}
                        className="min-h-[36px] px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                        style={{
                          backgroundColor: isAddPanelOpen
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: isAddPanelOpen
                            ? 'var(--brand-primary)'
                            : 'var(--border-strong)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {isAddPanelOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>Ayet / Not Ekle</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleListenTopic}
                        disabled={!manifest || !meta || displayItems.length === 0}
                        className="min-h-[36px] px-3 sm:px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Headphones className="w-3.5 h-3.5 shrink-0" />
                        <span>Dinle</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopyReferences()}
                        disabled={displayItems.length === 0}
                        title="Referansları akademik biçimde panoya kopyala (örn. 2/253, 270; 3/13)"
                        className="hidden sm:inline-flex min-h-[36px] px-3 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <ClipboardCopy className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                        <span>Referansları Kopyala</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setIsPrintOpen(true);
                        }}
                        disabled={displayItems.length === 0}
                        className="hidden sm:inline-flex min-h-[36px] px-3 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Printer className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                        <span>A4 PDF</span>
                      </button>

                      {/* '⋯' Diğer İşlemler Açılır Menüsü */}
                      <div className="relative">
                        <button
                          ref={actionsMenuTriggerRef}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setIsActionsMenuOpen((v) => !v);
                            setConfirmDeleteId(null);
                          }}
                          aria-label="Diğer işlemler"
                          aria-expanded={isActionsMenuOpen}
                          className="w-9 h-[36px] rounded-xl border flex items-center justify-center cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        <ResponsiveActionMenu
                          isOpen={isActionsMenuOpen}
                          onClose={() => setIsActionsMenuOpen(false)}
                          title={`${activeTopic.title} · İşlemler`}
                          triggerRef={actionsMenuTriggerRef}
                        >
                            <button
                              type="button"
                              disabled={displayItems.length === 0}
                              onClick={() => void handleCopyReferences()}
                              className="w-full min-h-[36px] px-3 rounded-xl text-xs font-bold flex items-center gap-2 text-left cursor-pointer disabled:opacity-45 hover:bg-[var(--bg-surface-soft)] sm:hidden"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <ClipboardCopy className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                              <span>Referansları Kopyala</span>
                            </button>

                            <button
                              type="button"
                              disabled={displayItems.length === 0}
                              onClick={() => {
                                sfxService.play('click');
                                setIsActionsMenuOpen(false);
                                setIsPrintOpen(true);
                              }}
                              className="w-full min-h-[36px] px-3 rounded-xl text-xs font-bold flex items-center gap-2 text-left cursor-pointer disabled:opacity-45 hover:bg-[var(--bg-surface-soft)] sm:hidden"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <Printer className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                              <span>A4 PDF / Yazdır</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleStartEditMeta}
                              className="w-full min-h-[36px] px-3 rounded-xl text-xs font-bold flex items-center gap-2 text-left cursor-pointer hover:bg-[var(--bg-surface-soft)]"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <Edit3 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                              <span>Başlığı &amp; Açıklamayı Düzenle</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                sfxService.play('click');
                                setIsActionsMenuOpen(false);
                                setBackupFeedback(null);
                                setIsBackupModalOpen(true);
                              }}
                              className="w-full min-h-[36px] px-3 rounded-xl text-xs font-bold flex items-center gap-2 text-left cursor-pointer hover:bg-[var(--bg-surface-soft)]"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                              <span>JSON Yedekle / Yükle</span>
                            </button>

                            <div className="my-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />

                            {confirmDeleteId === activeTopic.id ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteTopic(activeTopic.id)}
                                className="w-full min-h-[36px] px-3 rounded-xl text-xs font-extrabold text-white bg-red-600 flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Silmeyi Onayla</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  sfxService.play('click');
                                  setConfirmDeleteId(activeTopic.id);
                                }}
                                className="w-full min-h-[36px] px-3 rounded-xl text-xs font-bold flex items-center gap-2 text-left cursor-pointer hover:bg-red-500/10"
                                style={{ color: '#DC2626' }}
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Başlığı Sil</span>
                              </button>
                            )}
                        </ResponsiveActionMenu>
                      </div>
                    </div>
                  </div>
                )}

                {/* Görünüm + Sıralama Şeridi */}
                <div
                  className="pt-2.5 border-t flex flex-wrap items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div
                    role="tablist"
                    aria-label="Araştırma görünüm modu"
                    className="grid grid-cols-4 sm:inline-flex p-1 rounded-xl gap-1 w-full sm:w-auto"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {VIEW_MODE_OPTIONS.map((opt) => {
                      const active = viewMode === opt.id;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            sfxService.play('click');
                            setViewMode(opt.id);
                          }}
                          className="min-h-[34px] px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                            color: active
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-secondary)',
                            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                          <span className="sm:hidden">{opt.shortLabel}</span>
                          <span className="hidden sm:inline">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sıralama Seçici (Kendi Sıram / Mushaf / Nüzul) + Meal Seçici */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div
                      className="inline-flex p-0.5 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {SORT_MODE_OPTIONS.map((opt) => {
                        const active = sortMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setSortMode(opt.id);
                            }}
                            className="min-h-[30px] px-2.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                            style={{
                              backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                              color: active
                                ? 'var(--brand-primary-text)'
                                : 'var(--text-muted)',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {(viewMode === 'meal' || viewMode === 'ar_meal') && (
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          openMealSelector('primary');
                        }}
                        className="min-h-[32px] px-2.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Meal{settings.mealDisplayMode === 'dual' ? ' (2)' : ''}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ==================================================================
                  KATLANABİLİR HIZLI AYET / PASAJ / NOT EKLEME ALANI
                  ================================================================== */}
              {isAddPanelOpen && (
                <div className="surface-card rounded-2xl p-3 sm:p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-extrabold inline-flex items-center gap-1.5"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Ayet, Pasaj veya Not Ekle</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setIsAddPanelOpen(false);
                      }}
                      aria-label="Ekleme panelini gizle"
                      title="Paneli Gizle"
                      className="w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <form onSubmit={handleAddFromPicker} className="space-y-2">
                    <div className="grid grid-cols-12 gap-1.5 sm:gap-2">
                      <select
                        aria-label="Sure seçin"
                        value={pickerSurah}
                        onChange={(e) => {
                          setPickerSurah(Number(e.target.value));
                          setPickerError(null);
                        }}
                        className="col-span-12 sm:col-span-5 min-h-[38px] px-2.5 rounded-xl border text-base sm:text-xs font-bold outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {surahsList.map((s) => (
                        <option key={s.no} value={s.no}>
                          {s.no}. {s.nameTr} ({s.ayahCount})
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Başlangıç ayeti"
                      placeholder={`Başlangıç (1-${pickerSurahMax})`}
                      value={pickerStartText}
                      onChange={(e) => {
                        setPickerStartText(e.target.value.replace(/[^\d]/g, ''));
                        if (pickerError) setPickerError(null);
                      }}
                      className="col-span-4 sm:col-span-2 min-h-[40px] px-2.5 rounded-xl border text-base sm:text-xs font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Bitiş ayeti (isteğe bağlı)"
                      placeholder="Bitiş (boş=tek)"
                      value={pickerEndText}
                      onChange={(e) => {
                        setPickerEndText(e.target.value.replace(/[^\d]/g, ''));
                        if (pickerError) setPickerError(null);
                      }}
                      className="col-span-4 sm:col-span-2 min-h-[40px] px-2.5 rounded-xl border text-base sm:text-xs font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />

                    <button
                      type="submit"
                      className="col-span-4 sm:col-span-3 min-h-[38px] px-2.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Ekle</span>
                    </button>
                  </div>

                  {pickerError && (
                    <p className="text-xs font-bold text-red-600 px-1">{pickerError}</p>
                  )}

                  {/* İsteğe Bağlı Çekmeceler (Not Ekle + Toplu Referans Yapıştır) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setShowNoteDrawer((v) => !v);
                        }}
                        className="min-h-[28px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: showNoteDrawer
                            ? 'var(--brand-accent-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: showNoteDrawer
                            ? 'rgba(217, 119, 6, 0.35)'
                            : 'var(--border-subtle)',
                          color: showNoteDrawer
                            ? 'var(--brand-accent-text)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        <StickyNote className="w-3 h-3" />
                        <span>{showNoteDrawer ? 'Notu Gizle' : '+ Not Ekle'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setShowBulkDrawer((v) => !v);
                        }}
                        className="min-h-[28px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: showBulkDrawer
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: showBulkDrawer
                            ? 'var(--brand-primary)'
                            : 'var(--border-subtle)',
                          color: showBulkDrawer
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        <ListPlus className="w-3 h-3" />
                        <span>Toplu Referans Yapıştır</span>
                      </button>
                    </div>

                    <span
                      className="text-[10.5px] hidden sm:inline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Tek ayet için Bitiş alanını boş bırakabilirsiniz
                    </span>
                  </div>

                  {showNoteDrawer && (
                    <input
                      type="text"
                      value={pickerNote}
                      onChange={(e) => setPickerNote(e.target.value)}
                      placeholder="İsteğe bağlı kişisel araştırma notu (eklenen pasaja kaydedilir)..."
                      className="w-full min-h-[38px] px-3 rounded-xl border text-base sm:text-xs outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  )}
                </form>

                {/* İsteğe Bağlı Toplu Referans Yapıştır Çekmecesi */}
                {showBulkDrawer && (
                  <form
                    onSubmit={handleAddFromBulk}
                    className="pt-2.5 border-t space-y-2"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <textarea
                      rows={2}
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder="Örnek: 2/153-157, 253; 3/13, 123; 31/12-19; 49:11-12"
                      className="w-full p-2.5 rounded-xl border text-base sm:text-sm font-medium outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold">
                        {parsedBulk.valid.length > 0 ? (
                          <span style={{ color: 'var(--brand-primary-text)' }}>
                            {parsedBulk.valid.length} geçerli referans algılandı
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>
                            Sure/Ayet biçiminde (;) veya (,) ile ayırarak yapıştırın.
                          </span>
                        )}
                        {parsedBulk.invalidTokens.length > 0 && (
                          <span className="ml-2 text-red-600">
                            · Geçersiz: {parsedBulk.invalidTokens.slice(0, 3).join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={parsedBulk.valid.length === 0}
                        className="min-h-[34px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-45"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Hepsini Ekle ({parsedBulk.valid.length})</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
              )}

              {addToast && (
                <div className="flex items-center">
                  <p
                    className="text-xs font-bold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.14)',
                      color: '#047857',
                    }}
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="break-all">{addToast}</span>
                  </p>
                </div>
              )}

              {/* Ayet Koleksiyonu (Satır içi Düzenle + Not + Sırala + Sil) */}
              <VerseCollectionRenderer
                items={displayItems}
                viewMode={viewMode}
                collectionTitle={activeTopic.title}
                editable
                canReorder={sortMode === 'custom'}
                onUpdateNote={(entryId, note) =>
                  researchStorage.updateNote(activeTopic.id, entryId, note)
                }
                onUpdateEntry={(entryId, patch) =>
                  researchStorage.updateVerse(activeTopic.id, entryId, patch)
                }
                onRemoveEntry={(entryId) =>
                  researchStorage.removeVerse(activeTopic.id, entryId)
                }
                onMoveEntry={(entryId, dir) =>
                  researchStorage.moveVerse(activeTopic.id, entryId, dir)
                }
              />

              {/* A4 PDF Modalı (Notlar Dahil / Hariç Seçenekli) */}
              <PrintableFihristModal
                isOpen={isPrintOpen}
                onClose={() => setIsPrintOpen(false)}
                title={activeTopic.title}
                subtitle={activeTopic.description}
                items={displayItems}
                allowNotesToggle
                defaultPrintMode={defaultPrintMode}
              />
            </>
                  )}
                </section>
              </div>
            </>
          )}

      {/* ====================================================================
          MOBİL & TABLET (< lg) ÜSTTEN AÇILAN ARAŞTIRMA BAŞLIKLARI ÇEKMECESİ
          ==================================================================== */}
      {isMobileTopicsDrawerOpen && (
        <div
          className="fixed inset-0 z-[80] lg:hidden flex items-start justify-center p-2 pt-[calc(0.5rem+env(safe-area-inset-top))] bg-black/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Araştırma Başlıklarım"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMobileTopicsDrawerOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg max-h-[92dvh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div
              className="sticky top-0 z-10 px-3.5 py-3 border-b flex items-center justify-between gap-2 shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <PanelLeft
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--brand-primary-text)' }}
                />
                <h3 className="text-sm font-extrabold truncate">
                  Araştırma Başlıklarım ({topics.length})
                </h3>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setIsNewTopicFormOpen((v) => !v);
                  }}
                  className="min-h-[34px] px-2.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Yeni Başlık</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileTopicsDrawerOpen(false)}
                  aria-label="Başlıklar çekmecesini kapat"
                  title="Kapat"
                  className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3 border-b space-y-2.5 shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
              {renderTopicSearchBox('mobile-notebook-topic-search')}
              {isNewTopicFormOpen && renderNewTopicForm()}
            </div>

            <div
              className="divide-y overflow-y-auto scrollbar-thin flex-1 min-h-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {renderTopicListItems(true)}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          JSON YEDEKLEME & GERİ YÜKLEME MODALI
          ==================================================================== */}
      {isBackupModalOpen && (
        <div
          className="fixed inset-0 z-[82] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Araştırma Defteri JSON Yedekleme"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBackupModalOpen(false);
          }}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div
              className="px-4 py-3.5 border-b flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <h3 className="text-sm sm:text-base font-extrabold">
                Araştırma Defteri JSON Yedekleme
              </h3>
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(false)}
                aria-label="Yedekleme penceresini kapat"
                title="Kapat"
                className="w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Dışa Aktar */}
              <div
                className="p-3.5 rounded-2xl border space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <p className="text-xs font-extrabold">1. Yedeği İndir (.json)</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Tüm araştırma konularınız, ayet aralıklarınız ve kişisel notlarınız tek bir
                  JSON dosyasına aktarılır ({topics.length} konu).
                </p>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={topics.length === 0}
                  className="w-full min-h-[40px] px-4 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Download className="w-4 h-4" />
                  <span>JSON Olarak İndir</span>
                </button>
              </div>

              {/* İçe Aktar */}
              <div
                className="p-3.5 rounded-2xl border space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <p className="text-xs font-extrabold">2. Yedekten Geri Yükle (.json)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor:
                        importMode === 'merge'
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface)',
                      borderColor:
                        importMode === 'merge' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color:
                        importMode === 'merge'
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    Mevcutla Birleştir
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor:
                        importMode === 'replace'
                          ? 'rgba(239, 68, 68, 0.12)'
                          : 'var(--bg-surface)',
                      borderColor:
                        importMode === 'replace'
                          ? 'rgba(239, 68, 68, 0.45)'
                          : 'var(--border-subtle)',
                      color: importMode === 'replace' ? '#DC2626' : 'var(--text-secondary)',
                    }}
                  >
                    Üzerine Yaz
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void handleImportFile(e)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[40px] px-4 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Upload className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>JSON Dosyası Seç &amp; Yükle</span>
                </button>
              </div>

              {backupFeedback && (
                <div
                  className="p-3 rounded-xl text-xs font-bold"
                  style={{
                    backgroundColor:
                      backupFeedback.type === 'success'
                        ? 'rgba(16, 185, 129, 0.14)'
                        : 'rgba(239, 68, 68, 0.12)',
                    color: backupFeedback.type === 'success' ? '#047857' : '#DC2626',
                  }}
                >
                  {backupFeedback.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
