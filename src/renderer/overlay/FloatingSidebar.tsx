import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { themeToVars } from '@shared/theme';
import { DEFAULT_THEME } from '@shared/types/space';
import { Sidebar } from '../shell/Sidebar';
import { useMainState } from '../shell/use-main-state';

const close = () => void window.orbit.invoke('sidebar:peek', { open: false });
const noop = () => undefined;

/**
 * The hidden sidebar, slid out over the page while the pointer is on it (F-01, like Arc). It's
 * the shell's own Sidebar, drawn here because the overlay is the only layer above web pages;
 * main sizes the overlay to just this strip, so the page beside it keeps working.
 */
export function FloatingSidebar({ width }: { width: number }) {
  const sidebar = useMainState('state:sidebar');
  const downloads = useMainState('state:downloads');
  const media = useMainState('state:media');
  const library = useMainState('state:library');
  const theme = sidebar?.spaces.find((s) => s.id === sidebar.activeSpaceId)?.theme ?? DEFAULT_THEME;
  const vars = useMemo(() => themeToVars(theme), [theme]);

  // Leaving the strip (onto the page) slides it back in.
  useEffect(() => {
    const root = document.documentElement;
    root.addEventListener('mouseleave', close);
    return () => root.removeEventListener('mouseleave', close);
  }, []);

  return (
    <div
      className="fixed inset-y-0 left-0 overflow-hidden rounded-r-[14px] border-r-[0.5px] border-white/15 shadow-[inset_-0.5px_0_0_rgb(255_255_255/0.08),8px_0_32px_-4px_rgb(0_0_0/0.45)] animate-[orbit-slide-in_var(--dur-slow)_var(--ease-out)]"
      style={{ ...(vars as CSSProperties), width }}
      data-testid="sidebar-peek"
    >
      {/* Opaque base: the shell's sidebar is translucent over macOS vibrancy, which isn't here. */}
      <div
        className="absolute inset-0"
        style={{ background: theme.mode === 'light' ? 'rgb(245 245 247)' : 'rgb(24 24 28)' }}
      />
      <div className="absolute inset-0" style={{ background: 'var(--sidebar-bg)' }} />
      <Sidebar
        width={width}
        sidebar={sidebar}
        downloads={downloads?.items ?? []}
        media={media}
        librarySection={library?.section ?? null}
        floating
        onResizeStart={noop}
        onResizeEnd={noop}
      />
    </div>
  );
}
