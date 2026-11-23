import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookMarked, BookOpenCheck, Play, X } from 'lucide-react';
import { Z_LAYERS } from '../../config/zLayers';
import { audioQueueService } from '../../services/audioQueueService';
import { useBackButtonGuard } from '../../services/backStackService';
import { sfxService } from '../../services/sfxService';
import {
  closeRukuPopover,
  closeWaqfPopover,
  openRukuPopover,
  subscribeRukuPopover,
  subscribeWaqfPopover,
  type PopoverAnchorRect,
  type RukuPopoverPayload,
  type WaqfPopoverPayload,
} from '../../services/studyPopoverBus';
import { useAppStore } from '../../store/useAppStore';
import type { RukuItem } from '../../types/fihrist';

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
  isMobileSheet: boolean;
}

function computeClampedPosition(
  anchor: PopoverAnchorRect,
  preferredWidth: number,
  measuredHeight: number,
): PopoverCoords {
  const margin = 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;

  if (vw < 640) {
    const width = Math.max(220, Math.min(360, vw - margin * 2));
    const left = Math.max(margin, Math.round((vw - width) / 2));
    return { top: 0, left, width, isMobileSheet: true };
  }

  const width = Math.min(preferredWidth, Math.max(220, vw - margin * 2));
  const rawLeft = anchor.left + anchor.width / 2 - width / 2;
  const left = Math.max(margin, Math.min(rawLeft, vw - width - margin));

  const gap = 8;
  const spaceBelow = vh - anchor.bottom - margin;
  const spaceAbove = anchor.top - margin;

  let top: number;
  if (spaceBelow >= measuredHeight + gap || spaceBelow >= spaceAbove) {
    top = Math.min(anchor.bottom + gap, vh - measuredHeight - margin);
  } else {
    top = Math.max(margin, anchor.top - measuredHeight - gap);
  }
  top = Math.max(margin, Math.min(top, vh - measuredHeight - margin));

  return { top, left, width, isMobileSheet: false };
}

/**
 * Secâvend durak işaretine dokunulduğunda açılan viewport-clamped bilgi baloncuğu.
 */
export const WaqfPopoverHost: React.FC = () => {
  const { openWaqfGuide } = useAppStore();
  const [payload, setPayload] = useState<WaqfPopoverPayload | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<PopoverCoords>({
    top: -9999,
    left: -9999,
    width: 310,
    isMobileSheet: false,
  });

  useEffect(() => subscribeWaqfPopover(setPayload), []);

  useLayoutEffect(() => {
    if (!payload) return;
    const measuredHeight = popoverRef.current?.offsetHeight || 190;
    setCoords(computeClampedPosition(payload.anchorRect, 310, measuredHeight));
  }, [payload]);

  useBackButtonGuard('waqf_popover', Boolean(payload), closeWaqfPopover);

  useEffect(() => {
    if (!payload) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (popoverRef.current?.contains(target)) return;
      if (target?.closest('[data-waqf-sign="1"]')) return;
      closeWaqfPopover();
    };
    const handleScrollOrResize = (e: Event) => {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      closeWaqfPopover();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [payload]);

  if (!payload || typeof document === 'undefined') return null;

  const { sign } = payload;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`${sign.nameTr} durak açıklaması`}
      className={`fixed ${Z_LAYERS.POPOVER} rounded-2xl border shadow-2xl p-3.5 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto`}
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
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            dir="rtl"
            lang="ar"
            className="waqf-mark-color w-9 h-9 rounded-xl border flex items-center justify-center font-arabic text-lg font-bold leading-none shrink-0"
            style={{
              backgroundColor: `${sign.color}18`,
              borderColor: `${sign.color}45`,
              '--waqf-color': sign.color,
            } as React.CSSProperties}
          >
            {sign.sign}
          </span>
          <div className="min-w-0">
            <h4 className="text-xs font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
              {sign.nameTr}
            </h4>
            <span
              className="waqf-mark-color inline-flex items-center px-1.5 py-0.5 mt-0.5 rounded-md text-[10px] font-extrabold"
              style={{
                backgroundColor: `${sign.color}18`,
                '--waqf-color': sign.color,
              } as React.CSSProperties}
            >
              {sign.actionTr}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => closeWaqfPopover()}
          aria-label="Vakıf penceresini kapat"
          title="Kapat"
          className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
          style={{ backgroundColor: 'var(--bg-surface-soft)', color: 'var(--text-muted)' }}
        >
          <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>

      <p className="text-xs leading-relaxed mb-2.5" style={{ color: 'var(--text-secondary)' }}>
        {sign.desc}
      </p>

      <button
        type="button"
        onClick={() => {
          closeWaqfPopover();
          openWaqfGuide();
        }}
        className="w-full h-8 px-2.5 rounded-xl border text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        style={{
          backgroundColor: 'var(--bg-surface-soft)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--brand-primary-text)',
        }}
      >
        <BookOpenCheck className="w-3.5 h-3.5" />
        <span>Tüm Durak Rehberi (8 İşaret)</span>
      </button>
    </div>,
    document.body,
  );
};

/**
 * Geleneksel Rükû (ع) rozetine dokunulduğunda açılan aksiyon baloncuğu.
 */
