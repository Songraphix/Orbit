import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createFakeArcFolder } from '../fixtures/fake-arc';
import { launchOrbit } from './launch-orbit';

test('File → Import from Arc previews, imports and switches to the imported space', async () => {
  const arcDir = createFakeArcFolder();
  process.env['ORBIT_ARC_DIR'] = arcDir; // launchOrbit passes the environment through
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    // Answer "Import" in the preview dialog, and remember what it said.
    await app.evaluate(({ dialog }) => {
      const g = globalThis as { previewDetail?: string };
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as { detail?: string };
        g.previewDetail = options.detail;
        return { response: 0, checkboxChecked: false };
      }) as never;
    });
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('import-arc')!.click(),
    );
    // The toast is brief, so check it first.
    await expect(win.getByTestId('toolbar-toast')).toContainText(
      'Imported 2 spaces, 2 favorites, 3 tabs',
    );

    await expect(win.getByTestId('space-name')).toHaveText('silence');
    await expect(win.getByTestId('space-button')).toHaveCount(3); // Personal + 2 imported
    await expect(win.getByTestId('favorite-tile')).toHaveCount(2);
    await expect(win.getByTestId('folder-row')).toHaveText('The Wood');
    const detail = await app.evaluate(
      () => (globalThis as { previewDetail?: string }).previewDetail,
    );
    expect(detail).toContain('2 spaces (silence, Work)');

    // Running it again changes nothing.
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('import-arc')!.click(),
    );
    await expect(win.getByTestId('toolbar-toast')).toContainText('Already imported');
    await expect(win.getByTestId('space-button')).toHaveCount(3);
  } finally {
    await orbit.close();
    delete process.env['ORBIT_ARC_DIR'];
    rmSync(arcDir, { recursive: true, force: true });
  }
});
