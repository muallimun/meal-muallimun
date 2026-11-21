import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  FileText,
  Layers,
  ListChecks,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildMemorizationUnitFromRanges,
  buildRangesForMushafPage,
  buildSplitUnitsForPreset,
  CURATED_ASHR_PRESETS,
  CURATED_PRESET_GROUPS,
  findMatchingUnitInPool,
  getRangesPageLabel,
  getRangesSignature,
} from '../../data/curatedAshrPresets';
import { memorizationStorage } from '../../services/memorizationStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  AyahRange,
  CuratedPresetGroupId,
  CuratedPresetItem,
  MemorizationUnit,
} from '../../types/memorization';
import { formatSurahTitle } from '../../utils/arabicUtils';
import { normalizeTurkish } from '../../utils/textNormalize';

type PoolTab = 'preset' | 'page' | 'surah' | 'custom';
type PageSplit = 'full' | 'top' | 'bottom';

interface CreatePoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (units: MemorizationUnit[], startImmediately: boolean) => void;
}

export const CreatePoolModal: React.FC<CreatePoolModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { meta, studyProgress } = useAppStore();

  const currentReadingPage = useMemo(() => {
    const last = studyProgress.lastRead?.page;
    if (last && last >= 1 && last <= 604) return last;
    const hatim = studyProgress.pageBookmarks.find((b) => b.isHatim)?.page;
    if (hatim && hatim >= 1 && hatim <= 604) return hatim;
    return 1;
  }, [studyProgress.lastRead, studyProgress.pageBookmarks]);

  const [activeTab, setActiveTab] = useState<PoolTab>('preset');

  // 1. Hazır Seçkiler
  const [presetQuery, setPresetQuery] = useState('');
  const [presetGroupFilter, setPresetGroupFilter] = useState<'all' | CuratedPresetGroupId>('all');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CURATED_ASHR_PRESETS[0].id);
  const [splitLongPreset, setSplitLongPreset] = useState(false);
  const [presetSplitBy, setPresetSplitBy] = useState<'pages' | 'daily'>('pages');
  const [presetChunkSize, setPresetChunkSize] = useState(6);
  const [existingUnits, setExistingUnits] = useState<MemorizationUnit[]>(() =>
    memorizationStorage.readUnitsSync(),
  );

  // 2. Sayfa
  const [selectedPage, setSelectedPage] = useState<number>(currentReadingPage);
  const [selectedJuz, setSelectedJuz] = useState<number>(1);
  const [pageSplit, setPageSplit] = useState<PageSplit>('full');

  // 3. Sure
  const [surahQuery, setSurahQuery] = useState('');
  const [selectedSurahNo, setSelectedSurahNo] = useState<number>(67); // Mülk varsayılan
  const [splitSurahDaily, setSplitSurahDaily] = useState(true);
  const [surahChunkSize, setSurahChunkSize] = useState(6);

  // 4. Özel Aralık (Çoklu aralık destekli)
  const [customTitle, setCustomTitle] = useState('');
  const [draftSurah, setDraftSurah] = useState<number>(2);
  const [draftStart, setDraftStart] = useState<number>(255);
  const [draftEnd, setDraftEnd] = useState<number>(255);
  const [customRanges, setCustomRanges] = useState<AyahRange[]>([
    { surah: 2, startAyah: 255, endAyah: 255 },
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPage(currentReadingPage);
    setSelectedJuz(Math.max(1, Math.min(30, Math.ceil(currentReadingPage / 20))));
    setExistingUnits(memorizationStorage.readUnitsSync());
  }, [isOpen, currentReadingPage]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const surahMap = useMemo(() => {
    const map = new Map<number, { nameTr: string; shortNameTr: string; ayahCount: number; pageStart: number; pageEnd: number }>();
    if (meta) {
      for (const s of meta.surahs) {
        map.set(s.no, {
          nameTr: s.nameTr,
          shortNameTr: s.shortNameTr,
          ayahCount: s.ayahCount,
          pageStart: s.pageStart,
          pageEnd: s.pageEnd,
        });
      }
    }
    return map;
  }, [meta]);

  // Hazır Seçki filtreleme
  const filteredPresets = useMemo(() => {
    const q = normalizeTurkish(presetQuery.trim());
    return CURATED_ASHR_PRESETS.filter((p) => {
      if (presetGroupFilter !== 'all' && p.group !== presetGroupFilter) return false;
      if (!q) return true;
      return normalizeTurkish(p.title).includes(q) || normalizeTurkish(p.subtitle).includes(q);
    });
  }, [presetQuery, presetGroupFilter]);

  const selectedPreset: CuratedPresetItem | null = useMemo(
    () => CURATED_ASHR_PRESETS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId],
  );

  const selectedPresetExistingUnit = useMemo(() => {
    if (!selectedPreset || splitLongPreset) return undefined;
    return findMatchingUnitInPool(existingUnits, selectedPreset.ranges);
  }, [selectedPreset, splitLongPreset, existingUnits]);

  // Sayfa önizlemesi
  const currentReadingPagePreview = useMemo(() => {
    if (!meta) return null;
    return buildRangesForMushafPage(meta, currentReadingPage, 'full');
  }, [meta, currentReadingPage]);

  const pagePreview = useMemo(() => {
    if (!meta) return null;
    return buildRangesForMushafPage(meta, selectedPage, pageSplit);
  }, [meta, selectedPage, pageSplit]);

  const juzPages = useMemo(() => {
    if (!meta) {
      const start = selectedJuz === 1 ? 1 : (selectedJuz - 1) * 20 + 2;
      const end = Math.min(604, start + 19);
      return Array.from({ length: Math.max(1, end - start + 1) }, (_, i) => start + i);
    }
    const pages = new Set<number>();
    for (const row of meta.verseIndex) {
      if (row[3] === selectedJuz && row[4] >= 1) {
        pages.add(row[4]);
      }
    }
    const sorted = Array.from(pages).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted : [1];
  }, [meta, selectedJuz]);

  // Sure filtreleme
  const filteredSurahs = useMemo(() => {
    if (!meta) return [];
    const q = normalizeTurkish(surahQuery.trim());
    if (!q) return meta.surahs;
    return meta.surahs.filter(
      (s) =>
        normalizeTurkish(s.nameTr).includes(q) ||
        String(s.no) === q ||
        normalizeTurkish(s.shortNameTr).includes(q),
    );
  }, [meta, surahQuery]);

  const selectedSurahMeta = surahMap.get(selectedSurahNo) ?? null;

  const draftSurahMaxAyah = surahMap.get(draftSurah)?.ayahCount ?? 286;

  // Seçime göre oluşturulacak önizleme özeti
  const buildTargetUnits = (): MemorizationUnit[] => {
    if (activeTab === 'preset' && selectedPreset) {
      // Uzun sureler (>15 ayet) istenirse Mushaf sayfalarına veya günlük dilimlere bölünebilir
      if (
        splitLongPreset &&
        selectedPreset.ranges.length === 1 &&
        selectedPreset.estimatedAyahs > 15
      ) {
        return buildSplitUnitsForPreset(meta, selectedPreset, presetSplitBy, presetChunkSize);
      }

      return [
        buildMemorizationUnitFromRanges(meta, {
          title: selectedPreset.title,
          subtitle: selectedPreset.subtitle,
          sourceType: 'preset',
          ranges: selectedPreset.ranges,
        }),
      ];
    }

    if (activeTab === 'page' && pagePreview && pagePreview.ranges.length > 0) {
      const splitLabel =
        pageSplit === 'top' ? ' (Üst Yarı)' : pageSplit === 'bottom' ? ' (Alt Yarı)' : '';
      return [
        buildMemorizationUnitFromRanges(meta, {
          title: `Sayfa ${selectedPage}${splitLabel}`,
          subtitle: `${pagePreview.surahNames.join(', ')} · ${pagePreview.verseKeys.length} Ayet`,
          sourceType: 'page',
          ranges: pagePreview.ranges,
        }),
      ];
    }

    if (activeTab === 'surah' && selectedSurahMeta) {
      if (splitSurahDaily && selectedSurahMeta.ayahCount > 12) {
        const units: MemorizationUnit[] = [];
        let part = 1;
        for (let a = 1; a <= selectedSurahMeta.ayahCount; a += surahChunkSize) {
          const end = Math.min(selectedSurahMeta.ayahCount, a + surahChunkSize - 1);
          units.push(
            buildMemorizationUnitFromRanges(meta, {
              title: `${selectedSurahMeta.nameTr} · Dilim ${part}`,
              subtitle: `${selectedSurahMeta.shortNameTr} ${a}–${end} · ${end - a + 1} Ayet`,
              sourceType: 'surah',
              ranges: [{ surah: selectedSurahNo, startAyah: a, endAyah: end }],
            }),
          );
          part += 1;
        }
        return units;
      }

      return [
        buildMemorizationUnitFromRanges(meta, {
          title: formatSurahTitle(selectedSurahMeta.nameTr, selectedSurahNo),
          subtitle: `${selectedSurahNo}. Sure · ${selectedSurahMeta.ayahCount} Ayet`,
          sourceType: 'surah',
          ranges: [{ surah: selectedSurahNo, startAyah: 1, endAyah: selectedSurahMeta.ayahCount }],
        }),
      ];
    }

    if (activeTab === 'custom' && customRanges.length > 0) {
      const descParts = customRanges.map((r) => {
        const sName = surahMap.get(r.surah)?.shortNameTr ?? `${r.surah}. Sure`;
        return r.startAyah === r.endAyah
          ? `${sName} ${r.startAyah}`
          : `${sName} ${r.startAyah}–${r.endAyah}`;
      });
      const autoTitle =
        descParts.length === 1 ? descParts[0] : `${descParts[0]} (+${descParts.length - 1} aralık)`;
      const totalAyahs = customRanges.reduce(
        (acc, r) => acc + Math.max(1, Math.abs(r.endAyah - r.startAyah) + 1),
        0,
      );
      return [
        buildMemorizationUnitFromRanges(meta, {
          title: customTitle.trim() || autoTitle,
          subtitle: `${descParts.join(' · ')} · ${totalAyahs} Ayet`,
          sourceType: 'custom',
          ranges: customRanges,
        }),
      ];
    }

    return [];
  };

  const summaryInfo = useMemo(() => {
    if (activeTab === 'preset' && selectedPreset) {
      const willSplit =
        splitLongPreset &&
        selectedPreset.ranges.length === 1 &&
        selectedPreset.estimatedAyahs > 15;
      const splitCount = willSplit
        ? buildSplitUnitsForPreset(meta, selectedPreset, presetSplitBy, presetChunkSize).length
        : 1;
      return {
        valid: true,
        title: selectedPreset.title,
        detail: willSplit
          ? `${splitCount} parça (${presetSplitBy === 'pages' ? 'Mushaf sayfasına göre' : `${presetChunkSize}’şar ayet`}) · Toplam ${selectedPreset.estimatedAyahs} ayet`
          : selectedPresetExistingUnit
            ? 'Havuzunuzda mevcut · Doğrudan çalışabilirsiniz'
            : selectedPreset.subtitle,
      };
    }
    if (activeTab === 'page') {
      if (!pagePreview || pagePreview.verseKeys.length === 0) {
        return { valid: false, title: `Sayfa ${selectedPage}`, detail: 'Sayfa verisi yükleniyor...' };
      }
      const splitLabel =
        pageSplit === 'top' ? ' (Üst Yarı)' : pageSplit === 'bottom' ? ' (Alt Yarı)' : '';
      return {
        valid: true,
        title: `Sayfa ${selectedPage}${splitLabel}`,
        detail: `${pagePreview.surahNames.join(', ')} · ${pagePreview.verseKeys.length} Ayet`,
      };
    }
    if (activeTab === 'surah' && selectedSurahMeta) {
      const willSplit = splitSurahDaily && selectedSurahMeta.ayahCount > 12;
      const chunkCount = willSplit
        ? Math.ceil(selectedSurahMeta.ayahCount / surahChunkSize)
        : 1;
      return {
        valid: true,
        title: formatSurahTitle(selectedSurahMeta.nameTr, selectedSurahNo),
        detail: willSplit
          ? `${chunkCount} günlük dilim (${surahChunkSize}’şar ayet) · Toplam ${selectedSurahMeta.ayahCount} ayet`
          : `Tek birim · ${selectedSurahMeta.ayahCount} ayet`,
      };
    }
    if (activeTab === 'custom') {
      if (customRanges.length === 0) {
        return { valid: false, title: 'Özel Aralık', detail: 'En az bir ayet aralığı ekleyin' };
      }
      const total = customRanges.reduce(
        (acc, r) => acc + Math.max(1, Math.abs(r.endAyah - r.startAyah) + 1),
        0,
      );
      return {
        valid: true,
        title: customTitle.trim() || `${customRanges.length} Özel Aralık`,
        detail: `Toplam ${total} ayet`,
      };
    }
    return { valid: false, title: 'Seçim yapın', detail: '' };
  }, [
    activeTab,
    selectedPreset,
    selectedPresetExistingUnit,
    splitLongPreset,
    presetSplitBy,
    presetChunkSize,
    meta,
    pagePreview,
    selectedPage,
    pageSplit,
    selectedSurahNo,
    selectedSurahMeta,
    splitSurahDaily,
    surahChunkSize,
    customRanges,
    customTitle,
  ]);

  if (!isOpen) return null;

  const handleConfirm = async (startImmediately: boolean) => {
    // Tek parça seçili ve havuzda zaten varsa mükerrer oluşturmadan mevcut birimi kullan
    if (activeTab === 'preset' && selectedPresetExistingUnit && !splitLongPreset) {
      sfxService.play('click');
      onCreated([selectedPresetExistingUnit], startImmediately);
      onClose();
      return;
    }

    const units = buildTargetUnits();
    if (units.length === 0) return;
    sfxService.play('click');

    // Mükerrer koruması: havuzda aynı ranges imzasına sahip olanları atla
    const existing = await memorizationStorage.loadUnits();
    const existingSigs = new Set(existing.map((u) => getRangesSignature(u.ranges)));
    const freshUnits = units.filter((u) => !existingSigs.has(getRangesSignature(u.ranges)));

    if (freshUnits.length === 1) {
      await memorizationStorage.upsertUnit(freshUnits[0]);
    } else if (freshUnits.length > 1) {
      await memorizationStorage.addUnitsBatch(freshUnits);
    }

    const resultUnits =
      freshUnits.length > 0
        ? freshUnits
        : units
            .map((u) => findMatchingUnitInPool(existing, u.ranges))
            .filter((u): u is MemorizationUnit => Boolean(u));

    onCreated(resultUnits.length > 0 ? resultUnits : units, startImmediately);
    onClose();
  };

  const handleAddCustomRange = () => {
    sfxService.play('click');
    const s = Math.max(1, Math.min(draftSurahMaxAyah, draftStart));
    const e = Math.max(s, Math.min(draftSurahMaxAyah, draftEnd));
    setCustomRanges((prev) => [...prev, { surah: draftSurah, startAyah: s, endAyah: e }]);
  };

  const tabs: Array<{ id: PoolTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'preset', label: 'Hazır Seçkiler', icon: Sparkles },
    { id: 'page', label: 'Sayfa', icon: FileText },
    { id: 'surah', label: 'Sure', icon: BookOpen },
    { id: 'custom', label: 'Özel Aralık', icon: Layers },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Yeni Ezber Birimi Ekle"
    >
      <div
        className="w-full sm:max-w-2xl h-[92dvh] sm:h-auto sm:max-h-[88dvh] rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Modal Üst Başlık */}
        <div
          className="px-4 py-3.5 sm:px-5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold truncate">Yeni Ezber Ekle</h2>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              Hazır aşır, Mushaf sayfası, sure veya kendi ayet aralığınızı havuzunuza ekleyin
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Sekmeli Üst Şerit */}
        <div
          className="px-3 sm:px-5 py-2.5 border-b shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {tabs.map((tab) => {
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
                  className="min-h-[40px] px-2 py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:block" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Kaydırılabilir İçerik Alanı */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* SEKME 1: HAZIR SEÇKİLER */}
          {activeTab === 'preset' && (
            <div className="space-y-4">
              <div className="relative">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  value={presetQuery}
                  onChange={(e) => setPresetQuery(e.target.value)}
                  placeholder="Aşır veya sure ara (örn. Kürsî, Mülk, Yâsîn, Duhâ)..."
                  className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border text-sm outline-none focus:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* 4 Kategori Hızlı Filtre Hapları */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setPresetGroupFilter('all');
                  }}
                  className="min-h-[32px] px-2.5 rounded-xl border text-[11px] font-bold cursor-pointer"
                  style={{
                    backgroundColor:
                      presetGroupFilter === 'all' ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                    borderColor:
                      presetGroupFilter === 'all' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: presetGroupFilter === 'all' ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  Tümü ({CURATED_ASHR_PRESETS.length})
                </button>
                {CURATED_PRESET_GROUPS.map((g) => {
                  const count = CURATED_ASHR_PRESETS.filter((p) => p.group === g.id).length;
                  const active = presetGroupFilter === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setPresetGroupFilter(g.id);
                      }}
                      className="min-h-[32px] px-2.5 rounded-xl border text-[11px] font-bold cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                        borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        color: active ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      {g.shortTitle} ({count})
                    </button>
                  );
                })}
              </div>

              {selectedPreset &&
                selectedPreset.ranges.length === 1 &&
                selectedPreset.estimatedAyahs > 15 && (
                  <div
                    className="p-3.5 rounded-2xl border space-y-2.5"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      borderColor: 'rgba(15, 118, 110, 0.28)',
                    }}
                  >
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <span
                        className="text-xs sm:text-sm font-extrabold"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        Uzun sureyi sayfa / günlük dilimlere bölerek ekle
                      </span>
                      <input
                        type="checkbox"
                        checked={splitLongPreset}
                        onChange={(e) => setSplitLongPreset(e.target.checked)}
                        className="w-4 h-4 accent-[var(--brand-primary)]"
                      />
                    </label>
                    {splitLongPreset && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPresetSplitBy('pages')}
                            className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                            style={{
                              backgroundColor:
                                presetSplitBy === 'pages'
                                  ? 'var(--brand-primary)'
                                  : 'var(--bg-surface)',
                              borderColor:
                                presetSplitBy === 'pages'
                                  ? 'var(--brand-primary)'
                                  : 'var(--border-subtle)',
                              color: presetSplitBy === 'pages' ? '#FFFFFF' : 'var(--text-primary)',
                            }}
                          >
                            Mushaf Sayfalarına Böl
                          </button>
                          <button
                            type="button"
                            onClick={() => setPresetSplitBy('daily')}
                            className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                            style={{
                              backgroundColor:
                                presetSplitBy === 'daily'
                                  ? 'var(--brand-primary)'
                                  : 'var(--bg-surface)',
                              borderColor:
                                presetSplitBy === 'daily'
                                  ? 'var(--brand-primary)'
                                  : 'var(--border-subtle)',
                              color: presetSplitBy === 'daily' ? '#FFFFFF' : 'var(--text-primary)',
                            }}
                          >
                            Günlük Dilimlere Böl
                          </button>
                        </div>

                        {presetSplitBy === 'daily' && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                              Dilim boyutu:
                            </span>
                            {[5, 6, 7, 8].map((sz) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => setPresetChunkSize(sz)}
                                className="px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer"
                                style={{
                                  backgroundColor:
                                    presetChunkSize === sz
                                      ? 'var(--brand-primary)'
                                      : 'var(--bg-surface)',
                                  borderColor:
                                    presetChunkSize === sz
                                      ? 'var(--brand-primary)'
                                      : 'var(--border-subtle)',
                                  color: presetChunkSize === sz ? '#FFFFFF' : 'var(--text-primary)',
                                }}
                              >
                                {sz} Ayet
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              {CURATED_PRESET_GROUPS.map((group) => {
                const items = filteredPresets.filter((p) => p.group === group.id);
                if (items.length === 0) return null;
                return (
                  <section key={group.id} className="space-y-2">
                    <div>
                      <h3 className="text-xs sm:text-sm font-extrabold">{group.title}</h3>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {group.description}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {items.map((item) => {
                        const selected = selectedPresetId === item.id;
                        const alreadyInPool = Boolean(
                          findMatchingUnitInPool(existingUnits, item.ranges),
                        );
                        const pageLabel = getRangesPageLabel(meta, item.ranges);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setSelectedPresetId(item.id);
                            }}
                            className="text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2"
                            style={{
                              backgroundColor: selected
                                ? 'var(--brand-primary-soft)'
                                : 'var(--bg-surface-soft)',
                              borderColor: selected
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                            }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p
                                  className="text-xs sm:text-sm font-extrabold truncate"
                                  style={{
                                    color: selected
                                      ? 'var(--brand-primary-text)'
                                      : 'var(--text-primary)',
                                  }}
                                >
                                  {item.title}
                                </p>
                                {alreadyInPool && (
                                  <span
                                    className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                                    style={{
                                      backgroundColor: 'var(--brand-primary-soft)',
                                      color: 'var(--brand-primary-text)',
                                    }}
                                  >
                                    ✓ Havuzda
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                                {item.subtitle}
                                {pageLabel ? ` · ${pageLabel}` : ''}
                              </p>
                            </div>
                            {selected && (
                              <span
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                                style={{ backgroundColor: 'var(--brand-primary)' }}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* SEKME 2: SAYFA */}
          {activeTab === 'page' && (
            <div className="space-y-4">
              {/* Mevcut Okuma Sayfam Kısayolu */}
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSelectedPage(currentReadingPage);
                  setSelectedJuz(Math.max(1, Math.min(30, Math.ceil(currentReadingPage / 20))));
                }}
                className="w-full p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 cursor-pointer transition-all"
                style={{
                  backgroundColor:
                    selectedPage === currentReadingPage
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                  borderColor:
                    selectedPage === currentReadingPage
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                }}
              >
                <div className="min-w-0">
                  <p
                    className="text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    Mevcut Okuma Sayfam
                  </p>
                  <p className="text-sm font-extrabold mt-0.5">
                    Sayfa {currentReadingPage}
                    {currentReadingPagePreview?.surahNames.length
                      ? ` · ${currentReadingPagePreview.surahNames.join(', ')}`
                      : ''}
                  </p>
                </div>
                <span
                  className="px-2.5 py-1 rounded-xl text-xs font-bold shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  Hızlı Seç
                </span>
              </button>

              {/* Sayfa Numarası ve Yarı Seçimi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="pool-page-input"
                    className="block text-xs font-bold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Mushaf Sayfası (1–604)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPage((p) => Math.max(1, p - 1))}
                      className="w-10 h-10 rounded-xl border font-extrabold text-sm cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      −
                    </button>
                    <input
                      id="pool-page-input"
                      type="number"
                      min={1}
                      max={604}
                      value={selectedPage}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(604, Number(e.target.value) || 1));
                        setSelectedPage(v);
                      }}
                      className="flex-1 min-h-[40px] px-3 rounded-xl border text-center text-sm font-extrabold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedPage((p) => Math.min(604, p + 1))}
                      className="w-10 h-10 rounded-xl border font-extrabold text-sm cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                    Sayfa Bölümü
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'full', label: 'Tam Sayfa' },
                        { id: 'top', label: 'Üst Yarı' },
                        { id: 'bottom', label: 'Alt Yarı' },
                      ] as const
                    ).map((opt) => {
                      const active = pageSplit === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setPageSplit(opt.id);
                          }}
                          className="min-h-[40px] px-2 rounded-xl border text-xs font-bold cursor-pointer"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary)'
                              : 'var(--bg-surface-soft)',
                            borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                            color: active ? '#FFFFFF' : 'var(--text-primary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Seçili Sayfa Önizleme Kartı */}
              {pagePreview && (
                <div
                  className="p-3.5 rounded-2xl border space-y-1.5"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">
                      Sayfa {selectedPage} · {pagePreview.surahNames.join(' · ')}
                    </span>
                    <span
                      className="text-xs font-extrabold tabular-nums"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      {pagePreview.verseKeys.length} Ayet
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {pagePreview.ranges
                      .map((r) => {
                        const nm = surahMap.get(r.surah)?.shortNameTr ?? `${r.surah}. Sure`;
                        return r.startAyah === r.endAyah
                          ? `${nm} ${r.startAyah}`
                          : `${nm} ${r.startAyah}–${r.endAyah}`;
                      })
                      .join(' · ')}
                  </p>
                  {pagePreview.hasNextPageContinuationHint && (
                    <p
                      className="text-[11px] font-medium pt-1"
                      style={{ color: 'var(--brand-accent-text)' }}
                    >
                      Not: Sayfa sonundaki ayet bütünlüğü korunur; ayet bölünmeden tam metin ve tam ses ile çalışılır.
                    </p>
                  )}
                </div>
              )}

              {/* Cüz'e Göre Hızlı Sayfa Seçimi */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold" style={{ color: 'var(--text-secondary)' }}>
                    Cüz ile Hızlı Sayfa Seç
                  </span>
                  <select
                    aria-label="Cüz seç"
                    value={selectedJuz}
                    onChange={(e) => setSelectedJuz(Number(e.target.value))}
                    className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                      <option key={j} value={j}>
                        {j}. Cüz
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
                  {juzPages.map((pg) => {
                    const active = selectedPage === pg;
                    return (
                      <button
                        key={pg}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setSelectedPage(pg);
                        }}
                        className="min-h-[36px] rounded-xl border text-xs font-bold tabular-nums cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: active ? '#FFFFFF' : 'var(--text-primary)',
                        }}
                      >
                        {pg}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SEKME 3: SURE */}
          {activeTab === 'surah' && (
            <div className="space-y-3.5">
              <div className="relative">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  value={surahQuery}
                  onChange={(e) => setSurahQuery(e.target.value)}
                  placeholder="Sure adı veya numarası ara (1–114)..."
                  className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border text-sm outline-none focus:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* >12 Ayetli Sureler İçin Günlük Dilimleyici */}
              {selectedSurahMeta && selectedSurahMeta.ayahCount > 12 && (
                <div
                  className="p-3.5 rounded-2xl border space-y-2.5"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'rgba(15, 118, 110, 0.28)',
                  }}
                >
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <div>
                      <p
                        className="text-xs sm:text-sm font-extrabold"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        {formatSurahTitle(selectedSurahMeta.nameTr, selectedSurahNo)}ni Günlük Dilimlere Böl
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {selectedSurahMeta.ayahCount} ayetlik sureyi yormayan ardışık ezber birimlerine ayırır
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={splitSurahDaily}
                      onChange={(e) => setSplitSurahDaily(e.target.checked)}
                      className="w-4 h-4 accent-[var(--brand-primary)] shrink-0"
                    />
                  </label>
                  {splitSurahDaily && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Günlük hedef:
                      </span>
                      {[5, 6, 7, 8].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSurahChunkSize(sz)}
                          className="px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer"
                          style={{
                            backgroundColor:
                              surahChunkSize === sz
                                ? 'var(--brand-primary)'
                                : 'var(--bg-surface)',
                            borderColor:
                              surahChunkSize === sz
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                            color: surahChunkSize === sz ? '#FFFFFF' : 'var(--text-primary)',
                          }}
                        >
                          {sz} Ayet
                        </button>
                      ))}
                      <span
                        className="text-[11px] font-bold ml-auto"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        = {Math.ceil(selectedSurahMeta.ayahCount / surahChunkSize)} dilim
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                {filteredSurahs.map((s) => {
                  const active = selectedSurahNo === s.no;
                  return (
                    <button
                      key={s.no}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setSelectedSurahNo(s.no);
                      }}
                      className="px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer transition-all"
                      style={{
                        backgroundColor: active
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface-soft)',
                        borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-7 h-7 rounded-lg text-[11px] font-extrabold flex items-center justify-center tabular-nums shrink-0"
                          style={{
                            backgroundColor: active
                              ? 'var(--brand-primary)'
                              : 'var(--bg-surface)',
                            color: active ? '#FFFFFF' : 'var(--text-secondary)',
                          }}
                        >
                          {s.no}
                        </span>
                        <div className="min-w-0">
                          <p
                            className="text-xs sm:text-sm font-bold truncate"
                            style={{
                              color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                            }}
                          >
                            {s.nameTr}
                          </p>
                          <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {s.ayahCount} Ayet · S.{s.pageStart}
                          </p>
                        </div>
                      </div>
                      {active && (
                        <Check
                          className="w-4 h-4 shrink-0"
                          style={{ color: 'var(--brand-primary-text)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SEKME 4: ÖZEL ARALIK */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="custom-unit-title"
                  className="block text-xs font-bold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Çalışma Adı (İsteğe bağlı)
                </label>
                <input
                  id="custom-unit-title"
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Örn. Cuma Aşırı veya Akşam Ezberim"
                  className="w-full min-h-[42px] px-3 rounded-xl border text-sm outline-none focus:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div
                className="p-3.5 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <p className="text-xs font-extrabold">Ayet Aralığı Ekle</p>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <select
                      aria-label="Sure seç"
                      value={draftSurah}
                      onChange={(e) => {
                        const sNo = Number(e.target.value);
                        setDraftSurah(sNo);
                        const maxA = surahMap.get(sNo)?.ayahCount ?? 1;
                        setDraftStart(1);
                        setDraftEnd(Math.min(maxA, 5));
                      }}
                      className="w-full min-h-[40px] px-2.5 rounded-xl border text-xs sm:text-sm font-bold"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {(meta?.surahs ?? []).map((s) => (
                        <option key={s.no} value={s.no}>
                          {s.no}. {s.nameTr} ({s.ayahCount})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:col-span-6">
                    <input
                      type="number"
                      min={1}
                      max={draftSurahMaxAyah}
                      value={draftStart}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(draftSurahMaxAyah, Number(e.target.value) || 1));
                        setDraftStart(v);
                        if (v > draftEnd) setDraftEnd(v);
                      }}
                      aria-label="Başlangıç ayeti"
                      placeholder="Başlangıç"
                      className="w-full min-h-[40px] px-2.5 rounded-xl border text-xs sm:text-sm font-bold tabular-nums"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="number"
                      min={draftStart}
                      max={draftSurahMaxAyah}
                      value={draftEnd}
                      onChange={(e) => {
                        const v = Math.max(
                          draftStart,
                          Math.min(draftSurahMaxAyah, Number(e.target.value) || draftStart),
                        );
                        setDraftEnd(v);
                      }}
                      aria-label="Bitiş ayeti"
                      placeholder="Bitiş"
                      className="w-full min-h-[40px] px-2.5 rounded-xl border text-xs sm:text-sm font-bold tabular-nums"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddCustomRange}
                  className="min-h-[38px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Aralık Ekle</span>
                </button>
              </div>

              {/* Eklenen Aralıklar Listesi */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>Seçili Aralıklar ({customRanges.length})</span>
                  </span>
                </div>

                {customRanges.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Henüz aralık eklenmedi. Yukarıdan sure ve ayet aralığı ekleyebilirsiniz.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {customRanges.map((r, idx) => {
                      const sName = surahMap.get(r.surah)?.nameTr ?? `${r.surah}. Sure`;
                      const count = Math.abs(r.endAyah - r.startAyah) + 1;
                      return (
                        <div
                          key={`${r.surah}-${r.startAyah}-${r.endAyah}-${idx}`}
                          className="px-3 py-2 rounded-xl border flex items-center justify-between gap-2"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <div className="text-xs font-bold">
                            {sName} · {r.startAyah === r.endAyah ? `${r.startAyah}. Ayet` : `${r.startAyah}–${r.endAyah}. Ayetler`}{' '}
                            <span style={{ color: 'var(--text-muted)' }}>({count} ayet)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomRanges((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label="Aralığı kaldır"
                            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer hover:bg-red-500/10 text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sabit Alt Özet ve Onay Çubuğu */}
        <div
          className="px-4 py-3.5 sm:px-5 border-t shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-extrabold truncate">{summaryInfo.title}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              {summaryInfo.detail}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!summaryInfo.valid}
              onClick={() => void handleConfirm(false)}
              className="flex-1 sm:flex-initial min-h-[42px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Sadece Havuza Ekle</span>
            </button>

            <button
              type="button"
              disabled={!summaryInfo.valid}
              onClick={() => void handleConfirm(true)}
              className="flex-1 sm:flex-initial min-h-[42px] px-4 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-45"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Havuza Ekle &amp; Başla</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
