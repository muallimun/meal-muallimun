import { SFX_BASE_PATH, SFX_MAP, type SfxKey } from '../config/assetsConfig';

interface SfxConfigState {
  enabled: boolean;
  volume: number;
}

class SfxService {
  private config: SfxConfigState = {
    enabled: true,
    volume: 0.75,
  };

  private lastPlayedIndex: Partial<Record<SfxKey, number>> = {};
  private audioCache = new Map<string, HTMLAudioElement>();

  public configure(enabled: boolean, volume: number): void {
    this.config.enabled = enabled;
    this.config.volume = Math.max(0, Math.min(1, volume));
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

  private getAudioElement(fileName: string): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      return null;
    }

    const url = `${SFX_BASE_PATH}/${fileName}`;
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
      // Hızlı ardışık tıklamalarda kesilmemesi için klonla
      const instance = baseAudio.cloneNode(true) as HTMLAudioElement;
      instance.volume = this.config.volume;
      return instance;
    } catch {
      baseAudio.currentTime = 0;
      baseAudio.volume = this.config.volume;
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
    if (!fileName) return;

    const audio = this.getAudioElement(fileName);
    if (!audio) return;

    audio.volume = effectiveVolume;
    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Tarayıcı otomatik oynatma politikası veya eksik dosya durumunda sessizce yoksay
        });
      }
    } catch {
      // Sessiz fallback
    }
  }
}

export const sfxService = new SfxService();
