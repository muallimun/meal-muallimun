/**
 * Merkezi Akıllı Ekran Açık Tutma (Screen Wake Lock) Servisi
 *
 * - Desteklemeyen tarayıcı/WebView ortamlarında sessizce devre dışı kalır (asla hata fırlatmaz).
 * - Kesintisiz aktif modlar (ses oynatma, sunum modu, ezber zen oturumu) açıkken ekranı sürekli açık tutar.
 * - Sessiz okuma modunda (Okuma sekmesi) pil dostu 15 dakikalık hareketsizlik koruması uygular:
 *   kullanıcı etkileşimi (`pointerdown`, `scroll`, `keydown`, `touchstart`) veya sayfa değişimi sayacı sıfırlar;
 *   15 dk etkileşim olmazsa kilidi serbest bırakır, yeni etkileşimde otomatik yeniden alır.
 * - `visibilitychange` ile uygulamaya geri dönüldüğünde düşen kilidi otomatik yeniler.
 */

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
}

const SILENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 dakika

class WakeLockService {
  private enabled = true;
  private continuousReasons = new Set<string>();
  private silentReaderActive = false;
  private isIdleTimedOut = false;

  private sentinel: WakeLockSentinelLike | null = null;
  private acquiring = false;
  private idleTimer: number | null = null;
  private listenersBound = false;
  private lastActivityAt = 0;

  private bindGlobalListeners(): void {
    if (this.listenersBound || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    this.listenersBound = true;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pointerdown', this.handleUserActivity, { passive: true });
    window.addEventListener('touchstart', this.handleUserActivity, { passive: true });
    window.addEventListener('scroll', this.handleUserActivity, { passive: true, capture: true });
    window.addEventListener('keydown', this.handleUserActivity, { passive: true });
  }

  private handleVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      this.sentinel = null;
      return;
    }
    // Uygulamaya geri dönüldüğünde gerekiyorsa kilidi yeniden talep et
    if (this.silentReaderActive && !this.isIdleTimedOut) {
      this.resetIdleTimer();
    }
    void this.syncLockState();
  };

  private handleUserActivity = (): void => {
    if (!this.enabled) return;

    // Sürekli kilit aktifken (oyun, sınav, ses, sunum, zen) tarayıcı kilidi düşürdüyse ilk dokunuşta geri al
    if (this.continuousReasons.size > 0 && (!this.sentinel || this.sentinel.released)) {
      void this.syncLockState();
    }

    const now = Date.now();
    // Scroll gibi yüksek frekanslı olayları 1 sn aralıkla süz
    if (now - this.lastActivityAt < 1000 && !this.isIdleTimedOut) {
      return;
    }
    this.lastActivityAt = now;

    if (!this.silentReaderActive) return;

    const wasTimedOut = this.isIdleTimedOut;
    this.isIdleTimedOut = false;
    this.resetIdleTimer();

    if (wasTimedOut || !this.sentinel || this.sentinel.released) {
      void this.syncLockState();
    }
  };

  private clearIdleTimer(): void {
    if (this.idleTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    if (typeof window === 'undefined') return;
    if (!this.enabled || !this.silentReaderActive || this.continuousReasons.size > 0) {
      return;
    }
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      this.isIdleTimedOut = true;
      void this.syncLockState();
    }, SILENT_IDLE_TIMEOUT_MS);
  }

  private shouldHoldLock(): boolean {
    if (!this.enabled) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false;
    }
    if (this.continuousReasons.size > 0) return true;
    return this.silentReaderActive && !this.isIdleTimedOut;
  }

  private async acquire(): Promise<void> {
    if (this.sentinel && !this.sentinel.released) return;
    if (this.acquiring || typeof navigator === 'undefined') return;

    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') return;

    this.acquiring = true;
    try {
      const lock = await nav.wakeLock.request('screen');
      if (!this.shouldHoldLock()) {
        try {
          await lock.release();
        } catch {
          // ignore
        }
        return;
      }
      this.sentinel = lock;
      lock.addEventListener?.('release', () => {
        if (this.sentinel === lock) {
          this.sentinel = null;
        }
      });
    } catch {
      // Tarayıcı / pil tasarrufu / iFrame kısıtlamasında sessizce geç
      this.sentinel = null;
    } finally {
      this.acquiring = false;
    }
  }

  private async release(): Promise<void> {
    const lock = this.sentinel;
    this.sentinel = null;
    if (!lock) return;
    try {
      await lock.release();
    } catch {
      // ignore
    }
  }

  private async syncLockState(): Promise<void> {
    if (this.shouldHoldLock()) {
      await this.acquire();
    } else {
      await this.release();
    }
  }

  public setEnabled(enabled: boolean): void {
    this.bindGlobalListeners();
    this.enabled = enabled;
    if (!enabled) {
      this.clearIdleTimer();
      this.isIdleTimedOut = false;
    } else if (this.silentReaderActive && this.continuousReasons.size === 0) {
      this.isIdleTimedOut = false;
      this.resetIdleTimer();
    }
    void this.syncLockState();
  }

  public setContinuousReason(reason: string, active: boolean): void {
    this.bindGlobalListeners();
    if (active) {
      this.continuousReasons.add(reason);
      this.clearIdleTimer();
      this.isIdleTimedOut = false;
    } else {
      this.continuousReasons.delete(reason);
      if (this.continuousReasons.size === 0 && this.silentReaderActive && this.enabled) {
        this.isIdleTimedOut = false;
        this.resetIdleTimer();
      }
    }
    void this.syncLockState();
  }

  public setSilentReaderActive(active: boolean): void {
    this.bindGlobalListeners();
    if (this.silentReaderActive === active) return;
    this.silentReaderActive = active;
    this.isIdleTimedOut = false;
    if (active && this.enabled && this.continuousReasons.size === 0) {
      this.resetIdleTimer();
    } else {
      this.clearIdleTimer();
    }
    void this.syncLockState();
  }

  public notifyUserActivity(): void {
    if (!this.enabled || !this.silentReaderActive) return;
    this.lastActivityAt = Date.now();
    this.isIdleTimedOut = false;
    this.resetIdleTimer();
    void this.syncLockState();
  }

  /**
   * Oyun veya sınav gibi aktif sahnelerde kullanıcı dokunuşuyla (pointerdown/click)
   * düşmüş olabilecek WakeLock kilidini sessizce yeniden talep eder.
   */
  public ensureLock(): void {
    this.bindGlobalListeners();
    if (!this.shouldHoldLock()) return;
    if (!this.sentinel || this.sentinel.released) {
      void this.acquire();
    }
  }
}

export const wakeLockService = new WakeLockService();
