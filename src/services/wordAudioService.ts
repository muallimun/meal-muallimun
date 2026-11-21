import { audioQueueService } from './audioQueueService';
import { mapDisplayWordIndexToQul } from '../utils/wordSyncUtils';

export type WordAudioStatus = 'idle' | 'loading' | 'playing';

export interface WordAudioSnapshot {
  playingKey: string | null;
  status: WordAudioStatus;
}

type Listener = () => void;

const DEFAULT_WBW_PRIMARY = 'https://audio.qurancdn.com/wbw/{SSS}_{AAA}_{WWW}.mp3';
const DEFAULT_WBW_FALLBACK = 'https://verses.quran.com/wbw/{SSS}_{AAA}_{WWW}.mp3';

const INITIAL_SNAPSHOT: WordAudioSnapshot = {
  playingKey: null,
  status: 'idle',
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
  private sessionId = 0;
  private externalRegistered = false;

  private ensureMutualExclusion(): void {
    if (this.externalRegistered) return;
    this.externalRegistered = true;
    audioQueueService.registerExternalAudioPauser(() => {
      this.stop();
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
      this.snapshot.status === next.status
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private teardownAudio(): void {
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

  public stop(): void {
    this.sessionId += 1;
    this.teardownAudio();
    this.emit(INITIAL_SNAPSHOT);
  }

  /**
   * Tek bir Kur'an kelimesinin telaffuzunu Quran.com WBW CDN üzerinden çalar.
   * Ana tilavet çalıyorsa çakışmayı önlemek için otomatik olarak duraklatır.
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

    this.ensureMutualExclusion();

    // Ana tilavet çalıyorsa üst üste binmemesi için duraklat
    const mainStatus = audioQueueService.getSnapshot().status;
    if (mainStatus === 'playing' || mainStatus === 'loading') {
      audioQueueService.pause();
    }

    const key = buildWordAudioKey(surah, ayah, wordIndex1Based);
    this.sessionId += 1;
    const session = this.sessionId;
    this.teardownAudio();

    this.emit({ playingKey: key, status: 'loading' });

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
      const urls = fallbackUrl && fallbackUrl !== primaryUrl ? [primaryUrl, fallbackUrl] : [primaryUrl];

      const playAttempt = (urlIndex: number) => {
        if (session !== this.sessionId) return;
        const targetUrl = urls[urlIndex];
        if (!targetUrl) {
          this.teardownAudio();
          this.emit(INITIAL_SNAPSHOT);
          return;
        }

        this.teardownAudio();

        if (!this.audio) {
          this.audio = new Audio();
        }
        const audio = this.audio;
        audio.preload = 'auto';

        const controller = new AbortController();
        const { signal } = controller;
        this.abortController = controller;

        let failed = false;
        const onFail = () => {
          if (failed || session !== this.sessionId) return;
          failed = true;
          if (urlIndex + 1 < urls.length) {
            playAttempt(urlIndex + 1);
            return;
          }
          this.teardownAudio();
          this.emit(INITIAL_SNAPSHOT);
        };

        audio.addEventListener(
          'playing',
          () => {
            if (session !== this.sessionId) return;
            this.emit({ playingKey: key, status: 'playing' });
          },
          { signal },
        );

        audio.addEventListener(
          'ended',
          () => {
            if (session !== this.sessionId) return;
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
    void audioQueueService.ensureSegMetaLoaded().then((loadedMeta) => {
      startWithMeta(
        loadedMeta?.wbwAudioTemplate || DEFAULT_WBW_PRIMARY,
        loadedMeta?.wbwFallbackTemplate || DEFAULT_WBW_FALLBACK,
        loadedMeta?.wordCounts?.[surah - 1]?.[ayah - 1] ?? null,
      );
    });
  }
}

export const wordAudioService = new WordAudioService();
