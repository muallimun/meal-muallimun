import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Clock,
  Flag,
  Flame,
  History,
  Layers,
  Loader2,
  Play,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Trophy,
  Zap,
} from 'lucide-react';
import { PrintableExamModal } from '../../components/PrintableExamModal';
import { QuestionAuditManagerModal } from '../../components/QuestionAuditManagerModal';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type {
  ArenaTimeLimit,
  ExamConfig,
  ExamDifficultyFilter,
  ExamMealBasisFilter,
  ExamMode,
  ExamSessionState,
} from '../../types/quran';
import {
  formatDurationTr,
  normalizeMealBasis,
} from '../../utils/examUtils';
import { buildSurahQuestionCountMap, formatNumberTr, getSurahMap } from '../../utils/poolUtils';

interface ExamHubPageProps {
  initialSurahFilter?: number | null;
  resumableSession: ExamSessionState | null;
  isStarting: boolean;
  startError: string | null;
  onStartExam: (config: ExamConfig) => void;
  onResumeSession: () => void;
  onDiscardResumable: () => void;
}

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30, 0] as const;

const MODE_LABELS: Record<ExamMode, string> = {
  practice: 'Hızlı Antrenman',
  arena: 'Yarışma Arenası',
  mock: 'Gerçek Deneme',
};

