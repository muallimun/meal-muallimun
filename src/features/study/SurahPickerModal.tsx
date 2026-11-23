import React, { useEffect, useMemo, useState } from 'react';
import { BookMarked, Check, Layers, Search, X } from 'lucide-react';
import { Z_LAYERS } from '../../config/zLayers';
import { useBackButtonGuard } from '../../services/backStackService';
import { sfxService } from '../../services/sfxService';
import { useAppStore } from '../../store/useAppStore';
import {
  buildSurahQuestionCountMap,
  formatNumberTr,
  normalizeTurkish,
} from '../../utils/poolUtils';
import { formatSafeArabicTitle } from '../../utils/arabicUtils';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';

interface SurahPickerModalProps {
  isOpen: boolean;
  currentSurahNo: number;
  onSelectSurah: (surahNo: number) => void;
  onClose: () => void;
}

type PickerScope = 'pool' | 'all';

export const SurahPickerModal: React.FC<SurahPickerModalProps> = ({
  isOpen,
  currentSurahNo,
  onSelectSurah,
  onClose,
}) => {
  const { meta, questionIndex, poolStats } = useAppStore();
  const [scope, setScope] = useState<PickerScope>('pool');
  const [query, setQuery] = useState('');

  useBackButtonGuard('surah_picker_modal', isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    return acquireBodyScrollLock();
  }, [isOpen]);

  const qCounts = useMemo(
    () => buildSurahQuestionCountMap(questionIndex),
    [questionIndex],
  );

  const poolSet = useMemo(
    () => new Set(poolStats.effectiveSurahs),
    [poolStats.effectiveSurahs],
  );

  const filteredSurahs = useMemo(() => {
    if (!meta) return [];
    const norm = normalizeTurkish(query);

    return meta.surahs.filter((s) => {
      if (scope === 'pool' && !poolSet.has(s.no)) return false;
      if (!norm) return true;
      const haystack = normalizeTurkish(`${s.no} ${s.nameTr} ${s.shortNameTr} ${s.type}`);
      return haystack.includes(norm) || s.nameAr.includes(query.trim());
    });
  }, [meta, scope, poolSet, query]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${Z_LAYERS.NESTED_MODAL} flex items-stretch sm:items-center justify-center p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="surah-picker-title"
    >
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full h-[100dvh] max-h-[100dvh] sm:h-auto md:max-w-2xl lg:max-w-3xl sm:max-h-[86dvh] rounded-none sm:rounded-2xl border-0 sm:border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="sticky top-0 z-10 px-4 pt-[max(0.625rem,env(safe-area-inset-top,0px))] pb-2.5 sm:px-5 sm:py-3.5 border-b flex items-center justify-between gap-2.5 shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <BookMarked className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <h2 id="surah-picker-title" className="text-base sm:text-lg font-extrabold truncate">
              Sure Seç
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Sure seçiciyi kapat"
            title="Sure seçiciyi kapat"
            className="w-9 h-9 sm:min-w-[40px] sm:min-h-[40px] rounded-xl flex items-center justify-center border cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Sekmeler + Arama */}
        <div
          className="px-5 py-3 border-b space-y-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="grid grid-cols-2 gap-1 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setScope('pool');
              }}
              className="min-h-[40px] px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              style={{
                backgroundColor: scope === 'pool' ? 'var(--bg-surface)' : 'transparent',
                color: scope === 'pool' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: scope === 'pool' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">
                Çalışma Havuzum ({formatNumberTr(poolStats.surahCount)})
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                setScope('all');
              }}
              className="min-h-[40px] px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              style={{
                backgroundColor: scope === 'all' ? 'var(--bg-surface)' : 'transparent',
                color: scope === 'all' ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                boxShadow: scope === 'all' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <BookMarked className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">
                Tüm Kur&apos;an ({formatNumberTr(meta?.surahs.length ?? 114)} Sure)
              </span>
            </button>
          </div>

          <div className="relative">
            <Search
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sure adı veya numarası ara (örn. Lokman, 31, Bakara)..."
              className="w-full min-h-[44px] pl-10 pr-9 rounded-xl border text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/40"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Aramayı temizle"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sure Listesi */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredSurahs.length === 0 ? (
            <div
              className="p-8 rounded-2xl text-center text-sm"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-muted)',
              }}
            >
              Aramanıza uygun sure bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredSurahs.map((surah) => {
                const isCurrent = surah.no === currentSurahNo;
                const qCount = qCounts.get(surah.no) ?? surah.questionCount;

                return (
                  <button
                    key={surah.no}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      onSelectSurah(surah.no);
                      onClose();
                    }}
                    className="min-h-[60px] p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
                    style={{
                      backgroundColor: isCurrent
                        ? 'var(--brand-primary-soft)'
                        : 'var(--bg-surface)',
                      borderColor: isCurrent
                        ? 'var(--brand-primary)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold tabular-nums shrink-0"
                        style={{
                          backgroundColor: isCurrent
                            ? 'var(--brand-primary)'
                            : 'var(--bg-surface-soft)',
                          color: isCurrent ? '#FFFFFF' : 'var(--text-primary)',
                        }}
                      >
                        {isCurrent ? <Check className="w-4 h-4" /> : surah.no}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{surah.nameTr}</p>
                        <p
                          className="text-xs tabular-nums truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {surah.ayahCount} ayet · Sayfa {surah.pageStart}
                          {qCount > 0 && (
                            <span
                              className="font-bold"
                              style={{ color: 'var(--brand-primary-text)' }}
                            >
                              {' '}
                              · {qCount} soru
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <span
                      className="arabic-title text-lg shrink-0 leading-none"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {formatSafeArabicTitle(surah.nameAr, { stripSurahPrefix: true })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
