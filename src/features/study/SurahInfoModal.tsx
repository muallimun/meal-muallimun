import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Info, X } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { sfxService } from '../../services/sfxService';
import type { SurahExtraInfo } from '../../types/fihrist';
import type { SurahMeta } from '../../types/quran';
import { formatSafeArabicTitle } from '../../utils/arabicUtils';
import { acquireBodyScrollLock } from '../../utils/bodyScrollLock';
import { formatNumberTr } from '../../utils/poolUtils';

interface SurahInfoModalProps {
  surah: SurahMeta | null;
  onClose: () => void;
  onReadSurah?: (surahNo: number) => void;
}

type InfoSectionKey = 'hakkinda' | 'nuzul' | 'konusu';

export const SurahInfoModal: React.FC<SurahInfoModalProps> = ({
  surah,
  onClose,
  onReadSurah,
}) => {
  const sections: { key: InfoSectionKey; label: string; content: string }[] = surah
    ? [
        { key: 'hakkinda' as const, label: 'Hakkında', content: surah.hakkinda?.trim() ?? '' },
        { key: 'nuzul' as const, label: 'Nüzul Sebebi', content: surah.nuzul?.trim() ?? '' },
        { key: 'konusu' as const, label: 'Konusu', content: surah.konusu?.trim() ?? '' },
      ].filter((item) => item.content.length > 0)
    : [];

  const [activeKey, setActiveKey] = useState<InfoSectionKey>('hakkinda');
  const [extraInfo, setExtraInfo] = useState<SurahExtraInfo | null>(null);

  useEffect(() => {
    if (sections.length > 0 && !sections.some((s) => s.key === activeKey)) {
      setActiveKey(sections[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah?.no]);

  useEffect(() => {
    if (!surah) {
      setExtraInfo(null);
      return;
    }
    let cancelled = false;
    dataService
      .getSurahInfoExtrasMap()
      .then((map) => {
        if (!cancelled) {
          setExtraInfo(map.get(surah.no) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setExtraInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [surah]);

  useEffect(() => {
    if (!surah) return;
    const releaseScrollLock = acquireBodyScrollLock();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [surah, onClose]);

  if (!surah) return null;

  const activeSection = sections.find((s) => s.key === activeKey) ?? sections[0];

  return (
    <div
      className="fixed inset-0 z-[96] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="surah-info-title"
    >
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full sm:max-w-2xl max-h-[88dvh] rounded-t-3xl sm:rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div
            className="w-10 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--border-strong)' }}
          />
        </div>

        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <Info className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="surah-info-title" className="text-lg font-extrabold truncate">
                  {surah.no}. {surah.nameTr}
                </h2>
                <span
                  className="arabic-title text-xl leading-none hidden sm:inline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {formatSafeArabicTitle(surah.nameAr)}
                </span>
              </div>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {surah.type} · {formatNumberTr(surah.ayahCount)} Ayet · İniş Sırası:{' '}
                {surah.nuzulSirasi} · {surah.cuzs.join(', ')}. Cüz
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Sure bilgisini kapat"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sure Künyesi Özeti (surah_info.json) */}
        {extraInfo && (
          <div
            className="px-5 py-3 border-b space-y-1.5 text-xs shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-extrabold" style={{ color: 'var(--brand-primary-text)' }}>
                Sure Künyesi:
              </span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {extraInfo.meaningTr}
              </span>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="font-bold" style={{ color: 'var(--text-muted)' }}>
                Nüzul Sıraları:
              </span>
              <span>Hz. Osman #{extraInfo.nuzul.osman}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span>İbn Abbas #{extraInfo.nuzul.ibnAbbas}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span>
                Nöldeke #{extraInfo.nuzul.noldekeRank} ({extraInfo.nuzul.noldekePeriod})
              </span>
            </div>

            {extraInfo.medeniAyahs && extraInfo.medeniAyahs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span
                  className="font-bold"
                  style={{ color: 'var(--brand-accent-text)' }}
                >
                  Medenî İstisna Ayetler:
                </span>
                <span
                  className="tabular-nums font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {extraInfo.medeniAyahs
                    .map(([s, e]) => (s === e ? `${s}` : `${s}–${e}`))
                    .join(', ')}
                </span>
              </div>
            )}

            {extraInfo.nuzulNote && (
              <p className="leading-relaxed pt-0.5" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-bold" style={{ color: 'var(--text-muted)' }}>
                  Nüzul Notu:{' '}
                </span>
                {extraInfo.nuzulNote}
              </p>
            )}
          </div>
        )}

        {sections.length > 1 && (
          <div
            className="px-5 py-2.5 border-b shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div
              className="inline-flex items-center gap-1 p-1 rounded-xl"
              style={{ backgroundColor: 'var(--bg-surface-soft)' }}
            >
              {sections.map((sec) => {
                const active = sec.key === activeSection?.key;
                return (
                  <button
                    key={sec.key}
                    type="button"
                    onClick={() => {
                      sfxService.play('click');
                      setActiveKey(sec.key);
                    }}
                    className="min-h-[38px] px-3.5 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {sec.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {activeSection ? (
            <p
              className="turkish-reading text-sm sm:text-base whitespace-pre-line"
              style={{ color: 'var(--text-secondary)' }}
            >
              {activeSection.content}
            </p>
          ) : (
            <div
              className="p-6 rounded-xl text-center text-sm flex flex-col items-center gap-2"
              style={{
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-muted)',
              }}
            >
              <BookOpen className="w-5 h-5" />
              <span>Bu sure için ayrıntılı tanıtım metni bulunmuyor.</span>
            </div>
          )}
        </div>

        {onReadSurah && (
          <div
            className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                sfxService.play('click');
                onReadSurah(surah.no);
              }}
              className="min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-bold text-white inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95 whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Sureyi Oku</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
