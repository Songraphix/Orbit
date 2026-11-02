import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ImageIcon, LayoutGrid, Pencil, RotateCcw, Shuffle } from 'lucide-react';

export type HomeMenuAction = 'customize' | 'widgets' | 'background' | 'shuffle' | 'reset';

const ITEMS: { action: HomeMenuAction; label: string; icon: ReactNode }[] = [
  { action: 'customize', label: 'Customize Homepage…', icon: <LayoutGrid size={14} /> },
  { action: 'widgets', label: 'Edit Widgets', icon: <Pencil size={14} /> },
  { action: 'background', label: 'Change Background…', icon: <ImageIcon size={14} /> },
  { action: 'shuffle', label: 'Shuffle Background', icon: <Shuffle size={14} /> },
  { action: 'reset', label: 'Reset Layout', icon: <RotateCcw size={14} /> },
];

/**
 * The Homepage's right-click menu (brief §9A): Customize, Edit Widgets, Change or Shuffle the
 * background, Reset Layout. Kept inside the window; arrow keys move, Enter picks, Escape or a
 * click elsewhere closes. Text fields keep their own menu.
 */
export function HomeMenu(props: {
  at: { x: number; y: number };
  onPick: (action: HomeMenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', props.onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', props.onClose);
    };
  }, [props]);
  // Inside the window, whichever way it has to open.
  const width = 220;
  const height = ITEMS.length * 32 + 12;
  const left = Math.min(props.at.x, window.innerWidth - width - 8);
  const top = Math.min(props.at.y, window.innerHeight - height - 8);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Homepage"
      className="animate-pop fixed z-30 rounded-[12px] border border-white/15 bg-neutral-900/85 p-1.5 text-[13px] text-white shadow-2xl backdrop-blur-2xl"
      style={{ left, top, width }}
      data-testid="home-menu"
    >
      {ITEMS.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          onClick={() => {
            props.onClose();
            props.onPick(item.action);
          }}
          className="flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left outline-none hover:bg-white/12 focus:bg-[#0a84ff]"
          data-testid="home-menu-item"
          data-action={item.action}
        >
          <span className="opacity-80">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
