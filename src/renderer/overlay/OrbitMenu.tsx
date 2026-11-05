import {
  ChevronRight,
  Cloud,
  Command,
  Home,
  Info,
  Layers,
  LayoutTemplate,
  Plus,
  Power,
  Settings,
  UsersRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Rect } from '@shared/types/layout';
import type { OrbitMenuAction, OrbitMenuView } from '@shared/types/orbit-menu';
import { SpaceIcon } from '../shell/sidebar/SpaceIcon';
import { Glass } from './Glass';

const invoke = window.orbit.invoke;
const WIDTH = 260;

/**
 * The Orbit menu (UI spec §5, UI 1): a compact glass menu under "Orbit ⌄" with Orbit's own
 * places and actions — Home, the command bar, your Spaces, profiles, sync and backup, Settings,
 * About and Quit. Every item is a real action; sync shows its real state (nothing when it's
 * off). Arrow keys move, → opens Spaces, Esc closes.
 */
export function OrbitMenu({ anchor }: { anchor: Rect }) {
  const [view, setView] = useState<OrbitMenuView | null>(null);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const close = () => void invoke('orbitmenu:open', { anchor });
  const run = (action: OrbitMenuAction, spaceId?: string) =>
    void invoke('orbitmenu:run', spaceId ? { action, spaceId } : { action });

  useEffect(() => {
    void invoke('orbitmenu:get', {}).then(setView);
  }, []);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (spacesOpen) setSpacesOpen(false);
        else close();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      next?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - WIDTH - 8));
  return (
    <div
      className="fixed inset-0"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="orbit-menu-backdrop"
    >
      <Glass
        className="animate-pop absolute origin-top-left rounded-[20px] text-white"
        style={{ left, top: anchor.y + anchor.height + 8, width: WIDTH }}
        role="menu"
        aria-label="Orbit"
        data-testid="orbit-menu"
      >
        <div ref={list} className="flex flex-col p-1.5">
          <Item icon={<Home size={16} />} label="Orbit Home" onClick={() => run('home')} />
          <Item
            icon={<Command size={16} />}
            label="Command Bar"
            keys="⌘T"
            onClick={() => run('command-bar')}
          />
          <Item
            icon={<Layers size={16} />}
            label="Spaces"
            onClick={() => setSpacesOpen((o) => !o)}
            onRight={() => setSpacesOpen(true)}
            trailing={
              <ChevronRight
                size={15}
                className={`text-white/55 transition-transform duration-[var(--dur-popover)] ${spacesOpen ? 'rotate-90' : ''}`}
              />
            }
            expanded={spacesOpen}
            testId="orbit-menu-spaces"
          />
          {spacesOpen && view && (
            <div className="animate-row-in ml-3 flex flex-col border-l border-white/12 pl-1.5">
              {view.spaces.map((space) => (
                <Item
                  key={space.id}
                  icon={<SpaceIcon icon={space.icon} size={15} />}
                  label={space.name}
                  onClick={() => run('space', space.id)}
                  trailing={
                    space.active ? (
                      <span className="size-1.5 rounded-full bg-white" aria-label="Current" />
                    ) : null
                  }
                  testId="orbit-menu-space"
                />
              ))}
              <Item
                icon={<Plus size={15} />}
                label="New Space"
                onClick={() => run('new-space')}
                quiet
              />
            </div>
          )}
          <Item
            icon={<LayoutTemplate size={16} />}
            label="Workspace Templates"
            onClick={() => run('workspaces')}
          />
          <Item icon={<UsersRound size={16} />} label="Profiles" onClick={() => run('profiles')} />
          <Divider />
          <Item
            icon={<Cloud size={16} />}
            label="Sync & Backup"
            onClick={() => run('sync')}
            trailing={
              view?.sync ? (
                <span
                  className={`flex items-center gap-1.5 text-[11.5px] ${
                    view.sync.state === 'error' ? 'text-[#ffb4a8]' : 'text-white/60'
                  }`}
                  data-testid="orbit-menu-sync"
                  data-state={view.sync.state}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      view.sync.state === 'synced'
                        ? 'bg-[#5fd38d]'
                        : view.sync.state === 'error'
                          ? 'bg-[#ff7b6b]'
                          : 'bg-white/50'
                    }`}
                  />
                  {view.sync.label}
                </span>
              ) : null
            }
          />
          <Item
            icon={<Settings size={16} />}
            label="Settings"
            keys="⌘,"
            onClick={() => run('settings')}
          />
          <Item icon={<Info size={16} />} label="About Orbit" onClick={() => run('about')} />
          <Divider />
          <Item
            icon={<Power size={16} />}
            label="Quit Orbit"
            keys="⌘Q"
            onClick={() => run('quit')}
          />
        </div>
      </Glass>
    </div>
  );
}

function Divider() {
  return <div className="mx-2.5 my-1 h-px bg-white/10" role="separator" />;
}

function Item(props: {
  icon: ReactNode;
  label: string;
  keys?: string;
  trailing?: ReactNode;
  onClick: () => void;
  onRight?: () => void;
  expanded?: boolean;
  quiet?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-expanded={props.expanded}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && props.onRight) {
          e.preventDefault();
          props.onRight();
        }
      }}
      className={`flex h-9 items-center gap-3 rounded-[12px] px-2.5 text-left text-[13.5px] outline-none hover:bg-white/10 focus-visible:bg-white/12 ${
        props.quiet ? 'text-white/70' : ''
      }`}
      data-testid={props.testId ?? 'orbit-menu-item'}
    >
      <span className="grid w-4 shrink-0 place-items-center text-white/80">{props.icon}</span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.trailing}
      {props.keys && <kbd className="font-sans text-[11.5px] text-white/45">{props.keys}</kbd>}
    </button>
  );
}
