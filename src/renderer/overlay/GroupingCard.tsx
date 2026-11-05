import { ChevronRight, Folder, Globe, Sparkle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { OverlayState } from '@shared/types/command-bar';
import { Glass } from './Glass';

type Grouping = NonNullable<OverlayState['grouping']>;
type Draft = {
  key: string;
  name: string;
  reason: 'site' | 'topic';
  include: boolean;
  /** Tabs left out of this folder (they stay loose). */
  out: Set<string>;
  /** Merged into another folder (its key). */
  into: string | null;
};

const close = () => void window.orbit.invoke('grouping:dismiss', {});

/**
 * Group Tabs (roadmap R2 M4): the folders Orbit proposes for Today's loose tabs — by site, then
 * by the words their titles share. Nothing moves until Group Tabs; each folder can be left out,
 * renamed, merged into another, or have tabs taken out. Undo (in the sidebar) puts it all back.
 */
export function GroupingCard({ grouping }: { grouping: Grouping }) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    grouping.groups.map((g) => ({
      key: g.key,
      name: g.name,
      reason: g.reason,
      include: true,
      out: new Set(),
      into: null,
    })),
  );
  const [open, setOpen] = useState<string | null>(null);
  const set = (key: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  /** What Group Tabs makes: each kept folder with its tabs and those merged into it. */
  const result = useMemo(() => {
    const tabsOf = (key: string) => {
      const draft = drafts.find((d) => d.key === key)!;
      return grouping.groups
        .find((g) => g.key === key)!
        .tabs.filter((t) => !draft.out.has(t.id))
        .map((t) => t.id);
    };
    return drafts
      .filter((d) => d.include && !d.into)
      .map((d) => ({
        name: d.name,
        tabIds: [
          ...tabsOf(d.key),
          ...drafts.filter((m) => m.include && m.into === d.key).flatMap((m) => tabsOf(m.key)),
        ],
      }))
      .filter((g) => g.tabIds.length >= 2);
  }, [drafts, grouping.groups]);
  const moved = result.reduce((n, g) => n + g.tabIds.length, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const apply = () => {
    if (result.length) void window.orbit.invoke('grouping:apply', { groups: result });
  };

  return (
    <div
      className="fixed inset-0 flex justify-center bg-black/[0.14] pt-[12vh] animate-[orbit-fade-in_160ms_var(--ease-out)]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="grouping-backdrop"
    >
      <Glass
        className="animate-pop flex h-fit max-h-[72vh] w-[min(560px,90vw)] flex-col rounded-[22px]"
        role="dialog"
        aria-label="Group tabs"
        data-testid="grouping-card"
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/[0.1]">
            <Folder size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">Group tabs into folders</h2>
            <p className="text-[12.5px] leading-5 text-white/60">
              By site, then by what their titles share. Leave a folder out, rename it, merge it, or
              take tabs out — nothing moves until you group them.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="grid size-7 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/[0.1] hover:text-white"
          >
            <X size={15} />
          </button>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.08] px-3 py-2">
          {drafts.map((d) => {
            const group = grouping.groups.find((g) => g.key === d.key)!;
            const count = group.tabs.length - d.out.size;
            const targets = drafts.filter((t) => t.key !== d.key && t.include && !t.into);
            return (
              <li
                key={d.key}
                className={`rounded-[12px] px-2 py-1.5 ${d.include ? '' : 'opacity-45'}`}
                data-testid="grouping-group"
                data-included={d.include}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => set(d.key, { include: e.target.checked })}
                    aria-label={`Make the folder ${d.name}`}
                    className="size-4 shrink-0 accent-[var(--accent)]"
                    data-testid="grouping-include"
                  />
                  <button
                    type="button"
                    aria-label={open === d.key ? 'Hide tabs' : 'Show tabs'}
                    aria-expanded={open === d.key}
                    onClick={() => setOpen(open === d.key ? null : d.key)}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/[0.08]"
                    data-testid="grouping-expand"
                  >
                    <ChevronRight
                      size={14}
                      className={`transition-transform ${open === d.key ? 'rotate-90' : ''}`}
                    />
                  </button>
                  <input
                    value={d.name}
                    onChange={(e) => set(d.key, { name: e.target.value })}
                    aria-label="Folder name"
                    className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-[14px] font-medium outline-none focus:bg-white/[0.08]"
                    data-testid="grouping-name"
                  />
                  <span
                    className="shrink-0 text-[12px] text-white/45"
                    title={d.reason === 'site' ? 'Same site' : 'Shared words in their titles'}
                  >
                    {d.reason === 'site' ? (
                      <Globe size={11} className="mr-1 inline" />
                    ) : (
                      <Sparkle size={11} className="mr-1 inline" />
                    )}
                    {count} tabs
                  </span>
                  <select
                    value={d.into ?? ''}
                    onChange={(e) => set(d.key, { into: e.target.value || null })}
                    disabled={!d.include}
                    aria-label={`Merge ${d.name} into`}
                    className="h-7 max-w-[130px] shrink-0 rounded-lg bg-white/[0.08] px-1.5 text-[12px] text-white/80 outline-none"
                    data-testid="grouping-merge"
                  >
                    <option value="">Own folder</option>
                    {targets.map((t) => (
                      <option key={t.key} value={t.key}>
                        Into {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                {open === d.key && (
                  <ul className="mt-1 mb-1 ml-14 flex flex-col gap-0.5">
                    {group.tabs.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-2 text-[12.5px] text-white/80"
                      >
                        <input
                          type="checkbox"
                          checked={!d.out.has(t.id)}
                          onChange={(e) => {
                            const out = new Set(d.out);
                            if (e.target.checked) out.delete(t.id);
                            else out.add(t.id);
                            set(d.key, { out });
                          }}
                          aria-label={`Keep ${t.title} in this folder`}
                          className="size-3.5 shrink-0 accent-[var(--accent)]"
                          data-testid="grouping-tab"
                        />
                        {t.favicon ? (
                          <img src={t.favicon} alt="" className="size-3.5 shrink-0 rounded-[3px]" />
                        ) : (
                          <Globe size={13} className="shrink-0 opacity-50" />
                        )}
                        <span className="min-w-0 truncate">{t.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <footer className="flex items-center gap-2 border-t border-white/[0.08] px-5 py-3">
          <span
            className="min-w-0 flex-1 text-[12.5px] text-white/55"
            data-testid="grouping-summary"
          >
            {result.length
              ? `${result.length} folder${result.length === 1 ? '' : 's'}, ${moved} of ${grouping.loose} tabs · Undo in the sidebar`
              : 'Nothing to group'}
          </span>
          <button
            type="button"
            onClick={close}
            className="press h-8 rounded-lg bg-white/[0.08] px-3 text-[13px] font-medium text-white/85 hover:bg-white/[0.14]"
            data-testid="grouping-cancel"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!result.length}
            className="press h-8 rounded-lg bg-[var(--accent)] px-3 text-[13px] font-medium text-on-accent hover:brightness-110 disabled:opacity-40"
            data-testid="grouping-apply"
          >
            Group Tabs
          </button>
        </footer>
      </Glass>
    </div>
  );
}
