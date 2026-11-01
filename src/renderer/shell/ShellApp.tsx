import { useEffect, useState } from 'react';
import type { InvokeOutput } from '@shared/ipc/contract';

/** Height of the draggable strip that holds the traffic lights (PLAN.md F-01). */
const TITLE_STRIP_HEIGHT = 44;

export function ShellApp() {
  const [info, setInfo] = useState<InvokeOutput<'app:getInfo'> | null>(null);

  useEffect(() => {
    void window.orbit.invoke('app:getInfo', {}).then(setInfo);
  }, []);

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)' }}
    >
      <header
        className="drag-region shrink-0"
        style={{ height: TITLE_STRIP_HEIGHT }}
        data-testid="title-strip"
      />
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Orbit</h1>
          <p className="mt-2 text-sm opacity-60" data-testid="app-info">
            {info ? `Electron ${info.electron} · Chromium ${info.chrome}` : '…'}
          </p>
        </div>
      </main>
    </div>
  );
}
