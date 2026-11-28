import { claimAudioFocus, registerAudioOwner } from './audioFocusCoordinator';
import { AUDIO_LOAD_ERROR_MESSAGE, audioQueueService } from './audioQueueService';
import { applyMediaVolumeToElement, subscribeMediaVolume } from './mediaVolumeService';
import { mapDisplayWordIndexToQul } from '../utils/wordSyncUtils';

export type WordAudioStatus = 'idle' | 'loading' | 'playing' | 'error';

export interface WordAudioSnapshot {
  playingKey: string | null;
  status: WordAudioStatus;
  errorMessage: string | null;
}

type Listener = () => void;

const DEFAULT_WBW_PRIMARY = 'https://audio.qurancdn.com/wbw/{SSS}_{AAA}_{WWW}.mp3';
const DEFAULT_WBW_FALLBACK = 'https://verses.quran.com/wbw/{SSS}_{AAA}_{WWW}.mp3';
const WORD_LOAD_TIMEOUT_MS = 10_000;
const ERROR_AUTO_CLEAR_MS = 6_500;

const INITIAL_SNAPSHOT: WordAudioSnapshot = {
  playingKey: null,
  status: 'idle',
  errorMessage: null,
};

function pad3(n: number): string {
  return String(Math.max(1, Math.round(n))).padStart(3, '0');
}

function fillWbwTemplate(
  template: string,
  surah: number,
  ayah: number,
  wordIndex1Based: number,
): string {
  return template
    .replace(/\{SSS\}/g, pad3(surah))
    .replace(/\{AAA\}/g, pad3(ayah))
    .replace(/\{WWW\}/g, pad3(wordIndex1Based))
    .replace(/\{S\}/g, String(surah))
    .replace(/\{A\}/g, String(ayah))
    .replace(/\{W\}/g, String(wordIndex1Based));
}

export function buildWordAudioKey(surah: number, ayah: number, wordIndex1Based: number): string {
  return `${surah}:${ayah}:${wordIndex1Based}`;
}

class WordAudioService {
  private snapshot: WordAudioSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private loadTimer: number | null = null;
  private errorClearTimer: number | null = null;
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

  public getSnapshot = (): WordAudioSnapshot => this.snapshot;

