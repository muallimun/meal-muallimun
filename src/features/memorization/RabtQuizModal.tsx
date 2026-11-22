import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Link2,
  Loader2,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { audioQueueService } from '../../services/audioQueueService';
import { useBackButtonGuard } from '../../services/backStackService';
import { dataService } from '../../services/dataService';
import { memorizationAudioController } from '../../services/memorizationAudioController';
import { sfxService } from '../../services/sfxService';
import { wordAudioService } from '../../services/wordAudioService';
import {
  buildReciterAudioUrls,
  findReciterById,
} from '../../config/recitersConfig';
import type { MemorizationUnit } from '../../types/memorization';
import { parseVerseKey } from '../../types/memorization';
import type { CombinedVerse } from '../../types/quran';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';

interface RabtQuizModalProps {
  isOpen: boolean;
  unit: MemorizationUnit | null;
  onClose: () => void;
}

type RabtQuestionType = 'rabt' | 'fasila';

interface RabtQuestion {
  id: string;
  type: RabtQuestionType;
  surah: number;
  ayah: number;
  surahName: string;
  promptArabic: string;
  promptSuffixPlaceholder?: boolean;
  options: {
    id: string;
    arabic: string;
    isCorrect: boolean;
    metaLabel?: string;
  }[];
  correctAnswerRef: string;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function splitArabicWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function extractFasila(text: string): { stem: string; ending: string } | null {
  const words = splitArabicWords(text);
  if (words.length < 3) return null;
  const takeCount = words.length >= 5 ? 2 : 1;
  const stem = words.slice(0, words.length - takeCount).join(' ');
  const ending = words.slice(words.length - takeCount).join(' ');
  if (!stem || !ending) return null;
  return { stem, ending };
}

function normalizeArabicKey(text: string): string {
  return text
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const RabtQuizModal: React.FC<RabtQuizModalProps> = ({
  isOpen,
  unit,
  onClose,
}) => {
  const { meta, manifest, audioPrefs, settings } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<RabtQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [quizSeed, setQuizSeed] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeReciter = useMemo(
    () => findReciterById(audioPrefs.arabicReciterId || audioPrefs.arabicAudioSource, manifest),
    [audioPrefs.arabicReciterId, audioPrefs.arabicAudioSource, manifest],
  );

  const stopPreviewAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current = null;
    }
    setPlayingAudio(false);
  }, []);

  const handleCloseModal = useCallback(() => {
    stopPreviewAudio();
    onClose();
  }, [stopPreviewAudio, onClose]);

  useBackButtonGuard('rabt_quiz_modal', isOpen && Boolean(unit), handleCloseModal);

  useEffect(() => {
    if (!isOpen || !unit) {
      stopPreviewAudio();
      return;
    }
    const releaseLock = acquireBodyScrollLock();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseLock();
      window.removeEventListener('keydown', onKey);
      stopPreviewAudio();
    };
  }, [isOpen, unit, stopPreviewAudio, handleCloseModal]);

  // Ayet verilerini yükle ve Rabt + Fâsıla karma testini üret
  useEffect(() => {
    if (!isOpen || !unit) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedOptionId(null);
    setCorrectCount(0);
    setIsFinished(false);
    stopPreviewAudio();

    const surahIds = Array.from(new Set(unit.ranges.map((r) => r.surah)));
    const surahNameMap = new Map((meta?.surahs ?? []).map((s) => [s.no, s.shortNameTr]));

    Promise.all(surahIds.map((s) => dataService.getSurahBundle(s)))
      .then((bundles) => {
        if (cancelled) return;

        const verseMap = new Map<string, CombinedVerse>();
        const allSurahVerses: CombinedVerse[] = [];
        for (const bundle of bundles) {
          for (const v of bundle.verses) {
            verseMap.set(`${v.surah}:${v.ayah}`, v);
            allSurahVerses.push(v);
          }
        }

        const unitVerses: CombinedVerse[] = unit.verseKeys
          .map((k) => verseMap.get(k))
          .filter((v): v is CombinedVerse => Boolean(v));

        if (unitVerses.length < 2) {
          setLoadError('Rabt testi oluşturmak için bu birimde en az 2 ayet bulunmalıdır.');
          setLoading(false);
          return;
        }

        const candidatePool = allSurahVerses.length >= 4 ? allSurahVerses : unitVerses;
        const rabtQuestions: RabtQuestion[] = [];
        const fasilaQuestions: RabtQuestion[] = [];

        // 1. Tip: Sonraki Ayeti Bağla (Rabt)
        for (let i = 0; i < unitVerses.length - 1; i += 1) {
          const current = unitVerses[i];
          const next = unitVerses[i + 1];
          // Aynı surede ardışık ayet ise ideal Rabt bağlantısı
          if (current.surah !== next.surah || next.ayah !== current.ayah + 1) continue;

          const nextNorm = normalizeArabicKey(next.ar.t);
          const sameSurahDistractors = shuffleArray(
            candidatePool.filter(
              (v) =>
                v.surah === current.surah &&
                v.ayah !== current.ayah &&
                v.ayah !== next.ayah &&
                normalizeArabicKey(v.ar.t) !== nextNorm,
            ),
          );
          const fallbackDistractors = shuffleArray(
            candidatePool.filter(
              (v) =>
                !(v.surah === current.surah && v.ayah === current.ayah) &&
                !(v.surah === next.surah && v.ayah === next.ayah) &&
                normalizeArabicKey(v.ar.t) !== nextNorm,
            ),
          );

          const chosenDistractors: CombinedVerse[] = [];
          const seenNorms = new Set<string>([nextNorm]);
          for (const cand of [...sameSurahDistractors, ...fallbackDistractors]) {
            const norm = normalizeArabicKey(cand.ar.t);
            if (seenNorms.has(norm)) continue;
            seenNorms.add(norm);
            chosenDistractors.push(cand);
            if (chosenDistractors.length === 3) break;
          }

          if (chosenDistractors.length < 2) continue;

          const surahName = surahNameMap.get(current.surah) ?? `${current.surah}. Sure`;
          const options = shuffleArray([
            {
              id: `opt_${next.surah}_${next.ayah}`,
              arabic: next.ar.t,
              isCorrect: true,
              metaLabel: `${surahName} · ${next.ayah}. Ayet`,
            },
            ...chosenDistractors.map((d) => ({
              id: `opt_${d.surah}_${d.ayah}`,
              arabic: d.ar.t,
              isCorrect: false,
              metaLabel: `${surahNameMap.get(d.surah) ?? `${d.surah}. Sure`} · ${d.ayah}. Ayet`,
            })),
          ]);

          rabtQuestions.push({
            id: `rabt_${current.surah}_${current.ayah}`,
            type: 'rabt',
            surah: current.surah,
            ayah: current.ayah,
            surahName,
            promptArabic: current.ar.t,
            options,
            correctAnswerRef: `${surahName} ${next.ayah}. Ayet`,
          });
        }

        // 2. Tip: Fâsıla (Ayet Sonu) Tamamlama
        const endingPool = candidatePool
          .map((v) => ({
            verse: v,
            extracted: extractFasila(v.ar.t),
          }))
          .filter(
            (
              item,
            ): item is { verse: CombinedVerse; extracted: { stem: string; ending: string } } =>
              Boolean(item.extracted),
          );

        for (const verse of unitVerses) {
          const extracted = extractFasila(verse.ar.t);
          if (!extracted) continue;

          const correctNorm = normalizeArabicKey(extracted.ending);
          const sameSurahEndings = shuffleArray(
            endingPool.filter(
              (item) =>
                item.verse.surah === verse.surah &&
                item.verse.ayah !== verse.ayah &&
                normalizeArabicKey(item.extracted.ending) !== correctNorm,
            ),
          );
          const anyEndings = shuffleArray(
            endingPool.filter(
              (item) =>
                !(item.verse.surah === verse.surah && item.verse.ayah === verse.ayah) &&
                normalizeArabicKey(item.extracted.ending) !== correctNorm,
            ),
          );

          const chosenEndings: { ending: string; id: string; metaLabel: string }[] = [];
          const seenNorms = new Set<string>([correctNorm]);
          for (const item of [...sameSurahEndings, ...anyEndings]) {
            const norm = normalizeArabicKey(item.extracted.ending);
            if (seenNorms.has(norm)) continue;
            seenNorms.add(norm);
            chosenEndings.push({
              ending: item.extracted.ending,
              id: `fas_${item.verse.surah}_${item.verse.ayah}`,
              metaLabel: `${surahNameMap.get(item.verse.surah) ?? `${item.verse.surah}. Sure`} · ${item.verse.ayah}. Ayet`,
            });
            if (chosenEndings.length === 3) break;
          }

          if (chosenEndings.length < 2) continue;

          const surahName = surahNameMap.get(verse.surah) ?? `${verse.surah}. Sure`;
          const options = shuffleArray([
            {
              id: `fas_correct_${verse.surah}_${verse.ayah}`,
              arabic: extracted.ending,
              isCorrect: true,
              metaLabel: `${surahName} · ${verse.ayah}. Ayet`,
            },
            ...chosenEndings.map((d) => ({
              id: d.id,
              arabic: d.ending,
              isCorrect: false,
              metaLabel: d.metaLabel,
            })),
          ]);

          fasilaQuestions.push({
            id: `fasila_${verse.surah}_${verse.ayah}`,
            type: 'fasila',
            surah: verse.surah,
            ayah: verse.ayah,
            surahName,
            promptArabic: extracted.stem,
            promptSuffixPlaceholder: true,
            options,
            correctAnswerRef: extracted.ending,
          });
        }

        // Karma havuz (5–10 soru, iki tipten dengeli seçim)
        const targetCount = Math.min(
          10,
          Math.max(5, Math.min(unitVerses.length, rabtQuestions.length + fasilaQuestions.length)),
        );
        const shuffledRabt = shuffleArray(rabtQuestions);
        const shuffledFasila = shuffleArray(fasilaQuestions);
        const mixed: RabtQuestion[] = [];

        let rIdx = 0;
        let fIdx = 0;
        while (mixed.length < targetCount && (rIdx < shuffledRabt.length || fIdx < shuffledFasila.length)) {
          if (rIdx < shuffledRabt.length) {
            mixed.push(shuffledRabt[rIdx]);
            rIdx += 1;
          }
          if (mixed.length < targetCount && fIdx < shuffledFasila.length) {
            mixed.push(shuffledFasila[fIdx]);
            fIdx += 1;
          }
        }

        if (mixed.length === 0) {
          setLoadError('Bu birim için yeterli Rabt veya Fâsıla sorusu üretilemedi.');
        } else {
          setQuestions(mixed);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Ayet verileri yüklenemedi. Lütfen tekrar deneyin.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, unit, meta, quizSeed, stopPreviewAudio]);

  const currentQuestion = questions[currentIndex] ?? null;

  const handlePlayPromptAudio = () => {
    if (!currentQuestion) return;
    if (playingAudio) {
      stopPreviewAudio();
      return;
    }

    const urls = buildReciterAudioUrls(
      activeReciter,
      currentQuestion.surah,
      currentQuestion.ayah,
    );
    if (urls.length === 0) return;

    stopPreviewAudio();
    audioQueueService.pause();
    memorizationAudioController.pause();
    wordAudioService.stop();
    const audio = new Audio();
    audio.preload = 'auto';
    let urlIdx = 0;

    const tryNext = () => {
      if (urlIdx >= urls.length) {
        setPlayingAudio(false);
        return;
      }
      audio.src = urls[urlIdx];
      urlIdx += 1;
      audio
        .play()
        .then(() => setPlayingAudio(true))
        .catch(() => tryNext());
    };

    audio.onended = () => setPlayingAudio(false);
    audio.onerror = () => tryNext();
    audioRef.current = audio;
    tryNext();
  };

  const handleSelectOption = (optionId: string, isCorrect: boolean) => {
    if (selectedOptionId !== null) return;
    setSelectedOptionId(optionId);
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
      sfxService.play('correct');
    } else {
      sfxService.play('wrong');
    }
  };

  const handleNext = () => {
    stopPreviewAudio();
    if (currentIndex + 1 >= questions.length) {
      setIsFinished(true);
      sfxService.play('success');
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    setSelectedOptionId(null);
  };

  const handleRestart = () => {
    sfxService.play('click');
    setQuizSeed((prev) => prev + 1);
  };

  if (!isOpen || !unit) return null;

  const accuracyPct =
    questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  const firstKey = unit.verseKeys[0] ? parseVerseKey(unit.verseKeys[0]) : null;
  const unitMetaLabel = firstKey
    ? `${unit.verseKeys.length} Ayet · ${activeReciter.shortLabel}`
    : `${unit.verseKeys.length} Ayet`;

  return (
    <div
      className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Ayet Bağlama (Rabt) ve Fâsıla Mini Testi"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopPreviewAudio();
          onClose();
        }
      }}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] sm:rounded-2xl rounded-t-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-soft)',
          }}
        >
          <div className="min-w-0 flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Link2 className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold truncate">
                Ayet Bağlama (Rabt) &amp; Fâsıla Testi
              </h2>
              <p
                className="text-[11px] font-medium truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {unit.title} · {unitMetaLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopPreviewAudio();
              onClose();
            }}
            aria-label="Testi kapat"
            className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gövde */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2
                className="w-7 h-7 animate-spin"
                style={{ color: 'var(--brand-primary)' }}
              />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Rabt ve fâsıla soruları hazırlanıyor...
              </p>
            </div>
          ) : loadError ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {loadError}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  color: '#FFFFFF',
                }}
              >
                Havuzuma Dön
              </button>
            </div>
          ) : isFinished ? (
            <div className="py-6 text-center space-y-5">
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor:
                    accuracyPct >= 70 ? 'rgba(16, 185, 129, 0.14)' : 'var(--brand-accent-soft)',
                  color: accuracyPct >= 70 ? '#059669' : 'var(--brand-accent-text)',
                }}
              >
                <Sparkles className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-extrabold">Test Tamamlandı</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {accuracyPct >= 85
                    ? 'Ayet bağlantılarınız ve fâsıla hâkimiyetiniz oldukça sağlam.'
                    : accuracyPct >= 60
                      ? 'Güzel bir ilerleme; kaçırdığınız geçişleri bir kez daha tekrar edebilirsiniz.'
                      : 'Ayet sonu ve geçiş bağlantıları için kısa bir sesli tekrar faydalı olur.'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 max-w-md mx-auto">
                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Doğru
                  </div>
                  <div className="text-xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {correctCount}
                  </div>
                </div>
                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Soru
                  </div>
                  <div className="text-xl font-extrabold tabular-nums">{questions.length}</div>
                </div>
                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Başarı
                  </div>
                  <div
                    className="text-xl font-extrabold tabular-nums"
                    style={{ color: 'var(--brand-primary-text)' }}
                  >
                    %{accuracyPct}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--brand-primary)',
                    color: '#FFFFFF',
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Yeni Sorularla Tekrar Dene</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>Havuzuma Dön</span>
                </button>
              </div>
            </div>
          ) : currentQuestion ? (
            <>
              {/* İlerleme Çubuğu ve Tip Rozeti */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold"
                    style={{
                      backgroundColor:
                        currentQuestion.type === 'rabt'
                          ? 'var(--brand-primary-soft)'
                          : 'var(--brand-accent-soft)',
                      color:
                        currentQuestion.type === 'rabt'
                          ? 'var(--brand-primary-text)'
                          : 'var(--brand-accent-text)',
                    }}
                  >
                    {currentQuestion.type === 'rabt'
                      ? 'Tip 1 · Sonraki Ayeti Bağla (Rabt)'
                      : 'Tip 2 · Fâsıla (Ayet Sonu) Tamamlama'}
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    Soru {currentIndex + 1} / {questions.length} · Doğru: {correctCount}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${((currentIndex + 1) / questions.length) * 100}%`,
                      backgroundColor: 'var(--brand-primary)',
                    }}
                  />
                </div>
              </div>

              {/* Soru Kartı */}
              <div
                className="rounded-2xl border p-4 sm:p-5 space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-bold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {currentQuestion.type === 'rabt'
                      ? `${currentQuestion.surahName} ${currentQuestion.ayah}. Ayet — Sonraki ayet hangisidir?`
                      : `${currentQuestion.surahName} ${currentQuestion.ayah}. Ayet — Ayet sonunu tamamlayın:`}
                  </span>

                  {currentQuestion.type === 'rabt' && (
                    <button
                      type="button"
                      onClick={handlePlayPromptAudio}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: playingAudio
                          ? 'var(--brand-primary)'
                          : 'var(--bg-surface)',
                        borderColor: playingAudio
                          ? 'var(--brand-primary)'
                          : 'var(--border-subtle)',
                        color: playingAudio ? '#FFFFFF' : 'var(--brand-primary-text)',
                      }}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{playingAudio ? 'Durdur' : 'Ayeti Dinle'}</span>
                    </button>
                  )}
                </div>

                <p
                  dir="rtl"
                  lang="ar"
                  className="arabic-text text-right leading-[2.15] select-none"
                  style={{
                    fontSize: `${Math.max(22, Math.min(30, settings.arabicFontSize || 26))}px`,
                    color: 'var(--text-primary)',
                  }}
                >
                  {currentQuestion.promptArabic}
                  {currentQuestion.promptSuffixPlaceholder && (
                    <span
                      className="inline-block mx-2 px-2.5 py-0.5 rounded-lg border border-dashed font-sans text-sm align-middle"
                      style={{
                        borderColor: 'var(--brand-primary)',
                        backgroundColor: 'var(--brand-primary-soft)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      ﴿ ... ﴾
                    </span>
                  )}
                </p>
              </div>

              {/* Seçenekler */}
              <div className="space-y-2.5">
                {currentQuestion.options.map((opt, idx) => {
                  const isAnswered = selectedOptionId !== null;
                  const isSelected = selectedOptionId === opt.id;
                  const showCorrect = isAnswered && opt.isCorrect;
                  const showWrong = isAnswered && isSelected && !opt.isCorrect;

                  const borderColor = showCorrect
                    ? '#10B981'
                    : showWrong
                      ? '#EF4444'
                      : 'var(--border-subtle)';
                  const bgColor = showCorrect
                    ? 'rgba(16, 185, 129, 0.12)'
                    : showWrong
                      ? 'rgba(239, 68, 68, 0.10)'
                      : 'var(--bg-surface)';

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => handleSelectOption(opt.id, opt.isCorrect)}
                      className="w-full text-right rounded-xl border p-3.5 transition-all flex items-start gap-3 cursor-pointer disabled:cursor-default hover:border-[var(--brand-primary)]"
                      style={{
                        backgroundColor: bgColor,
                        borderColor,
                      }}
                    >
                      <span
                        className="w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          backgroundColor: showCorrect
                            ? '#10B981'
                            : showWrong
                              ? '#EF4444'
                              : 'var(--bg-surface-soft)',
                          color:
                            showCorrect || showWrong ? '#FFFFFF' : 'var(--text-secondary)',
                        }}
                      >
                        {showCorrect ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : showWrong ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          String.fromCharCode(65 + idx)
                        )}
                      </span>

                      <div className="flex-1 min-w-0">
                        <p
                          dir="rtl"
                          lang="ar"
                          className="arabic-text text-right leading-[2]"
                          style={{
                            fontSize:
                              currentQuestion.type === 'fasila'
                                ? `${Math.max(22, Math.min(28, settings.arabicFontSize || 24))}px`
                                : `${Math.max(19, Math.min(25, (settings.arabicFontSize || 26) - 3))}px`,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {opt.arabic}
                        </p>
                        {isAnswered && opt.metaLabel && (
                          <p
                            className="text-[11px] font-semibold text-left mt-1"
                            style={{
                              color: showCorrect
                                ? '#059669'
                                : showWrong
                                  ? '#DC2626'
                                  : 'var(--text-muted)',
                            }}
                          >
                            {showCorrect ? 'Doğru cevap · ' : ''}
                            {opt.metaLabel}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Sonraki Soru Aksiyonu */}
              {selectedOptionId !== null && (
                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer shadow-sm transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--brand-primary)',
                      color: '#FFFFFF',
                    }}
                  >
                    <span>
                      {currentIndex + 1 >= questions.length
                        ? 'Sonucu Gör'
                        : 'Sonraki Soru →'}
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
