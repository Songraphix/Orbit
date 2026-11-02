/**
 * A page's media session (the previous / next track a music or video site offers its system
 * controls) for the sidebar's mini player. Chromium gives Electron no way to press those, so a
 * small shim in the page keeps a list of the handlers the site sets; the mini player calls them.
 * It adds nothing a page could use against you: only the page's own handlers, kept for Orbit.
 */
export const MEDIA_SESSION_SHIM = `(() => {
  const ms = navigator.mediaSession;
  if (!ms || ms.__orbitHandlers) return;
  const handlers = new Map();
  const set = ms.setActionHandler.bind(ms);
  ms.setActionHandler = (action, handler) => {
    if (handler) handlers.set(action, handler);
    else handlers.delete(action);
    return set(action, handler);
  };
  Object.defineProperty(ms, '__orbitHandlers', { value: handlers });
})()`;

export type TrackAction = 'previoustrack' | 'nexttrack';

/** Presses the site's own previous / next track (false if it offers none). */
export const runTrackAction = (action: TrackAction) => `(() => {
  const handler = navigator.mediaSession?.__orbitHandlers?.get(${JSON.stringify(action)});
  if (!handler) return false;
  handler({ action: ${JSON.stringify(action)} });
  return true;
})()`;

/** Which track actions the site offers. */
export const TRACK_ACTIONS = `(() => {
  const h = navigator.mediaSession?.__orbitHandlers;
  return { previous: !!h?.has('previoustrack'), next: !!h?.has('nexttrack') };
})()`;
