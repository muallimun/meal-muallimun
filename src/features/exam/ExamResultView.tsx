import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Flag,
  Flame,
  MinusCircle,
  PlusCircle,
  RotateCcw,
  Sparkles,
  Star,
  XCircle,
} from 'lucide-react';
import { QuestionReportModal } from '../../components/QuestionReportModal';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { ExamResultSummary, QuestionItem } from '../../types/quran';
import {
  OPTION_LETTERS,
  formatDurationTr,
  formatPremiseItem,
  formatSourceRefLabel,
  getDifficultyInfo,
} from '../../utils/examUtils';
import { formatNumberTr, getSurahMap } from '../../utils/poolUtils';
import { FormattedStem } from './FormattedStem';
import { RelatedVerseDrawer } from './RelatedVerseDrawer';

type ReviewFilter = 'all' | 'wrong' | 'blank' | 'correct';

interface ExamResultViewProps {
  result: ExamResultSummary;
  onStartWrongMiniTest: (wrongUids: string[], surahs: number[]) => void;
  onNewExam: () => void;
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({
  result,
  onStartWrongMiniTest,
  onNewExam,
}) => {
  const { settings, meta, gamification, questionAudit, toggleBookmarkQuestion } = useAppStore();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [reportTarget, setReportTarget] = useState<QuestionItem | null>(null);
  const reviewSectionRef = useRef<HTMLElement | null>(null);

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);

  useEffect(() => {
    sfxService.play('success');
  }, [result.sessionId]);

  const wrongUids = useMemo(() => {
    return result.questions
      .filter((q) => {
        const ans = result.answers[q.uid];
        return ans && !ans.isCorrect;
      })
      .map((q) => q.uid);
  }, [result.questions, result.answers]);

