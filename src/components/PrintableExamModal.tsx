import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  AlignJustify,
  BookOpen,
  Columns2,
  FileText,
  KeyRound,
  Loader2,
  Printer,
  Shuffle,
  X,
} from 'lucide-react';
import { FormattedStem } from '../features/exam/FormattedStem';
import { dataService } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { PreparedQuestion, QuestionItem, SurahMeta } from '../types/quran';
import {
  OPTION_LETTERS,
  formatPremiseItem,
  formatVerseRefSummary,
  getMealBasisLabel,
  getQuestionUid,
  prepareQuestionOptions,
  shuffleArray,
} from '../utils/examUtils';
import { buildSurahQuestionCountMap, formatNumberTr, getSurahMap } from '../utils/poolUtils';

interface PrintableExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSurahNo?: number | null;
}

const PRINT_COUNT_OPTIONS = [10, 15, 20, 30] as const;
const DEFAULT_EXAM_TITLE = "Muallimun Kur'an & Meal — Yarışma Deneme Sınavı";

/**
 * Birden fazla sure seçiliyse her sureden dengeli (round-robin) ve karışık seçim yapar.
 */
function pickBalancedPrintableQuestions(
  allQuestions: QuestionItem[],
  targetCount: number,
): PreparedQuestion[] {
  if (allQuestions.length === 0) return [];

  const bySurah = new Map<number, QuestionItem[]>();
  for (const q of allQuestions) {
    const list = bySurah.get(q.surah) ?? [];
    list.push(q);
    bySurah.set(q.surah, list);
  }

  const surahBuckets = shuffleArray(Array.from(bySurah.values())).map((bucket) =>
    shuffleArray(bucket),
  );

  const picked: QuestionItem[] = [];
  const maxTake = Math.min(targetCount, allQuestions.length);

  let round = 0;
  while (picked.length < maxTake) {
    let addedInRound = false;
    for (const bucket of surahBuckets) {
      if (round < bucket.length && picked.length < maxTake) {
        picked.push(bucket[round]);
        addedInRound = true;
      }
    }
    if (!addedInRound) break;
    round += 1;
  }

  return shuffleArray(picked).map((q) => prepareQuestionOptions(q));
}

interface PrintableExamSheetProps {
  examTitle: string;
  scopeSummary: string;
  questions: PreparedQuestion[];
  surahMap: Map<number, SurahMeta>;
  includeAnswerKey: boolean;
  showSourcePerQuestion: boolean;
  columns: 1 | 2;
  dateLabel: string;
  currentYear: number;
}

