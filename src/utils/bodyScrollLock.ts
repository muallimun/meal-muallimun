/**
 * Referans sayaçlı sayfa kaydırma ve overscroll kilidi (Body Scroll Lock).
 * Birden fazla modal/katman üst üste açılıp farklı sıralarda kapandığında
 * `document.body.style.overflow` ve `overscrollBehavior` değerlerinin kilitli kalmasını
 * veya erken açılmasını önler.
 */

let activeLockCount = 0;
let savedBodyOverflow: string | null = null;
let savedBodyOverscroll: string | null = null;
let savedHtmlOverscroll: string | null = null;

export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }

  if (activeLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    savedBodyOverscroll = document.body.style.overscrollBehavior;
    savedHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
  }
  activeLockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;

    activeLockCount = Math.max(0, activeLockCount - 1);
    if (activeLockCount === 0 && typeof document !== 'undefined' && document.body) {
      document.body.style.overflow = savedBodyOverflow ?? '';
      document.body.style.overscrollBehavior = savedBodyOverscroll ?? '';
      document.documentElement.style.overscrollBehavior = savedHtmlOverscroll ?? '';
      savedBodyOverflow = null;
      savedBodyOverscroll = null;
      savedHtmlOverscroll = null;
    }
  };
}
