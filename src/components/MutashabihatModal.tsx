import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Play,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { getMealTextPresentation } from '../config/mealsConfig';
import { useActiveMeals } from '../hooks/useActiveMeals';
import { useMutashabihatData } from '../hooks/useStudyReferenceData';
import { audioQueueService } from '../services/audioQueueService';
import { useBackButtonGuard } from '../services/backStackService';
import { dataService, toArabicIndicDigits } from '../services/dataService';
import { sfxService } from '../services/sfxService';
import { useAppStore } from '../store/useAppStore';
import type { MutashabihatEntryTuple, MutashabihatWordRange } from '../types/fihrist';
import type { CombinedVerse, SurahBundle } from '../types/quran';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';
import { tokenizeArabicWithWaqf } from '../utils/wordSyncUtils';

interface HighlightedArabicProps {
  text: string;
  ranges: readonly MutashabihatWordRange[];
  ayahNo?: number;
  isFocused?: boolean;
  fontSize?: number;
}

function extractArabicRangePhrase(
  text: string | undefined,
  range: MutashabihatWordRange | undefined,
): string {
  if (!text || !Array.isArray(range) || range.length < 2) return '';
  const tokens = tokenizeArabicWithWaqf(text);
  if (tokens.length === 0) return '';
  const start = Math.max(1, Math.min(tokens.length, Math.min(range[0], range[1])));
  const end = Math.max(1, Math.min(tokens.length, Math.max(range[0], range[1])));
  return tokens
    .slice(start - 1, end)
    .join(' ')
    .trim();
}

/**
 * 1-tabanlı kelime aralıklarını sıfır satır kaymasıyla (padding/margin/border-width olmadan)
 * yumuşak vurgulu şekilde çizer.
 */
const HighlightedArabic: React.FC<HighlightedArabicProps> = ({
  text,
  ranges,
  ayahNo,
  isFocused = false,
  fontSize = 24,
}) => {
  const tokens = useMemo(() => tokenizeArabicWithWaqf(text), [text]);

  const highlightedSet = useMemo(() => {
    const set = new Set<number>();
    for (const r of ranges) {
      if (!Array.isArray(r) || r.length < 2) continue;
      const start = Math.max(1, Math.min(tokens.length, Math.min(r[0], r[1])));
      const end = Math.max(1, Math.min(tokens.length, Math.max(r[0], r[1])));
      for (let i = start; i <= end; i += 1) {
        set.add(i);
      }
    }
    return set;
  }, [ranges, tokens.length]);

  const bg = isFocused
    ? 'rgba(13, 148, 136, 0.24)'
    : 'rgba(217, 119, 6, 0.20)';
  const shadow = isFocused
    ? '0 0 0 2px rgba(13, 148, 136, 0.16)'
    : '0 0 0 2px rgba(217, 119, 6, 0.12)';

  const showRosette =
    ayahNo !== undefined && !/[\u0660-\u0669\u06DD﴿﴾]\s*$/.test(text);

  return (
    <p
      dir="rtl"
      lang="ar"
      className="arabic-text leading-[2.05] text-right break-words"
      style={{
        fontSize: `${fontSize}px`,
        color: 'var(--text-primary)',
      }}
    >
      {tokens.map((tok, idx) => {
        const wordPos = idx + 1;
        const isHit = highlightedSet.has(wordPos);
        return (
          <React.Fragment key={`${idx}-${tok}`}>
            {isHit ? (
              <span
                className="rounded-[5px] transition-colors"
                style={{ backgroundColor: bg, boxShadow: shadow }}
              >
                {tok}
              </span>
            ) : (
              tok
            )}
            {idx < tokens.length - 1 ? ' ' : ''}
          </React.Fragment>
        );
      })}
      {showRosette && (
        <span
          className="inline-block mr-1.5 font-normal select-none"
          style={{ color: 'var(--brand-primary-text)', fontSize: '0.88em' }}
        >
          ﴿{toArabicIndicDigits(ayahNo)}﴾
        </span>
      )}
    </p>
  );
};

