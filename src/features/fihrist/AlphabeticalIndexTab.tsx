import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CopyPlus,
  Headphones,
  Link2,
  ListTree,
  Loader2,
  Printer,
  Scale,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { audioQueueService } from '../../services/audioQueueService';
import {
  buildAudioSegmentsFromItems,
  countRefsAyahs,
  getCachedFihristTopics,
  loadFihristTopics,
  matchesFihristTopicQuery,
} from '../../services/fihristService';
import { researchStorage } from '../../services/researchStorage';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import {
  TURKISH_FIHRIST_LETTERS,
  type FihristPrintMode,
  type FihristTopic,
  type FihristViewMode,
} from '../../types/fihrist';
import { normalizeTurkish } from '../../utils/textNormalize';
import { PrintableFihristModal } from './PrintableFihristModal';
import {
  VerseCollectionRenderer,
  type CollectionDisplayItem,
} from './VerseCollectionRenderer';

interface AlphabeticalIndexTabProps {
  onCopiedToNotebook: (newTopicId: string, topicTitle: string) => void;
}

const VIEW_MODE_OPTIONS: readonly {
  id: FihristViewMode;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'index', label: 'Fihrist (Liste)', shortLabel: 'Fihrist', icon: ListTree },
  { id: 'ar', label: 'Sadece Arapça', shortLabel: 'Arapça', icon: BookOpen },
  { id: 'meal', label: 'Sadece Meal', shortLabel: 'Meal', icon: BookOpen },
  { id: 'ar_meal', label: 'AR + Meal', shortLabel: 'AR+Meal', icon: Scale },
];

