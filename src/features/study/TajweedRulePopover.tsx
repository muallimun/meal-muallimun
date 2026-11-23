import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Sparkles, Volume2, X } from 'lucide-react';
import { Z_LAYERS } from '../../config/zLayers';
import { useBackButtonGuard } from '../../services/backStackService';
import { sfxService } from '../../services/sfxService';
import { buildWordAudioKey, wordAudioService } from '../../services/wordAudioService';
import type { ThemeMode } from '../../types/quran';
import type { TajweedActiveSelection, TajweedRuleDef } from '../../types/tajweed';
import { resolveTajweedRuleColor } from './TajweedText';

interface TajweedPopoverPayload {
  selection: TajweedActiveSelection;
  rules: Record<string, TajweedRuleDef>;
}

type PopoverListener = (payload: TajweedPopoverPayload | null) => void;

const listeners = new Set<PopoverListener>();
let currentPayload: TajweedPopoverPayload | null = null;

/**
 * Uygulama genelinde tek bir Dokun-Öğren Tecvit baloncuğu açar.
 * Mushaf, Kartlar ve Kitap modlarının tamamında ortak çalışır.
 */
export function openTajweedPopover(
  selection: TajweedActiveSelection,
  rules: Record<string, TajweedRuleDef>,
): void {
  currentPayload = { selection, rules };
  for (const listener of listeners) {
    listener(currentPayload);
  }
}

export function closeTajweedPopover(): void {
  if (!currentPayload) return;
  currentPayload = null;
  for (const listener of listeners) {
    listener(null);
  }
}

interface TajweedRulePopoverProps {
  selection: TajweedActiveSelection | null;
  rules: Record<string, TajweedRuleDef>;
  theme: ThemeMode;
  onClose: () => void;
}

