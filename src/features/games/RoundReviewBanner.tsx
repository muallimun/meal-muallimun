import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Info, PauseCircle, XCircle } from 'lucide-react';

interface RoundReviewBannerProps {
  variant: 'success' | 'error' | 'info';
  message: React.ReactNode;
  ctaLabel: string;
  onContinue: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Otomatik geçiş süresi (ms). Verilirse görsel geri sayım çubuğu gösterilir ve süre dolunca onContinue çağrılır. */
  autoAdvanceMs?: number | null;
  /** Zaman Yarışı modunda sayacın duraklatıldığını gösteren rozet */
  timerPausedNote?: boolean;
}

export const RoundReviewBanner: React.FC<RoundReviewBannerProps> = ({
  variant,
  message,
  ctaLabel,
  onContinue,
  secondaryAction,
  autoAdvanceMs = null,
  timerPausedNote = false,
}) => {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const triggeredRef = useRef<boolean>(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  const [progressPct, setProgressPct] = useState<number>(100);

  // Mobilde şerit açıldığında yumuşakça görünür alana kaydır
  useEffect(() => {
    const el = bannerRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const raf = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, []);

  // İsteğe bağlı görsel geri sayım + otomatik geçiş (tıklanırsa anında geçer)
  useEffect(() => {
    triggeredRef.current = false;
    if (!autoAdvanceMs || autoAdvanceMs <= 0) {
      setProgressPct(100);
      return;
    }

    const startTime = performance.now();
    setProgressPct(100);

    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      const remainingRatio = Math.max(0, 1 - elapsed / autoAdvanceMs);
      setProgressPct(remainingRatio * 100);
      if (elapsed >= autoAdvanceMs && !triggeredRef.current) {
        triggeredRef.current = true;
        window.clearInterval(interval);
        onContinueRef.current();
      }
    }, 50);

    return () => window.clearInterval(interval);
  }, [autoAdvanceMs]);

  const handleManualContinue = () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    onContinue();
  };

  const containerStyle =
    variant === 'error'
      ? 'bg-red-950/92 border-red-400/55 text-red-50'
      : variant === 'success'
        ? 'bg-emerald-950/92 border-emerald-300/50 text-emerald-50'
        : 'bg-slate-950/90 border-amber-300/45 text-white';

  const progressBarColor =
    variant === 'error'
      ? 'bg-red-400'
      : variant === 'success'
        ? 'bg-emerald-400'
        : 'bg-amber-400';

  const Icon = variant === 'error' ? XCircle : variant === 'success' ? CheckCircle2 : Info;

  return (
    <div
      ref={bannerRef}
      role="status"
      aria-live="polite"
      className={`sticky bottom-1 z-20 shrink-0 rounded-2xl border backdrop-blur-md shadow-xl overflow-hidden ${containerStyle}`}
    >
      <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5 text-amber-300" />
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs sm:text-sm lg:text-[15px] font-semibold leading-snug break-words">
              {message}
            </div>
            {timerPausedNote && (
              <div className="inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-200/90">
                <PauseCircle className="w-3 h-3 shrink-0" />
                <span>Süre duraklatıldı</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="flex-1 sm:flex-initial min-h-[40px] px-3.5 rounded-xl font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer border border-white/25 bg-white/10 hover:bg-white/18 text-white transition-colors whitespace-nowrap"
            >
              <span>{secondaryAction.label}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleManualContinue}
            className="flex-1 sm:flex-initial min-h-[40px] px-4 rounded-xl font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-95 whitespace-nowrap"
            style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}
          >
            <span>{ctaLabel}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {autoAdvanceMs && autoAdvanceMs > 0 ? (
        <div className="h-1 w-full bg-white/12 overflow-hidden">
          <div
            className={`h-full transition-[width] duration-75 ease-linear ${progressBarColor}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
};
