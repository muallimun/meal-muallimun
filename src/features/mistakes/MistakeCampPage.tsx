import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  Trophy,
  XCircle,
} from 'lucide-react';
import { dataService } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { PreparedQuestion, QuestionItem } from '../../types/quran';
import {
  OPTION_LETTERS,
  formatPremiseItem,
  formatSourceRefLabel,
  getDifficultyInfo,
  getMealBasisLabel,
  getQuestionUid,
  matchesStoredQuestionIds,
  prepareQuestionOptions,
} from '../../utils/examUtils';
import { formatNumberTr, getSurahMap } from '../../utils/poolUtils';
import { FormattedStem } from '../exam/FormattedStem';
import { RelatedVerseDrawer } from '../exam/RelatedVerseDrawer';

type CampTab = 'mistakes' | 'bookmarked' | 'mastered';

interface InteractiveStudyCardProps {
  question: QuestionItem;
  tab: CampTab;
  surahNameTr: string;
  isBookmarked: boolean;
  onToggleBookmark: (uid: string) => void;
  onMarkMastered: (uid: string) => void;
}

const InteractiveStudyCard: React.FC<InteractiveStudyCardProps> = ({
  question,
  tab,
  surahNameTr,
  isBookmarked,
  onToggleBookmark,
  onMarkMastered,
}) => {
  const { settings } = useAppStore();
  const [attemptSeed, setAttemptSeed] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealedDirectly, setRevealedDirectly] = useState(false);

  const prepared: PreparedQuestion = useMemo(() => {
    void attemptSeed;
    return prepareQuestionOptions(question);
  }, [question, attemptSeed]);

  const diffInfo = getDifficultyInfo(question.difficulty);
  const mealLabel = getMealBasisLabel(question.mealBasis);
  const isChecked = selectedIndex !== null || revealedDirectly;
  const isCorrect = selectedIndex === prepared.correctDisplayIndex;

  const handleChoose = (idx: number) => {
    if (isChecked) return;
    setSelectedIndex(idx);
    const ok = idx === prepared.correctDisplayIndex;
    sfxService.play(ok ? 'correct' : 'wrong');
  };

  const handleReveal = () => {
    sfxService.play('click');
    setRevealedDirectly(true);
  };

  const handleRetryCard = () => {
    sfxService.play('click');
    setSelectedIndex(null);
    setRevealedDirectly(false);
    setAttemptSeed((s) => s + 1);
  };

  return (
    <article className="surface-card rounded-2xl p-5 space-y-4">
      {/* Üst Metaveri */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className="font-bold px-2.5 py-0.5 rounded-lg"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              color: 'var(--brand-primary-text)',
            }}
          >
            {surahNameTr}
          </span>
          <span
            className="font-bold px-2.5 py-0.5 rounded-lg"
            style={{ backgroundColor: diffInfo.bg, color: diffInfo.color }}
          >
            {diffInfo.label}
          </span>
          <span
            className="font-semibold px-2.5 py-0.5 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-secondary)',
            }}
          >
            {mealLabel}
          </span>
          {!isChecked && (
            <span
              className="font-semibold px-2.5 py-0.5 rounded-lg"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              Kendini Tekrar Dene
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {tab === 'mistakes' && (
            <button
              type="button"
              onClick={() => onMarkMastered(prepared.uid)}
              className="min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.10)',
                borderColor: 'rgba(16, 185, 129, 0.30)',
                color: '#059669',
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Anladım, Listeden Çıkar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleBookmark(prepared.uid)}
            aria-label={isBookmarked ? 'Yıldızlılardan çıkar' : 'Soruyu yıldızla'}
            className="min-w-[38px] min-h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: isBookmarked
                ? 'var(--brand-accent-soft)'
                : 'var(--bg-surface-soft)',
              borderColor: isBookmarked ? 'var(--brand-accent)' : 'var(--border-subtle)',
              color: isBookmarked ? 'var(--brand-accent-text)' : 'var(--text-muted)',
            }}
          >
            <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Öncüller */}
      {question.premises.length > 0 && (
        <div
          className="rounded-xl border p-3.5 space-y-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {question.premises.map((raw, pIdx) => {
            const { roman, text } = formatPremiseItem(raw, pIdx);
            return (
              <div
                key={pIdx}
                className="flex items-start gap-2 turkish-reading"
                style={{ fontSize: `${settings.turkishFontSize}px` }}
              >
                <span
                  className="font-extrabold min-w-[24px] shrink-0"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {roman}
                </span>
                <span>{text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Soru Kökü */}
      <FormattedStem
        text={question.stem}
        className="turkish-reading font-semibold"
        style={{ fontSize: `${settings.turkishFontSize}px` }}
      />

      {/* Şıklar (Başlangıçta Doğru Cevap Gizli — Dokununca Kontrol Eder) */}
      <div className="space-y-2">
        {prepared.options.map((optText, oIdx) => {
          const isCorrectOpt = oIdx === prepared.correctDisplayIndex;
          const isChosen = selectedIndex === oIdx;

          let borderColor = 'var(--border-subtle)';
          let bgColor = 'var(--bg-surface)';

          if (isChecked) {
            if (isCorrectOpt) {
              borderColor = '#10B981';
              bgColor = 'rgba(16, 185, 129, 0.12)';
            } else if (isChosen && !isCorrectOpt) {
              borderColor = '#EF4444';
              bgColor = 'rgba(239, 68, 68, 0.10)';
            }
          }

          return (
            <button
              key={oIdx}
              type="button"
              disabled={isChecked}
              onClick={() => handleChoose(oIdx)}
              className={`w-full min-h-[46px] px-3.5 py-3 rounded-xl border-2 text-left flex items-start gap-2.5 transition-colors ${
                isChecked ? 'cursor-default' : 'cursor-pointer hover:border-teal-600/50'
              }`}
              style={{ borderColor, backgroundColor: bgColor }}
            >
              {settings.showOptionLettersInApp ? (
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {OPTION_LETTERS[oIdx] ?? oIdx + 1}
                </span>
              ) : (
                <span
                  className="w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center"
                  style={{
                    borderColor: isChecked && isCorrectOpt ? '#10B981' : 'var(--border-strong)',
                  }}
                >
                  {isChecked && isCorrectOpt ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  ) : isChecked && isChosen ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  ) : null}
                </span>
              )}

              <span
                className="flex-1 turkish-reading text-sm leading-snug"
                style={{ fontSize: `${settings.turkishFontSize}px` }}
              >
                {optText}
              </span>

              {isChecked && isCorrectOpt && (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              )}
              {isChecked && isChosen && !isCorrectOpt && (
                <XCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Alt Çubuk: Cevabı Göster veya Dönüt + Çözüm + İlgili Ayet */}
      {!isChecked ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleReveal}
            className="min-h-[40px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-secondary)',
            }}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span>Cevabı ve Açıklamayı Göster</span>
          </button>
        </div>
      ) : (
        <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div
            className="rounded-xl p-3.5 space-y-1.5 text-xs sm:text-sm"
            style={{
              backgroundColor:
                selectedIndex !== null
                  ? isCorrect
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(239, 68, 68, 0.10)'
                  : 'var(--bg-surface-soft)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-extrabold"
                style={{
                  color:
                    selectedIndex === null
                      ? 'var(--brand-primary-text)'
                      : isCorrect
                        ? '#059669'
                        : '#DC2626',
                }}
              >
                {selectedIndex === null
                  ? 'Çözüm Açıklaması'
                  : isCorrect
                    ? 'Harika! Bu soruyu doğru çözdün.'
                    : 'Tekrar deneyebilir veya ilgili ayeti inceleyebilirsin.'}
              </span>

              <button
                type="button"
                onClick={handleRetryCard}
                className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
                style={{ color: 'var(--text-muted)' }}
              >
                <RefreshCw className="w-3 h-3" />
                <span>Tekrar Dene</span>
              </button>
            </div>

            {question.explanation && (
              <p className="leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {question.explanation}
              </p>
            )}
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Kaynak: {formatSourceRefLabel(question.sourceRef)}
            </p>
          </div>

          <RelatedVerseDrawer question={question} showOpenInReader />
        </div>
      )}
    </article>
  );
};

export const MistakeCampPage: React.FC = () => {
  const {
    meta,
    questionIndex,
    gamification,
    toggleBookmarkQuestion,
    markQuestionMastered,
    navigateToExam,
  } = useAppStore();

  const [activeCampTab, setActiveCampTab] = useState<CampTab>('mistakes');
  const [surahFilter, setSurahFilter] = useState<number | null>(null);
  const [allBankQuestions, setAllBankQuestions] = useState<QuestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);

  // Mevcut tüm soru bankası surelerini paralel & önbellekli yükle
  useEffect(() => {
    const surahs = questionIndex?.availableSurahs ?? [];
    if (surahs.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    async function loadAll() {
      setIsLoading(true);
      setError(null);
      try {
        const list = await dataService.getQuestionsForSurahs(surahs);
        if (!cancelled) {
          setAllBankQuestions(list);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Sorular yüklenirken hata oluştu.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [questionIndex?.availableSurahs]);

  const wrongSet = useMemo(
    () => new Set(gamification.wrongQuestionIds),
    [gamification.wrongQuestionIds],
  );
  const bookmarkedSet = useMemo(
    () => new Set(gamification.bookmarkedQuestionIds),
    [gamification.bookmarkedQuestionIds],
  );
  const masteredSet = useMemo(
    () => new Set(gamification.masteredQuestionIds),
    [gamification.masteredQuestionIds],
  );

  const mistakeQuestions = useMemo(
    () => allBankQuestions.filter((q) => matchesStoredQuestionIds(q, wrongSet)),
    [allBankQuestions, wrongSet],
  );
  const bookmarkedQuestions = useMemo(
    () => allBankQuestions.filter((q) => matchesStoredQuestionIds(q, bookmarkedSet)),
    [allBankQuestions, bookmarkedSet],
  );
  const masteredQuestions = useMemo(
    () => allBankQuestions.filter((q) => matchesStoredQuestionIds(q, masteredSet)),
    [allBankQuestions, masteredSet],
  );

  const activeList = useMemo(() => {
    if (activeCampTab === 'mistakes') return mistakeQuestions;
    if (activeCampTab === 'bookmarked') return bookmarkedQuestions;
    return masteredQuestions;
  }, [activeCampTab, mistakeQuestions, bookmarkedQuestions, masteredQuestions]);

  // Surelere göre dağılım çipleri
  const surahCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const q of activeList) {
      map.set(q.surah, (map.get(q.surah) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [activeList]);

  useEffect(() => {
    if (surahFilter !== null && !surahCounts.some(([sNo]) => sNo === surahFilter)) {
      setSurahFilter(null);
    }
  }, [surahFilter, surahCounts]);

  const displayedQuestions = useMemo(() => {
    if (surahFilter === null) return activeList;
    return activeList.filter((q) => q.surah === surahFilter);
  }, [activeList, surahFilter]);

  return (
    <div className="space-y-6 pb-8">
      {/* Başlık */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--brand-primary-text)' }}>
            Kişisel Tekrar ve Ustalaşma Merkezi
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Hata Kampı &amp; Favori Sorular
          </h2>
          <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Yanlış yaptığın soruları telafi et, yıldızladıklarını tekrar et ve kalıcı öğrenmeye
            dönüştür.
          </p>
        </div>
      </section>

      {/* Üst 3 Sekme */}
      <div
        className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {(
          [
            {
              id: 'mistakes',
              label: 'Hata Kampı',
              count: mistakeQuestions.length,
              icon: Target,
            },
            {
              id: 'bookmarked',
              label: 'Yıldızlılar',
              count: bookmarkedQuestions.length,
              icon: Star,
            },
            {
              id: 'mastered',
              label: 'Temizlenenler',
              count: masteredQuestions.length,
              icon: CheckCircle2,
            },
          ] as {
            id: CampTab;
            label: string;
            count: number;
            icon: React.ComponentType<{ className?: string }>;
          }[]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeCampTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                sfxService.play('click');
                setActiveCampTab(tab.id);
                setSurahFilter(null);
              }}
              className="min-h-[46px] px-2.5 sm:px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              style={{
                backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
              <span
                className="text-[11px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md"
                style={{
                  backgroundColor: active ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                  color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ====================================================================
          Hata Kampı Özet ve Hızlı Telafi Kartı
          ==================================================================== */}
      {activeCampTab === 'mistakes' && mistakeQuestions.length > 0 && (
        <section
          className="surface-card rounded-2xl p-5 sm:p-6 border-l-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
          style={{ borderLeftColor: '#EF4444' }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-red-500 shrink-0" />
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                {formatNumberTr(mistakeQuestions.length)} Hatalı Soru Telafi Bekliyor
              </h3>
            </div>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              Telafi sınavında doğru çözdüğün her soru otomatik olarak Hata Kampı&apos;ndan düşer ve{' '}
              <strong>Temizlenen Hatalar</strong> arşivine eklenir.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {mistakeQuestions.length > 10 && (
              <button
                type="button"
                onClick={() =>
                  navigateToExam({ autoStartMistakeCamp: true, mistakeLimit: 10 })
                }
                className="min-h-[48px] px-5 rounded-xl text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Rocket className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">10 Soruluk Hızlı Telafi</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                navigateToExam({ autoStartMistakeCamp: true, mistakeLimit: 0 })
              }
              className="min-h-[48px] px-5 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
              style={{
                backgroundColor:
                  mistakeQuestions.length > 10
                    ? 'var(--brand-accent)'
                    : 'var(--brand-primary)',
                color: '#FFFFFF',
              }}
            >
              <Rocket className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">
                Hatalarımdan Telafi Sınavı Başlat ({mistakeQuestions.length})
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Sure Dağılımı Filtre Çipleri */}
      {surahCounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              setSurahFilter(null);
            }}
            className="min-h-[38px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
            style={{
              backgroundColor:
                surahFilter === null ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
              borderColor:
                surahFilter === null ? 'var(--brand-primary)' : 'var(--border-subtle)',
              color:
                surahFilter === null ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
            }}
          >
            Tümü ({activeList.length})
          </button>

          {surahCounts.map(([sNo, count]) => {
            const sMeta = surahMap.get(sNo);
            const active = surahFilter === sNo;
            return (
              <button
                key={sNo}
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSurahFilter(sNo);
                }}
                className="min-h-[38px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--brand-primary-soft)' : 'var(--bg-surface)',
                  borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                }}
              >
                {sMeta?.shortNameTr ?? `${sNo}. Sure`} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* ====================================================================
          İçerik Alanı: Yükleniyor / Boş Durum / Etkileşimli Soru Kartları
          ==================================================================== */}
      {isLoading ? (
        <div className="surface-card rounded-2xl p-10 flex items-center justify-center gap-2.5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Sorular yükleniyor...</span>
        </div>
      ) : error ? (
        <div className="surface-card rounded-2xl p-6 text-center text-sm" style={{ color: '#EF4444' }}>
          {error}
        </div>
      ) : displayedQuestions.length === 0 ? (
        <div className="surface-card rounded-2xl p-8 sm:p-10 text-center max-w-xl mx-auto space-y-4">
          <div
            className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor:
                activeCampTab === 'mistakes'
                  ? 'rgba(16, 185, 129, 0.14)'
                  : 'var(--brand-primary-soft)',
              color:
                activeCampTab === 'mistakes' ? '#059669' : 'var(--brand-primary-text)',
            }}
          >
            {activeCampTab === 'mistakes' ? (
              <Sparkles className="w-7 h-7" />
            ) : activeCampTab === 'bookmarked' ? (
              <Star className="w-7 h-7" />
            ) : (
              <CheckCircle2 className="w-7 h-7" />
            )}
          </div>

          {activeCampTab === 'mistakes' ? (
            <>
              <h3 className="text-xl font-extrabold tracking-tight">
                Harika! Hata kampın tertemiz.
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Yeni bir sınavla kendini sınamaya ne dersin? Yanlış yaptığın sorular olursa burada
                senin için otomatik olarak toplanacak.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigateToExam()}
                  className="min-h-[48px] px-6 rounded-xl text-sm font-extrabold text-white inline-flex items-center gap-2 cursor-pointer"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>Sınav Merkezine Git</span>
                </button>
              </div>
            </>
          ) : activeCampTab === 'bookmarked' ? (
            <>
              <h3 className="text-lg font-extrabold tracking-tight">
                Henüz yıldızladığın bir soru yok
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Sınav sırasında veya sonuç karnesinde tekrar bakmak istediğin soruların yıldız
                simgesine dokunarak buraya kaydedebilirsin.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-extrabold tracking-tight">
                Temizlenen hatalar arşivin burada birikecek
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Hata Kampı telafi sınavlarında doğru çözdüğün veya anladığını onayladığın sorular
                burada başarı arşivi olarak listelenir.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedQuestions.map((q) => {
            const uid = getQuestionUid(q);
            const sMeta = surahMap.get(q.surah);
            return (
              <InteractiveStudyCard
                key={uid}
                question={q}
                tab={activeCampTab}
                surahNameTr={sMeta?.nameTr ?? `${q.surah}. Sure`}
                isBookmarked={gamification.bookmarkedQuestionIds.includes(uid)}
                onToggleBookmark={toggleBookmarkQuestion}
                onMarkMastered={markQuestionMastered}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
