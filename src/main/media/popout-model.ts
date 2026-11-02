import type { Rect } from '@shared/types/layout';

/** The video pop-out's size and place (owner request: Arc's floating video). */
export const POPOUT = {
  width: 420,
  minWidth: 240,
  maxHeight: 360,
  /** From the screen's edges (bottom-right corner, above the Dock). */
  margin: 24,
  radius: 14,
} as const;

/** Where a new pop-out goes: the bottom-right of the work area, sized to the video's shape. */
export function popoutBounds(workArea: Rect, aspect: number): Rect {
  const shape = Number.isFinite(aspect) && aspect > 0 ? Math.min(3, Math.max(0.5, aspect)) : 16 / 9;
  let width: number = POPOUT.width;
  let height = Math.round(width / shape);
  if (height > POPOUT.maxHeight) {
    height = POPOUT.maxHeight;
    width = Math.round(height * shape);
  }
  width = Math.min(width, workArea.width - POPOUT.margin * 2);
  height = Math.min(height, workArea.height - POPOUT.margin * 2);
  return {
    x: workArea.x + workArea.width - width - POPOUT.margin,
    y: workArea.y + workArea.height - height - POPOUT.margin,
    width,
    height,
  };
}

/**
 * Runs in the page (with a user gesture): finds the playing video and lifts it into the page's
 * top layer (the popover API), so it fills the view whatever the site's layout — without the
 * site seeing a fullscreen change. Returns its size, or null if no video is playing.
 * `needsSound`: skip muted videos (a feed's silent previews don't pop out on their own).
 */
export const LIFT_VIDEO = (needsSound: boolean) => `(() => {
  const playing = [...document.querySelectorAll('video')].find(
    (v) => !v.paused && !v.ended && v.readyState > 1 && v.videoWidth > 0${needsSound ? ' && !v.muted && v.volume > 0' : ''},
  );
  if (!playing) return null;
  playing.setAttribute('data-orbit-popout', '');
  try {
    if (!playing.hasAttribute('popover')) {
      playing.setAttribute('popover', 'manual');
      playing.setAttribute('data-orbit-popover', '');
    }
    playing.showPopover();
  } catch {}
  return { width: playing.videoWidth, height: playing.videoHeight };
})()`;

/** Puts the video back where the site had it. */
export const DROP_VIDEO = `(() => {
  for (const v of document.querySelectorAll('video[data-orbit-popout]')) {
    try { v.hidePopover(); } catch {}
    if (v.hasAttribute('data-orbit-popover')) {
      v.removeAttribute('popover');
      v.removeAttribute('data-orbit-popover');
    }
    v.removeAttribute('data-orbit-popout');
  }
})()`;

/** Is the lifted video playing? (Also: play/pause it.) */
export const VIDEO_PLAYING = `(() => {
  const v = document.querySelector('video[data-orbit-popout]');
  return v ? !v.paused : false;
})()`;
export const TOGGLE_VIDEO = `(() => {
  const v = document.querySelector('video[data-orbit-popout]');
  if (!v) return false;
  if (v.paused) v.play(); else v.pause();
  return !v.paused;
})()`;
export const PAUSE_VIDEO = `(() => {
  const v = document.querySelector('video[data-orbit-popout]');
  if (v) v.pause();
})()`;

/** The lifted video fills the view; the site's own inline sizes give way. */
export const LIFT_CSS = `video[data-orbit-popout] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  transform: none !important;
  object-fit: contain !important;
  background: #000 !important;
  overflow: hidden !important;
}
video[data-orbit-popout]::backdrop { background: #000 !important; }`;
