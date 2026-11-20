import { buildReciterAudioUrls, findReciterById } from '../config/recitersConfig';
import type { EchoGapMode, SnowballStep } from '../types/memorization';
import type { ManifestData } from '../types/quran';
import { audioQueueService } from './audioQueueService';
import { parseVerseKey } from './memorizationStorage';

export type MemEngineStatus = 'idle' | 'loading' | 'playing' | 'gap' | 'paused' | 'completed' | 'error';

export interface MemAudioSnapshot {
  status: MemEngineStatus;
  stepIndex: number;
  repeatIndex: number; // 1-based
  verseInStepIndex: number;
  activeVerseKey: string | null;
  isBesmelePlaying: boolean;
  gapRemainingMs: number;
  gapTotalMs: number;
  errorMessage: string | null;
}

interface StartStepOptions {
  steps: SnowballStep[];
  stepIndex: number;
  repeatIndex?: number;
  reciterId: string;
  manifest: ManifestData | null;
  playbackRate: number;
  gapMode: EchoGapMode;
  fixedGapSec: number;
  includeBesmele: boolean;
  excludeBesmeleSurahs: number[];
  onStepComplete?: (completedStepIndex: number) => void;
  onSessionComplete?: () => void;
}

const INITIAL_SNAPSHOT: MemAudioSnapshot = {
  status: 'idle',
  stepIndex: 0,
  repeatIndex: 1,
  verseInStepIndex: 0,
  activeVerseKey: null,
  isBesmelePlaying: false,
  gapRemainingMs: 0,
  gapTotalMs: 0,
  errorMessage: null,
};

type Listener = () => void;

class MemorizationAudioEngine {
  private snapshot: MemAudioSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<Listener>();

  private audio: HTMLAudioElement | null = null;
  private preloader: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private gapInterval: number | null = null;
  private loadTimer: number | null = null;
  private sessionId = 0;

  private steps: SnowballStep[] = [];
  private reciterId = 'hatim';
  private manifest: ManifestData | null = null;
  private playbackRate = 1;
  private gapMode: EchoGapMode = 'none';
  private fixedGapSec = 3;
  private includeBesmele = true;
  private excludeBesmeleSurahs: number[] = [1, 9];
  private onStepComplete: ((idx: number) => void) | undefined;
  private onSessionComplete: (() => void) | undefined;

