// Development only: `npm run dev` runs inside node_modules' stock Electron.app, so macOS shows
// "Electron" in the Dock, the menu bar and ⌘-Tab. This names that bundle "Orbit" and gives it
// Orbit's icon (the packaged app is named by electron-builder). Runs after `npm install`.
// The stock bundle is only linker-signed, so its Info.plist isn't sealed and stays valid.
//
// Finder and the Dock show a bundle's folder name unless it matches CFBundleName, so the folder
// is renamed too (Electron.app → Orbit.app) and Electron's path.txt points at it. Reinstalling
// Electron replaces its folder with a fresh Electron.app; this script then runs again.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const electron = join(import.meta.dirname, '..', 'node_modules', 'electron');
const stock = join(electron, 'dist', 'Electron.app');
const app = join(electron, 'dist', 'Orbit.app');
if (process.platform !== 'darwin') process.exit(0);
if (existsSync(stock)) {
  if (existsSync(app)) execFileSync('rm', ['-rf', app]); // a stale copy from an older Electron
  renameSync(stock, app);
}
if (!existsSync(app)) process.exit(0);
writeFileSync(join(electron, 'path.txt'), 'Orbit.app/Contents/MacOS/Electron');

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
process.stdout.write('dev-app-name: the development app is Orbit.app\n');
