let quitting = false;
let quitCleanupDone = false;

export function isQuitting(): boolean {
  return quitting;
}

export function setQuitting(): void {
  quitting = true;
}

export function isQuitCleanupDone(): boolean {
  return quitCleanupDone;
}

export function markQuitCleanupDone(): void {
  quitCleanupDone = true;
}
