import type { IpcRouter } from '../router';
import type { SettingsRepository } from '../../persistence/repositories/settings';
import type { VoiceService } from '../../voice/service';
import { VOICE_MODEL_BYTES } from '@shared/voice';

/**
 * Voice (roadmap R2 M2): the command bar's microphone and Settings → Voice, plus the hidden voice
 * page's two calls — which only that page may make.
 */
export function registerVoiceHandlers(
  router: IpcRouter,
  deps: {
    voice: VoiceService;
    isHost: (webContentsId: number) => boolean;
    readModelFile: (path: string) => Promise<Uint8Array>;
    removeModel: () => Promise<void>;
    modelReady: () => boolean;
    settings: SettingsRepository;
    openCommandBar: () => void;
    openMicSettings: () => void;
  },
): void {
  const { voice } = deps;
  const hostOnly = (webContentsId: number) => {
    if (!deps.isHost(webContentsId))
      throw new Error(`Sender ${webContentsId} is not the voice page`);
  };

  router.handle('voice:get', () => voice.state);
  router.handle('voice:toggle', async () => {
    deps.openCommandBar();
    await voice.toggle();
  });
  router.handle('voice:cancel', () => voice.cancel());
  router.handle('voice:download', () => {
    deps.openCommandBar();
    void voice.download();
  });
  router.handle('voice:micSettings', () => deps.openMicSettings());
  router.handle('voice:settings', () => ({
    prefs: deps.settings.get('voice.prefs'),
    modelReady: deps.modelReady(),
    modelBytes: VOICE_MODEL_BYTES,
    quiet: process.env['ORBIT_QUIET'] === '1',
  }));
  router.handle('voice:setPrefs', (patch) => {
    const next = { ...deps.settings.get('voice.prefs'), ...patch };
    deps.settings.set('voice.prefs', next);
    return next;
  });
  router.handle('voice:removeModel', () => deps.removeModel());

  router.handle('voice:hostEvent', (event, { sender }) => {
    hostOnly(sender.webContentsId);
    voice.onHostEvent(event);
  });
  router.handle('voice:modelFile', ({ path }, { sender }) => {
    hostOnly(sender.webContentsId);
    return deps.readModelFile(path);
  });
}
