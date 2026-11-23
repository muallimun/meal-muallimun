import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

type PromptSubscriber = (event: BeforeInstallPromptEvent | null) => void;
type UpdateSubscriber = (available: boolean) => void;

let capturedPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
let swRegistered = false;
let pwaUpdateAvailable = false;
let updateSwRunner: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let swUpdateCheckInterval: number | null = null;
let swLifecycleListenersAttached = false;
let lastUpdateCheckAt = 0;

const UPDATE_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;
const UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;

const subscribers = new Set<PromptSubscriber>();
const updateSubscribers = new Set<UpdateSubscriber>();

function notifySubscribers(): void {
  for (const cb of subscribers) {
    cb(capturedPrompt);
  }
}

function notifyUpdateSubscribers(): void {
  for (const cb of updateSubscribers) {
    cb(pwaUpdateAvailable);
  }
}

function triggerBackgroundUpdateCheck(minIntervalMs: number): void {
  if (!swRegistration) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (minIntervalMs > 0 && now - lastUpdateCheckAt < minIntervalMs) return;
  lastUpdateCheckAt = now;
  void swRegistration.update().catch(() => {
    // Çevrimdışı veya ağ kesintisinde sessizce geç
  });
}

/**
 * Uygulama bağımsız (PWA standalone) modda mı çalışıyor kontrol eder.
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const mediaMatch =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return mediaMatch || iosStandalone;
}

/**
 * iOS Safari / iPadOS cihaz tespiti (beforeinstallprompt desteklemediği için yönlendirme sunulur).
 */
export function detectIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isClassicIos = /iphone|ipad|ipod/.test(ua);
  const isIpadOsDesktopUa =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isClassicIos || isIpadOsDesktopUa;
}

export function getInitialOnlineStatus(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Tarayıcının beforeinstallprompt ve appinstalled olaylarını erken aşamada yakalar.
 */
export function initPwaInstallListener(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    capturedPrompt = e as BeforeInstallPromptEvent;
    notifySubscribers();
  });

  window.addEventListener('appinstalled', () => {
    capturedPrompt = null;
    notifySubscribers();
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return capturedPrompt;
}

export function subscribeInstallPrompt(cb: PromptSubscriber): () => void {
  initPwaInstallListener();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export async function triggerPwaInstallPrompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!capturedPrompt) return 'unavailable';
  const promptEvent = capturedPrompt;
  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    return outcome;
  } catch {
    return 'unavailable';
  } finally {
    // Tüketilmiş beforeinstallprompt olayının bellekte kilitli kalmasını engelle
    capturedPrompt = null;
    notifySubscribers();
  }
}

export function isPwaUpdateAvailable(): boolean {
  return pwaUpdateAvailable;
}

export function subscribePwaUpdate(cb: UpdateSubscriber): () => void {
  updateSubscribers.add(cb);
  return () => {
    updateSubscribers.delete(cb);
  };
}

export async function applyPwaUpdate(): Promise<void> {
  if (!updateSwRunner) {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    return;
  }
  pwaUpdateAvailable = false;
  notifyUpdateSubscribers();
  try {
    await updateSwRunner(true);
  } catch {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}

/**
 * Kullanıcı talebiyle Service Worker güncellemesini manuel olarak denetler.
 * Yeni sürüm hazır veya indirilmişse `true`, güncel ise `false` döndürür.
 */
export async function checkForPwaUpdate(): Promise<boolean> {
  if (pwaUpdateAvailable) return true;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (navigator.onLine === false) return false;

  try {
    const registration =
      swRegistration ?? (await navigator.serviceWorker.getRegistration()) ?? null;
    if (!registration) return false;
    swRegistration = registration;
    lastUpdateCheckAt = Date.now();

    await registration.update();

    if (registration.waiting) {
      pwaUpdateAvailable = true;
      notifyUpdateSubscribers();
      return true;
    }

    const installing = registration.installing;
    if (installing) {
      await new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(resolve, 1800);
        const handleStateChange = () => {
          if (installing.state === 'installed' || installing.state === 'redundant') {
            window.clearTimeout(timeoutId);
            installing.removeEventListener('statechange', handleStateChange);
            resolve();
          }
        };
        installing.addEventListener('statechange', handleStateChange);
      });

      if (registration.waiting && navigator.serviceWorker.controller) {
        pwaUpdateAvailable = true;
        notifyUpdateSubscribers();
        return true;
      }
    }

    return pwaUpdateAvailable || Boolean(registration.waiting);
  } catch {
    return pwaUpdateAvailable;
  }
}

/**
 * Service Worker kaydını güvenli biçimde başlatır (sandbox/iframe engellerinde sessizce devam eder).
 * Yeni sürüm hazır olduğunda sessiz zorunlu yenileme yerine kullanıcı onaylı güncelleme bildirir.
 */
export function registerPwaServiceWorker(): void {
  if (swRegistered || typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  swRegistered = true;

  try {
    updateSwRunner = registerSW({
      immediate: true,
      onNeedRefresh() {
        pwaUpdateAvailable = true;
        notifyUpdateSubscribers();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        swRegistration = registration;
        lastUpdateCheckAt = Date.now();

        if (swUpdateCheckInterval === null) {
          swUpdateCheckInterval = window.setInterval(() => {
            triggerBackgroundUpdateCheck(0);
          }, UPDATE_POLL_INTERVAL_MS);
        }

        if (!swLifecycleListenersAttached) {
          swLifecycleListenersAttached = true;
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              triggerBackgroundUpdateCheck(UPDATE_CHECK_MIN_INTERVAL_MS);
            }
          });
          window.addEventListener('online', () => {
            triggerBackgroundUpdateCheck(UPDATE_CHECK_MIN_INTERVAL_MS);
          });
        }
      },
      onRegisterError() {
        // Önizleme iframe veya kısıtlı ortamlarda sessizce geç
      },
    });
  } catch {
    // ignore SW registration failures
  }
}
