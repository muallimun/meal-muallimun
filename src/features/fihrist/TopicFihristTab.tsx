import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Headphones,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Printer,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import { ResponsiveActionMenu } from '../../components/ResponsiveActionMenu';
import { getMealTextPresentation } from '../../config/mealsConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { audioQueueService } from '../../services/audioQueueService';
import { dataService, toArabicIndicDigits } from '../../services/dataService';
import { researchStorage } from '../../services/researchStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import { TURKISH_FIHRIST_LETTERS, type FihristTopic } from '../../types/fihrist';
import type { CombinedVerse } from '../../types/quran';
import { getSurahMap } from '../../utils/poolUtils';
import { normalizeTurkish } from '../../utils/textNormalize';
import { PrintableFihristModal } from './PrintableFihristModal';

type TopicDisplayMode = 'ar_meal' | 'meal' | 'ar';

interface TopicFihristTabProps {
  selectedTopicIdOverride?: string | null;
  onClearTopicOverride?: () => void;
  onCopiedToNotebook?: (newTopicId: string, topicTitle: string) => void;
}

const VERSE_BATCH_SIZE = 40;

function countTopicAyahs(topic: FihristTopic): number {
  let total = 0;
  for (const [, start, end] of topic.refs) {
    total += Math.max(1, Math.abs(end - start) + 1);
  }
  return total;
}

function getTurkishLetterOrder(letter: string): number {
  const idx = TURKISH_FIHRIST_LETTERS.indexOf(
    letter as (typeof TURKISH_FIHRIST_LETTERS)[number],
  );
  return idx === -1 ? 999 : idx;
}

