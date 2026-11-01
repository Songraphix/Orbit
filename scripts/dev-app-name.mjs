// Development only: `npm run dev` runs inside node_modules' stock Electron.app, so macOS shows
// "Electron" in the Dock, the menu bar and ⌘-Tab. This names that bundle "Orbit" and gives it
// Orbit's icon (the packaged app is named by electron-builder). Runs after `npm install`.
// The stock bundle is only linker-signed, so its Info.plist isn't sealed and stays valid.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const app = join(import.meta.dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
if (process.platform !== 'darwin' || !existsSync(app)) process.exit(0);

const plist = join(app, 'Contents', 'Info.plist');
for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
  execFileSync('plutil', ['-replace', key, '-string', 'Orbit', plist]);
}
const icon = join(import.meta.dirname, '..', 'resources', 'icon.icns');
if (existsSync(icon)) copyFileSync(icon, join(app, 'Contents', 'Resources', 'electron.icns'));

// Tell Launch Services the bundle changed, so the Dock picks up the new name and icon.
const lsregister =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
try {
  execFileSync(lsregister, ['-f', app]);
} catch {
  // Not fatal: macOS refreshes its cache on its own eventually.
}
process.stdout.write('dev-app-name: Electron.app now shows as Orbit\n');