  private lastClipDurationSec = 4;
  private gapEndTime = 0;
  private pendingAfterGap: (() => void) | null = null;

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): MemAudioSnapshot => this.snapshot;

  private emit(patch: Partial<MemAudioSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) {
      l();
    }
  }

  private clearTimers(): void {
    if (this.gapInterval !== null) {
      window.clearInterval(this.gapInterval);
      this.gapInterval = null;
    }
    if (this.loadTimer !== null) {
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
    this.pendingAfterGap = null;
  }

  private teardownAudio(): void {
    this.clearTimers();
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
      this.audio = null;
    }
  }

  public syncLiveOptions(opts: {
    reciterId?: string;
    manifest?: ManifestData | null;
    playbackRate?: number;
    gapMode?: EchoGapMode;
    fixedGapSec?: number;
    includeBesmele?: boolean;
  }): void {
    const reciterChanged = opts.reciterId !== undefined && opts.reciterId !== this.reciterId;
    if (opts.reciterId !== undefined) this.reciterId = opts.reciterId;
    if (opts.manifest !== undefined) this.manifest = opts.manifest;
    if (opts.playbackRate !== undefined) {
      this.playbackRate = opts.playbackRate;
      if (this.audio) {
        this.audio.playbackRate = opts.playbackRate;
      }
    }
    if (opts.gapMode !== undefined) this.gapMode = opts.gapMode;
    if (opts.fixedGapSec !== undefined) this.fixedGapSec = opts.fixedGapSec;
    if (opts.includeBesmele !== undefined) this.includeBesmele = opts.includeBesmele;

    if (
      reciterChanged &&
      (this.snapshot.status === 'playing' || this.snapshot.status === 'loading') &&
      this.steps.length > 0
    ) {
      this.sessionId += 1;
      this.playCurrentClip(0, false);
    }
  }

  public startFrom(options: StartStepOptions): void {
    // Ana okuyucu ses oynatıcısı çalıyorsa çakışmayı önlemek için duraklat
    audioQueueService.pause();

    this.sessionId += 1;
    this.teardownAudio();

    this.steps = options.steps;
    this.reciterId = options.reciterId;
    this.manifest = options.manifest;
    this.playbackRate = options.playbackRate;
    this.gapMode = options.gapMode;
    this.fixedGapSec = options.fixedGapSec;
    this.includeBesmele = options.includeBesmele;
    this.excludeBesmeleSurahs = options.excludeBesmeleSurahs;
    this.onStepComplete = options.onStepComplete;
    this.onSessionComplete = options.onSessionComplete;

    const safeStepIdx = Math.max(0, Math.min(options.stepIndex, Math.max(0, options.steps.length - 1)));
    const step = options.steps[safeStepIdx];
    if (!step) {
      this.stop();
      return;
    }

    const rep = Math.max(1, Math.min(options.repeatIndex ?? 1, step.targetRepeats));
    const firstKey = step.verseKeys[0] ?? null;

    this.emit({
      status: 'loading',
      stepIndex: safeStepIdx,
      repeatIndex: rep,
      verseInStepIndex: 0,
      activeVerseKey: firstKey,
      isBesmelePlaying: false,
      gapRemainingMs: 0,
      gapTotalMs: 0,
      errorMessage: null,
    });

    const needsBesmele = this.shouldPlayBesmeleFor(firstKey, rep === 1);
    this.playCurrentClip(0, needsBesmele);
  }

  private shouldPlayBesmeleFor(verseKey: string | null, isFirstRepeat: boolean): boolean {
    if (!this.includeBesmele || !isFirstRepeat || !verseKey) return false;
    const parsed = parseVerseKey(verseKey);
    if (!parsed) return false;
    return parsed.ayah === 1 && !this.excludeBesmeleSurahs.includes(parsed.surah);
  }

  private preloadNext(): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const step = this.steps[this.snapshot.stepIndex];
    if (!step) return;

    let nextKey: string | null = null;
    if (this.snapshot.verseInStepIndex + 1 < step.verseKeys.length) {
      nextKey = step.verseKeys[this.snapshot.verseInStepIndex + 1];
    } else if (this.snapshot.repeatIndex < step.targetRepeats) {
      nextKey = step.verseKeys[0];
    } else if (this.snapshot.stepIndex + 1 < this.steps.length) {
      nextKey = this.steps[this.snapshot.stepIndex + 1].verseKeys[0];
    }
    if (!nextKey) return;

    const parsed = parseVerseKey(nextKey);
    if (!parsed) return;
    const reciter = findReciterById(this.reciterId, this.manifest);
    const urls = buildReciterAudioUrls(reciter, parsed.surah, parsed.ayah);
    const nextUrl = urls[0];
    if (!nextUrl) return;

    try {
      if (!this.preloader) {
        this.preloader = new Audio();
      }
      if (this.preloader.src !== nextUrl) {
        this.preloader.preload = 'auto';
        this.preloader.src = nextUrl;
      }
    } catch {
      // ignore preload errors
    }
  }

  private playCurrentClip(urlIndex: number, asBesmele: boolean): void {
    const sid = this.sessionId;
    const step = this.steps[this.snapshot.stepIndex];
    if (!step) {
      this.stop();
      return;
    }

    const verseKey = step.verseKeys[this.snapshot.verseInStepIndex];
    const parsed = verseKey ? parseVerseKey(verseKey) : null;
    if (!parsed) {
      this.advanceAfterClip(asBesmele);
      return;
    }

    const reciter = findReciterById(this.reciterId, this.manifest);
    const urls = asBesmele
      ? buildReciterAudioUrls(reciter, 1, 1)
      : buildReciterAudioUrls(reciter, parsed.surah, parsed.ayah);
    const targetUrl = urls[urlIndex];

    if (!targetUrl) {
      if (asBesmele) {
        this.playCurrentClip(0, false);
        return;
      }
      this.teardownAudio();
      this.emit({
        status: 'error',
        errorMessage: 'Ses dosyasına ulaşılamadı. Başka bir okuyucu seçebilir veya tekrar deneyebilirsiniz.',
      });
      return;
    }

    this.teardownAudio();
    this.emit({
      status: 'loading',
      activeVerseKey: verseKey,
      isBesmelePlaying: asBesmele,
      gapRemainingMs: 0,
      gapTotalMs: 0,
      errorMessage: null,
    });

    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      this.emit({ status: 'error', errorMessage: 'Bu tarayıcı ses oynatmayı desteklemiyor.' });
      return;
    }

    // Archive.org ve EveryAyah için crossOrigin kesinlikle ayarlanmaz
    const audio = new Audio();
    audio.preload = 'auto';
    audio.playbackRate = this.playbackRate;

    const controller = new AbortController();
    const { signal } = controller;
    this.audio = audio;
    this.abortController = controller;

    let failed = false;
    const handleFailure = () => {
      if (failed || sid !== this.sessionId) return;
      failed = true;
      this.clearTimers();
      if (urlIndex + 1 < urls.length) {
        this.playCurrentClip(urlIndex + 1, asBesmele);
        return;
      }
      if (asBesmele) {
        this.playCurrentClip(0, false);
        return;
      }
      this.teardownAudio();
      this.emit({
        status: 'error',
        errorMessage: 'Ses yüklenemedi. İnternet bağlantınızı kontrol edin veya farklı bir kurrâ seçin.',
      });
    };

    this.loadTimer = window.setTimeout(() => {
      if (sid === this.sessionId) handleFailure();
    }, 12000);

    audio.addEventListener(
      'loadedmetadata',
      () => {
        if (sid !== this.sessionId) return;
        if (!asBesmele && Number.isFinite(audio.duration) && audio.duration > 0) {
          this.lastClipDurationSec = audio.duration / Math.max(0.5, this.playbackRate);
        }
      },
      { signal },
    );

    audio.addEventListener(
      'playing',
      () => {
        if (sid !== this.sessionId) return;
        if (this.loadTimer !== null) {
          window.clearTimeout(this.loadTimer);
          this.loadTimer = null;
        }
        audio.playbackRate = this.playbackRate;
        this.emit({ status: 'playing', errorMessage: null });
        this.preloadNext();
      },
      { signal },
    );

    audio.addEventListener(
      'ended',
      () => {
        if (sid !== this.sessionId) return;
        if (this.loadTimer !== null) {
          window.clearTimeout(this.loadTimer);
          this.loadTimer = null;
        }
        this.advanceAfterClip(asBesmele);
      },
      { signal },
    );

    audio.addEventListener('error', handleFailure, { signal });
    audio.src = targetUrl;

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        if (sid !== this.sessionId) return;
        const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        if (name === 'AbortError') return;
        if (name === 'NotAllowedError') {
          this.clearTimers();
          this.emit({
            status: 'paused',
            errorMessage: 'Ses oynatmak için Oynat butonuna dokunun.',
          });
          return;
        }
        handleFailure();
      });
    }
  }

  private runGapThen(onDone: () => void): void {
    if (this.gapMode === 'none') {
      onDone();
      return;
    }

    const durationSec =
      this.gapMode === 'mirror'
        ? Math.max(2, Math.min(24, this.lastClipDurationSec * 1.15))
        : Math.max(1, Math.min(15, this.fixedGapSec));
    const totalMs = Math.round(durationSec * 1000);
    const sid = this.sessionId;

    this.teardownAudio();
    this.gapEndTime = Date.now() + totalMs;
    this.pendingAfterGap = onDone;

    this.emit({
      status: 'gap',
      isBesmelePlaying: false,
      gapTotalMs: totalMs,
      gapRemainingMs: totalMs,
    });

    this.gapInterval = window.setInterval(() => {
      if (sid !== this.sessionId) return;
      const rem = Math.max(0, this.gapEndTime - Date.now());
      if (rem <= 50) {
        const cb = this.pendingAfterGap;
        this.clearTimers();
        this.emit({ gapRemainingMs: 0, gapTotalMs: 0 });
        cb?.();
      } else {
        this.emit({ gapRemainingMs: rem });
      }
    }, 80);
  }

  public skipGapNow(): void {
    if (this.snapshot.status !== 'gap' || !this.pendingAfterGap) return;
    const cb = this.pendingAfterGap;
    this.clearTimers();
    this.emit({ gapRemainingMs: 0, gapTotalMs: 0 });
    cb();
  }

  private advanceAfterClip(wasBesmele: boolean): void {
    const step = this.steps[this.snapshot.stepIndex];
    if (!step) {
      this.stop();
      return;
    }

    if (wasBesmele) {
      this.playCurrentClip(0, false);
      return;
    }

    const nextVerseInStep = this.snapshot.verseInStepIndex + 1;
    // Bağlama zinciri içinde bir sonraki ayete geçerken boşluk bekleme; zincirin/ayetin bitişinde tekrar boşluğu ver
    if (nextVerseInStep < step.verseKeys.length) {
      const nextKey = step.verseKeys[nextVerseInStep];
      this.emit({
        verseInStepIndex: nextVerseInStep,
        activeVerseKey: nextKey,
      });
      this.playCurrentClip(0, false);
      return;
    }

    // Bir tam tekrar tamamlandı — echo/tekrar boşluğu (varsa) uygula
    this.runGapThen(() => {
      const currStep = this.steps[this.snapshot.stepIndex];
      if (!currStep) return;

      if (this.snapshot.repeatIndex < currStep.targetRepeats) {
        const nextRep = this.snapshot.repeatIndex + 1;
        this.emit({
          repeatIndex: nextRep,
          verseInStepIndex: 0,
          activeVerseKey: currStep.verseKeys[0] ?? null,
        });
        this.playCurrentClip(0, false);
        return;
      }

      // Adım tamamlandı!
      const finishedStepIndex = this.snapshot.stepIndex;
      this.onStepComplete?.(finishedStepIndex);

      if (finishedStepIndex + 1 < this.steps.length) {
        const nextStepIdx = finishedStepIndex + 1;
        const nextStep = this.steps[nextStepIdx];
        const firstKey = nextStep.verseKeys[0] ?? null;
        this.emit({
          stepIndex: nextStepIdx,
          repeatIndex: 1,
          verseInStepIndex: 0,
          activeVerseKey: firstKey,
        });
        this.playCurrentClip(0, false);
        return;
      }

      // Tüm ezber seansı tamamlandı!
      this.teardownAudio();
      this.emit({
        status: 'completed',
        isBesmelePlaying: false,
        gapRemainingMs: 0,
        gapTotalMs: 0,
      });
      this.onSessionComplete?.();
    });
  }

  public pause(): void {
    if (
      this.snapshot.status === 'playing' ||
      this.snapshot.status === 'loading' ||
      this.snapshot.status === 'gap'
    ) {
      this.sessionId += 1;
      this.clearTimers();
      try {
        this.audio?.pause();
      } catch {
        // ignore
      }
      this.emit({ status: 'paused', gapRemainingMs: 0, gapTotalMs: 0 });
    }
  }

  public resume(): void {
    if (this.snapshot.status !== 'paused' && this.snapshot.status !== 'error') return;
    if (this.steps.length === 0) return;
    audioQueueService.pause();
    this.sessionId += 1;
    if (this.audio && this.audio.src && !this.audio.ended) {
      const sid = this.sessionId;
      this.audio.playbackRate = this.playbackRate;
      const p = this.audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (sid === this.sessionId) {
            this.playCurrentClip(0, false);
          }
        });
      }
      this.emit({ status: 'playing', errorMessage: null });
    } else {
      this.playCurrentClip(0, false);
    }
  }

  public stop(): void {
    this.sessionId += 1;
    this.teardownAudio();
    this.steps = [];
    this.emit({ ...INITIAL_SNAPSHOT });
  }
}

export const memorizationAudioEngine = new MemorizationAudioEngine();
