import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react';
import { dataService, toArabicIndicDigits } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import type { CombinedVerse, QuestionItem, SurahBundle } from '../../types/quran';
import { formatVerseRefSummary, parseVerseRefs } from '../../utils/examUtils';

interface RelatedVerseDrawerProps {
  question: QuestionItem;
  defaultOpen?: boolean;
  /** Sınav esnasında dışarı çıkışı önlemek için gizlenebilir; sonuç karnesi ve Hata Kampı'nda açılır */
  showOpenInReader?: boolean;
  /** Yarışma Arenası "Ayet İpucu" modunda yalnızca Arapça metin ve bağlam özeti gösterilir, cevabı doğrudan veren Türkçe meal gizli kalabilir */
  hintOnly?: boolean;
  buttonLabel?: string;
}

export const RelatedVerseDrawer: React.FC<RelatedVerseDrawerProps> = ({
  question,
  defaultOpen = false,
  showOpenInReader = false,
  hintOnly = false,
  buttonLabel,
}) => {
  const { settings, meta, navigateToStudy } = useAppStore();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [bundle, setBundle] = useState<SurahBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllVerses, setShowAllVerses] = useState(false);

  const verseRefs = parseVerseRefs(question.refs, question.surah);
  const surahMetaFromCore = meta?.surahs.find((s) => s.no === question.surah);
  const surahNameTr = surahMetaFromCore?.nameTr ?? `${question.surah}. Sure`;
  const refSummary = formatVerseRefSummary(verseRefs, surahNameTr, question.scope);

  useEffect(() => {
    setIsOpen(defaultOpen);
    setShowAllVerses(false);
  }, [question.id, question.uid, defaultOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function loadSurah() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await dataService.getSurahBundle(question.surah);
        if (!cancelled) {
          setBundle(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'İlgili ayet yüklenemedi.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadSurah();
    return () => {
      cancelled = true;
    };
  }, [isOpen, question.surah]);

  const handleToggle = () => {
    sfxService.play('click');
    setIsOpen((prev) => !prev);
  };

  const matchedVerses: CombinedVerse[] = (() => {
    if (!bundle) return [];
    if (verseRefs.length === 0) return bundle.verses.slice(0, 1);
    const refSet = new Set(verseRefs);
    const found = bundle.verses.filter((v) => refSet.has(v.ayah));
    return found.length > 0 ? found : bundle.verses.slice(0, 1);
  })();

  const isSurahInfoBroad = question.scope === 'surah_info' && matchedVerses.length > 4;
  const visibleVerses = showAllVerses ? matchedVerses : matchedVerses.slice(0, 3);
  const firstAyah = matchedVerses[0]?.ayah ?? verseRefs[0] ?? 1;
  const firstPage = matchedVerses[0]?.page;

  const triggerText =
    buttonLabel ??
    (isOpen ? 'İlgili Ayet ve Meali Gizle' : `İlgili Ayeti ve Meali Gör (${refSummary})`);

  return (
    <div className="space-y-2.5">
      {!hintOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
            style={{
              backgroundColor: isOpen ? 'var(--brand-primary-soft)' : 'var(--bg-surface-soft)',
              borderColor: isOpen ? 'var(--brand-primary)' : 'var(--border-subtle)',
              color: isOpen ? 'var(--brand-primary-text)' : 'var(--text-primary)',
            }}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="text-left">{triggerText}</span>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {showOpenInReader && (
            <button
              type="button"
              onClick={() =>
                navigateToStudy({
                  surah: question.surah,
                  ayah: firstAyah,
                  page: firstPage,
                })
              }
              className="min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-strong)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Mushaf / Okuma Ekranında Aç</span>
            </button>
          )}
        </div>
      )}

      {(isOpen || hintOnly) && (
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className="text-xs font-extrabold"
              style={{ color: 'var(--brand-primary-text)' }}
            >
              {hintOnly ? `Ayet İpucu · ${refSummary}` : refSummary}
            </span>
            {bundle && (
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {bundle.surahMeta.type} · {bundle.surahMeta.ayahCount} Ayet
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="py-5 flex items-center justify-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Ayet metni yükleniyor...</span>
            </div>
          ) : error ? (
            <p className="text-xs" style={{ color: '#EF4444' }}>
              {error}
            </p>
          ) : bundle ? (
            <>
              {/* Sure Genel Bilgisi kapsamlı sorularda sure özet bilgisi */}
              {isSurahInfoBroad && (
                <div
                  className="p-3.5 rounded-xl border space-y-2 text-xs sm:text-sm leading-relaxed"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {hintOnly ? (
                    <p>
                      <strong>Bağlam İpucu:</strong> {bundle.surahMeta.nameTr} ({bundle.surahMeta.nameAr}),{' '}
                      {bundle.surahMeta.type} dönem surelerindendir ve toplam {bundle.surahMeta.ayahCount} ayetten oluşur.
                    </p>
                  ) : (
                    <>
                      {bundle.surahMeta.hakkinda && (
                        <div>
                          <p className="text-[11px] font-bold mb-0.5" style={{ color: 'var(--brand-primary-text)' }}>
                            Sure Hakkında
                          </p>
                          <p>{bundle.surahMeta.hakkinda}</p>
                        </div>
                      )}
                      {bundle.surahMeta.konusu && (
                        <div className="pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          <p className="text-[11px] font-bold mb-0.5" style={{ color: 'var(--brand-accent-text)' }}>
                            Konusu
                          </p>
                          <p>{bundle.surahMeta.konusu}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Ayetler (Arapça Mushaf Metni + Meal) */}
              {!isSurahInfoBroad && (
                <div className="space-y-3">
                  {visibleVerses.map((v) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-xl border space-y-2.5"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                        <span>
                          {bundle.surahMeta.shortNameTr} {v.surah}:{v.ayah}
                        </span>
                        <span className="tabular-nums">
                          {v.cuz}. Cüz · Sayfa {v.page}
                        </span>
                      </div>

                      <p
                        className="arabic-text text-right leading-[2.15] break-words"
                        style={{
                          fontSize: `${Math.max(22, settings.arabicFontSize - 2)}px`,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {v.ar.t}{' '}
                        <span
                          className="inline-block text-sm align-middle mx-1"
                          style={{ color: 'var(--brand-accent-text)' }}
                        >
                          ﴿{toArabicIndicDigits(v.ayah)}﴾
                        </span>
                      </p>

                      {hintOnly ? (
                        <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                          İpucu: Sorunun cevabı yukarıdaki {v.ayah}. ayetin anlamıyla doğrudan ilişkilidir.
                        </p>
                      ) : (
                        <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          {(settings.preferredMeal === 'm1' || settings.preferredMeal === 'both') &&
                            v.m1?.t && (
                              <div>
                                <p
                                  className="text-[11px] font-bold mb-0.5"
                                  style={{ color: 'var(--brand-primary-text)' }}
                                >
                                  Diyanet Vakfı Meali (TDV)
                                </p>
                                <p
                                  className="turkish-reading"
                                  style={{
                                    fontSize: `${Math.max(14, settings.turkishFontSize - 1)}px`,
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {v.m1.t}
                                </p>
                              </div>
                            )}

                          {(settings.preferredMeal === 'm2' || settings.preferredMeal === 'both') &&
                            v.m2?.t && (
                              <div
                                className={
                                  settings.preferredMeal === 'both' ? 'pt-2 border-t' : undefined
                                }
                                style={
                                  settings.preferredMeal === 'both'
                                    ? { borderColor: 'var(--border-subtle)' }
                                    : undefined
                                }
                              >
                                <p
                                  className="text-[11px] font-bold mb-0.5"
                                  style={{ color: 'var(--brand-accent-text)' }}
                                >
                                  Diyanet İşleri Meali (DİB Yeni)
                                </p>
                                <p
                                  className="turkish-reading"
                                  style={{
                                    fontSize: `${Math.max(14, settings.turkishFontSize - 1)}px`,
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {v.m2.t}
                                </p>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  ))}

                  {matchedVerses.length > 3 && !showAllVerses && (
                    <button
                      type="button"
                      onClick={() => {
                        sfxService.play('click');
                        setShowAllVerses(true);
                      }}
                      className="text-xs font-bold underline cursor-pointer"
                      style={{ color: 'var(--brand-primary-text)' }}
                    >
                      Diğer {matchedVerses.length - 3} ayeti de göster
                    </button>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
