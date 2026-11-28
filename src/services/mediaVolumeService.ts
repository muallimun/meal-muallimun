export interface MediaVolumeState {
  volume: number; // 0..1
  muted: boolean;
}

export const DEFAULT_MEDIA_VOLUME = 1;
export const RESTORED_MEDIA_VOLUME_ON_UNMUTE = 0.8;
export const IOS_HARDWARE_VOLUME_NOTE =
  'Bu cihazda kademeli ses düzeyi telefonun yan ses tuşlarıyla yönetilir; buradan sesi tamamen kapatıp açabilirsiniz.';

type MediaVolumeListener = (state: MediaVolumeState) => void;

let currentState: MediaVolumeState = {
  volume: DEFAULT_MEDIA_VOLUME,
  muted: false,
};

const listeners = new Set<MediaVolumeListener>();
let cachedHardwareVolumeLocked: boolean | null = null;

export function clampMediaVolume(value: number, fallback = DEFAULT_MEDIA_VOLUME): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 100) / 100;
}

export function computeMediaVolumeFromSlider(nextVolume: number): {
  mediaVolume: number;
  mediaMuted: boolean;
} {
  const clamped = clampMediaVolume(nextVolume, DEFAULT_MEDIA_VOLUME);
  if (clamped <= 0) {
    return { mediaVolume: 0, mediaMuted: true };
  }
  return { mediaVolume: clamped, mediaMuted: false };
}

export function computeToggledMediaMute(
  currentVolume: number,
  currentMuted: boolean,
): {
  mediaVolume: number;
  mediaMuted: boolean;
} {
  const clamped = clampMediaVolume(currentVolume, DEFAULT_MEDIA_VOLUME);
  const effectivelyMuted = Boolean(currentMuted) || clamped <= 0;
  if (effectivelyMuted) {
    return {
      mediaVolume: clamped <= 0 ? RESTORED_MEDIA_VOLUME_ON_UNMUTE : clamped,
      mediaMuted: false,
    };
  }
  return {
    mediaVolume: clamped,
    mediaMuted: true,
  };
}

export function isEffectivelyMuted(volume: number, muted: boolean): boolean {
  return Boolean(muted) || clampMediaVolume(volume, DEFAULT_MEDIA_VOLUME) <= 0;
}

export function getEffectiveMediaVolume(volume: number, muted: boolean): number {
  if (isEffectivelyMuted(volume, muted)) return 0;
  return clampMediaVolume(volume, DEFAULT_MEDIA_VOLUME);
}

export function getMediaVolumePercent(volume: number, muted: boolean): number {
  return Math.round(getEffectiveMediaVolume(volume, muted) * 100);
}

export function getMediaVolumeLabel(volume: number, muted: boolean): string {
  if (isEffectivelyMuted(volume, muted)) return 'Sessiz';
  return `%${getMediaVolumePercent(volume, muted)}`;
}

/**
 * iOS Safari / WebKit cihazlarda HTMLAudioElement.volume salt-okunur 1 kalır.
 * Tek seferlik prob ile donanımsal ses kilidi tespit edilir ve önbelleklenir.
 */
export function isHardwareVolumeLocked(): boolean {
  if (cachedHardwareVolumeLocked !== null) {
    return cachedHardwareVolumeLocked;
  }
  if (typeof Audio === 'undefined') {
    cachedHardwareVolumeLocked = false;
    return false;
  }
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    cachedHardwareVolumeLocked = probe.volume === 1;
  } catch {
    cachedHardwareVolumeLocked = false;
  }
  return cachedHardwareVolumeLocked;
}

export function getMediaVolumeState(): MediaVolumeState {
  return currentState;
}

export function setMediaVolumeState(volume: number, muted: boolean): void {
  const nextVolume = clampMediaVolume(volume, DEFAULT_MEDIA_VOLUME);
  const nextMuted = Boolean(muted) || nextVolume <= 0;
  if (currentState.volume === nextVolume && currentState.muted === nextMuted) {
    return;
  }
  currentState = { volume: nextVolume, muted: nextMuted };
  for (const listener of listeners) {
    listener(currentState);
  }
}

export function subscribeMediaVolume(listener: MediaVolumeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * CORS ve mobil arka plan çalmayı korumak için AudioContext/createMediaElementSource
 * kullanmadan doğrudan HTMLAudioElement.volume ve HTMLAudioElement.muted özelliklerini uygular.
 */
export function applyMediaVolumeToElement(
  audio: Pick<HTMLAudioElement, 'volume' | 'muted'> | null | undefined,
  state: MediaVolumeState = currentState,
): void {
  if (!audio) return;
  const safeVolume = clampMediaVolume(state.volume, DEFAULT_MEDIA_VOLUME);
  const shouldMute = Boolean(state.muted) || safeVolume <= 0;
  try {
    audio.volume = safeVolume;
  } catch {
    // Salt-okunur volume olan ortamlarda (iOS) sessizce geç
  }
  try {
    audio.muted = shouldMute;
  } catch {
    // ignore
  }
}
