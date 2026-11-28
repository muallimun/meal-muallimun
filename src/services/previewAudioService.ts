import { claimAudioFocus, registerAudioOwner } from './audioFocusCoordinator';
import { AUDIO_LOAD_ERROR_MESSAGE } from './audioQueueService';
import { applyMediaVolumeToElement, subscribeMediaVolume } from './mediaVolumeService';

export type PreviewClipStatus = 'idle' | 'loading' | 'playing' | 'error';

export interface PreviewClipSnapshot {
  activeKey: string | null;
  status: PreviewClipStatus;
  errorMessage: string | null;
}

type Listener = () => void;

const LOAD_TIMEOUT_MS = 12_000;

const INITIAL_SNAPSHOT: PreviewClipSnapshot = {
  activeKey: null,
  status: 'idle',
  errorMessage: null,
};

function dedupeValidUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Oyun Bilgi Notu (GameArenaShell) ve Rabt/Fâsıla testi (RabtQuizModal) gibi
 * kısa ayet önizlemeleri için tekil, zaman aşımı ve hayalet ses korumalı ortak motor.
 */
class PreviewAudioService {
  private snapshot: PreviewClipSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private loadTimer: number | null = null;
  private stallTimer: number | null = null;
  private sessionId = 0;

  constructor() {
    subscribeMediaVolume((volState) => {
      applyMediaVolumeToElement(this.audio, volState);
    });
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): PreviewClipSnapshot => this.snapshot;

  private emit(next: PreviewClipSnapshot): void {
    if (
      this.snapshot.activeKey === next.activeKey &&
      this.snapshot.status === next.status &&
      this.snapshot.errorMessage === next.errorMessage
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private clearLoadTimer(): void {
    if (this.loadTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private clearStallTimer(): void {
    if (this.stallTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private teardownAudio(): void {
    this.clearLoadTimer();
    this.clearStallTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.audio) {
      try {
        this.audio.onended = null;
        this.audio.onerror = null;
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // ignore cleanup errors
      }
      this.audio = null;
    }
  }

  public clearError(): void {
    if (this.snapshot.status === 'error' || this.snapshot.errorMessage) {
      this.emit(INITIAL_SNAPSHOT);
    }
  }

  public stop(): void {
    this.sessionId += 1;
    this.teardownAudio();
    this.emit(INITIAL_SNAPSHOT);
  }

  public play(key: string, urls: string[]): void {
    const cleanUrls = dedupeValidUrls(urls);
    claimAudioFocus('preview_clip');

    this.sessionId += 1;
    const session = this.sessionId;
    this.teardownAudio();

    if (
      cleanUrls.length === 0 ||
      typeof window === 'undefined' ||
      typeof Audio === 'undefined'
    ) {
      this.emit({ activeKey: key, status: 'error', errorMessage: AUDIO_LOAD_ERROR_MESSAGE });
      return;
    }

    this.emit({ activeKey: key, status: 'loading', errorMessage: null });

    const playAt = (urlIndex: number) => {
      if (session !== this.sessionId) return;
      const targetUrl = cleanUrls[urlIndex];
      if (!targetUrl) {
        this.teardownAudio();
        this.emit({ activeKey: key, status: 'error', errorMessage: AUDIO_LOAD_ERROR_MESSAGE });
        return;
      }

      this.teardownAudio();

      // Archive.org / EveryAyah yönlendirmelerinde CORS engeli olmaması için crossOrigin KULLANILMAZ
      const audio = new Audio();
      audio.preload = 'auto';
      applyMediaVolumeToElement(audio);
      const controller = new AbortController();
      const { signal } = controller;
      this.audio = audio;
      this.abortController = controller;

      let failed = false;
      const onFail = () => {
        if (failed || session !== this.sessionId) return;
        failed = true;
        this.clearLoadTimer();
        this.clearStallTimer();
        if (urlIndex + 1 < cleanUrls.length) {
          playAt(urlIndex + 1);
          return;
        }
        this.teardownAudio();
        this.emit({ activeKey: key, status: 'error', errorMessage: AUDIO_LOAD_ERROR_MESSAGE });
      };

      const scheduleStallWatchdog = () => {
        if (session !== this.sessionId) return;
        this.clearStallTimer();
        const timeAtStall = audio.currentTime;
        this.stallTimer = window.setTimeout(() => {
          if (session !== this.sessionId || audio.paused) return;
          if (Math.abs(audio.currentTime - timeAtStall) < 0.05) {
            onFail();
          }
        }, LOAD_TIMEOUT_MS);
      };

      this.loadTimer = window.setTimeout(() => {
        if (session !== this.sessionId) return;
        onFail();
      }, LOAD_TIMEOUT_MS);

      audio.addEventListener(
        'playing',
        () => {
          if (session !== this.sessionId) return;
          this.clearLoadTimer();
          this.clearStallTimer();
          this.emit({ activeKey: key, status: 'playing', errorMessage: null });
        },
        { signal },
      );

      audio.addEventListener('waiting', scheduleStallWatchdog, { signal });
      audio.addEventListener('stalled', scheduleStallWatchdog, { signal });

      audio.addEventListener(
        'ended',
        () => {
          if (session !== this.sessionId) return;
          this.teardownAudio();
          this.emit(INITIAL_SNAPSHOT);
        },
        { signal },
      );

      audio.addEventListener('error', onFail, { signal });
      audio.src = targetUrl;

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (session !== this.sessionId) return;
          const errName =
            err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
          if (errName === 'AbortError') return;
          onFail();
        });
      }
    };

    playAt(0);
  }

  public toggle(key: string, urls: string[]): void {
    if (
      this.snapshot.activeKey === key &&
      (this.snapshot.status === 'playing' || this.snapshot.status === 'loading')
    ) {
      this.stop();
      return;
    }
    this.play(key, urls);
  }
}

export const previewAudioService = new PreviewAudioService();

registerAudioOwner('preview_clip', () => {
  previewAudioService.stop();
});