export const TajweedRulePopover: React.FC<TajweedRulePopoverProps> = ({
  selection,
  rules,
  theme,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const wordAudioState = useSyncExternalStore(
    wordAudioService.subscribe,
    wordAudioService.getSnapshot,
  );
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    isMobileSheet: boolean;
  }>({
    top: -9999,
    left: -9999,
    width: 320,
    isMobileSheet: false,
  });

  // Viewport sınırlarına göre akıllı konumlandırma (360px mobil alt sabit kompakt kart + masaüstü kenar korumalı)
  useLayoutEffect(() => {
    if (!selection) return;

    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobileSheet = vw < 640;

    if (isMobileSheet) {
      const width = Math.max(220, Math.min(380, vw - margin * 2));
      const left = Math.max(margin, Math.round((vw - width) / 2));
      setCoords({ top: 0, left, width, isMobileSheet: true });
      return;
    }

    const width = Math.min(340, Math.max(240, vw - margin * 2));
    const measuredHeight = popoverRef.current?.offsetHeight || 220;

    const anchorCenterX = (selection.rect.left + selection.rect.right) / 2;
    const rawLeft = anchorCenterX - width / 2;
    const left = Math.max(margin, Math.min(rawLeft, vw - width - margin));

    const gap = 10;
    const spaceBelow = vh - selection.rect.bottom - margin;
    const spaceAbove = selection.rect.top - margin;

    let top: number;
    if (spaceBelow >= measuredHeight + gap || spaceBelow >= spaceAbove) {
      top = Math.min(selection.rect.bottom + gap, vh - measuredHeight - margin);
    } else {
      top = Math.max(margin, selection.rect.top - measuredHeight - gap);
    }
    top = Math.max(margin, Math.min(top, vh - measuredHeight - margin));

    setCoords({ top, left, width, isMobileSheet: false });
  }, [selection]);

  useBackButtonGuard('tajweed_rule_popover', Boolean(selection), onClose);

  // Dışa tıklama veya kaydırma ile otomatik kapat (Escape merkezi LIFO yığınından yönetilir)
  useEffect(() => {
    if (!selection) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      // Başka bir renkli tecvit parçasına basıldığında o parçanın click handler'ı yeni seçimi açacak
      if (target.closest('[data-tajweed-rule]')) return;
      onClose();
    };

    const handleScrollOrResize = (e: Event) => {
      // Baloncuğun kendi içi kaydırılıyorsa kapatma
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [selection, onClose]);

  if (!selection || typeof document === 'undefined') return null;

  const { word, rule } = selection;
  const activeColor = resolveTajweedRuleColor(rule, theme);

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`Tecvit Kuralı: ${rule.nameTr}`}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`fixed ${Z_LAYERS.POPOVER} rounded-2xl border shadow-2xl overflow-y-auto max-w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] animate-in fade-in duration-150`}
      style={{
        ...(coords.isMobileSheet
          ? {
              bottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
              left: `${coords.left}px`,
            }
          : {
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }),
        width: `${coords.width}px`,
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow:
          theme === 'dark'
            ? '0 20px 50px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255,255,255,0.06)'
            : '0 20px 45px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.08)',
      }}
    >
      {/* Üst Kural Başlığı */}
      <div
        className="px-3.5 py-2.5 border-b flex items-center justify-between gap-2"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1"
            style={{
              backgroundColor: activeColor,
              boxShadow: `0 0 0 2px ${activeColor}33`,
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs sm:text-[13px] font-extrabold leading-tight truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {rule.nameTr}
              </span>
              {rule.nameAr && (
                <span
                  dir="rtl"
                  className="arabic-tajweed text-sm font-bold leading-none shrink-0"
                  style={{ color: activeColor }}
                >
                  {rule.nameAr}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            sfxService.play('click');
            onClose();
          }}
          aria-label="Tecvit baloncuğunu kapat"
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-muted)',
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Büyütülmüş Arapça Kelime Önizlemesi (Harf Birleşmesi %100 Korunur) + Kelimeyi Dinle */}
      <div className="px-3.5 pt-3 pb-2.5 space-y-2.5">
        <div
          className="py-2.5 px-3 rounded-xl border text-center space-y-2"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            dir="rtl"
            className="arabic-tajweed select-text"
            style={{
              fontSize: '32px',
              lineHeight: 1.9,
              color: 'var(--text-primary)',
            }}
          >
            {word.map((seg, idx) => {
              if (typeof seg === 'string') {
                return <React.Fragment key={idx}>{seg}</React.Fragment>;
              }
              const [segText, segCode] = seg;
              const segRule = rules[segCode];
              if (!segRule) {
                return <React.Fragment key={idx}>{segText}</React.Fragment>;
              }
              const segColor = resolveTajweedRuleColor(segRule, theme);
              return (
                <span key={idx} style={{ color: segColor }}>
                  {segText}
                </span>
              );
            })}
          </div>

          {typeof selection.surahNo === 'number' &&
            typeof selection.ayahNo === 'number' &&
            typeof selection.wordIndex === 'number' &&
            (() => {
              const audioKey = buildWordAudioKey(
                selection.surahNo,
                selection.ayahNo,
                selection.wordIndex,
              );
              const isThisWordLoading =
                wordAudioState.playingKey === audioKey && wordAudioState.status === 'loading';
              const isThisWordPlaying =
                wordAudioState.playingKey === audioKey && wordAudioState.status === 'playing';
              return (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      wordAudioService.playWordAudio(
                        selection.surahNo!,
                        selection.ayahNo!,
                        selection.wordIndex!,
                        selection.totalWords,
                      );
                    }}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    style={{
                      backgroundColor:
                        isThisWordPlaying || isThisWordLoading
                          ? 'var(--brand-primary)'
                          : 'var(--bg-surface)',
                      borderColor:
                        isThisWordPlaying || isThisWordLoading
                          ? 'var(--brand-primary)'
                          : 'var(--border-subtle)',
                      color:
                        isThisWordPlaying || isThisWordLoading
                          ? '#FFFFFF'
                          : 'var(--brand-primary-text)',
                    }}
                  >
                    {isThisWordLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Volume2
                        className={`w-3.5 h-3.5 shrink-0 ${isThisWordPlaying ? 'animate-pulse' : ''}`}
                      />
                    )}
                    <span>
                      {isThisWordLoading
                        ? 'Yükleniyor...'
                        : isThisWordPlaying
                          ? 'Okunuyor...'
                          : 'Kelimeyi Dinle'}
                    </span>
                  </button>
                </div>
              );
            })()}
        </div>

        {/* Türkçe Pratik Uygulama Açıklaması */}
        <p
          className="text-xs sm:text-[13px] leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          {rule.desc}
        </p>

        {/* Alt Kategori Rozeti */}
        <div
          className="pt-2 border-t flex items-center justify-between gap-2 text-[11px]"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <span className="inline-flex items-center gap-1 font-semibold">
            <Sparkles className="w-3 h-3" style={{ color: activeColor }} />
            <span>{rule.category || 'Tecvit Rehberi'}</span>
          </span>
          <span className="opacity-80">Dokun-Öğren</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface TajweedRulePopoverHostProps {
  theme: ThemeMode;
  enabled?: boolean;
}

/**
 * StudyPage içinde tek kez bağlanır; tüm okuma modlarından tetiklenen
 * tecvit baloncuğunu merkezi olarak yönetir.
 */
export const TajweedRulePopoverHost: React.FC<TajweedRulePopoverHostProps> = ({
  theme,
  enabled = true,
}) => {
  const [payload, setPayload] = useState<TajweedPopoverPayload | null>(() => currentPayload);

  useEffect(() => {
    const listener: PopoverListener = (next) => {
      setPayload(next);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      closeTajweedPopover();
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      closeTajweedPopover();
    }
  }, [enabled]);

  if (!enabled) return null;

  return (
    <TajweedRulePopover
      selection={payload?.selection ?? null}
      rules={payload?.rules ?? {}}
      theme={theme}
      onClose={closeTajweedPopover}
    />
  );
};
