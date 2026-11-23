// ============================================================================
// Hafif Web Audio API Sentezleyici & Dokunsal Geri Bildirim (Harici Dosyasız)
// ============================================================================

import { claimAudioFocus, registerAudioOwner } from '../../services/audioFocusCoordinator';

const MUTE_STORAGE_KEY = 'muallimun_games_muted_v1';

class GameAudioService {
  private ctx: AudioContext | null = null;
  private activeOscillators = new Set<OscillatorNode>();
  private muted: boolean;

  constructor() {
    this.muted = this.loadMutedPref();
  }

  private loadMutedPref(): boolean {
    try {
      return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(next: boolean): void {
    this.muted = next;
    if (next) {
      this.stop();
    }
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Depolama kısıtlı olabilir
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public stop(): void {
    for (const osc of Array.from(this.activeOscillators)) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Zaten durmuş olabilir
      }
    }
    this.activeOscillators.clear();
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => {
        // ignore
      });
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private claimFocusIfAudible(): void {
    if (!this.muted) {
      claimAudioFocus('game_audio');
    }
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0,
    endFreq?: number,
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.015, durationSec * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    this.activeOscillators.add(osc);
    osc.onended = () => {
      this.activeOscillators.delete(osc);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public vibrate(pattern: number | number[] = 15): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Desteklenmiyor olabilir
      }
    }
  }

  /** Kart çevirme / seçim dokunuşu (yumuşak tık) */
  public playFlip(): void {
    this.claimFocusIfAudible();
    this.playTone(540, 0.055, 'triangle', 0.08, 0, 680);
  }

  /** Mıknatıslı slota oturma sesi */
  public playSnap(): void {
    this.claimFocusIfAudible();
    this.playTone(460, 0.07, 'sine', 0.1, 0, 620);
    this.vibrate(12);
  }

  /** Doğru eşleşme ve 2x/3x+ kombo akoru */
  public playMatch(combo = 1): void {
    this.claimFocusIfAudible();
    const clampedCombo = Math.min(5, Math.max(1, combo));
    const semitoneLift = Math.pow(2, (clampedCombo - 1) / 12);
    const base = 523.25 * semitoneLift; // C5 başlangıç, kombo ile yükselir

    this.playTone(base, 0.13, 'triangle', 0.11, 0);
    this.playTone(base * 1.25, 0.17, 'triangle', 0.11, 0.065);
    if (clampedCombo >= 2) {
      this.playTone(base * 1.5, 0.22, 'sine', 0.1, 0.125);
    }
    this.vibrate(15);
  }

  /** Hatalı eşleşme için yumuşak bas uyarı */
  public playWrong(): void {
    this.claimFocusIfAudible();
    this.playTone(230, 0.12, 'triangle', 0.1, 0, 175);
    this.playTone(170, 0.15, 'sine', 0.08, 0.08, 145);
    this.vibrate([18, 35, 18]);
  }

  /** Sıra değişimi (İkili Düello) */
  public playTurnSwitch(): void {
    this.claimFocusIfAudible();
    this.playTone(392, 0.08, 'sine', 0.07, 0);
    this.playTone(440, 0.09, 'sine', 0.07, 0.06);
  }

  /** Seviye / oyun tamamlama vakarlı arpeji */
  public playFanfare(): void {
    this.claimFocusIfAudible();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, idx === notes.length - 1 ? 0.36 : 0.16, 'triangle', 0.11, idx * 0.085);
    });
    this.vibrate([15, 40, 20]);
  }
}

export const gameAudioService = new GameAudioService();

registerAudioOwner('game_audio', () => {
  gameAudioService.stop();
});
