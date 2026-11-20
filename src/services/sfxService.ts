import {
  SFX_MAP,
  getLocalSfxUrl,
  getSfxUrl,
  type SfxKey,
} from '../config/assetsConfig';

interface SfxConfigState {
  enabled: boolean;
  volume: number;
}

type AudioContextCtor = typeof AudioContext;

class SfxService {
  private config: SfxConfigState = {
    enabled: true,
    volume: 0.75,
  };

  private lastPlayedIndex: Partial<Record<SfxKey, number>> = {};
  private audioCache = new Map<string, HTMLAudioElement>();
  private failedPrimary = new Set<string>();
  private failedAllMp3 = new Set<string>();
  private audioCtx: AudioContext | null = null;

  public configure(enabled: boolean, volume: number): void {
    this.config.enabled = enabled;
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor })
          .webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.audioCtx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * MP3 efektleri tarayıcı/codec nedeniyle çalınamazsa yumuşak Web Audio API tınıları üretir.
   */
  private playSynthTone(key: SfxKey, volume: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const peakGain = Math.min(0.24, Math.max(0.03, volume * 0.2));

    const playNote = (
      freq: number,
      startOffset: number,
      duration: number,
      type: OscillatorType = 'sine',
      endFreq?: number,
      gainScale = 1,
    ) => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + startOffset);
        if (endFreq !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(40, endFreq),
            now + startOffset + duration,
          );
        }

        const g = peakGain * gainScale;
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.linearRampToValueAtTime(g, now + startOffset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
      } catch {
        // ignore Web Audio errors
      }
    };

    switch (key) {
      case 'click':
        playNote(560, 0, 0.045, 'triangle', 380, 0.65);
        break;
      case 'correct':
        playNote(523.25, 0, 0.13, 'sine', undefined, 0.9); // C5
        playNote(783.99, 0.085, 0.22, 'sine', undefined, 1); // G5
        break;
      case 'wrong':
        playNote(270, 0, 0.14, 'triangle', 220, 0.85);
        playNote(205, 0.1, 0.2, 'triangle', 170, 0.75);
        break;
      case 'start':
        playNote(523.25, 0, 0.11, 'sine', undefined, 0.75); // C5
        playNote(659.25, 0.08, 0.11, 'sine', undefined, 0.85); // E5
        playNote(783.99, 0.16, 0.2, 'sine', undefined, 0.95); // G5
        break;
      case 'success':
        playNote(523.25, 0, 0.12, 'sine', undefined, 0.8); // C5
        playNote(659.25, 0.09, 0.12, 'sine', undefined, 0.85); // E5
        playNote(783.99, 0.18, 0.14, 'sine', undefined, 0.95); // G5
        playNote(1046.5, 0.28, 0.34, 'sine', undefined, 1); // C6
        break;
    }
  }

  private pickFile(key: SfxKey): string | null {
    const files = SFX_MAP[key];
    if (!files || files.length === 0) return null;
    if (files.length === 1) {
      this.lastPlayedIndex[key] = 0;
      return files[0];
    }

    const prevIndex = this.lastPlayedIndex[key];
    const candidateIndices: number[] = [];
    for (let i = 0; i < files.length; i += 1) {
      if (i !== prevIndex) {
        candidateIndices.push(i);
      }
    }

    const chosenIndex =
      candidateIndices[Math.floor(Math.random() * candidateIndices.length)] ?? 0;
    this.lastPlayedIndex[key] = chosenIndex;
    return files[chosenIndex];
  }

  private resolveUrlForFile(fileName: string): string {
    const localUrl = getLocalSfxUrl(fileName);
    const hostUrl = getSfxUrl(fileName);
    if (localUrl === hostUrl) return hostUrl;
    if (this.failedPrimary.has(fileName)) {
      return hostUrl;
    }
    return localUrl;
  }

  private createOrCloneAudio(url: string, volume: number): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      return null;
    }

    let baseAudio = this.audioCache.get(url);
    if (!baseAudio) {
      try {
        baseAudio = new Audio(url);
        baseAudio.preload = 'auto';
        this.audioCache.set(url, baseAudio);
      } catch {
        return null;
      }
    }

    try {
      const instance = baseAudio.cloneNode(true) as HTMLAudioElement;
      instance.volume = volume;
      return instance;
    } catch {
      baseAudio.currentTime = 0;
      baseAudio.volume = volume;
      return baseAudio;
    }
  }

  public play(key: SfxKey, options?: { force?: boolean; volumeOverride?: number }): void {
    if (!options?.force && !this.config.enabled) return;

    const effectiveVolume =
      options?.volumeOverride !== undefined
        ? Math.max(0, Math.min(1, options.volumeOverride))
        : this.config.volume;

    if (effectiveVolume <= 0) return;

    const fileName = this.pickFile(key);
    if (!fileName) {
      this.playSynthTone(key, effectiveVolume);
      return;
    }

    // Daha önce bu MP3 dosyası tamamen başarısız olduysa doğrudan Web Audio sentezine geç
    if (this.failedAllMp3.has(fileName)) {
      this.playSynthTone(key, effectiveVolume);
      return;
    }

    const primaryUrl = this.resolveUrlForFile(fileName);
    const fallbackUrl = getSfxUrl(fileName);
    const audio = this.createOrCloneAudio(primaryUrl, effectiveVolume);
    if (!audio) {
      this.playSynthTone(key, effectiveVolume);
      return;
    }

    let fallbackTriggered = false;
    let synthTriggered = false;

    const triggerSynth = () => {
      if (synthTriggered) return;
      synthTriggered = true;
      this.failedAllMp3.add(fileName);
      this.playSynthTone(key, effectiveVolume);
    };

    const tryFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;

      if (primaryUrl === fallbackUrl) {
        triggerSynth();
        return;
      }

      this.failedPrimary.add(fileName);
      const fbAudio = this.createOrCloneAudio(fallbackUrl, effectiveVolume);
      if (!fbAudio) {
        triggerSynth();
        return;
      }

      fbAudio.addEventListener('error', triggerSynth, { once: true });

      try {
        const p = fbAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            const errName =
              err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
            if (errName === 'NotAllowedError') return;
            triggerSynth();
          });
        }
      } catch {
        triggerSynth();
      }
    };

    audio.addEventListener('error', tryFallback, { once: true });

    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          const errName =
            err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
          if (errName === 'NotAllowedError') return;
          tryFallback();
        });
      }
    } catch {
      tryFallback();
    }
  }
}

export const sfxService = new SfxService();
