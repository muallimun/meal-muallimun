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

const activeStack: BackStackEntry[] = [];
let popListenerAttached = false;
let keyListenerAttached = false;
let pushedHistoryDepth = 0;
let ignoreNextPopCount = 0;
let ignoreResetTimer: number | null = null;
let reconcileTimer: number | null = null;
let tokenCounter = 0;

function isTopLevelBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self === window.top;
  } catch {
    // Çapraz kaynak iframe erişim hatası -> gömülü ortamda çalışıyoruz
    return false;
  }
}

function clearIgnoreResetTimer(): void {
  if (ignoreResetTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(ignoreResetTimer);
    ignoreResetTimer = null;
  }
}

function scheduleIgnoreSafetyReset(): void {
  if (typeof window === 'undefined') return;
  clearIgnoreResetTimer();
  ignoreResetTimer = window.setTimeout(() => {
    ignoreNextPopCount = 0;
    ignoreResetTimer = null;
  }, 400);
}

/**
 * Tek mikro-görevde (setTimeout(..., 0)) tüm ardışık register/unregister değişimlerini
 * birleştirip tarayıcı geçmişini (history) tek adımda hedef derinlikle eşitler.
 * - Aynı tick içinde bir katman kapanıp yenisi açıldıysa (`desired === pushed > 0`),
 *   `history.back()` + `pushState` yarışına girmez; `replaceState` ile üst kaydı günceller.
 * - İframe önizlemelerinde `window.history` API'sine dokunmaz.
 */
function reconcileHistory(): void {
  reconcileTimer = null;
  if (!isTopLevelBrowser()) return;

  const desiredDepth = activeStack.length;

  if (desiredDepth === pushedHistoryDepth) {
    if (desiredDepth > 0) {
      const topEntry = activeStack[desiredDepth - 1];
      try {
        window.history.replaceState(
          { ...(window.history.state ?? {}), __muallimunBackGuard: topEntry.token },
          '',
        );
      } catch {
        // Geçmiş güncelleme kısıtlıysa sessizce devam et
      }
    }
    return;
  }

  if (desiredDepth > pushedHistoryDepth) {
    const startIdx = pushedHistoryDepth;
    let pushed = pushedHistoryDepth;
    for (let i = startIdx; i < desiredDepth; i += 1) {
      const entry = activeStack[i];
      try {
        window.history.pushState(
          { ...(window.history.state ?? {}), __muallimunBackGuard: entry.token },
          '',
        );
        pushed += 1;
      } catch {
        break;
      }
    }
    pushedHistoryDepth = pushed;
    return;
  }

  // desiredDepth < pushedHistoryDepth
  const diff = pushedHistoryDepth - desiredDepth;
  pushedHistoryDepth = desiredDepth;
  ignoreNextPopCount += diff;
  scheduleIgnoreSafetyReset();
  try {
    window.history.go(-diff);
  } catch {
    ignoreNextPopCount = Math.max(0, ignoreNextPopCount - diff);
    if (ignoreNextPopCount === 0) {
      clearIgnoreResetTimer();
    }
  }
}

function scheduleReconcile(): void {
  if (!isTopLevelBrowser() || typeof window === 'undefined') return;
  if (reconcileTimer !== null) return;
  reconcileTimer = window.setTimeout(reconcileHistory, 0);
}

function handlePopState(): void {
  if (ignoreNextPopCount > 0) {
    ignoreNextPopCount -= 1;
    if (ignoreNextPopCount === 0) {
      clearIgnoreResetTimer();
    }
    return;
  }

  if (pushedHistoryDepth > 0) {
    pushedHistoryDepth -= 1;
  }

  const top = activeStack.pop();
  if (!top) return;

  try {
    top.onBack();
  } catch {
    // Katman kapatma hatasını sessizce yut
  }

  // Kapatma sonrası kalan yığın ile history derinliği ayrıştıysa eşitle
  scheduleReconcile();
}

/**
 * Yakalama fazında (capture: true) çalışan merkezi LIFO Escape kalkanı.
 * Üst üste açık katmanlar arasında yalnızca en üstteki (disableEscape !== true)
 * katmanı kapatır ve aynı olayın alttaki yerel keydown dinleyicilerine sızmasını engeller.
 */
function handleCaptureKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
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
}

function unregisterEntry(token: string): void {
  const idx = activeStack.findIndex((item) => item.token === token);
  if (idx === -1) {
    // Zaten popstate tarafından çekilip kapatıldı; history.go() gerekmez
    return;
  }
  activeStack.splice(idx, 1);
  scheduleReconcile();
}

/**
 * Mobil donanım / kaydırmalı "Geri" tuşu ve merkezi LIFO `Escape` koruması.
 * - Gömülü iframe önizleme ortamlarında (`window.self !== window.top`) tarayıcı
 *   geçmişine (`window.history`) dokunmaz, ancak LIFO `Escape` yığınını aktif tutar.
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
