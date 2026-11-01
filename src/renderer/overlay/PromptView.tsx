import { KeyRound, ShieldQuestion } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Prompt } from '@shared/types/command-bar';

const answer = (input: {
  id: number;
  allow: boolean;
  remember?: boolean;
  username?: string;
  password?: string;
}) => void window.orbit.invoke('overlay:answer', input);

const hostOf = (origin: string) => origin.replace(/^https?:\/\//, '');

/**
 * Site prompts (F-31): permission requests and HTTP sign-in, shown under the toolbar like
 * Chrome's. Answers go back to main, which tells the page.
 */
export function PromptView({ prompt }: { prompt: Prompt }) {
  return (
    <div className="fixed inset-0 bg-black/10" data-testid="prompt-backdrop">
      <div
        className="absolute top-14 left-1/2 w-[min(380px,90vw)] -translate-x-1/2 rounded-2xl border border-black/10 bg-white/95 p-4 text-sm text-neutral-800 shadow-[0_18px_60px_rgb(0_0_0/0.25)] backdrop-blur-xl"
        role="dialog"
        aria-label="Site request"
        data-testid="prompt"
        data-kind={prompt.kind}
      >
        {prompt.kind === 'permission' ? (
          <PermissionPrompt prompt={prompt} />
        ) : (
          <LoginPrompt prompt={prompt} />
        )}
      </div>
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
      <label className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember for this site
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 hover:bg-black/5"
          onClick={() => answer({ id: prompt.id, allow: false, remember })}
          data-testid="prompt-block"
        >
          Block
        </button>
        <button
          ref={allowButton}
          type="button"
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:brightness-110"
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
          {prompt.realm && <span className="block text-xs text-neutral-500">{prompt.realm}</span>}
        </p>
      </div>
      <input
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        autoComplete="username"
        className="mt-3 w-full rounded-lg border border-black/10 px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
        data-testid="login-username"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="mt-2 w-full rounded-lg border border-black/10 px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
        data-testid="login-password"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 hover:bg-black/5"
          onClick={() => answer({ id: prompt.id, allow: false })}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:brightness-110"
          data-testid="login-submit"
        >
          Sign In
        </button>
      </div>
    </form>
  );
}
