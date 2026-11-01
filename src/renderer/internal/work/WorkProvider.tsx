import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Capture } from '@shared/capture';
import type { Project, WorkData } from '@shared/work';
import { messageOf, WorkContext } from './context';
import type { TaskDraft, Work } from './context';
import { ProjectForm, TaskForm } from './forms';
import { CaptureSheet } from './research';

/**
 * Projects and tasks for the whole productivity panel: one copy of the data (main answers every
 * change with all of it), the project and task forms, and the little confirmation toast.
 */
export function WorkProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkData | null>(null);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [projectForm, setProjectForm] = useState<{ project?: Project } | null>(null);
  const [taskForm, setTaskForm] = useState<TaskDraft | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const load = () =>
      void window.orbit.invoke('work:get', {}).then((next) => live && setData(next));
    load();
    // Another window's panel may have changed something; main nudges after a capture.
    window.addEventListener('focus', load);
    window.addEventListener('orbit-work-changed', load);
    return () => {
      live = false;
      window.removeEventListener('focus', load);
      window.removeEventListener('orbit-work-changed', load);
    };
  }, []);

  const flash = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    setToast({ text, at: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const run = useCallback(
    async <T,>(change: Promise<T>, done?: string): Promise<T | null> => {
      try {
        const result = await change;
        if (done) flash(done);
        return result;
      } catch (e) {
        flash(messageOf(e));
        return null;
      }
    },
    [flash],
  );

  const work = useMemo<Work>(
    () => ({
      data,
      set: setData,
      run,
      flash,
      editProject: (project) => setProjectForm({ ...(project ? { project } : {}) }),
      editTask: (draft) => {
        setCapture(null); // a finding's sheet gives way to the task it becomes
        setTaskForm(draft);
      },
      openCapture: setCapture,
    }),
    [data, run, flash],
  );

  return (
    <WorkContext.Provider value={work}>
      {children}
      {projectForm && (
        <ProjectForm
          key={projectForm.project?.id ?? 'new'}
          {...projectForm}
          onClose={() => setProjectForm(null)}
        />
      )}
      {capture && (
        <CaptureSheet key={capture.id} capture={capture} onClose={() => setCapture(null)} />
      )}
      {taskForm && <TaskForm draft={taskForm} onClose={() => setTaskForm(null)} />}
      {toast && (
        <div
          key={toast.at}
          role="status"
          className="animate-rise pointer-events-none absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--note-fg)] px-4 py-2 text-[12.5px] font-medium whitespace-nowrap text-[var(--note-bg)] shadow-lg"
          data-testid="work-toast"
        >
          {toast.text}
        </div>
      )}
    </WorkContext.Provider>
  );
}
