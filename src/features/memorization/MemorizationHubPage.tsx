import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Clock,
  Headphones,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { findReciterById } from '../../config/recitersConfig';
import {
  buildMemorizationUnitFromRanges,
  CURATED_ASHR_PRESETS,
} from '../../data/curatedAshrPresets';
import { memorizationStorage } from '../../services/memorizationStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  ActiveSessionSnapshot,
  MemorizationPrefs,
  MemorizationUnit,
  RetentionStage,
} from '../../types/memorization';
import { RETENTION_STAGE_META } from '../../types/memorization';
import { CreatePoolModal } from './CreatePoolModal';
import { QuickStartDrawer } from './QuickStartDrawer';
import { ZenSessionView } from './ZenSessionView';

type StageFilter = 'all' | RetentionStage;

const NEXT_STAGE: Record<RetentionStage, RetentionStage> = {
  raw: 'fresh',
  fresh: 'solid',
  solid: 'raw',
};

const QUICK_STARTER_IDS = [
  'preset_ayetel_kursi',
  'preset_amenerrasulu',
  'preset_surah_mulk',
  'preset_s112',
];

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

  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [drawerUnitId, setDrawerUnitId] = useState<string | null>(null);
  const [zenSession, setZenSession] = useState<{
    unitId: string;
    snapshot: ActiveSessionSnapshot | null;
  } | null>(null);

  const refreshFromStorage = useCallback(async () => {
    const [u, p, s] = await Promise.all([
      memorizationStorage.loadUnits(),
      memorizationStorage.loadPrefs(),
      memorizationStorage.loadActiveSession(),
    ]);
    setUnits(u);
    setPrefs(p);
    setActiveSession(s);
  }, []);

  useEffect(() => {
    void refreshFromStorage();
    return memorizationStorage.subscribe(() => {
      setUnits(memorizationStorage.readUnitsSync());
      setPrefs(memorizationStorage.readPrefsSync());
      setActiveSession(memorizationStorage.readActiveSessionSync());
    });
  }, [refreshFromStorage]);

  // Okuma ekranındaki "Buradan Ezber Başlat" akışından gelen doğrudan açılış hedefini işle
  useEffect(() => {
    if (!memorizeLaunchTarget) return;
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

  const handleUpdateUnit = useCallback((updated: MemorizationUnit) => {
    setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    void memorizationStorage.upsertUnit(updated);
  }, []);

  const handleDeleteUnit = useCallback((unitId: string) => {
    sfxService.play('click');
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    void memorizationStorage.deleteUnit(unitId);
  }, []);

  const handleQuickAddPreset = async (presetId: string) => {
    const preset = CURATED_ASHR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    sfxService.play('click');
    const unit = buildMemorizationUnitFromRanges(meta, {
      title: preset.title,
      subtitle: preset.subtitle,
      sourceType: 'preset',
      ranges: preset.ranges,
    });
    const next = await memorizationStorage.upsertUnit(unit);
    setUnits(next);
    setDrawerUnitId(unit.id);
  };

  const stageCounts = useMemo(() => {
    const counts = { all: units.length, raw: 0, fresh: 0, solid: 0 };
    for (const u of units) {
      counts[u.stage] += 1;
    }
    return counts;
  }, [units]);

  const filteredUnits = useMemo(() => {
    if (stageFilter === 'all') return units;
    return units.filter((u) => u.stage === stageFilter);
  }, [units, stageFilter]);

  const resumeUnit = useMemo(() => {
    if (!activeSession) return null;
    return units.find((u) => u.id === activeSession.unitId) ?? null;
  }, [activeSession, units]);

  const suggestedUnit = useMemo(() => {
    if (units.length === 0) return null;
    const sorted = [...units].sort((a, b) => (b.lastPracticedAt ?? 0) - (a.lastPracticedAt ?? 0));
    return sorted.find((u) => u.stage !== 'solid') ?? sorted[0];
  }, [units]);

  const drawerUnit = useMemo(
    () => (drawerUnitId ? units.find((u) => u.id === drawerUnitId) ?? null : null),
    [drawerUnitId, units],
  );

  const zenUnit = useMemo(
    () => (zenSession ? units.find((u) => u.id === zenSession.unitId) ?? null : null),
    [zenSession, units],
  );

  const quickStarterPresets = useMemo(
    () => CURATED_ASHR_PRESETS.filter((p) => QUICK_STARTER_IDS.includes(p.id)),
    [],
  );

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Üst Başlık Şeridi */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <BookMarked className="w-6 h-6 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <span>Ezber Modu</span>
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Sakin, tekrar odaklı ve kümeli Kar Topu yöntemiyle Kur’an ezber çalışma alanı
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              openReciterSelector('memorize');
            }}
            className="min-h-[42px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer max-w-[180px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <Headphones
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--brand-primary-text)' }}
            />
            <span className="truncate">{activeReciter.shortLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsCreateModalOpen(true);
            }}
            className="min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Yeni Ezber Ekle</span>
          </button>
        </div>
      </div>

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
                  setZenSession({ unitId: resumeUnit.id, snapshot: activeSession });
                }}
                className="min-h-[42px] px-5 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center gap-2 cursor-pointer shadow-sm"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Devam Et</span>
              </button>
            </div>
          </div>

          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-soft)' }}>
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
        <section
          className="surface-card rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1 min-w-0">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Bugünkü Çalışmam</span>
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
      ) : (
        /* Boş Havuz: Sıcak ve Davetkâr Başlangıç Kartı */
        <section className="surface-card rounded-3xl p-6 sm:p-8 text-center space-y-5">
          <div
            className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <BookMarked className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg sm:text-xl font-extrabold">İlk Ezber Biriminizi Seçin</h2>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              Aşağıdaki seçkin pasajlardan biriyle hemen başlayabilir veya dilediğiniz sayfa, sure ya da ayet aralığını havuzunuza ekleyebilirsiniz.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {quickStarterPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void handleQuickAddPreset(p.id)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer transition-all hover:border-[var(--brand-primary)]"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                + {p.title}
              </button>
            ))}
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsCreateModalOpen(true);
              }}
              className="min-h-[44px] px-6 rounded-2xl text-sm font-extrabold text-white inline-flex items-center gap-2 cursor-pointer shadow-sm"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Plus className="w-4 h-4" />
              <span>Tüm Seçkiler, Sayfa &amp; Surelerden Ekle</span>
            </button>
          </div>
        </section>
      )}

      {/* Aşama Filtre Hapları & Birim Listesi */}
      {units.length > 0 && (
        <section className="space-y-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Tümü (${stageCounts.all})` },
                { id: 'raw', label: `Ham · Çalışılıyor (${stageCounts.raw})` },
                { id: 'fresh', label: `Taze · Pekiştir (${stageCounts.fresh})` },
                { id: 'solid', label: `Sağlam (${stageCounts.solid})` },
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
            <div className="surface-card rounded-2xl p-6 text-center text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              Bu aşamada henüz ezber birimi bulunmuyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredUnits.map((u) => {
                const st = RETENTION_STAGE_META[u.stage];
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
                            handleUpdateUnit({ ...u, stage: NEXT_STAGE[u.stage] });
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
                        className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tabular-nums"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <span>{u.verseKeys.length} Ayet</span>
                        {pageLabel && <span>· {pageLabel}</span>}
                        {u.completedSessions > 0 && (
                          <span>· {u.completedSessions} oturum</span>
                        )}
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
                    </div>

                    <div
                      className="pt-2.5 border-t flex items-center justify-between gap-2"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <button
                        type="button"
                        onClick={() => handleDeleteUnit(u.id)}
                        title="Ezber havuzundan kaldır"
                        aria-label={`${u.title} birimini sil`}
                        className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer hover:text-red-500 transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

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
        onStart={() => {
          if (!drawerUnit) return;
          const id = drawerUnit.id;
          setDrawerUnitId(null);
          setZenSession({ unitId: id, snapshot: null });
        }}
        onClose={() => setDrawerUnitId(null)}
      />

      {zenUnit && (
        <ZenSessionView
          unit={zenUnit}
          prefs={prefs}
          initialSnapshot={zenSession?.snapshot ?? null}
          onChangePrefs={handleChangePrefs}
          onUpdateUnit={handleUpdateUnit}
          onExit={() => {
            setZenSession(null);
            setActiveSession(memorizationStorage.readActiveSessionSync());
          }}
        />
      )}
    </div>
  );
};
