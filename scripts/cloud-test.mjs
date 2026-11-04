// Runs the cloud tests against the Firebase Emulator (Auth + Firestore, with Orbit's rules):
//   npm run test:cloud
// The emulator needs Java 21+. Without one on PATH, the JDK in ~/.local/jdk is used (no admin
// rights needed — see docs/FIREBASE.md).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const env = { ...process.env };
const hasJava = spawnSync('java', ['-version'], { env }).status === 0;
if (!hasJava) {
  const root = join(homedir(), '.local', 'jdk');
  const jdk = existsSync(root) ? readdirSync(root).find((d) => d.startsWith('jdk-')) : undefined;
  if (!jdk) {
    console.error(
      'The Firebase Emulator needs Java 21+. See docs/FIREBASE.md → Local development.',
    );
    process.exit(1);
  }
  env.JAVA_HOME = join(root, jdk, 'Contents', 'Home');
  env.PATH = `${join(env.JAVA_HOME, 'bin')}:${env.PATH}`;
}
// `--e2e`: Settings → Account in the app (Playwright) instead of the engine tests (Vitest).
const e2e = process.argv.includes('--e2e');
const rest = process.argv
  .slice(2)
  .filter((a) => a !== '--e2e')
  .join(' ');
const command = e2e
  ? `playwright test tests/e2e/account.spec.ts ${rest}`
  : `vitest run --config vitest.cloud.config.ts ${rest}`;
// A demo- project never touches a real Firebase project.
const result = spawnSync(
  'npx',
  ['firebase', 'emulators:exec', '--only', 'auth,firestore', '--project', 'demo-orbit', command],
  { stdio: 'inherit', env },
);
process.exit(result.status ?? 1);
