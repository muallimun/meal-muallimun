import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  AlignJustify,
  BookOpen,
  Check,
  ChevronDown,
  Columns2,
  FileText,
  KeyRound,
  Loader2,
  Printer,
  Search,
  Shuffle,
  SlidersHorizontal,
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
  getQuestionUid,
  prepareQuestionOptions,
  shuffleArray,
} from '../utils/examUtils';
import { buildSurahQuestionCountMap, formatNumberTr, getSurahMap } from '../utils/poolUtils';
import { normalizeTurkish } from '../utils/textNormalize';

interface PrintableExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSurahNo?: number | null;
}

type PrintScopeMode = 'pool' | 'surah_range' | 'juz_range' | 'multi_surah';

const PRINT_COUNT_OPTIONS = [10, 15, 20, 30, 50, 100, 0] as const;
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
                      [{refText}]
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

  // Tüm 114 sure (meta.json üzerinden)
  const allSurahs = useMemo(() => meta?.surahs ?? [], [meta]);
  const availableSurahSet = useMemo(() => new Set(availableSurahs), [availableSurahs]);

  // q/index.json üzerinden her cüzdeki (1..30) soru sayısı ve sureler
  const juzQuestionCountMap = useMemo(() => {
    const map = new Map<number, { count: number; surahs: Set<number> }>();
    if (!questionIndex) return map;
    for (const item of questionIndex.items) {
      if (typeof item.cuz !== 'number' || item.cuz < 1 || item.cuz > 30) continue;
      let entry = map.get(item.cuz);
      if (!entry) {
        entry = { count: 0, surahs: new Set<number>() };
        map.set(item.cuz, entry);
      }
      entry.count += 1;
      entry.surahs.add(item.surah);
    }
    return map;
  }, [questionIndex]);

  const availableJuzNumbers = useMemo(
    () => Array.from(juzQuestionCountMap.keys()).sort((a, b) => a - b),
    [juzQuestionCountMap],
  );

  // Kapsam: Aktif Çalışma Havuzum | Sure Aralığı | Cüz Aralığı | Çoklu Sure Seçimi
  const [scopeMode, setScopeMode] = useState<PrintScopeMode>(
    initialSurahNo !== null ? 'multi_surah' : 'pool',
  );
  const [surahRangeStart, setSurahRangeStart] = useState<number>(
    initialSurahNo ?? availableSurahs[0] ?? 1,
  );
  const [surahRangeEnd, setSurahRangeEnd] = useState<number>(
    initialSurahNo ?? availableSurahs[availableSurahs.length - 1] ?? 114,
  );
  const [juzRangeStart, setJuzRangeStart] = useState<number>(
    availableJuzNumbers[0] ?? 1,
  );
  const [juzRangeEnd, setJuzRangeEnd] = useState<number>(
    availableJuzNumbers[availableJuzNumbers.length - 1] ?? 30,
  );
  const [multiSelectedSurahs, setMultiSelectedSurahs] = useState<number[]>(() =>
    initialSurahNo !== null ? [initialSurahNo] : availableSurahs,
  );
  const [multiSearchQuery, setMultiSearchQuery] = useState<string>('');
  const [multiOnlyWithQuestions, setMultiOnlyWithQuestions] = useState<boolean>(true);

  // 0 = Tümü (kapsamdaki tüm sorular)
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [examTitle, setExamTitle] = useState<string>(DEFAULT_EXAM_TITLE);
  const [includeAnswerKey, setIncludeAnswerKey] = useState<boolean>(true);
  const [showSourcePerQuestion, setShowSourcePerQuestion] = useState<boolean>(false);
  const [layoutColumns, setLayoutColumns] = useState<1 | 2>(1);
  const [shuffleNonce, setShuffleNonce] = useState<number>(0);

  const [rawPoolQuestions, setRawPoolQuestions] = useState<QuestionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState<boolean>(false);

  // Modal açıldığında başlangıç kapsamını senkronize et
  useEffect(() => {
    if (isOpen) {
      if (initialSurahNo !== null) {
        setScopeMode('multi_surah');
        setMultiSelectedSurahs([initialSurahNo]);
        setSurahRangeStart(initialSurahNo);
        setSurahRangeEnd(initialSurahNo);
      } else {
        setScopeMode('pool');
        if (availableSurahs.length > 0) {
          setSurahRangeStart(availableSurahs[0]);
          setSurahRangeEnd(availableSurahs[availableSurahs.length - 1]);
          setMultiSelectedSurahs((prev) => (prev.length > 0 ? prev : availableSurahs));
        }
      }
      if (availableJuzNumbers.length > 0) {
        setJuzRangeStart(availableJuzNumbers[0]);
        setJuzRangeEnd(availableJuzNumbers[availableJuzNumbers.length - 1]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSurahNo]);

  // Body sınıfı & klavye Escape yönetimi
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('print-exam-active');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMobileSettingsOpen) {
          setIsMobileSettingsOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.classList.remove('print-exam-active');
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isMobileSettingsOpen, onClose]);

  const normSurahStart = Math.min(surahRangeStart, surahRangeEnd);
  const normSurahEnd = Math.max(surahRangeStart, surahRangeEnd);
  const normJuzStart = Math.min(juzRangeStart, juzRangeEnd);
  const normJuzEnd = Math.max(juzRangeStart, juzRangeEnd);

  // Sure aralığı ve Cüz aralığı anlık istatistikleri (q/index.json)
  const surahRangeStats = useMemo(() => {
    const surahsInRange = availableSurahs.filter(
      (sNo) => sNo >= normSurahStart && sNo <= normSurahEnd,
    );
    const questionCountInRange = surahsInRange.reduce(
      (sum, sNo) => sum + (questionCountBySurah.get(sNo) ?? 0),
      0,
    );
    return { surahs: surahsInRange, questionCount: questionCountInRange };
  }, [availableSurahs, normSurahStart, normSurahEnd, questionCountBySurah]);

  const juzRangeStats = useMemo(() => {
    if (!questionIndex) return { surahs: [] as number[], questionCount: 0, itemIds: new Set<string>() };
    const surahSet = new Set<number>();
    const itemIds = new Set<string>();
    let count = 0;
    for (const item of questionIndex.items) {
      if (item.cuz >= normJuzStart && item.cuz <= normJuzEnd) {
        surahSet.add(item.surah);
        itemIds.add(item.id);
        count += 1;
      }
    }
    return {
      surahs: Array.from(surahSet).sort((a, b) => a - b),
      questionCount: count,
      itemIds,
    };
  }, [questionIndex, normJuzStart, normJuzEnd]);

  // Çoklu sure seçimi listesi (arama + sadece sorusu olanlar filtresi)
  const filteredMultiSurahList = useMemo(() => {
    const normQ = normalizeTurkish(multiSearchQuery.trim());
    return allSurahs.filter((s) => {
      if (multiOnlyWithQuestions && !availableSurahSet.has(s.no)) return false;
      if (!normQ) return true;
      return (
        String(s.no).includes(normQ) ||
        normalizeTurkish(s.nameTr).includes(normQ) ||
        normalizeTurkish(s.shortNameTr).includes(normQ)
      );
    });
  }, [allSurahs, multiOnlyWithQuestions, availableSurahSet, multiSearchQuery]);

  const targetSurahs = useMemo(() => {
    if (scopeMode === 'surah_range') return surahRangeStats.surahs;
    if (scopeMode === 'juz_range') return juzRangeStats.surahs;
    if (scopeMode === 'multi_surah') {
      return multiSelectedSurahs
        .filter((sNo) => availableSurahSet.has(sNo))
        .sort((a, b) => a - b);
    }
    if (poolQuestionSurahs.length > 0) return poolQuestionSurahs;
    return availableSurahs;
  }, [
    scopeMode,
    surahRangeStats.surahs,
    juzRangeStats.surahs,
    multiSelectedSurahs,
    availableSurahSet,
    poolQuestionSurahs,
    availableSurahs,
  ]);

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

  // Kapsam (Cüz aralığı filtresi dahil) ve hatalı soru ayarına göre yazdırılabilir havuzu hazırla
  const { eligiblePoolQuestions, skippedReportedCount } = useMemo(() => {
    const eligible: QuestionItem[] = [];
    let skipped = 0;

    for (const q of rawPoolQuestions) {
      if (scopeMode === 'juz_range') {
        const inJuzRange =
          (typeof q.cuz === 'number' && q.cuz >= normJuzStart && q.cuz <= normJuzEnd) ||
          juzRangeStats.itemIds.has(q.id);
        if (!inJuzRange) continue;
      }

      if (questionAudit.skipReportedInExams) {
        const uid = getQuestionUid(q);
        if (questionAudit.reports[uid] || questionAudit.reports[q.id]) {
          skipped += 1;
          continue;
        }
      }
      eligible.push(q);
    }

    return { eligiblePoolQuestions: eligible, skippedReportedCount: skipped };
  }, [
    rawPoolQuestions,
    scopeMode,
    normJuzStart,
    normJuzEnd,
    juzRangeStats.itemIds,
    questionAudit.skipReportedInExams,
    questionAudit.reports,
  ]);

  // Kapsam küçüldüğünde seçili sabit sayı mevcut soru adedini aşıyorsa otomatik "Tümü"ye geçir
  useEffect(() => {
    if (
      questionCount !== 0 &&
      eligiblePoolQuestions.length > 0 &&
      questionCount > eligiblePoolQuestions.length
    ) {
      setQuestionCount(0);
    }
  }, [eligiblePoolQuestions.length, questionCount]);

  // Dengeli/karışık soru seti (questionCount === 0 => kapsamdaki TÜM sorular)
  const preparedQuestions = useMemo(() => {
    void shuffleNonce;
    const effectiveTarget =
      questionCount === 0 ? eligiblePoolQuestions.length : questionCount;
    return pickBalancedPrintableQuestions(eligiblePoolQuestions, effectiveTarget);
  }, [eligiblePoolQuestions, questionCount, shuffleNonce]);

  const scopeSummary = useMemo(() => {
    if (scopeMode === 'surah_range') {
      const startMeta = surahMap.get(normSurahStart);
      const endMeta = surahMap.get(normSurahEnd);
      if (normSurahStart === normSurahEnd) {
        return `${normSurahStart}. ${startMeta?.nameTr ?? `${normSurahStart}. Sure`}`;
      }
      return `${normSurahStart}. ${startMeta?.shortNameTr ?? 'Sure'} – ${normSurahEnd}. ${
        endMeta?.shortNameTr ?? 'Sure'
      } Aralığı`;
    }
    if (scopeMode === 'juz_range') {
      if (normJuzStart === normJuzEnd) {
        return `${normJuzStart}. Cüz`;
      }
      return `${normJuzStart}. Cüz – ${normJuzEnd}. Cüz Aralığı`;
    }
    if (scopeMode === 'multi_surah') {
      if (targetSurahs.length === 0) return 'Seçili Sure Yok';
      const names = targetSurahs
        .slice(0, 6)
        .map((sNo) => surahMap.get(sNo)?.shortNameTr ?? `${sNo}. Sure`);
      const extra = targetSurahs.length - names.length;
      return `Seçili Sureler: ${extra > 0 ? `${names.join(', ')} (+${extra})` : names.join(', ')}`;
    }
    if (targetSurahs.length === 0) return 'Soru Bankası';
    const names = targetSurahs
      .slice(0, 6)
      .map((sNo) => surahMap.get(sNo)?.shortNameTr ?? `${sNo}. Sure`);
    const extra = targetSurahs.length - names.length;
    return `Aktif Havuz (${extra > 0 ? `${names.join(', ')} +${extra} sure` : names.join(', ')})`;
  }, [scopeMode, normSurahStart, normSurahEnd, normJuzStart, normJuzEnd, targetSurahs, surahMap]);

  const toggleMultiSurah = useCallback((surahNo: number) => {
    sfxService.play('click');
    setMultiSelectedSurahs((prev) =>
      prev.includes(surahNo) ? prev.filter((n) => n !== surahNo) : [...prev, surahNo].sort((a, b) => a - b),
    );
  }, []);

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

  const summaryPillLabel = `${preparedQuestions.length} Soru · ${
    layoutColumns === 2 ? 'İki Sütun' : 'Tek Sütun'
  }`;

  // Masaüstü sol kenar çubuğu & mobil alt çekmecede paylaşılan temiz, gruplanmış ayar kartları
  const settingsPanelContent = (
    <div className="space-y-3.5">
      {/* 1. Sınav Başlığı */}
      <div
        className="rounded-xl border p-3 space-y-1.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <label
          htmlFor="print-exam-title-input"
          className="text-[11px] font-extrabold uppercase tracking-wider block"
          style={{ color: 'var(--text-muted)' }}
        >
          Sınav Başlığı
        </label>
        <input
          id="print-exam-title-input"
          type="text"
          value={examTitle}
          onChange={(e) => setExamTitle(e.target.value)}
          placeholder={DEFAULT_EXAM_TITLE}
          className="w-full min-h-[38px] px-2.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600/35"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* 2. Sınav Kapsamı */}
      <div
        className="rounded-xl border p-3 space-y-2.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-extrabold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Sınav Kapsamı
          </span>
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: 'var(--brand-primary-text)' }}
          >
            {formatNumberTr(eligiblePoolQuestions.length)} soru
          </span>
        </div>

        <div
          className="grid grid-cols-4 gap-1 p-1 rounded-xl border"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {(
            [
              { id: 'pool', label: 'Havuz' },
              { id: 'surah_range', label: 'Sure' },
              { id: 'juz_range', label: 'Cüz' },
              { id: 'multi_surah', label: 'Çoklu' },
            ] as { id: PrintScopeMode; label: string }[]
          ).map((opt) => {
            const active = scopeMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setScopeMode(opt.id);
                }}
                className="min-h-[30px] px-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: active ? 'var(--brand-primary)' : 'transparent',
                  color: active ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Mod 1: Aktif Havuz */}
        {scopeMode === 'pool' && (
          <div
            className="px-2.5 py-2 rounded-lg border text-[11px] font-semibold leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
              {scopeSummary}
            </p>
            <p className="mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {targetSurahs.length} sure · {formatNumberTr(eligiblePoolQuestions.length)} hazır soru
            </p>
          </div>
        )}

        {/* Mod 2: Sure Aralığı */}
        {scopeMode === 'surah_range' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="print-surah-start"
                  className="text-[11px] font-bold block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Başlangıç Suresi
                </label>
                <select
                  id="print-surah-start"
                  value={surahRangeStart}
                  onChange={(e) => {
                    sfxService.play('click');
                    setSurahRangeStart(Number(e.target.value));
                  }}
                  className="w-full min-h-[36px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {allSurahs.map((s) => {
                    const cnt = questionCountBySurah.get(s.no) ?? 0;
                    return (
                      <option key={s.no} value={s.no}>
                        {s.no}. {s.nameTr}
                        {cnt > 0 ? ` (${cnt})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="print-surah-end"
                  className="text-[11px] font-bold block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Bitiş Suresi
                </label>
                <select
                  id="print-surah-end"
                  value={surahRangeEnd}
                  onChange={(e) => {
                    sfxService.play('click');
                    setSurahRangeEnd(Number(e.target.value));
                  }}
                  className="w-full min-h-[36px] px-2.5 rounded-lg border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {allSurahs.map((s) => {
                    const cnt = questionCountBySurah.get(s.no) ?? 0;
                    return (
                      <option key={s.no} value={s.no}>
                        {s.no}. {s.nameTr}
                        {cnt > 0 ? ` (${cnt})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <p
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              {surahRangeStats.surahs.length} sure · {formatNumberTr(surahRangeStats.questionCount)}{' '}
              soru
            </p>
          </div>
        )}

        {/* Mod 3: Cüz Aralığı */}
        {scopeMode === 'juz_range' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="print-juz-start"
                  className="text-[11px] font-bold block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Başlangıç
                </label>
                <select
                  id="print-juz-start"
                  value={juzRangeStart}
                  onChange={(e) => {
                    sfxService.play('click');
                    setJuzRangeStart(Number(e.target.value));
                  }}
                  className="w-full min-h-[36px] px-2 rounded-lg border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {Array.from({ length: 30 }, (_, idx) => idx + 1).map((cuzNo) => {
                    const info = juzQuestionCountMap.get(cuzNo);
                    return (
                      <option key={cuzNo} value={cuzNo}>
                        {cuzNo}. Cüz{info ? ` (${info.count})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="print-juz-end"
                  className="text-[11px] font-bold block"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Bitiş
                </label>
                <select
                  id="print-juz-end"
                  value={juzRangeEnd}
                  onChange={(e) => {
                    sfxService.play('click');
                    setJuzRangeEnd(Number(e.target.value));
                  }}
                  className="w-full min-h-[36px] px-2 rounded-lg border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {Array.from({ length: 30 }, (_, idx) => idx + 1).map((cuzNo) => {
                    const info = juzQuestionCountMap.get(cuzNo);
                    return (
                      <option key={cuzNo} value={cuzNo}>
                        {cuzNo}. Cüz{info ? ` (${info.count})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <p
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              {juzRangeStats.surahs.length} sure · {formatNumberTr(juzRangeStats.questionCount)}{' '}
              soru
            </p>
          </div>
        )}

        {/* Mod 4: Çoklu Sure */}
        {scopeMode === 'multi_surah' && (
          <div className="space-y-2">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={multiSearchQuery}
                onChange={(e) => setMultiSearchQuery(e.target.value)}
                placeholder="Sure adı veya no ara..."
                className="w-full min-h-[34px] pl-8 pr-2.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setMultiOnlyWithQuestions((v) => !v);
                }}
                className="min-h-[28px] px-2 rounded-lg border text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: multiOnlyWithQuestions
                    ? 'var(--brand-primary-soft)'
                    : 'var(--bg-surface-soft)',
                  borderColor: multiOnlyWithQuestions
                    ? 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: multiOnlyWithQuestions
                    ? 'var(--brand-primary-text)'
                    : 'var(--text-secondary)',
                }}
              >
                {multiOnlyWithQuestions ? 'Sorusu Olanlar' : 'Tüm 114'}
              </button>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setMultiSelectedSurahs(availableSurahs);
                }}
                className="min-h-[28px] px-2 rounded-lg border text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                Tümü
              </button>
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setMultiSelectedSurahs([]);
                }}
                className="min-h-[28px] px-2 rounded-lg border text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                Temizle
              </button>
            </div>

            <div className="max-h-36 overflow-y-auto scrollbar-thin grid grid-cols-1 gap-1 pr-0.5">
              {filteredMultiSurahList.map((s) => {
                const qCnt = questionCountBySurah.get(s.no) ?? 0;
                const hasQ = qCnt > 0;
                const checked = multiSelectedSurahs.includes(s.no);
                return (
                  <button
                    key={s.no}
                    type="button"
                    disabled={!hasQ}
                    onClick={() => toggleMultiSurah(s.no)}
                    className="min-h-[32px] px-2 py-1 rounded-lg border text-left text-[11px] font-bold flex items-center justify-between gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: checked
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: checked ? 'var(--brand-primary)' : 'var(--border-subtle)',
                      color: checked ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                    }}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0"
                        style={{
                          backgroundColor: checked ? 'var(--brand-primary)' : 'transparent',
                          borderColor: checked ? 'var(--brand-primary)' : 'var(--border-strong)',
                          color: '#FFFFFF',
                        }}
                      >
                        {checked && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span className="truncate">
                        {s.no}. {s.shortNameTr}
                      </span>
                    </span>
                    <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {qCnt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Soru Sayısı (Kompakt Izgara) */}
      <div
        className="rounded-xl border p-3 space-y-2"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px] font-extrabold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Soru Sayısı
          </span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            Baskı: {formatNumberTr(preparedQuestions.length)}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {PRINT_COUNT_OPTIONS.map((cnt) => {
            const isAll = cnt === 0;
            const disabled =
              !isAll &&
              eligiblePoolQuestions.length > 0 &&
              cnt > eligiblePoolQuestions.length;
            const active = questionCount === cnt;

            return (
              <button
                key={cnt}
                type="button"
                disabled={disabled}
                title={
                  disabled
                    ? `Bu kapsamda en fazla ${eligiblePoolQuestions.length} soru bulunuyor`
                    : undefined
                }
                onClick={() => {
                  sfxService.play('click');
                  setQuestionCount(cnt);
                }}
                className={`min-h-[34px] px-2 rounded-lg border text-xs font-extrabold tabular-nums transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed whitespace-nowrap ${
                  isAll ? 'col-span-2' : ''
                }`}
                style={{
                  backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface-soft)',
                  borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: active ? '#FFFFFF' : 'var(--text-primary)',
                }}
              >
                {isAll ? `Tümü (${formatNumberTr(eligiblePoolQuestions.length)})` : cnt}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Sayfa Düzeni & Seçenekler */}
      <div
        className="rounded-xl border p-3 space-y-2.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <span
          className="text-[11px] font-extrabold uppercase tracking-wider block"
          style={{ color: 'var(--text-muted)' }}
        >
          Sayfa Düzeni &amp; Seçenekler
        </span>

        {/* Tek Sütun / İki Sütun Segmenti */}
        <div
          className="grid grid-cols-2 p-1 rounded-xl border gap-1"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
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
            className="min-h-[32px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: layoutColumns === 1 ? 'var(--brand-primary)' : 'transparent',
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
            className="min-h-[32px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            style={{
              backgroundColor: layoutColumns === 2 ? 'var(--brand-primary)' : 'transparent',
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
          className="w-full min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors"
          style={{
            backgroundColor: includeAnswerKey
              ? 'var(--brand-primary-soft)'
              : 'var(--bg-surface-soft)',
            borderColor: includeAnswerKey ? 'var(--brand-primary)' : 'var(--border-subtle)',
            color: includeAnswerKey ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Cevap Anahtarı Ekle</span>
          </span>
          <span
            className="w-8 h-4.5 rounded-full p-0.5 flex items-center transition-colors shrink-0"
            style={{
              backgroundColor: includeAnswerKey ? 'var(--brand-primary)' : 'var(--border-strong)',
              justifyContent: includeAnswerKey ? 'flex-end' : 'flex-start',
            }}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
          </span>
        </button>

        {/* Sure/Ayet Kaynağını Göster */}
        <button
          type="button"
          role="switch"
          aria-checked={showSourcePerQuestion}
          onClick={() => {
            sfxService.play('click');
            setShowSourcePerQuestion((v) => !v);
          }}
          className="w-full min-h-[38px] px-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors"
          style={{
            backgroundColor: showSourcePerQuestion
              ? 'var(--brand-accent-soft)'
              : 'var(--bg-surface-soft)',
            borderColor: showSourcePerQuestion ? 'var(--brand-accent)' : 'var(--border-subtle)',
            color: showSourcePerQuestion ? 'var(--brand-accent-text)' : 'var(--text-secondary)',
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Sure/Ayet Kaynağını Göster</span>
          </span>
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
    </div>
  );

  return (
    <>
      {/* ====================================================================
          A. EKRAN MODALI (Masaüstü: Sol Ayar Paneli + Sağ A4 Sahnesi | Mobil: Çekmeceli Tam Önizleme)
          ==================================================================== */}
      <div
        className="no-print fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4"
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
          className="relative z-10 w-full lg:max-w-6xl h-[96dvh] lg:h-[90vh] rounded-t-3xl lg:rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Tek İnce Üst Başlık Barı */}
          <div
            className="px-3.5 sm:px-5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--brand-primary-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                <Printer className="w-4 h-4" />
              </span>
              <h2
                id="printable-exam-modal-title"
                className="text-sm sm:text-base font-extrabold tracking-tight truncate"
              >
                A4 Sınav Kâğıdı &amp; Cevap Anahtarı
              </h2>
              <span
                className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold tabular-nums whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--brand-primary-text)',
                }}
              >
                {summaryPillLabel}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleReshuffle}
                disabled={isLoading || eligiblePoolQuestions.length === 0}
                className="hidden lg:inline-flex min-h-[36px] px-3 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-45 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <Shuffle className="w-3.5 h-3.5 shrink-0" />
                <span>Yeniden Seç</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading || preparedQuestions.length === 0}
                className="hidden lg:inline-flex min-h-[36px] px-4 rounded-xl text-xs font-extrabold text-white items-center gap-1.5 cursor-pointer transition-transform active:scale-[0.98] disabled:opacity-45 whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Yazdır / A4 PDF Kaydet</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Pencereyi kapat"
                className="w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobil İnce Ayar Özeti Çubuğu (< 1024px) — Önizlemenin üstünü kapatmaz */}
          <div
            className="lg:hidden px-3 py-2 border-b shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setIsMobileSettingsOpen(true);
              }}
              className="w-full min-h-[38px] px-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <SlidersHorizontal
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--brand-primary-text)' }}
                />
                <span className="truncate">Sınav Ayarları ({summaryPillLabel})</span>
              </span>
              <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {/* Gövde: Masaüstünde Sol 320px Ayar Paneli + Sağ Tam Boy A4 Önizleme */}
          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[320px_1fr] overflow-hidden">
            {/* Masaüstü Sol Kenar Ayar Paneli */}
            <aside
              className="hidden lg:block w-80 overflow-y-auto scrollbar-thin border-r p-4"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {settingsPanelContent}
            </aside>

            {/* Sağ Tam Boy A4 Canlı Önizleme Sahnesi (Mobilde ekranın %80'ini kaplar) */}
            <div
              className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 sm:p-5 lg:p-6"
              style={{ backgroundColor: 'var(--bg-canvas)' }}
            >
              {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
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
                <div className="max-w-[794px] mx-auto space-y-2.5">
                  {(skippedReportedCount > 0 ||
                    (questionCount !== 0 && eligiblePoolQuestions.length < questionCount)) && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] px-1">
                      {skippedReportedCount > 0 && (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {skippedReportedCount} hatalı işaretli soru atlandı
                        </span>
                      )}
                      {questionCount !== 0 && eligiblePoolQuestions.length < questionCount && (
                        <span
                          className="font-semibold"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          Bu kapsamda toplam {eligiblePoolQuestions.length} uygun soru bulunduğu
                          için tümü dahil edildi.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Gerçekçi A4 Kağıt Önizlemesi */}
                  <div className="bg-white rounded-xl shadow-lg border border-neutral-300 p-4 sm:p-8 lg:p-9">
                    {sheetElement}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobil Sabit Alt Aksiyon Barı (< 1024px) */}
          <div
            className="lg:hidden px-3 py-2.5 border-t flex items-center gap-2 shrink-0 pb-safe"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={handleReshuffle}
              disabled={isLoading || eligiblePoolQuestions.length === 0}
              className="min-h-[42px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            >
              <Shuffle className="w-4 h-4 shrink-0" />
              <span>Karıştır</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading || preparedQuestions.length === 0}
              className="flex-1 min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Yazdır / PDF Kaydet</span>
            </button>
          </div>

          {/* Mobil Ayarlar Bottom Sheet Alt Çekmecesi (< 1024px) */}
          {isMobileSettingsOpen && (
            <div
              className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-xs"
              role="dialog"
              aria-modal="true"
              aria-label="Sınav ayarları"
              onClick={() => setIsMobileSettingsOpen(false)}
            >
              <div
                className="w-full max-h-[84dvh] rounded-t-3xl border-t flex flex-col overflow-hidden shadow-2xl"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-strong)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal
                      className="w-4 h-4"
                      style={{ color: 'var(--brand-primary-text)' }}
                    />
                    <h3 className="text-sm font-extrabold">Sınav Ayarları</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileSettingsOpen(false)}
                    aria-label="Ayarları kapat"
                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
                  {settingsPanelContent}
                </div>

                <div
                  className="px-4 py-3 border-t shrink-0 pb-safe"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsMobileSettingsOpen(false);
                    }}
                    className="w-full min-h-[44px] rounded-xl text-sm font-extrabold text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Uygula / Önizlemeyi Gör ({preparedQuestions.length} Soru)
                  </button>
                </div>
              </div>
            </div>
          )}
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
