import { useEffect, useRef } from 'react';

interface BackStackEntry {
  token: string;
  id: string;
  onBack: () => void;
  disableEscape: boolean;
}

export interface BackButtonGuardOptions {
  /** True ise bu katman Escape tuşunu yakalamaz (ör. ana sekme geri dönüş koruması). */
  disableEscape?: boolean;
  /** Değer değiştikçe korumayı yeniden kurar. */
  rearmKey?: string | number | boolean;
}

interface TrackedDialog {
  dialog: HTMLElement;
  previousFocus: HTMLElement | null;
}

const activeStack: BackStackEntry[] = [];
const trackedDialogStack: TrackedDialog[] = [];
let popListenerAttached = false;
let keyListenerAttached = false;
let hasPushedSentinel = false;
let hasOrphanSentinel = false;
let reconcileTimer: number | null = null;
let focusSyncRaf: number | null = null;
let focusSyncTimeout: number | null = null;
let tokenCounter = 0;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function hasActiveBackStackEntries(): boolean {
  return activeStack.length > 0;
}

function isTopLevelBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self === window.top;
  } catch {
    // Çapraz kaynak iframe erişim hatası -> gömülü ortamda çalışıyoruz
    return false;
  }
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  return el.getClientRects().length > 0;
}

function getVisibleModalDialogs(): HTMLElement[] {
  if (typeof document === 'undefined') return [];
  const nodes = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const visible: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    if (isElementVisible(el)) {
      visible.push(el);
    }
  }
  return visible;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const result: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    if (isElementVisible(el) && el.tabIndex >= 0) {
      result.push(el);
    }
  }
  return result;
}

function focusDialogContainerSafely(dialog: HTMLElement): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && dialog.contains(active)) {
    return;
  }
  // Mobil sanal klavyeyi açmamak için input/textarea yerine doğrudan diyalog kabına odaklan
  if (!dialog.hasAttribute('tabindex')) {
    dialog.setAttribute('tabindex', '-1');
  }
  try {
    dialog.focus({ preventScroll: true });
  } catch {
    dialog.focus();
  }
}

function syncDialogFocus(): void {
  if (typeof document === 'undefined') return;
  const visibleDialogs = getVisibleModalDialogs();
  const visibleSet = new Set<HTMLElement>(visibleDialogs);

  let removedTopPreviousFocus: HTMLElement | null = null;
  let removedAny = false;

  for (let i = trackedDialogStack.length - 1; i >= 0; i -= 1) {
    const entry = trackedDialogStack[i];
    if (!visibleSet.has(entry.dialog)) {
      if (i === trackedDialogStack.length - 1) {
        removedTopPreviousFocus = entry.previousFocus;
      }
      trackedDialogStack.splice(i, 1);
      removedAny = true;
    }
  }

  let addedNewDialog = false;
  for (const dialog of visibleDialogs) {
    const exists = trackedDialogStack.some((item) => item.dialog === dialog);
    if (!exists) {
      const currentActive =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      trackedDialogStack.push({
        dialog,
        previousFocus: currentActive,
      });
      addedNewDialog = true;
    }
  }

  const topDialog = visibleDialogs[visibleDialogs.length - 1];
  if (topDialog) {
    if (addedNewDialog || removedAny) {
      focusDialogContainerSafely(topDialog);
    }
    return;
  }

  if (removedAny && removedTopPreviousFocus && isElementVisible(removedTopPreviousFocus)) {
    try {
      removedTopPreviousFocus.focus({ preventScroll: true });
    } catch {
      removedTopPreviousFocus.focus();
    }
  }
}

function scheduleFocusSync(): void {
  if (typeof window === 'undefined') return;
  if (focusSyncRaf !== null) {
    window.cancelAnimationFrame(focusSyncRaf);
  }
  focusSyncRaf = window.requestAnimationFrame(() => {
    focusSyncRaf = null;
    syncDialogFocus();
  });
  if (focusSyncTimeout !== null) {
    window.clearTimeout(focusSyncTimeout);
  }
  focusSyncTimeout = window.setTimeout(() => {
    focusSyncTimeout = null;
    syncDialogFocus();
  }, 60);
}

function stripGuardFromCurrentState(): void {
  if (typeof window === 'undefined') return;
  try {
    const rawState = window.history.state;
    const nextState: Record<string, unknown> =
      rawState && typeof rawState === 'object' ? { ...(rawState as Record<string, unknown>) } : {};
    delete nextState.__muallimunBackGuard;
    window.history.replaceState(nextState, '');
  } catch {
    // Geçmiş güncelleme kısıtlıysa sessizce devam et
  }
}

/**
 * Tek Nöbetçi (Single Sentinel) Geçmiş Yönetimi:
 * - Yığında kaç katman olursa olsun tarayıcı geçmişine en fazla 1 adet nöbetçi kayıt ekler.
 * - Programatik kapanışlarda ASLA `history.go()` / `history.back()` çağırmaz; geçmişi şişirmez.
 * - Boşalan nöbetçi kaydı (`hasOrphanSentinel`) bir sonraki katman açılışında `replaceState`
 *   ile yeniden sahiplenir, böylece tekrar tekrar aç-kapa yapılsa bile geçmiş tek kayıtlı kalır.
 * - Gerçek donanım/tarayıcı Geri tuşu (`popstate`) geldiğinde LIFO olarak en üst katmanı kapatır;
 *   yığın hâlâ doluysa tek nöbetçi kaydını yeniden kurar.
 */
