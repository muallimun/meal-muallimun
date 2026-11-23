import React from 'react';

const CHUNK_RELOAD_GUARD_KEY = 'muallimun_chunk_reload_at_v1';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

function isChunkLoadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as { message?: unknown }).message ?? '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror')
  );
}

/**
 * Çevrimdışı veya yeni sürüm yayını sırasında eski hash'li JS parçasının (chunk)
 * yüklenememesi durumunda kontrollü yeniden deneme ve en fazla bir kez sayfa tazeleme uygular.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (firstErr) {
      // Kısa ağ dalgalanmasına karşı tek yeniden deneme
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      try {
        return await factory();
      } catch (secondErr) {
        if (
          typeof window !== 'undefined' &&
          typeof navigator !== 'undefined' &&
          navigator.onLine !== false &&
          isChunkLoadError(secondErr)
        ) {
          try {
            const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) || '0');
            const now = Date.now();
            if (!Number.isFinite(lastReload) || now - lastReload > CHUNK_RELOAD_COOLDOWN_MS) {
              window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now));
              window.location.reload();
              return new Promise<{ default: T }>(() => {
                // Yenileme tamamlanana kadar beklet
              });
            }
          } catch {
            // sessionStorage kısıtlıysa hatayı ErrorBoundary'e ilet
          }
        }
        throw firstErr;
      }
    }
  });
}
