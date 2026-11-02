import { createContext, useContext } from 'react';
import type { Capture } from '@shared/capture';
import type { Project, Task, WorkData } from '@shared/work';

/** What a task form starts from: a task to edit, or a new one (perhaps in a project, perhaps
 *  made from a finding — then it starts filled in, and they're linked). */
export type TaskDraft =
  | { task: Task }
  | {
      projectId: string | null;
      prefill?: { title: string; description: string };
      captureId?: string;
    };

export type Work = {
  data: WorkData | null;
  /** Replaces the data with main's answer (every change returns all of it). */
  set: (data: WorkData) => void;
  /** Runs a change; shows `done` on success, or the error. Resolves to null on failure. */
  run: <T>(change: Promise<T>, done?: string) => Promise<T | null>;
  flash: (message: string) => void;
  editProject: (project?: Project) => void;
  editTask: (draft: TaskDraft) => void;
  /** A finding's own sheet: all of it, its source, its project, its actions. */
  openCapture: (capture: Capture) => void;
};

export const WorkContext = createContext<Work | null>(null);

export function useWork(): Work {
  const work = useContext(WorkContext);
  if (!work) throw new Error('useWork outside the productivity panel');
  return work;
}

/** Main's error text without Electron's "Error invoking remote method…" prefix. */
export const messageOf = (e: unknown) =>
  (e instanceof Error ? e.message : String(e))
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^(Work)?Error: /, '');

/** The panel's views live in its hash: #/notes/panel[/<note>|/projects[/<id>]|/tasks|/board]. */
export const showProject = (id: string | null) => {
  window.location.hash = id ? `#/notes/panel/projects/${id}` : '#/notes/panel/projects';
};
export const showPanelView = (
  view: 'notes' | 'projects' | 'tasks' | 'board' | 'assistant' | 'tools' | 'focus',
) => {
  window.location.hash = view === 'notes' ? '#/notes/panel' : `#/notes/panel/${view}`;
};
export const showResearch = (filter: string) => {
  window.location.hash = filter ? `#/notes/panel/research/${filter}` : '#/notes/panel/research';
};
