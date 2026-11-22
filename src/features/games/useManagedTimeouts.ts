import { useCallback, useEffect, useRef } from 'react';

/**
 * Tracks all scheduled window.setTimeout handles for a game component and
 * automatically clears any pending timers on unmount or explicit reset.
 */
export function useManagedTimeouts() {
  const activeTimeoutsRef = useRef<Set<number>>(new Set());

  const clearAllTimeouts = useCallback(() => {
    activeTimeoutsRef.current.forEach((id) => {
      window.clearTimeout(id);
    });
    activeTimeoutsRef.current.clear();
  }, []);

  const scheduleTimeout = useCallback((fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      activeTimeoutsRef.current.delete(id);
      fn();
    }, ms);
    activeTimeoutsRef.current.add(id);
    return id;
  }, []);

  const cancelTimeout = useCallback((id: number | null | undefined) => {
    if (typeof id !== 'number') return;
    window.clearTimeout(id);
    activeTimeoutsRef.current.delete(id);
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, [clearAllTimeouts]);

  return {
    scheduleTimeout,
    cancelTimeout,
    clearAllTimeouts,
  };
}
