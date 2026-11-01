import { KeyRound, Rss, ShieldQuestion } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Glass } from './Glass';
import type { Prompt } from '@shared/types/command-bar';

const answer = (input: {
  id: number;
  allow: boolean;
  remember?: boolean;
  username?: string;
  password?: string;
  value?: string;
}) => void window.orbit.invoke('overlay:answer', input);

const hostOf = (origin: string) => origin.replace(/^https?:\/\//, '');

/**
 * Site prompts (F-31): permission requests and HTTP sign-in, shown under the toolbar like
 * Chrome's. Answers go back to main, which tells the page.
 */
export function PromptView({ prompt }: { prompt: Prompt }) {
  return (
    <div
      className="fixed inset-0 bg-black/[0.12] animate-[orbit-fade-in_160ms_var(--ease-out)]"
      data-testid="prompt-backdrop"
    >
      <Glass
        className="animate-pop absolute inset-x-0 top-14 mx-auto w-[min(380px,90vw)] origin-top rounded-[22px] p-4 text-sm"
        role="dialog"
        aria-label="Site request"
        data-testid="prompt"
        data-kind={prompt.kind}
      >
        {prompt.kind === 'permission' ? (
          <PermissionPrompt prompt={prompt} />
        ) : prompt.kind === 'login' ? (
          <LoginPrompt prompt={prompt} />
        ) : (
          <InputPrompt prompt={prompt} />
        )}
      </Glass>
    </div>
  );
}

function PermissionPrompt({ prompt }: { prompt: Extract<Prompt, { kind: 'permission' }> }) {
  const [remember, setRemember] = useState(true);
  const allowButton = useRef<HTMLButtonElement>(null);
  useEffect(() => allowButton.current?.focus(), []);
  return (
    <>
      <div className="flex gap-3">
        <ShieldQuestion size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <p>
          <strong className="font-semibold">{hostOf(prompt.origin)}</strong> wants to{' '}
          {prompt.action}.
        </p>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-white/55">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember for this site
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="press rounded-lg px-3 py-1.5 hover:bg-white/10"
          onClick={() => answer({ id: prompt.id, allow: false, remember })}
          data-testid="prompt-block"
        >
          Block
        </button>
        <button
          ref={allowButton}
          type="button"
          className="press rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.3)] hover:brightness-110"
          onClick={() => answer({ id: prompt.id, allow: true, remember })}
          data-testid="prompt-allow"
        >
          Allow
        </button>
      </div>
    </>
  );
}

function LoginPrompt({ prompt }: { prompt: Extract<Prompt, { kind: 'login' }> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        answer({ id: prompt.id, allow: true, username, password });
      }}
    >
      <div className="flex gap-3">
        <KeyRound size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <p>
          Sign in to <strong className="font-semibold">{prompt.host}</strong>
          {prompt.realm && <span className="block text-xs text-white/55">{prompt.realm}</span>}
        </p>
      </div>
      <input
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        autoComplete="username"
        className="mt-3 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-white outline-none placeholder:text-white/35 focus:border-[var(--accent)]"
        data-testid="login-username"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-white outline-none placeholder:text-white/35 focus:border-[var(--accent)]"
        data-testid="login-password"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="press rounded-lg px-3 py-1.5 hover:bg-white/10"
          onClick={() => answer({ id: prompt.id, allow: false })}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="press rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.3)] hover:brightness-110"
          data-testid="login-submit"
        >
          Sign In
        </button>
      </div>
    </form>
  );
}

/** A line of text for Orbit itself (a Live Folder's feed address, a repository…). */
function InputPrompt({ prompt }: { prompt: Extract<Prompt, { kind: 'input' }> }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) answer({ id: prompt.id, allow: true, value: value.trim() });
      }}
      onKeyDown={(e) => e.key === 'Escape' && answer({ id: prompt.id, allow: false })}
    >
      <div className="flex gap-3">
        <Rss size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <p>
          <strong className="font-semibold">{prompt.title}</strong>
          <span className="block text-xs text-white/55">{prompt.message}</span>
        </p>
      </div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={prompt.placeholder}
        spellCheck={false}
        className="mt-3 w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-white outline-none placeholder:text-white/35 focus:border-[var(--accent)]"
        data-testid="prompt-input"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="press rounded-lg px-3 py-1.5 hover:bg-white/10"
          onClick={() => answer({ id: prompt.id, allow: false })}
          data-testid="prompt-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!value.trim()}
          className="press rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.3)] hover:brightness-110 disabled:opacity-50"
          data-testid="prompt-confirm"
        >
          {prompt.confirm}
        </button>
      </div>
    </form>
  );
}
