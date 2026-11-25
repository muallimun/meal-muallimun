import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CombinedVerse, ThemeMode } from '../../types/quran';

interface BookScrollRailProps {
  articleRef: React.RefObject<HTMLElement | null>;
  verses: CombinedVerse[];
  totalAyahs: number;
  theme: ThemeMode;
  isAnyAudioVisible: boolean;
  isMobileImmersive: boolean;
  layoutKey: string;
  onDesktopRailVisibilityChange?: (visible: boolean) => void;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function scrollInstantTo(top: number): void {
  const html = document.documentElement;
  const prevBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(0, Math.max(0, top));
  html.style.scrollBehavior = prevBehavior;
}

export const BookScrollRail: React.FC<BookScrollRailProps> = ({
  articleRef,
  verses,
  totalAyahs,
  theme,
  isAnyAudioVisible,
  isMobileImmersive,
  layoutKey,
  onDesktopRailVisibilityChange,
}) => {
  const railRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [metrics, setMetrics] = useState({
    showDesktopRail: false,
    showMobileScrubber: false,
    progress: 0,
    thumbRatio: 0.2,
    viewportH: typeof window !== 'undefined' ? window.innerHeight : 800,
    trackH: 420,
    maxScroll: 0,
  });

  // Desktop rail interaction states
  const [isDraggingDesktop, setIsDraggingDesktop] = useState(false);
  const [isHoveringTrack, setIsHoveringTrack] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [desktopTooltipVisible, setDesktopTooltipVisible] = useState(false);
  const desktopTooltipTimerRef = useRef<number | null>(null);
  const desktopDragOffsetRef = useRef<number>(0);

  // Mobile edge scrubber states
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const [isMobileScrolling, setIsMobileScrolling] = useState(false);
  const mobileFadeTimerRef = useRef<number | null>(null);
  const mobileDragOffsetRef = useRef<number>(0);
  const lastScrollYForMobileRef = useRef<number>(
    typeof window !== 'undefined' ? window.scrollY : 0,
  );

  const rafRef = useRef<number | null>(null);

  const computeMetrics = useCallback(() => {
    if (typeof window === 'undefined') return;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const maxScroll = Math.max(0, docH - vh);
    const articleH = articleRef.current?.offsetHeight ?? docH;
    const scrollableEnough = articleH > vh * 1.25 && maxScroll > 120;
    const progress = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;
    const thumbRatio = docH > 0 ? clamp(vh / docH, 0.05, 0.45) : 0.2;
    const measuredTrackH = trackRef.current?.clientHeight ?? Math.max(200, vh - 220);

    setMetrics((prev) => {
      const showDesktopRail = scrollableEnough;
      const showMobileScrubber = scrollableEnough && verses.length >= 15;
      if (
        prev.showDesktopRail === showDesktopRail &&
        prev.showMobileScrubber === showMobileScrubber &&
        Math.abs(prev.progress - progress) < 0.001 &&
        Math.abs(prev.thumbRatio - thumbRatio) < 0.005 &&
        prev.viewportH === vh &&
        Math.abs(prev.trackH - measuredTrackH) < 2 &&
        Math.abs(prev.maxScroll - maxScroll) < 2
      ) {
        return prev;
      }
      return {
        showDesktopRail,
        showMobileScrubber,
        progress,
        thumbRatio,
        viewportH: vh,
        trackH: measuredTrackH,
        maxScroll,
      };
    });
  }, [articleRef, verses.length]);

  useEffect(() => {
    onDesktopRailVisibilityChange?.(metrics.showDesktopRail);
  }, [metrics.showDesktopRail, onDesktopRailVisibilityChange]);

  // Ray ilk kez görünür olduğunda kanal yüksekliğini ölç
  useEffect(() => {
    if (!metrics.showDesktopRail) return;
    const id = window.requestAnimationFrame(() => computeMetrics());
    return () => window.cancelAnimationFrame(id);
  }, [metrics.showDesktopRail, isAnyAudioVisible, computeMetrics]);

  const scheduleTooltipAutoHide = useCallback((ms = 900) => {
    if (desktopTooltipTimerRef.current !== null) {
      window.clearTimeout(desktopTooltipTimerRef.current);
    }
    setDesktopTooltipVisible(true);
    desktopTooltipTimerRef.current = window.setTimeout(() => {
      setDesktopTooltipVisible(false);
      desktopTooltipTimerRef.current = null;
    }, ms);
  }, []);

  const triggerMobileReveal = useCallback(() => {
    setIsMobileScrolling(true);
    if (mobileFadeTimerRef.current !== null) {
      window.clearTimeout(mobileFadeTimerRef.current);
    }
    mobileFadeTimerRef.current = window.setTimeout(() => {
      setIsMobileScrolling(false);
      mobileFadeTimerRef.current = null;
    }, 1600);
  }, []);

  // Scroll + Resize + Article ResizeObserver senkronizasyonu
  useEffect(() => {
    computeMetrics();
    const timer = window.setTimeout(computeMetrics, 140);

    const onScroll = () => {
      const curY = window.scrollY;
      if (Math.abs(curY - lastScrollYForMobileRef.current) > 4) {
        lastScrollYForMobileRef.current = curY;
        triggerMobileReveal();
      }
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        computeMetrics();
      });
    };

    const onResize = () => {
      computeMetrics();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    let ro: ResizeObserver | null = null;
    const articleEl = articleRef.current;
    if (articleEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        computeMetrics();
      });
      ro.observe(articleEl);
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      ro?.disconnect();
    };
  }, [articleRef, computeMetrics, triggerMobileReveal, layoutKey]);

  // Temizlik
  useEffect(() => {
    return () => {
      if (desktopTooltipTimerRef.current !== null) {
        window.clearTimeout(desktopTooltipTimerRef.current);
      }
      if (mobileFadeTimerRef.current !== null) {
        window.clearTimeout(mobileFadeTimerRef.current);
      }
    };
  }, []);

  // Yalnızca ray üzerinde hızlandırılmış fare tekerleği (non-passive listener)
  useEffect(() => {
    const railEl = railRef.current;
    if (!railEl || !metrics.showDesktopRail) return;

    const handleRailWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const nextTop = clamp(window.scrollY + e.deltaY * 2.4, 0, maxScroll);
      scrollInstantTo(nextTop);
      computeMetrics();
      scheduleTooltipAutoHide(900);
    };

    railEl.addEventListener('wheel', handleRailWheel, { passive: false });
    return () => {
      railEl.removeEventListener('wheel', handleRailWheel);
    };
  }, [metrics.showDesktopRail, computeMetrics, scheduleTooltipAutoHide]);

  // Seçili orana karşılık gelen ayet & sayfa bilgisini hesapla
  const getVerseAtRatio = useCallback(
    (ratio: number): { ayah: number; page: number } | null => {
      if (verses.length === 0) return null;
      const idx = clamp(Math.round(ratio * (verses.length - 1)), 0, verses.length - 1);
      const v = verses[idx];
      return v ? { ayah: v.ayah, page: v.page } : null;
    },
    [verses],
  );

  // Masaüstü ray kanal ölçü yardımcısı
  const getDesktopTrackGeometry = () => {
    const trackEl = trackRef.current;
    if (!trackEl) return null;
    const rect = trackEl.getBoundingClientRect();
    const trackH = rect.height;
    const thumbH = Math.max(44, Math.min(Math.round(trackH * 0.42), Math.round(trackH * metrics.thumbRatio)));
    const travel = Math.max(1, trackH - thumbH);
    return { rect, trackH, thumbH, travel };
  };

  const handleDesktopThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const geom = getDesktopTrackGeometry();
    if (!geom) return;
    const thumbTop = metrics.progress * geom.travel;
    desktopDragOffsetRef.current = e.clientY - (geom.rect.top + thumbTop);
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingDesktop(true);
    setHoverRatio(null);
    if (desktopTooltipTimerRef.current !== null) {
      window.clearTimeout(desktopTooltipTimerRef.current);
      desktopTooltipTimerRef.current = null;
    }
    setDesktopTooltipVisible(true);
  };

  const handleDesktopThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDesktop) return;
    e.stopPropagation();
    const geom = getDesktopTrackGeometry();
    if (!geom) return;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const nextThumbTop = clamp(e.clientY - geom.rect.top - desktopDragOffsetRef.current, 0, geom.travel);
    const ratio = nextThumbTop / geom.travel;
    scrollInstantTo(ratio * maxScroll);
    setMetrics((prev) => ({ ...prev, progress: ratio, maxScroll }));
  };

  const handleDesktopThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDesktop) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDraggingDesktop(false);
    scheduleTooltipAutoHide(900);
  };

  const handleDesktopTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const geom = getDesktopTrackGeometry();
    if (!geom) return;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const clickTop = clamp(e.clientY - geom.rect.top - geom.thumbH / 2, 0, geom.travel);
    const ratio = clickTop / geom.travel;
    window.scrollTo({ top: ratio * maxScroll, behavior: 'smooth' });
    scheduleTooltipAutoHide(900);
  };

  const handleDesktopTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingDesktop) return;
    const geom = getDesktopTrackGeometry();
    if (!geom) return;
    const ratio = clamp((e.clientY - geom.rect.top) / Math.max(1, geom.trackH), 0, 1);
    setHoverRatio(ratio);
  };

  const handleStepUp = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.shiftKey) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollBy({ top: -Math.round(window.innerHeight * 0.78), behavior: 'smooth' });
    }
    scheduleTooltipAutoHide(900);
  };

  const handleStepDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (e.shiftKey) {
      window.scrollTo({ top: maxScroll, behavior: 'smooth' });
    } else {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.78), behavior: 'smooth' });
    }
    scheduleTooltipAutoHide(900);
  };

  // Mobil sağ kenar gezgini (edge scrubber) geometri & sürükleme
  const mobileTopSafe = isMobileImmersive ? 68 : 112;
  const mobileBottomSafe = isAnyAudioVisible
    ? isMobileImmersive
      ? 98
      : 158
    : isMobileImmersive
      ? 24
      : 92;
  const mobilePillH = 44;
  const mobileTrackH = Math.max(120, metrics.viewportH - mobileTopSafe - mobileBottomSafe);
  const mobileTravel = Math.max(1, mobileTrackH - mobilePillH);
  const mobilePillTop = Math.round(mobileTopSafe + metrics.progress * mobileTravel);

  const handleMobilePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    mobileDragOffsetRef.current = e.clientY - mobilePillTop;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsMobileDragging(true);
    setIsMobileScrolling(true);
    if (mobileFadeTimerRef.current !== null) {
      window.clearTimeout(mobileFadeTimerRef.current);
      mobileFadeTimerRef.current = null;
    }
  };

  const handleMobilePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobileDragging) return;
    e.stopPropagation();
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const nextTop = clamp(
      e.clientY - mobileTopSafe - mobileDragOffsetRef.current,
      0,
      mobileTravel,
    );
    const ratio = nextTop / mobileTravel;
    scrollInstantTo(ratio * maxScroll);
    setMetrics((prev) => ({ ...prev, progress: ratio, maxScroll }));
  };

  const handleMobilePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobileDragging) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsMobileDragging(false);
    triggerMobileReveal();
  };

  const isCream = theme === 'cream';
  const isDark = theme === 'dark';

  const activeDesktopRatio =
    isDraggingDesktop || !isHoveringTrack || hoverRatio === null ? metrics.progress : hoverRatio;
  const desktopBadgeInfo = getVerseAtRatio(activeDesktopRatio);
  const showDesktopBadge =
    Boolean(desktopBadgeInfo) && (isDraggingDesktop || isHoveringTrack || desktopTooltipVisible);

  const mobileBadgeInfo = getVerseAtRatio(metrics.progress);

  // Masaüstü thumb rengi (Krem Mushaf'ta sıcak zümrüt/kehribar yüksek kontrast)
  const thumbBg = isCream
    ? isDraggingDesktop
      ? '#0b5e57'
      : '#0f766e'
    : isDark
      ? isDraggingDesktop
        ? '#2dd4bf'
        : '#14b8a6'
      : isDraggingDesktop
        ? '#0b5e57'
        : '#0f766e';

  const trackBg = isCream
    ? 'rgba(180, 146, 92, 0.24)'
    : isDark
      ? 'rgba(148, 163, 184, 0.16)'
      : 'rgba(15, 118, 110, 0.12)';

  const trackFillBg = isCream
    ? 'rgba(15, 118, 110, 0.28)'
    : isDark
      ? 'rgba(45, 212, 191, 0.28)'
      : 'rgba(15, 118, 110, 0.24)';

  const desktopThumbHeightPx = Math.max(
    44,
    Math.min(Math.round(metrics.trackH * 0.44), Math.round(metrics.trackH * metrics.thumbRatio)),
  );
  const desktopTravelPx = Math.max(1, metrics.trackH - desktopThumbHeightPx);
  const desktopThumbTopPx = Math.round(metrics.progress * desktopTravelPx);

  return (
    <>
      {/* ================================================================
          1. MASAÜSTÜ (lg+): KİTAP KENARI AKILLI KAYDIRMA RAYI
          ================================================================ */}
      {metrics.showDesktopRail && (
        <aside
          ref={railRef}
          aria-label="Kitap sayfası hızlı kaydırma rayı"
          onClick={(e) => e.stopPropagation()}
          className={`hidden lg:flex sticky top-[4.75rem] shrink-0 w-10 flex-col items-center justify-between gap-2 py-1 select-none z-20 ${
            isAnyAudioVisible ? 'h-[calc(100dvh-10.5rem)]' : 'h-[calc(100dvh-7.5rem)]'
          }`}
        >
          {/* Üst Hızlı Adım Düğmesi (▲) */}
          <button
            type="button"
            onClick={handleStepUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              scheduleTooltipAutoHide(900);
            }}
            disabled={metrics.progress <= 0.002}
            title="Bir ekran yukarı kaydır (Shift+Tık veya çift tık: Sure başı)"
            aria-label="Bir ekran yukarı kaydır"
            className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-35 hover:scale-105 active:scale-95 shadow-xs"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          {/* Ana Kanal ve Sürüklenebilir Tutamak (36px yakalama alanı) */}
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Sure okuma konumu"
            aria-valuemin={1}
            aria-valuemax={Math.max(1, totalAyahs)}
            aria-valuenow={desktopBadgeInfo?.ayah ?? 1}
            aria-valuetext={
              desktopBadgeInfo
                ? `Ayet ${desktopBadgeInfo.ayah} / ${totalAyahs}, Sayfa ${desktopBadgeInfo.page}`
                : undefined
            }
            onPointerDown={handleDesktopTrackPointerDown}
            onPointerEnter={() => setIsHoveringTrack(true)}
            onPointerMove={handleDesktopTrackPointerMove}
            onPointerLeave={() => {
              setIsHoveringTrack(false);
              setHoverRatio(null);
            }}
            onKeyDown={(e) => {
              const maxScroll = Math.max(
                0,
                document.documentElement.scrollHeight - window.innerHeight,
              );
              if (e.key === 'ArrowDown' || e.key === 'PageDown') {
                e.preventDefault();
                window.scrollBy({
                  top: Math.round(window.innerHeight * (e.key === 'PageDown' ? 0.85 : 0.25)),
                  behavior: 'smooth',
                });
                scheduleTooltipAutoHide(900);
              } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                window.scrollBy({
                  top: -Math.round(window.innerHeight * (e.key === 'PageUp' ? 0.85 : 0.25)),
                  behavior: 'smooth',
                });
                scheduleTooltipAutoHide(900);
              } else if (e.key === 'Home') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                scheduleTooltipAutoHide(900);
              } else if (e.key === 'End') {
                e.preventDefault();
                window.scrollTo({ top: maxScroll, behavior: 'smooth' });
                scheduleTooltipAutoHide(900);
              }
            }}
            className="relative flex-1 w-9 flex items-center justify-center cursor-pointer touch-none select-none group/rail"
          >
            {/* Kanal İz Çubuğu (w-2.5) */}
            <div
              className="relative w-2.5 h-full rounded-full overflow-hidden border transition-colors"
              style={{
                backgroundColor: trackBg,
                borderColor: 'var(--border-subtle)',
              }}
            >
              {/* Okuma İlerleme Dolgusu */}
              <div
                className="w-full rounded-full transition-[height] duration-75"
                style={{
                  height: `${Math.min(100, Math.round(((desktopThumbTopPx + desktopThumbHeightPx / 2) / Math.max(1, metrics.trackH)) * 100))}%`,
                  backgroundColor: trackFillBg,
                }}
              />
            </div>

            {/* Sürüklenebilir Yüksek Kontrastlı Tutamak (min 44px boy, piksel hassasiyetli) */}
            <div
              onPointerDown={handleDesktopThumbPointerDown}
              onPointerMove={handleDesktopThumbPointerMove}
              onPointerUp={handleDesktopThumbPointerUp}
              onPointerCancel={handleDesktopThumbPointerUp}
              className={`absolute left-1/2 -translate-x-1/2 rounded-full transition-[width,box-shadow,background-color] duration-150 flex items-center justify-center touch-none select-none ${
                isDraggingDesktop
                  ? 'w-3.5 cursor-grabbing shadow-md'
                  : 'w-3 group-hover/rail:w-3.5 cursor-grab shadow-sm'
              }`}
              style={{
                top: `${desktopThumbTopPx}px`,
                height: `${desktopThumbHeightPx}px`,
                backgroundColor: thumbBg,
                boxShadow: isDraggingDesktop
                  ? '0 4px 14px rgba(15, 118, 110, 0.38)'
                  : '0 2px 6px rgba(15, 32, 30, 0.22)',
              }}
            >
              {/* Tutamak merkez kavrama çizgileri */}
              <span
                aria-hidden="true"
                className="flex flex-col items-center gap-[3px] pointer-events-none opacity-80"
              >
                <span className="w-1.5 h-[1.5px] rounded-full bg-white/90" />
                <span className="w-1.5 h-[1.5px] rounded-full bg-white/90" />
                <span className="w-1.5 h-[1.5px] rounded-full bg-white/90" />
              </span>
            </div>

            {/* Canlı Ayet & Sayfa İpucu Baloncuğu (Tutamağın Solunda) */}
            {desktopBadgeInfo && (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute right-11 -translate-y-1/2 px-2.5 py-1.5 rounded-xl border shadow-lg whitespace-nowrap transition-opacity duration-200 ${
                  showDesktopBadge ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  top: `${clamp(Math.round(activeDesktopRatio * 100), 6, 94)}%`,
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--brand-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                <div className="text-xs font-extrabold tabular-nums leading-tight">
                  Ayet {desktopBadgeInfo.ayah} / {totalAyahs}
                </div>
                <div
                  className="text-[10px] font-bold tabular-nums leading-tight mt-0.5"
                  style={{ color: 'var(--brand-primary-text)' }}
                >
                  Sayfa {desktopBadgeInfo.page}
                </div>
              </div>
            )}
          </div>

          {/* Alt Hızlı Adım Düğmesi (▼) */}
          <button
            type="button"
            onClick={handleStepDown}
            onDoubleClick={(e) => {
              e.stopPropagation();
              const maxScroll = Math.max(
                0,
                document.documentElement.scrollHeight - window.innerHeight,
              );
              window.scrollTo({ top: maxScroll, behavior: 'smooth' });
              scheduleTooltipAutoHide(900);
            }}
            disabled={metrics.progress >= 0.998}
            title="Bir ekran aşağı kaydır (Shift+Tık veya çift tık: Sure sonu)"
            aria-label="Bir ekran aşağı kaydır"
            className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-35 hover:scale-105 active:scale-95 shadow-xs"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* ================================================================
          2. MOBİL (< lg): UZUN SURELERDE SAĞ KENAR HIZLI AYET GEZGİNİ
          ================================================================ */}
      {metrics.showMobileScrubber && (
        <div
          aria-label="Hızlı ayet gezgini"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handleMobilePointerDown}
          onPointerMove={handleMobilePointerMove}
          onPointerUp={handleMobilePointerUp}
          onPointerCancel={handleMobilePointerUp}
          className={`lg:hidden fixed right-1.5 z-30 w-8 h-12 flex items-center justify-end touch-none select-none transition-opacity duration-300 ${
            isMobileDragging
              ? 'opacity-100'
              : isMobileScrolling
                ? 'opacity-90'
                : 'opacity-25'
          }`}
          style={{
            top: `${mobilePillTop}px`,
          }}
        >
          {/* Sürükleme esnasında parmağın solunda net Ayet & Sayfa baloncuğu */}
          {isMobileDragging && mobileBadgeInfo && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl border shadow-xl whitespace-nowrap"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--brand-primary)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="text-xs font-extrabold tabular-nums">
                Ayet {mobileBadgeInfo.ayah} / {totalAyahs}
              </span>
              <span
                className="text-[11px] font-bold tabular-nums ml-1.5"
                style={{ color: 'var(--brand-primary-text)' }}
              >
                · S.{mobileBadgeInfo.page}
              </span>
            </div>
          )}

          {/* Zarif Dokunmatik Kenar Tutamağı */}
          <div
            className={`rounded-full border shadow-md flex flex-col items-center justify-center gap-[3px] transition-all ${
              isMobileDragging ? 'w-4 h-11' : 'w-3 h-10'
            }`}
            style={{
              backgroundColor: isMobileDragging ? thumbBg : 'var(--bg-surface)',
              borderColor: isMobileDragging ? thumbBg : 'var(--brand-primary)',
            }}
          >
            <span
              className="w-1.5 h-[1.5px] rounded-full"
              style={{
                backgroundColor: isMobileDragging ? '#FFFFFF' : 'var(--brand-primary-text)',
              }}
            />
            <span
              className="w-1.5 h-[1.5px] rounded-full"
              style={{
                backgroundColor: isMobileDragging ? '#FFFFFF' : 'var(--brand-primary-text)',
              }}
            />
            <span
              className="w-1.5 h-[1.5px] rounded-full"
              style={{
                backgroundColor: isMobileDragging ? '#FFFFFF' : 'var(--brand-primary-text)',
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};
