import { buildReciterAudioUrls } from '../config/recitersConfig';
import { claimAudioFocus, registerAudioOwner } from './audioFocusCoordinator';
import { applyMediaVolumeToElement, subscribeMediaVolume } from './mediaVolumeService';
import { wakeLockService } from './wakeLockService';
import type {
  PauseMultiplier,
  SessionStep,
} from '../types/memorization';
import {
  parseVerseKey,
  TEACHER_RECITER_IDS,
} from '../types/memorization';
import type { ReciterDefinition } from '../types/quran';

export type MemAudioStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'waiting_pause'
  | 'paused'
  | 'error';

export interface MemAudioSnapshot {
  status: MemAudioStatus;
  activeVerseKey: string | null;
  activeSubIndex: number;
  totalSubVerses: number;
  isBesmele: boolean;
  pauseProgress: number; // 0..1
  pauseRemainingMs: number;
  pauseTotalMs: number;
  naturalTeacherPause: boolean;
  errorMessage: string | null;
}

interface PlayStepParams {
  step: SessionStep;
  nextStep: SessionStep | null;
  reciter: ReciterDefinition;
  playbackRate: number;
  listenRepeatPauseEnabled: boolean;
  pauseMultiplier: PauseMultiplier;
  unitTitle: string;
  surahNameLookup: (surahNo: number) => string;
  excludeBesmeleSurahs?: number[];
  onStepComplete: () => void;
  onMediaPrev?: () => void;
  onMediaNext?: () => void;
}

interface SubTrackItem {
  verseKey: string;
  surah: number;
  ayah: number;
  isBesmele: boolean;
  urls: string[];
}

type Listener = () => void;

const INITIAL_SNAPSHOT: MemAudioSnapshot = {
  status: 'idle',
  activeVerseKey: null,
  activeSubIndex: 0,
  totalSubVerses: 0,
  isBesmele: false,
  pauseProgress: 0,
  pauseRemainingMs: 0,
  pauseTotalMs: 0,
  naturalTeacherPause: false,
  errorMessage: null,
};

const LOAD_TIMEOUT_MS = 12000;
const FALLBACK_AYAH_DURATION_MS = 4500;
const MIN_PAUSE_MS = 3000;
const MAX_PAUSE_MS = 25000;

/**
 * Ezber Modu için çift kanallı (<audio> A/B) ön-yüklemeli ses ve akıllı sekte (Dinle & Tekrar Et) motoru.
 * - `crossOrigin` KULLANMAZ (Archive.org & EveryAyah CORS güvenliği).
 * - Çalışmaya başladığında genel `audioQueueService` oynatıcısını otomatik duraklatır.
 * - Media Session API ve Screen Wake Lock API ile tam entegredir.
 */
class MemorizationAudioController {
  private snapshot: MemAudioSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners = new Set<Listener>();

  // Çift kanal: biri aktif çalarken diğeri sıradaki ayeti arka planda ön-yükler
  private channels: [HTMLAudioElement | null, HTMLAudioElement | null] = [null, null];
  private activeChannelIdx: 0 | 1 = 0;
  private activeAbort: AbortController | null = null;
  private preloadedUrl: string | null = null;

  private sessionId = 0;
  private playAttemptId = 0;
  private loadTimer: number | null = null;
  private stallTimer: number | null = null;
  private pauseInterval: number | null = null;
  private pauseEndAt = 0;
  private pauseTotalMs = 0;
  private pauseRemainingOnFreeze = 0;

  private currentParams: PlayStepParams | null = null;
  private trackQueue: SubTrackItem[] = [];
  private currentTrackIdx = 0;
  private lastMeasuredDurationMs = FALLBACK_AYAH_DURATION_MS;

  constructor() {
    subscribeMediaVolume((volState) => {
      applyMediaVolumeToElement(this.channels[0], volState);
      applyMediaVolumeToElement(this.channels[1], volState);
    });
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): MemAudioSnapshot => this.snapshot;