export const RukuPopoverHost: React.FC = () => {
  const { manifest, meta, audioPrefs, openQuickMemorize } = useAppStore();
  const [payload, setPayload] = useState<RukuPopoverPayload | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<PopoverCoords>({
    top: -9999,
    left: -9999,
    width: 300,
    isMobileSheet: false,
  });

  useEffect(() => subscribeRukuPopover(setPayload), []);

  useLayoutEffect(() => {
    if (!payload) return;
    const measuredHeight = popoverRef.current?.offsetHeight || 170;
    setCoords(computeClampedPosition(payload.anchorRect, 300, measuredHeight));
  }, [payload]);

  useBackButtonGuard('ruku_popover', Boolean(payload), closeRukuPopover);

  useEffect(() => {
    if (!payload) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (popoverRef.current?.contains(target)) return;
      if (target?.closest('[data-ruku-badge="1"]')) return;
      closeRukuPopover();
    };
    const handleScrollOrResize = (e: Event) => {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      closeRukuPopover();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [payload]);

  if (!payload || typeof document === 'undefined') return null;

  const { ruku, surahNameTr, page } = payload;

  const handlePlayRuku = () => {
    if (!manifest || !meta) return;
    sfxService.play('click');
    const title = `${surahNameTr} · ${ruku.surahRuku}. Rükû (${ruku.startAyah}–${ruku.endAyah})`;
    audioQueueService.startSegmentQueue({
      items: [
        {
          id: `ruku_${ruku.no}`,
          type: 'ayah_range',
          label: title,
          surah: ruku.surah,
          startAyah: ruku.startAyah,
          endAyah: ruku.endAyah,
        },
      ],
      title,
      context: 'custom',
      contextKey: `ruku:${ruku.no}`,
      manifest,
      meta,
      prefs: audioPrefs,
    });
    closeRukuPopover();
  };

  const handleMemorizeRuku = () => {
    closeRukuPopover();
    openQuickMemorize(
      ruku.surah,
      ruku.startAyah,
      page,
      ruku.endAyah,
      `${surahNameTr} · ${ruku.surahRuku}. Rükû (${ruku.startAyah}–${ruku.endAyah})`,
    );
  };

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`${surahNameTr} ${ruku.surahRuku}. Rükû`}
      className={`fixed ${Z_LAYERS.POPOVER} rounded-2xl border shadow-2xl p-3.5 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto`}
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
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            dir="rtl"
            lang="ar"
            className="w-8 h-8 rounded-xl border flex items-center justify-center font-arabic text-base font-bold leading-none shrink-0"
            style={{
              backgroundColor: 'var(--brand-primary-soft)',
              borderColor: 'rgba(13, 148, 136, 0.35)',
              color: 'var(--brand-primary-text)',
            }}
          >
            ع
          </span>
          <div className="min-w-0">
            <h4 className="text-xs font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
              {surahNameTr} · {ruku.surahRuku}. Rükû
            </h4>
            <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {ruku.startAyah}–{ruku.endAyah}. Ayetler ({ruku.ayahCount} Ayet · {ruku.no}/556)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => closeRukuPopover()}
          aria-label="Rükû penceresini kapat"
          title="Kapat"
          className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
          style={{ backgroundColor: 'var(--bg-surface-soft)', color: 'var(--text-muted)' }}
        >
          <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <button
          type="button"
          onClick={handlePlayRuku}
          className="w-full h-9 px-3 rounded-xl text-xs font-bold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Bu Rükûyu Dinle</span>
        </button>
        <button
          type="button"
          onClick={handleMemorizeRuku}
          className="w-full h-9 px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface-soft)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <BookMarked className="w-3.5 h-3.5" style={{ color: 'var(--brand-primary-text)' }} />
          <span>Ezber Havuzuna Al</span>
        </button>
      </div>
    </div>,
    document.body,
  );
};

interface RukuMarkerBadgeProps {
  ruku: RukuItem;
  surahNameTr: string;
  page?: number;
  variant?: 'inline' | 'pill';
}

/**
 * Rükû sonu ayetlerinde gösterilen geleneksel tıklanabilir `ع` işareti.
 */
export const RukuMarkerBadge: React.FC<RukuMarkerBadgeProps> = ({
  ruku,
  surahNameTr,
  page,
  variant = 'pill',
}) => {
  const tooltip = `${surahNameTr} ${ruku.surahRuku}. Rükû Sonu (${ruku.startAyah}–${ruku.endAyah}. Ayetler · ${ruku.ayahCount} Ayet)`;

  const handleTrigger = (el: HTMLElement) => {
    sfxService.play('click');
    openRukuPopover(ruku, surahNameTr, page, el.getBoundingClientRect());
  };

  if (variant === 'inline') {
    return (
      <span
        data-ruku-badge="1"
        role="button"
        tabIndex={0}
        title={tooltip}
        aria-label={tooltip}
        onClick={(e) => {
          e.stopPropagation();
          handleTrigger(e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            handleTrigger(e.currentTarget);
          }
        }}
        className="inline-flex items-center justify-center mx-[0.16em] px-[0.22em] py-0.5 rounded-md border text-[0.62em] font-extrabold align-middle leading-none select-none cursor-pointer transition-colors hover:opacity-85"
        style={{
          backgroundColor: 'var(--brand-primary-soft)',
          borderColor: 'rgba(13, 148, 136, 0.42)',
          color: 'var(--brand-primary-text)',
        }}
      >
        ع
      </span>
    );
  }

  return (
    <button
      type="button"
      data-ruku-badge="1"
      title={tooltip}
      aria-label={tooltip}
      onClick={(e) => {
        e.stopPropagation();
        handleTrigger(e.currentTarget);
      }}
      className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border text-[11px] font-extrabold cursor-pointer transition-colors hover:opacity-85 shrink-0"
      style={{
        backgroundColor: 'var(--brand-primary-soft)',
        borderColor: 'rgba(13, 148, 136, 0.35)',
        color: 'var(--brand-primary-text)',
      }}
    >
      <span dir="rtl" lang="ar" className="font-arabic text-sm leading-none">
        ع
      </span>
      <span className="tabular-nums">Rükû {ruku.surahRuku}</span>
    </button>
  );
};
