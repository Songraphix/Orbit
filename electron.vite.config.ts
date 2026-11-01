import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };

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
    plugins: [react(), tailwindcss()],
    build: {
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
