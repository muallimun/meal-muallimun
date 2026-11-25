import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Clock,
  Flag,
  Flame,
  History,
  Layers,
  ListOrdered,
  Loader2,
  Play,
  Printer,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { QuestionAuditManagerModal } from '../../components/QuestionAuditManagerModal';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const PrintableExamModal = lazyWithRetry(() =>
  import('../../components/PrintableExamModal').then((m) => ({ default: m.PrintableExamModal })),
);
import type {
  ArenaTimeLimit,
  ExamConfig,
  ExamDifficultyFilter,
  ExamMode,
  ExamQuestionOrder,
  ExamSessionState,
} from '../../types/quran';
import { formatDurationTr } from '../../utils/examUtils';
import { buildSurahQuestionCountMap, formatNumberTr, getSurahMap } from '../../utils/poolUtils';
import { normalizeTurkish } from '../../utils/textNormalize';

interface ExamHubPageProps {
  initialSurahFilter?: number | null;
  resumableSession: ExamSessionState | null;
  isStarting: boolean;
  startError: string | null;
  onStartExam: (config: ExamConfig) => void;
  onResumeSession: () => void;
  onDiscardResumable: () => void;
}

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30, 50, 0] as const;

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
    questionIndexError,
    retryLoadQuestionIndex,
    poolStats,
    gamification,
    questionAudit,
    setSkipReportedInExams,
    openPoolModal,
    navigateToStudy,
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
  const [questionOrder, setQuestionOrder] = useState<ExamQuestionOrder>('mushaf');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [prioritizeUnsolved, setPrioritizeUnsolved] = useState<boolean>(true);
  const [arenaTimePerQuestion, setArenaTimePerQuestion] = useState<ArenaTimeLimit>(45);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [surahSearch, setSurahSearch] = useState<string>('');
  const [isRetryingIndex, setIsRetryingIndex] = useState<boolean>(false);

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

  const filteredAvailableSurahs = useMemo(() => {
    const norm = normalizeTurkish(surahSearch);
    if (!norm) return availableSurahs;
    return availableSurahs.filter((sNo) => {
      const sMeta = surahMap.get(sNo);
      const hay = normalizeTurkish(`${sNo} ${sMeta?.nameTr ?? ''} ${sMeta?.shortNameTr ?? ''}`);
      return hay.includes(norm);
    });
  }, [availableSurahs, surahSearch, surahMap]);

  const poolQuestionSurahs = useMemo(() => {
    const availSet = new Set(availableSurahs);
    return poolStats.effectiveSurahs.filter((sNo) => availSet.has(sNo));
  }, [availableSurahs, poolStats.effectiveSurahs]);

  const targetSurahs = useMemo(() => {
    if (selectedSingleSurah !== null) return [selectedSingleSurah];
    if (poolQuestionSurahs.length > 0) return poolQuestionSurahs;
    return availableSurahs;
  }, [selectedSingleSurah, poolQuestionSurahs, availableSurahs]);

  // Mevcut filtrelere göre q/index.json üzerinden anlık soru adedi ve zorluk dağılımı hesabı
  const { filteredIndexItems, skippedReportedCount, scopeDifficultyBreakdown } = useMemo(() => {
    if (!questionIndex) {
      return {
        filteredIndexItems: [],
        skippedReportedCount: 0,
        scopeDifficultyBreakdown: { total: 0, easy: 0, medium: 0, hard: 0 },
      };
    }
    const surahSet = new Set(targetSurahs);
    const reportsList = Object.values(questionAudit.reports);
    const kept: typeof questionIndex.items = [];
    let skipped = 0;
    let easy = 0;
    let medium = 0;
    let hard = 0;

    for (const item of questionIndex.items) {
      if (surahSet.size > 0 && !surahSet.has(item.surah)) continue;

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

      if (item.difficulty === 1) easy += 1;
      else if (item.difficulty === 2) medium += 1;
      else if (item.difficulty === 3) hard += 1;

      if (difficulty !== 'all' && item.difficulty !== difficulty) continue;
      kept.push(item);
    }

    return {
      filteredIndexItems: kept,
      skippedReportedCount: skipped,
      scopeDifficultyBreakdown: { total: easy + medium + hard, easy, medium, hard },
    };
  }, [
    questionIndex,
    targetSurahs,
    difficulty,
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
      mealBasis: 'all',
      questionCount,
      prioritizeUnsolved,
      arenaTimePerQuestion,
      questionOrder,
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

  const handleRetryQuestionIndex = async () => {
    if (isRetryingIndex) return;
    sfxService.play('click');
    setIsRetryingIndex(true);
    try {
      await retryLoadQuestionIndex();
    } finally {
      setIsRetryingIndex(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* ====================================================================
          Soru Bankası Dizini Yükleme Hatası Uyarısı
          ==================================================================== */}
      {questionIndex === null && questionIndexError && (
        <section
          role="alert"
          aria-label="Soru bankası dizini yüklenemedi"
          className="surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--state-danger-bg)',
            borderColor: 'rgba(239, 68, 68, 0.35)',
          }}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.14)',
                color: 'var(--state-danger-text)',
              }}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold" style={{ color: 'var(--state-danger-text)' }}>
                {questionIndexError}
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Okuma, Ezber ve Fihrist modüllerini kullanmaya devam edebilirsiniz. İnternet
                bağlantınızı kontrol edip soru dizinini yeniden yükleyebilirsiniz.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isRetryingIndex}
            onClick={() => void handleRetryQuestionIndex()}
            className="min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isRetryingIndex ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <RotateCcw className="w-4 h-4 shrink-0" />
            )}
            <span>{isRetryingIndex ? 'Yükleniyor...' : 'Yeniden Dene'}</span>
          </button>
        </section>
      )}

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
                soru yanıtlandı · Kaldığınız soru: {resumableSession.currentIndex + 1}
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
          Kompakt Tek Satırlık Üst Başlık Şeridi
          ==================================================================== */}
      <section className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap">
            Meal Sınavı
          </h2>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            {selectedSingleSurah !== null
              ? `${surahMap.get(selectedSingleSurah)?.nameTr ?? `${selectedSingleSurah}. Sure`} · ${formatNumberTr(availableFilteredCount)} hazır soru`
              : `${formatNumberTr(targetSurahs.length)} Sure · ${formatNumberTr(availableFilteredCount)} Hazır Soru`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setIsAuditModalOpen(true);
            }}
            className={`min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-all whitespace-nowrap ${
              reportedCount === 0 ? 'opacity-75 hover:opacity-100' : ''
            }`}
            style={{
              backgroundColor:
                reportedCount > 0 ? 'rgba(239, 68, 68, 0.10)' : 'var(--bg-surface-soft)',
              borderColor:
                reportedCount > 0 ? 'rgba(239, 68, 68, 0.35)' : 'var(--border-subtle)',
              color: reportedCount > 0 ? '#DC2626' : 'var(--text-muted)',
            }}
          >
            <Flag className="w-3.5 h-3.5 shrink-0" />
            <span>Hata Bildirimleri</span>
            {reportedCount > 0 && (
              <span
                className="min-w-[20px] h-5 px-1.5 rounded-md text-[11px] font-extrabold tabular-nums inline-flex items-center justify-center text-white"
                style={{ backgroundColor: '#DC2626' }}
              >
                {formatNumberTr(reportedCount)}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* ====================================================================
          2 Sütunlu Masaüstü Sınav Kurulum Konsolu (Tek Ekrana Sığan Yapı)
          ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* SOL SÜTUN: 1. Kapsam ve Akıllı Filtreler */}
        <section className="lg:col-span-5 surface-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--brand-primary-soft)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold tracking-tight truncate">
                  1. Kapsam ve Filtreler
                </h3>
              </div>

              <button
                type="button"
                onClick={openPoolModal}
                className="min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <SlidersHorizontal className="w-3 h-3 shrink-0" />
                <span>Havuzu Düzenle</span>
              </button>
            </div>

            {/* Sure Kapsamı (114 sureye ölçeklenebilir aramalı ve kaydırılabilir liste) */}
            {availableSurahs.length > 6 && (
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="search"
                  value={surahSearch}
                  onChange={(e) => setSurahSearch(e.target.value)}
                  placeholder="Soru bankasında sure ara..."
                  aria-label="Soru bankasında sure ara"
                  className="w-full h-9 pl-8 pr-8 rounded-xl border text-xs font-medium outline-none focus:border-[var(--brand-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                {surahSearch && (
                  <button
                    type="button"
                    onClick={() => setSurahSearch('')}
                    aria-label="Sure aramasını temizle"
                    className="w-6 h-6 rounded-md flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-0.5">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSelectedSingleSurah(null);
                }}
                className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
                <span>Aktif Havuzum</span>
                <span className="text-[11px] opacity-80 tabular-nums">
                  ({poolQuestionSurahs.length > 0 ? poolQuestionSurahs.length : availableSurahs.length})
                </span>
              </button>

              {filteredAvailableSurahs.map((sNo) => {
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
                    className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
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
                      className="text-[10px] font-semibold tabular-nums"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      ({qCnt})
                    </span>
                  </button>
                );
              })}

              {surahSearch.trim() && filteredAvailableSurahs.length === 0 && (
                <p className="text-xs py-1" style={{ color: 'var(--text-muted)' }}>
                  &ldquo;{surahSearch.trim()}&rdquo; ile eşleşen soru bankalı sure bulunamadı.
                </p>
              )}
            </div>

            {selectedSingleSurah === null && poolQuestionSurahs.length === 0 && (
              <p className="text-[11px] leading-snug" style={{ color: 'var(--brand-accent-text)' }}>
                Aktif havuzunuzdaki surelerde henüz soru olmadığı için mevcut soru bankası kapsama
                alındı.
              </p>
            )}

            {/* Zorluk Filtresi */}
            <div
              className="pt-2.5 border-t space-y-1.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-[11px] font-bold block" style={{ color: 'var(--text-muted)' }}>
                Zorluk
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
                      className="min-h-[34px] rounded-lg text-xs font-bold transition-all cursor-pointer"
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

            {/* Soru Sırası (Varsayılan: Mushaf & Ayet Sıralı / Karışık) */}
            <div
              className="pt-2.5 border-t space-y-1.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  Soru Sırası
                </span>
                <span
                  className="text-[10.5px] font-semibold truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {questionOrder === 'mushaf' ? 'Sure & ayet sırasıyla' : 'Rastgele karışık'}
                </span>
              </div>
              <div
                className="grid grid-cols-2 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                role="group"
                aria-label="Soru sıralama tercihi"
              >
                <button
                  type="button"
                  aria-pressed={questionOrder === 'mushaf'}
                  onClick={() => {
                    sfxService.play('click');
                    setQuestionOrder('mushaf');
                  }}
                  className="min-h-[34px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor:
                      questionOrder === 'mushaf' ? 'var(--bg-surface)' : 'transparent',
                    color:
                      questionOrder === 'mushaf'
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-secondary)',
                    boxShadow:
                      questionOrder === 'mushaf' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <ListOrdered className="w-3.5 h-3.5 shrink-0" />
                  <span>Mushaf Sıralı</span>
                </button>
                <button
                  type="button"
                  aria-pressed={questionOrder === 'shuffled'}
                  onClick={() => {
                    sfxService.play('click');
                    setQuestionOrder('shuffled');
                  }}
                  className="min-h-[34px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor:
                      questionOrder === 'shuffled' ? 'var(--bg-surface)' : 'transparent',
                    color:
                      questionOrder === 'shuffled'
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-secondary)',
                    boxShadow:
                      questionOrder === 'shuffled' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Shuffle className="w-3.5 h-3.5 shrink-0" />
                  <span>Karışık</span>
                </button>
              </div>
            </div>

            {/* Seçili Kapsam Özeti */}
            <div
              className="rounded-xl border p-2.5 space-y-1.5"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold" style={{ color: 'var(--text-muted)' }}>
                  Seçili Kapsam Özeti
                </span>
                <span className="font-extrabold tabular-nums" style={{ color: 'var(--brand-primary-text)' }}>
                  {formatNumberTr(targetSurahs.length)} Sure ·{' '}
                  {formatNumberTr(scopeDifficultyBreakdown.total)} Hazır Soru
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[11px] tabular-nums">
                <div
                  className="px-2 py-1 rounded-lg border flex items-center justify-between"
                  style={{
                    backgroundColor:
                      difficulty === 1 ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                    borderColor:
                      difficulty === 1 ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Kolay</span>
                  <strong style={{ color: '#059669' }}>
                    {formatNumberTr(scopeDifficultyBreakdown.easy)}
                  </strong>
                </div>
                <div
                  className="px-2 py-1 rounded-lg border flex items-center justify-between"
                  style={{
                    backgroundColor:
                      difficulty === 2 ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                    borderColor:
                      difficulty === 2 ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Orta</span>
                  <strong style={{ color: 'var(--brand-accent-text)' }}>
                    {formatNumberTr(scopeDifficultyBreakdown.medium)}
                  </strong>
                </div>
                <div
                  className="px-2 py-1 rounded-lg border flex items-center justify-between"
                  style={{
                    backgroundColor:
                      difficulty === 3 ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                    borderColor:
                      difficulty === 3 ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Zor</span>
                  <strong style={{ color: '#DC2626' }}>
                    {formatNumberTr(scopeDifficultyBreakdown.hard)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Alt Sıra: Çözmediklerime Öncelik Ver + Hatalı Soru Notu */}
          <div className="space-y-2">
            <button
              type="button"
              role="switch"
              aria-checked={prioritizeUnsolved}
              onClick={() => {
                sfxService.play('click');
                setPrioritizeUnsolved((prev) => !prev);
              }}
              className="w-full min-h-[38px] px-3 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
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
                className="w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
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

            {reportedCount > 0 && (
              <div
                className="rounded-xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.06)',
                  borderColor: 'rgba(239, 68, 68, 0.22)',
                }}
              >
                <span className="font-semibold flex items-center gap-1.5 min-w-0">
                  <Flag className="w-3 h-3 text-red-500 shrink-0" />
                  <span className="truncate">
                    {questionAudit.skipReportedInExams
                      ? `${formatNumberTr(reportedCount)} işaretli soru atlanıyor${
                          skippedReportedCount > 0 ? ` (${skippedReportedCount})` : ''
                        }`
                      : `${formatNumberTr(reportedCount)} işaretli soru (atlama kapalı)`}
                  </span>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setSkipReportedInExams(!questionAudit.skipReportedInExams);
                    }}
                    className="px-2 py-1 rounded-md border font-bold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {questionAudit.skipReportedInExams ? 'Kapat' : 'Atla'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsAuditModalOpen(true);
                    }}
                    className="px-2 py-1 rounded-md font-bold cursor-pointer text-white"
                    style={{ backgroundColor: '#DC2626' }}
                  >
                    Yönet
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SAĞ SÜTUN: 2. 3 Kompakt Sınav Modu + 3. Tek Satırlı Soru Sayısı & Başlat */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-3">
          {/* Adım 2 Başlığı (Sol sütundaki 1. Kapsam ve Filtreler ile görsel simetri) */}
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-extrabold tracking-tight truncate">
                2. Sınav Modu
              </h3>
            </div>
            <span
              className="text-[11px] font-semibold truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              Çalışma biçiminizi seçin
            </span>
          </div>

          {/* 3 Sınav Modu Kartı */}
          <section aria-label="Sınav modu seçimi" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
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
              className="surface-card rounded-2xl p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between border-2"
              style={{
                borderColor: mode === 'practice' ? 'var(--brand-primary)' : 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <Zap className="w-4 h-4" />
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                    style={{
                      backgroundColor:
                        mode === 'practice' ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                      color: mode === 'practice' ? '#FFFFFF' : 'var(--text-muted)',
                    }}
                  >
                    {mode === 'practice' ? 'Seçili' : 'Süresiz'}
                  </span>
                </div>

                <h4 className="text-sm font-extrabold mb-1">Hızlı Antrenman</h4>
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                  Süre baskısı olmadan her soruda anında açıklama ve ayet mealini inceleyin.
                </p>
              </div>

              <p
                className="mt-2.5 pt-2 border-t text-[10px] font-semibold"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                Anında dönüt · Ayet çekmecesi
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
              className="surface-card rounded-2xl p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between border-2"
              style={{
                borderColor: mode === 'arena' ? 'var(--brand-accent)' : 'var(--border-subtle)',
              }}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Flame className="w-4 h-4" />
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                    style={{
                      backgroundColor:
                        mode === 'arena' ? 'var(--brand-accent)' : 'var(--bg-surface-soft)',
                      color: mode === 'arena' ? '#FFFFFF' : 'var(--text-muted)',
                    }}
                  >
                    {mode === 'arena' ? 'Seçili' : '3 Can · 3 Joker'}
                  </span>
                </div>

                <h4 className="text-sm font-extrabold mb-1">Yarışma Arenası</h4>
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                  3 can, seri çarpanı ve 3 joker (%50, İpucu, +30sn) ile dinamik yarışma.
                </p>
              </div>

              <div
                className="mt-2.5 pt-2 border-t flex items-center justify-between gap-1.5"
                style={{ borderColor: 'var(--border-subtle)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Süre:
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
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer whitespace-nowrap"
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
                      {sec}sn
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
              className="surface-card rounded-2xl p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between border-2"
              style={{
                borderColor: mode === 'mock' ? 'var(--brand-primary)' : 'var(--border-subtle)',
              }}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                    style={{
                      backgroundColor:
                        mode === 'mock' ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                      color: mode === 'mock' ? '#FFFFFF' : 'var(--text-muted)',
                    }}
                  >
                    {mode === 'mock' ? 'Seçili' : 'Deneme'}
                  </span>
                </div>

                <h4 className="text-sm font-extrabold mb-1">Gerçek Deneme</h4>
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                  Toplam süre, soru paleti ve boş bırakma ile gerçek sınav deneyimi.
                </p>
              </div>

              <p
                className="mt-2.5 pt-2 border-t text-[10px] font-semibold tabular-nums"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                ~{estimatedMockMinutes} dk ({effectiveLaunchCount} soru × 1.5 dk)
              </p>
            </div>
          </section>

          {/* Tek Satırlık Soru Sayısı & Başlat Çubuğu */}
          <section className="surface-card rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-extrabold tracking-tight uppercase" style={{ color: 'var(--text-secondary)' }}>
                  Soru Sayısı
                </h3>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  (Uygun: {formatNumberTr(availableFilteredCount)})
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
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
                      className="min-h-[34px] min-w-[42px] px-2.5 rounded-lg border text-xs font-extrabold tabular-nums transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap"
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
                  Seçili filtrelerle eşleşen soru bulunamadı. Zorluk filtresini &ldquo;Tümü&rdquo;
                  yapmayı deneyin.
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={availableFilteredCount === 0 || isStarting}
              onClick={handleLaunch}
              className="min-h-[46px] px-5 rounded-xl text-sm font-extrabold text-white flex items-center justify-center gap-2 shrink-0 transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Hazırlanıyor...</span>
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>Sınavı Başlat ({effectiveLaunchCount})</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </>
              )}
            </button>
          </section>

          {/* Kağıt Üzerinde A4 Sınav & Yaprak Test Stüdyosu Kartı */}
          <section
            aria-label="Yazdırılabilir A4 Sınav ve Yaprak Test Stüdyosu"
            className="rounded-2xl border-2 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'rgba(217, 119, 6, 0.42)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                style={{
                  backgroundColor: 'var(--brand-accent-soft)',
                  borderColor: 'rgba(217, 119, 6, 0.3)',
                  color: 'var(--brand-accent-text)',
                }}
              >
                <Printer className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3
                  className="text-sm sm:text-[15px] font-extrabold tracking-tight leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Yazdırılabilir A4 Sınav &amp; Yaprak Test (PDF)
                </h3>
                <p
                  className="text-xs leading-snug mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Seçili sure kapsamından optik kodlamalı, cevap anahtarlı ve baskıya hazır A4 sınav kağıdı oluşturun.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsPrintModalOpen(true);
              }}
              className="w-full sm:w-auto min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-transform active:scale-[0.98] whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-accent)' }}
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>A4 Sınav Oluştur</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </section>
        </div>
      </div>

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
            <p className="text-sm font-bold mb-1">Henüz tamamlanmış sınav kaydınız bulunmuyor</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              İlk sınavınızı tamamladığınızda başarı oranınız, puanınız ve gelişim geçmişiniz
              burada görünecektir.
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
          onClick={() => {
            const firstTargetSurah =
              selectedSingleSurah ?? targetSurahs[0] ?? poolStats.effectiveSurahs[0] ?? 1;
            navigateToStudy({
              surah: firstTargetSurah,
              ayah: 1,
              ensureMealVisible: true,
            });
          }}
          className="text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Sınav öncesi surelerin mealine göz atmak ister misin?</span>
        </button>
      </div>

      {/* A4 Yazdırılabilir Sınav Kâğıdı ve Cevap Anahtarı Penceresi */}
      {isPrintModalOpen && (
        <Suspense fallback={null}>
          <PrintableExamModal
            isOpen={isPrintModalOpen}
            onClose={() => setIsPrintModalOpen(false)}
            initialSurahNo={selectedSingleSurah}
            initialQuestionOrder={questionOrder}
          />
        </Suspense>
      )}

      {/* Hatalı İşaretlenen Sorular & JSON Denetim Raporu Penceresi */}
      <QuestionAuditManagerModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />
    </div>
  );
};
