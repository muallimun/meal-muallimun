import React, { useEffect } from 'react';
import { BookOpenCheck, Info, X } from 'lucide-react';
import { useRukusData } from '../hooks/useStudyReferenceData';
import { useAppStore } from '../store/useAppStore';

export const WaqfGuideModal: React.FC = () => {
  const { isWaqfGuideOpen, closeWaqfGuide } = useAppStore();
  const { waqfSigns } = useRukusData(isWaqfGuideOpen);

  useEffect(() => {
    if (!isWaqfGuideOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWaqfGuide();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isWaqfGuideOpen, closeWaqfGuide]);

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
        className="w-full sm:max-w-xl max-h-[88dvh] rounded-t-3xl sm:rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Başlık */}
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
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
              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
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
            <span dir="rtl" lang="ar" className="font-arabic font-bold">
              {'\u00A0'}ۖ {'\u00A0'}ۗ {'\u00A0'}ۚ
            </span>
            ) doğrudan dokunarak da anında özet bilgi alabilirsiniz.
          </span>
        </div>

        {/* 8 Secâvend Kartı */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
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
                className="w-12 h-12 rounded-xl border flex flex-col items-center justify-center shrink-0 font-arabic font-bold leading-none select-none"
                style={{
                  backgroundColor: `${item.color}18`,
                  borderColor: `${item.color}45`,
                  color: item.color,
                  fontSize: '20px',
                }}
              >
                <span>{item.sign}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <h3 className="text-xs sm:text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                    {item.nameTr}
                  </h3>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                    style={{
                      backgroundColor: `${item.color}18`,
                      color: item.color,
                    }}
                  >
                    {item.actionTr}
                  </span>
                </div>

                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.desc}
                </p>

                {item.altSigns.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <span>Mushaf yazımları:</span>
                    {item.altSigns.map((alt) => (
                      <span
                        key={alt}
                        dir="rtl"
                        lang="ar"
                        className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md border font-arabic text-base leading-none"
                        style={{
                          backgroundColor: 'var(--bg-surface-soft)',
                          borderColor: 'var(--border-subtle)',
                          color: item.color,
                        }}
                      >
                        {'\u00A0'}
                        {alt}
                      </span>
                    ))}
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