  private emit(next: WordAudioSnapshot): void {
    if (
      this.snapshot.playingKey === next.playingKey &&
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

  private clearErrorTimer(): void {
    if (this.errorClearTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.errorClearTimer);
      this.errorClearTimer = null;
    }
  }

  private emitError(key: string, session: number): void {
    this.clearErrorTimer();
    this.emit({
      playingKey: key,
      status: 'error',
      errorMessage: AUDIO_LOAD_ERROR_MESSAGE,
    });
    if (typeof window !== 'undefined') {
      this.errorClearTimer = window.setTimeout(() => {
        if (session === this.sessionId && this.snapshot.status === 'error') {
          this.emit(INITIAL_SNAPSHOT);
        }
      }, ERROR_AUTO_CLEAR_MS);
    }
  }

  private teardownAudio(): void {
    this.clearLoadTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  public clearError(): void {
    this.clearErrorTimer();
    if (this.snapshot.status === 'error' || this.snapshot.errorMessage) {
      this.emit(INITIAL_SNAPSHOT);
    }
  }

  public stop(): void {
    this.sessionId += 1;
    this.clearErrorTimer();
    this.teardownAudio();
    this.emit(INITIAL_SNAPSHOT);
  }

  /**
   * Tek bir Kur'an kelimesinin telaffuzunu Quran.com WBW CDN üzerinden çalar.
   * Merkezi ses odağını devralarak diğer ses kaynaklarıyla üst üste binmeyi önler.
   */
  public playWordAudio(
    surah: number,
    ayah: number,
    wordIndex1Based: number,
    totalDisplayWords?: number,
  ): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return;
    if (!Number.isInteger(ayah) || ayah < 1) return;

    const key = buildWordAudioKey(surah, ayah, wordIndex1Based);
    if (
      this.snapshot.playingKey === key &&
      (this.snapshot.status === 'playing' || this.snapshot.status === 'loading')
    ) {
      this.stop();
      return;
    }

    claimAudioFocus('word_wbw');

    this.sessionId += 1;
    const session = this.sessionId;
    this.clearErrorTimer();
    this.teardownAudio();

    this.emit({ playingKey: key, status: 'loading', errorMessage: null });

    const startWithMeta = (
      primaryTemplate: string,
      fallbackTemplate: string,
      qulWordCount: number | null,
    ) => {
      if (session !== this.sessionId) return;

      const safeQulIdx = mapDisplayWordIndexToQul(
        wordIndex1Based,
        totalDisplayWords,
        qulWordCount,
      );

      const primaryUrl = fillWbwTemplate(primaryTemplate, surah, ayah, safeQulIdx);
      const fallbackUrl = fillWbwTemplate(fallbackTemplate, surah, ayah, safeQulIdx);
      const urls =
        fallbackUrl && fallbackUrl !== primaryUrl ? [primaryUrl, fallbackUrl] : [primaryUrl];

      const playAttempt = (urlIndex: number) => {
        if (session !== this.sessionId) return;
        const targetUrl = urls[urlIndex];
        if (!targetUrl) {
          this.teardownAudio();
          this.emitError(key, session);
          return;
        }

        this.teardownAudio();

        if (!this.audio) {
          this.audio = new Audio();
        }
        const audio = this.audio;
        audio.preload = 'auto';
        applyMediaVolumeToElement(audio);

        const controller = new AbortController();
        const { signal } = controller;
        this.abortController = controller;

        let failed = false;
        const onFail = () => {
          if (failed || session !== this.sessionId) return;
          failed = true;
          this.clearLoadTimer();
          // Birincil kaynak başarısız olursa hata göstermeden alternatif kaynağa geç
          if (urlIndex + 1 < urls.length) {
            playAttempt(urlIndex + 1);
            return;
          }
          // Yalnızca tüm kaynaklar başarısız olduğunda kullanıcıya hata bildir
          this.teardownAudio();
          this.emitError(key, session);
        };

        this.loadTimer = window.setTimeout(() => {
          if (session !== this.sessionId) return;
          onFail();
        }, WORD_LOAD_TIMEOUT_MS);

        audio.addEventListener(
          'playing',
          () => {
            if (session !== this.sessionId) return;
            this.clearLoadTimer();
            this.emit({ playingKey: key, status: 'playing', errorMessage: null });
          },
          { signal },
        );

        audio.addEventListener(
          'ended',
          () => {
            if (session !== this.sessionId) return;
            this.clearLoadTimer();
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

      playAttempt(0);
    };

    const cachedMeta = audioQueueService.getCachedSegMeta();
    if (cachedMeta) {
      startWithMeta(
        cachedMeta.wbwAudioTemplate || DEFAULT_WBW_PRIMARY,
        cachedMeta.wbwFallbackTemplate || DEFAULT_WBW_FALLBACK,
        audioQueueService.getQulWordCount(surah, ayah),
      );
      return;
    }

    // Meta henüz bellekte değilse hızlıca yükle; hata olursa varsayılan şablonlarla devam et
    void audioQueueService
      .ensureSegMetaLoaded()
      .catch(() => null)
      .then((loadedMeta) => {
        startWithMeta(
          loadedMeta?.wbwAudioTemplate || DEFAULT_WBW_PRIMARY,
          loadedMeta?.wbwFallbackTemplate || DEFAULT_WBW_FALLBACK,
          loadedMeta?.wordCounts?.[surah - 1]?.[ayah - 1] ?? null,
        );
      });
  }
}

export const wordAudioService = new WordAudioService();

registerAudioOwner('word_wbw', () => {
  wordAudioService.stop();
});
