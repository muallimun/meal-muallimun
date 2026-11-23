import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Compass,
  Edit3,
  History,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { Z_LAYERS } from '../config/zLayers';
import { useBackButtonGuard } from '../services/backStackService';
import {
  computeHatimSummary,
  getHatimJuzPageBounds,
  getHatimJuzStatuses,
  getLocalDateStamp,
  HATIM_TOTAL_PAGES,
  hatimStorage,
  resolvePageLocationForBookmark,
  type HatimGoalMode,
} from '../services/hatimStorage';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';

interface HatimPresetItem {
  id: string;
  label: string;
  sublabel: string;
  goalMode: HatimGoalMode;
  dailyPages?: number;
}

const HATIM_PRESETS: readonly HatimPresetItem[] = [
  {
    id: 'daily_20',
    label: 'Günde 20 Sayfa',
    sublabel: '30 Gün · 1 Cüz',
    goalMode: 'daily_pages',
    dailyPages: 20,
  },
  {
    id: 'daily_10',
    label: 'Günde 10 Sayfa',
    sublabel: '60 Gün · Yarım Cüz',
    goalMode: 'daily_pages',
    dailyPages: 10,
  },
  {
    id: 'daily_5',
    label: 'Günde 5 Sayfa',
    sublabel: 'Namaz Sonrası · ~4 Ay',
    goalMode: 'daily_pages',
    dailyPages: 5,
  },
  {
    id: 'daily_2',
    label: 'Günde 2 Sayfa',
    sublabel: 'Sakin Tempo · ~10 Ay',
    goalMode: 'daily_pages',
    dailyPages: 2,
  },
  {
    id: 'target_date',
    label: 'Hedef Tarih Seç',
    sublabel: 'Dinamik Günlük Hedef',
    goalMode: 'target_date',
  },
  {
    id: 'free_juz',
    label: 'Serbest Cüz Dağıtımı',
    sublabel: 'İstediğin Cüzden Oku',
    goalMode: 'free_juz',
    dailyPages: 20,
  },
];

function addDaysToStamp(days: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return getLocalDateStamp(dt);
}

function formatDateTr(input: string | Date | null | undefined): string {
  if (!input) return '—';
  const dt = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(dt.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(dt);
  } catch {
    return dt.toISOString().slice(0, 10);
  }
}

