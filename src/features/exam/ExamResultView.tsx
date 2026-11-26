import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Flag,
  Flame,
  Gauge,
  Loader2,
  Mail,
  MinusCircle,
  PlusCircle,
  Printer,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import { QuestionReportModal } from '../../components/QuestionReportModal';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { ExamResultSummary, PreparedQuestion, QuestionItem } from '../../types/quran';
import {
  EXAM_PASS_THRESHOLD_PCT,
  OPTION_LETTERS,
  buildExamSummaryPlainText,
  calculateAvgSecPerQuestion,
  formatAvgSpeedTr,
  formatDurationTr,
  formatPremiseItem,
  formatShortVerseRef,
  formatSourceRefLabel,
  getDifficultyInfo,
} from '../../utils/examUtils';
import { formatNumberTr, getSurahMap } from '../../utils/poolUtils';
import { FormattedStem } from './FormattedStem';
import { RelatedVerseDrawer } from './RelatedVerseDrawer';

type ReviewFilter = 'all' | 'incorrect_blank' | 'correct';

const CONTACT_MEMORY_STORAGE_KEY = 'muallimun_feedback_contact_v1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface ExamResultViewProps {
  result: ExamResultSummary;
  onRetryIncorrectQuestions: (retryQuestions: PreparedQuestion[], surahs: number[]) => void;
  onNewExam: () => void;
}

function loadSavedContact(): { name: string; email: string } {
  if (typeof window === 'undefined') return { name: '', email: '' };
  try {
    const raw = window.localStorage.getItem(CONTACT_MEMORY_STORAGE_KEY);
    if (!raw) return { name: '', email: '' };
    const parsed = JSON.parse(raw) as { name?: unknown; email?: unknown };
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 100) : '',
      email: typeof parsed.email === 'string' ? parsed.email.slice(0, 150) : '',
    };
  } catch {
    return { name: '', email: '' };
  }
}

