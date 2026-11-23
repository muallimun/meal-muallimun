export const STORAGE_QUOTA_EVENT = 'muallimun:storage-quota-error';

let allPersistencePaused = false;

export function setAllPersistencePaused(paused: boolean): void {
  allPersistencePaused = paused;
}

export function isAllPersistencePaused(): boolean {
  return allPersistencePaused;
}

export function reportStorageQuotaError(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_QUOTA_EVENT));
  } catch {
    // ignore event dispatch errors in restricted environments
  }
}
