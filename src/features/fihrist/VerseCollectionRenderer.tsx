import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Headphones,
  Loader2,
  NotebookPen,
  Pencil,
  Pin,
  Scale,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { findMealById } from '../../config/mealsConfig';
import { audioQueueService } from '../../services/audioQueueService';
import { dataService, findPageForSurahAyah, toArabicIndicDigits } from '../../services/dataService';
import {
  formatRefRangeLabel,
  hydrateFihristItems,
  type HydratedFihristVerse,
  type HydrateSourceItem,
} from '../../services/fihristService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { FihristViewMode } from '../../types/fihrist';
import type { SurahMeta } from '../../types/quran';
import { getSurahMap } from '../../utils/poolUtils';

export interface CollectionDisplayItem extends HydrateSourceItem {
  key: string;
}

interface VerseCollectionRendererProps {
  items: CollectionDisplayItem[];
  viewMode: FihristViewMode;
  collectionTitle: string;
  /** Araştırma Defteri modu (not ekleme, kayıt düzenleme, sıralama, silme aktif) */
  editable?: boolean;
  /** Yalnızca 'custom' sıralamada yukarı/aşağı taşıma butonları gösterilir */
  canReorder?: boolean;
  onUpdateNote?: (entryId: string, note: string) => void;
  onUpdateEntry?: (
    entryId: string,
    patch: { surah: number; startAyah: number; endAyah: number; note?: string },
  ) => void;
  onRemoveEntry?: (entryId: string) => void;
  onMoveEntry?: (entryId: string, direction: 'up' | 'down') => void;
}

interface SurahIndexGroup {
  surahNo: number;
  surahName: string;
  items: CollectionDisplayItem[];
}

