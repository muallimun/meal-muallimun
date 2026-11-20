import React, { useEffect, useState } from 'react';
import { BookOpen, Info, X } from 'lucide-react';
import { sfxService } from '../../services/sfxService';
import type { SurahMeta } from '../../types/quran';
import { formatNumberTr } from '../../utils/poolUtils';
import { formatSafeArabicTitle } from '../../utils/arabicUtils';

interface SurahInfoModalProps {
  surah: SurahMeta | null;
  onClose: () => void;
}

type InfoSectionKey = 'hakkinda' | 'nuzul' | 'konusu';

export const SurahInfoModal: React.FC<SurahInfoModalProps> = ({ surah, onClose }) => {
  const sections: { key: InfoSectionKey; label: string; content: string }[] = surah
    ? [
        { key: 'hakkinda' as const, label: 'Hakkında', content: surah.hakkinda?.trim() ?? '' },
        { key: 'nuzul' as const, label: 'Nüzul Sebebi', content: surah.nuzul?.trim() ?? '' },
        { key: 'konusu' as const, label: 'Konusu', content: surah.konusu?.trim() ?? '' },
      ].filter((item) => item.content.length > 0)
    : [];

  const [activeKey, setActiveKey] = useState<InfoSectionKey>('hakkinda');

  useEffect(() => {
    if (sections.length > 0 && !sections.some((s) => s.key === activeKey)) {
      setActiveKey(sections[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah?.no]);

  useEffect(() => {
    if (!surah) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [surah, onClose]);

  if (!surah) return null;

  const activeSection = sections.find((s) => s.key === activeKey) ?? sections[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
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
      </div>
    </div>
  );
};
