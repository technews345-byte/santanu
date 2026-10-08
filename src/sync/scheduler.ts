type Handler = () => void;

let handler: Handler | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function setSyncHandler(next: Handler | null) {
  handler = next;
}

/**
 * Saving must feel instant, so a write never waits on the network: it lands in
 * SQLite, the UI updates, and this nudges a background sync a moment later.
 * Debounced so a burst of edits results in one upload rather than many.
 */
export function requestSync(delayMs = 1500) {
  if (!handler) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    handler?.();
  }, delayMs);
}
