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
let swUpdateCheckInterval: number | null = null;

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
        if (!registration || swUpdateCheckInterval !== null) return;
        swUpdateCheckInterval = window.setInterval(() => {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
          void registration.update().catch(() => {
            // Çevrimdışı veya ağ kesintisinde sessizce geç
          });
        }, 60 * 60 * 1000);
      },
      onRegisterError() {
        // Önizleme iframe veya kısıtlı ortamlarda sessizce geç
      },
    });
  } catch {
    // ignore SW registration failures
  }
}
