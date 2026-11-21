import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Edit3,
  FolderPlus,
  Headphones,
  ListPlus,
  ListTree,
  NotebookPen,
  Plus,
  Printer,
  Scale,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { audioQueueService } from '../../services/audioQueueService';
import {
  buildAudioSegmentsFromItems,
  countEntriesAyahs,
  parseBulkVerseReferences,
} from '../../services/fihristService';
import { researchStorage } from '../../services/researchStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  FihristPrintMode,
  FihristViewMode,
  ResearchSortMode,
  ResearchTopic,
  ResearchVerseEntry,
} from '../../types/fihrist';
import { getSurahMap } from '../../utils/poolUtils';
import { PrintableFihristModal } from './PrintableFihristModal';
import {
  VerseCollectionRenderer,
  type CollectionDisplayItem,
} from './VerseCollectionRenderer';

interface ResearchNotebookTabProps {
  selectedTopicIdOverride?: string | null;
  onClearTopicOverride?: () => void;
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
  { id: 'mushaf', label: 'Mushaf Sırası' },
  { id: 'nuzul', label: 'Nüzul Sırası' },
];

export const ResearchNotebookTab: React.FC<ResearchNotebookTabProps> = ({
  selectedTopicIdOverride,
  onClearTopicOverride,
}) => {
  const { meta, manifest, audioPrefs, settings, openMealSelector } = useAppStore();
  const topics = useSyncExternalStore(
    researchStorage.subscribe,
    researchStorage.getSnapshot,
  );

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const surahsList = useMemo(() => meta?.surahs ?? [], [meta]);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    () => topics[0]?.id ?? null,
  );
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [viewMode, setViewMode] = useState<FihristViewMode>('ar_meal');
  const [sortMode, setSortMode] = useState<ResearchSortMode>('custom');

  // Yeni konu oluşturma
  const [isNewTopicFormOpen, setIsNewTopicFormOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');

  // Konu başlığı düzenleme & silme onayı
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editTitleDraft, setEditTitleDraft] = useState('');
  const [editDescDraft, setEditDescDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Hızlı Ayet & Pasaj Ekleme (Seçici vs Toplu Referans Yapıştırıcı)
  const [addMode, setAddMode] = useState<'picker' | 'bulk'>('picker');
  const [pickerSurah, setPickerSurah] = useState<number>(2);
  const [pickerStart, setPickerStart] = useState<number>(153);
  const [pickerEnd, setPickerEnd] = useState<number>(157);
  const [pickerNote, setPickerNote] = useState('');
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

  // Dışarıdan kopyalanan yeni bir konuya doğrudan geçiş
  useEffect(() => {
    if (!selectedTopicIdOverride) return;
    setSelectedTopicId(selectedTopicIdOverride);
    setMobileShowDetail(true);
    onClearTopicOverride?.();
  }, [selectedTopicIdOverride, onClearTopicOverride]);

  // Seçili konu silindiyse ilk konuya dön
  const activeTopic = useMemo<ResearchTopic | null>(() => {
    if (selectedTopicId) {
      const found = topics.find((t) => t.id === selectedTopicId);
      if (found) return found;
    }
    return topics[0] ?? null;
  }, [selectedTopicId, topics]);

  useEffect(() => {
    if (!addToast) return;
    const t = window.setTimeout(() => setAddToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [addToast]);

  const pickerSurahMax = surahMap.get(pickerSurah)?.ayahCount ?? 286;

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
    setMobileShowDetail(true);
    setNewTopicTitle('');
    setNewTopicDesc('');
    setIsNewTopicFormOpen(false);
  };

  const handleStartEditMeta = () => {
    if (!activeTopic) return;
    sfxService.play('click');
    setEditTitleDraft(activeTopic.title);
    setEditDescDraft(activeTopic.description ?? '');
    setIsEditingMeta(true);
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
    if (selectedTopicId === topicId) {
      setSelectedTopicId(null);
      setMobileShowDetail(false);
    }
  };

  const handleAddFromPicker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTopic) return;
    sfxService.play('click');
    const safeStart = Math.max(1, Math.min(pickerSurahMax, pickerStart));
    const safeEnd = Math.max(safeStart, Math.min(pickerSurahMax, pickerEnd));
    const res = researchStorage.addVerses(activeTopic.id, [
      {
        surah: pickerSurah,
        startAyah: safeStart,
        endAyah: safeEnd,
        note: pickerNote.trim() || undefined,
      },
    ]);
    if (res.addedCount > 0) {
      setPickerNote('');
      setAddToast('Ayet aralığı araştırma listenize eklendi.');
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
    setAddToast(
      res.skippedDuplicates > 0
        ? `${res.addedCount} pasaj eklendi (${res.skippedDuplicates} mükerrer atlandı).`
        : `${res.addedCount} pasaj tek seferde eklendi.`,
    );
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

  return (
    <div className="space-y-3.5">
      {/* ====================================================================
          ANA 2 SÜTUN: SOL KONU DEFTERLERİM + SAĞ ÇALIŞMA MASASI
          ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* SOL SÜTUN: KİŞİSEL KONULARIM */}
        <aside
          className={`${mobileShowDetail ? 'hidden lg:block' : 'block'} lg:col-span-4 surface-card rounded-2xl overflow-hidden`}
        >
          <div
            className="px-3.5 py-3 border-b flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-extrabold truncate">
                Araştırma Başlıklarım ({topics.length})
              </h3>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setBackupFeedback(null);
                  setIsBackupModalOpen(true);
                }}
                title="JSON Yedekle / İçe Aktar"
                className="min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Yedekle</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsNewTopicFormOpen((v) => !v);
                }}
                className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-extrabold text-white inline-flex items-center gap-1 cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Yeni</span>
              </button>
            </div>
          </div>

          {/* Yeni Konu Oluşturma Formu */}
          {isNewTopicFormOpen && (
            <form
              onSubmit={handleCreateTopic}
              className="p-3.5 border-b space-y-2.5"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
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
          )}

          {topics.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <NotebookPen
                className="w-9 h-9 mx-auto opacity-55"
                style={{ color: 'var(--brand-primary-text)' }}
              />
              <div className="space-y-1">
                <p className="text-sm font-extrabold">Araştırma Defteriniz Henüz Boş</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Kendi konu başlığınızı oluşturabilir, okurken ayetleri tek dokunuşla deftere
                  ekleyebilir veya hazır fihristten konu kopyalayabilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsNewTopicFormOpen(true);
                }}
                className="min-h-[40px] px-4 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <FolderPlus className="w-4 h-4" />
                <span>İlk Araştırma Konumu Oluştur</span>
              </button>
            </div>
          ) : (
            <div
              className="divide-y max-h-[65dvh] overflow-y-auto scrollbar-thin"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {topics.map((topic) => {
                const isSelected = activeTopic?.id === topic.id;
                const totalAyahs = countEntriesAyahs(topic.items);

                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setSelectedTopicId(topic.id);
                      setMobileShowDetail(true);
                      setIsEditingMeta(false);
                      setConfirmDeleteId(null);
                    }}
                    className="w-full px-3.5 py-3 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)]"
                    style={{
                      backgroundColor: isSelected ? 'var(--brand-primary-soft)' : 'transparent',
                    }}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-xs sm:text-sm font-extrabold truncate"
                        style={{
                          color: isSelected
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-primary)',
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
              })}
            </div>
          )}
        </aside>

        {/* SAĞ SÜTUN: SEÇİLİ ARAŞTIRMA KONUSU */}
        <section
          className={`${mobileShowDetail ? 'block' : 'hidden lg:block'} lg:col-span-8 space-y-3.5 min-w-0`}
        >
          {/* Mobil Geri Dön */}
          <div className="lg:hidden flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setMobileShowDetail(false);
              }}
              className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Konularıma Dön</span>
            </button>
          </div>

          {activeTopic ? (
            <>
              {/* Konu Üst Kartı */}
              <div className="surface-card rounded-2xl p-4 sm:p-5 space-y-3.5">
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
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg sm:text-xl font-extrabold tracking-tight break-words">
                          {activeTopic.title}
                        </h3>
                        <button
                          type="button"
                          onClick={handleStartEditMeta}
                          title="Başlık ve açıklamayı düzenle"
                          aria-label="Başlık ve açıklamayı düzenle"
                          className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {activeTopic.description && (
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {activeTopic.description}
                        </p>
                      )}
                      <p className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {activeTopic.items.length} Pasaj · {countEntriesAyahs(activeTopic.items)} Ayet
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleListenTopic}
                        disabled={!manifest || !meta || displayItems.length === 0}
                        className="min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Headphones className="w-3.5 h-3.5 shrink-0" />
                        <span>Listeyi Dinle</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setIsPrintOpen(true);
                        }}
                        disabled={displayItems.length === 0}
                        className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Printer className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                        <span>A4 PDF</span>
                      </button>

                      {confirmDeleteId === activeTopic.id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteTopic(activeTopic.id)}
                          className="min-h-[38px] px-3 rounded-xl text-xs font-extrabold text-white bg-red-600 cursor-pointer whitespace-nowrap"
                        >
                          Silmeyi Onayla
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setConfirmDeleteId(activeTopic.id);
                          }}
                          title="Konuyu sil"
                          aria-label="Konuyu sil"
                          className="w-9 h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: '#DC2626',
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Görünüm + Sıralama Şeridi */}
                <div
                  className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
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

                  {/* Sıralama Seçici (Kendi Sıram / Mushaf / Nüzul) */}
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

              {/* Hızlı Ayet & Pasaj Ekleme Kutusu (Seçici + Toplu Referans Yapıştırıcı) */}
              <div className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold inline-flex items-center gap-1.5">
                    <ListPlus className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Hızlı Ayet &amp; Pasaj Ekle</span>
                  </span>

                  <div
                    className="inline-flex p-0.5 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setAddMode('picker');
                      }}
                      className="min-h-[28px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer"
                      style={{
                        backgroundColor:
                          addMode === 'picker' ? 'var(--bg-surface)' : 'transparent',
                        color:
                          addMode === 'picker'
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-muted)',
                      }}
                    >
                      Sure &amp; Ayet Seçici
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setAddMode('bulk');
                      }}
                      className="min-h-[28px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer"
                      style={{
                        backgroundColor:
                          addMode === 'bulk' ? 'var(--bg-surface)' : 'transparent',
                        color:
                          addMode === 'bulk'
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-muted)',
                      }}
                    >
                      Toplu Referans Yapıştır
                    </button>
                  </div>
                </div>

                {addMode === 'picker' ? (
                  <form onSubmit={handleAddFromPicker} className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <select
                        aria-label="Sure seçin"
                        value={pickerSurah}
                        onChange={(e) => {
                          const sNo = Number(e.target.value);
                          const maxA = surahMap.get(sNo)?.ayahCount ?? 286;
                          setPickerSurah(sNo);
                          setPickerStart(1);
                          setPickerEnd(Math.min(5, maxA));
                        }}
                        className="sm:col-span-5 min-h-[38px] px-3 rounded-xl border text-xs font-bold outline-none focus:border-[var(--brand-primary)]"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {surahsList.map((s) => (
                          <option key={s.no} value={s.no}>
                            {s.no}. {s.nameTr} ({s.ayahCount} ayet)
                          </option>
                        ))}
                      </select>

                      <div className="sm:col-span-4 grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          aria-label="Başlangıç ayeti"
                          min={1}
                          max={pickerSurahMax}
                          value={pickerStart}
                          onChange={(e) => {
                            const v = Math.max(
                              1,
                              Math.min(pickerSurahMax, Number(e.target.value) || 1),
                            );
                            setPickerStart(v);
                            if (v > pickerEnd) setPickerEnd(v);
                          }}
                          className="w-full min-h-[38px] px-2.5 rounded-xl border text-xs font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <input
                          type="number"
                          aria-label="Bitiş ayeti"
                          min={pickerStart}
                          max={pickerSurahMax}
                          value={pickerEnd}
                          onChange={(e) => {
                            const v = Math.max(
                              pickerStart,
                              Math.min(pickerSurahMax, Number(e.target.value) || pickerStart),
                            );
                            setPickerEnd(v);
                          }}
                          className="w-full min-h-[38px] px-2.5 rounded-xl border text-xs font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        className="sm:col-span-3 min-h-[38px] px-3 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1 cursor-pointer"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Listeye Ekle</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      value={pickerNote}
                      onChange={(e) => setPickerNote(e.target.value)}
                      placeholder="İsteğe bağlı araştırma notu (eklenen pasajın altına kaydedilir)..."
                      className="w-full min-h-[36px] px-3 rounded-xl border text-xs outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </form>
                ) : (
                  <form onSubmit={handleAddFromBulk} className="space-y-2.5">
                    <textarea
                      rows={2}
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder="Örnek: 2/153-157; 3/189-194; 31/12-19; 49:11-12"
                      className="w-full p-3 rounded-xl border text-xs sm:text-sm font-medium outline-none focus:border-[var(--brand-primary)]"
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
                        className="min-h-[36px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-45"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Hepsini Ekle ({parsedBulk.valid.length})</span>
                      </button>
                    </div>
                  </form>
                )}

                {addToast && (
                  <p
                    className="text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.14)',
                      color: '#047857',
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{addToast}</span>
                  </p>
                )}
              </div>

              {/* Ayet Koleksiyonu */}
              <VerseCollectionRenderer
                items={displayItems}
                viewMode={viewMode}
                collectionTitle={activeTopic.title}
                editable
                canReorder={sortMode === 'custom'}
                onUpdateNote={(entryId, note) =>
                  researchStorage.updateNote(activeTopic.id, entryId, note)
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
          ) : (
            <div className="surface-card rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-bold">Çalışmak için bir araştırma başlığı seçin veya oluşturun.</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Okuma ekranındaki ayetlerin işlem menüsünden de tek dokunuşla buraya ayet ekleyebilirsiniz.
              </p>
            </div>
          )}
        </section>
      </div>

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
                aria-label="Kapat"
                className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
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
    </div>
  );
};