  // Sure bazlı başarı dağılımı
  const surahBreakdown = useMemo(() => {
    const map = new Map<number, { surahNo: number; total: number; correct: number }>();
    for (const q of result.questions) {
      const sNo = q.question.surah;
      const entry = map.get(sNo) ?? { surahNo: sNo, total: 0, correct: 0 };
      entry.total += 1;
      if (result.answers[q.uid]?.isCorrect) {
        entry.correct += 1;
      }
      map.set(sNo, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.surahNo - b.surahNo);
  }, [result.questions, result.answers]);

  const filteredQuestions = useMemo(() => {
    return result.questions
      .map((q, index) => ({ q, index, ans: result.answers[q.uid] }))
      .filter(({ ans }) => {
        if (filter === 'all') return true;
        if (filter === 'correct') return Boolean(ans?.isCorrect);
        if (filter === 'wrong') return Boolean(ans && !ans.isCorrect);
        if (filter === 'blank') return !ans || ans.selectedIndex === null;
        return true;
      });
  }, [result.questions, result.answers, filter]);

  const scoreMessage = (() => {
    if (result.scorePct >= 90) return 'Olağanüstü! Surelerin meallerine derinlemesine hâkimsin.';
    if (result.scorePct >= 75) return 'Çok başarılı! Kısa bir tekrarla mükemmel seviyeye ulaşabilirsin.';
    if (result.scorePct >= 50) return 'Güzel bir başlangıç! Yanlışlarını inceleyerek hızlıca güçlenebilirsin.';
    return 'Her deneme yeni bir öğrenme fırsatıdır. Hatalı soruları inceleyip tekrar dene!';
  })();

  // SVG dairesel başarı halkası
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (result.scorePct / 100) * circumference;
  const ringColor =
    result.scorePct >= 80 ? '#10B981' : result.scorePct >= 50 ? '#F59E0B' : '#EF4444';

  const handleJumpToWrong = () => {
    sfxService.play('click');
    setFilter(result.wrong > 0 ? 'wrong' : 'all');
    reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4 pb-8">
      {/* ====================================================================
          1. Üst Karne Kartı: Başarı Halkası, KPI'lar ve Sure Dağılımı
          ==================================================================== */}
      <section className="surface-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-5">
          {/* Başarı Halkası */}
          <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke="var(--bg-surface-soft)"
                strokeWidth="12"
              />
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-extrabold tabular-nums tracking-tight">
                %{result.scorePct}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Başarı Oranı
              </span>
            </div>
          </div>

          {/* Özet Metin ve KPI'lar */}
          <div className="flex-1 text-center md:text-left space-y-3 min-w-0">
            <div>
              <p className="text-xs font-bold mb-1" style={{ color: 'var(--brand-primary-text)' }}>
                {result.config.isMistakeCamp
                  ? 'Hata Kampı Telafi Karnesi'
                  : result.endedByNoLives
                    ? 'Yarışma Arenası Tamamlandı (Canlar Tükendi)'
                    : 'Sınav Sonuç Karnesi'}
              </p>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">{scoreMessage}</h2>
            </div>

            {/* Temizlenen Hata Kutlaması */}
            {result.newlyMasteredCount > 0 && (
              <div
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.14)',
                  color: '#059669',
                }}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  Harika! {formatNumberTr(result.newlyMasteredCount)} soru Hata Kampı&apos;ndan
                  temizlenerek kalıcı öğrenildi.
                </span>
              </div>
            )}

            {/* İstatistik Satırı */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}
              >
                <p className="text-lg font-extrabold tabular-nums text-emerald-600">
                  {result.correct}
                </p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Doğru
                </p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.10)' }}
              >
                <p className="text-lg font-extrabold tabular-nums text-red-500">{result.wrong}</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Yanlış
                </p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <p className="text-lg font-extrabold tabular-nums">{result.blank}</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Boş
                </p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: 'var(--brand-primary-soft)' }}
              >
                <p
                  className="text-lg font-extrabold tabular-nums"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  +{formatNumberTr(result.earnedXp)}
                </p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Kazanılan XP
                </p>
              </div>
              <div
                className="p-3 rounded-xl col-span-2 sm:col-span-1"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <p className="text-sm sm:text-base font-extrabold tabular-nums flex items-center justify-center md:justify-start gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>{formatDurationTr(result.durationSec)}</span>
                </p>
                <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {result.maxStreak >= 2 ? `En iyi seri: ${result.maxStreak}x` : 'Geçen Süre'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sure Bazlı Başarı Dağılımı */}
        {surahBreakdown.length > 0 && (
          <div className="pt-5 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4" style={{ color: 'var(--brand-primary-text)' }} />
              <h3 className="text-sm font-extrabold">Sure Bazlı Başarı Dağılımı</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {surahBreakdown.map((item) => {
                const sMeta = surahMap.get(item.surahNo);
                const pct = Math.round((item.correct / item.total) * 100);
                return (
                  <div
                    key={item.surahNo}
                    className="p-3 rounded-xl border space-y-1.5"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>{sMeta?.nameTr ?? `${item.surahNo}. Sure`}</span>
                      <span className="tabular-nums">
                        {item.correct}/{item.total} (%{pct})
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct >= 75 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Ana Aksiyon Butonları */}
        <div
          className="pt-4 border-t flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {result.wrong > 0 && (
            <button
              type="button"
              onClick={handleJumpToWrong}
              className="min-h-[46px] px-5 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderColor: 'rgba(239, 68, 68, 0.28)',
                color: '#DC2626',
              }}
            >
              <XCircle className="w-4 h-4 shrink-0" />
              <span>Yanlışlarımı İncele ({result.wrong})</span>
            </button>
          )}

          {wrongUids.length > 0 && (
            <button
              type="button"
              onClick={() => onStartWrongMiniTest(wrongUids, result.config.surahs)}
              className="min-h-[46px] px-5 rounded-xl text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer"
              style={{ backgroundColor: 'var(--brand-accent)' }}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>Yanlışlarımdan Mini Test Başlat</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNewExam}
            className="min-h-[46px] px-5 rounded-xl text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer sm:ml-auto"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Yeni Sınav Kur</span>
          </button>
        </div>
      </section>

      {/* ====================================================================
          2. Filtrelenebilir Detaylı Çözüm Listesi
          ==================================================================== */}
      <section ref={reviewSectionRef} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold tracking-tight">Soru Çözümleri ve Ayet Kaynakları</h3>

          <div
            className="flex flex-wrap items-center gap-1 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            {(
              [
                { id: 'all', label: `Tümü (${result.totalQuestions})` },
                { id: 'wrong', label: `Yanlışlarım (${result.wrong})` },
                { id: 'blank', label: `Boşlarım (${result.blank})` },
                { id: 'correct', label: `Doğrularım (${result.correct})` },
              ] as { id: ReviewFilter; label: string }[]
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setFilter(tab.id);
                  }}
                  className="min-h-[36px] px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="surface-card rounded-2xl p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            Bu filtrede görüntülenecek soru bulunmuyor.
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredQuestions.map(({ q, index, ans }) => {
              const sMeta = surahMap.get(q.question.surah);
              const diffInfo = getDifficultyInfo(q.question.difficulty);
              const isBookmarked = gamification.bookmarkedQuestionIds.includes(q.uid);
              const isIssueReported = Boolean(
                questionAudit.reports[q.uid] || questionAudit.reports[q.question.id],
              );
              const isCorrect = Boolean(ans?.isCorrect);
              const isBlank = !ans || ans.selectedIndex === null;

              return (
                <article
                  key={q.uid}
                  className="surface-card rounded-2xl p-4 space-y-3"
                  style={{
                    borderColor: isCorrect
                      ? 'rgba(16, 185, 129, 0.30)'
                      : isBlank
                        ? 'var(--border-subtle)'
                        : 'rgba(239, 68, 68, 0.30)',
                  }}
                >
                  {/* Üst Bilgi */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-extrabold tabular-nums">#{index + 1}</span>
                      <span
                        className="font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1"
                        style={{
                          backgroundColor: isCorrect
                            ? 'rgba(16, 185, 129, 0.14)'
                            : isBlank
                              ? 'var(--bg-surface-soft)'
                              : 'rgba(239, 68, 68, 0.12)',
                          color: isCorrect ? '#059669' : isBlank ? 'var(--text-muted)' : '#DC2626',
                        }}
                      >
                        {isCorrect ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : isBlank ? (
                          <MinusCircle className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{isCorrect ? 'Doğru' : isBlank ? 'Boş' : 'Yanlış'}</span>
                      </span>
                      <span
                        className="font-bold px-2 py-0.5 rounded-md"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {sMeta?.nameTr ?? `${q.question.surah}. Sure`}
                      </span>
                      <span
                        className="font-semibold px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: diffInfo.bg, color: diffInfo.color }}
                      >
                        {diffInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setReportTarget(q.question);
                        }}
                        aria-label="Soruyu hatalı olarak işaretle"
                        title="Soruyu hatalı / gözden geçirilecek olarak işaretle"
                        className="min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: isIssueReported
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'var(--bg-surface-soft)',
                          borderColor: isIssueReported ? '#EF4444' : 'var(--border-subtle)',
                          color: isIssueReported ? '#DC2626' : 'var(--text-muted)',
                        }}
                      >
                        <Flag className={`w-3.5 h-3.5 shrink-0 ${isIssueReported ? 'fill-current' : ''}`} />
                        <span className="hidden sm:inline">
                          {isIssueReported ? 'Hatalı Bildirildi' : 'Hatalı İşaretle'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleBookmarkQuestion(q.uid)}
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
                  {q.question.premises.length > 0 && (
                    <div
                      className="rounded-xl p-3.5 border space-y-1.5"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {q.question.premises.map((p, pIdx) => {
                        const { roman, text } = formatPremiseItem(p, pIdx);
                        return (
                          <div
                            key={pIdx}
                            className="flex items-start gap-2 text-xs sm:text-sm"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <span
                              className="font-extrabold min-w-[24px]"
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
                    text={q.question.stem}
                    className="turkish-reading font-semibold"
                    style={{ fontSize: `${settings.turkishFontSize}px` }}
                  />

                  {/* Şıklar Özeti */}
                  <div className="space-y-2">
                    {q.options.map((opt, oIdx) => {
                      const isCorrectOpt = oIdx === q.correctDisplayIndex;
                      const isChosen = ans?.selectedIndex === oIdx;

                      return (
                        <div
                          key={oIdx}
                          className="px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5"
                          style={{
                            borderColor: isCorrectOpt
                              ? '#10B981'
                              : isChosen
                                ? '#EF4444'
                                : 'var(--border-subtle)',
                            backgroundColor: isCorrectOpt
                              ? 'rgba(16, 185, 129, 0.12)'
                              : isChosen
                                ? 'rgba(239, 68, 68, 0.10)'
                                : 'var(--bg-surface)',
                          }}
                        >
                          <span className="font-extrabold shrink-0">
                            {OPTION_LETTERS[oIdx] ?? oIdx + 1})
                          </span>
                          <span className="flex-1">{opt}</span>
                          {isCorrectOpt && (
                            <span className="text-[11px] font-extrabold text-emerald-600 shrink-0">
                              Doğru Cevap
                            </span>
                          )}
                          {isChosen && !isCorrectOpt && (
                            <span className="text-[11px] font-extrabold text-red-500 shrink-0">
                              Senin Cevabın
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Çözüm Açıklaması */}
                  {q.question.explanation && (
                    <div
                      className="rounded-xl p-3.5 text-xs sm:text-sm leading-relaxed space-y-1"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <p className="text-[11px] font-extrabold flex items-center gap-1.5" style={{ color: 'var(--brand-primary-text)' }}>
                        <Flame className="w-3.5 h-3.5" />
                        <span>Çözüm Açıklaması</span>
                      </p>
                      <p>{q.question.explanation}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        Kaynak: {formatSourceRefLabel(q.question.sourceRef)}
                      </p>
                    </div>
                  )}

                  {/* İlgili Ayet Çekmecesi + Mushaf/Okuma Ekranında Aç */}
                  <RelatedVerseDrawer question={q.question} showOpenInReader />
                </article>
              );
            })}
          </div>
        )}
      </section>
      {/* Hatalı Soru Bildirim Modalı */}
      <QuestionReportModal
        question={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </div>
  );
};
