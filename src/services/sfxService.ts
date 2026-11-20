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

class SfxService {
  private config: SfxConfigState = {
    enabled: true,
    volume: 0.75,
  };

  private lastPlayedIndex: Partial<Record<SfxKey, number>> = {};
  private audioCache = new Map<string, HTMLAudioElement>();
  private failedPrimary = new Set<string>();

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

  private resolveUrlForFile(fileName: string): string {
    const localUrl = getLocalSfxUrl(fileName);
    const hostUrl = getSfxUrl(fileName);
    if (localUrl === hostUrl) return hostUrl;
    // Önce yerel /sfx denenmiş ve hata vermişse doğrudan canlı Vercel adresini kullan
    if (this.failedPrimary.has(fileName)) {
      return hostUrl;
    }
    // AI Studio önizlemede /public/sfx yerel olarak da bulunabilir; ilk olarak hostUrl ya da localUrl
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
    if (!fileName) return;

    const primaryUrl = this.resolveUrlForFile(fileName);
    const fallbackUrl = getSfxUrl(fileName);
    const audio = this.createOrCloneAudio(primaryUrl, effectiveVolume);
    if (!audio) return;

    const tryFallback = () => {
      if (primaryUrl === fallbackUrl) return;
      this.failedPrimary.add(fileName);
      const fbAudio = this.createOrCloneAudio(fallbackUrl, effectiveVolume);
      if (!fbAudio) return;
      try {
        const p = fbAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch {
        // Sessiz fallback
      }
    };

    audio.addEventListener('error', tryFallback, { once: true });

    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          // Yalnızca kaynak bulunamadığında fallback dene (NotAllowedError autoplay engeli ise deneme)
          if (err && typeof err === 'object' && 'name' in err && err.name === 'NotSupportedError') {
            tryFallback();
          }
        });
      }
    } catch {
      // Sessiz fallback
    }
  }
}

export const sfxService = new SfxService();
