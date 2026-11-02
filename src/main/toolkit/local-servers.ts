import { connect } from 'node:net';
import { net } from 'electron';
import type { LocalServer } from '@shared/toolkit/state';
import { pageTitle } from './model';

/**
 * Local preview shortcuts (roadmap P3.6): which development servers are running on this Mac —
 * the usual ports of Vite, Next, Astro, Storybook, Rails, Django… — and their page titles.
 * Only localhost is touched, and only when you ask (the Toolkit, or "localhost" in ⌘T).
 */
export const DEV_PORTS = [
  3000, 3001, 3002, 4000, 4173, 4200, 4321, 5000, 5173, 5174, 5500, 6006, 8000, 8080, 8081, 8888,
  9000, 1313, 2368, 19006,
] as const;

function isOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(250, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function titleAt(port: number): Promise<string> {
  try {
    const response = await net.fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return pageTitle((await response.text()).slice(0, 50_000));
  } catch {
    return '';
  }
}

export async function scanLocalServers(
  ports: readonly number[] = DEV_PORTS,
): Promise<LocalServer[]> {
  const open = await Promise.all(ports.map(async (port) => ((await isOpen(port)) ? port : null)));
  const found = open.filter((port): port is number => port !== null);
  return Promise.all(
    found.map(async (port) => ({
      port,
      url: `http://localhost:${port}/`,
      title: (await titleAt(port)) || `Port ${port}`,
    })),
  );
}