export const TopicFihristTab: React.FC<TopicFihristTabProps> = ({
  selectedTopicIdOverride,
  onClearTopicOverride,
  onCopiedToNotebook,
}) => {
  const {
    meta,
    manifest,
    settings,
    audioPrefs,
    navigateToStudy,
    openQuickMemorize,
    openMealSelector,
  } = useAppStore();

  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  const surahMap = useMemo(() => getSurahMap(meta), [meta]);

  const [topics, setTopics] = useState<FihristTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string>('ALL');
  const [isMobileLettersOpen, setIsMobileLettersOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const [displayMode, setDisplayMode] = useState<TopicDisplayMode>('ar_meal');
  const [topicVerses, setTopicVerses] = useState<CombinedVerse[]>([]);
  const [isLoadingVerses, setIsLoadingVerses] = useState(false);
  const [visibleCount, setVisibleCount] = useState(VERSE_BATCH_SIZE);
  const [openFootnotes, setOpenFootnotes] = useState<Record<number, boolean>>({});
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [justCopiedId, setJustCopiedId] = useState<string | null>(null);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);

  const detailTopRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  // 1. Konu Fihristi JSON dosyasını tembel yükle
  useEffect(() => {
    let cancelled = false;
    setIsLoadingTopics(true);
    dataService
      .getFihristTopics()
      .then((file) => {
        if (cancelled) return;
        const list = Array.isArray(file.topics) ? file.topics : [];
        setTopics(list);
        if (list.length > 0) {
          setSelectedTopicId((prev) => prev ?? list[0].id);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTopics(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Genel aramadan gelen konu kimliğini doğrudan seç ve detay görünümünü aç
  useEffect(() => {
    if (!selectedTopicIdOverride || topics.length === 0) return;
    const target = topics.find((t) => t.id === selectedTopicIdOverride);
    if (target) {
      setSearchQuery('');
      setSelectedLetter('ALL');
      setSelectedTopicId(target.id);
      setMobileShowDetail(true);
      window.setTimeout(() => {
        detailTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
    onClearTopicOverride?.();
  }, [selectedTopicIdOverride, topics, onClearTopicOverride]);

  // 2. Yalnızca içinde konu bulunan harfleri Türk alfabesi sırasına göre çıkar
  const availableLetters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of topics) {
      const letter = (t.letter || t.title.slice(0, 1)).toLocaleUpperCase('tr-TR');
      counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => {
        const diff = getTurkishLetterOrder(a) - getTurkishLetterOrder(b);
        return diff !== 0 ? diff : a.localeCompare(b, 'tr-TR');
      })
      .map(([letter, count]) => ({ letter, count }));
  }, [topics]);

  // 3. Arama + harf filtresi (normalizeTurkish ile Türkçe duyarsız)
  const filteredTopics = useMemo(() => {
    const normQuery = normalizeTurkish(searchQuery);
    return topics.filter((topic) => {
      const topicLetter = (topic.letter || topic.title.slice(0, 1)).toLocaleUpperCase('tr-TR');
      if (!normQuery && selectedLetter !== 'ALL' && topicLetter !== selectedLetter) {
        return false;
      }
      if (!normQuery) return true;
      const haystack = normalizeTurkish(
        `${topic.title} ${(topic.tags ?? []).join(' ')} ${topic.seeAlso ?? ''}`,
      );
      return haystack.includes(normQuery);
    });
  }, [topics, searchQuery, selectedLetter]);

  // Masaüstünde filtre değiştiğinde geçerli seçimi koru veya ilk sonuca geç
  useEffect(() => {
    if (filteredTopics.length === 0) return;
    if (!selectedTopicId || !filteredTopics.some((t) => t.id === selectedTopicId)) {
      setSelectedTopicId(filteredTopics[0].id);
    }
  }, [filteredTopics, selectedTopicId]);

  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) ?? filteredTopics[0] ?? null,
    [topics, selectedTopicId, filteredTopics],
  );

  // Seçili konudaki tekil sure numaraları -> useActiveMeals (24 meal + tek/çift meal)
  const selectedSurahNos = useMemo(() => {
    if (!selectedTopic) return [] as number[];
    const set = new Set<number>();
    for (const [surahNo] of selectedTopic.refs) {
      if (Number.isInteger(surahNo) && surahNo >= 1 && surahNo <= 114) {
        set.add(surahNo);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [selectedTopic]);

  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(selectedSurahNos);

  // 4. Seçili konunun ayetlerini paralel yükle
  useEffect(() => {
    if (!selectedTopic) {
      setTopicVerses([]);
      setIsLoadingVerses(false);
      return;
    }

    let cancelled = false;
    setIsLoadingVerses(true);
    setVisibleCount(VERSE_BATCH_SIZE);
    setOpenFootnotes({});

    const uniqueSurahs = Array.from(new Set(selectedTopic.refs.map(([s]) => s)));

    Promise.all(
      uniqueSurahs.map(async (sNo) => {
        try {
          const bundle = await dataService.getSurahBundle(sNo);
          return [sNo, bundle] as const;
        } catch {
          return [sNo, null] as const;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const bundleMap = new Map(entries);
        const verses: CombinedVerse[] = [];
        const seenIds = new Set<number>();

        for (const [surahNo, rawStart, rawEnd] of selectedTopic.refs) {
          const bundle = bundleMap.get(surahNo);
          if (!bundle) continue;
          const byAyah = new Map(bundle.verses.map((v) => [v.ayah, v]));
          const start = Math.max(1, Math.min(rawStart, rawEnd));
          const end = Math.max(start, Math.max(rawStart, rawEnd));

          for (let a = start; a <= end; a += 1) {
            const v = byAyah.get(a);
            if (!v || seenIds.has(v.id)) continue;
            seenIds.add(v.id);
            verses.push(v);
          }
        }

        setTopicVerses(verses);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVerses(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTopic]);

  // "Ayrıca bak." hedef konusunu eşleştir
  const seeAlsoTarget = useMemo(() => {
    if (!selectedTopic?.seeAlso) return null;
    const cleaned = selectedTopic.seeAlso
      .replace(/^\s*ayrıca\s+bak\.?\s*:?\s*/i, '')
      .trim();
    if (!cleaned) return null;
    const normTarget = normalizeTurkish(cleaned);
    if (!normTarget) return null;

    const exact = topics.find(
      (t) => t.id !== selectedTopic.id && normalizeTurkish(t.title) === normTarget,
    );
    if (exact) return exact;

    return (
      topics.find(
        (t) =>
          t.id !== selectedTopic.id &&
          (normalizeTurkish(t.title).includes(normTarget) ||
            normTarget.includes(normalizeTurkish(t.title))),
      ) ?? null
    );
  }, [selectedTopic, topics]);

  const handleSelectTopic = (topic: FihristTopic) => {
    sfxService.play('click');
    setSelectedTopicId(topic.id);
    setMobileShowDetail(true);
    window.setTimeout(() => {
      detailTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  };

  const handleJumpSeeAlso = () => {
    if (!selectedTopic?.seeAlso) return;
    sfxService.play('click');
    if (seeAlsoTarget) {
      setSearchQuery('');
      setSelectedLetter('ALL');
      setSelectedTopicId(seeAlsoTarget.id);
      setMobileShowDetail(true);
      return;
    }
    const cleaned = selectedTopic.seeAlso
      .replace(/^\s*ayrıca\s+bak\.?\s*:?\s*/i, '')
      .trim();
    setSelectedLetter('ALL');
    setSearchQuery(cleaned);
    setMobileShowDetail(false);
  };

  const handleListenTopic = (startIndex = 0) => {
    if (!selectedTopic || !manifest || !meta || topicVerses.length === 0) return;
    sfxService.play('click');
    audioQueueService.startQueue({
      verses: topicVerses,
      startIndex,
      context: 'surah',
      contextKey: `fihrist:${selectedTopic.id}`,
      manifest,
      meta,
      prefs: audioPrefs,
      queueTitle: selectedTopic.title,
    });
  };

  const handleCopyToNotebook = () => {
    if (!selectedTopic) return;
    sfxService.play('click');
    const created = researchStorage.copyFromFihrist(selectedTopic);
    setJustCopiedId(selectedTopic.id);
    window.setTimeout(() => setJustCopiedId(null), 2200);
    onCopiedToNotebook?.(created.id, selectedTopic.title);
  };

  const printItems = useMemo(
    () =>
      selectedTopic
        ? selectedTopic.refs.map(([surah, startAyah, endAyah]) => ({
            surah,
            startAyah,
            endAyah,
          }))
        : [],
    [selectedTopic],
  );

  const displayedVerses = useMemo(
    () => topicVerses.slice(0, visibleCount),
    [topicVerses, visibleCount],
  );

  const isTopicPlaying =
    Boolean(selectedTopic) &&
    audioState.contextKey === `fihrist:${selectedTopic?.id}` &&
    (audioState.status === 'playing' || audioState.status === 'loading');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)] gap-4 items-start">
        {/* ==================================================================
            SOL PANEL — Arama + Kompakt A–Z Şeridi + Konu Listesi
            Mobilde detay açıkken gizlenir
            ================================================================== */}
        <aside
          className={`${
            mobileShowDetail ? 'hidden lg:flex' : 'flex'
          } flex-col surface-card rounded-2xl overflow-hidden lg:sticky lg:top-16 lg:h-[calc(100dvh-11.5rem)] min-w-0`}
        >
          {/* Arama Kutusu + Mobilde Tek Satır Harf Seçici */}
          <div
            className="p-2.5 sm:p-3 border-b space-y-2 sm:space-y-2.5 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="601 konu içinde ara (sabır, takva...)"
                  aria-label="Konu fihristinde ara"
                  className="w-full min-h-[38px] sm:min-h-[40px] pl-9 pr-8 rounded-xl border text-xs sm:text-sm font-medium outline-none transition-colors focus:border-teal-600"
                  style={{
                    backgroundColor: 'var(--bg-surface-soft)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Aramayı temizle"
                    className="w-7 h-7 rounded-lg flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Mobil (< md) Kompakt Harf Filtresi Butonu */}
              <div className="md:hidden shrink-0 flex items-center">
                {selectedLetter !== 'ALL' && !searchQuery ? (
                  <div
                    className="inline-flex items-center rounded-xl border overflow-hidden min-h-[38px]"
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      borderColor: 'rgba(16, 185, 129, 0.42)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setIsMobileLettersOpen((v) => !v);
                      }}
                      aria-expanded={isMobileLettersOpen}
                      className="min-h-[36px] pl-2.5 pr-1.5 text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>Harf: {selectedLetter}</span>
                      {isMobileLettersOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setSelectedLetter('ALL');
                        setIsMobileLettersOpen(false);
                      }}
                      aria-label="Harf filtresini temizle"
                      title="Harf filtresini temizle"
                      className="min-h-[36px] px-2 border-l inline-flex items-center justify-center cursor-pointer"
                      style={{ borderColor: 'rgba(16, 185, 129, 0.32)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setIsMobileLettersOpen((v) => !v);
                    }}
                    aria-expanded={isMobileLettersOpen}
                    className="min-h-[38px] px-2.5 rounded-xl border text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: isMobileLettersOpen
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface-soft)',
                      borderColor: isMobileLettersOpen
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                      color: isMobileLettersOpen
                        ? 'var(--brand-primary-text)'
                        : 'var(--text-primary)',
                    }}
                  >
                    <span>Harf: Tümü</span>
                    {isMobileLettersOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 shrink-0 opacity-75" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-75" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* A–Z Harf Mini Izgarası (Mobilde tek tıkla açılır ve seçimde kapanır; md+ daima açık) */}
            <div
              className={`${
                isMobileLettersOpen ? 'flex' : 'hidden'
              } md:flex flex-wrap items-center gap-1`}
            >
              <button
                type="button"
                onClick={() => {
                  sfxService.play('click');
                  setSelectedLetter('ALL');
                  setIsMobileLettersOpen(false);
                }}
                className="min-w-[30px] h-7 px-2.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer shrink-0"
                style={{
                  backgroundColor:
                    selectedLetter === 'ALL' && !searchQuery
                      ? 'var(--brand-primary)'
                      : 'var(--bg-surface-soft)',
                  color:
                    selectedLetter === 'ALL' && !searchQuery
                      ? '#FFFFFF'
                      : 'var(--text-secondary)',
                }}
              >
                Tümü
              </button>
              {availableLetters.map(({ letter, count }) => {
                const active = selectedLetter === letter && !searchQuery;
                return (
                  <button
                    key={letter}
                    type="button"
                    title={`${letter} harfi (${count} konu)`}
                    onClick={() => {
                      sfxService.play('click');
                      setSearchQuery('');
                      setSelectedLetter(letter);
                      setIsMobileLettersOpen(false);
                    }}
                    className="min-w-[30px] h-7 px-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer shrink-0"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-primary)'
                        : 'var(--bg-surface-soft)',
                      color: active ? '#FFFFFF' : 'var(--text-secondary)',
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>

            <div
              className="flex items-center justify-between text-[11px] font-semibold tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>
                {searchQuery
                  ? `Arama sonucu: ${filteredTopics.length} konu`
                  : selectedLetter === 'ALL'
                    ? `Toplam ${topics.length} konu`
                    : `${selectedLetter} harfi · ${filteredTopics.length} konu`}
              </span>
              {selectedLetter !== 'ALL' && !searchQuery && (
                <button
                  type="button"
                  onClick={() => setSelectedLetter('ALL')}
                  className="font-bold cursor-pointer hover:underline"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  Tümünü göster
                </button>
              )}
            </div>
          </div>

          {/* Konu Listesi */}
          <div className="flex-1 overflow-y-auto divide-y scrollbar-thin" style={{ borderColor: 'var(--border-subtle)' }}>
            {isLoadingTopics ? (
              <div className="py-14 flex flex-col items-center justify-center gap-2">
                <Loader2
                  className="w-5 h-5 animate-spin"
                  style={{ color: 'var(--brand-primary)' }}
                />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Konu fihristi yükleniyor...
                </span>
              </div>
            ) : filteredTopics.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-bold">Eşleşen konu bulunamadı</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Farklı bir anahtar kelime deneyin veya harf filtresini temizleyin.
                </p>
              </div>
            ) : (
              filteredTopics.map((topic) => {
                const active = selectedTopic?.id === topic.id;
                const ayahTotal = countTopicAyahs(topic);

                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => handleSelectTopic(topic)}
                    className="w-full text-left px-3.5 py-3 flex items-center justify-between gap-2.5 transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--brand-primary-soft)' : 'transparent',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xs sm:text-[13px] font-bold leading-snug"
                        style={{
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-primary)',
                        }}
                      >
                        {topic.title}
                      </p>
                      {topic.tags && topic.tags.length > 0 && (
                        <p
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {topic.tags.join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums"
                        style={{
                          backgroundColor: active
                            ? 'var(--bg-surface)'
                            : 'var(--bg-surface-soft)',
                          color: active ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                        }}
                      >
                        {ayahTotal}
                      </span>
                      <ChevronRight
                        className="w-3.5 h-3.5 lg:hidden shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ==================================================================
            SAĞ PANEL — Seçili Konu Detayı ve Ayet Kartları
            ================================================================== */}
        <section
          ref={detailTopRef}
          className={`${mobileShowDetail ? 'block' : 'hidden lg:block'} min-w-0 space-y-3.5`}
        >
          {/* Mobil Yapışkan Geri Dönüş Çubuğu */}
          <div
            className="lg:hidden sticky top-14 z-20 -mx-1 px-1 py-1.5 backdrop-blur-md"
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 92%, transparent)' }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setMobileShowDetail(false);
              }}
              className="min-h-[38px] px-3 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Konulara Dön</span>
            </button>
          </div>

          {!selectedTopic ? (
            <div className="surface-card rounded-2xl p-8 text-center">
              <p className="text-sm font-bold">İncelemek için soldan bir konu seçin</p>
            </div>
          ) : (
            <>
              {/* Konu Üst Kartı */}
              <div className="surface-card rounded-2xl p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="w-7 h-7 rounded-lg text-xs font-extrabold inline-flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {selectedTopic.letter}
                      </span>
                      <h3 className="text-base sm:text-lg font-extrabold tracking-tight leading-snug">
                        {selectedTopic.title}
                      </h3>
                      <span
                        className="px-2 py-0.5 rounded-lg text-[11px] font-extrabold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {topicVerses.length > 0
                          ? `${topicVerses.length} Ayet`
                          : `${countTopicAyahs(selectedTopic)} Ayet`}
                      </span>
                    </div>

                    {selectedTopic.tags && selectedTopic.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedTopic.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedTopic.seeAlso && (
                      <button
                        type="button"
                        onClick={handleJumpSeeAlso}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--brand-accent-soft)',
                          borderColor: 'rgba(217, 119, 6, 0.35)',
                          color: 'var(--brand-accent-text)',
                        }}
                      >
                        <span>
                          Ayrıca bak:{' '}
                          {selectedTopic.seeAlso.replace(/^\s*ayrıca\s+bak\.?\s*:?\s*/i, '')}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    )}
                  </div>

                  {/* Ana Aksiyonlar (Mobilde Dinle + '⋯' Diğer İşlemler, Masaüstünde Tam Şerit) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleListenTopic(0)}
                      disabled={isLoadingVerses || topicVerses.length === 0}
                      className="min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      {isTopicPlaying ? (
                        <Volume2 className="w-3.5 h-3.5 animate-pulse shrink-0" />
                      ) : (
                        <Headphones className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>Konuyu Dinle</span>
                    </button>

                    {/* Masaüstü (sm+) ikincil aksiyonlar */}
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setIsPrintOpen(true);
                      }}
                      disabled={selectedTopic.refs.length === 0}
                      className="hidden sm:inline-flex min-h-[38px] px-3 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Printer className="w-3.5 h-3.5 shrink-0" />
                      <span>Yazdır / PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyToNotebook}
                      title="Bu konuyu kişisel Araştırma Defterime kopyala"
                      className="hidden sm:inline-flex min-h-[38px] px-3 rounded-xl border text-xs font-bold items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor:
                          justCopiedId === selectedTopic.id
                            ? 'var(--brand-primary-soft)'
                            : 'var(--bg-surface-soft)',
                        borderColor:
                          justCopiedId === selectedTopic.id
                            ? 'var(--brand-primary)'
                            : 'var(--border-subtle)',
                        color:
                          justCopiedId === selectedTopic.id
                            ? 'var(--brand-primary-text)'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {justCopiedId === selectedTopic.id ? (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <NotebookPen className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {justCopiedId === selectedTopic.id ? 'Kopyalandı' : 'Defterime Kopyala'}
                      </span>
                    </button>

                    {/* Mobil (< sm) kompakt '⋯' Diğer İşlemler menüsü */}
                    <div className="relative sm:hidden">
                      <button
                        ref={mobileMenuTriggerRef}
                        type="button"
                        onClick={() => {
                          sfxService.play('click');
                          setIsMobileActionsOpen((v) => !v);
                        }}
                        aria-label="Diğer işlemler"
                        aria-expanded={isMobileActionsOpen}
                        className="w-9 h-[38px] rounded-xl border flex items-center justify-center cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      <ResponsiveActionMenu
                        isOpen={isMobileActionsOpen}
                        onClose={() => setIsMobileActionsOpen(false)}
                        title={`${selectedTopic.title} · İşlemler`}
                        triggerRef={mobileMenuTriggerRef}
                        menuWidthClass="w-48"
                      >
                        <button
                          type="button"
                          disabled={selectedTopic.refs.length === 0}
                          onClick={() => {
                            sfxService.play('click');
                            setIsMobileActionsOpen(false);
                            setIsPrintOpen(true);
                          }}
                          className="w-full min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center gap-2 text-left cursor-pointer disabled:opacity-45 hover:bg-[var(--bg-surface-soft)]"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <Printer className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                          <span>Yazdır / A4 PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileActionsOpen(false);
                            handleCopyToNotebook();
                          }}
                          className="w-full min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center gap-2 text-left cursor-pointer hover:bg-[var(--bg-surface-soft)]"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {justCopiedId === selectedTopic.id ? (
                            <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                          ) : (
                            <NotebookPen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                          )}
                          <span>
                            {justCopiedId === selectedTopic.id ? 'Deftere Kopyalandı' : 'Defterime Kopyala'}
                          </span>
                        </button>
                      </ResponsiveActionMenu>
                    </div>
                  </div>
                </div>

                {/* Kompakt Görünüm Seçici + Aktif Meal Özeti */}
                <div
                  className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div
                    role="group"
                    aria-label="Ayet görünüm modu"
                    className="inline-flex p-0.5 rounded-xl border gap-0.5"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {(
                      [
                        { id: 'ar_meal', label: 'Arapça + Meal' },
                        { id: 'meal', label: 'Sadece Meal' },
                        { id: 'ar', label: 'Sadece Arapça' },
                      ] as const
                    ).map((opt) => {
                      const active = displayMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            sfxService.play('click');
                            setDisplayMode(opt.id);
                          }}
                          className="min-h-[32px] px-2.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                            color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                            boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      openMealSelector('primary');
                    }}
                    title="Aktif meali değiştir"
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors hover:border-[var(--brand-primary)] max-w-full"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    <span className="truncate">
                      Meal: {primaryMeal.shortLabel}
                      {isDual && secondaryMeal.id !== primaryMeal.id
                        ? ` + ${secondaryMeal.shortLabel}`
                        : ''}
                      {isLoadingExtra ? ' (yükleniyor...)' : ''}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  </button>
                </div>
              </div>

              {/* Ayet Listesi */}
              {isLoadingVerses ? (
                <div className="surface-card rounded-2xl p-12 flex flex-col items-center justify-center gap-2">
                  <Loader2
                    className="w-6 h-6 animate-spin"
                    style={{ color: 'var(--brand-primary)' }}
                  />
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Konuya ait ayetler yükleniyor...
                  </p>
                </div>
              ) : topicVerses.length === 0 ? (
                <div
                  className="surface-card rounded-2xl p-8 text-center text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Bu konu için görüntülenecek ayet bulunamadı.
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedVerses.map((verse, idx) => {
                    const surahMeta = surahMap.get(verse.surah);
                    const isPlayingThis = audioState.currentAyahId === verse.id;
                    const primaryMealVerse = getPrimaryVerse(verse);
                    const secondaryMealVerse =
                      isDual && secondaryMeal.id !== primaryMeal.id
                        ? getSecondaryVerse(verse)
                        : null;
                    const footnotes = [
                      ...(primaryMealVerse?.fn ?? []),
                      ...(secondaryMealVerse?.fn ?? []),
                    ];
                    const showFn = settings.showFootnotes && footnotes.length > 0;
                    const isFnOpen = Boolean(openFootnotes[verse.id]);

                    return (
                      <article
                        key={verse.id}
                        className="surface-card rounded-2xl p-4 sm:p-5 space-y-3 transition-all"
                        style={{
                          borderColor: isPlayingThis
                            ? 'var(--brand-primary)'
                            : 'var(--border-subtle)',
                          boxShadow: isPlayingThis
                            ? '0 0 0 2px rgba(15, 118, 110, 0.2), var(--shadow-card)'
                            : undefined,
                        }}
                      >
                        {/* Üst Satır: Sure Adı Sure/Ayet + 3 Sade Aksiyon İkonu */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="px-2.5 py-1 rounded-lg text-xs font-extrabold tabular-nums inline-flex items-center gap-1.5 truncate"
                              style={{
                                backgroundColor: isPlayingThis
                                  ? 'var(--brand-primary)'
                                  : 'var(--brand-primary-soft)',
                                color: isPlayingThis ? '#FFFFFF' : 'var(--brand-primary-text)',
                              }}
                            >
                              {isPlayingThis && <Volume2 className="w-3.5 h-3.5 animate-pulse shrink-0" />}
                              <span className="truncate">
                                {surahMeta?.nameTr ?? `${verse.surah}. Sure`} {verse.surah}/
                                {verse.ayah}
                              </span>
                            </span>
                            <span
                              className="hidden sm:inline text-[11px] tabular-nums"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              S.{verse.page} · {verse.cuz}. Cüz
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleListenTopic(idx)}
                              title="Buradan Dinle"
                              aria-label="Buradan Dinle"
                              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer"
                              style={{
                                backgroundColor: isPlayingThis
                                  ? 'var(--brand-primary)'
                                  : 'var(--bg-surface-soft)',
                                color: isPlayingThis ? '#FFFFFF' : 'var(--brand-primary-text)',
                              }}
                            >
                              <Headphones className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                sfxService.play('click');
                                navigateToStudy({
                                  surah: verse.surah,
                                  ayah: verse.ayah,
                                  viewMode: 'cards',
                                  ensureMealVisible: true,
                                });
                              }}
                              title="Okuyucuda Aç"
                              aria-label="Okuyucuda Aç"
                              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer"
                              style={{
                                backgroundColor: 'var(--bg-surface-soft)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <BookOpen className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                sfxService.play('click');
                                openQuickMemorize(verse.surah, verse.ayah, verse.page);
                              }}
                              title="Hızlı Ezber"
                              aria-label="Hızlı Ezber"
                              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer"
                              style={{
                                backgroundColor: 'var(--bg-surface-soft)',
                                color: 'var(--brand-accent-text)',
                              }}
                            >
                              <BookMarked className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Arapça Metin */}
                        {displayMode !== 'meal' && (
                          <div
                            dir="rtl"
                            lang="ar"
                            className="arabic-text text-right leading-[2.05] break-words"
                            style={{
                              fontSize: `${settings.arabicFontSize}px`,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {verse.ar.t}{' '}
                            <span
                              className="inline-block mx-1 text-[0.75em] font-bold"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              ﴿{toArabicIndicDigits(verse.ayah)}﴾
                            </span>
                          </div>
                        )}

                        {/* Meal / Tefsir Metinleri */}
                        {displayMode !== 'ar' && (() => {
                          const primaryPres = getMealTextPresentation(
                            primaryMeal,
                            settings.turkishFontSize,
                          );
                          const secondaryPres = getMealTextPresentation(
                            secondaryMeal,
                            settings.turkishFontSize,
                          );
                          return (
                            <div className="space-y-2.5">
                              {primaryMealVerse?.t && (
                                <div>
                                  {isDual && secondaryMealVerse?.t && (
                                    <p
                                      className="text-[11px] font-bold mb-1"
                                      style={{ color: 'var(--brand-primary-text)' }}
                                    >
                                      {primaryMeal.shortLabel}
                                    </p>
                                  )}
                                  <p
                                    dir={primaryPres.dir}
                                    lang={primaryPres.lang}
                                    className={
                                      primaryPres.isRtl
                                        ? primaryPres.className
                                        : `${primaryPres.className} leading-relaxed`
                                    }
                                    style={{
                                      fontSize: `${primaryPres.fontSizePx}px`,
                                      fontFamily: primaryPres.fontFamily,
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {primaryMealVerse.t}
                                  </p>
                                </div>
                              )}

                              {secondaryMealVerse?.t && (
                                <div
                                  className="pt-2.5 border-t"
                                  style={{ borderColor: 'var(--border-subtle)' }}
                                >
                                  <p
                                    className="text-[11px] font-bold mb-1"
                                    style={{ color: 'var(--brand-accent-text)' }}
                                  >
                                    {secondaryMeal.shortLabel}
                                  </p>
                                  <p
                                    dir={secondaryPres.dir}
                                    lang={secondaryPres.lang}
                                    className={
                                      secondaryPres.isRtl
                                        ? secondaryPres.className
                                        : `${secondaryPres.className} leading-relaxed`
                                    }
                                    style={{
                                      fontSize: `${secondaryPres.fontSizePx}px`,
                                      fontFamily: secondaryPres.fontFamily,
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {secondaryMealVerse.t}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Dipnotlar */}
                        {displayMode !== 'ar' && showFn && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenFootnotes((prev) => ({
                                  ...prev,
                                  [verse.id]: !prev[verse.id],
                                }))
                              }
                              className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {isFnOpen ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                              <span>Dipnotlar ({footnotes.length})</span>
                            </button>
                            {isFnOpen && (
                              <div
                                className="mt-2 p-3 rounded-xl text-xs space-y-1.5 leading-relaxed"
                                style={{
                                  backgroundColor: 'var(--bg-surface-soft)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {footnotes.map((fn, fnIdx) => (
                                  <p key={fnIdx}>{fn}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {visibleCount < topicVerses.length && (
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleCount((prev) =>
                            Math.min(topicVerses.length, prev + VERSE_BATCH_SIZE),
                          )
                        }
                        className="min-h-[42px] px-5 rounded-xl border text-xs font-extrabold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-strong)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        Daha Fazla Ayet Göster ({topicVerses.length - visibleCount} ayet kaldı)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* A4 PDF / Yazdırma Penceresi */}
      {selectedTopic && (
        <PrintableFihristModal
          isOpen={isPrintOpen}
          onClose={() => setIsPrintOpen(false)}
          title={selectedTopic.title}
          subtitle={
            selectedTopic.tags && selectedTopic.tags.length > 0
              ? selectedTopic.tags.join(' · ')
              : 'Alfabetik Konu Fihristi'
          }
          items={printItems}
          defaultPrintMode={displayMode === 'meal' ? 'meal' : 'ar_meal'}
        />
      )}
    </div>
  );
};