  private emit(patch: Partial<MemAudioSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) {
      fn();
    }
  }

  private ensureChannels(): [HTMLAudioElement, HTMLAudioElement] {
    if (!this.channels[0]) {
      const a0 = new Audio();
      a0.preload = 'auto';
      applyMediaVolumeToElement(a0);
      this.channels[0] = a0;
    }
    if (!this.channels[1]) {
      const a1 = new Audio();
      a1.preload = 'auto';
      applyMediaVolumeToElement(a1);
      this.channels[1] = a1;
    }
    return [this.channels[0], this.channels[1]];
  }

  private clearLoadTimer(): void {
    if (this.loadTimer !== null) {
      window.clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private clearStallTimer(): void {
    if (this.stallTimer !== null) {
      window.clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private clearPauseTimer(): void {
    if (this.pauseInterval !== null) {
      window.clearInterval(this.pauseInterval);
      this.pauseInterval = null;
    }
  }

  private detachActiveListeners(): void {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
  }

  private pauseBothChannels(): void {
    for (const ch of this.channels) {
      if (ch) {
        try {
          ch.pause();
        } catch {
          // ignore
        }
      }
    }
  }

  // ==========================================================================
  // Wake Lock API (Merkezi wakeLockService ile çakışmasız senkronizasyon)
  // ==========================================================================

  private acquireWakeLock(): void {
    wakeLockService.setContinuousReason('memorize_audio', true);
  }

  private releaseWakeLock(): void {
    wakeLockService.setContinuousReason('memorize_audio', false);
  }

  // ==========================================================================
  // Media Session API
  // ==========================================================================

  private updateMediaSession(track: SubTrackItem): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !this.currentParams) {
      return;
    }
    const ms = navigator.mediaSession;
    const { reciter, unitTitle, step, surahNameLookup, onMediaPrev, onMediaNext } =
      this.currentParams;
    try {
      if (typeof MediaMetadata !== 'undefined') {
        const surahName = surahNameLookup(track.surah);
        ms.metadata = new MediaMetadata({
          title: track.isBesmele
            ? `Besmele · ${surahName}`
            : `${surahName} ${track.ayah}. Ayet`,
          artist: reciter.label,
          album: `${unitTitle} · ${step.shortLabel}`,
        });
      }
      ms.setActionHandler('play', () => this.resume());
      ms.setActionHandler('pause', () => this.pause());
      ms.setActionHandler('previoustrack', onMediaPrev ? () => onMediaPrev() : null);
      ms.setActionHandler('nexttrack', onMediaNext ? () => onMediaNext() : null);
    } catch {
      // Tarayıcı MediaSession desteklemiyorsa sessizce geç
    }
  }

  private setMediaPlaybackState(state: 'none' | 'paused' | 'playing'): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // ignore
    }
  }

  // ==========================================================================
  // Kuyruk & Ön-Yükleme Yardımcıları
  // ==========================================================================

  private buildTrackQueue(params: PlayStepParams): SubTrackItem[] {
    const exclude = params.excludeBesmeleSurahs ?? [1, 9];
    const items: SubTrackItem[] = [];

    params.step.verseKeys.forEach((key, idx) => {
      const { surah, ayah } = parseVerseKey(key);
      // Sure başı 1. ayette (Fâtiha ve Tevbe hariç) ve ilk tekrar/zincir başlangıcında Besmele ekle
      const shouldIncludeBesmele =
        ayah === 1 &&
        !exclude.includes(surah) &&
        (idx > 0 || params.step.repeatIndex === 1);

      if (shouldIncludeBesmele) {
        const bUrls = buildReciterAudioUrls(params.reciter, 1, 1);
        if (bUrls.length > 0) {
          items.push({
            verseKey: key,
            surah,
            ayah,
            isBesmele: true,
            urls: bUrls,
          });
        }
      }

      const urls = buildReciterAudioUrls(params.reciter, surah, ayah);
      if (urls.length > 0) {
        items.push({
          verseKey: key,
          surah,
          ayah,
          isBesmele: false,
          urls,
        });
      }
    });

    return items;
  }

  private preloadNextUrl(): void {
    if (!this.currentParams) return;
    const [, standby] = this.getActiveAndStandbyChannels();
    let nextUrl: string | null = null;

    if (this.currentTrackIdx + 1 < this.trackQueue.length) {
      nextUrl = this.trackQueue[this.currentTrackIdx + 1].urls[0] ?? null;
    } else if (
      this.currentParams.nextStep &&
      this.currentParams.nextStep.phase !== 'checkpoint' &&
      this.currentParams.nextStep.verseKeys.length > 0
    ) {
      const nextFirstKey = this.currentParams.nextStep.verseKeys[0];
      const { surah, ayah } = parseVerseKey(nextFirstKey);
      const exclude = this.currentParams.excludeBesmeleSurahs ?? [1, 9];
      const nextNeedsBesmele =
        ayah === 1 &&
        !exclude.includes(surah) &&
        this.currentParams.nextStep.repeatIndex === 1;
      nextUrl = nextNeedsBesmele
        ? (buildReciterAudioUrls(this.currentParams.reciter, 1, 1)[0] ?? null)
        : (buildReciterAudioUrls(this.currentParams.reciter, surah, ayah)[0] ?? null);
    }

    if (!nextUrl || nextUrl === this.preloadedUrl) return;
    this.preloadedUrl = nextUrl;
    const targetNextUrl = nextUrl;
    try {
      standby.onerror = () => {
        if (this.preloadedUrl === targetNextUrl) {
          this.preloadedUrl = null;
        }
      };
      standby.preload = 'auto';
      standby.src = targetNextUrl;
      standby.load();
    } catch {
      if (this.preloadedUrl === targetNextUrl) {
        this.preloadedUrl = null;
      }
    }
  }

  private getActiveAndStandbyChannels(): [HTMLAudioElement, HTMLAudioElement] {
    const [a0, a1] = this.ensureChannels();
    return this.activeChannelIdx === 0 ? [a0, a1] : [a1, a0];
  }

  private applyPlaybackRate(audio: HTMLAudioElement, rate: number): void {
    const pitchAudio = audio as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    try {
      if ('preservesPitch' in pitchAudio) pitchAudio.preservesPitch = true;
      if ('mozPreservesPitch' in pitchAudio) pitchAudio.mozPreservesPitch = true;
      if ('webkitPreservesPitch' in pitchAudio) pitchAudio.webkitPreservesPitch = true;
    } catch {
      // ignore unsupported pitch preservation errors
    }
    audio.playbackRate = rate;
  }

  // ==========================================================================
  // Oynatma Yaşam Döngüsü
  // ==========================================================================

  public playStep(params: PlayStepParams): void {
    // Merkezi ses odağını devral (diğer tüm ses/önizleme/mikrofon kaynaklarını durdur)
    claimAudioFocus('memorization');

    this.sessionId += 1;
    this.playAttemptId += 1;
    const mySession = this.sessionId;
    this.clearLoadTimer();
    this.clearStallTimer();
    this.clearPauseTimer();
    this.detachActiveListeners();
    this.pauseBothChannels();

    this.currentParams = params;
    this.trackQueue = this.buildTrackQueue(params);
    this.currentTrackIdx = 0;

    const naturalTeacherPause = TEACHER_RECITER_IDS.has(params.reciter.id);

    if (this.trackQueue.length === 0) {
      this.emit({
        status: 'error',
        errorMessage: 'Seçili okuyucu için ses kaynağı oluşturulamadı.',
        naturalTeacherPause,
      });
      return;
    }

    void this.acquireWakeLock();
    this.playTrackAt(0, 0, mySession);
  }

  private playTrackAt(trackIdx: number, urlIdx: number, session: number): void {
    if (session !== this.sessionId || !this.currentParams) return;
    const track = this.trackQueue[trackIdx];
    if (!track) {
      this.finishCurrentStep(session);
      return;
    }

    const url = track.urls[urlIdx];
    if (!url) {
      this.emit({
        status: 'error',
        errorMessage:
          'Ses dosyasına ulaşılamadı. İnternet bağlantınızı kontrol edin veya farklı bir okuyucu seçin.',
      });
      this.setMediaPlaybackState('paused');
      void this.releaseWakeLock();
      return;
    }

    const { reciter, playbackRate } = this.currentParams;
    const naturalTeacherPause = TEACHER_RECITER_IDS.has(reciter.id);
    this.currentTrackIdx = trackIdx;

    // Eğer bekleyen kanal bu URL'yi sağlıklı biçimde ön-yüklediyse kanalları değiştir (anında geçiş)
    const [, standbyCheck] = this.getActiveAndStandbyChannels();
    if (this.preloadedUrl === url && !standbyCheck.error) {
      this.activeChannelIdx = this.activeChannelIdx === 0 ? 1 : 0;
      this.preloadedUrl = null;
    }

    const [audio] = this.getActiveAndStandbyChannels();
    audio.onerror = null;
    this.detachActiveListeners();
    this.clearLoadTimer();
    this.clearStallTimer();
    this.playAttemptId += 1;
    const attemptId = this.playAttemptId;

    const controller = new AbortController();
    const { signal } = controller;
    this.activeAbort = controller;

    // Ayet indeksini (besmele hariç) hesapla
    const nonBesmeleCount = this.trackQueue.filter((t) => !t.isBesmele).length;
    const nonBesmeleBefore = this.trackQueue
      .slice(0, trackIdx + 1)
      .filter((t) => !t.isBesmele).length;

    this.emit({
      status: 'loading',
      activeVerseKey: track.verseKey,
      activeSubIndex: Math.max(0, nonBesmeleBefore - 1),
      totalSubVerses: Math.max(1, nonBesmeleCount),
      isBesmele: track.isBesmele,
      pauseProgress: 0,
      pauseRemainingMs: 0,
      pauseTotalMs: 0,
      naturalTeacherPause,
      errorMessage: null,
    });

    this.updateMediaSession(track);

    let failed = false;
    let lastProgressTime = 0;

    const handleFailure = () => {
      if (failed || session !== this.sessionId || attemptId !== this.playAttemptId) return;
      failed = true;
      this.clearLoadTimer();
      this.clearStallTimer();
      if (urlIdx + 1 < track.urls.length) {
        this.playTrackAt(trackIdx, urlIdx + 1, session);
        return;
      }
      this.emit({
        status: 'error',
        errorMessage:
          'Ses dosyasına ulaşılamadı. İnternet bağlantınızı kontrol edin veya farklı bir okuyucu seçin.',
      });
      this.setMediaPlaybackState('paused');
      void this.releaseWakeLock();
    };

    const recoverPlayingState = () => {
      if (session !== this.sessionId || attemptId !== this.playAttemptId) return;
      this.clearStallTimer();
      if (!audio.paused && this.snapshot.status === 'loading') {
        this.clearLoadTimer();
        this.applyPlaybackRate(audio, playbackRate);
        this.emit({ status: 'playing', errorMessage: null });
        this.setMediaPlaybackState('playing');
      }
    };

    const scheduleStallWatchdog = () => {
      if (session !== this.sessionId || attemptId !== this.playAttemptId) return;
      if (this.snapshot.status === 'playing') {
        this.emit({ status: 'loading' });
      }
      this.clearStallTimer();
      const timeAtStall = audio.currentTime;
      this.stallTimer = window.setTimeout(() => {
        if (session !== this.sessionId || attemptId !== this.playAttemptId || audio.paused) return;
        if (Math.abs(audio.currentTime - timeAtStall) < 0.05) {
          handleFailure();
        }
      }, LOAD_TIMEOUT_MS);
    };

    audio.addEventListener('canplay', recoverPlayingState, { signal });

    audio.addEventListener(
      'timeupdate',
      () => {
        if (session !== this.sessionId || attemptId !== this.playAttemptId) return;
        if (!audio.paused && this.snapshot.status === 'loading' && audio.currentTime > lastProgressTime) {
          recoverPlayingState();
        }
        lastProgressTime = audio.currentTime;
      },
      { signal },
    );

    audio.addEventListener(
      'playing',
      () => {
        if (session !== this.sessionId) return;
        this.clearLoadTimer();
        this.clearStallTimer();
        lastProgressTime = audio.currentTime;
        this.applyPlaybackRate(audio, playbackRate);
        this.emit({ status: 'playing', errorMessage: null });
        this.setMediaPlaybackState('playing');
        // Aktif ayet çalarken sıradaki URL'yi yedek kanalda ön-yükle
        this.preloadNextUrl();
      },
      { signal },
    );

    audio.addEventListener('waiting', scheduleStallWatchdog, { signal });
    audio.addEventListener(
      'stalled',
      () => {
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          scheduleStallWatchdog();
        }
      },
      { signal },
    );

    audio.addEventListener(
      'loadedmetadata',
      () => {
        if (session !== this.sessionId) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0.3) {
          this.lastMeasuredDurationMs = (audio.duration * 1000) / Math.max(0.5, playbackRate);
        }
      },
      { signal },
    );

    audio.addEventListener(
      'ended',
      () => {
        if (session !== this.sessionId) return;
        this.clearLoadTimer();
        this.clearStallTimer();
        if (Number.isFinite(audio.duration) && audio.duration > 0.3) {
          this.lastMeasuredDurationMs = (audio.duration * 1000) / Math.max(0.5, playbackRate);
        }
        this.handleTrackEnded(track, session);
      },
      { signal },
    );

    audio.addEventListener('error', handleFailure, { signal });

    this.loadTimer = window.setTimeout(() => {
      if (
        session === this.sessionId &&
        attemptId === this.playAttemptId &&
        this.snapshot.status === 'loading'
      ) {
        handleFailure();
      }
    }, LOAD_TIMEOUT_MS);

    if (audio.src !== url || audio.error !== null) {
      audio.src = url;
      audio.load();
    } else {
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    }
    this.applyPlaybackRate(audio, playbackRate);

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        if (session !== this.sessionId || attemptId !== this.playAttemptId) return;
        const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        if (name === 'AbortError') return;
        handleFailure();
      });
    }
  }

  private handleTrackEnded(track: SubTrackItem, session: number): void {
    if (session !== this.sessionId || !this.currentParams) return;
    const { reciter, listenRepeatPauseEnabled, pauseMultiplier } = this.currentParams;
    const isTeacher = TEACHER_RECITER_IDS.has(reciter.id);

    // Besmele bitince veya Muallim kaydı seçiliyse ya da sekte kapalıysa doğrudan sonraki ayete geç
    if (track.isBesmele || !listenRepeatPauseEnabled || isTeacher) {
      this.advanceTrack(session);
      return;
    }

    // Dinamik Sekte (Dinle & Tekrar Et Boşluğu)
    const rawDuration = Number.isFinite(this.lastMeasuredDurationMs)
      ? this.lastMeasuredDurationMs
      : FALLBACK_AYAH_DURATION_MS;
    const waitMs = Math.max(
      MIN_PAUSE_MS,
      Math.min(MAX_PAUSE_MS, Math.round(rawDuration * pauseMultiplier)),
    );

    this.startWaitPause(waitMs, waitMs, session);
  }

  private startWaitPause(remainingMs: number, totalMs: number, session: number): void {
    this.clearPauseTimer();
    this.pauseTotalMs = Math.max(500, totalMs);
    this.pauseEndAt = Date.now() + remainingMs;
    this.pauseRemainingOnFreeze = remainingMs;

    this.emit({
      status: 'waiting_pause',
      pauseTotalMs: this.pauseTotalMs,
      pauseRemainingMs: remainingMs,
      pauseProgress: Math.max(0, Math.min(1, 1 - remainingMs / this.pauseTotalMs)),
    });

    this.pauseInterval = window.setInterval(() => {
      if (session !== this.sessionId) {
        this.clearPauseTimer();
        return;
      }
      const left = Math.max(0, this.pauseEndAt - Date.now());
      this.pauseRemainingOnFreeze = left;
      const progress = Math.max(0, Math.min(1, 1 - left / this.pauseTotalMs));

      if (left <= 0) {
        this.clearPauseTimer();
        this.emit({ pauseProgress: 1, pauseRemainingMs: 0 });
        this.advanceTrack(session);
      } else {
        this.emit({
          pauseProgress: progress,
          pauseRemainingMs: left,
        });
      }
    }, 60);
  }

  private advanceTrack(session: number): void {
    if (session !== this.sessionId) return;
    if (this.currentTrackIdx + 1 < this.trackQueue.length) {
      this.playTrackAt(this.currentTrackIdx + 1, 0, session);
    } else {
      this.finishCurrentStep(session);
    }
  }

  private finishCurrentStep(session: number): void {
    if (session !== this.sessionId || !this.currentParams) return;
    const cb = this.currentParams.onStepComplete;
    cb();
  }

  public skipWaitPause(): void {
    if (this.snapshot.status !== 'waiting_pause') return;
    const session = this.sessionId;
    this.clearPauseTimer();
    this.emit({ pauseProgress: 1, pauseRemainingMs: 0 });
    this.advanceTrack(session);
  }

  public pause(): void {
    this.playAttemptId += 1;
    this.clearLoadTimer();
    this.clearStallTimer();
    if (this.snapshot.status === 'waiting_pause') {
      this.clearPauseTimer();
      this.emit({ status: 'paused' });
      this.setMediaPlaybackState('paused');
      void this.releaseWakeLock();
      return;
    }

    if (this.snapshot.status === 'playing' || this.snapshot.status === 'loading') {
      const [audio] = this.getActiveAndStandbyChannels();
      try {
        audio.pause();
      } catch {
        // ignore
      }
      this.emit({ status: 'paused' });
      this.setMediaPlaybackState('paused');
      void this.releaseWakeLock();
    }
  }

  public resume(): void {
    if (!this.currentParams) return;
    claimAudioFocus('memorization');

    if (this.snapshot.status === 'paused') {
      void this.acquireWakeLock();
      if (this.pauseRemainingOnFreeze > 120 && this.snapshot.pauseTotalMs > 0) {
        this.startWaitPause(this.pauseRemainingOnFreeze, this.pauseTotalMs, this.sessionId);
        return;
      }
      const [audio] = this.getActiveAndStandbyChannels();
      const session = this.sessionId;
      this.playAttemptId += 1;
      const attemptId = this.playAttemptId;
      this.applyPlaybackRate(audio, this.currentParams.playbackRate);
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (session !== this.sessionId || attemptId !== this.playAttemptId) return;
          this.playTrackAt(this.currentTrackIdx, 0, session);
        });
      }
      this.emit({ status: 'playing', errorMessage: null });
      this.setMediaPlaybackState('playing');
      return;
    }

    if (this.snapshot.status === 'error') {
      this.playStep(this.currentParams);
    }
  }

  public updateLiveSettings(patch: {
    playbackRate?: number;
    listenRepeatPauseEnabled?: boolean;
    pauseMultiplier?: PauseMultiplier;
  }): void {
    if (!this.currentParams) return;
    if (patch.playbackRate !== undefined) {
      this.currentParams = { ...this.currentParams, playbackRate: patch.playbackRate };
      const [audio] = this.getActiveAndStandbyChannels();
      this.applyPlaybackRate(audio, patch.playbackRate);
    }
    if (patch.listenRepeatPauseEnabled !== undefined) {
      this.currentParams = {
        ...this.currentParams,
        listenRepeatPauseEnabled: patch.listenRepeatPauseEnabled,
      };
    }
    if (patch.pauseMultiplier !== undefined) {
      this.currentParams = {
        ...this.currentParams,
        pauseMultiplier: patch.pauseMultiplier,
      };
    }
  }

  public stop(): void {
    this.sessionId += 1;
    this.playAttemptId += 1;
    this.clearLoadTimer();
    this.clearStallTimer();
    this.clearPauseTimer();
    this.detachActiveListeners();
    this.pauseBothChannels();
    this.preloadedUrl = null;
    this.currentParams = null;
    this.trackQueue = [];
    this.currentTrackIdx = 0;
    this.pauseRemainingOnFreeze = 0;
    this.setMediaPlaybackState('none');
    void this.releaseWakeLock();
    this.emit({ ...INITIAL_SNAPSHOT });
  }
}

export const memorizationAudioController = new MemorizationAudioController();

// Merkezi ses odak koordinatörü kaydı
registerAudioOwner('memorization', () => {
  memorizationAudioController.pause();
});
