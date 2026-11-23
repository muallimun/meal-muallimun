import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Compass,
  Headphones,
  Link2,
  Loader2,
  MapPin,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Z_LAYERS } from '../../config/zLayers';
import { useBackButtonGuard } from '../../services/backStackService';
import { audioQueueService } from '../../services/audioQueueService';
import { dataService } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  ClassicalHifzPlan,
  Juz30HifzMode,
  MemorizationUnit,
  ZenSessionMode,
} from '../../types/memorization';
import type { MetaData } from '../../types/quran';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import {
  advanceClassicalLesson,
  buildAdHocUnitForPages,
  computeClassicalStats,
  computePreSeededHasPages,
  createClassicalPlan,
  describeMushafPageContent,
  formatPagesCompactLabel,
  getJuzAndLocalPageForMushafPage,
  getJuzPageBounds,
  getMaxRoundForMode,
  getPageForRoundAndJuz,
  getRoundAndJuzForMushafPage,
  resolveCurrentTurnLesson,
  setActiveCursorToPage,
  togglePageHasStatus,
  TOTAL_MUSHAF_PAGES,
  undoLastClassicalLesson,
  updateClassicalPlanSettings,
} from '../../utils/classicalHifzUtils';

interface ClassicalHifzViewProps {
  plan: ClassicalHifzPlan | null;
  meta: MetaData | null;
  onChangePlan: (nextPlan: ClassicalHifzPlan | null) => void;
  onStartZenAdHoc: (
    unit: MemorizationUnit,
    mode: ZenSessionMode,
    context: { mushafPage?: number; isTodayHam?: boolean },
  ) => void;
  onStartRabtAdHoc: (unit: MemorizationUnit) => void;
  onToast: (message: string) => void;
}

type MatrixFilter = 'all' | '1_10' | '11_20' | '21_30';

const JUZ30_MODE_OPTIONS: {
  id: Juz30HifzMode;
  title: string;
  badge?: string;
  description: string;
}[] = [
  {
    id: 'short_surahs_pre_has',
    title: 'Kısa Sureler (601–604) Hazır Has',
    badge: 'Önerilen',
    description:
      'Asr–Nâs arası son 4 sayfa baştan Has sayılır; 30. cüz 600→581 arası 20 sayfada diğer cüzlerle tam eşzamanlı yürür.',
  },
  {
    id: 'juz30_pre_has',
    title: '30. Cüzün Tamamı (581–604) Hazır Has',
    description:
      'Amme cüzünün tamamı önceden ezberlenmiş sayılır; 20 turluk döngü 1–29. cüzler arasında yürür.',
  },
  {
    id: 'full_from_604',
    title: '604. Sayfadan Geriye Tam Döngü (24 Tur)',
    description:
      '30. cüzün 604. sayfasından 581. sayfasına kadar tüm 24 sayfası sırayla döngüye dahil edilir.',
  },
];

