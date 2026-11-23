import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { acquireBodyScrollLock } from '../utils/bodyScrollLock';

interface ResponsiveActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  triggerRef: React.RefObject<HTMLElement | null>;
  menuWidthClass?: string;
  children: React.ReactNode;
}

function getIsMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(max-width: 639px)').matches;
}

export const ResponsiveActionMenu: React.FC<ResponsiveActionMenuProps> = ({
  isOpen,
  onClose,
  title,
  triggerRef,
  menuWidthClass = 'w-56',
  children,
}) => {
  const [isMobile, setIsMobile] = useState<boolean>(getIsMobileViewport);
  const [openUpward, setOpenUpward] = useState<boolean>(false);
  const [alignLeft, setAlignLeft] = useState<boolean>(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(mq.matches);
    handleChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  // Masaüstü / tablet açılır menü konum güvenliği (alt/sol ekran sınırından taşmayı önle)
  useLayoutEffect(() => {
    if (!isOpen || isMobile || typeof window === 'undefined') return;

    const updatePlacement = () => {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;
      const rect = triggerEl.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 340;
      const panelWidth = panelRef.current?.offsetWidth ?? 224;
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;

      setOpenUpward(spaceBelow < Math.min(panelHeight, 380) && spaceAbove > spaceBelow);
      setAlignLeft(rect.right < panelWidth + 16 && window.innerWidth - rect.left >= panelWidth + 16);
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [isOpen, isMobile, triggerRef]);

  // Escape ve dış tıklama ile kapatma
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (isMobile) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, isMobile, onClose, triggerRef]);

  useEffect(() => {
    if (!isOpen || !isMobile) return;
    return acquireBodyScrollLock();
  }, [isOpen, isMobile]);

  if (!isOpen) return null;

  if (isMobile && typeof document !== 'undefined') {
    return createPortal(
      <div onClick={(e) => e.stopPropagation()}>
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[1px]"
          aria-hidden="true"
          onClick={onClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-x-0 bottom-0 z-[101] w-full rounded-t-2xl max-h-[82dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl border-t"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          <div
            className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span
              className="text-xs font-extrabold tracking-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Menüyü kapat"
              title="Menüyü kapat"
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors hover:bg-[var(--bg-surface-soft)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-2 space-y-0.5">{children}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className={`absolute ${alignLeft ? 'left-0' : 'right-0'} ${
        openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
      } z-30 ${menuWidthClass} max-w-[calc(100vw-2rem)] max-h-[75vh] overflow-y-auto rounded-2xl border shadow-xl p-1.5 space-y-0.5`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-strong)',
      }}
    >
      {children}
    </div>
  );
};