export const VerseCollectionRenderer: React.FC<VerseCollectionRendererProps> = ({
  items,
  viewMode,
  collectionTitle,
  editable = false,
  canReorder = false,
  onUpdateNote,
  onUpdateEntry,
  onRemoveEntry,
  onMoveEntry,
}) => {
  const {
    meta,
    manifest,
    settings,
    audioPrefs,
    navigateToStudy,
    openMealCompare,
    openQuickResearch,
  } = useAppStore();

  const extraVersion = useSyncExternalStore(
    dataService.subscribeExtraMeals,
    dataService.getExtraMealsVersion,
  );
  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const primaryMeal = useMemo(
    () => findMealById(settings.primaryMealId, manifest),
    [settings.primaryMealId, manifest],
  );
  const secondaryMeal = useMemo(
    () => findMealById(settings.secondaryMealId, manifest),
    [settings.secondaryMealId, manifest],
  );
  const isDual =
    settings.mealDisplayMode === 'dual' && secondaryMeal.id !== primaryMeal.id;

  // Fihrist (Liste) görünümünde önizlenen seçili çip
  const [selectedChipKey, setSelectedChipKey] = useState<string | null>(null);
  const [chipPreviewVerses, setChipPreviewVerses] = useState<HydratedFihristVerse[]>([]);
  const [isLoadingChip, setIsLoadingChip] = useState(false);

  // Tam metin görünümlerinde (AR / Meal / AR+Meal) tembel yüklenen ayetler
  const [hydratedVerses, setHydratedVerses] = useState<HydratedFihristVerse[]>([]);
  const [isHydratingAll, setIsHydratingAll] = useState(false);

  // Dipnot, not ve kayıt (sure / ayet aralığı / not) satır içi düzenleme durumları
  const [openFootnotes, setOpenFootnotes] = useState<Record<string, boolean>>({});
  const [editingNoteEntryId, setEditingNoteEntryId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editSurah, setEditSurah] = useState<number>(1);
  const [editStartText, setEditStartText] = useState<string>('');
  const [editEndText, setEditEndText] = useState<string>('');
  const [editNoteDraft, setEditNoteDraft] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);

  const surahsList = useMemo(() => meta?.surahs ?? [], [meta]);
  const itemByEntryId = useMemo(() => {
    const map = new Map<string, CollectionDisplayItem>();
    for (const it of items) {
      if (it.entryId) map.set(it.entryId, it);
    }
    return map;
  }, [items]);

  // Öğeler değiştiğinde geçersiz çip seçimini sıfırla
  useEffect(() => {
    if (selectedChipKey && !items.some((i) => i.key === selectedChipKey)) {
      setSelectedChipKey(null);
      setChipPreviewVerses([]);
    }
  }, [items, selectedChipKey]);

  // Fihrist (Liste) görünümünde tek bir çipe tıklandığında sadece o aralığı tembel yükle
  const selectedChipItem = useMemo(
    () => items.find((i) => i.key === selectedChipKey) ?? null,
    [items, selectedChipKey],
  );

  useEffect(() => {
    if (viewMode !== 'index' || !selectedChipItem) {
      setChipPreviewVerses([]);
      setIsLoadingChip(false);
      return;
    }

    let cancelled = false;
    setIsLoadingChip(true);

    hydrateFihristItems({
      items: [selectedChipItem],
      primaryMealId: primaryMeal.id,
      secondaryMealId: secondaryMeal.id,
      isDual,
      meta,
    })
      .then((res) => {
        if (!cancelled) {
          setChipPreviewVerses(res);
          setIsLoadingChip(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChipPreviewVerses([]);
          setIsLoadingChip(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    viewMode,
    selectedChipItem,
    primaryMeal.id,
    secondaryMeal.id,
    isDual,
    meta,
    extraVersion,
  ]);

  // AR / Meal / AR+Meal görünümlerinde tüm konu ayetlerini tembel yükle
  useEffect(() => {
    if (viewMode === 'index') return;
    if (items.length === 0) {
      setHydratedVerses([]);
      setIsHydratingAll(false);
      return;
    }

    let cancelled = false;
    setIsHydratingAll(true);

    hydrateFihristItems({
      items,
      primaryMealId: primaryMeal.id,
      secondaryMealId: secondaryMeal.id,
      isDual,
      meta,
    })
      .then((res) => {
        if (!cancelled) {
          setHydratedVerses(res);
          setIsHydratingAll(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHydratedVerses([]);
          setIsHydratingAll(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, items, primaryMeal.id, secondaryMeal.id, isDual, meta, extraVersion]);

  // Fihrist (Liste) görünümü için sure adına göre gruplama
  const surahGroups = useMemo<SurahIndexGroup[]>(() => {
    const map = new Map<number, SurahIndexGroup>();
    const order: number[] = [];

    for (const item of items) {
      let grp = map.get(item.surah);
      if (!grp) {
        const sMeta: SurahMeta | undefined = surahMap.get(item.surah);
        grp = {
          surahNo: item.surah,
          surahName: sMeta?.nameTr ?? `${item.surah}. Sure`,
          items: [],
        };
        map.set(item.surah, grp);
        order.push(item.surah);
      }
      grp.items.push(item);
    }

    return order.map((sNo) => map.get(sNo)!);
  }, [items, surahMap]);

  const handleOpenInMushaf = (surah: number, ayah: number) => {
    sfxService.play('click');
    const page = meta ? findPageForSurahAyah(meta, surah, ayah) : undefined;
    navigateToStudy({ surah, ayah, page, viewMode: 'mushaf' });
  };

  const handlePlaySingleRange = (surah: number, startAyah: number, endAyah: number) => {
    if (!manifest || !meta) return;
    sfxService.play('click');
    const sName = surahMap.get(surah)?.nameTr ?? `${surah}. Sure`;
    const rangeTxt =
      startAyah === endAyah ? `${startAyah}. Ayet` : `${startAyah}–${endAyah}. Ayetler`;
    void audioQueueService.startSegmentQueue({
      items: [
        {
          id: `fihrist_single_${surah}_${startAyah}_${endAyah}`,
          type: 'ayah_range',
          label: `${sName} ${rangeTxt}`,
          surah,
          startAyah,
          endAyah,
        },
      ],
      title: `${collectionTitle} · ${sName} ${rangeTxt}`,
      context: 'custom',
      contextKey: `fihrist:${surah}:${startAyah}-${endAyah}`,
      manifest,
      meta,
      prefs: audioPrefs,
    });
  };

  const startEditingNote = (entryId: string, existingNote?: string) => {
    sfxService.play('click');
    setEditingEntryId(null);
    setEditingNoteEntryId(entryId);
    setNoteDraft(existingNote ?? '');
  };

  const saveEditingNote = (entryId: string) => {
    sfxService.play('click');
    onUpdateNote?.(entryId, noteDraft);
    setEditingNoteEntryId(null);
  };

  const startEditingEntry = (entry: CollectionDisplayItem) => {
    if (!entry.entryId) return;
    sfxService.play('click');
    setEditingNoteEntryId(null);
    setEditingEntryId(entry.entryId);
    setEditSurah(entry.surah);
    setEditStartText(String(entry.startAyah));
    setEditEndText(entry.endAyah === entry.startAyah ? '' : String(entry.endAyah));
    setEditNoteDraft(entry.note ?? '');
    setEditError(null);
  };

  const cancelEditingEntry = () => {
    setEditingEntryId(null);
    setEditError(null);
  };

  const saveEditingEntry = (e: React.FormEvent, entryId: string) => {
    e.preventDefault();
    const surahMeta = surahMap.get(editSurah);
    const maxAyah = surahMeta?.ayahCount ?? 286;
    const rawStart = editStartText.trim();
    const rawEnd = editEndText.trim();

    if (!/^\d+$/.test(rawStart)) {
      setEditError('Geçerli bir başlangıç ayet numarası girin.');
      return;
    }
    const startNum = Number(rawStart);
    if (startNum < 1 || startNum > maxAyah) {
      setEditError(
        `${surahMeta?.nameTr ?? `${editSurah}. Sure`} için ayet numarası 1 ile ${maxAyah} arasında olmalıdır.`,
      );
      return;
    }

    let endNum = startNum;
    if (rawEnd !== '') {
      if (!/^\d+$/.test(rawEnd)) {
        setEditError('Bitiş ayeti sayısal olmalı veya tek ayet için boş bırakılmalıdır.');
        return;
      }
      endNum = Number(rawEnd);
      if (endNum < startNum || endNum > maxAyah) {
        setEditError(
          `Bitiş ayeti ${startNum} ile ${maxAyah} arasında olmalıdır (tek ayet için boş bırakabilirsiniz).`,
        );
        return;
      }
    }

    sfxService.play('click');
    onUpdateEntry?.(entryId, {
      surah: editSurah,
      startAyah: startNum,
      endAyah: endNum,
      note: editNoteDraft,
    });
    setEditingEntryId(null);
    setEditError(null);
  };

  const renderInlineEntryEditForm = (entryId: string) => {
    const selectedMax = surahMap.get(editSurah)?.ayahCount ?? 286;
    return (
      <form
        onSubmit={(e) => saveEditingEntry(e, entryId)}
        className="p-3 rounded-xl border space-y-2.5"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--brand-primary)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-extrabold inline-flex items-center gap-1.5"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Kaydı Düzenle</span>
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            1–{selectedMax} ayet
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <select
            aria-label="Sure seçin"
            value={editSurah}
            onChange={(e) => {
              setEditSurah(Number(e.target.value));
              setEditError(null);
            }}
            className="sm:col-span-6 min-h-[38px] px-2.5 rounded-xl border text-xs font-bold outline-none focus:border-[var(--brand-primary)]"
            style={{
              backgroundColor: 'var(--bg-surface)',
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

          <div className="sm:col-span-6 grid grid-cols-2 gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Başlangıç ayeti"
              placeholder="Başlangıç"
              value={editStartText}
              onChange={(e) => {
                setEditStartText(e.target.value.replace(/[^\d]/g, ''));
                if (editError) setEditError(null);
              }}
              className="w-full min-h-[38px] px-2.5 rounded-xl border text-xs font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Bitiş ayeti (isteğe bağlı)"
              placeholder="Bitiş (tek ayet: boş)"
              value={editEndText}
              onChange={(e) => {
                setEditEndText(e.target.value.replace(/[^\d]/g, ''));
                if (editError) setEditError(null);
              }}
              className="w-full min-h-[38px] px-2.5 rounded-xl border text-xs font-bold tabular-nums outline-none focus:border-[var(--brand-primary)]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        <textarea
          rows={2}
          value={editNoteDraft}
          onChange={(e) => setEditNoteDraft(e.target.value)}
          placeholder="Kişisel araştırma notu (isteğe bağlı)..."
          className="w-full p-2.5 rounded-xl border text-xs outline-none focus:border-[var(--brand-primary)]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />

        {editError && (
          <p className="text-xs font-bold text-red-600">{editError}</p>
        )}

        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={cancelEditingEntry}
            className="min-h-[34px] px-3 rounded-lg border text-xs font-bold cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            İptal
          </button>
          <button
            type="submit"
            className="min-h-[34px] px-3.5 rounded-lg text-xs font-extrabold text-white inline-flex items-center gap-1 cursor-pointer"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Kaydet</span>
          </button>
        </div>
      </form>
    );
  };

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl border p-6 sm:p-8 text-center"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-bold">Bu konuda henüz ayet kaydı bulunmuyor.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Yukarıdaki hızlı ekleme alanından sure ve ayet aralığı ekleyerek başlayabilirsiniz.
        </p>
      </div>
    );
  }

  // ============================================================================
  // 1. FİHRİST (LİSTE) GÖRÜNÜMÜ — Kitap fihristi gibi sure bazlı tıklanabilir çipler
  // ============================================================================
  if (viewMode === 'index') {
    return (
      <div className="space-y-3">
        <div
          className="rounded-2xl border p-3.5 sm:p-4 space-y-3"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
              Ayet numarasının üzerine dokunarak anlık önizleme açabilir veya Mushaf&apos;a geçebilirsiniz.
            </p>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
              {surahGroups.length} Sure · {items.length} Referans
            </span>
          </div>

          <div className="space-y-2.5">
            {surahGroups.map((group) => (
              <div
                key={group.surahNo}
                className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-2.5 pb-2.5 last:pb-0 border-b last:border-b-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span
                  className="text-xs sm:text-sm font-extrabold shrink-0 min-w-[140px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {group.surahName}{' '}
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    ({group.surahNo}):
                  </span>
                </span>

                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {group.items.map((item) => {
                    const isSelected = selectedChipKey === item.key;
                    const rangeLabel = formatRefRangeLabel(item.startAyah, item.endAyah);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setSelectedChipKey((prev) => (prev === item.key ? null : item.key));
                        }}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums inline-flex items-center gap-1 transition-all cursor-pointer"
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface-soft)',
                          borderColor: isSelected
                            ? 'var(--brand-primary)'
                            : 'var(--border-subtle)',
                          color: isSelected ? '#FFFFFF' : 'var(--brand-primary-text)',
                        }}
                      >
                        <span>{rangeLabel}</span>
                        {item.note && (
                          <StickyNote
                            className="w-3 h-3 shrink-0 opacity-85"
                            aria-label="Kişisel not içeriyor"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Seçilen Referans Çipinin Anlık Önizleme Kartı */}
        {selectedChipItem && (
          <div
            className="rounded-2xl border p-4 space-y-3 shadow-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--brand-primary)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  {surahMap.get(selectedChipItem.surah)?.nameTr ?? `${selectedChipItem.surah}. Sure`}{' '}
                  {selectedChipItem.surah}:
                  {formatRefRangeLabel(selectedChipItem.startAyah, selectedChipItem.endAyah)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handlePlaySingleRange(
                      selectedChipItem.surah,
                      selectedChipItem.startAyah,
                      selectedChipItem.endAyah,
                    )
                  }
                  className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Dinle</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleOpenInMushaf(selectedChipItem.surah, selectedChipItem.startAyah)
                  }
                  className="min-h-[34px] px-2.5 rounded-lg text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mushaf&apos;ta Aç</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    openMealCompare(selectedChipItem.surah, selectedChipItem.startAyah);
                  }}
                  title="24 Türkçe mealde karşılaştır"
                  className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Scale className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary-text)' }} />
                  <span className="hidden sm:inline">24 Meal</span>
                </button>

                {!editable && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openQuickResearch(
                        selectedChipItem.surah,
                        selectedChipItem.startAyah,
                        selectedChipItem.endAyah,
                      );
                    }}
                    title="Araştırma defterime ekle"
                    className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      borderColor: 'rgba(217, 119, 6, 0.35)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Pin className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Deftere Ekle</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedChipKey(null)}
                  aria-label="Önizlemeyi kapat"
                  className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isLoadingChip ? (
              <div className="py-5 flex items-center justify-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--brand-primary-text)' }} />
                <span>Ayet metni ve meal yükleniyor...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {chipPreviewVerses.map((hv) => (
                  <div
                    key={hv.key}
                    className="p-3 rounded-xl border space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      <span className="tabular-nums">
                        {hv.surahMeta?.nameTr ?? `${hv.surah}. Sure`} {hv.surah}:{hv.ayah} · Sayfa{' '}
                        {hv.verse.page}
                      </span>
                      <button
                        type="button"
                        onClick={() => openMealCompare(hv.surah, hv.ayah)}
                        className="font-bold hover:underline cursor-pointer"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        24 Mealde Karşılaştır
                      </button>
                    </div>
                    <p
                      dir="rtl"
                      className="arabic-text text-right leading-[2.15]"
                      style={{
                        fontSize: `${Math.min(34, Math.max(20, settings.arabicFontSize - 2))}px`,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {hv.verse.ar.t}{' '}
                      <span
                        className="inline-block text-[0.72em] mx-1"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        ﴿{toArabicIndicDigits(hv.ayah)}﴾
                      </span>
                    </p>
                    {hv.primaryMealVerse?.t && (
                      <p
                        className="turkish-reading"
                        style={{
                          fontSize: `${settings.turkishFontSize}px`,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span
                          className="text-[11px] font-extrabold mr-1.5"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          [{primaryMeal.shortLabel}]
                        </span>
                        {hv.primaryMealVerse.t}
                      </p>
                    )}
                    {isDual && hv.secondaryMealVerse?.t && (
                      <p
                        className="turkish-reading pt-1.5 border-t"
                        style={{
                          fontSize: `${settings.turkishFontSize}px`,
                          color: 'var(--text-secondary)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <span
                          className="text-[11px] font-extrabold mr-1.5"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          [{secondaryMeal.shortLabel}]
                        </span>
                        {hv.secondaryMealVerse.t}
                      </p>
                    )}
                  </div>
                ))}

                {/* Kişisel Araştırma Notu (Defter modunda) */}
                {editable && selectedChipItem.entryId && (
                  <div
                    className="p-3 rounded-xl border space-y-2"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      borderColor: 'rgba(217, 119, 6, 0.28)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs font-extrabold inline-flex items-center gap-1.5"
                        style={{ color: 'var(--brand-accent-text)' }}
                      >
                        <NotebookPen className="w-3.5 h-3.5" />
                        <span>Kişisel Araştırma Notum</span>
                      </span>
                      <div className="flex items-center gap-1">
                        {onUpdateEntry && editingEntryId !== selectedChipItem.entryId && (
                          <button
                            type="button"
                            onClick={() => startEditingEntry(selectedChipItem)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Kaydı Düzenle</span>
                          </button>
                        )}
                        {editingNoteEntryId !== selectedChipItem.entryId &&
                          editingEntryId !== selectedChipItem.entryId && (
                          <button
                            type="button"
                            onClick={() =>
                              startEditingNote(selectedChipItem.entryId!, selectedChipItem.note)
                            }
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {selectedChipItem.note ? 'Notu Düzenle' : 'Not Ekle'}
                          </button>
                        )}
                        {onRemoveEntry && (
                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              onRemoveEntry(selectedChipItem.entryId!);
                              setSelectedChipKey(null);
                            }}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'rgba(239, 68, 68, 0.35)',
                              color: '#DC2626',
                            }}
                          >
                            Listeden Çıkar
                          </button>
                        )}
                      </div>
                    </div>

                    {editingEntryId === selectedChipItem.entryId ? (
                      renderInlineEntryEditForm(selectedChipItem.entryId)
                    ) : editingNoteEntryId === selectedChipItem.entryId ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Bu ayet veya pasajla ilgili kişisel araştırma notunuzu yazın..."
                          className="w-full p-2.5 rounded-xl border text-xs outline-none focus:border-[var(--brand-primary)]"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingNoteEntryId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            İptal
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEditingNote(selectedChipItem.entryId!)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Kaydet</span>
                          </button>
                        </div>
                      </div>
                    ) : selectedChipItem.note ? (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                        {selectedChipItem.note}
                      </p>
                    ) : (
                      <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                        Henüz not eklenmedi.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 2. SADECE ARAPÇA / SADECE MEAL / AR + MEAL GÖRÜNÜMLERİ
  // ============================================================================
  if (isHydratingAll) {
    return (
      <div
        className="rounded-2xl border p-8 flex flex-col items-center justify-center gap-2.5 text-center"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-primary-text)' }} />
        <p className="text-xs sm:text-sm font-bold">Konu ayetleri yükleniyor...</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Seçili surelerin Arapça metni ve {primaryMeal.shortLabel} meali hazırlanıyor.
        </p>
      </div>
    );
  }

  const entryIndexById = new Map<string, number>();
  if (editable) {
    items.forEach((it, idx) => {
      if (it.entryId) entryIndexById.set(it.entryId, idx);
    });
  }

  return (
    <div className="space-y-3">
      {hydratedVerses.map((hv) => {
        const isPlayingThis =
          audioState.status === 'playing' && audioState.currentAyahId === hv.verse.id;
        const primaryFn = hv.primaryMealVerse?.fn ?? [];
        const secondaryFn = isDual ? (hv.secondaryMealVerse?.fn ?? []) : [];
        const totalFn = settings.showFootnotes ? primaryFn.length + secondaryFn.length : 0;
        const isFnOpen = Boolean(openFootnotes[hv.key]);
        const entryIdx = hv.entryId ? entryIndexById.get(hv.entryId) : undefined;
        const showEntryControls = editable && Boolean(hv.entryId) && hv.isRangeFirst;

        return (
          <article
            key={hv.key}
            className="surface-card rounded-2xl p-4 sm:p-5 space-y-3 transition-all"
            style={{
              borderColor: isPlayingThis ? 'var(--brand-primary)' : 'var(--border-subtle)',
              boxShadow: isPlayingThis
                ? '0 0 0 2px rgba(15, 118, 110, 0.22), var(--shadow-card)'
                : undefined,
            }}
          >
            {/* Ayet Başlık & Aksiyon Şeridi */}
            <div
              className="pb-2.5 border-b flex flex-wrap items-center justify-between gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => handleOpenInMushaf(hv.surah, hv.ayah)}
                  title="Mushaf'ta bu ayete git"
                  className="px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums inline-flex items-center gap-1 cursor-pointer hover:opacity-90"
                  style={{
                    backgroundColor: isPlayingThis
                      ? 'var(--brand-primary)'
                      : 'var(--brand-primary-soft)',
                    color: isPlayingThis ? '#FFFFFF' : 'var(--brand-primary-text)',
                  }}
                >
                  <span>
                    {hv.surahMeta?.nameTr ?? `${hv.surah}. Sure`} {hv.surah}:{hv.ayah}
                  </span>
                  <ExternalLink className="w-3 h-3 opacity-75" />
                </button>
                <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {hv.verse.cuz}. Cüz · S.{hv.verse.page}
                </span>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => handlePlaySingleRange(hv.surah, hv.ayah, hv.ayah)}
                  title="Bu ayeti dinle"
                  className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Headphones className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Dinle</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    openMealCompare(hv.surah, hv.ayah);
                  }}
                  title="24 Türkçe mealde karşılaştır"
                  className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Scale className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                  <span className="hidden sm:inline">24 Meal</span>
                </button>

                {!editable && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openQuickResearch(hv.surah, hv.ayah, hv.ayah, hv.verse.page);
                    }}
                    title="Kişisel araştırma defterime ekle"
                    className="min-h-[34px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Pin className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">Deftere Ekle</span>
                  </button>
                )}

                {showEntryControls && hv.entryId && (
                  <>
                    {onUpdateEntry && (
                      <button
                        type="button"
                        onClick={() => {
                          const entry = itemByEntryId.get(hv.entryId!);
                          if (entry) startEditingEntry(entry);
                        }}
                        title="Sure, ayet aralığı veya notu düzenle"
                        aria-label="Kaydı düzenle"
                        className="min-h-[34px] px-2 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor:
                            editingEntryId === hv.entryId
                              ? 'var(--brand-primary-soft)'
                              : 'var(--bg-surface-soft)',
                          borderColor:
                            editingEntryId === hv.entryId
                              ? 'var(--brand-primary)'
                              : 'var(--border-subtle)',
                          color:
                            editingEntryId === hv.entryId
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden md:inline">Düzenle</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => startEditingNote(hv.entryId!, hv.note)}
                      title={hv.note ? 'Kişisel notu düzenle' : 'Kişisel not ekle'}
                      aria-label={hv.note ? 'Kişisel notu düzenle' : 'Kişisel not ekle'}
                      className="min-h-[34px] px-2 rounded-lg border text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: hv.note
                          ? 'var(--brand-accent-soft)'
                          : 'var(--bg-surface-soft)',
                        borderColor: hv.note
                          ? 'rgba(217, 119, 6, 0.35)'
                          : 'var(--border-subtle)',
                        color: hv.note ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
                      }}
                    >
                      <NotebookPen className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden md:inline">{hv.note ? 'Notu Düzenle' : 'Not'}</span>
                    </button>

                    {canReorder && onMoveEntry && entryIdx !== undefined && (
                      <>
                        <button
                          type="button"
                          disabled={entryIdx === 0}
                          onClick={() => {
                            sfxService.play('click');
                            onMoveEntry(hv.entryId!, 'up');
                          }}
                          title="Yukarı taşı"
                          aria-label="Yukarı taşı"
                          className="w-8 h-[34px] rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-35"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={entryIdx >= items.length - 1}
                          onClick={() => {
                            sfxService.play('click');
                            onMoveEntry(hv.entryId!, 'down');
                          }}
                          title="Aşağı taşı"
                          aria-label="Aşağı taşı"
                          className="w-8 h-[34px] rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-35"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    {onRemoveEntry && (
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          onRemoveEntry(hv.entryId!);
                        }}
                        title="Bu kaydı listeden sil"
                        aria-label="Bu kaydı listeden sil"
                        className="w-8 h-[34px] rounded-lg border flex items-center justify-center cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: '#DC2626',
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Satır İçi Kayıt Düzenleme Paneli (Sure / Başlangıç / Bitiş / Not) */}
            {showEntryControls && hv.entryId && editingEntryId === hv.entryId && (
              <div>{renderInlineEntryEditForm(hv.entryId)}</div>
            )}

            {/* Arapça Metin (Sadece AR veya AR + Meal) */}
            {(viewMode === 'ar' || viewMode === 'ar_meal') && (
              <p
                dir="rtl"
                className="arabic-text text-right leading-[2.2]"
                style={{
                  fontSize: `${settings.arabicFontSize}px`,
                  color: 'var(--text-primary)',
                }}
              >
                {hv.verse.ar.t}{' '}
                <span
                  className="inline-block text-[0.72em] mx-1"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  ﴿{toArabicIndicDigits(hv.ayah)}﴾
                </span>
              </p>
            )}

            {/* Meal Metinleri (Sadece Meal veya AR + Meal) */}
            {(viewMode === 'meal' || viewMode === 'ar_meal') && (
              <div className={isDual ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-2'}>
                <div
                  className={
                    isDual
                      ? 'p-3 rounded-xl border'
                      : undefined
                  }
                  style={
                    isDual
                      ? {
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                        }
                      : undefined
                  }
                >
                  <p
                    className="text-[11px] font-extrabold mb-1"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    {primaryMeal.label}
                  </p>
                  <p
                    className="turkish-reading"
                    style={{
                      fontSize: `${settings.turkishFontSize}px`,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {hv.primaryMealVerse?.t ?? 'Bu ayet için seçili meal metni bulunamadı.'}
                  </p>
                </div>

                {isDual && (
                  <div
                    className="p-3 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <p
                      className="text-[11px] font-extrabold mb-1"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      {secondaryMeal.label}
                    </p>
                    <p
                      className="turkish-reading"
                      style={{
                        fontSize: `${settings.turkishFontSize}px`,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {hv.secondaryMealVerse?.t ?? 'Karşılaştırma meali bulunamadı.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dipnotlar */}
            {(viewMode === 'meal' || viewMode === 'ar_meal') && totalFn > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setOpenFootnotes((prev) => ({ ...prev, [hv.key]: !prev[hv.key] }));
                  }}
                  className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  <span>Dipnotlar ({totalFn})</span>
                  {isFnOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                {isFnOpen && (
                  <div
                    className="mt-2 p-3 rounded-xl border space-y-2 text-xs leading-relaxed"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {primaryFn.length > 0 && (
                      <div>
                        <p className="font-extrabold mb-1" style={{ color: 'var(--brand-primary-text)' }}>
                          {primaryMeal.shortLabel}
                        </p>
                        <ol className="list-decimal list-inside space-y-1">
                          {primaryFn.map((fn, i) => (
                            <li key={`pfn-${i}`}>{fn}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {isDual && secondaryFn.length > 0 && (
                      <div className="pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <p className="font-extrabold mb-1" style={{ color: 'var(--brand-accent-text)' }}>
                          {secondaryMeal.shortLabel}
                        </p>
                        <ol className="list-decimal list-inside space-y-1">
                          {secondaryFn.map((fn, i) => (
                            <li key={`sfn-${i}`}>{fn}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Kişisel Araştırma Notu Görüntüleme / Düzenleme */}
            {showEntryControls && hv.entryId && (hv.note || editingNoteEntryId === hv.entryId) && (
              <div
                className="p-3 rounded-xl border space-y-2"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'rgba(217, 119, 6, 0.28)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-extrabold inline-flex items-center gap-1"
                    style={{ color: 'var(--brand-accent-text)' }}
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    <span>Kişisel Araştırma Notu</span>
                  </span>
                  {editingNoteEntryId !== hv.entryId && (
                    <button
                      type="button"
                      onClick={() => startEditingNote(hv.entryId!, hv.note)}
                      className="text-[11px] font-bold underline cursor-pointer"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      Düzenle
                    </button>
                  )}
                </div>

                {editingNoteEntryId === hv.entryId ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Bu ayet veya pasajla ilgili kişisel notunuz..."
                      className="w-full p-2.5 rounded-xl border text-xs outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingNoteEntryId(null)}
                        className="px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        İptal
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEditingNote(hv.entryId!)}
                        className="px-3 py-1 rounded-lg text-xs font-bold text-white inline-flex items-center gap-1 cursor-pointer"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Kaydet</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                    {hv.note}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
