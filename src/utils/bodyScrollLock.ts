/**
 * Referans sayaçlı sayfa kaydırma ve overscroll kilidi (Body Scroll Lock).
 * Birden fazla modal/katman üst üste açılıp farklı sıralarda kapandığında
 * `document.body.style.overflow` ve `overscrollBehavior` değerlerinin kilitli kalmasını
 * veya erken açılmasını önler.
 */

const activeLockTokens = new Set<symbol>();
let savedBodyOverflow: string | null = null;
let savedBodyOverscroll: string | null = null;
let savedHtmlOverscroll: string | null = null;

function restoreDocumentScroll(): void {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.style.overflow =
    savedBodyOverflow && savedBodyOverflow !== 'hidden' ? savedBodyOverflow : '';
  document.body.style.overscrollBehavior =
    savedBodyOverscroll && savedBodyOverscroll !== 'none' ? savedBodyOverscroll : '';
  document.documentElement.style.overscrollBehavior =
    savedHtmlOverscroll && savedHtmlOverscroll !== 'none' ? savedHtmlOverscroll : '';
  savedBodyOverflow = null;
  savedBodyOverscroll = null;
  savedHtmlOverscroll = null;
}

export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }

  const token = Symbol('bodyScrollLock');
  if (activeLockTokens.size === 0) {
    const curBodyOverflow = document.body.style.overflow;
    const curBodyOverscroll = document.body.style.overscrollBehavior;
    const curHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    savedBodyOverflow = curBodyOverflow === 'hidden' ? '' : curBodyOverflow;
    savedBodyOverscroll = curBodyOverscroll === 'none' ? '' : curBodyOverscroll;
    savedHtmlOverscroll = curHtmlOverscroll === 'none' ? '' : curHtmlOverscroll;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
  }
  activeLockTokens.add(token);

  let released = false;
  return () => {
    if (released) return;
    released = true;

    activeLockTokens.delete(token);
    if (activeLockTokens.size === 0) {
      restoreDocumentScroll();
    }
  };
}

export function getActiveBodyScrollLockCount(): number {
  return activeLockTokens.size;
}
