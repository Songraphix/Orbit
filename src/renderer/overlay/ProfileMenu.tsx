import {
  ArrowLeft,
  Check,
  Download,
  Keyboard,
  Library,
  Pencil,
  Plus,
  Settings,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { PROFILE_AVATARS, PROFILE_COLORS } from '@shared/profile';
import type { ProfilePatch, ProfileView } from '@shared/profile';
import type { Rect } from '@shared/types/layout';
import { Avatar } from '../profile/Avatar';
import { Glass } from './Glass';

const invoke = window.orbit.invoke;
const WIDTH = 312;

type Data = { current: ProfileView; profiles: (ProfileView & { spaces: number })[] };

/**
 * The profile menu (owner request, like Wavebox's): the profile this space uses — with your
 * name, avatar and colour to customise — your other profiles to switch to, a new profile, and
 * the way to Settings. Opens under the toolbar's avatar; Esc or a click outside closes it.
 */
export function ProfileMenu({ anchor }: { anchor: Rect }) {
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<'main' | 'customise'>('main');
  const close = () => void invoke('profile:menu', { anchor });
  const reload = () => void invoke('profile:get', {}).then(setData);

  useEffect(reload, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (view === 'customise') setView('main');
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Right-aligned under the avatar, kept inside the window.
  const left = Math.max(
    8,
    Math.min(anchor.x + anchor.width - WIDTH + 6, window.innerWidth - WIDTH - 8),
  );
  return (
    <div
      className="fixed inset-0"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="profile-menu-backdrop"
    >
      <Glass
        className="animate-pop absolute origin-top-right rounded-[22px] text-white"
        style={{ left, top: anchor.y + anchor.height + 8, width: WIDTH }}
        role="dialog"
        aria-label="Profile"
        data-testid="profile-menu"
      >
        {data &&
          (view === 'main' ? (
            <MainView data={data} onCustomise={() => setView('customise')} />
          ) : (
            <CustomiseView profile={data.current} onBack={() => setView('main')} onSaved={reload} />
          ))}
      </Glass>
    </div>
  );
}

function MainView({ data, onCustomise }: { data: Data; onCustomise: () => void }) {
  const { current } = data;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const others = data.profiles;
  return (
    <>
      <header className="flex items-center gap-3.5 px-4 pt-4 pb-3.5">
        <Avatar profile={current} size={52} ring />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium tracking-wide text-white/45 uppercase">
            Profile
          </div>
          <div className="truncate text-[17px] font-semibold" data-testid="profile-name">
            {current.name}
          </div>
          <div className="truncate text-[12.5px] text-white/55">
            {current.displayName ? `Hi, ${current.displayName}` : 'Add your name'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCustomise}
          className="press flex flex-col items-center gap-1 rounded-[12px] px-2 py-1.5 text-[10.5px] text-white/60 hover:bg-white/[0.08] hover:text-white"
          data-testid="profile-customise"
        >
          <Pencil size={16} />
          Customise
        </button>
      </header>

      <Divider />
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-white/45 uppercase">
          Profiles
        </span>
        <button
          type="button"
          aria-label="Manage Profiles"
          title="Manage Profiles"
          onClick={() => void invoke('profile:open', { page: 'profiles' })}
          className="press grid size-6 place-items-center rounded-[8px] text-white/50 hover:bg-white/[0.08] hover:text-white"
          data-testid="profile-manage"
        >
          <Settings size={14} />
        </button>
      </div>
      <ul className="px-2">
        {others.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => p.id !== current.id && void invoke('profile:switch', { id: p.id })}
              className="press flex h-10 w-full items-center gap-2.5 rounded-[12px] px-2 text-left text-[13.5px] hover:bg-white/[0.08]"
              data-testid="profile-item"
              aria-current={p.id === current.id ? 'true' : undefined}
            >
              <Avatar profile={p} size={24} />
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="text-[11.5px] text-white/40">
                {p.spaces === 1 ? '1 space' : `${p.spaces} spaces`}
              </span>
              {p.id === current.id && <Check size={14} className="text-white/80" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="px-3 pt-1 pb-3">
        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void invoke('profile:create', { name: name.trim() });
            }}
            className="flex h-9 items-center gap-2 rounded-full bg-white/[0.1] pr-1 pl-3.5 ring-1 ring-white/15"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Profile name (Work, School…)"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-white/40"
              data-testid="profile-new-name"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="press rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-neutral-900 disabled:opacity-40"
              data-testid="profile-new-create"
            >
              Create
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="press flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-white/85 ring-1 ring-white/20 hover:bg-white/[0.08]"
            data-testid="profile-new"
          >
            <Plus size={14} />
            Create New Profile
          </button>
        )}
      </div>

      <Divider />
      <nav className="p-2">
        <Row icon={<Settings size={16} />} label="Settings" keys="⌘," page="settings" />
        <Row icon={<UsersRound size={16} />} label="Manage Profiles" page="profiles" />
        <Row icon={<Library size={16} />} label="Library" page="library" />
        <Row icon={<Keyboard size={16} />} label="Keyboard Shortcuts" page="shortcuts" />
        <Row icon={<Download size={16} />} label="Import from Arc…" page="import" />
      </nav>
    </>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-white/[0.08]" />;
}

