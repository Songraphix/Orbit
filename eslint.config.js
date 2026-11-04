import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'release/', 'coverage/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Renderers: browser globals, React rules, and never import Electron (architecture rule 2).
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'electron', message: 'Renderers use window.orbit only.' }],
          patterns: [
            { group: ['**/main/**', '**/preload/**'], message: 'Renderers use window.orbit only.' },
          ],
        },
      ],
    },
  },
  {
    // Shared code runs in every process: no Electron, no Node built-ins.
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['electron'], patterns: ['node:*'] }],
    },
  },
  prettier,
);
