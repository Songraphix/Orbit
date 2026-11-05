import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { NEW_TAB_URL } from '@shared/types/tabs';
import type { Rect } from '@shared/types/layout';
import { Rail } from '../shell/Rail';
import { useMainState } from '../shell/use-main-state';
import { CANVAS_SHELL_VARS } from '../ui/canvas-vars';

const close = () => void window.orbit.invoke('rail:peek', { open: false });

/**
 * The tucked-away app rail (Settings → Appearance → Auto-hide), slid out over the page while
 * the pointer is on it. It's the shell's own Rail, drawn here because the overlay is the only
 * layer above web pages; solid (nothing behind it to blur). Opening an app puts it away.
 */
export function FloatingRail({ rect }: { rect: Rect }) {
  const sidebar = useMainState('state:sidebar');
  const tabs = useMainState('state:tabs');
  const panel = useMainState('state:appPanel');
  const alive = useMainState('state:appsAlive');
  const active = tabs?.tabs.find((t) => t.id === tabs.activeTabId) ?? null;

  // Leaving the strip (onto the page) slides it back in.
  useEffect(() => {
    const root = document.documentElement;
    root.addEventListener('mouseleave', close);
    return () => root.removeEventListener('mouseleave', close);
  }, []);

  return (
    <div
      className="surfaces-solid fixed inset-0 animate-[orbit-slide-in_var(--dur-panel)_var(--ease-out)]"
      style={CANVAS_SHELL_VARS as CSSProperties}
      onClickCapture={() => setTimeout(close, 0)}
      data-testid="rail-peek"
    >
      {sidebar && (
        <Rail
          rect={rect}
          apps={sidebar.favorites}
          activeId={sidebar.activeItemId}
          panelId={panel?.itemId ?? null}
          home={active?.url === NEW_TAB_URL}
          standalone={false}
          alive={alive ?? []}
        />
      )}
    </div>
  );
}
