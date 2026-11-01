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
  Share,
  Wand2,
} from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
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
          <Action label="Boost (coming in Phase 8)" disabled testId="site-boost">
            <Wand2 size={16} />
          </Action>
          <Action label="Screenshot" onClick={() => act('screenshot')} testId="site-screenshot">
            <Camera size={16} />
          </Action>
          <Action label="Copy Link" onClick={() => act('copyUrl')} testId="site-copy">
            <Link size={16} />
          </Action>
        </div>

        <Heading>Extensions</Heading>
        <div className="grid grid-cols-4 gap-1.5">
          <Action label="Extensions arrive later in Phase 7" disabled testId="site-extensions-add">
            <Plus size={16} />
          </Action>
        </div>

        <Heading>Boosts</Heading>
        <p className="px-1 pb-1 text-[12px] text-white/50">No Boosts for this site yet.</p>

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