async function copyPlainText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({
  result,
  onRetryIncorrectQuestions,
  onNewExam,
}) => {
  const { settings, meta, gamification, questionAudit, toggleBookmarkQuestion, navigateToStudy } =
    useAppStore();

  const incorrectOrBlankCount = result.wrong + result.blank;
  const [filter, setFilter] = useState<ReviewFilter>(
    incorrectOrBlankCount > 0 ? 'incorrect_blank' : 'all',
  );
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(true);
  const [reportTarget, setReportTarget] = useState<QuestionItem | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // İsteğe bağlı sonuç özeti gönderim paneli (yalnızca kullanıcı isterse)
  const [showSendPanel, setShowSendPanel] = useState<boolean>(false);
  const [senderName, setSenderName] = useState<string>(() => loadSavedContact().name);
  const [senderEmail, setSenderEmail] = useState<string>(() => loadSavedContact().email);
  const [senderNote, setSenderNote] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendSuccess, setSendSuccess] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const reviewSectionRef = useRef<HTMLElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);

  useEffect(() => {
    sfxService.play('success');
    setFilter(result.wrong + result.blank > 0 ? 'incorrect_blank' : 'all');
    setIsReviewOpen(true);
    setShowSendPanel(false);
    setSendSuccess(false);
    setSendError(null);
  }, [result.sessionId, result.wrong, result.blank]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const passThreshold = result.passThresholdPct ?? EXAM_PASS_THRESHOLD_PCT;
  const isPassed = result.scorePct >= passThreshold;
  const avgSecPerQuestion =
    result.avgSecPerQuestion ?? calculateAvgSecPerQuestion(result.durationSec, result.totalQuestions);

  const examTitle = result.config.title
    ? result.config.title
    : result.config.isMistakeCamp
      ? 'Hata Kampı Telafi Sınavı'
      : result.endedByNoLives
        ? 'Yarışma Arenası (Canlar Tükendi)'
        : 'Meal Sınavı Sonuç Karnesi';

  // Yanlış veya boş bırakılan tüm sorular (Retry Incorrect Only için)
  const incorrectOrBlankQuestions = useMemo(() => {
    return result.questions.filter((q) => {
      const ans = result.answers[q.uid];
      return !ans || !ans.isCorrect;
    });
  }, [result.questions, result.answers]);

  const incorrectOrBlankSurahs = useMemo(() => {
    return Array.from(new Set(incorrectOrBlankQuestions.map((q) => q.question.surah))).sort(
      (a, b) => a - b,
    );
  }, [incorrectOrBlankQuestions]);

  // Sure bazlı başarı kırılımı (ilk referans ayet bilgisiyle)
  const surahBreakdown = useMemo(() => {
    const map = new Map<
      number,
      {
        surahNo: number;
        total: number;
        correct: number;
        wrong: number;
        blank: number;
        firstAyah: number;
      }
    >();

    for (const q of result.questions) {
      const sNo = q.question.surah;
      const firstRefAyah = q.verseRefs[0] ?? 1;
      const entry = map.get(sNo) ?? {
        surahNo: sNo,
        total: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
        firstAyah: firstRefAyah,
      };
      entry.total += 1;
      if (firstRefAyah > 0 && (entry.firstAyah === 1 || firstRefAyah < entry.firstAyah)) {
        entry.firstAyah = firstRefAyah;
      }
      const ans = result.answers[q.uid];
      if (!ans || ans.selectedIndex === null) {
        entry.blank += 1;
      } else if (ans.isCorrect) {
        entry.correct += 1;
      } else {
        entry.wrong += 1;
      }
      map.set(sNo, entry);
    }

    return Array.from(map.values()).sort((a, b) => a.surahNo - b.surahNo);
  }, [result.questions, result.answers]);

  const summaryPlainText = useMemo(() => {
    return buildExamSummaryPlainText({
      title: examTitle,
      scorePct: result.scorePct,
      passThresholdPct: passThreshold,
      correct: result.correct,
      wrong: result.wrong,
      blank: result.blank,
      totalQuestions: result.totalQuestions,
      durationSec: result.durationSec,
      avgSecPerQuestion,
      surahBreakdown: surahBreakdown.map((item) => ({
        surahNo: item.surahNo,
        surahName: surahMap.get(item.surahNo)?.nameTr ?? `${item.surahNo}. Sure`,
        correct: item.correct,
        total: item.total,
      })),
      completedAt: result.completedAt,
    });
  }, [examTitle, result, passThreshold, avgSecPerQuestion, surahBreakdown, surahMap]);

  const filteredQuestions = useMemo(() => {
    return result.questions
      .map((q, index) => ({ q, index, ans: result.answers[q.uid] }))
      .filter(({ ans }) => {
        if (filter === 'all') return true;
        if (filter === 'correct') return Boolean(ans?.isCorrect);
        if (filter === 'incorrect_blank') return !ans || !ans.isCorrect;
        return true;
      });
  }, [result.questions, result.answers, filter]);

  const scoreMessage = (() => {
    const count = result.totalQuestions;
    if (result.scorePct >= 90) {
      if (count <= 5) {
        return result.scorePct === 100
          ? 'Harika bir başlangıç! Tüm soruları doğru yanıtladınız; daha geniş kapsamlı testlere geçebilirsiniz.'
          : 'Güzel bir başlangıç! Kısa testi hatasız tamamladınız; daha fazla soruyla pekiştirebilirsiniz.';
      }
      if (count <= 15) {
        return 'Çok başarılı! Seçili kapsamdaki soruları yüksek isabetle tamamladınız.';
      }
      return 'Olağanüstü bir performans! Geniş kapsamlı sınavda güçlü bir hâkimiyet gösterdiniz.';
    }
    if (result.scorePct >= passThreshold) {
      if (count <= 5) {
        return 'İyi bir adım! Barajı geçtiniz; eksik kalan ayetlere göz atabilirsiniz.';
      }
      if (count <= 15) {
        return 'Başarılı bir sonuç! Temel noktaları sağlamlaştırdınız.';
      }
      return 'Güçlü ve istikrarlı bir sonuç! Geniş kapsamda barajı rahatça geçtiniz.';
    }
    if (result.scorePct >= 50) {
      return "Güzel bir deneme oldu; yanlışları ve Hata Kampı'nı inceleyerek bir sonraki turda puanınızı yükseltebilirsiniz.";
    }
    return "Her deneme yeni bir öğrenme fırsatıdır; yanlışları ve Hata Kampı'nı inceleyerek bir sonraki turda puanınızı yükseltebilirsiniz.";
  })();

  // SVG dairesel başarı halkası
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (result.scorePct / 100) * circumference;
  const ringColor =
    result.scorePct >= passThreshold ? '#10B981' : result.scorePct >= 50 ? '#F59E0B' : '#EF4444';

  const handleJumpToReview = () => {
    sfxService.play('click');
    setIsReviewOpen(true);
    setFilter(incorrectOrBlankCount > 0 ? 'incorrect_blank' : 'all');
    window.setTimeout(() => {
      reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const handleCopySummary = async () => {
    sfxService.play('click');
    const ok = await copyPlainText(summaryPlainText);
    if (ok) {
      setCopiedSummary(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedSummary(false);
      }, 2400);
    }
  };

  const handlePrintSummary = () => {
    sfxService.play('click');
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  const handleSendSummarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;

    const cleanName = senderName.trim();
    const cleanEmail = senderEmail.trim();
    const cleanNote = senderNote.trim();

    if (cleanName.length < 3 || cleanName.length > 100) {
      setSendError('Lütfen adınızı ve soyadınızı en az 3 karakter olacak şekilde girin.');
      return;
    }
    if (!cleanEmail || cleanEmail.length > 150 || !EMAIL_REGEX.test(cleanEmail)) {
      setSendError('Lütfen geçerli bir e-posta adresi girin.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSendError('Çevrimdışı görünüyorsunuz. Özeti göndermek için internet bağlantınızı kontrol edin.');
      return;
    }

    const combinedMessage = (
      cleanNote ? `Not: ${cleanNote}\n\n${summaryPlainText}` : summaryPlainText
    ).slice(0, 3000);

    const contextRef = `${examTitle} · %${result.scorePct} (${result.correct}/${result.totalQuestions})`.slice(
      0,
      250,
    );
    const metaInfo = `SınavÖzeti | Mod:${result.config.mode} | Süre:${result.durationSec}sn | Ort:${avgSecPerQuestion}sn`.slice(
      0,
      300,
    );
    const pageUrl =
      typeof window !== 'undefined' ? window.location.href.slice(0, 500) : 'https://kuran.muallimun.net';

    setIsSending(true);
    setSendError(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          category: 'Sınav Sonuç Özeti',
          contextRef,
          message: combinedMessage,
          pageUrl,
          metaInfo,
          website: honeypot,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error ||
            'Sonuç özeti şu anda gönderilemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.',
        );
      }

      sfxService.play('correct');
      setSendSuccess(true);
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : 'Sonuç özeti gönderilirken beklenmeyen bir sorun oluştu.',
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* ====================================================================
          1. Üst Karne Kartı: Başarı Halkası, Baraj Rozeti, Süre/Hız ve Sure Kırılımı
          ==================================================================== */}
      <section className="surface-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-5">
          {/* Başarı Halkası */}
          <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center shrink-0">
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
              <span className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight">
                %{result.scorePct}
              </span>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Başarı Oranı
              </span>
            </div>
          </div>

          {/* Özet Metin, Baraj Rozeti ve KPI'lar */}
          <div className="flex-1 text-center md:text-left space-y-3 min-w-0 w-full">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5">
                <span
                  className="text-xs font-extrabold"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  {examTitle}
                </span>

                {/* %70 Hedef Başarı Barajı Rozeti */}
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap"
                  style={{
                    backgroundColor: isPassed
                      ? 'rgba(16, 185, 129, 0.14)'
                      : 'rgba(245, 158, 11, 0.14)',
                    color: isPassed ? '#059669' : '#B45309',
                  }}
                >
                  {isPassed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Target className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {isPassed
                      ? `Başarılı · %${passThreshold} Barajı Geçildi`
                      : `Hedef: %${passThreshold} Başarı Barajı`}
                  </span>
                </span>

                {result.maxStreak >= 2 && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums whitespace-nowrap"
                    style={{
                      backgroundColor: 'var(--brand-accent-soft)',
                      color: 'var(--brand-accent-text)',
                    }}
                  >
                    <Flame className="w-3 h-3 shrink-0" />
                    <span>En İyi Seri: {result.maxStreak}x</span>
                  </span>
                )}
              </div>

              <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight break-words">
                {scoreMessage}
              </h2>
            </div>

            {/* Temizlenen Hata Kutlaması */}
            {result.newlyMasteredCount > 0 && (
              <div
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-left"
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

            {/* İstatistik Satırı: Doğru, Yanlış, Boş, XP, Sınav Süresi & Ortalama Hız */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <div
                className="p-2.5 sm:p-3 rounded-xl"
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
                className="p-2.5 sm:p-3 rounded-xl"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.10)' }}
              >
                <p className="text-lg font-extrabold tabular-nums text-red-500">{result.wrong}</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Yanlış
                </p>
              </div>
              <div
                className="p-2.5 sm:p-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <p className="text-lg font-extrabold tabular-nums">{result.blank}</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Boş
                </p>
              </div>
              <div
                className="p-2.5 sm:p-3 rounded-xl"
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
                className="p-2.5 sm:p-3 rounded-xl col-span-2 sm:col-span-1"
                style={{ backgroundColor: 'var(--bg-surface-soft)' }}
              >
                <p className="text-sm sm:text-base font-extrabold tabular-nums flex items-center justify-center md:justify-start gap-1 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                  <span>{formatDurationTr(result.durationSec)}</span>
                </p>
                <p
                  className="text-[11px] font-semibold mt-0.5 flex items-center justify-center md:justify-start gap-1 tabular-nums"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Gauge className="w-3 h-3 shrink-0" />
                  <span>{formatAvgSpeedTr(avgSecPerQuestion)}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sure Bazlı Kırılım (Topic / Surah Breakdown) */}
        {surahBreakdown.length > 0 && (
          <div className="pt-4 border-t space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Award className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                <h3 className="text-sm font-extrabold tracking-tight">Sure Bazlı Başarı Kırılımı</h3>
              </div>
              <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                {surahBreakdown.length} Sure
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {surahBreakdown.map((item) => {
                const sMeta = surahMap.get(item.surahNo);
                const surahTitle = sMeta
                  ? `${item.surahNo}. ${sMeta.nameTr}`
                  : `${item.surahNo}. Sure`;
                const pct = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0;
                const barColor =
                  pct >= passThreshold ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';

                return (
                  <div
                    key={item.surahNo}
                    className="p-2.5 sm:p-3 rounded-xl border space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-[13px] font-extrabold truncate">
                          {surahTitle}
                        </p>
                        <p
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {item.correct}/{item.total} doğru
                          {item.wrong > 0 ? ` · ${item.wrong} yanlış` : ''}
                          {item.blank > 0 ? ` · ${item.blank} boş` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="text-xs font-extrabold tabular-nums"
                          style={{ color: barColor }}
                        >
                          %{pct}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            navigateToStudy({
                              surah: item.surahNo,
                              ayah: item.firstAyah,
                              ensureMealVisible: true,
                            });
                          }}
                          title={`${surahTitle} mealini Okuma ekranında aç`}
                          className="min-h-[34px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap print:hidden"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <BookOpen className="w-3 h-3 shrink-0" />
                          <span>Oku</span>
                        </button>
                      </div>
                    </div>

                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: barColor,
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
          className="pt-4 border-t space-y-2.5 print:hidden"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            {incorrectOrBlankQuestions.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onRetryIncorrectQuestions(incorrectOrBlankQuestions, incorrectOrBlankSurahs)
                }
                className="min-h-[46px] px-4 sm:px-5 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
                style={{ backgroundColor: 'var(--brand-accent)' }}
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>
                  Yanlış / Boş Soruları Tekrarla ({formatNumberTr(incorrectOrBlankQuestions.length)}{' '}
                  Soru)
                </span>
              </button>
            )}

            {incorrectOrBlankQuestions.length > 0 && (
              <button
                type="button"
                onClick={handleJumpToReview}
                className="min-h-[46px] px-4 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.28)',
                  color: '#DC2626',
                }}
              >
                <XCircle className="w-4 h-4 shrink-0" />
                <span>Hatalı / Boş Soruları İncele ({incorrectOrBlankQuestions.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNewExam}
              className="min-h-[46px] px-5 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer sm:ml-auto transition-transform active:scale-[0.98]"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Yeni Sınav Kur</span>
            </button>
          </div>

          {/* Kompakt Yardımcı Çubuk: Özeti Kopyala | Yazdır | Sonucu Gönder */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleCopySummary()}
              className="min-h-[40px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              style={{
                backgroundColor: copiedSummary
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'var(--bg-surface-soft)',
                borderColor: copiedSummary ? '#10B981' : 'var(--border-subtle)',
                color: copiedSummary ? '#059669' : 'var(--text-primary)',
              }}
            >
              {copiedSummary ? (
                <>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Özet Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>Özeti Kopyala</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrintSummary}
              className="min-h-[40px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>Yazdır</span>
            </button>

            <button
              type="button"
              aria-expanded={showSendPanel}
              onClick={() => {
                sfxService.play('click');
                setShowSendPanel((prev) => !prev);
                setSendError(null);
              }}
              className="min-h-[40px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              style={{
                backgroundColor: showSendPanel
                  ? 'var(--brand-primary-soft)'
                  : 'var(--bg-surface-soft)',
                borderColor: showSendPanel ? 'var(--brand-primary)' : 'var(--border-subtle)',
                color: showSendPanel ? 'var(--brand-primary-text)' : 'var(--text-primary)',
              }}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Sonucu Gönder</span>
            </button>
          </div>

          {/* İsteğe Bağlı Sonuç Özeti Gönderim Formu */}
          {showSendPanel && (
            <form
              onSubmit={(e) => void handleSendSummarySubmit(e)}
              className="rounded-2xl border p-3.5 sm:p-4 space-y-3"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold">Sınav Sonuç Özetini Gönder</p>
                  <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                    Yalnızca sizin onayınızla aşağıdaki sınav özeti iletişim altyapısı üzerinden
                    iletilir.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSendPanel(false)}
                  aria-label="Gönderim formunu kapat"
                  className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {sendSuccess ? (
                <div
                  className="rounded-xl p-3 text-xs font-bold flex items-center gap-2"
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.14)',
                    color: '#059669',
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Sınav sonuç özetiniz başarıyla iletildi.</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label
                        htmlFor="exam-summary-name"
                        className="text-[11px] font-bold block"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Ad Soyad
                      </label>
                      <input
                        id="exam-summary-name"
                        type="text"
                        required
                        minLength={3}
                        maxLength={100}
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="Adınız Soyadınız"
                        className="w-full min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-[var(--brand-primary)]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="exam-summary-email"
                        className="text-[11px] font-bold block"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        E-posta Adresi
                      </label>
                      <input
                        id="exam-summary-email"
                        type="email"
                        required
                        maxLength={150}
                        value={senderEmail}
                        onChange={(e) => setSenderEmail(e.target.value)}
                        placeholder="ornek@eposta.com"
                        className="w-full min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-[var(--brand-primary)]"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="exam-summary-note"
                      className="text-[11px] font-bold block"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Kısa Not (İsteğe Bağlı)
                    </label>
                    <input
                      id="exam-summary-note"
                      type="text"
                      maxLength={300}
                      value={senderNote}
                      onChange={(e) => setSenderNote(e.target.value)}
                      placeholder="Örn. Haftalık tekrar raporu veya öğretmen paylaşım notu"
                      className="w-full min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  {/* Honeypot bot koruması */}
                  <div className="hidden" aria-hidden="true">
                    <input
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  <pre
                    className="rounded-xl border p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-36 overflow-y-auto font-sans"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {summaryPlainText}
                  </pre>

                  {sendError && (
                    <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                      {sendError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSendPanel(false)}
                      className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={isSending}
                      className="min-h-[40px] px-4 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Gönderiliyor...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 shrink-0" />
                          <span>Özeti Gönder</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </section>

      {/* ====================================================================
          2. Açılır/Kapanır Soru İnceleme Bölümü (Tümü | Yanlış / Boş | Doğru)
          ==================================================================== */}
      <section ref={reviewSectionRef} className="space-y-3">
        <div className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                Soru İnceleme ve Ayet Kaynakları
              </h3>
              <p className="text-[11px] sm:text-xs" style={{ color: 'var(--text-muted)' }}>
                Her sorunun doğru cevabını, çözüm gerekçesini ve ilgili ayet mealini inceleyin.
              </p>
            </div>

            <button
              type="button"
              aria-expanded={isReviewOpen}
              onClick={() => {
                sfxService.play('click');
                setIsReviewOpen((prev) => !prev);
              }}
              className="min-h-[40px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer print:hidden"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <span>{isReviewOpen ? 'Gizle' : 'Göster'}</span>
              {isReviewOpen ? (
                <ChevronUp className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
            </button>
          </div>

          {isReviewOpen && (
            <div
              role="tablist"
              aria-label="Soru inceleme filtresi"
              className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 rounded-xl w-full sm:w-auto print:hidden"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {(
                [
                  { id: 'all', label: `Tümü (${result.totalQuestions})` },
                  { id: 'incorrect_blank', label: `Yanlış / Boş (${incorrectOrBlankCount})` },
                  { id: 'correct', label: `Doğru (${result.correct})` },
                ] as { id: ReviewFilter; label: string }[]
              ).map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      sfxService.play('click');
                      setFilter(tab.id);
                    }}
                    className="min-h-[40px] px-2 sm:px-3.5 rounded-lg text-[11px] sm:text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap min-w-0"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color:
                        active && tab.id === 'incorrect_blank' && incorrectOrBlankCount > 0
                          ? '#DC2626'
                          : active
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-secondary)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {isReviewOpen &&
          (filteredQuestions.length === 0 ? (
            <div
              className="surface-card rounded-2xl p-6 text-center text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
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
                const isTimedOut = Boolean(ans?.timedOut);
                const shortRef = formatShortVerseRef(q.question.surah, q.verseRefs);
                const correctLetter =
                  OPTION_LETTERS[q.correctDisplayIndex] ?? String(q.correctDisplayIndex + 1);
                const chosenLetter =
                  ans && ans.selectedIndex !== null
                    ? (OPTION_LETTERS[ans.selectedIndex] ?? String(ans.selectedIndex + 1))
                    : null;

                return (
                  <article
                    key={q.uid}
                    className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-3 min-w-0 overflow-hidden"
                    style={{
                      borderColor: isCorrect
                        ? 'rgba(16, 185, 129, 0.30)'
                        : isBlank
                          ? 'rgba(245, 158, 11, 0.35)'
                          : 'rgba(239, 68, 68, 0.30)',
                    }}
                  >
                    {/* Üst Bilgi Satırı */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs min-w-0">
                        <span className="font-extrabold tabular-nums">#{index + 1}</span>
                        <span
                          className="font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap"
                          style={{
                            backgroundColor: isCorrect
                              ? 'rgba(16, 185, 129, 0.14)'
                              : isBlank
                                ? 'rgba(245, 158, 11, 0.14)'
                                : 'rgba(239, 68, 68, 0.12)',
                            color: isCorrect ? '#059669' : isBlank ? '#B45309' : '#DC2626',
                          }}
                        >
                          {isCorrect ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : isBlank ? (
                            <MinusCircle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>
                            {isCorrect
                              ? 'Doğru'
                              : isTimedOut
                                ? 'Süre Doldu'
                                : isBlank
                                  ? 'Boş'
                                  : 'Yanlış'}
                          </span>
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
                          className="font-bold px-2 py-0.5 rounded-md tabular-nums whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {shortRef}
                        </span>
                        <span
                          className="font-semibold px-2 py-0.5 rounded-md whitespace-nowrap"
                          style={{ backgroundColor: diffInfo.bg, color: diffInfo.color }}
                        >
                          {diffInfo.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                        <button
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setReportTarget(q.question);
                          }}
                          aria-label="Soruyu hatalı olarak işaretle"
                          title="Soruyu hatalı / gözden geçirilecek olarak işaretle"
                          className="min-h-[40px] px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isIssueReported
                              ? 'rgba(239, 68, 68, 0.12)'
                              : 'var(--bg-surface-soft)',
                            borderColor: isIssueReported ? '#EF4444' : 'var(--border-subtle)',
                            color: isIssueReported ? '#DC2626' : 'var(--text-muted)',
                          }}
                        >
                          <Flag
                            className={`w-3.5 h-3.5 shrink-0 ${isIssueReported ? 'fill-current' : ''}`}
                          />
                          <span className="hidden sm:inline">
                            {isIssueReported ? 'Hatalı Bildirildi' : 'Hatalı İşaretle'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleBookmarkQuestion(q.uid)}
                          aria-label={isBookmarked ? 'Yıldızlılardan çıkar' : 'Soruyu yıldızla'}
                          className="min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center cursor-pointer"
                          style={{
                            backgroundColor: isBookmarked
                              ? 'var(--brand-accent-soft)'
                              : 'var(--bg-surface-soft)',
                            borderColor: isBookmarked
                              ? 'var(--brand-accent)'
                              : 'var(--border-subtle)',
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
                        className="rounded-xl p-3 sm:p-3.5 border space-y-1.5"
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
                              className="flex items-start gap-2 text-xs sm:text-sm break-words min-w-0"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <span
                                className="font-extrabold min-w-[24px] shrink-0"
                                style={{ color: 'var(--brand-primary-text)' }}
                              >
                                {roman}
                              </span>
                              <span className="break-words min-w-0">{text}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Soru Kökü */}
                    <FormattedStem
                      text={q.question.stem}
                      className="turkish-reading font-semibold break-words"
                      style={{ fontSize: `${settings.turkishFontSize}px` }}
                    />

                    {/* Kullanıcı Cevabı vs Doğru Cevap Özeti (Hızlı Bakış) */}
                    {!isCorrect && (
                      <div
                        className="rounded-xl px-3 py-2 text-xs font-bold flex flex-wrap items-center gap-x-3 gap-y-1"
                        style={{
                          backgroundColor: isBlank
                            ? 'rgba(245, 158, 11, 0.10)'
                            : 'rgba(239, 68, 68, 0.08)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span style={{ color: isBlank ? '#B45309' : '#DC2626' }}>
                          {isTimedOut
                            ? 'Süre doldu (cevaplanamadı)'
                            : isBlank
                              ? 'Sizin cevabınız: Boş bırakıldı'
                              : `Sizin cevabınız: ${chosenLetter} şıkkı`}
                        </span>
                        <span style={{ color: '#059669' }}>
                          Doğru cevap: {correctLetter} şıkkı
                        </span>
                      </div>
                    )}

                    {/* Şıklar Özeti */}
                    <div className="space-y-2">
                      {q.options.map((opt, oIdx) => {
                        const isCorrectOpt = oIdx === q.correctDisplayIndex;
                        const isChosen = ans?.selectedIndex === oIdx;

                        return (
                          <div
                            key={oIdx}
                            className="px-3 sm:px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-2.5 min-w-0"
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
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <span className="font-extrabold shrink-0">
                                {OPTION_LETTERS[oIdx] ?? oIdx + 1})
                              </span>
                              <span className="flex-1 break-words min-w-0">{opt}</span>
                            </div>
                            {isCorrectOpt && (
                              <span className="text-[11px] font-extrabold text-emerald-600 shrink-0 self-start sm:self-center">
                                Doğru Cevap
                              </span>
                            )}
                            {isChosen && !isCorrectOpt && (
                              <span className="text-[11px] font-extrabold text-red-500 shrink-0 self-start sm:self-center">
                                Sizin Cevabınız
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Çözüm Açıklaması */}
                    {q.question.explanation && (
                      <div
                        className="rounded-xl p-3 sm:p-3.5 text-xs sm:text-sm leading-relaxed space-y-1 break-words"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <p
                          className="text-[11px] font-extrabold flex items-center gap-1.5"
                          style={{ color: 'var(--brand-primary-text)' }}
                        >
                          <Flame className="w-3.5 h-3.5 shrink-0" />
                          <span>Çözüm Açıklaması</span>
                        </p>
                        <p className="break-words">{q.question.explanation}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Kaynak: {formatSourceRefLabel(q.question.sourceRef)}
                        </p>
                      </div>
                    )}

                    {/* İlgili Ayet Çekmecesi + Okuyucuda Aç */}
                    <RelatedVerseDrawer question={q.question} showOpenInReader />
                  </article>
                );
              })}
            </div>
          ))}
      </section>

      {/* Hatalı Soru Bildirim Modalı */}
      <QuestionReportModal question={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
};
