import type { Rect } from '@shared/types/layout';
import { AppPanelHeader } from '../shell/AppPanelHeader';
import { useMainState } from '../shell/use-main-state';
import { Glass } from './Glass';

/**
 * A sidebar app floating over the page (unpinned; owner request, like Opera's sidebar): its
 * glass frame and header here in the overlay, the app's own page on top of it. A click anywhere
 * else tucks it away — the app keeps running (music keeps playing).
 */
export function AppFloat({
  rect: inWindow,
  origin,
  interactive,
}: {
  rect: Rect;
  /** Where the overlay starts in the window (it may cover only the page side). */
  origin: { x: number; y: number };
  interactive: boolean;
}) {
  const sidebar = useMainState('state:sidebar');
  const rect = { ...inWindow, x: inWindow.x - origin.x, y: inWindow.y - origin.y };
  return (
    <div
      className="fixed inset-0"
      onMouseDown={(e) => {
        if (interactive && e.target === e.currentTarget)
          void window.orbit.invoke('apps:panel', { action: 'close' });
      }}
      data-testid="app-float-backdrop"
    >
      <Glass
        className="animate-pop absolute origin-left rounded-[20px] text-white"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        data-testid="app-float"
      >
        <span />
      </Glass>
      <AppPanelHeader rect={rect} radius={20} favorites={sidebar?.favorites ?? []} />
    </div>
  );
}
