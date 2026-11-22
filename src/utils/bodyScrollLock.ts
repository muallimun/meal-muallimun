/**
 * Referans sayaçlı sayfa kaydırma kilidi (Body Scroll Lock).
 * Birden fazla modal/katman üst üste açılıp farklı sıralarda kapandığında
 * `document.body.style.overflow` değerinin kilitli kalmasını veya erken açılmasını önler.
 */

let activeLockCount = 0;
let savedOverflowValue: string | null = null;

export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }

  if (activeLockCount === 0) {
    savedOverflowValue = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeLockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;

    activeLockCount = Math.max(0, activeLockCount - 1);
    if (activeLockCount === 0 && typeof document !== 'undefined' && document.body) {
      document.body.style.overflow = savedOverflowValue ?? '';
      savedOverflowValue = null;
    }
  };
}