function reconcileHistory(): void {
  reconcileTimer = null;
  if (!isTopLevelBrowser()) return;

  if (activeStack.length > 0) {
    const topEntry = activeStack[activeStack.length - 1];
    try {
      if (!hasPushedSentinel) {
        if (hasOrphanSentinel) {
          window.history.replaceState(
            { ...(window.history.state ?? {}), __muallimunBackGuard: topEntry.token },
            '',
          );
          hasPushedSentinel = true;
          hasOrphanSentinel = false;
        } else {
          window.history.pushState(
            { ...(window.history.state ?? {}), __muallimunBackGuard: topEntry.token },
            '',
          );
          hasPushedSentinel = true;
          hasOrphanSentinel = false;
        }
      } else {
        window.history.replaceState(
          { ...(window.history.state ?? {}), __muallimunBackGuard: topEntry.token },
          '',
        );
      }
    } catch {
      // Geçmiş güncelleme kısıtlıysa sessizce devam et
    }
    return;
  }

  // activeStack.length === 0 (programatik kapatma)
  stripGuardFromCurrentState();
  if (hasPushedSentinel) {
    hasPushedSentinel = false;
    hasOrphanSentinel = true;
  }
}

function scheduleReconcile(): void {
  if (!isTopLevelBrowser() || typeof window === 'undefined') return;
  if (reconcileTimer !== null) return;
  reconcileTimer = window.setTimeout(reconcileHistory, 0);
}

function handlePopState(): void {
  hasPushedSentinel = false;

  const top = activeStack.pop();
  if (!top) {
    // Programatik kapatma sonrası kalan tek nöbetçi kaydını sayfadan çıkmadan sessizce yut.
    hasOrphanSentinel = false;
    stripGuardFromCurrentState();
    scheduleFocusSync();
    return;
  }

  try {
    top.onBack();
  } catch {
    // Katman kapatma hatasını sessizce yut
  }

  // Kalan katman varsa tek nöbetçiyi yeniden kur, odak durumunu güncelle
  scheduleReconcile();
  scheduleFocusSync();
}

/**
 * Yakalama fazında (capture: true) çalışan merkezi LIFO Escape kalkanı ve modal Tab odak tuzağı.
 * - Tab / Shift+Tab: En üstteki görünür `[role="dialog"][aria-modal="true"]` içinde döngüsel odak tuzağı kurar.
 * - Escape: Üst üste açık katmanlar arasında yalnızca en üstteki (disableEscape !== true)
 *   katmanı kapatır ve aynı olayın alttaki yerel keydown dinleyicilerine sızmasını engeller.
 */
function handleCaptureKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented) return;

  if (e.key === 'Tab') {
    const visibleDialogs = getVisibleModalDialogs();
    const topDialog = visibleDialogs[visibleDialogs.length - 1];
    if (!topDialog) return;

    const focusables = getFocusableElements(topDialog);
    if (focusables.length === 0) {
      e.preventDefault();
      focusDialogContainerSafely(topDialog);
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!active || !topDialog.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus({ preventScroll: true });
      return;
    }

    if (e.shiftKey) {
      if (active === first || active === topDialog) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
    return;
  }

  if (e.key !== 'Escape') return;
  if (activeStack.length === 0) return;

  for (let i = activeStack.length - 1; i >= 0; i -= 1) {
    const entry = activeStack[i];
    if (entry.disableEscape) continue;

    e.preventDefault();
    e.stopImmediatePropagation();

    try {
      entry.onBack();
    } catch {
      // Katman kapatma hatasını sessizce yut
    }
    return;
  }
}

function ensureListeners(): void {
  if (typeof window === 'undefined') return;

  if (!keyListenerAttached) {
    window.addEventListener('keydown', handleCaptureKeyDown, true);
    keyListenerAttached = true;
  }

  if (!popListenerAttached && isTopLevelBrowser()) {
    window.addEventListener('popstate', handlePopState);
    popListenerAttached = true;
  }
}

function registerEntry(entry: BackStackEntry): void {
  ensureListeners();
  activeStack.push(entry);
  scheduleReconcile();
  scheduleFocusSync();
}

function unregisterEntry(token: string): void {
  const idx = activeStack.findIndex((item) => item.token === token);
  if (idx === -1) {
    // Zaten popstate tarafından çekilip kapatıldı; history.go() gerekmez
    scheduleFocusSync();
    return;
  }
  activeStack.splice(idx, 1);
  scheduleReconcile();
  scheduleFocusSync();
}

/**
 * Mobil donanım / kaydırmalı "Geri" tuşu ve merkezi LIFO `Escape` koruması.
 * - Gömülü iframe önizleme ortamlarında (`window.self !== window.top`) tarayıcı
 *   geçmişine (`window.history`) dokunmaz, ancak LIFO `Escape` yığınını ve odak tuzağını aktif tutar.
 * - React StrictMode çift mount/unmount döngüsüne ve aynı tick'te katman geçişlerine dayanıklıdır.
 */
export function useBackButtonGuard(
  id: string,
  isActive: boolean,
  onBack: () => void,
  optionsOrRearmKey?: string | number | boolean | BackButtonGuardOptions,
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const isOptionsObj =
    typeof optionsOrRearmKey === 'object' && optionsOrRearmKey !== null;
  const disableEscape = isOptionsObj ? Boolean(optionsOrRearmKey.disableEscape) : false;
  const rearmKey = isOptionsObj ? optionsOrRearmKey.rearmKey : optionsOrRearmKey;

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return;

    tokenCounter += 1;
    const token = `${id}_${tokenCounter}`;
    let cancelled = false;
    let registered = false;

    const timerId = window.setTimeout(() => {
      if (cancelled) return;
      registered = true;
      registerEntry({
        token,
        id,
        onBack: () => onBackRef.current(),
        disableEscape,
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      if (registered) {
        unregisterEntry(token);
      }
    };
  }, [id, isActive, disableEscape, rearmKey]);
}
