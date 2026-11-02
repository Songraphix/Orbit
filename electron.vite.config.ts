import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

const EXCALIDRAW_FONTS = resolve(
  import.meta.dirname,
  'node_modules/@excalidraw/excalidraw/dist/prod/fonts',
);
/**
 * Xiaolai (CJK, 12 MB) is left out: Chinese and Japanese text use a system font instead.
 * Excalidraw lists its CDN as a fallback for every face; the CSP blocks it (Chromium logs a
 * warning per face at startup), so nothing is ever fetched from the network.
 */
const shippedFont = (rel: string) => rel.endsWith('.woff2') && !rel.startsWith('Xiaolai');

/**
 * Excalidraw's hand-drawn fonts for Easels (F-19), served from Orbit itself at
 * `<renderer>/excalidraw/fonts/…`: internal pages' CSP blocks the CDN it would use otherwise.
 */
function excalidrawFonts(): Plugin {
  const files = () =>
    (readdirSync(EXCALIDRAW_FONTS, { recursive: true }) as string[])
      .map((f) => f.split('\\').join('/'))
      .filter(shippedFont);
  return {
    name: 'orbit-excalidraw-fonts',
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\/+/, ''));
        const file = join(EXCALIDRAW_FONTS, rel);
        if (rel.includes('..') || !shippedFont(rel) || !existsSync(file)) return next();
        res.setHeader('content-type', 'font/woff2');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const rel of files()) {
        this.emitFile({
          type: 'asset',
          fileName: `excalidraw/fonts/${rel}`,
          source: readFileSync(join(EXCALIDRAW_FONTS, rel)),
        });
      }
    },
  };
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rolldownOptions: {
        input: { index: resolve(import.meta.dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      rolldownOptions: {
        input: {
          // Shell + overlay share one preload; internal orbit:// pages get a reduced one.
          shell: resolve(import.meta.dirname, 'src/preload/shell.ts'),
          internal: resolve(import.meta.dirname, 'src/preload/internal.ts'),
        },
        // Sandboxed renderers cannot load ESM preloads, so force CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss(), excalidrawFonts()],
    build: {
      // electron-vite leaves renderers unminified by default; minified, every Orbit page (the
      // shell, overlay, panel, new tab page) has far less JavaScript to parse at startup.
      minify: true,
      rolldownOptions: {
        input: {
          shell: resolve(import.meta.dirname, 'src/renderer/shell/index.html'),
          overlay: resolve(import.meta.dirname, 'src/renderer/overlay/index.html'),
          internal: resolve(import.meta.dirname, 'src/renderer/internal/index.html'),
        },
      },
    },
  },
});
