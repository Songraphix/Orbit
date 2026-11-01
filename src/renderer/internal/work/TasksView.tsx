import { CalendarCheck, ListChecks, Plus } from 'lucide-react';
import { useState } from 'react';
import { dateKey, filterTasks, taskCounts } from '@shared/work';
import type { TaskFilter } from '@shared/work';
import { useWork } from './context';
import { Empty, FilterPills, PrimaryButton, ViewHeader } from './parts';
import { TaskRow } from './TaskRow';

const EMPTY: Record<TaskFilter, { title: string; hint: string }> = {
  all: { title: 'No tasks yet', hint: 'Add one here, or inside a project.' },
  today: { title: 'Nothing due today', hint: 'Tasks due today, or overdue, show here.' },
  upcoming: { title: 'Nothing coming up', hint: 'Open tasks with a later due date show here.' },
  completed: { title: 'Nothing completed yet', hint: 'Tick a task off and it lands here.' },
};

/** The Tasks tab: every task across projects, by All / Today / Upcoming / Completed. */
export function TasksView() {
  const work = useWork();
  const [filter, setFilter] = useState<TaskFilter>('all');
  if (!work.data) return null;
  const today = dateKey(new Date());
  const { tasks, projects } = work.data;
  const counts = taskCounts(tasks, today);
  const shown = filterTasks(tasks, filter, today);
  const projectOf = (id: string | null) => projects.find((p) => p.id === id) ?? null;
  return (
    <section data-testid="tasks-view">
      <ViewHeader
        title="Tasks"
        action={
          <PrimaryButton onClick={() => work.editTask({ projectId: null })} testId="new-task">
            <Plus size={15} strokeWidth={2.4} />
            Add Task
          </PrimaryButton>
        }
      />
      <div className="px-4 pb-2">
        <FilterPills
          value={filter}
          onChange={setFilter}
          testId="task-filters"
          options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'today', label: 'Today', count: counts.today },
            { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
            { id: 'completed', label: 'Completed', count: counts.completed },
          ]}
        />
      </div>
      {shown.length > 0 ? (
        <ul className="flex flex-col px-2" data-testid="task-list">
          {shown.map((t) => (
            <TaskRow key={t.id} task={t} project={projectOf(t.projectId)} today={today} />
          ))}
        </ul>
      ) : (
        <Empty
          icon={
            filter === 'today' ? (
              <CalendarCheck size={30} strokeWidth={1.5} />
            ) : (
              <ListChecks size={30} strokeWidth={1.5} />
            )
          }
          title={EMPTY[filter].title}
          hint={EMPTY[filter].hint}
          action={
            filter === 'all' || filter === 'today'
              ? {
                  label: 'Add Task',
                  onClick: () => work.editTask({ projectId: null }),
                  testId: 'empty-add-task',
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
