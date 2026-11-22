import { useEffect, useRef } from 'react';

interface BackStackEntry {
  token: string;
  id: string;
  onBack: () => void;
  pushed: boolean;
}

const stack: BackStackEntry[] = [];
let listenerAttached = false;
let ignoreNextPopCount = 0;
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

function handlePopState(): void {
  if (ignoreNextPopCount > 0) {
    ignoreNextPopCount -= 1;
    return;
  }

  const top = stack.pop();
  if (!top) return;

  try {
    top.onBack();
  } catch {
    // Katman kapatma hatasını sessizce yut
  }
}

function ensurePopStateListener(): void {
  if (listenerAttached || !isTopLevelBrowser()) return;
  window.addEventListener('popstate', handlePopState);
  listenerAttached = true;
}

function registerEntry(entry: BackStackEntry): void {
  ensurePopStateListener();
  stack.push(entry);
  try {
    window.history.pushState(
      { ...(window.history.state ?? {}), __muallimunBackGuard: entry.token },
      '',
    );
    entry.pushed = true;
  } catch {
    entry.pushed = false;
  }
}

function unregisterEntry(token: string): void {
  const idx = stack.findIndex((item) => item.token === token);
  if (idx === -1) {
    // Zaten popstate tarafından çekilip kapatıldı; history.back() çağırma
    return;
  }

  const [removed] = stack.splice(idx, 1);
  if (removed && removed.pushed && isTopLevelBrowser()) {
    ignoreNextPopCount += 1;
    try {
      window.history.back();
    } catch {
      ignoreNextPopCount = Math.max(0, ignoreNextPopCount - 1);
    }
  }
}

/**
 * Mobil donanım / kaydırmalı "Geri" tuşu koruması.
 * - Gömülü iframe önizleme ortamlarında (`window.self !== window.top`) sessizce devre dışı kalır.
 * - React StrictMode çift mount/unmount döngüsüne dayanıklıdır (`setTimeout(..., 0)`).
 * - Kullanıcı arayüzdeki X/Escape ile kapatırsa sahte history kaydını diğer katmanları tetiklemeden temizler.
 */
export function useBackButtonGuard(
  id: string,
  isActive: boolean,
  onBack: () => void,
  rearmKey?: string | number | boolean,
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isActive || !isTopLevelBrowser()) return;

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
        pushed: false,
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      if (registered) {
        unregisterEntry(token);
      }
    };
  }, [id, isActive, rearmKey]);
}
