import React, { useEffect } from 'react';
import { BookOpenCheck, Info, X } from 'lucide-react';
import { useRukusData } from '../hooks/useStudyReferenceData';
import { useBackButtonGuard } from '../services/backStackService';
import { useAppStore } from '../store/useAppStore';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';

export const WaqfGuideModal: React.FC = () => {
  const { isWaqfGuideOpen, closeWaqfGuide } = useAppStore();
  const { waqfSigns } = useRukusData(isWaqfGuideOpen);

  useBackButtonGuard('waqf_guide_modal', isWaqfGuideOpen, closeWaqfGuide);

  useEffect(() => {
    if (!isWaqfGuideOpen) return;
    return acquireBodyScrollLock();
  }, [isWaqfGuideOpen]);

  if (!isWaqfGuideOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Secâvend Vakıf (Durak) İşaretleri Rehberi"
      className="fixed inset-0 z-[97] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWaqfGuide();
      }}
    >
      <div
        className="w-full md:max-w-2xl lg:max-w-3xl max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
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
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-text)',
              }}
            >
              <BookOpenCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold truncate">
                Secâvend Vakıf (Durak) Rehberi
              </h2>
              <p className="hidden sm:block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                Kur&apos;an tilavetinde durma ve geçme işaretlerinin anlamları
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeWaqfGuide}
            aria-label="Kapat"
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer shrink-0"
            style={{ backgroundColor: 'var(--bg-surface-soft)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* İpucu Şeridi */}
        <div
          className="px-4 sm:px-5 py-2.5 border-b flex items-start gap-2 text-[11px] leading-snug shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--brand-primary)' }} />
          <span>
            Okuma ekranında Arapça ayetlerin içindeki renkli durak işaretlerine (ör.{' '}
            <span
              dir="rtl"
              lang="ar"
              className="inline-block font-bold mx-0.5 leading-none"
              style={{ fontFamily: "'Scheherazade New', serif", fontSize: '15px' }}
            >
              ط · ج · صلى
            </span>
            ) doğrudan dokunarak da anında özet bilgi alabilirsiniz.
          </span>
        </div>

        {/* 8 Secâvend Kartı — Masaüstünde 2 sütunlu ferah ızgara */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
          {waqfSigns.map((item) => (
            <div
              key={item.code}
              className="rounded-2xl border p-3.5 flex items-start gap-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div
                dir="rtl"
                lang="ar"
                className="waqf-mark-color w-12 h-12 rounded-xl border flex flex-col items-center justify-center shrink-0 font-arabic font-bold leading-none select-none"
                style={{
                  backgroundColor: `${item.color}18`,
                  borderColor: `${item.color}45`,
                  '--waqf-color': item.color,
                  fontSize: '20px',
                } as React.CSSProperties}
              >
                <span>{item.sign}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <h3 className="text-xs sm:text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {item.nameTr}
                  </h3>
                  <span
                    className="waqf-mark-color inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                    style={{
                      backgroundColor: `${item.color}18`,
                      '--waqf-color': item.color,
                    } as React.CSSProperties}
                  >
                    {item.actionTr}
                  </span>
                </div>

                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.desc}
                </p>

                {item.altSigns.length > 0 && (
                  <div
                    className="mt-2 flex items-center gap-1.5 flex-wrap text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span>Mushaf yazımları:</span>
                    {item.altSigns.map((alt) => {
                      const isCombiningMark = /^[\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/.test(
                        alt,
                      );
                      return (
                        <span
                          key={alt}
                          dir="rtl"
                          lang="ar"
                          className="waqf-mark-color inline-flex items-center justify-center min-w-[38px] min-h-[38px] px-2 rounded-lg border text-xl leading-none select-none"
                          style={{
                            backgroundColor: 'var(--bg-surface-soft)',
                            borderColor: 'var(--border-subtle)',
                            fontFamily: "'Scheherazade New', serif",
                            '--waqf-color': item.color,
                          } as React.CSSProperties}
                        >
                          {isCombiningMark ? `\u0640${alt}` : alt}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
