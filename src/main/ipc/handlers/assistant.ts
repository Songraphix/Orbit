import type { IpcRouter } from '../router';
import type { AssistantService } from '../../ai/assistant';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/**
 * The assistant (roadmap P3.1–P3.4). Its page lives in a window's productivity panel, so every
 * call must come from that panel (and acts in its window); opening it may also come from the
 * shell (the toolbar's ✦ button).
 */
export function registerAssistantHandlers(
  router: IpcRouter,
  windows: WindowManager,
  assistant: AssistantService,
): void {
  const panelWindow = (webContentsId: number): WindowController => {
    const controller = windows.notesPanelFor(webContentsId);
    if (!controller) throw new Error('Not the productivity panel');
    return controller;
  };

  router.handle('assistant:open', ({ summarize }, { sender }) => {
    const controller =
      windows.forSender(sender.webContentsId) ?? windows.notesPanelFor(sender.webContentsId);
    if (!controller) throw new Error('No window for this sender');
    assistant.open(controller, { summarize: summarize === true });
  });
  router.handle('assistant:get', (_input, { sender }) =>
    assistant.state(panelWindow(sender.webContentsId)),
  );
  router.handle('assistant:ask', ({ text, action }, { sender }) => {
    void assistant.ask(panelWindow(sender.webContentsId), text, action);
  });
  router.handle('assistant:stop', (_input, { sender }) => {
    assistant.stop(panelWindow(sender.webContentsId));
  });
  router.handle('assistant:clear', (_input, { sender }) => {
    assistant.clear(panelWindow(sender.webContentsId));
  });
  router.handle('assistant:attach', (input, { sender }) => {
    const controller = panelWindow(sender.webContentsId);
    if (input.page !== undefined) assistant.setPageAttached(controller, input.page);
    if (input.selection === null) assistant.clearSelection(controller);
    if (input.research !== undefined) assistant.attachResearch(controller, input.research);
    if (input.tabs !== undefined) assistant.setTabs(controller, input.tabs);
    if (input.project !== undefined) assistant.setProject(controller, input.project);
    if (input.work !== undefined) assistant.setWork(controller, input.work);
  });
  router.handle('assistant:source', ({ messageId, n }, { sender }) =>
    assistant.showSource(panelWindow(sender.webContentsId), messageId, n),
  );
  router.handle('assistant:openLink', ({ messageId, index }, { sender }) =>
    assistant.openLink(panelWindow(sender.webContentsId), messageId, index),
  );
  router.handle('assistant:toNote', ({ messageId }, { sender }) => ({
    noteId: assistant.saveToNote(panelWindow(sender.webContentsId), messageId),
  }));
  router.handle('assistant:suggestTasks', ({ from }, { sender }) => {
    void assistant.suggestTasks(panelWindow(sender.webContentsId), from);
  });
  router.handle('assistant:addTasks', ({ projectId, tasks }, { sender }) => {
    assistant.addTasks(panelWindow(sender.webContentsId), projectId, tasks);
  });
  router.handle('assistant:dismissTasks', (_input, { sender }) => {
    assistant.dismissTasks(panelWindow(sender.webContentsId));
  });
}
