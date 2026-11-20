import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

type PromptSubscriber = (event: BeforeInstallPromptEvent | null) => void;

let capturedPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
let swRegistered = false;
const subscribers = new Set<PromptSubscriber>();

function notifySubscribers(): void {
  for (const cb of subscribers) {
    cb(capturedPrompt);
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
    if (outcome === 'accepted') {
      capturedPrompt = null;
      notifySubscribers();
    }
    return outcome;
  } catch {
    return 'unavailable';
  }
}

/**
 * Service Worker kaydını güvenli biçimde başlatır (sandbox/iframe engellerinde sessizce devam eder).
 */
export function registerPwaServiceWorker(): void {
  if (swRegistered || typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  swRegistered = true;

  try {
    registerSW({
      immediate: true,
      onRegisterError() {
        // Önizleme iframe veya kısıtlı ortamlarda sessizce geç
      },
    });
  } catch {
    // ignore SW registration failures
  }
}
