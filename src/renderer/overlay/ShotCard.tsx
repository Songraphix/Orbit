import { Copy, Download, FolderDown, PenTool, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { OverlayState } from '@shared/types/command-bar';
import { Glass } from './Glass';

type Shot = NonNullable<OverlayState['shot']>;
type Action = 'copy' | 'save' | 'saveAs' | 'easel' | 'dismiss';
const act = (action: Action) => void window.orbit.invoke('shot:action', { action });

/**
 * After a screenshot (owner request): a card under the toolbar's right side with the picture
 * and what to do with it — Copy, Save to Library, Save As…, or Open in Easel to mark it up.
 * Esc or × lets it go (nothing is kept). ⌘C copies, ⌘S saves.
 */
export function ShotCard({ shot }: { shot: Shot }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') act('dismiss');
      else if (e.metaKey && e.key.toLowerCase() === 'c') act('copy');
      else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') act('saveAs');
      else if (e.metaKey && e.key.toLowerCase() === 's') act('save');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const width = 300;
  return (
    <div
      className="fixed inset-0"
      onMouseDown={(e) => e.target === e.currentTarget && act('dismiss')}
      data-testid="shot-backdrop"
    >
      <Glass
        className="animate-pop absolute rounded-[20px] p-2.5 text-white"
        style={{ left: shot.anchor.x - width - 12, top: shot.anchor.y + 12, width }}
        role="dialog"
        aria-label="Screenshot"
        data-testid="shot-card"
      >
        <div className="flex items-center gap-2 px-1 pb-2">
          <span className="flex-1 text-[13px] font-semibold">Screenshot</span>
          <span className="text-[11.5px] text-white/50 tabular-nums" data-testid="shot-size">
            {shot.width} × {shot.height}
          </span>
          <button
            type="button"
            aria-label="Discard"
            title="Discard (Esc)"
            onClick={() => act('dismiss')}
            className="press grid size-6 place-items-center rounded-[8px] text-white/55 hover:bg-white/10 hover:text-white"
            data-testid="shot-dismiss"
          >
            <X size={14} />
          </button>
        </div>
        <img
          src={shot.preview}
          alt="The screenshot"
          className="max-h-[180px] w-full rounded-[12px] bg-black/30 object-contain shadow-[0_0_0_0.5px_rgb(255_255_255/0.15)]"
          data-testid="shot-preview"
        />
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <ShotButton onClick={() => act('copy')} keys="⌘C" testId="shot-copy" primary>
            <Copy size={14} /> Copy
          </ShotButton>
          <ShotButton onClick={() => act('save')} keys="⌘S" testId="shot-save">
            <FolderDown size={14} /> Save to Library
          </ShotButton>
          <ShotButton onClick={() => act('saveAs')} keys="⇧⌘S" testId="shot-save-as">
            <Download size={14} /> Save As…
          </ShotButton>
          <ShotButton onClick={() => act('easel')} testId="shot-easel">
            <PenTool size={14} /> Open in Easel
          </ShotButton>
        </div>
      </Glass>
    </div>
  );
}

function ShotButton(props: {
  onClick: () => void;
  children: ReactNode;
  testId: string;
  keys?: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.keys}
      className={`press flex h-9 items-center justify-center gap-1.5 rounded-[11px] text-[12.5px] font-medium ${
        props.primary
          ? 'bg-[var(--accent-fill,#2f7d75)] text-white hover:brightness-110'
          : 'bg-white/[0.09] hover:bg-white/[0.16]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
