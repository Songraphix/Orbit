export function ShellApp() {
  const { electron, chrome } = window.orbit.versions;
  return (
    <main
      className="flex h-full items-center justify-center"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)' }}
    >
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Orbit</h1>
        <p className="mt-2 text-sm opacity-60">
          Electron {electron} · Chromium {chrome}
        </p>
      </div>
    </main>
  );
}
