import { WifiOff } from 'lucide-react';
import { loadErrorText } from '@shared/load-error';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * A page that couldn't load (offline, unknown address, refused…): what happened in plain words
 * and what to do, in place of a blank page. Used by tabs and by the docked app panel.
 */
export function LoadErrorCard(props: {
  code: number;
  url: string;
  actions: { label: string; onClick: () => void; primary?: boolean; testId: string }[];
  compact?: boolean;
}) {
  const text = loadErrorText(props.code, hostOf(props.url));
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-2 px-6 text-center ${props.compact ? '' : 'pb-9'}`}
      role="alert"
      data-testid="load-error"
      data-code={props.code}
    >
      <span className="mb-1 grid size-11 place-items-center rounded-full bg-neutral-100 text-neutral-500">
        <WifiOff size={20} strokeWidth={1.8} />
      </span>
      <p className="text-[15px] font-semibold text-neutral-800">{text.title}</p>
      <p className="max-w-[340px] text-[13px] leading-5 text-neutral-500">{text.detail}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {props.actions.map((action) => (
          <button
            key={action.testId}
            type="button"
            onClick={action.onClick}
            className={
              action.primary
                ? 'press rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-on-accent hover:brightness-110'
                : 'press rounded-lg bg-neutral-100 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-200'
            }
            data-testid={action.testId}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
