/**
 * Merkezi Ses Odak Koordinatörü (Sıfır Bağımlılık).
 * Uygulamadaki tüm tilavet, önizleme, kelime sesi ve mikrofon kaynaklarının
 * aynı anda üst üste binmesini engellemek için döngüsel import oluşturmadan
 * karşılıklı odak (mutual exclusion) sağlar.
 */
export type AudioOwnerId =
  | 'main_queue'
  | 'reciter_preview'
  | 'memorization'
  | 'word_wbw'
  | 'preview_clip'
  | 'game_audio'
  | 'zen_user_voice'
  | 'zen_mic'
  | 'activity_scene';

type PauseOrStopCallback = () => void;

const ownersRegistry = new Map<AudioOwnerId, Set<PauseOrStopCallback>>();

export function registerAudioOwner(
  id: AudioOwnerId,
  pauseOrStopFn: PauseOrStopCallback,
): () => void {
  let bucket = ownersRegistry.get(id);
  if (!bucket) {
    bucket = new Set<PauseOrStopCallback>();
    ownersRegistry.set(id, bucket);
  }
  bucket.add(pauseOrStopFn);

  return () => {
    const current = ownersRegistry.get(id);
    if (!current) return;
    current.delete(pauseOrStopFn);
    if (current.size === 0) {
      ownersRegistry.delete(id);
    }
  };
}

export function claimAudioFocus(activeOwner: AudioOwnerId): void {
  for (const [ownerId, callbacks] of ownersRegistry.entries()) {
    if (ownerId === activeOwner) continue;
    for (const pauseOrStopFn of Array.from(callbacks)) {
      try {
        pauseOrStopFn();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[audioFocus]', ownerId, err);
        }
      }
    }
  }
}
