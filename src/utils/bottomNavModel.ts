import type { NavTab, ReaderContentMode, StudyViewMode } from '../types/quran';

export interface BottomNavPolicyInput {
  isFullscreen: boolean;
  isExamActive: boolean;
  isMemorizationZenActive: boolean;
  activeTab: NavTab;
  viewMode: StudyViewMode;
}

export interface BottomNavPolicy {
  isMounted: boolean;
  shouldScrollAutoHide: boolean;
}

export const BOTTOM_NAV_REVEAL_EVENT = 'muallimun:bottom-nav-reveal';

export function requestBottomNavReveal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BOTTOM_NAV_REVEAL_EVENT));
  }
}

/**
 * Akıllı mobil alt navigasyon kuralı:
 * - Tam ekran kapalıyken tüm sekmelerde sabit görünür (sınav/zen hariç).
 * - Tam ekran açıkken Okuma dışı sekmelerde sabit görünür.
 * - Tam ekran + Okuma sekmesinde her üç görünümde (Mushaf, Kitap, Kartlar)
 *   kaydırma yönüne göre yumuşakça gizlenir/geri gelir.
 */
export function resolveBottomNavPolicy(input: BottomNavPolicyInput): BottomNavPolicy {
  const isMounted = !input.isExamActive && !input.isMemorizationZenActive;
  const isReaderTab = input.activeTab === 'reader';
  const shouldScrollAutoHide =
    input.isFullscreen &&
    isMounted &&
    isReaderTab &&
    (input.viewMode === 'mushaf' || input.viewMode === 'book' || input.viewMode === 'cards');

  return {
    isMounted,
    shouldScrollAutoHide,
  };
}

export type ScrollDirection = 'idle' | 'down' | 'up';

export interface ScrollHideTrackerState {
  isHidden: boolean;
  lastScrollY: number;
  anchorY: number;
  direction: ScrollDirection;
}

export function createInitialScrollHideState(scrollY = 0): ScrollHideTrackerState {
  return {
    isHidden: false,
    lastScrollY: scrollY,
    anchorY: scrollY,
    direction: 'idle',
  };
}

/**
 * Kaydırma yönü eşik hesaplayıcı:
 * - scrollY <= 32 ise her zaman göster.
 * - Aşağı yönde kümülatif fark > 10px ve scrollY > 48 ise gizle.
 * - Yukarı yönde kümülatif fark < -8px ise göster.
 */
export function stepScrollHideTracker(
  prev: ScrollHideTrackerState,
  currentY: number,
): ScrollHideTrackerState {
  const safeY = Math.max(0, currentY);

  if (safeY <= 32) {
    return {
      isHidden: false,
      lastScrollY: safeY,
      anchorY: safeY,
      direction: 'idle',
    };
  }

  const stepDelta = safeY - prev.lastScrollY;
  if (stepDelta === 0) {
    return prev;
  }

  const nextDirection: ScrollDirection = stepDelta > 0 ? 'down' : 'up';
  const nextAnchorY = nextDirection === prev.direction ? prev.anchorY : prev.lastScrollY;
  const cumulativeDelta = safeY - nextAnchorY;

  let nextHidden = prev.isHidden;
  if (nextDirection === 'down' && safeY > 48 && cumulativeDelta > 10) {
    nextHidden = true;
  } else if (nextDirection === 'up' && cumulativeDelta < -8) {
    nextHidden = false;
  }

  return {
    isHidden: nextHidden,
    lastScrollY: safeY,
    anchorY: nextAnchorY,
    direction: nextDirection,
  };
}

export function getReaderContentShortLabel(mode: ReaderContentMode): string {
  switch (mode) {
    case 'ar_only':
      return 'Arapça';
    case 'meal_only':
      return 'Meal';
    case 'ar_meal':
    default:
      return 'AR+Meal';
  }
}