export const ClassicalHifzView: React.FC<ClassicalHifzViewProps> = ({
  plan,
  meta,
  onChangePlan,
  onStartZenAdHoc,
  onStartRabtAdHoc,
  onToast,
}) => {
  const { manifest, audioPrefs, navigateToStudy } = useAppStore();

  // Kurulum Sihirbazı yerel durumları
  const [setupStartType, setSetupStartType] = useState<'fresh' | 'midway'>('fresh');
  const [setupJuz30Mode, setSetupJuz30Mode] = useState<Juz30HifzMode>('short_surahs_pre_has');
  const [setupWeeklyDays, setSetupWeeklyDays] = useState<5 | 6 | 7>(6);
  const [setupStartRound, setSetupStartRound] = useState<number>(1);
  const [setupStartJuz, setSetupStartJuz] = useState<number>(1);

  // Aktif görünüm durumları
  const [matrixFilter, setMatrixFilter] = useState<MatrixFilter>('all');
  const [selectedPageNo, setSelectedPageNo] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [confirmResetStep, setConfirmResetStep] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  // Ayar modalı geçici seçimleri
  const [editMode, setEditMode] = useState<Juz30HifzMode>('short_surahs_pre_has');
  const [editWeeklyDays, setEditWeeklyDays] = useState<5 | 6 | 7>(6);

  useBackButtonGuard('classical_hifz_page_modal', selectedPageNo !== null, () =>
    setSelectedPageNo(null),
  );
  useBackButtonGuard('classical_hifz_settings_modal', isSettingsOpen, () => {
    setIsSettingsOpen(false);
    setConfirmResetStep(false);
  });

  useEffect(() => {
    if (selectedPageNo === null && !isSettingsOpen) return;
    return acquireBodyScrollLock();
  }, [selectedPageNo, isSettingsOpen]);

  // Kurulum sihirbazı önizleme hesapları
  const setupMaxRound = getMaxRoundForMode(setupJuz30Mode);
  const effectiveSetupRound =
    setupStartType === 'fresh' ? 1 : Math.min(setupMaxRound, Math.max(1, setupStartRound));
  const setupMaxJuz = setupJuz30Mode === 'juz30_pre_has' ? 29 : 30;
  const effectiveSetupJuz =
    setupStartType === 'fresh'
      ? 1
      : effectiveSetupRound > 20
        ? 30
        : Math.min(setupMaxJuz, Math.max(1, setupStartJuz));

  const setupPreview = useMemo(() => {
    const preHas = computePreSeededHasPages({
      juz30Mode: setupJuz30Mode,
      startRound: effectiveSetupRound,
      startJuz: effectiveSetupJuz,
    });
    const firstHam =
      getPageForRoundAndJuz(effectiveSetupRound, effectiveSetupJuz, setupJuz30Mode) ?? 20;
    const remaining = Math.max(0, TOTAL_MUSHAF_PAGES - preHas.length);
    const days =
      remaining === 0 ? 0 : Math.ceil((remaining * 7) / Math.max(1, setupWeeklyDays));
    const finishDate =
      remaining === 0
        ? null
        : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const finishLabel = finishDate
      ? new Intl.DateTimeFormat('tr-TR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(finishDate)
      : 'Tamamlandı';

    return {
      preHasCount: preHas.length,
      firstHam,
      remaining,
      finishLabel,
    };
  }, [setupJuz30Mode, effectiveSetupRound, effectiveSetupJuz, setupWeeklyDays]);

  const handleStartPlan = useCallback(() => {
    sfxService.play('success');
    const created = createClassicalPlan({
      juz30Mode: setupJuz30Mode,
      weeklyTargetDays: setupWeeklyDays,
      startRound: effectiveSetupRound,
      startJuz: effectiveSetupJuz,
    });
    onChangePlan(created);
    onToast(
      `Klasik Hafızlık takibi başlatıldı (${created.currentRound}. Tur · ${created.currentJuz}. Cüz).`,
    );
  }, [
    setupJuz30Mode,
    setupWeeklyDays,
    effectiveSetupRound,
    effectiveSetupJuz,
    onChangePlan,
    onToast,
  ]);

  const lesson = useMemo(
    () => (plan && plan.isActive ? resolveCurrentTurnLesson(plan) : null),
    [plan],
  );
  const stats = useMemo(
    () => (plan && plan.isActive ? computeClassicalStats(plan) : null),
    [plan],
  );
  const hasPageSet = useMemo(() => new Set<number>(plan?.hasPages ?? []), [plan?.hasPages]);

  const hamContent = useMemo(
    () => (lesson ? describeMushafPageContent(meta, lesson.hamPage) : null),
    [meta, lesson],
  );

  const selectedPageContent = useMemo(
    () => (selectedPageNo !== null ? describeMushafPageContent(meta, selectedPageNo) : null),
    [meta, selectedPageNo],
  );

  // Mevcut aktif turda tüm cüzlerin hedef Ham sayfaları (matriste hafif kehribar çerçeve göstermek için)
  const currentRoundTargetPages = useMemo(() => {
    if (!plan || !lesson) return new Set<number>();
    const set = new Set<number>();
    for (let j = 1; j <= 30; j += 1) {
      const p = getPageForRoundAndJuz(lesson.round, j, plan.juz30Mode);
      if (p !== null && !hasPageSet.has(p)) {
        set.add(p);
      }
    }
    return set;
  }, [plan, lesson, hasPageSet]);

  const handlePlayMushafPage = useCallback(
    async (pageNo: number) => {
      if (!meta || !manifest || isAudioLoading) return;
      sfxService.play('click');
      setIsAudioLoading(true);
      try {
        const bundle = await dataService.getPageBundle(pageNo);
        if (bundle.verses.length === 0) {
          onToast('Bu sayfa için ayet verisi bulunamadı.');
          return;
        }
        audioQueueService.startQueue({
          verses: bundle.verses,
          startIndex: 0,
          context: 'page',
          contextKey: `classical_page_${pageNo}`,
          queueTitle: `Klasik Hafızlık · Sayfa ${pageNo}`,
          manifest,
          meta,
          prefs: audioPrefs,
          modeOverride: 'ar',
        });
      } catch {
        onToast('Sayfa tilaveti başlatılamadı. İnternet bağlantınızı kontrol edin.');
      } finally {
        setIsAudioLoading(false);
      }
    },
    [meta, manifest, audioPrefs, isAudioLoading, onToast],
  );

  const handleOpenPageInMushaf = useCallback(
    (pageNo: number) => {
      sfxService.play('click');
      const info = describeMushafPageContent(meta, pageNo);
      navigateToStudy({
        viewMode: 'mushaf',
        page: pageNo,
        surah: info.firstSurah,
        ayah: info.firstAyah,
      });
    },
    [meta, navigateToStudy],
  );

  const handleLaunchHamZen = useCallback(
    (pageNo: number, isTodayHam: boolean) => {
      if (!meta) return;
      sfxService.play('click');
      const { juz, localPage } = getJuzAndLocalPageForMushafPage(pageNo);
      const info = describeMushafPageContent(meta, pageNo);
      const unit = buildAdHocUnitForPages(
        meta,
        [pageNo],
        `Sayfa ${pageNo} · ${juz}. Cüz ${localPage}. Sayfa`,
        info.ayahRangeLabel || info.surahSummary,
      );
      if (!unit) {
        onToast('Sayfa ayetleri hazırlanamadı.');
        return;
      }
      onStartZenAdHoc(unit, 'standard', { mushafPage: pageNo, isTodayHam });
    },
    [meta, onStartZenAdHoc, onToast],
  );

  const handleLaunchChainTest = useCallback(
    (kind: 'zen_self_test' | 'rabt') => {
      if (!meta || !lesson) return;
      sfxService.play('click');
      const targetPages =
        lesson.juzHasPages.length > 4 ? lesson.nearChainPages : lesson.fullLessonPages;
      const pagesLabel = formatPagesCompactLabel(targetPages);
      const unit = buildAdHocUnitForPages(
        meta,
        targetPages,
        `${lesson.juz}. Cüz · Ham + Has Bağlantısı (${pagesLabel})`,
        `${lesson.round}. Tur · ${targetPages.length} sayfa sıralı bağlantı`,
      );
      if (!unit) {
        onToast('Ders zinciri oluşturulamadı.');
        return;
      }
      if (kind === 'rabt') {
        onStartRabtAdHoc(unit);
      } else {
        onStartZenAdHoc(unit, 'self_test_ordered', {
          mushafPage: lesson.hamPage,
          isTodayHam: true,
        });
      }
    },
    [meta, lesson, onStartZenAdHoc, onStartRabtAdHoc, onToast],
  );

  const handleCompleteTodayLesson = useCallback(() => {
    if (!plan || !lesson) return;
    sfxService.play('success');
    const updated = advanceClassicalLesson(plan);
    onChangePlan(updated);
    if (updated.completedAt) {
      onToast('Elhamdülillah! Tüm 604 sayfa Has olarak tamamlandı.');
    } else {
      onToast(
        `Sayfa ${lesson.hamPage} Has'a eklendi. Sıradaki ders: ${updated.currentRound}. Tur · ${updated.currentJuz}. Cüz.`,
      );
    }
  }, [plan, lesson, onChangePlan, onToast]);

  const handleUndoLast = useCallback(() => {
    if (!plan || plan.recentLogs.length === 0) return;
    sfxService.play('click');
    const last = plan.recentLogs[0];
    const reverted = undoLastClassicalLesson(plan);
    onChangePlan(reverted);
    onToast(
      `Son ders geri alındı: Sayfa ${last.mushafPage} (${last.round}. Tur · ${last.juz}. Cüz).`,
    );
  }, [plan, onChangePlan, onToast]);

  const visibleJuzNumbers = useMemo(() => {
    if (matrixFilter === '1_10') return Array.from({ length: 10 }, (_, i) => i + 1);
    if (matrixFilter === '11_20') return Array.from({ length: 10 }, (_, i) => i + 11);
    if (matrixFilter === '21_30') return Array.from({ length: 10 }, (_, i) => i + 21);
    return Array.from({ length: 30 }, (_, i) => i + 1);
  }, [matrixFilter]);

  // ==========================================================================
  // DURUM A: KURULUM SİHİRBAZI (Plan henüz başlatılmadıysa)
  // ==========================================================================
  if (!plan || !plan.isActive || !lesson || !stats) {
    return (
      <div className="space-y-4">
        {/* Başlık ve Usul Özeti */}
        <section
          className="rounded-3xl border p-4 sm:p-6 space-y-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 max-w-2xl">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Osmanlı / Diyanet Klasik Hafızlık Usulü</span>
              </span>
              <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight">
                30 Cüz · 20 Tur Dönüşümlü Ham–Has Sistemi
              </h2>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Kur&apos;an kurslarında yüzyıllardır uygulanan bu yöntemle 604 sayfayı düzenli
                turlar hâlinde ezberleyebilir, günlük Ham ve Has derslerinizi kolayca takip
                edebilirsiniz.
              </p>
            </div>
          </div>

          {/* 3 Maddelik Yöntem Özeti */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {[
              {
                step: '1',
                title: '1. Turda Son Sayfalar (Ham)',
                desc: 'Her cüzün en son sayfası (1. cüzde s. 20, 2. cüzde s. 40…) sırayla Ham olarak ezberlenir ve 30 cüz dönülür.',
              },
              {
                step: '2',
                title: '2. Turdan İtibaren Ham + Has',
                desc: '2. tura dönüldüğünde 19. sayfa yeni Ham olur; önceki turda ezberlenen 20. sayfa artık Has (sağlam) kabul edilir.',
              },
              {
                step: '3',
                title: 'Sondan Başa Ezber, Yukarıdan Aşağı Dinletme',
                desc: 'Sayfalar cüz sonundan başa doğru alınır; derste ise Mushaf sırasıyla yukarıdan aşağıya birbirine bağlanarak okunur.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border p-3.5 space-y-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 text-white"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    {item.step}
                  </span>
                  <h3 className="text-xs sm:text-sm font-extrabold">{item.title}</h3>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Kurulum Seçenekleri */}
        <section
          className="rounded-3xl border p-4 sm:p-6 space-y-5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* 1. Başlangıç Noktası */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-extrabold">1. Başlangıç Noktanızı Seçin</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSetupStartType('fresh');
                }}
                className="text-left p-3.5 rounded-2xl border-2 transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    setupStartType === 'fresh'
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                  borderColor:
                    setupStartType === 'fresh' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-extrabold">Sıfırdan Başla</span>
                  {setupStartType === 'fresh' && (
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  1. Tur · 1. Cüz · Sayfa 20 ile ilk Ham dersten başla.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSetupStartType('midway');
                  if (setupStartRound === 1 && setupStartJuz === 1) {
                    setSetupStartRound(2);
                  }
                }}
                className="text-left p-3.5 rounded-2xl border-2 transition-colors cursor-pointer"
                style={{
                  backgroundColor:
                    setupStartType === 'midway'
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                  borderColor:
                    setupStartType === 'midway' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-extrabold">
                    Ara Seviyeden Başla (Mevcut Tur &amp; Cüz)
                  </span>
                  {setupStartType === 'midway' && (
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                  )}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Hâlihazırda hafızlık yapıyorsanız önceki turlarınız otomatik Has işaretlenir.
                </p>
              </button>
            </div>

            {setupStartType === 'midway' && (
              <div
                className="p-3.5 rounded-2xl border grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div>
                  <label
                    htmlFor="setup-round-select"
                    className="block text-xs font-bold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Aktif Tur (1–{setupMaxRound})
                  </label>
                  <select
                    id="setup-round-select"
                    value={effectiveSetupRound}
                    onChange={(e) => setSetupStartRound(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 rounded-xl border text-base sm:text-sm font-bold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {Array.from({ length: setupMaxRound }, (_, idx) => idx + 1).map((r) => (
                      <option key={r} value={r}>
                        {r}. Tur
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="setup-juz-select"
                    className="block text-xs font-bold mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Aktif Cüz ({effectiveSetupRound > 20 ? 'Yalnızca 30' : `1–${setupMaxJuz}`})
                  </label>
                  <select
                    id="setup-juz-select"
                    value={effectiveSetupJuz}
                    disabled={effectiveSetupRound > 20}
                    onChange={(e) => setSetupStartJuz(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 rounded-xl border text-base sm:text-sm font-bold cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {effectiveSetupRound > 20 ? (
                      <option value={30}>30. Cüz</option>
                    ) : (
                      Array.from({ length: setupMaxJuz }, (_, idx) => idx + 1).map((j) => (
                        <option key={j} value={j}>
                          {j}. Cüz
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div
                  className="p-2.5 rounded-xl border text-xs"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="font-bold" style={{ color: 'var(--brand-primary-text)' }}>
                    Otomatik Has: {setupPreview.preHasCount} sayfa
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    İlk Ham ders: Mushaf Sayfa {setupPreview.firstHam}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. 30. Cüz Tercihi */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-extrabold">2. 30. Cüz (24 Sayfa) Eşitleme Tercihi</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {JUZ30_MODE_OPTIONS.map((opt) => {
                const active = setupJuz30Mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setSetupJuz30Mode(opt.id);
                    }}
                    className="text-left p-3.5 rounded-2xl border-2 transition-colors cursor-pointer space-y-1.5"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-extrabold">{opt.title}</span>
                      {opt.badge && (
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                          style={{
                            backgroundColor: 'var(--brand-accent-soft)',
                            color: 'var(--brand-accent-text)',
                          }}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[11px] leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Haftalık Tempo & Özet Başlat */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="space-y-2">
              <h3 className="text-sm font-extrabold">3. Haftalık Ders Günü Temposu</h3>
              <div className="inline-flex items-center gap-1.5">
                {([5, 6, 7] as const).map((days) => {
                  const active = setupWeeklyDays === days;
                  return (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setSetupWeeklyDays(days);
                      }}
                      className="min-h-[40px] px-3.5 rounded-xl border text-xs font-extrabold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active
                          ? 'var(--brand-primary)'
                          : 'var(--bg-surface-soft)',
                        borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        color: active ? '#FFFFFF' : 'var(--text-primary)',
                      }}
                    >
                      Haftada {days} Gün
                    </button>
                  );
                })}
              </div>
              <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Kalan {setupPreview.remaining} sayfa · Tahmini bitiş:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{setupPreview.finishLabel}</strong>
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleStartPlan}
              className="min-h-[48px] px-5 py-3 rounded-2xl text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:opacity-95 transition-opacity shrink-0"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Bismillah · Hafızlık Takibini Başlat</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ==========================================================================
  // DURUM B: AKTİF KLASİK HAFIZLIK EKRANI (KÜRSÜ + 30x20 MATRİS)
  // ==========================================================================
  const nextStepButtonLabel = lesson.isAllCompleted
    ? 'Tüm 604 Sayfa Has Olarak Tamamlandı'
    : lesson.nextStep
      ? lesson.nextStep.round !== lesson.round
        ? `Bugünkü Dersi Dinlettim · Has'a Ekle ve ${lesson.nextStep.round}. Tura Geç`
        : `Bugünkü Dersi Dinlettim · Has'a Ekle ve ${lesson.nextStep.juz}. Cüze Geç`
      : "Bugünkü Dersi Dinlettim · Hıfzı Tamamla";

  const selectedPageMeta =
    selectedPageNo !== null ? getJuzAndLocalPageForMushafPage(selectedPageNo) : null;
  const selectedPageTracked =
    selectedPageNo !== null ? getRoundAndJuzForMushafPage(selectedPageNo, plan.juz30Mode) : null;
  const selectedPageIsHas = selectedPageNo !== null && hasPageSet.has(selectedPageNo);
  const selectedPageIsActiveHam = selectedPageNo !== null && selectedPageNo === lesson.hamPage;

  return (
    <div className="space-y-4">
      {/* 1. Üst İlerleme Şeridi */}
      <section
        className="rounded-3xl border p-4 sm:p-5 space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold tabular-nums"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span>
                Aktif: {lesson.round}. Tur · {lesson.juz}. Cüz
              </span>
            </span>

            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold tabular-nums"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-secondary)',
              }}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Tahmini Bitiş: {stats.estimatedFinishLabel}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {plan.recentLogs.length > 0 && (
              <button
                type="button"
                onClick={handleUndoLast}
                title="Son tamamlanan dersi geri al"
                className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Undo2 className="w-3.5 h-3.5 shrink-0" />
                <span>Son Dersi Geri Al</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setEditMode(plan.juz30Mode);
                setEditWeeklyDays(plan.weeklyTargetDays);
                setConfirmResetStep(false);
                setIsSettingsOpen(true);
              }}
              className="min-h-[38px] px-2.5 sm:px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Settings2 className="w-3.5 h-3.5 shrink-0" />
              <span>Plan Ayarları</span>
            </button>
          </div>
        </div>

        {/* Genel İlerleme Çubuğu */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              Has:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {stats.hasCount} / {TOTAL_MUSHAF_PAGES} Sayfa
              </strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                (%{stats.percent} · {lesson.round}. Turda {stats.currentRoundDone}/
                {stats.currentRoundTotal} cüz)
              </span>
            </span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
              Haftada {plan.weeklyTargetDays} gün · Kalan {stats.remainingPages} sayfa
            </span>
          </div>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            role="progressbar"
            aria-valuenow={Math.round(stats.percent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${stats.percent}%`,
                backgroundColor: 'var(--brand-primary)',
              }}
            />
          </div>
        </div>
      </section>

      {/* 2. Bugünkü Ders Kürsüsü (İkili Odak Kartı: Sol Ham + Sağ Has Zinciri) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SOL KART: BUGÜNKÜ HAM (YENİ EZBER · Kehribar Vurgulu) */}
        <div
          className="rounded-3xl border-2 p-4 sm:p-5 flex flex-col justify-between gap-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'rgba(217, 119, 6, 0.45)',
          }}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <Target className="w-3.5 h-3.5 shrink-0" />
                <span>Bugünkü Ham · Yeni Ezber</span>
              </span>
              <span
                className="text-xs font-extrabold tabular-nums"
                style={{ color: 'var(--brand-accent-text)' }}
              >
                {lesson.juz}. Cüz · {lesson.localPageInJuz}/{lesson.juzTotalPages}. Sayfa
              </span>
            </div>

            <div>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums">
                Mushaf Sayfa {lesson.hamPage}
              </h3>
              {hamContent && (
                <p className="text-xs sm:text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{hamContent.surahSummary}</strong>
                  {hamContent.ayahRangeLabel ? ` · ${hamContent.ayahRangeLabel}` : ''}
                  {hamContent.ayahCount > 0 ? ` (${hamContent.ayahCount} ayet)` : ''}
                </p>
              )}
              {lesson.isHamAlreadyHas && (
                <p
                  className="text-xs font-bold mt-1.5 inline-flex items-center gap-1"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Bu sayfa Has listesinde işaretli; dilerseniz tekrar çalışabilirsiniz.</span>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={!meta}
              onClick={() => handleLaunchHamZen(lesson.hamPage, true)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 text-center leading-snug whitespace-normal cursor-pointer shadow-xs hover:opacity-95 disabled:opacity-50 touch-manipulation"
              style={{ backgroundColor: '#D97706' }}
            >
              <Target className="w-4 h-4 shrink-0" />
              <span>Ham Sayfayı Zen Ezberde Çalış</span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleOpenPageInMushaf(lesson.hamPage)}
                className="min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 text-center leading-snug whitespace-normal cursor-pointer hover:opacity-90 touch-manipulation"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Mushaf&apos;ta Aç</span>
              </button>

              <button
                type="button"
                disabled={!meta || isAudioLoading}
                onClick={() => void handlePlayMushafPage(lesson.hamPage)}
                className="min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 text-center leading-snug whitespace-normal cursor-pointer hover:opacity-90 disabled:opacity-50 touch-manipulation"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {isAudioLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Headphones className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Sayfayı Kurrâdan Dinle</span>
              </button>
            </div>
          </div>
        </div>

        {/* SAĞ KART: BU CÜZDEKİ HAS ZİNCİRİ & DERS DİNLETME (Zümrüt Vurgulu) */}
        <div
          className="rounded-3xl border-2 p-4 sm:p-5 flex flex-col justify-between gap-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--brand-primary)',
          }}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                <span>Bu Cüzdeki Has Zinciri &amp; Dinletme</span>
              </span>
              <span
                className="text-xs font-extrabold tabular-nums"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                {lesson.juzHasPages.length} Has Sayfası
              </span>
            </div>

            {lesson.juzHasPages.length === 0 ? (
              <div
                className="p-3.5 rounded-2xl border text-xs sm:text-sm leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <strong style={{ color: 'var(--text-primary)' }}>1. Turdasınız:</strong> Bu cüzde
                henüz Has sayfası bulunmuyor. Bu tur bittiğinde bugünkü Ham sayfanız (Sayfa{' '}
                {lesson.hamPage}) 2. turda Has olarak karşınıza gelecektir.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div
                  className="p-3 rounded-2xl border space-y-1.5"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--brand-primary-text)' }}>
                    Mushaf Okuma &amp; Bağlantı Sırası (Yukarıdan Aşağıya)
                  </p>
                  <p className="text-xs sm:text-sm font-extrabold tabular-nums">
                    Sayfa {lesson.hamPage} (Ham) → {formatPagesCompactLabel(lesson.juzHasPages)}{' '}
                    (Has)
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Toplam {lesson.fullLessonPages.length} sayfalık ders zinciri (sondan başa
                    ezberlenir, yukarıdan aşağıya birbirine bağlanarak dinletilir).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!meta}
                    onClick={() => handleLaunchChainTest('zen_self_test')}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 text-center leading-snug whitespace-normal cursor-pointer hover:opacity-90 disabled:opacity-50 touch-manipulation"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--brand-primary)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Target className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {lesson.juzHasPages.length > 4
                        ? 'Ham + Yakın 4 Has Öz-Sınav'
                        : 'Ham + Has Öz-Sınav'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!meta}
                    onClick={() => handleLaunchChainTest('rabt')}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 text-center leading-snug whitespace-normal cursor-pointer hover:opacity-90 disabled:opacity-50 touch-manipulation"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Rabt Geçiş Testi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPageInMushaf(lesson.hamPage)}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 text-center leading-snug whitespace-normal cursor-pointer hover:opacity-90 touch-manipulation"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>Mushaf&apos;ta Dinlet</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={lesson.isAllCompleted}
            onClick={handleCompleteTodayLesson}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 text-center leading-snug whitespace-normal cursor-pointer shadow-xs hover:opacity-95 disabled:opacity-60 touch-manipulation"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{nextStepButtonLabel}</span>
          </button>
        </div>
      </section>

      {/* 3. Alt Bölüm: 30 Cüz × 20 Sayfa Görsel Hıfz Matrisi */}
      <section
        className="rounded-3xl border p-4 sm:p-5 space-y-3.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold">
              30 Cüz × 20 Sayfa Görsel Hıfz Matrisi
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Herhangi bir sayfa kutusuna dokunarak içeriği inceleyebilir, Zen Ezber başlatabilir
              veya Has durumunu güncelleyebilirsiniz.
            </p>
          </div>

          {/* Cüz Grubu Filtresi */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Tüm Cüzler (30)' },
                { id: '1_10', label: '1–10. Cüz' },
                { id: '11_20', label: '11–20. Cüz' },
                { id: '21_30', label: '21–30. Cüz' },
              ] as const
            ).map((f) => {
              const active = matrixFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setMatrixFilter(f.id);
                  }}
                  className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface-soft)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Renk Açıklaması */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
            Has / Sağlam
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 ring-2 ring-amber-400/50 inline-block" />
            Aktif Ham (Bugünkü Ders)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm border-2 inline-block"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                borderColor: 'rgba(217, 119, 6, 0.55)',
              }}
            />
            {lesson.round}. Turdaki Ham Hedefi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm border inline-block"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            />
            Bekleyen
          </span>
        </div>

        {/* 30 Cüz Satırları */}
        <div className="space-y-2">
          {visibleJuzNumbers.map((juzNo) => {
            const bounds = getJuzPageBounds(juzNo, plan.juz30Mode);
            const pages: number[] = [];
            let juzHasCount = 0;
            for (let p = bounds.startPage; p <= bounds.endPage; p += 1) {
              pages.push(p);
              if (hasPageSet.has(p)) juzHasCount += 1;
            }
            const isCurrentJuzRow = juzNo === lesson.juz;
            const isJuz30 = juzNo === 30;

            return (
              <div
                key={juzNo}
                className="rounded-2xl border p-2.5 sm:p-3 flex flex-col lg:flex-row lg:items-center gap-2"
                style={{
                  backgroundColor: isCurrentJuzRow
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: isCurrentJuzRow ? 'var(--brand-primary)' : 'var(--border-subtle)',
                }}
              >
                {/* Sol Cüz Etiketi */}
                <div className="flex items-center justify-between lg:w-28 shrink-0 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-extrabold tabular-nums"
                      style={{
                        color: isCurrentJuzRow
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-primary)',
                      }}
                    >
                      {juzNo}. Cüz
                    </span>
                    {isCurrentJuzRow && (
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold"
                        style={{
                          backgroundColor: 'var(--brand-primary)',
                          color: '#FFFFFF',
                        }}
                      >
                        Aktif
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {juzHasCount}/{bounds.totalPages}
                  </span>
                </div>

                {/* Sayfa Kutucukları Izgarası (360px mobilde taşmasız 10'arlı / 8'erli ızgara) */}
                <div
                  className={
                    isJuz30
                      ? 'flex-1 grid grid-cols-8 sm:grid-cols-12 lg:grid-cols-[repeat(24,minmax(0,1fr))] gap-1'
                      : 'flex-1 grid grid-cols-10 md:grid-cols-[repeat(20,minmax(0,1fr))] gap-1'
                  }
                >
                  {pages.map((mushafPage, idx) => {
                    const localNum = idx + 1;
                    const isHas = hasPageSet.has(mushafPage);
                    const isActiveHam = mushafPage === lesson.hamPage;
                    const isRoundTarget = currentRoundTargetPages.has(mushafPage);

                    return (
                      <button
                        key={mushafPage}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setSelectedPageNo(mushafPage);
                        }}
                        title={`${juzNo}. Cüz ${localNum}. Sayfa (Mushaf s. ${mushafPage}) · ${
                          isActiveHam
                            ? 'Aktif Ham'
                            : isHas
                              ? 'Has / Sağlam'
                              : isRoundTarget
                                ? `${lesson.round}. Tur Hedefi`
                                : 'Bekliyor'
                        }`}
                        aria-label={`${juzNo}. Cüz ${localNum}. Sayfa, Mushaf Sayfa ${mushafPage}`}
                        className={`min-h-[30px] sm:min-h-[28px] rounded-md text-[10px] sm:text-[11px] font-extrabold tabular-nums flex items-center justify-center transition-transform cursor-pointer hover:scale-105 touch-manipulation ${
                          isActiveHam ? 'ring-2 ring-amber-500 ring-offset-1' : ''
                        }`}
                        style={{
                          backgroundColor: isActiveHam
                            ? '#D97706'
                            : isHas
                              ? '#059669'
                              : isRoundTarget
                                ? 'var(--brand-accent-soft)'
                                : 'var(--bg-surface)',
                          color:
                            isActiveHam || isHas
                              ? '#FFFFFF'
                              : isRoundTarget
                                ? 'var(--brand-accent-text)'
                                : 'var(--text-secondary)',
                          border: isRoundTarget
                            ? '1.5px solid rgba(217, 119, 6, 0.55)'
                            : isHas || isActiveHam
                              ? '1px solid transparent'
                              : '1px solid var(--border-subtle)',
                        }}
                      >
                        {localNum}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ====================================================================
          SAYFA DETAY ÇEKMECESİ / MODALI (Matristen bir sayfaya tıklandığında)
          ==================================================================== */}
      {selectedPageNo !== null && selectedPageMeta && (
        <div
          className={`fixed inset-0 ${Z_LAYERS.MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="classical-page-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPageNo(null);
          }}
        >
          <div
            className="w-full sm:max-w-md max-h-[90dvh] rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
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
                <div className="flex items-center gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-extrabold"
                    style={{
                      backgroundColor: selectedPageIsActiveHam
                        ? 'var(--brand-accent-soft)'
                        : selectedPageIsHas
                          ? 'var(--brand-primary-soft)'
                          : 'var(--bg-surface)',
                      color: selectedPageIsActiveHam
                        ? 'var(--brand-accent-text)'
                        : selectedPageIsHas
                          ? 'var(--brand-primary-text)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {selectedPageIsActiveHam
                      ? 'Aktif Ham Sayfası'
                      : selectedPageIsHas
                        ? 'Has / Sağlam'
                        : 'Bekliyor'}
                  </span>
                  {selectedPageTracked && (
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {selectedPageTracked.round}. Tur
                    </span>
                  )}
                </div>
                <h3
                  id="classical-page-detail-title"
                  className="text-base font-extrabold mt-1 truncate"
                >
                  Mushaf Sayfa {selectedPageNo} · {selectedPageMeta.juz}. Cüz{' '}
                  {selectedPageMeta.localPage}. Sayfa
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPageNo(null)}
                aria-label="Kapat"
                className="min-w-[38px] min-h-[38px] w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] space-y-4 overflow-y-auto overscroll-contain">
              {selectedPageContent && (
                <div
                  className="p-3.5 rounded-2xl border space-y-1"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <p className="text-xs font-extrabold">{selectedPageContent.surahSummary}</p>
                  {selectedPageContent.ayahRangeLabel && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {selectedPageContent.ayahRangeLabel} ({selectedPageContent.ayahCount} ayet)
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={!meta}
                  onClick={() => {
                    const p = selectedPageNo;
                    setSelectedPageNo(null);
                    handleLaunchHamZen(p, p === lesson.hamPage);
                  }}
                  className="w-full min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Target className="w-4 h-4 shrink-0" />
                  <span>Bu Sayfada Zen Ezber Başlat</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const p = selectedPageNo;
                      setSelectedPageNo(null);
                      handleOpenPageInMushaf(p);
                    }}
                    className="min-h-[42px] px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>Mushaf&apos;ta Oku</span>
                  </button>

                  <button
                    type="button"
                    disabled={!meta || isAudioLoading}
                    onClick={() => void handlePlayMushafPage(selectedPageNo)}
                    className="min-h-[42px] px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Headphones className="w-3.5 h-3.5 shrink-0" />
                    <span>Dinle</span>
                  </button>
                </div>

                {selectedPageTracked && !selectedPageIsActiveHam && (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      const updated = setActiveCursorToPage(plan, selectedPageNo);
                      onChangePlan(updated);
                      setSelectedPageNo(null);
                      onToast(
                        `Aktif ders kürsüsü Sayfa ${selectedPageNo} (${selectedPageTracked.round}. Tur · ${selectedPageTracked.juz}. Cüz) konumuna taşındı.`,
                      );
                    }}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      borderColor: 'rgba(217, 119, 6, 0.4)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>Aktif Ders Kürsüsünü Buraya Taşı</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    const updated = togglePageHasStatus(plan, selectedPageNo);
                    onChangePlan(updated);
                    onToast(
                      selectedPageIsHas
                        ? `Sayfa ${selectedPageNo} Has listesinden çıkarıldı.`
                        : `Sayfa ${selectedPageNo} Has (Sağlam) olarak işaretlendi.`,
                    );
                  }}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: selectedPageIsHas
                      ? 'rgba(239, 68, 68, 0.4)'
                      : 'var(--brand-primary)',
                    color: selectedPageIsHas ? '#B91C1C' : 'var(--brand-primary-text)',
                  }}
                >
                  {selectedPageIsHas ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>Has İşaretini Kaldır</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Has (Sağlam) Olarak İşaretle</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          PLAN AYARLARI MODALI
          ==================================================================== */}
      {isSettingsOpen && (
        <div
          className={`fixed inset-0 ${Z_LAYERS.MODAL} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-[2px]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="classical-settings-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsSettingsOpen(false);
              setConfirmResetStep(false);
            }
          }}
        >
          <div
            className="w-full sm:max-w-lg max-h-[90dvh] rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <div
              className="px-4 py-3.5 sm:px-5 border-b flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <h3 id="classical-settings-title" className="text-base font-extrabold">
                Klasik Hafızlık Plan Ayarları
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setConfirmResetStep(false);
                }}
                aria-label="Kapat"
                className="min-w-[38px] min-h-[38px] w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] space-y-4 overflow-y-auto overscroll-contain">
              {/* 30. Cüz Modu */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold">30. Cüz Takip Usulü</label>
                <div className="space-y-1.5">
                  {JUZ30_MODE_OPTIONS.map((opt) => {
                    const active = editMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setEditMode(opt.id);
                        }}
                        className="w-full text-left p-3 rounded-xl border text-xs cursor-pointer transition-colors"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                        }}
                      >
                        <div className="font-extrabold">{opt.title}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {opt.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Haftalık Tempo */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold">Haftalık Ders Günü</label>
                <div className="grid grid-cols-3 gap-2">
                  {([5, 6, 7] as const).map((d) => {
                    const active = editWeeklyDays === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setEditWeeklyDays(d);
                        }}
                        className="min-h-[40px] rounded-xl border text-xs font-extrabold cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface-soft)',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                          color: active ? '#FFFFFF' : 'var(--text-primary)',
                        }}
                      >
                        Haftada {d} Gün
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  sfxService.play('success');
                  const updated = updateClassicalPlanSettings(plan, {
                    juz30Mode: editMode,
                    weeklyTargetDays: editWeeklyDays,
                  });
                  onChangePlan(updated);
                  setIsSettingsOpen(false);
                  onToast('Klasik hafızlık plan ayarları güncellendi.');
                }}
                className="w-full min-h-[44px] rounded-xl text-xs sm:text-sm font-extrabold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Ayarları Kaydet
              </button>

              {/* İki Aşamalı Sıfırlama */}
              <div
                className="pt-3 border-t space-y-2"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                {!confirmResetStep ? (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setConfirmResetStep(true);
                    }}
                    className="w-full min-h-[40px] rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      color: '#B91C1C',
                      backgroundColor: 'rgba(239, 68, 68, 0.06)',
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Klasik Hafızlık Planını Sıfırla ve Yeniden Kur</span>
                  </button>
                ) : (
                  <div
                    className="p-3 rounded-xl border space-y-2"
                    style={{
                      borderColor: 'rgba(239, 68, 68, 0.45)',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    }}
                  >
                    <p className="text-xs font-bold" style={{ color: '#B91C1C' }}>
                      Klasik hafızlık planınız ve Has sayfa kayıtlarınız sıfırlanacak (Ezber
                      Havuzunuz etkilenmez). Onaylıyor musunuz?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmResetStep(false)}
                        className="min-h-[38px] rounded-xl border text-xs font-bold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          onChangePlan(null);
                          setIsSettingsOpen(false);
                          setConfirmResetStep(false);
                          onToast('Klasik hafızlık planı sıfırlandı.');
                        }}
                        className="min-h-[38px] rounded-xl text-xs font-extrabold text-white cursor-pointer"
                        style={{ backgroundColor: '#DC2626' }}
                      >
                        Evet, Sıfırla
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
