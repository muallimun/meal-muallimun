import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMediaVolumeToElement,
  clampMediaVolume,
  computeMediaVolumeFromSlider,
  computeToggledMediaMute,
  getEffectiveMediaVolume,
  getMediaVolumeLabel,
  getMediaVolumePercent,
  setMediaVolumeState,
  subscribeMediaVolume,
} from '../src/services/mediaVolumeService.ts';

test('clampMediaVolume clamps out-of-range and non-finite inputs safely', () => {
  assert.equal(clampMediaVolume(1.5), 1);
  assert.equal(clampMediaVolume(-0.2), 0);
  assert.equal(clampMediaVolume(0.65), 0.65);
  assert.equal(clampMediaVolume(Number.NaN), 1);
  assert.equal(clampMediaVolume(Number.POSITIVE_INFINITY), 1);
});

test('computeMediaVolumeFromSlider mutes at 0 and auto-unmutes above 0', () => {
  assert.deepEqual(computeMediaVolumeFromSlider(0), { mediaVolume: 0, mediaMuted: true });
  assert.deepEqual(computeMediaVolumeFromSlider(-0.1), { mediaVolume: 0, mediaMuted: true });
  assert.deepEqual(computeMediaVolumeFromSlider(0.35), { mediaVolume: 0.35, mediaMuted: false });
  assert.deepEqual(computeMediaVolumeFromSlider(1), { mediaVolume: 1, mediaMuted: false });
});

test('computeToggledMediaMute preserves level on mute and restores 0.8 when level was 0', () => {
  // Unmuted -> muted preserves existing level
  assert.deepEqual(computeToggledMediaMute(0.65, false), {
    mediaVolume: 0.65,
    mediaMuted: true,
  });
  // Muted with preserved level -> unmuted restores preserved level
  assert.deepEqual(computeToggledMediaMute(0.65, true), {
    mediaVolume: 0.65,
    mediaMuted: false,
  });
  // Muted at 0 -> unmuted restores 0.8
  assert.deepEqual(computeToggledMediaMute(0, true), {
    mediaVolume: 0.8,
    mediaMuted: false,
  });
  // Effectively muted (volume 0, muted false) -> unmuted restores 0.8
  assert.deepEqual(computeToggledMediaMute(0, false), {
    mediaVolume: 0.8,
    mediaMuted: false,
  });
});

test('effective volume helpers and labels reflect mute state accurately', () => {
  assert.equal(getEffectiveMediaVolume(0.7, false), 0.7);
  assert.equal(getEffectiveMediaVolume(0.7, true), 0);
  assert.equal(getMediaVolumePercent(0.7, false), 70);
  assert.equal(getMediaVolumePercent(0.7, true), 0);
  assert.equal(getMediaVolumeLabel(0.7, false), '%70');
  assert.equal(getMediaVolumeLabel(0.7, true), 'Sessiz');
  assert.equal(getMediaVolumeLabel(0, false), 'Sessiz');
});

test('applyMediaVolumeToElement and live subscription update HTMLAudioElement-like objects', () => {
  const fakeAudio = { volume: 1, muted: false };
  const events: Array<{ volume: number; muted: boolean }> = [];
  const unsubscribe = subscribeMediaVolume((state) => {
    events.push({ ...state });
    applyMediaVolumeToElement(fakeAudio, state);
  });

  setMediaVolumeState(0.4, false);
  assert.equal(fakeAudio.volume, 0.4);
  assert.equal(fakeAudio.muted, false);

  setMediaVolumeState(0.4, true);
  assert.equal(fakeAudio.volume, 0.4);
  assert.equal(fakeAudio.muted, true);

  setMediaVolumeState(1, false);
  assert.equal(fakeAudio.volume, 1);
  assert.equal(fakeAudio.muted, false);
  assert.equal(events.length, 3);

  unsubscribe();
});