export const MutashabihatModal: React.FC = () => {
  const {
    mutashabihatTarget,
    closeMutashabihat,
    meta,
    manifest,
    audioPrefs,
    settings,
    navigateToStudy,
  } = useAppStore();

  const isOpen = Boolean(mutashabihatTarget);
  const { getLinks, isLoading: isLoadingIndex } = useMutashabihatData(isOpen);

  const links: readonly MutashabihatEntryTuple[] = useMemo(() => {
    if (!mutashabihatTarget) return [];
    return getLinks(mutashabihatTarget.surah, mutashabihatTarget.ayah);
  }, [mutashabihatTarget, getLinks]);

  const [bundlesBySurah, setBundlesBySurah] = useState<Map<number, SurahBundle>>(() => new Map());
  const [isLoadingVerses, setIsLoadingVerses] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [showSourceMeal, setShowSourceMeal] = useState(true);

  const neededSurahs = useMemo(() => {
    if (!mutashabihatTarget) return [];
    const set = new Set<number>([mutashabihatTarget.surah]);
    for (const entry of links) {
      if (entry[0] >= 1 && entry[0] <= 114) {
        set.add(entry[0]);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [mutashabihatTarget, links]);

  const { primaryMeal, secondaryMeal, isDual, getPrimaryVerse, getSecondaryVerse } =
    useActiveMeals(neededSurahs);

  const primaryPres = getMealTextPresentation(primaryMeal, Math.max(13, settings.turkishFontSize - 2));
  const secondaryPres = getMealTextPresentation(secondaryMeal, Math.max(13, settings.turkishFontSize - 2));

  useBackButtonGuard('mutashabihat_modal', isOpen, closeMutashabihat);

  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(null);
      return;
    }
    return acquireBodyScrollLock();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || neededSurahs.length === 0) return;
    let cancelled = false;
    setIsLoadingVerses(true);

    void Promise.all(
      neededSurahs.map(async (sNo) => {
        try {
          return await dataService.getSurahBundle(sNo);
        } catch {
          return null;
        }
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const map = new Map<number, SurahBundle>();
        for (const b of results) {
          if (b) map.set(b.surahMeta.no, b);
        }
        setBundlesBySurah(map);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVerses(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, neededSurahs]);

  const sourceVerse: CombinedVerse | null = useMemo(() => {
    if (!mutashabihatTarget) return null;
    const bundle = bundlesBySurah.get(mutashabihatTarget.surah);
    return bundle?.verses.find((v) => v.ayah === mutashabihatTarget.ayah) ?? null;
  }, [mutashabihatTarget, bundlesBySurah]);

  const sourceSurahMeta = useMemo(() => {
    if (!mutashabihatTarget || !meta) return null;
    return meta.surahs.find((s) => s.no === mutashabihatTarget.surah) ?? null;
  }, [mutashabihatTarget, meta]);

  const activeSourceRanges = useMemo<MutashabihatWordRange[]>(() => {
    if (focusedIndex !== null && links[focusedIndex]?.[2]) {
      return [links[focusedIndex][2]!];
    }
    const all: MutashabihatWordRange[] = [];
    for (const entry of links) {
      if (entry[2]) all.push(entry[2]);
    }
    return all;
  }, [links, focusedIndex]);

  if (!isOpen || !mutashabihatTarget) return null;

  const handlePlaySingleVerse = (verse: CombinedVerse) => {
    if (!manifest || !meta) return;
    sfxService.play('click');
    const surahMeta = meta.surahs.find((s) => s.no === verse.surah);
    audioQueueService.startQueue({
      verses: [verse],
      startIndex: 0,
      context: 'single',
      contextKey: `mutashabihat:${verse.surah}:${verse.ayah}`,
      manifest,
      meta,
      prefs: audioPrefs,
      singleAyahOnly: true,
      modeOverride: 'ar',
      queueTitle: `${surahMeta?.nameTr ?? `${verse.surah}. Sure`} · ${verse.ayah}. Ayet`,
    });
  };

  const handleOpenInReader = (surah: number, ayah: number) => {
    sfxService.play('click');
    closeMutashabihat();
    navigateToStudy({ surah, ayah, viewMode: 'cards' });
  };

  const sourcePrimaryMeal = sourceVerse ? getPrimaryVerse(sourceVerse) : null;
  const clampedArabicSize = Math.min(30, Math.max(20, settings.arabicFontSize - 2));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Müteşâbihât — Benzer Ayetler Karşılaştırması"
      className="fixed inset-0 z-[96] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeMutashabihat();
      }}
    >
      <div
        className="w-full md:max-w-3xl lg:max-w-4xl max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-accent-soft)',
                color: 'var(--brand-accent-text)',
              }}
            >
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-extrabold truncate">
                  Müteşâbihât · Benzer Ayetler
                </h2>
                {links.length > 0 && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums"
                    style={{
                      backgroundColor: 'var(--brand-primary-soft)',
                      color: 'var(--brand-primary-text)',
                    }}
                  >
                    {links.length} Benzer
                  </span>
                )}
              </div>
              <p className="hidden sm:block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {sourceSurahMeta?.nameTr ?? `${mutashabihatTarget.surah}. Sure`} ·{' '}
                {mutashabihatTarget.ayah}. Ayet — Lafız benzerliği karşılaştırması
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeMutashabihat}
            aria-label="Müteşâbihât penceresini kapat"
            title="Kapat"
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer shrink-0"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sabitlenen & Daraltılabilir Kaynak Ayet Kartı */}
        <div
          className="px-4 sm:px-5 py-2.5 sm:py-3 border-b shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider min-w-0"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate tabular-nums">
                Kaynak Ayet · {sourceSurahMeta?.nameTr ?? `${mutashabihatTarget.surah}. Sure`}{' '}
                {mutashabihatTarget.surah}:{mutashabihatTarget.ayah}
                {sourceVerse ? ` · ${sourceVerse.cuz}. Cüz · Sayfa ${sourceVerse.page}` : ''}
              </span>
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {sourcePrimaryMeal?.t && (
                <button
                  type="button"
                  onClick={() => {
                    sfxService.play('click');
                    setShowSourceMeal((v) => !v);
                  }}
                  aria-expanded={showSourceMeal}
                  className="h-7 px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>{showSourceMeal ? 'Meali Gizle' : 'Meali Göster'}</span>
                  {showSourceMeal ? (
                    <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>
              )}

              {sourceVerse && (
                <button
                  type="button"
                  onClick={() => handlePlaySingleVerse(sourceVerse)}
                  className="h-7 px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--brand-primary-text)',
                  }}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Dinle</span>
                </button>
              )}
            </div>
          </div>

          {sourceVerse ? (
            <>
              <HighlightedArabic
                text={sourceVerse.ar.t}
                ranges={activeSourceRanges}
                ayahNo={sourceVerse.ayah}
                isFocused={focusedIndex !== null}
                fontSize={clampedArabicSize}
              />
              {showSourceMeal && sourcePrimaryMeal?.t && (
                <p
                  dir={primaryPres.dir}
                  lang={primaryPres.lang}
                  className={`mt-1.5 text-xs leading-relaxed line-clamp-2 ${
                    primaryPres.isRtl ? 'text-right' : ''
                  }`}
                  style={{
                    color: 'var(--text-secondary)',
                    fontFamily: primaryPres.fontFamily,
                  }}
                >
                  {sourcePrimaryMeal.t}
                </p>
              )}
            </>
          ) : (
            <div className="py-4 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Kaynak ayet yükleniyor...</span>
            </div>
          )}
        </div>

        {/* Benzer Ayetler Listesi */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {isLoadingIndex || (isLoadingVerses && bundlesBySurah.size === 0) ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--brand-primary)' }} />
              <span>Müteşâbih ayetler hazırlanıyor...</span>
            </div>
          ) : links.length === 0 ? (
            <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              Bu ayet için kayıtlı müteşâbih eşleşmesi bulunamadı.
            </div>
          ) : (
            links.map((entry, idx) => {
              const [targetSurah, targetAyah, srcRange, targetRange] = entry;
              const targetBundle = bundlesBySurah.get(targetSurah);
              const targetVerse =
                targetBundle?.verses.find((v) => v.ayah === targetAyah) ?? null;
              const targetSurahMeta =
                targetBundle?.surahMeta ??
                meta?.surahs.find((s) => s.no === targetSurah) ??
                null;
              const targetPrimaryMeal = targetVerse ? getPrimaryVerse(targetVerse) : null;
              const targetSecondaryMeal =
                isDual && targetVerse ? getSecondaryVerse(targetVerse) : null;
              const isCardFocused = focusedIndex === idx;

              return (
                <article
                  key={`${targetSurah}:${targetAyah}:${idx}`}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onMouseLeave={() => setFocusedIndex((prev) => (prev === idx ? null : prev))}
                  onFocus={() => setFocusedIndex(idx)}
                  className="rounded-2xl border p-3.5 sm:p-4 transition-colors"
                  style={{
                    backgroundColor: isCardFocused
                      ? 'var(--brand-primary-soft)'
                      : 'var(--bg-surface)',
                    borderColor: isCardFocused
                      ? 'var(--brand-primary)'
                      : 'var(--border-subtle)',
                  }}
                >
                  {/* Üst Bilgi & Aksiyonlar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-extrabold tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          color: 'var(--brand-primary-text)',
                        }}
                      >
                        {targetSurah}:{targetAyah}
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold truncate">
                        {targetSurahMeta?.nameTr ?? `${targetSurah}. Sure`} · {targetAyah}. Ayet
                      </span>
                      {targetVerse && (
                        <span
                          className="text-[11px] font-semibold tabular-nums whitespace-nowrap"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          · {targetVerse.cuz}. Cüz · Sayfa {targetVerse.page}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {targetVerse && (
                        <button
                          type="button"
                          onClick={() => handlePlaySingleVerse(targetVerse)}
                          className="h-8 px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--brand-primary-text)',
                          }}
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Dinle</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenInReader(targetSurah, targetAyah)}
                        className="h-8 px-2.5 rounded-lg text-[11px] font-bold text-white inline-flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-90"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Okuyucuda Aç</span>
                      </button>
                    </div>
                  </div>

                  {/* Arapça Metin (Hedef Kelime Aralığı Vurgulu + Otantik Ayet Durağı) */}
                  {targetVerse ? (
                    <>
                      <HighlightedArabic
                        text={targetVerse.ar.t}
                        ranges={targetRange ? [targetRange] : []}
                        ayahNo={targetVerse.ayah}
                        isFocused={isCardFocused}
                        fontSize={clampedArabicSize}
                      />

                      {targetPrimaryMeal?.t && (
                        <p
                          dir={primaryPres.dir}
                          lang={primaryPres.lang}
                          className={`mt-2 text-xs sm:text-[13px] leading-relaxed ${
                            primaryPres.isRtl ? 'text-right' : ''
                          }`}
                          style={{
                            color: 'var(--text-secondary)',
                            fontFamily: primaryPres.fontFamily,
                          }}
                        >
                          {isDual && (
                            <span
                              className="inline-block mr-1.5 font-extrabold text-[11px]"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              [{primaryMeal.shortLabel}]
                            </span>
                          )}
                          {targetPrimaryMeal.t}
                        </p>
                      )}

                      {isDual && targetSecondaryMeal?.t && (
                        <p
                          dir={secondaryPres.dir}
                          lang={secondaryPres.lang}
                          className={`mt-1.5 pt-1.5 border-t text-xs sm:text-[13px] leading-relaxed ${
                            secondaryPres.isRtl ? 'text-right' : ''
                          }`}
                          style={{
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                            fontFamily: secondaryPres.fontFamily,
                          }}
                        >
                          <span
                            className="inline-block mr-1.5 font-extrabold text-[11px]"
                            style={{ color: 'var(--brand-accent-text)' }}
                          >
                            [{secondaryMeal.shortLabel}]
                          </span>
                          {targetSecondaryMeal.t}
                        </p>
                      )}

                      {/* Pedagojik Arapça Lafız Karşılaştırma Şeridi */}
                      {(() => {
                        const sourcePhrase = extractArabicRangePhrase(sourceVerse?.ar.t, srcRange);
                        const targetPhrase = extractArabicRangePhrase(targetVerse.ar.t, targetRange);
                        if (sourcePhrase && targetPhrase) {
                          return (
                            <div
                              className="mt-2.5 pt-2 border-t flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
                              style={{
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              <span
                                className="font-bold shrink-0"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                Benzer Lafız:
                              </span>
                              <span
                                dir="rtl"
                                lang="ar"
                                className="arabic-text text-sm sm:text-[15px] leading-snug px-2 py-0.5 rounded-lg"
                                style={{
                                  backgroundColor: 'rgba(217, 119, 6, 0.14)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {sourcePhrase}
                              </span>
                              <span
                                className="font-extrabold select-none"
                                style={{ color: 'var(--brand-primary-text)' }}
                                aria-hidden="true"
                              >
                                ⇄
                              </span>
                              <span
                                dir="rtl"
                                lang="ar"
                                className="arabic-text text-sm sm:text-[15px] leading-snug px-2 py-0.5 rounded-lg"
                                style={{
                                  backgroundColor: 'rgba(13, 148, 136, 0.14)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {targetPhrase}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div
                            className="mt-2.5 pt-2 border-t text-[11px] font-semibold"
                            style={{
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Lafız ve ibare benzerliği
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="py-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Ayet yükleniyor...</span>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