const PrintableExamSheet: React.FC<PrintableExamSheetProps> = ({
  examTitle,
  scopeSummary,
  questions,
  surahMap,
  includeAnswerKey,
  showSourcePerQuestion,
  columns,
  dateLabel,
  currentYear,
}) => {
  const isTwoCol = columns === 2;
  return (
    <div
      className="bg-white text-neutral-900"
      style={{
        fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, -apple-system, sans-serif',
        color: '#111827',
        backgroundColor: '#ffffff',
      }}
    >
      {/* ====================================================================
          1. SINAV KÂĞIDI ÜST BAŞLIK & ÖĞRENCİ BİLGİ KUTUSU
          ==================================================================== */}
      <header className="pb-4 mb-5 border-b-2 border-teal-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-teal-800 mb-1">
              MUALLİMUN.NET · KUR&apos;AN &amp; MEAL EĞİTİM PLATFORMU
            </p>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-neutral-950 leading-snug">
              {examTitle.trim() || DEFAULT_EXAM_TITLE}
            </h1>
            <p className="text-xs text-neutral-600 mt-1">
              <span className="font-bold text-neutral-800">Kapsam:</span> {scopeSummary}
            </p>
          </div>

          <div className="text-right shrink-0 text-xs text-neutral-700 tabular-nums border border-neutral-300 rounded-lg px-3 py-2 bg-neutral-50">
            <p className="font-extrabold text-neutral-900">{questions.length} Soru</p>
            <p className="text-[11px] text-neutral-600 mt-0.5">{dateLabel}</p>
          </div>
        </div>

        {/* Öğrenci Bilgi Kutusu */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 border border-neutral-400 rounded-lg overflow-hidden text-xs">
          <div className="p-2.5 border-b sm:border-b-0 border-r border-neutral-300">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              Adı Soyadı
            </span>
            <div className="h-5 mt-0.5 border-b border-dotted border-neutral-300" />
          </div>
          <div className="p-2.5 border-b sm:border-b-0 sm:border-r border-neutral-300">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              Sınıf / Grup
            </span>
            <div className="h-5 mt-0.5 border-b border-dotted border-neutral-300" />
          </div>
          <div className="p-2.5 border-r border-neutral-300">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              Numara
            </span>
            <div className="h-5 mt-0.5 border-b border-dotted border-neutral-300" />
          </div>
          <div className="p-2.5 bg-neutral-50/70">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              Puan (D / Y)
            </span>
            <div className="h-5 mt-0.5 border-b border-dotted border-neutral-300" />
          </div>
        </div>
      </header>

      {/* ====================================================================
          2. SORULAR LİSTESİ (Tek veya İki Sütun — Her soru break-inside: avoid korumalı)
          ==================================================================== */}
      <div className={isTwoCol ? 'print-two-col-questions' : 'space-y-4'}>
        {questions.map((item, qIdx) => {
          const surahMeta = surahMap.get(item.question.surah);
          const surahName = surahMeta?.nameTr ?? `${item.question.surah}. Sure`;
          const refText = formatVerseRefSummary(item.verseRefs, surahName, item.question.scope);
          const mealLabel = getMealBasisLabel(item.question.mealBasis);

          return (
            <article
              key={`${item.uid}-${qIdx}`}
              className={
                isTwoCol
                  ? 'print-question-item mb-3 pb-2.5 border-b border-neutral-200'
                  : 'print-question-item pb-3.5 border-b border-neutral-200 last:border-b-0'
              }
            >
              {/* Soru Numarası + Opsiyonel Sure/Ayet Kaynağı */}
              <div className={`flex items-start ${isTwoCol ? 'gap-2' : 'gap-2.5'}`}>
                <span
                  className={`inline-flex items-center justify-center rounded-md bg-neutral-900 text-white font-extrabold tabular-nums shrink-0 mt-0.5 ${
                    isTwoCol ? 'min-w-[20px] h-5 px-1 text-[10.5px]' : 'min-w-[24px] h-6 px-1.5 text-xs'
                  }`}
                >
                  {qIdx + 1}
                </span>

                <div className={`flex-1 min-w-0 ${isTwoCol ? 'space-y-1.5' : 'space-y-2'}`}>
                  {showSourcePerQuestion && (
                    <p
                      className={`font-bold text-teal-800 tracking-wide ${
                        isTwoCol ? 'text-[9.5px]' : 'text-[10px]'
                      }`}
                    >
                      [{refText} · {mealLabel} Meali]
                    </p>
                  )}

                  {/* Varsa I, II, III Öncülleri */}
                  {item.question.premises && item.question.premises.length > 0 && (
                    <div
                      className={`rounded-lg border border-neutral-300 bg-neutral-50 space-y-1 ${
                        isTwoCol ? 'px-2.5 py-1.5' : 'px-3 py-2'
                      }`}
                    >
                      {item.question.premises.map((rawPremise, pIdx) => {
                        const formatted = formatPremiseItem(rawPremise, pIdx);
                        return (
                          <div
                            key={pIdx}
                            className={`flex items-start gap-1.5 leading-snug ${
                              isTwoCol ? 'text-[11px]' : 'text-[13px]'
                            }`}
                          >
                            <span
                              className={`font-extrabold text-neutral-900 shrink-0 ${
                                isTwoCol ? 'min-w-[20px]' : 'min-w-[24px]'
                              }`}
                            >
                              {formatted.roman}
                            </span>
                            <span className="text-neutral-800">{formatted.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Soru Kökü */}
                  <FormattedStem
                    text={item.question.stem}
                    className={
                      isTwoCol
                        ? 'text-[11.5px] font-semibold leading-snug text-neutral-950'
                        : 'text-[13.5px] font-semibold leading-relaxed text-neutral-950'
                    }
                  />

                  {/* Şıklar: A) B) C) D) */}
                  <div
                    className={
                      isTwoCol
                        ? 'grid grid-cols-1 gap-y-1 pt-0.5'
                        : 'grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 pt-1'
                    }
                  >
                    {item.options.map((optText, optIdx) => {
                      const letter = OPTION_LETTERS[optIdx] ?? String.fromCharCode(65 + optIdx);
                      return (
                        <div
                          key={optIdx}
                          className={`flex items-start gap-1.5 leading-snug text-neutral-900 ${
                            isTwoCol ? 'text-[11px]' : 'text-[13px]'
                          }`}
                        >
                          <span
                            className={`font-extrabold text-neutral-950 shrink-0 ${
                              isTwoCol ? 'min-w-[16px]' : 'min-w-[20px]'
                            }`}
                          >
                            {letter})
                          </span>
                          <span>{optText}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Sınav Kağıdı Alt Bilgisi */}
      <div className="mt-6 pt-3 border-t border-neutral-300 flex items-center justify-between text-[10px] text-neutral-500">
        <span>© {currentYear} Muallimun.Net — Kur&apos;an &amp; Meal Eğitim Platformu</span>
        <span>meal.muallimun.net</span>
      </div>

      {/* ====================================================================
          3. CEVAP ANAHTARI VE AÇIKLAMALAR (Ayrı Sayfa Başı)
          ==================================================================== */}
      {includeAnswerKey && (
        <section className="print-page-break pt-6 mt-8 border-t-2 border-dashed border-neutral-300 print:border-t-0 print:mt-0 print:pt-0">
          <div className="pb-3 mb-4 border-b-2 border-teal-800 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-teal-800">
                ÖĞRETMEN / DEĞERLENDİRME SAYFASI
              </p>
              <h2 className="text-lg font-extrabold text-neutral-950 mt-0.5">
                Cevap Anahtarı ve Çözüm Açıklamaları
              </h2>
              <p className="text-xs text-neutral-600">
                {examTitle.trim() || DEFAULT_EXAM_TITLE} · {scopeSummary}
              </p>
            </div>
            <span className="text-xs font-bold tabular-nums text-neutral-700 shrink-0">
              {questions.length} Soru · {dateLabel}
            </span>
          </div>

          {/* Hızlı Optik Kontrol Şeridi (1-A, 2-C, ...) */}
          <div className="mb-4 p-3 rounded-lg border border-neutral-300 bg-neutral-50">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-600 mb-2">
              Hızlı Cevap Şeridi
            </p>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 text-xs tabular-nums">
              {questions.map((item, idx) => {
                const correctLetter =
                  OPTION_LETTERS[item.correctDisplayIndex] ??
                  String.fromCharCode(65 + item.correctDisplayIndex);
                return (
                  <div
                    key={`quick-${item.uid}-${idx}`}
                    className="border border-neutral-300 bg-white rounded px-1.5 py-1 text-center font-bold"
                  >
                    <span className="text-neutral-500 mr-1">{idx + 1}.</span>
                    <span className="text-teal-800 font-extrabold">{correctLetter}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detaylı Cevap Anahtarı Tablosu */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-100 text-neutral-800 border-y border-neutral-400">
                <th className="py-2 px-2 text-center font-extrabold w-10 border-r border-neutral-300">
                  No
                </th>
                <th className="py-2 px-2 text-center font-extrabold w-14 border-r border-neutral-300">
                  Cevap
                </th>
                <th className="py-2 px-2.5 text-left font-extrabold w-44 border-r border-neutral-300">
                  Sure / Ayet Kaynağı
                </th>
                <th className="py-2 px-2.5 text-left font-extrabold">Kısa Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((item, idx) => {
                const surahMeta = surahMap.get(item.question.surah);
                const surahName = surahMeta?.shortNameTr ?? `${item.question.surah}. Sure`;
                const refText = formatVerseRefSummary(
                  item.verseRefs,
                  surahName,
                  item.question.scope,
                );
                const correctLetter =
                  OPTION_LETTERS[item.correctDisplayIndex] ??
                  String.fromCharCode(65 + item.correctDisplayIndex);

                return (
                  <tr
                    key={`ans-${item.uid}-${idx}`}
                    className="print-table-row border-b border-neutral-200 align-top"
                  >
                    <td className="py-2 px-2 text-center font-bold tabular-nums border-r border-neutral-200 text-neutral-700">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-2 text-center font-extrabold text-teal-800 border-r border-neutral-200">
                      {correctLetter}
                    </td>
                    <td className="py-2 px-2.5 font-semibold text-neutral-800 border-r border-neutral-200">
                      {refText}
                    </td>
                    <td className="py-2 px-2.5 text-neutral-700 leading-relaxed">
                      {item.question.explanation ||
                        `Doğru seçenek: ${correctLetter}) ${item.options[item.correctDisplayIndex] ?? ''}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-5 pt-3 border-t border-neutral-300 flex items-center justify-between text-[10px] text-neutral-500">
            <span>© {currentYear} Muallimun.Net — Kur&apos;an &amp; Meal Eğitim Platformu</span>
            <span>Cevap Anahtarı · meal.muallimun.net</span>
          </div>
        </section>
      )}
    </div>
  );
};

export const PrintableExamModal: React.FC<PrintableExamModalProps> = ({
  isOpen,
  onClose,
  initialSurahNo = null,
}) => {
  const { meta, questionIndex, poolStats, questionAudit } = useAppStore();

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);
  const questionCountBySurah = useMemo(
    () => buildSurahQuestionCountMap(questionIndex),
    [questionIndex],
  );

  const availableSurahs = useMemo(
    () => questionIndex?.availableSurahs ?? [],
    [questionIndex],
  );

  const poolQuestionSurahs = useMemo(() => {
    const availSet = new Set(availableSurahs);
    return poolStats.effectiveSurahs.filter((sNo) => availSet.has(sNo));
  }, [availableSurahs, poolStats.effectiveSurahs]);

  // Scope: 'pool' veya tek sure no
  const [scope, setScope] = useState<'pool' | number>(
    initialSurahNo !== null ? initialSurahNo : 'pool',
  );
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [examTitle, setExamTitle] = useState<string>(DEFAULT_EXAM_TITLE);
  const [includeAnswerKey, setIncludeAnswerKey] = useState<boolean>(true);
  const [showSourcePerQuestion, setShowSourcePerQuestion] = useState<boolean>(false);
  const [layoutColumns, setLayoutColumns] = useState<1 | 2>(1);
  const [shuffleNonce, setShuffleNonce] = useState<number>(0);

  const [rawPoolQuestions, setRawPoolQuestions] = useState<QuestionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal açıldığında başlangıç kapsamını senkronize et
  useEffect(() => {
    if (isOpen) {
      setScope(initialSurahNo !== null ? initialSurahNo : 'pool');
    }
  }, [isOpen, initialSurahNo]);

  // Body sınıfı & klavye Escape yönetimi
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('print-exam-active');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.classList.remove('print-exam-active');
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const targetSurahs = useMemo(() => {
    if (scope !== 'pool') return [scope];
    if (poolQuestionSurahs.length > 0) return poolQuestionSurahs;
    return availableSurahs;
  }, [scope, poolQuestionSurahs, availableSurahs]);

  const targetSurahsKey = useMemo(() => targetSurahs.join(','), [targetSurahs]);

  // Seçili kapsamın sorularını yükle
  useEffect(() => {
    if (!isOpen) return;
    if (targetSurahs.length === 0) {
      setRawPoolQuestions([]);
      return;
    }

    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const loaded = await dataService.getQuestionsForSurahs(targetSurahs);
        if (cancelled) return;
        setRawPoolQuestions(loaded);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Yazdırılacak sorular yüklenirken bir hata oluştu.',
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, targetSurahsKey]);

  // Hatalı işaretlenen soruları (ayara bağlı olarak) yazdırılabilir havuzdan ayıkla
  const { eligiblePoolQuestions, skippedReportedCount } = useMemo(() => {
    if (!questionAudit.skipReportedInExams) {
      return { eligiblePoolQuestions: rawPoolQuestions, skippedReportedCount: 0 };
    }
    const eligible: QuestionItem[] = [];
    let skipped = 0;
    for (const q of rawPoolQuestions) {
      const uid = getQuestionUid(q);
      if (questionAudit.reports[uid] || questionAudit.reports[q.id]) {
        skipped += 1;
      } else {
        eligible.push(q);
      }
    }
    return { eligiblePoolQuestions: eligible, skippedReportedCount: skipped };
  }, [rawPoolQuestions, questionAudit.skipReportedInExams, questionAudit.reports]);

  // Dengeli/karışık soru seti (shuffleNonce veya ayar değiştiğinde yeniden üretilir)
  const preparedQuestions = useMemo(() => {
    void shuffleNonce;
    return pickBalancedPrintableQuestions(eligiblePoolQuestions, questionCount);
  }, [eligiblePoolQuestions, questionCount, shuffleNonce]);

  const scopeSummary = useMemo(() => {
    if (scope !== 'pool') {
      return surahMap.get(scope)?.nameTr ?? `${scope}. Sure`;
    }
    if (targetSurahs.length === 0) return 'Soru Bankası';
    const names = targetSurahs
      .slice(0, 6)
      .map((sNo) => surahMap.get(sNo)?.shortNameTr ?? `${sNo}. Sure`);
    const extra = targetSurahs.length - names.length;
    return extra > 0 ? `${names.join(', ')} ve +${extra} sure` : names.join(', ');
  }, [scope, targetSurahs, surahMap]);

  const dateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  const currentYear = new Date().getFullYear();

  const handleReshuffle = useCallback(() => {
    sfxService.play('click');
    setShuffleNonce((n) => n + 1);
  }, []);

  const handlePrint = useCallback(() => {
    if (preparedQuestions.length === 0) return;
    sfxService.play('click');
    window.print();
  }, [preparedQuestions.length]);

  if (!isOpen) return null;

  const sheetElement = (
    <PrintableExamSheet
      examTitle={examTitle}
      scopeSummary={scopeSummary}
      questions={preparedQuestions}
      surahMap={surahMap}
      includeAnswerKey={includeAnswerKey}
      showSourcePerQuestion={showSourcePerQuestion}
      columns={layoutColumns}
      dateLabel={dateLabel}
      currentYear={currentYear}
    />
  );

  return (
    <>
      {/* ====================================================================
          A. EKRAN MODALI (Ayarlar + Etkileşimli A4 Önizleme — Yazdırmada Gizlenir)
          ==================================================================== */}
      <div
        className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="printable-exam-modal-title"
      >
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          className="relative z-10 w-full sm:max-w-5xl h-[94dvh] sm:h-[90dvh] rounded-t-3xl sm:rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Üst Başlık Çubuğu */}
          <div
            className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Printer className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h2
                  id="printable-exam-modal-title"
                  className="text-base sm:text-lg font-extrabold tracking-tight truncate"
                >
                  A4 Yazdırılabilir Sınav Kâğıdı &amp; Cevap Anahtarı
                </h2>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  Sınıf, kurs veya ev çalışması için tek tıkla A4 PDF veya yazıcı çıktısı alın.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || preparedQuestions.length === 0}
                className="min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center gap-2 cursor-pointer transition-transform active:scale-[0.98] disabled:opacity-45"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Yazdır / A4 PDF Kaydet</span>
                <span className="sm:hidden">Yazdır</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Pencereyi kapat"
                className="min-w-[42px] min-h-[42px] rounded-xl border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* İçerik: Üstte Ayarlar Şeridi, Altta A4 Kağıt Önizlemesi */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Ayarlar Paneli */}
            <div
              className="p-4 sm:p-5 border-b space-y-4 shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                {/* Sınav Başlığı */}
                <div className="md:col-span-5 space-y-1.5">
                  <label
                    htmlFor="print-exam-title-input"
                    className="text-xs font-bold block"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Sınav Başlığı
                  </label>
                  <input
                    id="print-exam-title-input"
                    type="text"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder={DEFAULT_EXAM_TITLE}
                    className="w-full min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600/40"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                {/* Kapsam Seçici */}
                <div className="md:col-span-4 space-y-1.5">
                  <label
                    htmlFor="print-exam-scope-select"
                    className="text-xs font-bold block"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Sınav Kapsamı
                  </label>
                  <select
                    id="print-exam-scope-select"
                    value={scope === 'pool' ? 'pool' : String(scope)}
                    onChange={(e) => {
                      sfxService.play('click');
                      const val = e.target.value;
                      setScope(val === 'pool' ? 'pool' : Number(val));
                    }}
                    className="w-full min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-600/40"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="pool">
                      Aktif Çalışma Havuzum (
                      {poolQuestionSurahs.length > 0
                        ? poolQuestionSurahs.length
                        : availableSurahs.length}{' '}
                      Sure)
                    </option>
                    {availableSurahs.map((sNo) => {
                      const sMeta = surahMap.get(sNo);
                      const cnt = questionCountBySurah.get(sNo) ?? sMeta?.questionCount ?? 0;
                      return (
                        <option key={sNo} value={String(sNo)}>
                          {sNo}. {sMeta?.nameTr ?? `${sNo}. Sure`} ({cnt} Soru)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Soru Sayısı Seçici */}
                <div className="md:col-span-3 space-y-1.5">
                  <span
                    className="text-xs font-bold block"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Soru Sayısı (Havuz: {formatNumberTr(eligiblePoolQuestions.length)})
                  </span>
                  <div
                    className="grid grid-cols-4 gap-1 p-1 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {PRINT_COUNT_OPTIONS.map((cnt) => {
                      const active = questionCount === cnt;
                      return (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setQuestionCount(cnt);
                          }}
                          className="min-h-[34px] rounded-lg text-xs font-extrabold tabular-nums transition-colors cursor-pointer"
                          style={{
                            backgroundColor: active ? 'var(--brand-primary)' : 'transparent',
                            color: active ? '#FFFFFF' : 'var(--text-secondary)',
                          }}
                        >
                          {cnt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Seçenek Anahtarları + Sütun Düzeni + Soruları Yeniden Karıştır */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Sayfa Sütun Düzeni: Tek Sütun / İki Sütun */}
                  <div
                    className="inline-flex items-center p-1 rounded-xl border gap-1"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                    role="group"
                    aria-label="Sınav kâğıdı sütun düzeni"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setLayoutColumns(1);
                      }}
                      className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      style={{
                        backgroundColor:
                          layoutColumns === 1 ? 'var(--brand-primary)' : 'transparent',
                        color: layoutColumns === 1 ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      <AlignJustify className="w-3.5 h-3.5 shrink-0" />
                      <span>Tek Sütun</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setLayoutColumns(2);
                      }}
                      className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      style={{
                        backgroundColor:
                          layoutColumns === 2 ? 'var(--brand-primary)' : 'transparent',
                        color: layoutColumns === 2 ? '#FFFFFF' : 'var(--text-secondary)',
                      }}
                    >
                      <Columns2 className="w-3.5 h-3.5 shrink-0" />
                      <span>İki Sütun</span>
                    </button>
                  </div>

                  {/* Cevap Anahtarı Ekle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeAnswerKey}
                    onClick={() => {
                      sfxService.play('click');
                      setIncludeAnswerKey((v) => !v);
                    }}
                    className="min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                    style={{
                      backgroundColor: includeAnswerKey
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: includeAnswerKey
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                      color: includeAnswerKey
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    <span>Cevap Anahtarı</span>
                    <span
                      className="w-8 h-4.5 rounded-full p-0.5 flex items-center transition-colors shrink-0"
                      style={{
                        backgroundColor: includeAnswerKey
                          ? 'var(--brand-primary)'
                          : 'var(--border-strong)',
                        justifyContent: includeAnswerKey ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                    </span>
                  </button>

                  {/* Soru Başına Kaynak Yazdır */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showSourcePerQuestion}
                    onClick={() => {
                      sfxService.play('click');
                      setShowSourcePerQuestion((v) => !v);
                    }}
                    className="min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                    style={{
                      backgroundColor: showSourcePerQuestion
                        ? 'var(--brand-accent-soft)'
                        : 'var(--bg-surface)',
                      borderColor: showSourcePerQuestion
                        ? 'var(--brand-accent)'
                        : 'var(--border-subtle)',
                      color: showSourcePerQuestion
                        ? 'var(--brand-accent-text)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>Sure/Ayet Kaynağı</span>
                    <span
                      className="w-8 h-4.5 rounded-full p-0.5 flex items-center transition-colors shrink-0"
                      style={{
                        backgroundColor: showSourcePerQuestion
                          ? 'var(--brand-accent)'
                          : 'var(--border-strong)',
                        justifyContent: showSourcePerQuestion ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleReshuffle}
                  disabled={isLoading || eligiblePoolQuestions.length === 0}
                  className="min-h-[40px] px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Shuffle className="w-3.5 h-3.5 shrink-0" />
                  <span>Soruları Yeniden Karıştır</span>
                </button>
              </div>
            </div>

            {/* A4 Canlı Önizleme Alanı */}
            <div
              className="flex-1 p-4 sm:p-6"
              style={{ backgroundColor: 'var(--bg-canvas)' }}
            >
              {isLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                  <Loader2
                    className="w-7 h-7 animate-spin"
                    style={{ color: 'var(--brand-primary-text)' }}
                  />
                  <p className="text-sm font-bold">A4 Sınav Kâğıdı Hazırlanıyor...</p>
                </div>
              ) : loadError ? (
                <div className="max-w-md mx-auto surface-card rounded-2xl p-6 text-center space-y-2">
                  <AlertTriangle className="w-7 h-7 mx-auto text-red-500" />
                  <p className="text-sm font-bold">Sorular Yüklenemedi</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {loadError}
                  </p>
                </div>
              ) : preparedQuestions.length === 0 ? (
                <div className="max-w-md mx-auto surface-card rounded-2xl p-6 text-center space-y-2">
                  <FileText
                    className="w-7 h-7 mx-auto"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <p className="text-sm font-bold">Seçili kapsamda yazdırılacak soru bulunamadı.</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Farklı bir sure veya çalışma havuzu seçerek tekrar deneyin.
                  </p>
                </div>
              ) : (
                <div className="max-w-[794px] mx-auto space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-1">
                    <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>
                      A4 Baskı Önizlemesi ({preparedQuestions.length} soru ·{' '}
                      {layoutColumns === 2 ? 'İki Sütun' : 'Tek Sütun'}
                      {includeAnswerKey ? ' + cevap anahtarı' : ''})
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      {skippedReportedCount > 0 && (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {skippedReportedCount} hatalı işaretli soru atlandı
                        </span>
                      )}
                      {eligiblePoolQuestions.length < questionCount && (
                        <span
                          className="font-semibold"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          Bu kapsamda toplam {eligiblePoolQuestions.length} uygun soru bulunduğu
                          için tümü dahil edildi.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* A4 Kağıt Kartı */}
                  <div className="bg-white rounded-xl shadow-lg border border-neutral-300 p-5 sm:p-9">
                    {sheetElement}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          B. BASKI PORTALI (Yalnızca @media print sırasında tam A4 çok sayfalı görünür)
          ==================================================================== */}
      {typeof document !== 'undefined' &&
        preparedQuestions.length > 0 &&
        createPortal(<div className="print-only-sheet">{sheetElement}</div>, document.body)}
    </>
  );
};
