import {
  ArrowLeftRight,
  Braces,
  Check,
  Contrast,
  ImageIcon,
  Paintbrush,
  Pipette,
  ScanSearch,
  TerminalSquare,
  Type,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { formats, grade, nearestPassing, parseColor, toHex } from '@shared/toolkit/color';
import type { Rgb } from '@shared/toolkit/color';
import { TOOLKIT_SECTIONS } from '@shared/toolkit/state';
import type { ToolkitSection, ToolkitState } from '@shared/toolkit/state';
import { CopyButton, Group, SmallButton } from './parts';
import { Tip } from '../../tooltip/Tip';
import { CssSection, DevSection, ImageSection } from './sections';
import { CodeSection, TypeSection } from './more-sections';
import { PaletteGroups } from './palette-sections';
import './toolkit.css';

const invoke = window.orbit.invoke;

const SECTIONS: Record<ToolkitSection, { label: string; icon: ReactNode }> = {
  colors: { label: 'Colors', icon: <Pipette size={14} /> },
  contrast: { label: 'Contrast', icon: <Contrast size={14} /> },
  image: { label: 'Image', icon: <ImageIcon size={14} /> },
  type: { label: 'Type', icon: <Type size={14} /> },
  css: { label: 'CSS', icon: <Paintbrush size={14} /> },
  code: { label: 'Code', icon: <Braces size={14} /> },
  dev: { label: 'Dev', icon: <TerminalSquare size={14} /> },
};

function useToolkit(): ToolkitState | null {
  const [state, setState] = useState<ToolkitState | null>(null);
  useEffect(() => {
    let live = true;
    const off = window.orbit.on('toolkit:update', (next) => setState(next));
    void invoke('toolkit:get', {}).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return state;
}

/** orbit://notes/panel/tools[/<section>]: small local tools for design and development. */
export function ToolkitView({ section }: { section: string }) {
  const state = useToolkit();
  const current: ToolkitSection = (TOOLKIT_SECTIONS as readonly string[]).includes(section)
    ? (section as ToolkitSection)
    : 'colors';
  return (
    <div className="toolkit flex min-h-0 flex-1 flex-col" data-testid="toolkit">
      <nav
        className="flex shrink-0 gap-1 px-3 pt-2.5 pb-1.5"
        aria-label="Toolkit"
        data-testid="toolkit-sections"
      >
        {TOOLKIT_SECTIONS.map((id) => {
          const on = id === current;
          return (
            <Tip key={id} label={SECTIONS[id].label}>
              <button
                type="button"
                aria-current={on ? 'page' : undefined}
                aria-label={SECTIONS[id].label}
                onClick={() => (window.location.hash = `#/notes/panel/tools/${id}`)}
                className={`press panel-tab flex h-8 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-medium ${
                  on
                    ? 'flex-1 bg-[var(--work-accent-soft)] text-[var(--work-accent-text)]'
                    : 'w-9 text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]'
                }`}
                data-testid="toolkit-section"
                data-section={id}
              >
                {SECTIONS[id].icon}
                {on && <span className="panel-tab-label">{SECTIONS[id].label}</span>}
              </button>
            </Tip>
          );
        })}
      </nav>
      {state && ['colors', 'type', 'dev'].includes(current) && (
        // What the page tools work on: the tab you're on (it follows as you switch tabs).
        <div
          className="mx-4 mb-1 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--note-muted)]"
          data-testid="toolkit-target"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-[var(--work-accent)]" aria-hidden />
          <span className="truncate">
            {state.page ? (
              <>
                Working on <span className="text-[var(--note-fg)]">{state.page.title}</span>
              </>
            ) : (
              'No page open — open a tab to use the page tools'
            )}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="toolkit-body">
        {state &&
          (current === 'colors' ? (
            <ColorsSection state={state} />
          ) : current === 'contrast' ? (
            <ContrastSection />
          ) : current === 'image' ? (
            <ImageSection state={state} />
          ) : current === 'css' ? (
            <CssSection />
          ) : current === 'type' ? (
            <TypeSection state={state} />
          ) : current === 'code' ? (
            <CodeSection />
          ) : (
            <DevSection state={state} />
          ))}
      </div>
    </div>
  );
}

function ColorsSection({ state }: { state: ToolkitState }) {
  const [text, setText] = useState(state.colors[0] ?? '#6d5dfc');
  const color = parseColor(text);
  return (
    <>
      <div className="mt-2 flex gap-2">
        <SmallButton
          primary
          onClick={() => void invoke('toolkit:pickColor', {})}
          testId="toolkit-pick"
        >
          <Pipette size={14} /> Pick from Page
        </SmallButton>
        <span className="self-center text-[11.5px] text-[var(--note-muted)]">⌃⇧C</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span
          className="checker size-14 shrink-0 rounded-[14px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
          style={{ '--swatch': color ? cssColor(color) : 'transparent' } as CSSProperties}
          data-testid="toolkit-swatch"
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          aria-label="Color"
          placeholder="#6d5dfc, rgb(…), hsl(…)"
          className={`h-9 min-w-0 flex-1 rounded-[10px] border bg-transparent px-3 font-mono text-[13px] outline-none focus:border-[var(--work-accent)] ${
            color ? 'border-[var(--work-border)]' : 'border-red-400'
          }`}
          data-testid="toolkit-color-input"
        />
      </div>
      {color && (
        <ul className="mt-3 divide-y divide-[var(--work-border)] rounded-[12px] border border-[var(--work-border)]">
          {formats(color).map((f) => (
            <li key={f.label} className="flex items-center gap-2 py-1 pr-1 pl-3">
              <span className="w-12 text-[11px] font-semibold text-[var(--note-muted)]">
                {f.label}
              </span>
              <code className="flex-1 truncate text-[12.5px]" data-testid="toolkit-format">
                {f.value}
              </code>
              <CopyButton text={f.value} />
            </li>
          ))}
        </ul>
      )}

      {color && <PaletteGroups base={color} onPick={setText} />}

      {state.colors.length > 0 && (
        <Group
          title="Picked"
          action={
            <button
              type="button"
              className="text-[11.5px] text-[var(--note-muted)] hover:text-[var(--note-fg)]"
              onClick={() => void invoke('toolkit:clearColors', {})}
              data-testid="toolkit-clear-colors"
            >
              Clear
            </button>
          }
        >
          <div className="flex flex-wrap gap-1.5" data-testid="toolkit-recent">
            {state.colors.map((c) => (
              <Swatch key={c} hex={c} onClick={() => setText(c)} />
            ))}
          </div>
        </Group>
      )}

      <Group
        title="Used on this page"
        action={
          <button
            type="button"
            className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--work-accent-text)] disabled:opacity-40"
            onClick={() => void invoke('toolkit:palette', {})}
            data-testid="toolkit-scan-palette"
          >
            <ScanSearch size={12} /> {state.palette ? 'Scan Again' : 'Scan Page'}
          </button>
        }
      >
        {state.palette ? (
          state.palette.swatches.length ? (
            <div className="grid grid-cols-6 gap-1.5" data-testid="toolkit-palette">
              {state.palette.swatches.map((s) => (
                <Swatch
                  key={s.hex}
                  hex={s.hex}
                  onClick={() => setText(s.hex)}
                  note={`${s.text ? 'Text' : ''}${s.text && s.background ? ' · ' : ''}${s.background ? 'Fill' : ''} · ${s.count}×`}
                  large
                />
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--note-muted)]">No colors found.</p>
          )
        ) : (
          <p className="text-[12.5px] text-[var(--note-muted)]">
            {state.page ? 'See the colors this page uses, most used first.' : 'Open a page first.'}
          </p>
        )}
      </Group>
    </>
  );
}

function Swatch(props: { hex: string; onClick: () => void; note?: string; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.note ? `${props.hex} — ${props.note}` : props.hex}
      aria-label={props.hex}
      className={`press swatch rounded-[9px] transition-transform hover:scale-110 ${
        props.large ? 'aspect-square w-full' : 'size-7'
      }`}
      style={{ background: props.hex }}
      data-testid="toolkit-swatch-button"
      data-hex={props.hex}
    />
  );
}

const cssColor = (c: Rgb) => `rgb(${c.r} ${c.g} ${c.b} / ${c.a})`;

function ContrastSection() {
  const [fg, setFg] = useState('#6e6e73');
  const [bg, setBg] = useState('#ffffff');
  const text = parseColor(fg);
  const back = parseColor(bg);
  const result = text && back ? grade(text, back) : null;
  const fix = text && back && result && !result.aa ? nearestPassing(text, back, 4.5) : null;
  const badge = (pass: boolean, label: string, testId: string) => (
    <span
      className={`grade flex items-center justify-between rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium ${
        pass ? 'grade-pass' : 'grade-fail'
      }`}
      data-testid={testId}
      data-pass={pass}
    >
      {label}
      {pass ? <Check size={13} /> : <X size={13} />}
    </span>
  );
  return (
    <>
      <div className="mt-2 flex items-end gap-2">
        <ColorField label="Text" value={fg} onChange={setFg} testId="contrast-fg" />
        <button
          type="button"
          className="press mb-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] text-[var(--note-muted)] hover:bg-[var(--note-hover)]"
          onClick={() => {
            setFg(bg);
            setBg(fg);
          }}
          aria-label="Swap colors"
          title="Swap"
          data-testid="contrast-swap"
        >
          <ArrowLeftRight size={15} />
        </button>
        <ColorField label="Background" value={bg} onChange={setBg} testId="contrast-bg" />
      </div>
      {result && text && back && (
        <>
          <div
            className="mt-4 rounded-[14px] border border-[var(--work-border)] p-4"
            style={{ background: cssColor(back), color: cssColor(text) }}
            data-testid="contrast-preview"
          >
            <p className="text-[24px] leading-tight font-bold">Large text</p>
            <p className="mt-1 text-[14px]">Body text reads like this, at 14 pixels.</p>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[30px] font-bold tabular-nums" data-testid="contrast-ratio">
              {result.ratio.toFixed(2)}:1
            </span>
            <span className="text-[12px] text-[var(--note-muted)]">WCAG 2.x contrast</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {badge(result.aa, 'AA body', 'contrast-aa')}
            {badge(result.aaa, 'AAA body', 'contrast-aaa')}
            {badge(result.aaLarge, 'AA large', 'contrast-aa-large')}
            {badge(result.aaaLarge, 'AAA large', 'contrast-aaa-large')}
          </div>
          {fix && (
            <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-[var(--work-card)] p-2.5 text-[12.5px]">
              <span
                className="size-6 shrink-0 rounded-[7px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
                style={{ background: toHex(fix) }}
              />
              <span className="flex-1">
                Nearest text color that passes AA: <code>{toHex(fix)}</code>
              </span>
              <SmallButton onClick={() => setFg(toHex(fix))} testId="contrast-fix">
                Use
              </SmallButton>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ColorField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  const parsed = parseColor(props.value);
  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-[11.5px] font-medium text-[var(--note-muted)]">
        {props.label}
      </span>
      <span
        className={`flex h-9 items-center gap-2 rounded-[10px] border px-1.5 focus-within:border-[var(--work-accent)] ${
          parsed ? 'border-[var(--work-border)]' : 'border-red-400'
        }`}
      >
        <input
          type="color"
          value={parsed ? toHex({ ...parsed, a: 1 }) : '#000000'}
          onChange={(e) => props.onChange(e.target.value)}
          className="size-6 shrink-0 cursor-pointer rounded-[6px] border-0 bg-transparent p-0"
          aria-label={`${props.label} color`}
        />
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none"
          aria-label={`${props.label} value`}
          data-testid={props.testId}
        />
      </span>
    </label>
  );
}