export const AlphabeticalIndexTab: React.FC<AlphabeticalIndexTabProps> = ({
  onCopiedToNotebook,
}) => {
  const { meta, manifest, audioPrefs, openMealSelector, settings } = useAppStore();

  const [topics, setTopics] = useState<FihristTopic[]>(() => getCachedFihristTopics() ?? []);
  const [isLoadingTopics, setIsLoadingTopics] = useState<boolean>(
    () => getCachedFihristTopics() === null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string>('ALL');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [viewMode, setViewMode] = useState<FihristViewMode>('index');
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [copiedTopicId, setCopiedTopicId] = useState<string | null>(null);

  // Yalnızca Fihrist sekmesi açıldığında tembel yükle
  useEffect(() => {
    let cancelled = false;
    loadFihristTopics().then((loaded) => {
      if (cancelled) return;
      setTopics(loaded);
      setIsLoadingTopics(false);
      setSelectedTopicId((prev) => prev ?? loaded[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Harf bazlı konu sayıları (arama sorgusu varken filtrelenmiş sayılar değil tüm katalog harfleri)
  const letterCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of topics) {
      const letter = t.letter.toLocaleUpperCase('tr-TR');
      map.set(letter, (map.get(letter) ?? 0) + 1);
    }
    return map;
  }, [topics]);

  // Türkçe alfabetik sıralama ve filtreleme
  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim();
    return topics
      .filter((topic) => {
        if (
          selectedLetter !== 'ALL' &&
          !q &&
          topic.letter.toLocaleUpperCase('tr-TR') !== selectedLetter
        ) {
          return false;
        }
        if (selectedLetter !== 'ALL' && q) {
          // Arama aktifken harf filtresi yerine tüm fihristte ara
          return matchesFihristTopicQuery(topic, q);
        }
        return matchesFihristTopicQuery(topic, q);
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  }, [topics, selectedLetter, searchQuery]);

  const activeTopic = useMemo<FihristTopic | null>(() => {
    if (selectedTopicId) {
      const exact = topics.find((t) => t.id === selectedTopicId);
      if (exact) return exact;
    }
    return filteredTopics[0] ?? topics[0] ?? null;
  }, [selectedTopicId, topics, filteredTopics]);

  const displayItems = useMemo<CollectionDisplayItem[]>(() => {
    if (!activeTopic) return [];
    return activeTopic.refs.map(([surah, startAyah, endAyah], idx) => ({
      key: `${activeTopic.id}_${idx}_${surah}_${startAyah}_${endAyah}`,
      surah,
      startAyah,
      endAyah,
    }));
  }, [activeTopic]);

  const activeAyahCount = useMemo(
    () => (activeTopic ? countRefsAyahs(activeTopic.refs) : 0),
    [activeTopic],
  );

  // "Ayrıca bak. ..." çapraz referansından hedef konuyu bul
  const seeAlsoTarget = useMemo<FihristTopic | null>(() => {
    if (!activeTopic?.seeAlso) return null;
    const targetName = activeTopic.seeAlso
      .replace(/^ayrıca\s+bak\.?\s*/i, '')
      .trim();
    if (!targetName) return null;
    const normTarget = normalizeTurkish(targetName);
    return (
      topics.find(
        (t) =>
          t.id !== activeTopic.id &&
          (normalizeTurkish(t.title).includes(normTarget) ||
            normTarget.includes(normalizeTurkish(t.title))),
      ) ?? null
    );
  }, [activeTopic, topics]);

  const handleSelectTopic = (topicId: string) => {
    sfxService.play('click');
    setSelectedTopicId(topicId);
    setMobileShowDetail(true);
  };

  const handleListenTopic = () => {
    if (!activeTopic || !manifest || !meta || displayItems.length === 0) return;
    sfxService.play('click');
    const segments = buildAudioSegmentsFromItems(
      displayItems,
      meta,
      `fihrist_${activeTopic.id}`,
    );
    void audioQueueService.startSegmentQueue({
      items: segments,
      title: `Fihrist · ${activeTopic.title}`,
      context: 'custom',
      contextKey: `fihrist_topic:${activeTopic.id}`,
      manifest,
      meta,
      prefs: audioPrefs,
    });
  };

  const handleCopyToNotebook = () => {
    if (!activeTopic) return;
    sfxService.play('click');
    const created = researchStorage.copyFromFihrist(activeTopic);
    setCopiedTopicId(activeTopic.id);
    window.setTimeout(() => setCopiedTopicId(null), 2200);
    onCopiedToNotebook(created.id, created.title);
  };

  const defaultPrintMode: FihristPrintMode =
    viewMode === 'index' ? 'index' : viewMode === 'meal' ? 'meal' : 'ar_meal';

  if (isLoadingTopics && topics.length === 0) {
    return (
      <div
        className="surface-card rounded-2xl p-10 flex flex-col items-center justify-center gap-2.5 text-center"
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-primary-text)' }} />
        <p className="text-sm font-bold">Alfabetik Konu Fihristi yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* ====================================================================
          ÜST ARAMA + A–Z HARF ŞERİDİ
          ==================================================================== */}
      <section
        className={`${mobileShowDetail ? 'hidden lg:block' : 'block'} surface-card rounded-2xl p-3.5 sm:p-4 space-y-3`}
      >
        {/* Arama Kutusu */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--brand-primary-text)' }}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Konu veya kavram ara (örn: infak, zikir, adalet, sabır, secde)..."
              className="w-full min-h-[42px] pl-10 pr-9 rounded-xl border text-xs sm:text-sm font-medium outline-none focus:border-[var(--brand-primary)]"
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
                className="w-7 h-7 rounded-lg absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <span
            className="text-xs font-bold tabular-nums px-3 py-1.5 rounded-xl border self-start sm:self-auto shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {filteredTopics.length} / {topics.length} Konu
          </span>
        </div>

        {/* A–Z Türkçe Harf İndeksi */}
        <div
          role="tablist"
          aria-label="Alfabetik harf filtresi"
          className="flex items-center gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible scrollbar-thin"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedLetter === 'ALL'}
            onClick={() => {
              sfxService.play('click');
              setSelectedLetter('ALL');
              setSearchQuery('');
            }}
            className="min-h-[32px] px-2.5 rounded-lg border text-xs font-extrabold shrink-0 cursor-pointer transition-colors"
            style={{
              backgroundColor:
                selectedLetter === 'ALL' && !searchQuery
                  ? 'var(--brand-primary)'
                  : 'var(--bg-surface-soft)',
              borderColor:
                selectedLetter === 'ALL' && !searchQuery
                  ? 'var(--brand-primary)'
                  : 'var(--border-subtle)',
              color:
                selectedLetter === 'ALL' && !searchQuery ? '#FFFFFF' : 'var(--text-primary)',
            }}
          >
            Tümü
          </button>

          {TURKISH_FIHRIST_LETTERS.map((letter) => {
            const count = letterCounts.get(letter) ?? 0;
            const isActive = selectedLetter === letter && !searchQuery;
            const hasItems = count > 0;

            return (
              <button
                key={letter}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={!hasItems}
                title={hasItems ? `${letter} harfi (${count} konu)` : `${letter} harfinde konu yok`}
                onClick={() => {
                  sfxService.play('click');
                  setSelectedLetter(letter);
                  setSearchQuery('');
                }}
                className="min-w-[30px] min-h-[32px] px-1.5 rounded-lg border text-xs font-extrabold shrink-0 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isActive
                    ? 'var(--brand-primary)'
                    : hasItems
                      ? 'var(--bg-surface-soft)'
                      : 'transparent',
                  borderColor: isActive ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  color: isActive
                    ? '#FFFFFF'
                    : hasItems
                      ? 'var(--text-primary)'
                      : 'var(--text-muted)',
                }}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </section>

      {/* ====================================================================
          ANA ÇALIŞMA ALANI: SOL KONU LİSTESİ + SAĞ KONU DETAYI
          ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* SOL SÜTUN: KONU LİSTESİ (Mobilde detay açıkken gizlenir) */}
        <aside
          className={`${mobileShowDetail ? 'hidden lg:block' : 'block'} lg:col-span-4 surface-card rounded-2xl overflow-hidden`}
        >
          <div
            className="px-3.5 py-2.5 border-b flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span className="text-xs font-extrabold" style={{ color: 'var(--text-secondary)' }}>
              {searchQuery
                ? `"${searchQuery}" Arama Sonuçları`
                : selectedLetter === 'ALL'
                  ? 'Tüm Konular (A–Z)'
                  : `${selectedLetter} Harfi Konuları`}
            </span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {filteredTopics.length} başlık
            </span>
          </div>

          {filteredTopics.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm font-bold">Eşleşen konu bulunamadı</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Farklı bir kavram deneyin veya tüm harfleri görüntüleyin.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLetter('ALL');
                }}
                className="min-h-[36px] px-3.5 rounded-xl text-xs font-bold text-white cursor-pointer"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Filtreyi Sıfırla
              </button>
            </div>
          ) : (
            <div className="divide-y max-h-[65dvh] lg:max-h-[70dvh] overflow-y-auto scrollbar-thin" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredTopics.map((topic) => {
                const isSelected = activeTopic?.id === topic.id;
                const ayahTotal = countRefsAyahs(topic.refs);

                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => handleSelectTopic(topic.id)}
                    className="w-full px-3.5 py-3 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer hover:bg-[var(--bg-surface-soft)]"
                    style={{
                      backgroundColor: isSelected ? 'var(--brand-primary-soft)' : 'transparent',
                    }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface-soft)',
                          color: isSelected ? '#FFFFFF' : 'var(--brand-primary-text)',
                        }}
                      >
                        {topic.letter}
                      </span>
                      <div className="min-w-0">
                        <p
                          className="text-xs sm:text-sm font-extrabold leading-snug break-words"
                          style={{
                            color: isSelected
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-primary)',
                          }}
                        >
                          {topic.title}
                        </p>
                        <p className="text-[11px] tabular-nums mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                          {ayahTotal} ayet
                          {topic.tags && topic.tags.length > 0
                            ? ` · ${topic.tags.slice(0, 2).join(', ')}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <ChevronRight
                      className="w-4 h-4 shrink-0 opacity-60"
                      style={{
                        color: isSelected ? 'var(--brand-primary-text)' : 'var(--text-muted)',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* SAĞ SÜTUN: SEÇİLİ KONU ÇALIŞMA PANELİ */}
        <section
          className={`${mobileShowDetail ? 'block' : 'hidden lg:block'} lg:col-span-8 space-y-3.5 min-w-0`}
        >
          {/* Mobil Geri Dön Şeridi */}
          <div className="lg:hidden flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setMobileShowDetail(false);
              }}
              className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Konu Listesine Dön</span>
            </button>
          </div>

          {activeTopic ? (
            <>
              {/* Konu Başlık Kartı & Doğrudan Eylemler */}
              <div className="surface-card rounded-2xl p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-extrabold"
                        style={{
                          backgroundColor: 'var(--brand-primary-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {activeTopic.letter} Harfi
                      </span>
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {activeAyahCount} Ayet · {activeTopic.refs.length} Pasaj
                      </span>
                    </div>

                    <h3 className="text-lg sm:text-xl font-extrabold tracking-tight break-words">
                      {activeTopic.title}
                    </h3>

                    {activeTopic.tags && activeTopic.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {activeTopic.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md text-[11px] font-semibold border"
                            style={{
                              backgroundColor: 'var(--bg-surface-soft)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {activeTopic.seeAlso && (
                      <div className="pt-0.5">
                        {seeAlsoTarget ? (
                          <button
                            type="button"
                            onClick={() => handleSelectTopic(seeAlsoTarget.id)}
                            className="text-xs font-bold inline-flex items-center gap-1 hover:underline cursor-pointer"
                            style={{ color: 'var(--brand-primary-text)' }}
                          >
                            <Link2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{activeTopic.seeAlso}</span>
                          </button>
                        ) : (
                          <p
                            className="text-xs inline-flex items-center gap-1"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Link2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{activeTopic.seeAlso}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Doğrudan Eylem Butonları */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleListenTopic}
                      disabled={!manifest || !meta}
                      className="min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <Headphones className="w-3.5 h-3.5 shrink-0" />
                      <span>Konuyu Dinle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setIsPrintOpen(true);
                      }}
                      className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Printer className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand-primary-text)' }} />
                      <span>A4 PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyToNotebook}
                      className="min-h-[38px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor:
                          copiedTopicId === activeTopic.id
                            ? 'rgba(16, 185, 129, 0.14)'
                            : 'var(--brand-accent-soft)',
                        borderColor:
                          copiedTopicId === activeTopic.id
                            ? 'rgba(16, 185, 129, 0.4)'
                            : 'rgba(217, 119, 6, 0.35)',
                        color:
                          copiedTopicId === activeTopic.id
                            ? '#047857'
                            : 'var(--brand-accent-text)',
                      }}
                    >
                      {copiedTopicId === activeTopic.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Deftere Kopyalandı</span>
                        </>
                      ) : (
                        <>
                          <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                          <span>Defterime Kopyala</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 4 Anlık Görünüm Anahtarı + Aktif Meal Seçici */}
                <div
                  className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div
                    role="tablist"
                    aria-label="Konu görünüm modu"
                    className="grid grid-cols-4 sm:inline-flex p-1 rounded-xl gap-1 w-full sm:w-auto"
                    style={{ backgroundColor: 'var(--bg-surface-soft)' }}
                  >
                    {VIEW_MODE_OPTIONS.map((opt) => {
                      const active = viewMode === opt.id;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            sfxService.play('click');
                            setViewMode(opt.id);
                          }}
                          className="min-h-[34px] px-2 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                            color: active
                              ? 'var(--brand-primary-text)'
                              : 'var(--text-secondary)',
                            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                          <span className="sm:hidden">{opt.shortLabel}</span>
                          <span className="hidden sm:inline">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {(viewMode === 'meal' || viewMode === 'ar_meal') && (
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        openMealSelector('primary');
                      }}
                      className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface-soft)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--brand-primary-text)',
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Meal Değiştir{settings.mealDisplayMode === 'dual' ? ' (Çift)' : ''}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Ayet Koleksiyonu İçeriği */}
              <VerseCollectionRenderer
                items={displayItems}
                viewMode={viewMode}
                collectionTitle={activeTopic.title}
              />

              {/* A4 PDF Modalı */}
              <PrintableFihristModal
                isOpen={isPrintOpen}
                onClose={() => setIsPrintOpen(false)}
                title={activeTopic.title}
                subtitle={
                  activeTopic.tags?.length
                    ? `Kavramlar: ${activeTopic.tags.join(', ')}`
                    : undefined
                }
                items={displayItems}
                defaultPrintMode={defaultPrintMode}
              />
            </>
          ) : (
            <div className="surface-card rounded-2xl p-8 text-center">
              <p className="text-sm font-bold">İncelemek için soldan bir konu seçin.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
