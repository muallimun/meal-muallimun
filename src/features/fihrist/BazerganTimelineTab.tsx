import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Headphones,
  Info,
  Loader2,
  Volume2,
} from 'lucide-react';
import { getMealTextPresentation } from '../../config/mealsConfig';
import { useActiveMeals } from '../../hooks/useActiveMeals';
import { audioQueueService } from '../../services/audioQueueService';
import {
  dataService,
  findPageForSurahAyah,
  toArabicIndicDigits,
} from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { BazerganEntry, BazerganTimelineFile } from '../../types/fihrist';
import type { CombinedVerse } from '../../types/quran';

type PhaseFilter = 'all' | 'Mekke' | 'Medine';

interface BazerganPassageCardProps {
  entry: BazerganEntry;
  entryKey: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const BazerganPassageCard: React.FC<BazerganPassageCardProps> = ({
  entry,
  entryKey,
  isExpanded,
  onToggle,
}) => {
  const { settings, manifest, meta, audioPrefs, navigateToStudy } = useAppStore();
  const audioState = useSyncExternalStore(
    audioQueueService.subscribe,
    audioQueueService.getSnapshot,
  );

  // Yalnızca akordeon açıkken ek meal paketlerini yükle
  const activeSurahNos = useMemo(
    () => (isExpanded ? [entry.surah] : []),
    [isExpanded, entry.surah],
  );
  const {
    primaryMeal,
    secondaryMeal,
    isDual,
    isLoadingExtra,
    getPrimaryVerse,
    getSecondaryVerse,
  } = useActiveMeals(activeSurahNos);

  const [verses, setVerses] = useState<CombinedVerse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;
    let cancelled = false;
    setIsLoading(true);

    dataService
      .getSurahBundle(entry.surah)
      .then((bundle) => {
        if (cancelled) return;
        const byAyah = new Map(bundle.verses.map((v) => [v.ayah, v]));
        const out: CombinedVerse[] = [];
        const seen = new Set<number>();

        for (const [rawStart, rawEnd] of entry.ranges) {
          const start = Math.max(1, Math.min(rawStart, rawEnd));
          const end = Math.max(start, Math.max(rawStart, rawEnd));
          for (let a = start; a <= end; a += 1) {
            const v = byAyah.get(a);
            if (!v || seen.has(v.id)) continue;
            seen.add(v.id);
            out.push(v);
          }
        }
        setVerses(out);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isExpanded, entry]);

  const passageContextKey = `bazergan:${entryKey}`;
  const isPlayingPassage =
    audioState.contextKey === passageContextKey &&
    (audioState.status === 'playing' || audioState.status === 'loading');

  const handlePlayPassage = () => {
    if (!manifest || !meta || verses.length === 0) return;
    sfxService.play('click');
    audioQueueService.startQueue({
      verses,
      startIndex: 0,
      context: 'surah',
      contextKey: passageContextKey,
      manifest,
      meta,
      prefs: audioPrefs,
      queueTitle: `${entry.surahName} (${entry.label})`,
    });
  };

  const handleOpenInReader = () => {
    sfxService.play('click');
    const firstAyah = entry.ranges[0]?.[0] ?? 1;
    navigateToStudy({
      surah: entry.surah,
      ayah: firstAyah,
      viewMode: 'cards',
    });
  };

  const passageAyahCount = useMemo(
    () =>
      entry.ranges.reduce((sum, [rawStart, rawEnd]) => {
        const start = Math.max(1, Math.min(rawStart, rawEnd));
        const end = Math.max(start, Math.max(rawStart, rawEnd));
        return sum + (end - start + 1);
      }, 0),
    [entry.ranges],
  );

  const startPage = useMemo(() => {
    if (!meta) return null;
    const firstAyah = entry.ranges[0]?.[0] ?? 1;
    return findPageForSurahAyah(meta, entry.surah, firstAyah);
  }, [meta, entry.surah, entry.ranges]);

  return (
    <article
      className="surface-card rounded-2xl overflow-hidden transition-all"
      style={{
        borderColor: isPlayingPassage ? 'var(--brand-primary)' : 'var(--border-subtle)',
      }}
    >
      {/* Akordeon Başlık Satırı */}
      <div className="flex items-center justify-between gap-2 pr-3 sm:pr-4 hover:bg-[var(--bg-surface-soft)]/60 transition-colors">
        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            onToggle();
          }}
          aria-expanded={isExpanded}
          className="flex-1 min-w-0 px-3.5 sm:px-4 py-3 flex items-center gap-2.5 text-left cursor-pointer"
        >
          <span
            className="px-2 py-1 rounded-lg text-[11px] font-extrabold tabular-nums shrink-0"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              color: 'var(--brand-primary-text)',
            }}
          >
            #{entry.order}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-extrabold truncate">
              {entry.surahName} Suresi{' '}
              <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                · {entry.label}
              </span>
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span
            className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-secondary)',
            }}
          >
            {passageAyahCount} ayet
          </span>
          {startPage !== null && (
            <span
              className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-muted)',
              }}
            >
              Sayfa {startPage}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenInReader();
            }}
            title={`${entry.surahName} Suresi pasajını okuyucuda aç`}
            className="min-h-[30px] px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors hover:border-[var(--brand-primary)]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--brand-primary-text)',
            }}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Oku</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sfxService.play('click');
              onToggle();
            }}
            aria-label={isExpanded ? 'Pasajı daralt' : 'Pasajı genişlet'}
            aria-expanded={isExpanded}
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              color: 'var(--text-secondary)',
            }}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Akordeon İçeriği */}
      {isExpanded && (
        <div
          className="px-4 pb-4 pt-3 border-t space-y-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Pasaj Aksiyon Çubuğu */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePlayPassage}
                disabled={isLoading || verses.length === 0}
                className="min-h-[36px] px-3.5 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {isPlayingPassage ? (
                  <Volume2 className="w-3.5 h-3.5 animate-pulse shrink-0" />
                ) : (
                  <Headphones className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Pasajı Dinle</span>
              </button>

              <button
                type="button"
                onClick={handleOpenInReader}
                className="min-h-[36px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Okuyucuda Aç</span>
              </button>
            </div>

            <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {verses.length > 0 ? `${verses.length} ayet · ` : ''}
              {primaryMeal.shortLabel}
              {isDual && secondaryMeal.id !== primaryMeal.id
                ? ` + ${secondaryMeal.shortLabel}`
                : ''}
              {isLoadingExtra ? ' (yükleniyor...)' : ''}
            </span>
          </div>

          {isLoading ? (
            <div className="py-8 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--brand-primary)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Pasaj ayetleri yükleniyor...
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {verses.map((verse) => {
                const isPlayingThis = audioState.currentAyahId === verse.id;
                const pVerse = getPrimaryVerse(verse);
                const sVerse =
                  isDual && secondaryMeal.id !== primaryMeal.id
                    ? getSecondaryVerse(verse)
                    : null;

                return (
                  <div
                    key={verse.id}
                    className="p-3.5 rounded-xl border space-y-2.5"
                    style={{
                      backgroundColor: 'var(--bg-surface-soft)',
                      borderColor: isPlayingThis
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums"
                        style={{
                          backgroundColor: isPlayingThis
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface)',
                          color: isPlayingThis ? '#FFFFFF' : 'var(--brand-primary-text)',
                        }}
                      >
                        {entry.surahName} {verse.surah}/{verse.ayah}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        S.{verse.page}
                      </span>
                    </div>

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

                    {pVerse?.t && (() => {
                      const primaryPres = getMealTextPresentation(
                        primaryMeal,
                        settings.turkishFontSize,
                      );
                      return (
                        <div>
                          {isDual && sVerse?.t && (
                            <p
                              className="text-[11px] font-bold mb-0.5"
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
                            {pVerse.t}
                          </p>
                        </div>
                      );
                    })()}

                    {sVerse?.t && (() => {
                      const secondaryPres = getMealTextPresentation(
                        secondaryMeal,
                        settings.turkishFontSize,
                      );
                      return (
                        <div
                          className="pt-2 border-t"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <p
                            className="text-[11px] font-bold mb-0.5"
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
                            {sVerse.t}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
};

export const BazerganTimelineTab: React.FC = () => {
  const [timeline, setTimeline] = useState<BazerganTimelineFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [selectedYearName, setSelectedYearName] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    dataService
      .getBazerganTimeline()
      .then((file) => {
        if (cancelled) return;
        setTimeline(file);
        if (file.years.length > 0) {
          setSelectedYearName((prev) => prev ?? file.years[0].year);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredYears = useMemo(() => {
    const years = timeline?.years ?? [];
    if (phaseFilter === 'all') return years;
    return years.filter((y) => y.phase === phaseFilter);
  }, [timeline, phaseFilter]);

  useEffect(() => {
    if (filteredYears.length === 0) return;
    if (!selectedYearName || !filteredYears.some((y) => y.year === selectedYearName)) {
      setSelectedYearName(filteredYears[0].year);
      setExpandedKey(null);
    }
  }, [filteredYears, selectedYearName]);

  const activeYear = useMemo(
    () => filteredYears.find((y) => y.year === selectedYearName) ?? filteredYears[0] ?? null,
    [filteredYears, selectedYearName],
  );

  const phaseCounts = useMemo(() => {
    const years = timeline?.years ?? [];
    return {
      all: years.length,
      mekke: years.filter((y) => y.phase === 'Mekke').length,
      medine: years.filter((y) => y.phase === 'Medine').length,
    };
  }, [timeline]);

  return (
    <div className="space-y-3.5">
      {/* Kurumsal Başlık & Mehdi Bazergan Metodoloji Kartı */}
      <div
        className="surface-card rounded-2xl p-4 sm:p-5 space-y-2.5 border"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Info className="w-4 h-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm sm:text-base font-extrabold tracking-tight leading-snug">
                Mehdi Bazergan&apos;a Göre Vahiy Kronolojisi{' '}
                <span className="font-semibold" style={{ color: 'var(--brand-primary-text)' }}>
                  (Seyr-i Tahavvül-i Kur’ân)
                </span>
              </h3>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                Bu kronoloji, klasik rivayetlere dayalı <strong>Hz. Osman</strong> ve{' '}
                <strong>İbn Abbas</strong> nüzul sıralamalarından farklı olarak; İranlı araştırmacı{' '}
                <strong>Mehdi Bazergan</strong>&apos;ın ayet ve kelime uzunlukları ile üslup
                dönüşümünü istatistiksel yöntemle inceleyerek oluşturduğu pasaj bazlı tarihlendirme
                modelini esas alır.
              </p>
              <p
                className="text-[11px] leading-relaxed pt-1.5 border-t"
                style={{
                  color: 'var(--text-muted)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                Not: Klasik Mushaf ve nüzul tertibinin yerine geçmez; vahyin üslup ve pasaj seyrini
                mukayeseli incelemek isteyen araştırmacılar için yardımcı bir model olarak
                sunulmuştur.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dönem Filtresi + Yatay Kaydırılabilir Yıl Şeridi */}
      <div className="surface-card rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Tümü (${phaseCounts.all} Yıl)` },
                { id: 'Mekke', label: `Mekke (${phaseCounts.mekke} Yıl)` },
                { id: 'Medine', label: `Medine (${phaseCounts.medine} Yıl)` },
              ] as const
            ).map((opt) => {
              const active = phaseFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setPhaseFilter(opt.id);
                  }}
                  className="min-h-[34px] px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active
                      ? 'var(--brand-primary)'
                      : 'var(--bg-surface-soft)',
                    borderColor: active ? 'var(--brand-primary)' : 'var(--border-subtle)',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {timeline && (
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: 'var(--text-muted)' }}
            >
              Toplam {timeline.totalEntries} pasaj
            </span>
          )}
        </div>

        {/* Yıl Seçim Şeridi: Mobilde yatay kaydırma, masaüstünde (md+) düzenli satır kırılımı */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar md:flex-wrap md:overflow-visible md:pb-0">
          {filteredYears.map((group) => {
            const active = activeYear?.year === group.year;
            const isMedine = group.phase === 'Medine';
            const compactYearLabel = group.year
              .replace(/^Vahyin\s+/i, '')
              .replace(/\s*Yılı$/i, ' Yıl');
            return (
              <button
                key={group.year}
                type="button"
                title={`${group.year} (${group.entries.length} pasaj)`}
                onClick={() => {
                  sfxService.play('click');
                  setSelectedYearName(group.year);
                  setExpandedKey(null);
                }}
                className="min-h-[34px] px-2.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                style={{
                  backgroundColor: active
                    ? isMedine
                      ? 'var(--brand-accent)'
                      : 'var(--brand-primary)'
                    : 'var(--bg-surface-soft)',
                  borderColor: active
                    ? isMedine
                      ? 'var(--brand-accent)'
                      : 'var(--brand-primary)'
                    : 'var(--border-subtle)',
                  color: active ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                <span>{compactYearLabel}</span>
                <span
                  aria-hidden="true"
                  className="opacity-55 text-[10px]"
                >
                  ·
                </span>
                <span
                  className="text-[11px] font-extrabold tabular-nums"
                  style={{
                    color: active ? 'rgba(255,255,255,0.92)' : 'var(--text-muted)',
                  }}
                >
                  {group.entries.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Seçili Yılın Pasaj Listesi */}
      {isLoading ? (
        <div className="surface-card rounded-2xl p-12 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-primary)' }} />
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            Vahiy kronolojisi yükleniyor...
          </p>
        </div>
      ) : !activeYear ? (
        <div
          className="surface-card rounded-2xl p-8 text-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          Kronoloji verisi bulunamadı.
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-extrabold tracking-tight">
                {activeYear.year}
              </h3>
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-bold"
                style={{
                  backgroundColor:
                    activeYear.phase === 'Medine'
                      ? 'var(--brand-accent-soft)'
                      : 'var(--brand-primary-soft)',
                  color:
                    activeYear.phase === 'Medine'
                      ? 'var(--brand-accent-text)'
                      : 'var(--brand-primary-text)',
                }}
              >
                {activeYear.phase} Dönemi
              </span>
            </div>
            <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {activeYear.entries.length} pasaj
            </span>
          </div>

          <div className="space-y-2.5">
            {activeYear.entries.map((entry, idx) => {
              const entryKey = `${activeYear.year}_${entry.order}_${entry.surah}_${idx}`;
              const isExpanded = expandedKey === entryKey;
              return (
                <BazerganPassageCard
                  key={entryKey}
                  entry={entry}
                  entryKey={entryKey}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedKey((prev) => (prev === entryKey ? null : entryKey))}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
