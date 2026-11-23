import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  BookMarked,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Download,
  Headphones,
  Layers,
  Link2,
  Map as MapIcon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { findReciterById } from '../../config/recitersConfig';
import {
  buildMemorizationUnitFromRanges,
  buildSplitUnitsForPreset,
  CURATED_ASHR_PRESETS,
  CURATED_PRESET_GROUPS,
  findMatchingUnitInPool,
  getRangesPageLabel,
  getRangesSignature,
} from '../../data/curatedAshrPresets';
import {
  applyStageChangeWithSrs,
  getReviewScheduleBadge,
  isUnitDueForReview,
  memorizationStorage,
} from '../../services/memorizationStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  ActiveSessionSnapshot,
  ClassicalHifzPlan,
  CuratedPresetGroupId,
  CuratedPresetItem,
  MemorizationPrefs,
  MemorizationUnit,
  RetentionStage,
  ZenSessionLaunchOptions,
  ZenSessionMode,
} from '../../types/memorization';
import { RETENTION_STAGE_META } from '../../types/memorization';
import {
  advanceClassicalLesson,
  computeClassicalStats,
  resolveCurrentTurnLesson,
} from '../../utils/classicalHifzUtils';
import { ClassicalHifzView } from './ClassicalHifzView';
import { CreatePoolModal } from './CreatePoolModal';
import { HifzMapView } from './HifzMapView';
import { MemorizationMethodGuide } from './MemorizationMethodGuide';
import { QuickStartDrawer } from './QuickStartDrawer';
import { RabtQuizModal } from './RabtQuizModal';
import { ZenSessionView } from './ZenSessionView';

type StageFilter = 'all' | 'due' | RetentionStage;
type HubViewTab = 'pool' | 'classical' | 'hifz_map';

const NEXT_STAGE: Record<RetentionStage, RetentionStage> = {
  raw: 'fresh',
  fresh: 'solid',
  solid: 'raw',
};

