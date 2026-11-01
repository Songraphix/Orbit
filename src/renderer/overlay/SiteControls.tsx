import {
  Bell,
  Camera,
  Ellipsis,
  Eye,
  Hammer,
  Link,
  Lock,
  LockOpen,
  MapPin,
  Mic,
  Plus,
  Puzzle,
  Share,
  Wand2,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { BoostSummary } from '@shared/types/boosts';
import type { ExtensionAction } from '@shared/types/extensions';
import type { SiteAction, SiteControlsView, SiteSettingRow } from '@shared/types/site-controls';

const WIDTH = 248;

const ICONS: Record<SiteSettingRow['icon'], ReactNode> = {
  bell: <Bell size={14} />,
  preview: <Eye size={14} />,
  hammer: <Hammer size={14} />,
  camera: <Camera size={14} />,
  mic: <Mic size={14} />,
  location: <MapPin size={14} />,
};

const act = (action: SiteAction) => void window.orbit.invoke('sitecontrols:action', { action });
const close = () => void window.orbit.invoke('sitecontrols:close', {});

/**
 * The site controls popover (F-12, Img 3), hanging from the toolbar button: quick actions,
 * extensions, Boosts, settings for this site, and a security footer. Main does the work.
 */
export function SiteControls({ view }: { view: SiteControlsView }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Right edge under the button, kept inside the window.
  const left = Math.max(
    8,
    Math.min(view.anchor.x + view.anchor.width - WIDTH + 6, window.innerWidth - WIDTH - 8),
  );
  const top = view.anchor.y + view.anchor.height + 6;

  return (
    <div
      className="fixed inset-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      data-testid="site-controls-backdrop"
    >
      <div
        className="absolute flex max-h-[calc(100vh-60px)] flex-col overflow-y-auto rounded-2xl border border-white/10 bg-neutral-800/90 p-2.5 text-[13px] text-white shadow-[0_18px_60px_rgb(0_0_0/0.4)] backdrop-blur-xl animate-[orbit-fade-in_100ms_ease-out]"
        style={{ left, top, width: WIDTH }}
        role="dialog"
        aria-label={`Controls for ${view.host}`}
        data-testid="site-controls"
      >
        <div className="grid grid-cols-4 gap-1.5">
          <Action label="Share" onClick={() => act('share')} testId="site-share">
            <Share size={16} />
          </Action>
          <Action label="New Boost for this site" onClick={() => act('boost')} testId="site-boost">
            <Wand2 size={16} />
          </Action>
          <Action
            label="Screenshot (drag an area)"
            onClick={() => act('screenshot')}
            testId="site-screenshot"
          >
            <Camera size={16} />
          </Action>
          <Action label="Copy Link" onClick={() => act('copyUrl')} testId="site-copy">
            <Link size={16} />
          </Action>
        </div>

        <Heading>Extensions</Heading>
        {view.storeExtension && (
          <button
            type="button"
            disabled={view.storeExtension.installed}
            onClick={() => void window.orbit.invoke('extensions:install', {})}
            className="mb-1.5 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent,#5b5bd6)] font-semibold text-white hover:brightness-110 disabled:bg-white/10 disabled:text-white/60"
            data-testid="site-extension-install"
          >
            {view.storeExtension.installed ? 'Added to Orbit' : 'Add to Orbit'}
          </button>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {view.extensions.map((ext) => (
            <ExtensionButton key={ext.id} ext={ext} />
          ))}
          <Action
            label="Get Extensions"
            onClick={() => void window.orbit.invoke('extensions:openStore', {})}
            testId="site-extensions-add"
          >
            <Plus size={16} />
          </Action>
        </div>

        <Heading>Boosts</Heading>
        {view.boosts.length === 0 && (
          <p className="px-1 pb-1 text-[12px] text-white/50">No Boosts for this site yet.</p>
        )}
        {view.boosts.map((boost) => (
          <BoostRow key={boost.id} boost={boost} />
        ))}
        <button
          type="button"
          onClick={() => act('zap')}
          className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-white/10"
          data-testid="site-zap"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10">
            <Zap size={14} />
          </span>
          <span className="font-semibold">Zap Elements…</span>
        </button>

        <Heading>Settings</Heading>
        <div className="flex flex-col">
          {view.settings.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => void window.orbit.invoke('sitecontrols:pick', { key: row.key })}
              className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-white/10"
              data-testid="site-setting"
              data-key={row.key}
              data-value={row.value}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/90 text-neutral-800">
                {ICONS[row.icon]}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{row.label}</span>
                <span className="block truncate text-[12px] text-white/55">{row.valueLabel}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
          <span
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium ${view.secure ? 'bg-white/10' : 'bg-amber-500/25 text-amber-200'}`}
            title={
              view.secure
                ? `Connection to ${view.host} is encrypted`
                : 'Connection is not encrypted'
            }
            data-testid="site-security"
          >
            {view.secure ? <Lock size={12} /> : <LockOpen size={12} />}
            {view.secure ? 'Secure' : 'Not Secure'}
          </span>
          <button
            type="button"
            aria-label="More"
            onClick={() => act('more')}
            className="grid size-7 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            data-testid="site-more"
          >
            <Ellipsis size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtensionButton({ ext }: { ext: ExtensionAction }) {
  const activate = (event: ReactMouseEvent<HTMLButtonElement>, menu: boolean) => {
    const r = event.currentTarget.getBoundingClientRect();
    const anchor = { x: r.x, y: r.y, width: r.width, height: r.height };
    void window.orbit.invoke('extensions:activate', { id: ext.id, anchor, menu });
  };
  return (
    <button
      type="button"
      aria-label={ext.title}
      title={ext.title}
      onClick={(event) => activate(event, false)}
      onContextMenu={(event) => {
        event.preventDefault();
        activate(event, true);
      }}
      className="relative grid h-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
      data-testid="site-extension"
      data-extension-id={ext.id}
    >
      {ext.icon ? <img src={ext.icon} alt="" className="size-5" /> : <Puzzle size={16} />}
      {ext.badgeText && (
        <span
          className="absolute right-0.5 bottom-0.5 rounded px-1 text-[9px] leading-3 font-semibold text-white"
          style={{ background: ext.badgeColor ?? '#d33' }}
        >
          {ext.badgeText}
        </span>
      )}
    </button>
  );
}

function BoostRow({ boost }: { boost: BoostSummary }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-white/10"
      data-testid="site-boost-row"
      data-enabled={boost.enabled}
    >
      <button
        type="button"
        onClick={() => void window.orbit.invoke('boosts:edit', { id: boost.id })}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        title="Edit Boost"
        data-testid="site-boost-edit"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent,#5b5bd6)] text-white">
          <Wand2 size={14} />
        </span>
        <span className="truncate font-semibold">{boost.name}</span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={boost.enabled}
        aria-label={`${boost.enabled ? 'Turn off' : 'Turn on'} ${boost.name}`}
        onClick={() =>
          void window.orbit.invoke('boosts:toggle', { id: boost.id, enabled: !boost.enabled })
        }
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${boost.enabled ? 'bg-[var(--accent,#5b5bd6)]' : 'bg-white/20'}`}
        data-testid="site-boost-toggle"
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${boost.enabled ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-3 mb-1.5 px-1 text-[12px] font-semibold text-white/60">{children}</h3>;
}

function Action(props: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid h-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-white/10"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
