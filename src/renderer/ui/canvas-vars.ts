/**
 * On the canvas everything takes its text and states from the wallpaper's theme (so they read
 * on whatever is behind); the Space's colours tint only its accent. The shell and the copies
 * the overlay slides out (the sidebar, the rail) paint with these.
 */
export const CANVAS_SHELL_VARS: Record<string, string> = {
  '--sidebar-bg': 'transparent',
  '--sidebar-fg': 'var(--fg)',
  '--sidebar-muted': 'var(--fg-muted)',
  '--hover': 'var(--glass-hover)',
  '--row-active': 'var(--sel-bg)',
  '--tile-bg': 'var(--glass-light)',
  '--row-shadow': 'inset 0 0 0 0.5px var(--sel-border), inset 0 1px 0 var(--glass-highlight)',
  '--grain': '0',
};