export const HatimPlannerModal: React.FC = () => {
  const {
    isHatimModalOpen,
    closeHatimModal,
    studyProgress,
    meta,
    navigateToStudy,
    moveHatimBookmark,
  } = useAppStore();

  const hatimState = useSyncExternalStore(
    hatimStorage.subscribe,
    hatimStorage.getSnapshot,
  );

  const activePlan = hatimState.activePlan;
  const history = hatimState.history;

  const existingHatimBookmark = useMemo(
    () => studyProgress.pageBookmarks.find((b) => b.isHatim) ?? null,
    [studyProgress.pageBookmarks],
  );

  const [isSetupFormOpen, setIsSetupFormOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('1. Hatim');
  const [formGoalMode, setFormGoalMode] = useState<HatimGoalMode>('daily_pages');
  const [formDailyPages, setFormDailyPages] = useState<number>(20);
  const [formTargetDate, setFormTargetDate] = useState<string>(() => addDaysToStamp(30));
  const [formStartPage, setFormStartPage] = useState<number>(1);
  const [preMarkBeforeStart, setPreMarkBeforeStart] = useState<boolean>(true);
  const [archiveNote, setArchiveNote] = useState('');
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useBackButtonGuard('hatim_planner_modal', isHatimModalOpen, closeHatimModal);

  useEffect(() => {
    if (!isHatimModalOpen) return;
    return acquireBodyScrollLock();
  }, [isHatimModalOpen]);

  // Modal açıldığında form varsayılanlarını güncelle
  useEffect(() => {
    if (!isHatimModalOpen) return;
    setConfirmAbandon(false);
    setFeedback(null);
    if (activePlan) {
      setIsSetupFormOpen(false);
      setFormTitle(activePlan.title);
      setFormGoalMode(activePlan.goalMode);
      setFormDailyPages(activePlan.dailyTargetPages);
      setFormTargetDate(activePlan.targetEndDate || addDaysToStamp(30));
      setFormStartPage(activePlan.currentPage);
    } else {
      setIsSetupFormOpen(true);
      setFormTitle(`${history.length + 1}. Hatim`);
      setFormGoalMode('daily_pages');
      setFormDailyPages(20);
      setFormTargetDate(addDaysToStamp(30));
      setFormStartPage(existingHatimBookmark?.page ?? 1);
      setPreMarkBeforeStart(true);
    }
  }, [isHatimModalOpen, activePlan, history.length, existingHatimBookmark?.page]);

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(t);
  }, [feedback]);

  const summary = useMemo(
    () => (activePlan ? computeHatimSummary(activePlan) : null),
    [activePlan],
  );

  const juzStatuses = useMemo(
    () => getHatimJuzStatuses(activePlan),
    [activePlan],
  );

  if (!isHatimModalOpen) return null;

  const syncBookmarkToPage = (pageNo: number) => {
    const loc = resolvePageLocationForBookmark(meta, pageNo);
    moveHatimBookmark(loc);
  };

  const handleSaveSetup = (e: React.FormEvent) => {
    e.preventDefault();
    sfxService.play('click');
    if (activePlan && isSetupFormOpen) {
      hatimStorage.updateActivePlan({
        title: formTitle.trim() || activePlan.title,
        goalMode: formGoalMode,
        dailyTargetPages: formDailyPages,
        targetEndDate: formGoalMode === 'target_date' ? formTargetDate : null,
      });
      setIsSetupFormOpen(false);
      setFeedback('Hatim planı ayarları güncellendi.');
      return;
    }

    const created = hatimStorage.startNewHatim({
      title: formTitle.trim() || `${history.length + 1}. Hatim`,
      goalMode: formGoalMode,
      dailyTargetPages: formDailyPages,
      targetEndDate: formGoalMode === 'target_date' ? formTargetDate : null,
      startPage: formStartPage,
      preMarkBeforeStartPage: preMarkBeforeStart,
    });
    syncBookmarkToPage(created.currentPage);
    setIsSetupFormOpen(false);
    setFeedback(`"${created.title}" başlatıldı. Hatim ayracınız Sayfa ${created.currentPage} konumuna ayarlandı.`);
  };

  const handleOpenCurrentPage = () => {
    if (!activePlan) return;
    sfxService.play('click');
    const loc = resolvePageLocationForBookmark(meta, activePlan.currentPage);
    moveHatimBookmark(loc);
    closeHatimModal();
    navigateToStudy({
      viewMode: 'mushaf',
      page: loc.page,
      surah: loc.surah,
      ayah: loc.ayah,
    });
  };

  const handleCompleteTodayQuota = () => {
    if (!activePlan) return;
    const res = hatimStorage.completeTodayQuota();
    if (!res) return;
    if (res.markedPages.length > 0) {
      sfxService.play('correct');
      syncBookmarkToPage(res.plan.currentPage);
      setFeedback(
        `${res.markedPages.length} sayfa okundu işaretlendi. Hatim ayracınız Sayfa ${res.plan.currentPage} konumuna taşındı.`,
      );
    } else if (summary && summary.remainingPages > 0) {
      sfxService.play('click');
      setFeedback('Bugünkü okuma hedefiniz zaten tamamlandı.');
    } else {
      sfxService.play('click');
      setFeedback('Tüm sayfalar tamamlanmış görünüyor.');
    }
  };

  const handleOpenJuzInMushaf = (juzNo: number) => {
    sfxService.play('click');
    const status = juzStatuses.find((j) => j.juz === juzNo);
    const targetPage = status?.firstUnreadPage ?? getHatimJuzPageBounds(juzNo).startPage;
    const loc = resolvePageLocationForBookmark(meta, targetPage);
    closeHatimModal();
    navigateToStudy({
      viewMode: 'mushaf',
      page: loc.page,
      surah: loc.surah,
      ayah: loc.ayah,
    });
  };

  const handleToggleJuz = (juzNo: number) => {
    sfxService.play('click');
    const updated = hatimStorage.toggleJuzCompleted(juzNo);
    if (updated) {
      syncBookmarkToPage(updated.currentPage);
    }
  };

  const handleArchiveHatim = (startNewAfter: boolean) => {
    if (!activePlan) return;
    sfxService.play('correct');
    const saved = hatimStorage.completeAndArchiveHatim({
      title: activePlan.title,
      note: archiveNote,
      startNewAfter,
    });
    setArchiveNote('');
    if (saved) {
      if (startNewAfter) {
        syncBookmarkToPage(1);
        setFeedback(`"${saved.title}" arşivlendi ve yeni hatim başlatıldı.`);
      } else {
        setFeedback(`"${saved.title}" tamamlanan hatimler geçmişinize kaydedildi.`);
      }
    }
  };

  const minTargetDate = getLocalDateStamp();

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hatim-planner-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeHatimModal();
      }}
    >
      <div
        className="w-full md:max-w-3xl lg:max-w-4xl max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="hatim-planner-title"
                className="text-sm sm:text-lg font-extrabold tracking-tight truncate"
              >
                30 Cüz Hatim Planlayıcısı
              </h2>
              <p className="hidden sm:block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                604 sayfalık Mushaf düzeni · Yeşil Hatim Ayracı ile çift yönlü senkron
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activePlan && (
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsSetupFormOpen((v) => !v);
                }}
                className="min-h-[36px] px-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: isSetupFormOpen
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface)',
                  borderColor: isSetupFormOpen
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: isSetupFormOpen
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-secondary)',
                }}
              >
                <Edit3 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  {isSetupFormOpen ? 'Özete Dön' : 'Planı Düzenle'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={closeHatimModal}
              aria-label="Hatim planlayıcısını kapat"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Kaydırılabilir İçerik */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] space-y-4">
          {feedback && (
            <div
              role="status"
              className="px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Check className="w-4 h-4 shrink-0" />
                <span>{feedback}</span>
              </span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label="Mesajı kapat"
                className="p-1 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Kurulum veya Düzenleme Formu */}
          {(!activePlan || isSetupFormOpen) && (
            <form
              onSubmit={handleSaveSetup}
              className="rounded-2xl border p-4 space-y-4"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    {activePlan ? 'Hatim Hedefini Düzenle' : 'Yeni Hatim Planı Oluştur'}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Günlük sayfa hedefi, bitiş tarihi veya serbest cüz usulü seçebilirsiniz.
                  </p>
                </div>
              </div>

              {/* Hatim Başlığı */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                  Hatim Başlığı
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={80}
                  placeholder="Örn: 1. Hatim veya Ramazan Hatmi"
                  className="w-full min-h-[42px] px-3 rounded-xl border text-base sm:text-sm font-bold outline-none focus:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Hazır Şablon Çipleri */}
              <div className="space-y-2">
                <span className="block text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                  Okuma Temposu / Usul
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {HATIM_PRESETS.map((preset) => {
                    const isSelected =
                      formGoalMode === preset.goalMode &&
                      (preset.goalMode !== 'daily_pages' ||
                        formDailyPages === preset.dailyPages);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setFormGoalMode(preset.goalMode);
                          if (preset.dailyPages) {
                            setFormDailyPages(preset.dailyPages);
                          }
                        }}
                        className="p-2.5 rounded-xl border text-left transition-all cursor-pointer"
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: isSelected
                            ? 'var(--brand-primary)'
                            : 'var(--border-subtle)',
                        }}
                      >
                        <p
                          className="text-xs font-extrabold truncate"
                          style={{
                            color: isSelected
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-primary)',
                          }}
                        >
                          {preset.label}
                        </p>
                        <p
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {preset.sublabel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mod Detay Alanı */}
              {formGoalMode === 'daily_pages' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs font-bold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Günlük Sayfa Hedefi (1–604)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={HATIM_TOTAL_PAGES}
                      value={formDailyPages}
                      onChange={(e) =>
                        setFormDailyPages(
                          Math.max(1, Math.min(HATIM_TOTAL_PAGES, Number(e.target.value) || 1)),
                        )
                      }
                      className="w-full min-h-[42px] px-3 rounded-xl border text-base sm:text-sm font-extrabold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <div
                    className="p-3 rounded-xl border flex flex-col justify-center"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      Tahmini Süre
                    </span>
                    <span
                      className="text-sm font-extrabold tabular-nums mt-0.5"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Yaklaşık{' '}
                      {Math.ceil(
                        Math.max(
                          1,
                          HATIM_TOTAL_PAGES -
                            (activePlan
                              ? activePlan.completedPages.length
                              : preMarkBeforeStart
                                ? Math.max(0, formStartPage - 1)
                                : 0),
                        ) / Math.max(1, formDailyPages),
                      )}{' '}
                      gün
                    </span>
                  </div>
                </div>
              )}

              {formGoalMode === 'target_date' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs font-bold"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Hedef Bitiş Tarihi
                    </label>
                    <input
                      type="date"
                      min={minTargetDate}
                      value={formTargetDate}
                      onChange={(e) => setFormTargetDate(e.target.value)}
                      required
                      className="w-full min-h-[42px] px-3 rounded-xl border text-base sm:text-sm font-bold outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                  <div
                    className="p-3 rounded-xl border flex flex-col justify-center"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      Dinamik Günlük Hedef
                    </span>
                    <span
                      className="text-xs font-semibold mt-0.5 leading-snug"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Kalan sayfalar kalan güne göre her gün otomatik hesaplanır.
                    </span>
                  </div>
                </div>
              )}

              {/* Başlangıç Konumu (Yalnızca yeni plan oluştururken) */}
              {!activePlan && (
                <div
                  className="p-3.5 rounded-xl border space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">Başlangıç Sayfası / Cüzü</span>
                    {existingHatimBookmark && (
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setFormStartPage(existingHatimBookmark.page);
                          setPreMarkBeforeStart(true);
                        }}
                        className="min-h-[30px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          borderColor: 'var(--brand-primary)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span>Mevcut Hatim Ayracım (Sayfa {existingHatimBookmark.page})</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label
                        className="block text-[11px] font-semibold"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Başlangıç Sayfası (1–604)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={HATIM_TOTAL_PAGES}
                        value={formStartPage}
                        onChange={(e) =>
                          setFormStartPage(
                            Math.max(1, Math.min(HATIM_TOTAL_PAGES, Number(e.target.value) || 1)),
                          )
                        }
                        className="w-full min-h-[40px] px-3 rounded-xl border text-base sm:text-xs font-extrabold tabular-nums outline-none focus:border-[var(--brand-primary)]"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        className="block text-[11px] font-semibold"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Cüzden Seç
                      </label>
                      <select
                        value={Math.min(30, Math.floor((Math.max(1, formStartPage) - 1) / 20) + 1)}
                        onChange={(e) => {
                          const j = Number(e.target.value);
                          setFormStartPage(getHatimJuzPageBounds(j).startPage);
                        }}
                        className="w-full min-h-[40px] px-2.5 rounded-xl border text-base sm:text-xs font-bold outline-none cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {Array.from({ length: 30 }, (_, idx) => idx + 1).map((j) => {
                          const b = getHatimJuzPageBounds(j);
                          return (
                            <option key={j} value={j}>
                              {j}. Cüz (Sayfa {b.startPage}–{b.endPage})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {formStartPage > 1 && (
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={preMarkBeforeStart}
                        onChange={(e) => setPreMarkBeforeStart(e.target.checked)}
                        className="w-4 h-4 accent-[var(--brand-primary)]"
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Sayfa 1–{formStartPage - 1} arasını okundu olarak işaretle
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {activePlan ? (
                  confirmAbandon ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          hatimStorage.abandonActivePlan();
                          setConfirmAbandon(false);
                          setFeedback('Aktif hatim planı sıfırlandı.');
                        }}
                        className="min-h-[38px] px-3 rounded-xl text-xs font-extrabold text-white bg-red-600 cursor-pointer"
                      >
                        Sıfırlamayı Onayla
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAbandon(false)}
                        className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Vazgeç
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAbandon(true)}
                      className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:bg-red-500/10"
                      style={{
                        borderColor: 'rgba(220, 38, 38, 0.3)',
                        color: '#DC2626',
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Planı Sıfırla</span>
                    </button>
                  )
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  {activePlan && (
                    <button
                      type="button"
                      onClick={() => setIsSetupFormOpen(false)}
                      className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      İptal
                    </button>
                  )}
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{activePlan ? 'Değişiklikleri Kaydet' : 'Hatim Planını Başlat'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Aktif Plan Özeti ve 30 Cüz Izgarası */}
          {activePlan && summary && !isSetupFormOpen && (
            <>
              {/* 604 Sayfa Tamamlandı Kutlaması */}
              {summary.isCompleted && (
                <section
                  className="rounded-2xl border-2 p-4 sm:p-5 space-y-3"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--brand-primary)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Award className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <h3
                        className="text-base font-extrabold"
                        style={{ color: 'var(--brand-primary-text)' }}
                      >
                        Hatim Tamamlandı — {activePlan.title}
                      </h3>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        604 sayfanın tamamı okundu olarak işaretlendi. Dilerseniz kısa bir dua veya
                        hatıra notu ekleyip tamamlanan hatimler geçmişinize kaydedebilirsiniz.
                      </p>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={archiveNote}
                    onChange={(e) => setArchiveNote(e.target.value)}
                    maxLength={300}
                    placeholder="Hatim notu / duası (isteğe bağlı)"
                    className="w-full min-h-[40px] px-3 rounded-xl border text-base sm:text-xs font-semibold outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleArchiveHatim(true)}
                      className="min-h-[40px] px-4 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Hatmi Kaydet &amp; Yeni Hatim Başlat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchiveHatim(false)}
                      className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Yalnızca Arşivle
                    </button>
                  </div>
                </section>
              )}

              {/* Bugünkü Virdim & Toplam İlerleme Kartı */}
              <section
                className="rounded-2xl border p-4 space-y-3.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-base font-extrabold truncate">{activePlan.title}</h3>
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        %{summary.percent}
                      </span>
                    </div>
                    <p
                      className="text-xs mt-0.5 tabular-nums"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {summary.completedCount} / {HATIM_TOTAL_PAGES} Sayfa ·{' '}
                      {summary.completedJuzCount} / 30 Cüz tamamlandı
                      {summary.estimatedFinishDate
                        ? ` · Tahmini bitiş: ${formatDateTr(summary.estimatedFinishDate)}`
                        : ''}
                    </p>
                  </div>

                  <div
                    className="px-2.5 py-1.5 rounded-xl border text-xs font-extrabold tabular-nums inline-flex items-center gap-1.5 shrink-0"
                    style={{
                      backgroundColor: summary.isTodayQuotaMet
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: summary.isTodayQuotaMet
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                      color: summary.isTodayQuotaMet
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-primary)',
                    }}
                  >
                    <Target className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Bugün: {summary.todayCompletedCount} / {summary.todayTargetPages} Sayfa
                    </span>
                  </div>
                </div>

                {/* İlerleme Çubuğu */}
                <div
                  className="h-2.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--border-subtle)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, summary.percent)}%`,
                      backgroundColor: 'var(--brand-primary)',
                    }}
                  />
                </div>

                {/* 2 Ana Aksiyon */}
                {!summary.isCompleted && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleOpenCurrentPage}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <BookOpen className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        Kaldığım Hatim Sayfasından Oku (Sayfa {activePlan.currentPage})
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCompleteTodayQuota}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors hover:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--brand-primary)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {summary.todayRemainingPages > 0
                          ? `Bugünkü Hedefi Okudum İşaretle (+${summary.todayRemainingPages} Sayfa)`
                          : 'Bugünkü Hedef Tamamlandı'}
                      </span>
                    </button>
                  </div>
                )}
              </section>

              {/* 30 Cüz Görsel İlerleme Izgarası */}
              <section className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                    <span>30 Cüz İlerleme Tablosu</span>
                  </h3>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Cüz kartına tıklayarak açabilir veya onay kutusuyla tamamlandı işaretleyebilirsiniz
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {juzStatuses.map((item) => {
                    const pct = Math.round((item.readCount / item.totalPages) * 100);
                    const isDone = item.status === 'completed';
                    const isCurrent = summary.currentJuz === item.juz && !summary.isCompleted;

                    return (
                      <div
                        key={item.juz}
                        className="rounded-xl border p-2.5 flex flex-col justify-between gap-2 transition-colors"
                        style={{
                          backgroundColor: isDone
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface)',
                          borderColor: isCurrent
                            ? 'var(--brand-accent)'
                            : isDone
                              ? 'var(--brand-primary)'
                              : 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenJuzInMushaf(item.juz)}
                            className="text-left min-w-0 flex-1 cursor-pointer group"
                            title={`${item.juz}. Cüzü Mushaf'ta aç (Sayfa ${item.startPage}–${item.endPage})`}
                          >
                            <p
                              className="text-xs font-extrabold group-hover:underline truncate"
                              style={{
                                color: isDone
                                  ? 'var(--brand-primary-text)'
                                  : 'var(--text-primary)',
                              }}
                            >
                              {item.juz}. Cüz
                            </p>
                            <p
                              className="text-[10px] tabular-nums"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              S.{item.startPage}–{item.endPage}
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleJuz(item.juz)}
                            aria-label={
                              isDone
                                ? `${item.juz}. Cüz tamamlandı işaretini kaldır`
                                : `${item.juz}. Cüzü tamamlandı işaretle`
                            }
                            title={
                              isDone ? 'Tamamlandı işaretini geri al' : 'Cüzü tamamlandı işaretle'
                            }
                            className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                            style={{
                              backgroundColor: isDone
                                ? 'var(--brand-primary)'
                                : 'var(--bg-surface-soft)',
                              borderColor: isDone
                                ? 'var(--brand-primary)'
                                : 'var(--border-subtle)',
                              color: isDone ? '#FFFFFF' : 'var(--text-muted)',
                            }}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold tabular-nums">
                            <span
                              style={{
                                color: isDone
                                  ? 'var(--brand-primary-text)'
                                  : item.readCount > 0
                                    ? 'var(--brand-accent-text)'
                                    : 'var(--text-muted)',
                              }}
                            >
                              {isDone ? 'Tamamlandı' : `${item.readCount}/${item.totalPages} s.`}
                            </span>
                            {isCurrent && (
                              <span style={{ color: 'var(--brand-accent-text)' }}>Aktif</span>
                            )}
                          </div>
                          <div
                            className="h-1.5 rounded-full overflow-hidden"
                            style={{ backgroundColor: 'var(--border-subtle)' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: isDone
                                  ? 'var(--brand-primary)'
                                  : 'var(--brand-accent)',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* Tamamlanan Hatimlerim Geçmişi */}
          {history.length > 0 && (
            <section
              className="rounded-2xl border p-4 space-y-2.5"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5">
                  <History className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>Tamamlanan Hatimlerim ({history.length})</span>
                </h3>
                {!activePlan && !isSetupFormOpen && (
                  <button
                    type="button"
                    onClick={() => setIsSetupFormOpen(true)}
                    className="min-h-[32px] px-2.5 rounded-lg text-xs font-extrabold text-white inline-flex items-center gap-1 cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yeni Hatim</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {history.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-xl border flex items-start justify-between gap-2.5"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-extrabold">{rec.title}</span>
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums"
                          style={{
                            backgroundColor: 'var(--brand-primary-soft)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          {rec.durationDays} gün
                        </span>
                      </div>
                      <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {formatDateTr(rec.startedAt)} — {formatDateTr(rec.completedAt)}
                      </p>
                      {rec.note && (
                        <p className="text-xs leading-relaxed pt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {rec.note}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        hatimStorage.deleteHistoryRecord(rec.id);
                      }}
                      title="Geçmiş kaydını sil"
                      aria-label="Geçmiş kaydını sil"
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer hover:bg-red-500/10"
                      style={{ color: '#DC2626' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
