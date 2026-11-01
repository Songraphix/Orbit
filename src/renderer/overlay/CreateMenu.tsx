import { Columns2, FolderPlus, PenLine, SquarePlus, SquareStack, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Rect } from '@shared/types/layout';
import { Glass } from './Glass';

type Action = 'space' | 'folder' | 'easel' | 'boost' | 'split' | 'tab';

/** Arc's + popover (Img 2), in its order and groups. */
const GROUPS: { action: Action; label: string; icon: ReactNode; keys?: string }[][] = [
  [
    { action: 'space', label: 'New Space', icon: <SquareStack size={17} /> },
    { action: 'folder', label: 'New Folder', icon: <FolderPlus size={17} /> },
  ],
  [
    { action: 'easel', label: 'New Easel', icon: <PenLine size={17} />, keys: '⌃⇧E' },
    { action: 'boost', label: 'New Boost', icon: <Wand2 size={17} /> },
  ],
  [
    { action: 'split', label: 'New Split', icon: <Columns2 size={17} />, keys: '⌃⇧=' },
    { action: 'tab', label: 'New Tab', icon: <SquarePlus size={17} />, keys: '⌘T' },
  ],
];
const ITEMS = GROUPS.flat();
const WIDTH = 228;

const run = (action: Action) => void window.orbit.invoke('sidebar:create', { action });

/**
 * The sidebar's + button (F-08, Img 2): a glass popover above it. New Tab is ready to go, like
 * Arc; arrow keys move, Return picks, Esc or a click outside closes.
 */
export function CreateMenu({ anchor }: { anchor: Rect }) {
  const [selected, setSelected] = useState(ITEMS.length - 1);
  const close = () => void window.orbit.invoke('sidebar:createMenu', { anchor });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') setSelected((i) => (i + 1) % ITEMS.length);
      else if (e.key === 'ArrowUp') setSelected((i) => (i - 1 + ITEMS.length) % ITEMS.length);
      else if (e.key === 'Enter') run(ITEMS[selected]!.action);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Right-aligned with the + button, so it stays over the sidebar like Arc's.
  const left = Math.max(8, anchor.x + anchor.width - WIDTH + 4);
  let index = -1;
  return (
    <div
      className="fixed inset-0"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="create-menu-backdrop"
    >
      {/* A zero-height anchor 8 px above the button; the popover hangs upwards from it (no
          viewport maths, so it's right even while the window is still resizing). */}
      <div className="absolute h-0" style={{ left, top: anchor.y - 8, width: WIDTH }}>
        <Glass
          className="animate-pop absolute bottom-0 left-0 w-full origin-bottom rounded-[16px] p-1.5"
          role="menu"
          aria-label="Create"
          data-testid="create-menu"
        >
          {GROUPS.map((group, g) => (
            <div key={g} className={g > 0 ? 'mt-1.5 border-t border-white/[0.09] pt-1.5' : ''}>
              {group.map((item) => {
                index++;
                const i = index;
                return (
                  <button
                    key={item.action}
                    type="button"
                    role="menuitem"
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => run(item.action)}
                    className={`flex h-9 w-full items-center gap-3 rounded-[10px] px-2.5 text-left text-[14px] font-medium transition-colors duration-100 ${
                      i === selected
                        ? 'bg-white/[0.13] text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.12)]'
                        : 'text-white/90'
                    }`}
                    data-testid="create-item"
                    data-action={item.action}
                  >
                    <span className="opacity-90">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.keys && <span className="text-[12px] text-white/40">{item.keys}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </Glass>
      </div>
    </div>
  );
}
