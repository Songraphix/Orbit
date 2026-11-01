import { useEffect, useState } from 'react';
import type { InvokeOutput } from '@shared/ipc/contract';

export function ShellApp() {
  const [info, setInfo] = useState<InvokeOutput<'app:getInfo'> | null>(null);

  useEffect(() => {
    void window.orbit.invoke('app:getInfo', {}).then(setInfo);
  }, []);

  return (
    <main
      className="flex h-full items-center justify-center"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)' }}
    >
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Orbit</h1>
        <p className="mt-2 text-sm opacity-60" data-testid="app-info">
          {info ? `Electron ${info.electron} · Chromium ${info.chrome}` : '…'}
        </p>
      </div>
    </main>
  );
}
