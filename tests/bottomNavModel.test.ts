import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialScrollHideState,
  getReaderContentShortLabel,
  resolveBottomNavPolicy,
  stepScrollHideTracker,
} from '../src/utils/bottomNavModel';

test('Policy keeps bottom nav visible when fullscreen is off', () => {
  for (const viewMode of ['mushaf', 'book', 'cards'] as const) {
    const policy = resolveBottomNavPolicy({
      isFullscreen: false,
      isExamActive: false,
      isMemorizationZenActive: false,
      activeTab: 'reader',
      viewMode,
    });
    assert.deepEqual(policy, {
      isMounted: true,
      shouldScrollAutoHide: false,
    });
  }
});

test('Policy keeps bottom nav visible on non-reader tabs even in fullscreen', () => {
  for (const activeTab of ['home', 'fihrist', 'memorize', 'exam'] as const) {
    const policy = resolveBottomNavPolicy({
      isFullscreen: true,
      isExamActive: false,
      isMemorizationZenActive: false,
      activeTab,
      viewMode: 'mushaf',
    });
    assert.deepEqual(policy, {
      isMounted: true,
      shouldScrollAutoHide: false,
    });
  }
});

test('Policy enables identical scroll auto-hide in fullscreen across Mushaf, Book, and Cards', () => {
  for (const viewMode of ['mushaf', 'book', 'cards'] as const) {
    const policy = resolveBottomNavPolicy({
      isFullscreen: true,
      isExamActive: false,
      isMemorizationZenActive: false,
      activeTab: 'reader',
      viewMode,
    });
    assert.deepEqual(policy, {
      isMounted: true,
      shouldScrollAutoHide: true,
    });
  }
});

test('Scroll tracker hides after >10px cumulative downward scroll past 48px and shows after <-8px upward scroll or <=32px', () => {
  let state = createInitialScrollHideState(0);

  // Small scroll near top stays visible
  state = stepScrollHideTracker(state, 40);
  assert.equal(state.isHidden, false);

  // Slow incremental downward scroll past 48px eventually exceeds 10px cumulative delta
  state = stepScrollHideTracker(state, 45);
  state = stepScrollHideTracker(state, 49);
  assert.equal(state.isHidden, true);

  // Small upward jitter (-5px) does not reveal prematurely
  state = stepScrollHideTracker(state, 44);
  assert.equal(state.isHidden, true);

  // Cumulative upward scroll exceeds -8px -> reveals
  state = stepScrollHideTracker(state, 40);
  assert.equal(state.isHidden, false);

  // Hide again far down page
  state = stepScrollHideTracker(state, 120);
  assert.equal(state.isHidden, true);

  // Returning to top (<= 32px) always shows
  state = stepScrollHideTracker(state, 20);
  assert.equal(state.isHidden, false);
});

test('Reader content short labels map accurately', () => {
  assert.equal(getReaderContentShortLabel('ar_only'), 'Arapça');
  assert.equal(getReaderContentShortLabel('ar_meal'), 'AR+Meal');
  assert.equal(getReaderContentShortLabel('meal_only'), 'Meal');
});