function Row(props: {
  icon: ReactNode;
  label: string;
  keys?: string;
  page: 'settings' | 'profiles' | 'shortcuts' | 'library' | 'import';
}) {
  return (
    <button
      type="button"
      onClick={() => void invoke('profile:open', { page: props.page })}
      className="press flex h-9 w-full items-center gap-3 rounded-[12px] px-2.5 text-left text-[13.5px] text-white/90 hover:bg-white/[0.08]"
      data-testid="profile-link"
      data-page={props.page}
    >
      <span className="text-white/60">{props.icon}</span>
      <span className="flex-1">{props.label}</span>
      {props.keys && <span className="text-[12px] text-white/35">{props.keys}</span>}
    </button>
  );
}

function CustomiseView({
  profile,
  onBack,
  onSaved,
}: {
  profile: ProfileView;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const save = (patch: ProfilePatch) =>
    void invoke('profile:update', { id: profile.id, patch }).then(onSaved);
  const preview = { ...profile, name: name || profile.name };
  return (
    <div className="p-4" data-testid="profile-customise-view">
      <header className="mb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="press grid size-7 place-items-center rounded-[9px] text-white/60 hover:bg-white/[0.08] hover:text-white"
          data-testid="profile-back"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-[14px] font-semibold">Customise Profile</span>
      </header>
      <div className="mb-4 flex justify-center">
        <Avatar profile={preview} size={64} ring />
      </div>
      <Field label="Profile name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== profile.name && save({ name })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={40}
          className={INPUT}
          data-testid="profile-field-name"
        />
      </Field>
      <Field label="Your name" hint="The new tab page greets you with it.">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={() => displayName !== profile.displayName && save({ displayName })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={40}
          placeholder="Joseph"
          className={INPUT}
          data-testid="profile-field-display-name"
        />
      </Field>
      <Field label="Avatar">
        <div className="grid grid-cols-9 gap-1">
          <Choice
            selected={profile.avatar === ''}
            onClick={() => save({ avatar: '' })}
            label="Initials"
            testId="profile-avatar-initials"
          >
            <span className="text-[10px] font-semibold">Aa</span>
          </Choice>
          {PROFILE_AVATARS.map((emoji) => (
            <Choice
              key={emoji}
              selected={profile.avatar === emoji}
              onClick={() => save({ avatar: emoji })}
              label={emoji}
              testId="profile-avatar"
            >
              <span className="text-[16px]">{emoji}</span>
            </Choice>
          ))}
        </div>
      </Field>
      <Field label="Colour">
        <div className="flex gap-2">
          {PROFILE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Colour ${color}`}
              aria-pressed={profile.color === color}
              onClick={() => save({ color })}
              className={`press size-6 rounded-full transition ${
                profile.color === color
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-black/40'
                  : ''
              }`}
              style={{ background: color }}
              data-testid="profile-color"
            />
          ))}
        </div>
      </Field>
    </div>
  );
}

const INPUT =
  'h-9 w-full rounded-[11px] bg-white/[0.08] px-3 text-[13.5px] outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-white/30';

function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-white/55">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-[11px] text-white/35">{props.hint}</span>}
    </label>
  );
}

function Choice(props: {
  selected: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.selected}
      onClick={props.onClick}
      className={`press grid aspect-square place-items-center rounded-[9px] ${
        props.selected ? 'bg-white/[0.22] ring-1 ring-white/50' : 'hover:bg-white/[0.1]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