export const ExamHubPage: React.FC<ExamHubPageProps> = ({
  initialSurahFilter = null,
  resumableSession,
  isStarting,
  startError,
  onStartExam,
  onResumeSession,
  onDiscardResumable,
}) => {
  const {
    meta,
    questionIndex,
    poolStats,
    gamification,
    questionAudit,
    setSkipReportedInExams,
    openPoolModal,
    setActiveTab,
  } = useAppStore();

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const questionCountBySurah = useMemo(
    () => buildSurahQuestionCountMap(questionIndex),
    [questionIndex],
  );

  // Scope: 'pool' veya belirli tek sure no
  const [selectedSingleSurah, setSelectedSingleSurah] = useState<number | null>(initialSurahFilter);
  const [mode, setMode] = useState<ExamMode>('practice');
  const [difficulty, setDifficulty] = useState<ExamDifficultyFilter>('all');
  const [mealBasis, setMealBasis] = useState<ExamMealBasisFilter>('all');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [prioritizeUnsolved, setPrioritizeUnsolved] = useState<boolean>(true);
  const [arenaTimePerQuestion, setArenaTimePerQuestion] = useState<ArenaTimeLimit>(45);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);

  const reportedCount = Object.keys(questionAudit.reports).length;

  useEffect(() => {
    if (initialSurahFilter !== undefined) {
      setSelectedSingleSurah(initialSurahFilter);
    }
  }, [initialSurahFilter]);

  const availableSurahs = useMemo(
    () => questionIndex?.availableSurahs ?? [],
    [questionIndex],
  );

  const poolQuestionSurahs = useMemo(() => {
    const availSet = new Set(availableSurahs);
    return poolStats.effectiveSurahs.filter((sNo) => availSet.has(sNo));
  }, [availableSurahs, poolStats.effectiveSurahs]);

  const targetSurahs = useMemo(() => {
    if (selectedSingleSurah !== null) return [selectedSingleSurah];
    if (poolQuestionSurahs.length > 0) return poolQuestionSurahs;
    return availableSurahs;
  }, [selectedSingleSurah, poolQuestionSurahs, availableSurahs]);

  // Mevcut filtrelere göre q/index.json üzerinden anlık soru adedi hesabı (hatalı işaretlenenler ayara göre atlanır)
  const { filteredIndexItems, skippedReportedCount } = useMemo(() => {
    if (!questionIndex) return { filteredIndexItems: [], skippedReportedCount: 0 };
    const surahSet = new Set(targetSurahs);
    const reportsList = Object.values(questionAudit.reports);
    const kept: typeof questionIndex.items = [];
    let skipped = 0;

    for (const item of questionIndex.items) {
      if (surahSet.size > 0 && !surahSet.has(item.surah)) continue;
      if (difficulty !== 'all' && item.difficulty !== difficulty) continue;
      if (mealBasis !== 'all' && normalizeMealBasis(item.mealBasis) !== mealBasis) continue;

      if (questionAudit.skipReportedInExams && reportsList.length > 0) {
        const isReported = Boolean(
          questionAudit.reports[`${item.surah}_${item.id}`] ||
            questionAudit.reports[item.id] ||
            reportsList.some((r) => r.id === item.id && r.surah === item.surah),
        );
        if (isReported) {
          skipped += 1;
          continue;
        }
      }

      kept.push(item);
    }

    return { filteredIndexItems: kept, skippedReportedCount: skipped };
  }, [
    questionIndex,
    targetSurahs,
    difficulty,
    mealBasis,
    questionAudit.skipReportedInExams,
    questionAudit.reports,
  ]);

  const availableFilteredCount = filteredIndexItems.length;
  const effectiveLaunchCount =
    questionCount === 0
      ? availableFilteredCount
      : Math.min(questionCount, availableFilteredCount);

  const estimatedMockMinutes = Math.max(1, Math.ceil(effectiveLaunchCount * 1.5));

  const handleLaunch = () => {
    if (availableFilteredCount === 0 || isStarting) return;
    onStartExam({
      mode,
      surahs: targetSurahs,
      difficulty,
      mealBasis,
      questionCount,
      prioritizeUnsolved,
      arenaTimePerQuestion,
    });
  };

  const formatDateTr = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* ====================================================================
          Yarım Kalan Sınav Uyarısı (sessionStorage)
          ==================================================================== */}
      {resumableSession && (
        <section
          aria-label="Yarım kalan sınav"
          className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            borderColor: 'rgba(217, 119, 6, 0.35)',
            backgroundColor: 'rgba(217, 119, 6, 0.04)',
          }}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <Play className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: 'var(--brand-accent-text)' }}>
                Yarım Kalan Sınav Tespit Edildi
              </p>
              <h3 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                {resumableSession.config.title ?? MODE_LABELS[resumableSession.config.mode]}
              </h3>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {Object.keys(resumableSession.answers).length} / {resumableSession.questions.length}{' '}
                soru yanıtlandı · Kaldığın soru: {resumableSession.currentIndex + 1}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onResumeSession}
              className="flex-1 sm:flex-initial min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Play className="w-4 h-4 shrink-0" />
              <span>Devam Et</span>
            </button>
            <button
              type="button"
              onClick={onDiscardResumable}
              aria-label="Yarım kalan sınavı sil"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* ====================================================================
          Başlık ve Hızlı Hata Kampı Kısayolu
          ==================================================================== */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5">
        <div>
          <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--brand-primary-text)' }}>
            %100 Editoryal Soru Bankası
          </p>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Yarışma &amp; Sınav Merkezi
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Kapsamını seç, modunu belirle ve meal bilgini sına.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsPrintModalOpen(true);
            }}
            className="min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <Printer className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
            <span>A4 Yazdırılabilir Sınav Hazırla</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsAuditModalOpen(true);
            }}
            className="min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
            style={{
              backgroundColor:
                reportedCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
              borderColor:
                reportedCount > 0 ? 'rgba(239, 68, 68, 0.30)' : 'var(--border-subtle)',
              color: reportedCount > 0 ? '#DC2626' : 'var(--text-secondary)',
            }}
          >
            <Flag className="w-4 h-4 shrink-0" />
            <span>
              Hata Bildirimleri{reportedCount > 0 ? ` (${formatNumberTr(reportedCount)})` : ''}
            </span>
          </button>

          {gamification.wrongQuestionIds.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('mistakes')}
              className="min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
                color: '#DC2626',
              }}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Hata Kampı ({formatNumberTr(gamification.wrongQuestionIds.length)})</span>
            </button>
          )}
        </div>
      </section>

      {/* ====================================================================
          1. Kapsam & Akıllı Filtre Kartı
          ==================================================================== */}
      <section className="surface-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">1. Kapsam ve Filtreler</h3>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {selectedSingleSurah !== null
                  ? `${surahMap.get(selectedSingleSurah)?.nameTr ?? `${selectedSingleSurah}. Sure`} · ${formatNumberTr(availableFilteredCount)} uygun soru`
                  : `${formatNumberTr(targetSurahs.length)} Sure · ${formatNumberTr(availableFilteredCount)} hazır soru`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openPoolModal}
            className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Havuzu Düzenle</span>
          </button>
        </div>

        {/* Sure Seçimi: Aktif Çalışma Havuzu veya Tek Sure */}
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
            Sınav Kapsamı
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setSelectedSingleSurah(null);
              }}
              className="min-h-[42px] px-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  selectedSingleSurah === null
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                borderColor:
                  selectedSingleSurah === null ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color:
                  selectedSingleSurah === null
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-secondary)',
              }}
            >
              <span>Aktif Çalışma Havuzum</span>
              <span className="text-xs opacity-80 tabular-nums">
                ({poolQuestionSurahs.length > 0 ? poolQuestionSurahs.length : availableSurahs.length}{' '}
                Sure)
              </span>
            </button>

            {availableSurahs.map((sNo) => {
              const sMeta = surahMap.get(sNo);
              const qCnt = questionCountBySurah.get(sNo) ?? sMeta?.questionCount ?? 0;
              const isSelected = selectedSingleSurah === sNo;

              return (
                <button
                  key={sNo}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setSelectedSingleSurah(sNo);
                  }}
                  className="min-h-[42px] px-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface)',
                    borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: isSelected ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                  }}
                >
                  <span>{sMeta?.shortNameTr ?? `${sNo}. Sure`}</span>
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ({qCnt})
                  </span>
                </button>
              );
            })}
          </div>
          {selectedSingleSurah === null && poolQuestionSurahs.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--brand-accent-text)' }}>
              Aktif havuzundaki surelerde henüz soru bulunmadığı için soru bankasındaki tüm sureler
              otomatik olarak kapsama alındı.
            </p>
          )}
        </div>

        {/* Zorluk + Meal Esası + Henüz Çözmediğim Sorulara Öncelik Ver */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          {/* Zorluk Seviyesi */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold block" style={{ color: 'var(--text-secondary)' }}>
              Zorluk Seviyesi
            </span>
            <div
              className="grid grid-cols-4 gap-1 p-1 rounded-xl"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {(
                [
                  { id: 'all', label: 'Tümü' },
                  { id: 1, label: 'Kolay' },
                  { id: 2, label: 'Orta' },
                  { id: 3, label: 'Zor' },
                ] as { id: ExamDifficultyFilter; label: string }[]
              ).map((item) => {
                const active = difficulty === item.id;
                return (
                  <button
                    key={String(item.id)}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setDifficulty(item.id);
                    }}
                    className="min-h-[36px] rounded-lg text-xs font-bold transition-all cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meal Esası */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold block" style={{ color: 'var(--text-secondary)' }}>
              Meal Esası
            </span>
            <div
              className="grid grid-cols-4 gap-1 p-1 rounded-xl"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {(
                [
                  { id: 'all', label: 'Tümü' },
                  { id: 'tdv', label: 'TDV' },
                  { id: 'dib', label: 'DİB' },
                  { id: 'common', label: 'Ortak' },
                ] as { id: ExamMealBasisFilter; label: string }[]
              ).map((item) => {
                const active = mealBasis === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setMealBasis(item.id);
                    }}
                    className="min-h-[36px] rounded-lg text-xs font-bold transition-all cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Henüz Çözmediğim Sorulara Öncelik Ver */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold block" style={{ color: 'var(--text-secondary)' }}>
              Akıllı Soru Seçimi
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={prioritizeUnsolved}
              onClick={() => {
                sfxService.play('click');
                setPrioritizeUnsolved((prev) => !prev);
              }}
              className="w-full min-h-[44px] px-3.5 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
              style={{
                backgroundColor: prioritizeUnsolved
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: prioritizeUnsolved
                  ? 'var(--brand-primary)'
                  : 'var(--border-subtle)',
              }}
            >
              <span
                className="text-xs font-bold leading-snug"
                style={{
                  color: prioritizeUnsolved ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                }}
              >
                Henüz çözmediklerime öncelik ver
              </span>
              <span
                className="w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
                style={{
                  backgroundColor: prioritizeUnsolved
                    ? 'var(--brand-primary)'
                    : 'var(--border-strong)',
                  justifyContent: prioritizeUnsolved ? 'flex-end' : 'flex-start',
                }}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </span>
            </button>
          </div>
        </div>

        {/* Hatalı İşaretli Soru Denetim Şeridi */}
        {reportedCount > 0 && (
          <div
            className="rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.06)',
              borderColor: 'rgba(239, 68, 68, 0.22)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Flag className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {questionAudit.skipReportedInExams
                  ? `${formatNumberTr(reportedCount)} hatalı işaretli soru sınavlarda otomatik atlanıyor${
                      skippedReportedCount > 0
                        ? ` (bu kapsamda ${formatNumberTr(skippedReportedCount)} soru)`
                        : ''
                    }.`
                  : `${formatNumberTr(reportedCount)} hatalı işaretli soru mevcut (otomatik atlama kapalı).`}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSkipReportedInExams(!questionAudit.skipReportedInExams);
                }}
                className="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {questionAudit.skipReportedInExams ? 'Atlamayı Kapat' : 'Otomatik Atla'}
              </button>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setIsAuditModalOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer text-white"
                style={{ backgroundColor: '#DC2626' }}
              >
                Raporu Yönet
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ====================================================================
          2. 3 Sınav Modu Kartı
          ==================================================================== */}
      <section aria-label="Sınav modu seçimi" className="space-y-3">
        <h3 className="text-base font-extrabold tracking-tight">2. Sınav Modunu Seç</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Mod 1: Hızlı Antrenman */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              sfxService.play('click');
              setMode('practice');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                sfxService.play('click');
                setMode('practice');
              }
            }}
            className="surface-card rounded-2xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between border-2"
            style={{
              borderColor: mode === 'practice' ? 'var(--brand-primary)' : 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Zap className="w-5 h-5" />
                </div>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                  style={{
                    backgroundColor:
                      mode === 'practice' ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                    color: mode === 'practice' ? '#FFFFFF' : 'var(--text-muted)',
                  }}
                >
                  {mode === 'practice' ? 'Seçili' : 'Süresiz'}
                </span>
              </div>

              <h4 className="text-base font-extrabold mb-1.5">Hızlı Antrenman</h4>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Süre baskısı olmadan öğren. Her sorudan sonra anında doğru cevabı, çözüm
                açıklamasını ve ilgili ayet mealini incele.
              </p>
            </div>

            <p
              className="mt-4 pt-3 border-t text-[11px] font-semibold"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              Anında dönüt · İlgili ayet çekmecesi
            </p>
          </div>

          {/* Mod 2: Yarışma Arenası */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              sfxService.play('click');
              setMode('arena');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                sfxService.play('click');
                setMode('arena');
              }
            }}
            className="surface-card rounded-2xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between border-2"
            style={{
              borderColor: mode === 'arena' ? 'var(--brand-accent)' : 'var(--border-subtle)',
            }}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--brand-accent-soft)',
                    color: 'var(--brand-accent-text)',
                  }}
                >
                  <Flame className="w-5 h-5" />
                </div>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                  style={{
                    backgroundColor:
                      mode === 'arena' ? 'var(--brand-accent)' : 'var(--bg-surface-soft)',
                    color: mode === 'arena' ? '#FFFFFF' : 'var(--text-muted)',
                  }}
                >
                  {mode === 'arena' ? 'Seçili' : '3 Can · 3 Joker'}
                </span>
              </div>

              <h4 className="text-base font-extrabold mb-1.5">Yarışma Arenası</h4>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                3 can, seri çarpanı ve 3 akıllı joker (%50 Ele, Ayet İpucu, +30sn Ek Süre) ile
                heyecanlı bilgi yarışması deneyimi.
              </p>
            </div>

            {/* Soru Başı Süre Seçimi */}
            <div
              className="mt-4 pt-3 border-t flex items-center justify-between gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Soru başı süre:
              </span>
              <div className="flex items-center gap-1">
                {([45, 60] as ArenaTimeLimit[]).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setMode('arena');
                      setArenaTimePerQuestion(sec);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                    style={{
                      backgroundColor:
                        arenaTimePerQuestion === sec
                          ? 'var(--brand-accent-soft)'
                          : 'var(--bg-surface-soft)',
                      color:
                        arenaTimePerQuestion === sec
                          ? 'var(--brand-accent-text)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {sec} sn
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mod 3: Gerçek Deneme Sınavı */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              sfxService.play('click');
              setMode('mock');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                sfxService.play('click');
                setMode('mock');
              }
            }}
            className="surface-card rounded-2xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between border-2"
            style={{
              borderColor: mode === 'mock' ? 'var(--brand-primary)' : 'var(--border-subtle)',
            }}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                  style={{
                    backgroundColor:
                      mode === 'mock' ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                    color: mode === 'mock' ? '#FFFFFF' : 'var(--text-muted)',
                  }}
                >
                  {mode === 'mock' ? 'Seçili' : 'Deneme'}
                </span>
              </div>

              <h4 className="text-base font-extrabold mb-1.5">Gerçek Deneme Sınavı</h4>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Toplam süre sayacı, ileri-geri soru gezgini, boş bırakma ve şüpheli işaretleme ile
                gerçek sınav atmosferi. Sonuçlar bitimde açılır.
              </p>
            </div>

            <p
              className="mt-4 pt-3 border-t text-[11px] font-semibold tabular-nums"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              Süre: ~{estimatedMockMinutes} dk ({effectiveLaunchCount} soru × 1.5 dk)
            </p>
          </div>
        </div>
      </section>

      {/* ====================================================================
          3. Soru Sayısı ve Başlat Çubuğu
          ==================================================================== */}
      <section className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold tracking-tight">3. Soru Sayısı</h3>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
              (Uygun havuz: {formatNumberTr(availableFilteredCount)} soru)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUESTION_COUNT_OPTIONS.map((cnt) => {
              const isAll = cnt === 0;
              const disabled = !isAll && cnt > availableFilteredCount;
              const active = questionCount === cnt;

              return (
                <button
                  key={cnt}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    sfxService.play('click');
                    setQuestionCount(cnt);
                  }}
                  className="min-h-[44px] min-w-[58px] px-4 rounded-xl border text-sm font-extrabold tabular-nums transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? '#FFFFFF' : 'var(--text-primary)',
                  }}
                >
                  {isAll ? `Tümü (${availableFilteredCount})` : cnt}
                </button>
              );
            })}
          </div>

          {startError && (
            <p className="text-xs font-semibold" style={{ color: '#EF4444' }}>
              {startError}
            </p>
          )}
          {availableFilteredCount === 0 && (
            <p className="text-xs font-semibold" style={{ color: 'var(--brand-accent-text)' }}>
              Seçili filtrelerle eşleşen soru bulunamadı. Zorluk veya meal esası filtresini
              &ldquo;Tümü&rdquo; yapmayı deneyin.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={availableFilteredCount === 0 || isStarting}
          onClick={handleLaunch}
          className="min-h-[54px] px-7 rounded-2xl text-sm sm:text-base font-extrabold text-white flex items-center justify-center gap-2.5 shrink-0 transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {isStarting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <span>Sorular Hazırlanıyor...</span>
            </>
          ) : (
            <>
              <Trophy className="w-5 h-5 shrink-0" />
              <span>
                {MODE_LABELS[mode]} Başlat ({effectiveLaunchCount} Soru)
              </span>
              <ArrowRight className="w-5 h-5 shrink-0" />
            </>
          )}
        </button>
      </section>

      {/* ====================================================================
          4. Son Sınavlarım Özeti (examHistory)
          ==================================================================== */}
      <section className="surface-card rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5" style={{ color: 'var(--brand-primary-text)' }} />
            <h3 className="text-base font-extrabold tracking-tight">Son Sınavlarım</h3>
          </div>
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
            Son {Math.min(gamification.examHistory.length, 25)} kayıt
          </span>
        </div>

        {gamification.examHistory.length === 0 ? (
          <div
            className="rounded-xl p-5 text-center border border-dashed"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <Sparkles
              className="w-6 h-6 mx-auto mb-2"
              style={{ color: 'var(--brand-primary-text)' }}
            />
            <p className="text-sm font-bold mb-1">Henüz tamamlanmış sınav kaydın yok</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              İlk sınavını tamamladığında başarı oranın, puanın ve gelişim geçmişin burada
              görünecek.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {gamification.examHistory.slice(0, 8).map((item) => {
              const surahSummary =
                item.surahs.length === 1
                  ? surahMap.get(item.surahs[0])?.nameTr ?? `${item.surahs[0]}. Sure`
                  : item.surahs.length > 1
                    ? `${item.surahs.length} Sure`
                    : 'Karma Havuz';

              const scoreColor =
                item.scorePct >= 80
                  ? '#10B981'
                  : item.scorePct >= 50
                    ? '#D97706'
                    : '#EF4444';

              return (
                <div
                  key={item.id}
                  className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold">
                        {item.isMistakeCamp ? 'Hata Kampı Telafi' : MODE_LABELS[item.mode]}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        · {surahSummary}
                      </span>
                    </div>
                    <p
                      className="text-xs tabular-nums mt-0.5 flex flex-wrap items-center gap-x-2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>{formatDateTr(item.date)}</span>
                      <span>·</span>
                      <span>
                        {item.correct}D / {item.wrong}Y{item.blank > 0 ? ` / ${item.blank}B` : ''}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDurationTr(item.durationSec)}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className="text-xs font-bold tabular-nums px-2.5 py-1 rounded-lg"
                      style={{
                        backgroundColor: 'var(--brand-primary-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      +{formatNumberTr(item.earnedXp)} XP
                    </span>
                    <span
                      className="text-sm font-extrabold tabular-nums min-w-[46px] text-right"
                      style={{ color: scoreColor }}
                    >
                      %{item.scorePct}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Çalışmaya dönmek isteyenler için ufak not */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => setActiveTab('reader')}
          className="text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Sınav öncesi surelerin mealine göz atmak ister misin?</span>
        </button>
      </div>

      {/* A4 Yazdırılabilir Sınav Kâğıdı ve Cevap Anahtarı Penceresi */}
      <PrintableExamModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        initialSurahNo={selectedSingleSurah}
      />

      {/* Hatalı İşaretlenen Sorular & JSON Denetim Raporu Penceresi */}
      <QuestionAuditManagerModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />
    </div>
  );
};