export const MemorizationHubPage: React.FC = () => {
  const {
    meta,
    manifest,
    audioPrefs,
    openReciterSelector,
    memorizeLaunchTarget,
    clearMemorizeLaunchTarget,
  } = useAppStore();

  const [units, setUnits] = useState<MemorizationUnit[]>(() => memorizationStorage.readUnitsSync());
  const [prefs, setPrefs] = useState<MemorizationPrefs>(() => memorizationStorage.readPrefsSync());
  const [activeSession, setActiveSession] = useState<ActiveSessionSnapshot | null>(() =>
    memorizationStorage.readActiveSessionSync(),
  );
  const [classicalPlan, setClassicalPlan] = useState<ClassicalHifzPlan | null>(() =>
    memorizationStorage.readClassicalPlanSync(),
  );

  const [hubView, setHubView] = useState<HubViewTab>('pool');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [drawerUnitId, setDrawerUnitId] = useState<string | null>(null);
  const [rabtQuizUnitId, setRabtQuizUnitId] = useState<string | null>(null);
  const [adHocRabtUnit, setAdHocRabtUnit] = useState<MemorizationUnit | null>(null);
  const [pendingHamCompletePage, setPendingHamCompletePage] = useState<number | null>(null);
  const [zenSession, setZenSession] = useState<{
    unitId?: string;
    adHocUnit?: MemorizationUnit;
    adHocContext?: { mushafPage?: number; isTodayHam?: boolean };
    completed?: boolean;
    snapshot: ActiveSessionSnapshot | null;
    launchOptions?: ZenSessionLaunchOptions;
  } | null>(null);

  // Hazır Ezber Listeleri durumu (havuz dolu olsa da kalıcı görünür)
  const [activePresetGroup, setActivePresetGroup] =
    useState<CuratedPresetGroupId>('prayer_surahs');
  const [isPresetSectionOpen, setIsPresetSectionOpen] = useState(true);
  const [expandedSplitPresetId, setExpandedSplitPresetId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // JSON Yedekleme Modalı
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [backupFeedback, setBackupFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((text: string) => {
    setToastMessage(text);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const refreshFromStorage = useCallback(async () => {
    const [u, p, s, c] = await Promise.all([
      memorizationStorage.loadUnits(),
      memorizationStorage.loadPrefs(),
      memorizationStorage.loadActiveSession(),
      memorizationStorage.loadClassicalPlan(),
    ]);
    setUnits(u);
    setPrefs(p);
    setActiveSession(s);
    setClassicalPlan(c);
  }, []);

  useEffect(() => {
    void refreshFromStorage();
    return memorizationStorage.subscribe(() => {
      setUnits(memorizationStorage.readUnitsSync());
      setPrefs(memorizationStorage.readPrefsSync());
      setActiveSession(memorizationStorage.readActiveSessionSync());
      setClassicalPlan(memorizationStorage.readClassicalPlanSync());
    });
  }, [refreshFromStorage]);

  // Okuma ekranından veya Ana Sayfa'dan gelen doğrudan açılış hedefini işle
  useEffect(() => {
    if (!memorizeLaunchTarget) return;
    if (memorizeLaunchTarget.openHubTab) {
      setHubView(memorizeLaunchTarget.openHubTab);
    }
    if (!memorizeLaunchTarget.unitId) {
      clearMemorizeLaunchTarget();
      return;
    }
    const latestUnits = memorizationStorage.readUnitsSync();
    setUnits(latestUnits);
    const targetUnit = latestUnits.find((u) => u.id === memorizeLaunchTarget.unitId);
    if (targetUnit) {
      if (memorizeLaunchTarget.autoStart) {
        setDrawerUnitId(targetUnit.id);
      }
      clearMemorizeLaunchTarget();
    } else {
      void memorizationStorage.loadUnits().then((loaded) => {
        setUnits(loaded);
        const found = loaded.find((u) => u.id === memorizeLaunchTarget.unitId);
        if (found && memorizeLaunchTarget.autoStart) {
          setDrawerUnitId(found.id);
        }
        clearMemorizeLaunchTarget();
      });
    }
  }, [memorizeLaunchTarget, clearMemorizeLaunchTarget]);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId, manifest),
    [audioPrefs.arabicReciterId, manifest],
  );

  const handleChangePrefs = useCallback((patch: Partial<MemorizationPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void memorizationStorage.savePrefs(next);
      return next;
    });
  }, []);

  const handleChangeClassicalPlan = useCallback((nextPlan: ClassicalHifzPlan | null) => {
    setClassicalPlan(nextPlan);
    void memorizationStorage.saveClassicalPlan(nextPlan);
  }, []);

  const handleStartZenAdHoc = useCallback(
    (
      unit: MemorizationUnit,
      mode: ZenSessionMode,
      context: { mushafPage?: number; isTodayHam?: boolean },
    ) => {
      setPendingHamCompletePage(null);
      setZenSession({
        adHocUnit: unit,
        adHocContext: context,
        completed: false,
        snapshot: null,
        launchOptions: { mode },
      });
    },
    [],
  );

  const handleStartRabtAdHoc = useCallback((unit: MemorizationUnit) => {
    setRabtQuizUnitId(null);
    setAdHocRabtUnit(unit);
  }, []);

  const handleConfirmPendingHamComplete = useCallback(() => {
    if (!classicalPlan?.isActive || pendingHamCompletePage === null) {
      setPendingHamCompletePage(null);
      return;
    }
    const completedPage = pendingHamCompletePage;
    const nextPlan = advanceClassicalLesson(classicalPlan);
    handleChangeClassicalPlan(nextPlan);
    setPendingHamCompletePage(null);
    sfxService.play('correct');
    showToast(`Sayfa ${completedPage} Has olarak işlendi ve yeni derse geçildi.`);
  }, [classicalPlan, pendingHamCompletePage, handleChangeClassicalPlan, showToast]);

  const handleUpdateUnit = useCallback((updated: MemorizationUnit) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    void memorizationStorage.upsertUnit(updated);
  }, []);

  const handleDeleteUnit = useCallback((unitId: string) => {
    sfxService.play('click');
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    void memorizationStorage.deleteUnit(unitId);
  }, []);

  // Hazır listeden tekil ekle veya hemen başlat (mükerrer korumalı)
  const handleAddOrStartPreset = async (preset: CuratedPresetItem, startNow: boolean) => {
    sfxService.play('click');
    const existing = findMatchingUnitInPool(units, preset.ranges);
    if (existing) {
      if (startNow) {
        setDrawerUnitId(existing.id);
      } else {
        showToast(`${preset.title} zaten havuzunuzda mevcut.`);
      }
      return;
    }

    const unit = buildMemorizationUnitFromRanges(meta, {
      title: preset.title,
      subtitle: preset.subtitle,
      sourceType: 'preset',
      ranges: preset.ranges,
    });
    const next = await memorizationStorage.upsertUnit(unit);
    setUnits(next);
    if (startNow) {
      setDrawerUnitId(unit.id);
    } else {
      showToast(`${preset.title} havuza eklendi.`);
    }
  };

  // Uzun sureyi (>15 ayet) Mushaf sayfalarına veya günlük dilimlere bölerek ekle
  const handleAddSplitPreset = async (
    preset: CuratedPresetItem,
    splitBy: 'pages' | 'daily',
  ) => {
    sfxService.play('click');
    const splitUnits = buildSplitUnitsForPreset(meta, preset, splitBy, 6);
    const existingSigs = new Set(units.map((u) => getRangesSignature(u.ranges)));
    const freshUnits = splitUnits.filter((u) => !existingSigs.has(getRangesSignature(u.ranges)));

    if (freshUnits.length === 0) {
      showToast(`${preset.title} dilimleri zaten havuzunuzda mevcut.`);
      setExpandedSplitPresetId(null);
      return;
    }

    const next = await memorizationStorage.addUnitsBatch(freshUnits);
    setUnits(next);
    setExpandedSplitPresetId(null);
    showToast(`${preset.title} (${freshUnits.length} parça) havuza eklendi.`);
  };

  // Aktif kategorideki tüm eksik öğeleri tek tıkla ekle
  const handleBulkAddActiveGroup = async () => {
    sfxService.play('click');
    const groupPresets = CURATED_ASHR_PRESETS.filter((p) => p.group === activePresetGroup);
    const existingSigs = new Set(units.map((u) => getRangesSignature(u.ranges)));
    const missingPresets = groupPresets.filter(
      (p) => !existingSigs.has(getRangesSignature(p.ranges)),
    );

    if (missingPresets.length === 0) {
      showToast('Bu gruptaki tüm birimler zaten havuzunuzda mevcut.');
      return;
    }

    const newUnits = missingPresets.map((p) =>
      buildMemorizationUnitFromRanges(meta, {
        title: p.title,
        subtitle: p.subtitle,
        sourceType: 'preset',
        ranges: p.ranges,
      }),
    );
    const next = await memorizationStorage.addUnitsBatch(newUnits);
    setUnits(next);
    showToast(`${newUnits.length} birim ezber havuzunuza eklendi.`);
  };

  // JSON Yedek İndir
  const handleExportJson = async () => {
    sfxService.play('click');
    try {
      const payload = await memorizationStorage.createBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const dateStamp = new Date().toISOString().slice(0, 10);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `muallimun-ezber-yedek-${dateStamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback({
        type: 'success',
        text: `${payload.units.length} ezber birimi ve tercihleriniz JSON olarak indirildi.`,
      });
    } catch {
      setBackupFeedback({
        type: 'error',
        text: 'Yedek dosyası oluşturulurken bir hata oluştu.',
      });
    }
  };

  // JSON Yedek Yükle
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = await memorizationStorage.importBackupPayload(parsed, importMode);
      await refreshFromStorage();
      sfxService.play('correct');
      setBackupFeedback({
        type: 'success',
        text:
          importMode === 'replace'
            ? `Havuz geri yüklendi: Toplam ${result.totalUnits} birim.`
            : `${result.importedCount} yeni birim eklendi${
                result.skippedDuplicates > 0
                  ? ` (${result.skippedDuplicates} mükerrer atlandı)`
                  : ''
              }. Toplam ${result.totalUnits} birim.`,
      });
    } catch (err) {
      setBackupFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Seçilen dosya geçerli bir Muallimun ezber yedeği değil.',
      });
    }
  };

  const nowSnapshot = Date.now();

  const dueUnits = useMemo(
    () => units.filter((u) => isUnitDueForReview(u, nowSnapshot)),
    [units, nowSnapshot],
  );

  const dueAyahCount = useMemo(
    () => dueUnits.reduce((sum, u) => sum + u.verseKeys.length, 0),
    [dueUnits],
  );

  const rabtQuizUnit = useMemo(
    () =>
      adHocRabtUnit ??
      (rabtQuizUnitId ? units.find((u) => u.id === rabtQuizUnitId) ?? null : null),
    [adHocRabtUnit, rabtQuizUnitId, units],
  );

  // Hıfz Haritası'ndan bir sure seçildiğinde havuzda varsa aç, yoksa yeni sure birimi oluşturup başlat
  const handleSelectSurahFromMap = useCallback(
    async (surahNo: number) => {
      if (!meta) return;
      const surah = meta.surahs.find((s) => s.no === surahNo);
      if (!surah) return;

      const fullRange = [{ surah: surah.no, startAyah: 1, endAyah: surah.ayahCount }];
      const existingFull = findMatchingUnitInPool(units, fullRange);
      if (existingFull) {
        setDrawerUnitId(existingFull.id);
        return;
      }

      const existingPartial = units.find((u) => u.ranges.some((r) => r.surah === surahNo));
      if (existingPartial) {
        setDrawerUnitId(existingPartial.id);
        return;
      }

      const newUnit = buildMemorizationUnitFromRanges(meta, {
        title: `${surah.shortNameTr} Suresi`,
        subtitle: `${surah.no}. Sure · 1–${surah.ayahCount} · ${surah.ayahCount} Ayet`,
        sourceType: 'surah',
        ranges: fullRange,
      });
      const next = await memorizationStorage.upsertUnit(newUnit);
      setUnits(next);
      showToast(`${surah.shortNameTr} Suresi ezber havuzuna eklendi.`);
      setDrawerUnitId(newUnit.id);
    },
    [meta, units, showToast],
  );

  const stageCounts = useMemo(() => {
    const counts = { all: units.length, due: dueUnits.length, raw: 0, fresh: 0, solid: 0 };
    for (const u of units) {
      counts[u.stage] += 1;
    }
    return counts;
  }, [units, dueUnits.length]);

  const filteredUnits = useMemo(() => {
    if (stageFilter === 'all') return units;
    if (stageFilter === 'due') return dueUnits;
    return units.filter((u) => u.stage === stageFilter);
  }, [units, dueUnits, stageFilter]);

  const resumeUnit = useMemo(() => {
    if (!activeSession) return null;
    return units.find((u) => u.id === activeSession.unitId) ?? null;
  }, [activeSession, units]);

  const suggestedUnit = useMemo(() => {
    if (dueUnits.length > 0) return dueUnits[0];
    if (units.length === 0) return null;
    const sorted = [...units].sort((a, b) => (b.lastPracticedAt ?? 0) - (a.lastPracticedAt ?? 0));
    return sorted.find((u) => u.stage !== 'solid') ?? sorted[0];
  }, [units, dueUnits]);

  const drawerUnit = useMemo(
    () => (drawerUnitId ? units.find((u) => u.id === drawerUnitId) ?? null : null),
    [drawerUnitId, units],
  );

  const zenUnit = useMemo(() => {
    if (!zenSession) return null;
    if (zenSession.adHocUnit) return zenSession.adHocUnit;
    return zenSession.unitId ? units.find((u) => u.id === zenSession.unitId) ?? null : null;
  }, [zenSession, units]);

  const classicalTabBadge = useMemo(() => {
    if (!classicalPlan?.isActive) return null;
    const lesson = resolveCurrentTurnLesson(classicalPlan);
    const stats = computeClassicalStats(classicalPlan);
    if (lesson.isAllCompleted) return '%100';
    return `T${lesson.round}·C${lesson.juz} · %${stats.percent}`;
  }, [classicalPlan]);

  const activeGroupPresets = useMemo(
    () => CURATED_ASHR_PRESETS.filter((p) => p.group === activePresetGroup),
    [activePresetGroup],
  );

  const activeGroupMeta = useMemo(
    () => CURATED_PRESET_GROUPS.find((g) => g.id === activePresetGroup) ?? CURATED_PRESET_GROUPS[0],
    [activePresetGroup],
  );

  const missingCountInActiveGroup = useMemo(() => {
    const sigs = new Set(units.map((u) => getRangesSignature(u.ranges)));
    return activeGroupPresets.filter((p) => !sigs.has(getRangesSignature(p.ranges))).length;
  }, [units, activeGroupPresets]);

  return (
    <div className="max-w-5xl mx-auto space-y-3 sm:space-y-5">
      {/* Üst Başlık Şeridi */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <BookMarked className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <span>Ezber Modu</span>
          </h1>
          <p className="hidden sm:block text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {hubView === 'classical'
              ? 'Osmanlı–Diyanet usulü 30 cüz · 20 tur dönüşümlü Ham ve Has ders takip sistemi'
              : hubView === 'hifz_map'
                ? '114 surenin tamamında ezberlenen ve çalışılan bölümlerin Mushaf özeti'
                : 'Sure, aşır ve ayet seçkileriyle adım adım ezber ve aralıklı tekrar takibi'}
          </p>
        </div>

        <div className="w-full sm:w-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              openReciterSelector('memorize');
            }}
            className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer max-w-[155px] sm:max-w-[180px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <Headphones
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0"
              style={{ color: 'var(--brand-primary-text)' }}
            />
            <span className="truncate">{activeReciter.shortLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setBackupFeedback(null);
              setIsBackupModalOpen(true);
            }}
            title="Ezber havuzunu JSON olarak yedekle veya yükle"
            className="min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <ArrowUpDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
            <span>Yedekle</span>
          </button>

          {hubView !== 'classical' && (
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsCreateModalOpen(true);
              }}
              className="flex-1 sm:flex-none min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shrink-0"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Sure / Bölüm Ekle</span>
            </button>
          )}
        </div>
      </div>

      {/* Kısa Bilgi Toast Şeridi */}
      {toastMessage && (
        <div
          role="status"
          className="px-4 py-2.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            borderColor: 'var(--brand-primary)',
            color: 'var(--brand-primary-text)',
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Check className="w-4 h-4 shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Bildirimi kapat"
            className="p-1 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Ana Görünüm Geçişi: Ezber Havuzum | Klasik Hafızlık (30 Cüz) | Sure Haritası (114 Sure) */}
      <div
        className="grid grid-cols-3 sm:inline-flex items-center p-1 rounded-2xl border gap-1 w-full sm:w-auto max-w-full"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
        role="tablist"
        aria-label="Ezber Modu Görünümü"
      >
        <button
          type="button"
          role="tab"
          aria-selected={hubView === 'pool'}
          onClick={() => {
            sfxService.play('click');
            setHubView('pool');
          }}
          className="min-h-[40px] px-1.5 sm:px-3.5 rounded-xl text-[11px] sm:text-sm font-extrabold inline-flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer transition-colors whitespace-nowrap min-w-0"
          style={{
            backgroundColor: hubView === 'pool' ? 'var(--brand-primary)' : 'transparent',
            color: hubView === 'pool' ? '#FFFFFF' : 'var(--text-secondary)',
          }}
        >
          <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="sm:hidden truncate">Havuzum</span>
          <span className="hidden sm:inline">Ezber Havuzum</span>
          <span
            className="px-1 sm:px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums shrink-0"
            style={{
              backgroundColor:
                hubView === 'pool' ? 'rgba(255,255,255,0.22)' : 'var(--bg-surface-soft)',
              color: hubView === 'pool' ? '#FFFFFF' : 'var(--text-muted)',
            }}
          >
            {units.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={hubView === 'classical'}
          onClick={() => {
            sfxService.play('click');
            setHubView('classical');
          }}
          className="min-h-[40px] px-1.5 sm:px-3.5 rounded-xl text-[11px] sm:text-sm font-extrabold inline-flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer transition-colors whitespace-nowrap min-w-0"
          style={{
            backgroundColor: hubView === 'classical' ? 'var(--brand-primary)' : 'transparent',
            color: hubView === 'classical' ? '#FFFFFF' : 'var(--text-secondary)',
          }}
        >
          <Compass className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="sm:hidden truncate">Klasik</span>
          <span className="hidden sm:inline">Klasik Hafızlık (30 Cüz)</span>
          {classicalTabBadge && (
            <span
              className="hidden sm:inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums shrink-0"
              style={{
                backgroundColor:
                  hubView === 'classical' ? 'rgba(255,255,255,0.22)' : 'var(--brand-primary-soft)',
                color: hubView === 'classical' ? '#FFFFFF' : 'var(--brand-primary-text)',
              }}
            >
              {classicalTabBadge}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={hubView === 'hifz_map'}
          onClick={() => {
            sfxService.play('click');
            setHubView('hifz_map');
          }}
          className="min-h-[40px] px-1.5 sm:px-3.5 rounded-xl text-[11px] sm:text-sm font-extrabold inline-flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer transition-colors whitespace-nowrap min-w-0"
          style={{
            backgroundColor: hubView === 'hifz_map' ? 'var(--brand-primary)' : 'transparent',
            color: hubView === 'hifz_map' ? '#FFFFFF' : 'var(--text-secondary)',
          }}
        >
          <MapIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="sm:hidden truncate">Harita</span>
          <span className="hidden sm:inline">Sure Haritası (114 Sure)</span>
        </button>
      </div>

      {/* Zen Oturumu Sonrası Bugünkü Ham Dersini Has Olarak İşaretleme İsteğe Bağlı Önerisi */}
      {pendingHamCompletePage !== null &&
        classicalPlan?.isActive &&
        !classicalPlan.hasPages.includes(pendingHamCompletePage) && (
          <div
            role="region"
            aria-label="Ham dersini Has olarak işaretle"
            className="rounded-2xl border-2 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--brand-primary)',
            }}
          >
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                Bugünkü Ham dersini (Sayfa {pendingHamCompletePage}) tamamladınız
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Bu sayfayı Has olarak işaretleyip sıradaki derse geçmek ister misiniz?
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleConfirmPendingHamComplete}
                className="min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Evet, Has Olarak İşaretle ve İlerle</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setPendingHamCompletePage(null);
                }}
                className="min-h-[40px] px-3 rounded-xl border text-xs font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Şimdilik Kalsın
              </button>
            </div>
          </div>
        )}

      {hubView === 'classical' ? (
        <ClassicalHifzView
          plan={classicalPlan}
          meta={meta}
          onChangePlan={handleChangeClassicalPlan}
          onStartZenAdHoc={handleStartZenAdHoc}
          onStartRabtAdHoc={handleStartRabtAdHoc}
          onToast={showToast}
        />
      ) : hubView === 'hifz_map' && meta ? (
        <HifzMapView
          units={units}
          meta={meta}
          classicalPlan={classicalPlan}
          onSelectSurah={(surahNo) => void handleSelectSurahFromMap(surahNo)}
        />
      ) : (
        <>
          {/* Açılır–Kapanır Sure & Aşır Ezberleme Yöntemi Rehberi */}
          <MemorizationMethodGuide variant="pool" hasActiveProgress={units.length > 0} />

      {/* Bugünkü Çalışmam / Kaldığım Yer Sakin Hero Kartı */}
      {resumeUnit && activeSession ? (
        <section
          className="rounded-3xl border-2 p-5 sm:p-6 shadow-sm space-y-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--brand-primary)',
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Kaldığım Yer</span>
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold truncate">{resumeUnit.title}</h2>
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
                Adım {Math.min(activeSession.stepIndex + 1, activeSession.totalSteps)} /{' '}
                {activeSession.totalSteps} · Kaldığınız yerden huzurla devam edebilirsiniz.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  void memorizationStorage.saveActiveSession(null);
                  setActiveSession(null);
                }}
                className="min-h-[42px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Sıfırla</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setZenSession({
                    unitId: resumeUnit.id,
                    snapshot: activeSession,
                    launchOptions: activeSession.sessionMode
                      ? { mode: activeSession.sessionMode }
                      : undefined,
                  });
                }}
                className="min-h-[42px] px-5 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center gap-2 cursor-pointer shadow-sm"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Devam Et</span>
              </button>
            </div>
          </div>

          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round(((activeSession.stepIndex + 1) / Math.max(1, activeSession.totalSteps)) * 100))}%`,
                backgroundColor: 'var(--brand-primary)',
              }}
            />
          </div>
        </section>
      ) : suggestedUnit ? (
        <section className="surface-card rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isUnitDueForReview(suggestedUnit, nowSnapshot)
                  ? 'Bugün Tekrar Zamanı'
                  : 'Bugünkü Çalışmam'}
              </span>
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold truncate">{suggestedUnit.title}</h2>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              {suggestedUnit.verseKeys.length} Ayet ·{' '}
              {RETENTION_STAGE_META[suggestedUnit.stage].label}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setDrawerUnitId(suggestedUnit.id);
            }}
            className="min-h-[44px] px-5 rounded-2xl text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Çalışmaya Başla</span>
          </button>
        </section>
      ) : null}

      {/* Baskısız "Bugün Pekiştirme Tekrarı" Şeridi */}
      {dueUnits.length > 0 && (
        <section
          className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            borderColor: 'rgba(15, 118, 110, 0.3)',
          }}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <RefreshCw className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p
                className="text-xs sm:text-sm font-extrabold tabular-nums"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                Bugün Tekrar Zamanı Gelenler ({dueAyahCount} Ayet · {dueUnits.length} Birim)
              </p>
              <p className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {dueUnits
                  .slice(0, 3)
                  .map((u) => u.title)
                  .join(' · ')}
                {dueUnits.length > 3 ? ` +${dueUnits.length - 3} birim daha` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setStageFilter((prev) => (prev === 'due' ? 'all' : 'due'));
              }}
              className="min-h-[38px] px-3 rounded-xl border text-xs font-extrabold cursor-pointer"
              style={{
                backgroundColor:
                  stageFilter === 'due' ? 'var(--brand-primary)' : 'var(--bg-surface)',
                borderColor: 'var(--brand-primary)',
                color: stageFilter === 'due' ? '#FFFFFF' : 'var(--brand-primary-text)',
              }}
            >
              {stageFilter === 'due' ? 'Tümünü Göster' : 'Listeyi Filtrele'}
            </button>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setDrawerUnitId(dueUnits[0].id);
              }}
              className="min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Tekrar Seansını Başlat →</span>
            </button>
          </div>
        </section>
      )}

      {/* Kişisel Ezber Havuzu — Aşama Filtre Hapları & Birim Listesi */}
      {units.length > 0 && (
        <section className="space-y-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Tümü (${stageCounts.all})` },
                ...(dueUnits.length > 0
                  ? [{ id: 'due' as StageFilter, label: `Bugün Tekrar (${dueUnits.length})` }]
                  : []),
                { id: 'raw', label: `Yeni Ezber (${stageCounts.raw})` },
                { id: 'fresh', label: `Pekiştirme (${stageCounts.fresh})` },
                { id: 'solid', label: `Kalıcı Tekrar (${stageCounts.solid})` },
              ] as Array<{ id: StageFilter; label: string }>
            ).map((chip) => {
              const active = stageFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setStageFilter(chip.id);
                  }}
                  className="min-h-[36px] px-3 rounded-xl border text-xs font-bold cursor-pointer transition-all"
                  style={{
                    backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {filteredUnits.length === 0 ? (
            <div
              className="surface-card rounded-2xl p-6 text-center text-xs sm:text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Bu filtrede henüz ezber birimi bulunmuyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredUnits.map((u) => {
                const st = RETENTION_STAGE_META[u.stage];
                const schedule = getReviewScheduleBadge(u, nowSnapshot);
                const pageLabel =
                  u.mushafPages.length > 0
                    ? u.mushafPages.length === 1
                      ? `Sayfa ${u.mushafPages[0]}`
                      : `Sayfa ${u.mushafPages[0]}–${u.mushafPages[u.mushafPages.length - 1]}`
                    : null;

                return (
                  <article
                    key={u.id}
                    className="surface-card rounded-2xl p-4 flex flex-col justify-between gap-3.5"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-extrabold truncate">
                            {u.title}
                          </h3>
                          {u.subtitle && (
                            <p
                              className="text-xs truncate mt-0.5"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {u.subtitle}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            handleUpdateUnit(applyStageChangeWithSrs(u, NEXT_STAGE[u.stage]));
                          }}
                          title="Aşamayı değiştirmek için tıklayın"
                          className="px-2.5 py-1 rounded-lg border text-[11px] font-extrabold shrink-0 cursor-pointer"
                          style={{
                            backgroundColor: st.badgeBg,
                            borderColor: st.badgeBorder,
                            color: st.badgeColor,
                          }}
                        >
                          {st.shortLabel}
                        </button>
                      </div>

                      <div
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tabular-nums"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <span>{u.verseKeys.length} Ayet</span>
                        {pageLabel && <span>· {pageLabel}</span>}
                        {u.completedSessions > 0 && <span>· {u.completedSessions} oturum</span>}
                        {u.starredVerseKeys.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1"
                            style={{ color: 'var(--brand-accent-text)' }}
                          >
                            · <Star className="w-3 h-3 fill-current" />
                            {u.starredVerseKeys.length} zorlanılan
                          </span>
                        )}
                      </div>

                      {schedule && (
                        <div className="pt-0.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold"
                            style={{
                              backgroundColor: schedule.isDue
                                ? 'var(--brand-primary-soft)'
                                : 'var(--bg-surface-soft)',
                              color: schedule.isDue
                                ? 'var(--brand-primary-text)'
                                : 'var(--text-muted)',
                            }}
                          >
                            <CalendarClock className="w-3 h-3 shrink-0" />
                            <span>{schedule.label}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div
                      className="pt-2.5 border-t flex items-center gap-2"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <button
                        type="button"
                        onClick={() => handleDeleteUnit(u.id)}
                        title="Ezber havuzundan kaldır"
                        aria-label={`${u.title} birimini sil`}
                        className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer hover:text-red-500 transition-colors shrink-0"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {u.starredVerseKeys.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setZenSession({
                              unitId: u.id,
                              snapshot: null,
                              launchOptions: { mode: 'starred_only' },
                            });
                          }}
                          title="Sadece zorlandığım ayetleri çalış"
                          className="min-h-[40px] px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          style={{
                            backgroundColor: 'var(--brand-accent-soft)',
                            borderColor: 'rgba(217, 119, 6, 0.35)',
                            color: 'var(--brand-accent-text)',
                          }}
                        >
                          <Star className="w-3.5 h-3.5 fill-current shrink-0" />
                          <span>{u.starredVerseKeys.length}</span>
                        </button>
                      )}

                      {u.verseKeys.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setRabtQuizUnitId(u.id);
                          }}
                          title="Ayet Bağlama (Rabt) ve Fâsıla Mini Testi"
                          className="min-h-[40px] px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <Link2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Rabt Testi</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setDrawerUnitId(u.id);
                        }}
                        className="flex-1 min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Çalış</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ====================================================================
          KALICI & SADE "HAZIR EZBER LİSTELERİ & SEÇKİLER" BÖLÜMÜ (4 GRUP)
          Havuz dolu olsa bile kesinlikle kaybolmaz!
          ==================================================================== */}
      <section className="surface-card rounded-3xl overflow-hidden">
        <div
          className="px-4 py-3.5 sm:px-5 sm:py-4 border-b flex items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold flex items-center gap-2">
              <Layers className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
              <span className="truncate">Hazır Ezber Listeleri &amp; Seçkiler</span>
            </h2>
            <p className="text-[11px] sm:text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {units.length === 0
                ? 'Aşağıdaki 4 hazır koleksiyondan tek tıkla ezbere başlayabilir veya havuzunuza ekleyebilirsiniz.'
                : 'Namaz sureleri, Duhâ–Fîl arası, seçkin aşırlar ve öne çıkan ezber sureleri.'}
            </p>
          </div>

          {units.length > 0 && (
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsPresetSectionOpen((v) => !v);
              }}
              aria-expanded={isPresetSectionOpen}
              className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>{isPresetSectionOpen ? 'Daralt' : 'Göster'}</span>
              {isPresetSectionOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {(units.length === 0 || isPresetSectionOpen) && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* 4 Kategori Sekmesi + Akıllı Toplu Ekleme */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5">
                {CURATED_PRESET_GROUPS.map((group) => {
                  const count = CURATED_ASHR_PRESETS.filter((p) => p.group === group.id).length;
                  const active = activePresetGroup === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setActivePresetGroup(group.id);
                        setExpandedSplitPresetId(null);
                      }}
                      className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-[11px] sm:text-xs font-extrabold cursor-pointer transition-all text-center"
                      style={{
                        backgroundColor: active
                          ? 'var(--brand-primary)'
                          : 'var(--bg-surface-soft)',
                        borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        color: active ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="truncate">
                        {group.shortTitle} ({count})
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleBulkAddActiveGroup()}
                disabled={missingCountInActiveGroup === 0}
                className="min-h-[38px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
                style={{
                  backgroundColor:
                    missingCountInActiveGroup === 0
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                {missingCountInActiveGroup === 0 ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Tüm Grup Havuzda</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Bu Grubun Tamamını Havuza Ekle ({missingCountInActiveGroup})
                    </span>
                  </>
                )}
              </button>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{activeGroupMeta.title}:</strong>{' '}
              {activeGroupMeta.description}
            </p>

            {/* Seçili Kategori Kartları */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeGroupPresets.map((preset) => {
                const matchedUnit = findMatchingUnitInPool(units, preset.ranges);
                const pageLabel = getRangesPageLabel(meta, preset.ranges);
                const isLongSurah = preset.ranges.length === 1 && preset.estimatedAyahs > 15;
                const isSplitMenuOpen = expandedSplitPresetId === preset.id;

                return (
                  <div
                    key={preset.id}
                    className="p-3.5 rounded-2xl border flex flex-col justify-between gap-3"
                    style={{
                      backgroundColor: matchedUnit
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: matchedUnit
                        ? 'rgba(15, 118, 110, 0.32)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs sm:text-sm font-extrabold leading-snug">
                          {preset.title}
                        </h3>
                        <span
                          className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold tabular-nums shrink-0"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          {preset.estimatedAyahs} Ayet
                        </span>
                      </div>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {preset.subtitle}
                        {pageLabel ? ` · ${pageLabel}` : ''}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      {matchedUnit ? (
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setDrawerUnitId(matchedUnit.id);
                          }}
                          className="w-full min-h-[36px] px-3 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Havuzda · Çalış</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleAddOrStartPreset(preset, false)}
                            className="flex-1 min-h-[36px] px-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-strong)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span>Ekle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAddOrStartPreset(preset, true)}
                            className="flex-1 min-h-[36px] px-2.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center justify-center gap-1 cursor-pointer"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                            <span>Başla</span>
                          </button>
                        </div>
                      )}

                      {isLongSurah && (
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              sfxService.play('click');
                              setExpandedSplitPresetId((cur) =>
                                cur === preset.id ? null : preset.id,
                              );
                            }}
                            className="w-full min-h-[30px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--brand-primary-text)',
                            }}
                          >
                            <Layers className="w-3 h-3 shrink-0" />
                            <span>Sayfa / Günlük Dilimlere Bölerek Ekle</span>
                          </button>

                          {isSplitMenuOpen && (
                            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                              <button
                                type="button"
                                onClick={() => void handleAddSplitPreset(preset, 'pages')}
                                className="min-h-[32px] px-2 rounded-lg text-[11px] font-extrabold text-white cursor-pointer"
                                style={{ backgroundColor: 'var(--brand-primary)' }}
                              >
                                Sayfalara Böl
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleAddSplitPreset(preset, 'daily')}
                                className="min-h-[32px] px-2 rounded-lg border text-[11px] font-extrabold cursor-pointer"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--brand-primary)',
                                  color: 'var(--brand-primary-text)',
                                }}
                              >
                                6’şar Ayet Böl
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
        </>
      )}

      {/* ====================================================================
          JSON YEDEKLEME MODALI (DIŞA / İÇE AKTAR)
          ==================================================================== */}
      {isBackupModalOpen && (
        <div
          className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBackupModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Ezber Havuzu JSON Yedekleme"
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div
              className="px-4 py-3.5 sm:px-5 border-b flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="min-w-0">
                <h3 className="text-base font-extrabold truncate">Ezber Havuzu Yedekleme</h3>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  Birimlerinizi, aşamaları ve tekrar takvimini JSON ile saklayın
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(false)}
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

            <div className="p-4 sm:p-5 space-y-4">
              {/* Dışa Aktar */}
              <div
                className="p-3.5 rounded-2xl border space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div>
                  <p className="text-xs sm:text-sm font-extrabold">Yedeği Dışa Aktar</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Mevcut {units.length} ezber birimi, yıldızlı ayetler, tekrar takvimi ve çalışma tercihleri tarih damgalı dosya olarak indirilir.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleExportJson()}
                  className="w-full min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Yedeği İndir (.json)</span>
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
                <div>
                  <p className="text-xs sm:text-sm font-extrabold">Yedekten Geri Yükle</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Daha önce indirdiğiniz `.json` yedeğini mevcut havuzla birleştirebilir veya tamamen geri yükleyebilirsiniz.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor:
                        importMode === 'merge' ? 'var(--brand-primary)' : 'var(--bg-surface)',
                      borderColor:
                        importMode === 'merge' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: importMode === 'merge' ? '#FFFFFF' : 'var(--text-primary)',
                    }}
                  >
                    Mevcutla Birleştir
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor:
                        importMode === 'replace' ? 'var(--brand-primary)' : 'var(--bg-surface)',
                      borderColor:
                        importMode === 'replace' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: importMode === 'replace' ? '#FFFFFF' : 'var(--text-primary)',
                    }}
                  >
                    Üzerine Geri Yükle
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void handleImportFileChange(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[42px] px-4 rounded-xl border text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--brand-primary)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>Yedek Yükle (.json)</span>
                </button>
              </div>

              {backupFeedback && (
                <div
                  className="p-3 rounded-xl border text-xs font-bold"
                  style={{
                    backgroundColor:
                      backupFeedback.type === 'success'
                        ? 'var(--brand-primary-soft)'
                        : 'var(--state-danger-bg)',
                    borderColor:
                      backupFeedback.type === 'success'
                        ? 'var(--brand-primary)'
                        : 'rgba(239, 68, 68, 0.35)',
                    color:
                      backupFeedback.type === 'success'
                        ? 'var(--brand-primary-text)'
                        : 'var(--state-danger-text)',
                  }}
                >
                  {backupFeedback.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modallar & Zen Oturumu */}
      <CreatePoolModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(createdUnits, startImmediately) => {
          setUnits(memorizationStorage.readUnitsSync());
          if (startImmediately && createdUnits.length > 0) {
            setDrawerUnitId(createdUnits[0].id);
          }
        }}
      />

      <QuickStartDrawer
        isOpen={Boolean(drawerUnit)}
        unit={drawerUnit}
        prefs={prefs}
        onChangePrefs={handleChangePrefs}
        onStart={(launchOptions) => {
          if (!drawerUnit) return;
          const id = drawerUnit.id;
          setDrawerUnitId(null);
          setZenSession({
            unitId: id,
            snapshot: null,
            launchOptions: launchOptions ?? { mode: 'standard' },
          });
        }}
        onClose={() => setDrawerUnitId(null)}
      />

      <RabtQuizModal
        isOpen={Boolean(rabtQuizUnit)}
        unit={rabtQuizUnit}
        onClose={() => {
          setRabtQuizUnitId(null);
          setAdHocRabtUnit(null);
        }}
      />

      {zenUnit && (
        <ZenSessionView
          unit={zenUnit}
          prefs={prefs}
          initialSnapshot={zenSession?.snapshot ?? null}
          launchOptions={zenSession?.launchOptions}
          isAdHoc={Boolean(zenSession?.adHocUnit)}
          onChangePrefs={handleChangePrefs}
          onSessionComplete={() => {
            setZenSession((prev) => (prev ? { ...prev, completed: true } : prev));
          }}
          onUpdateUnit={(updated) => {
            if (zenSession?.adHocUnit) {
              setZenSession((prev) => (prev ? { ...prev, adHocUnit: updated } : prev));
            } else {
              handleUpdateUnit(updated);
            }
          }}
          onExit={() => {
            const completedHamPage =
              zenSession?.adHocContext?.isTodayHam &&
              zenSession.completed &&
              typeof zenSession.adHocContext.mushafPage === 'number'
                ? zenSession.adHocContext.mushafPage
                : null;
            if (
              completedHamPage !== null &&
              classicalPlan?.isActive &&
              !classicalPlan.hasPages.includes(completedHamPage)
            ) {
              setPendingHamCompletePage(completedHamPage);
            }
            setZenSession(null);
            setActiveSession(memorizationStorage.readActiveSessionSync());
          }}
        />
      )}
    </div>
  );
};
