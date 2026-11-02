import {
  Columns2,
  ExternalLink,
  ImageIcon,
  MonitorSmartphone,
  PenTool,
  RefreshCw,
  RotateCcw,
  Server,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  DEFAULT_GRADIENT,
  DEFAULT_SHADOW,
  gradientCss,
  pxToRem,
  remToPx,
  shadowCss,
} from '@shared/toolkit/css';
import type { Gradient, Shadow } from '@shared/toolkit/css';
import { describeJson, formatJson } from '@shared/toolkit/json';
import type { JsonResult } from '@shared/toolkit/json';
import { VIEWPORT_PRESETS, presetName } from '@shared/toolkit/state';
import type { ToolkitState } from '@shared/toolkit/state';
import { CopyButton, Group, SmallButton } from './parts';

const invoke = window.orbit.invoke;

export function ImageSection({ state }: { state: ToolkitState }) {
  const image = state.image;
  return (
    <>
      {image ? (
        <div className="mt-2" data-testid="toolkit-image">
          {image.preview && (
            <div className="checker grid max-h-56 place-items-center overflow-hidden rounded-[14px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]">
              <img src={image.preview} alt={image.alt} className="max-h-56 object-contain" />
            </div>
          )}
          {image.error ? (
            <p
              className="mt-3 text-[12.5px] text-[#d70015]"
              role="alert"
              data-testid="toolkit-image-error"
            >
              {image.error}
            </p>
          ) : (
            <dl className="mt-3 divide-y divide-[var(--work-border)] rounded-[12px] border border-[var(--work-border)] text-[12.5px]">
              <Fact
                label="Format"
                value={image.type ? `${image.format} · ${image.type}` : image.format}
              />
              {image.width && image.height && (
                <Fact label="Dimensions" value={`${image.width} × ${image.height} px`} />
              )}
              {image.details.map((d) => (
                <Fact key={d.label} label={d.label} value={d.value} />
              ))}
              <Fact
                label="Alt text"
                value={image.alt || 'None — screen readers can’t describe it'}
              />
            </dl>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--note-muted)]"
              title={image.src}
            >
              {image.src.startsWith('data:') ? 'Embedded in the page' : image.src}
            </span>
            {!image.src.startsWith('data:') && <CopyButton text={image.src} label="Copy URL" />}
          </div>
        </div>
      ) : (
        <div
          className="mt-6 flex flex-col items-center gap-1.5 text-center"
          data-testid="toolkit-image-empty"
        >
          <ImageIcon size={22} className="text-[var(--work-accent-text)]" />
          <p className="text-[13.5px] font-semibold">Inspect an image</p>
          <p className="max-w-[240px] text-[12.5px] text-[var(--note-muted)]">
            Right-click any image on a page and choose Image Info… to see its format, size, camera
            details and alt text.
          </p>
        </div>
      )}
      <Group title="Annotate">
        <div className="flex items-center gap-3 rounded-[12px] border border-[var(--work-border)] bg-[var(--work-card)] p-3">
          <PenTool size={18} className="shrink-0 text-[var(--work-accent-text)]" />
          <p className="flex-1 text-[12.5px]">
            Drag over part of the page; it opens on a new Easel to draw arrows and notes on.
          </p>
          <SmallButton
            onClick={() => void invoke('toolkit:annotate', {})}
            testId="toolkit-annotate"
          >
            Capture
          </SmallButton>
        </div>
      </Group>
    </>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-3 py-1.5">
      <dt className="w-24 shrink-0 text-[var(--note-muted)]">{props.label}</dt>
      <dd className="min-w-0 flex-1 break-words" data-testid="toolkit-image-fact">
        {props.value}
      </dd>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  testId?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium text-[var(--note-muted)]">{props.label}</span>
      <span className="flex h-8 items-center rounded-[9px] border border-[var(--work-border)] px-2 focus-within:border-[var(--work-accent)]">
        <input
          type="number"
          value={Number.isFinite(props.value) ? props.value : ''}
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          onChange={(e) => props.onChange(Number(e.target.value))}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none"
          data-testid={props.testId}
        />
        {props.suffix && (
          <span className="text-[11px] text-[var(--note-muted)]">{props.suffix}</span>
        )}
      </span>
    </label>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="w-14 shrink-0 text-[var(--note-muted)]">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[var(--work-accent)]"
      />
      <span className="w-12 text-right font-mono tabular-nums">
        {props.value}
        {props.suffix ?? 'px'}
      </span>
    </label>
  );
}

function CodeLine({ code, testId }: { code: string; testId: string }) {
  return (
    <div className="mt-2 flex items-start gap-1 rounded-[10px] bg-[var(--work-card)] py-1 pr-1 pl-2.5">
      <code className="min-w-0 flex-1 py-1 text-[12px] break-all" data-testid={testId}>
        {code}
      </code>
      <CopyButton text={code} />
    </div>
  );
}

export function CssSection() {
  const [px, setPx] = useState(24);
  const [rem, setRem] = useState(1.5);
  const [base, setBase] = useState(16);
  const [shadow, setShadow] = useState<Shadow>(DEFAULT_SHADOW);
  const [gradient, setGradient] = useState<Gradient>(DEFAULT_GRADIENT);
  const patchShadow = (patch: Partial<Shadow>) => setShadow((s) => ({ ...s, ...patch }));
  const setStop = (i: number, color: string) =>
    setGradient((g) => ({ ...g, stops: g.stops.map((s, j) => (j === i ? { ...s, color } : s)) }));
  return (
    <>
      <Group title="Units">
        <div className="flex gap-2">
          <NumberField label="Pixels" value={px} onChange={setPx} suffix="px" testId="css-px" />
          <NumberField label="Root size" value={base} onChange={setBase} min={1} suffix="px" />
        </div>
        <p className="mt-1.5 font-mono text-[13px]" data-testid="css-rem">
          {px}px = {pxToRem(px, base || 16)}
        </p>
        <div className="mt-2 flex gap-2">
          <NumberField label="Rem" value={rem} onChange={setRem} step={0.125} suffix="rem" />
        </div>
        <p className="mt-1.5 font-mono text-[13px]">
          {rem}rem = {remToPx(rem, base || 16)}
        </p>
      </Group>

      <Group title="Shadow">
        <div className="canvas-light grid h-28 place-items-center rounded-[14px]">
          <div
            className="size-16 rounded-[14px] bg-white"
            style={{ boxShadow: shadowCss(shadow) }}
          />
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Slider
            label="X"
            value={shadow.x}
            min={-50}
            max={50}
            onChange={(x) => patchShadow({ x })}
          />
          <Slider
            label="Y"
            value={shadow.y}
            min={-50}
            max={50}
            onChange={(y) => patchShadow({ y })}
          />
          <Slider
            label="Blur"
            value={shadow.blur}
            min={0}
            max={100}
            onChange={(blur) => patchShadow({ blur })}
          />
          <Slider
            label="Spread"
            value={shadow.spread}
            min={-50}
            max={50}
            onChange={(spread) => patchShadow({ spread })}
          />
          <Slider
            label="Opacity"
            value={shadow.opacity}
            min={0}
            max={100}
            suffix="%"
            onChange={(opacity) => patchShadow({ opacity })}
          />
          <div className="flex items-center gap-3 text-[12px]">
            <span className="w-14 shrink-0 text-[var(--note-muted)]">Color</span>
            <input
              type="color"
              value={shadow.color}
              onChange={(e) => patchShadow({ color: e.target.value })}
              className="size-6 cursor-pointer rounded-[6px] border-0 bg-transparent p-0"
              aria-label="Shadow color"
            />
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={shadow.inset}
                onChange={(e) => patchShadow({ inset: e.target.checked })}
                className="accent-[var(--work-accent)]"
              />
              Inset
            </label>
          </div>
        </div>
        <CodeLine code={`box-shadow: ${shadowCss(shadow)};`} testId="css-shadow" />
      </Group>

      <Group title="Gradient">
        <div className="h-24 rounded-[14px]" style={{ background: gradientCss(gradient) }} />
        <div className="mt-3 flex items-center gap-2 text-[12px]">
          {gradient.stops.map((stop, i) => (
            <input
              key={i}
              type="color"
              value={stop.color}
              onChange={(e) => setStop(i, e.target.value)}
              className="size-7 cursor-pointer rounded-[7px] border-0 bg-transparent p-0"
              aria-label={`Color ${i + 1}`}
            />
          ))}
          <span className="flex-1" />
          <button
            type="button"
            className={`rounded-full px-2 py-0.5 ${gradient.kind === 'linear' ? 'bg-[var(--work-accent-soft)] text-[var(--work-accent-text)]' : 'text-[var(--note-muted)]'}`}
            onClick={() => setGradient((g) => ({ ...g, kind: 'linear' }))}
          >
            Linear
          </button>
          <button
            type="button"
            className={`rounded-full px-2 py-0.5 ${gradient.kind === 'radial' ? 'bg-[var(--work-accent-soft)] text-[var(--work-accent-text)]' : 'text-[var(--note-muted)]'}`}
            onClick={() => setGradient((g) => ({ ...g, kind: 'radial' }))}
          >
            Radial
          </button>
        </div>
        {gradient.kind === 'linear' && (
          <div className="mt-2">
            <Slider
              label="Angle"
              value={gradient.angle}
              min={0}
              max={360}
              suffix="°"
              onChange={(angle) => setGradient((g) => ({ ...g, angle }))}
            />
          </div>
        )}
        <CodeLine code={`background: ${gradientCss(gradient)};`} testId="css-gradient" />
      </Group>
    </>
  );
}

export function JsonSection() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<JsonResult | null>(null);
  const run = (mode: 'pretty' | 'minify' | 'sort') => setResult(formatJson(input, mode));
  return (
    <>
      <textarea
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setResult(null);
        }}
        spellCheck={false}
        placeholder='Paste JSON — {"like": "this"}'
        className="mt-2 h-36 w-full resize-y rounded-[12px] border border-[var(--work-border)] bg-[var(--work-card)] p-2.5 font-mono text-[12px] outline-none focus:border-[var(--work-accent)]"
        aria-label="JSON"
        data-testid="json-input"
      />
      <div className="mt-2 flex gap-1.5">
        <SmallButton
          primary
          onClick={() => run('pretty')}
          disabled={!input.trim()}
          testId="json-format"
        >
          Format
        </SmallButton>
        <SmallButton onClick={() => run('minify')} disabled={!input.trim()} testId="json-minify">
          Minify
        </SmallButton>
        <SmallButton onClick={() => run('sort')} disabled={!input.trim()} testId="json-sort">
          Sort Keys
        </SmallButton>
      </div>
      {result &&
        (result.ok ? (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2 text-[11.5px] text-[var(--note-muted)]">
              <span className="flex-1" data-testid="json-summary">
                Valid · {describeJson(result.value)}
              </span>
              <CopyButton text={result.text} label="Copy" testId="json-copy" />
            </div>
            <pre
              className="max-h-80 overflow-auto rounded-[12px] bg-[var(--work-card)] p-2.5 text-[12px] leading-[1.5]"
              data-testid="json-output"
            >
              {result.text}
            </pre>
          </div>
        ) : (
          <p
            className="mt-3 rounded-[10px] bg-[rgb(255_59_48/0.1)] px-3 py-2 text-[12.5px] text-[#d70015]"
            role="alert"
            data-testid="json-error"
          >
            {result.line !== null ? `Line ${result.line}, column ${result.column}: ` : ''}
            {result.error}
          </p>
        ))}
      <p className="mt-4 text-[12px] text-[var(--note-muted)]">
        Addresses that answer with JSON open as a tree you can fold, with Raw and Copy.
      </p>
    </>
  );
}

export function DevSection({ state }: { state: ToolkitState }) {
  const viewport = state.page?.viewport ?? null;
  const [scanning, setScanning] = useState(false);
  const scan = () => {
    setScanning(true);
    void invoke('toolkit:servers', {}).finally(() => setScanning(false));
  };
  return (
    <>
      <Group
        title="Responsive design"
        action={
          viewport && (
            <button
              type="button"
              className="text-[11.5px] font-medium text-[var(--work-accent-text)]"
              onClick={() => void invoke('toolkit:viewport', { viewport: null })}
              data-testid="toolkit-viewport-off"
            >
              Turn Off
            </button>
          )
        }
      >
        {state.page?.web ? (
          <div className="grid grid-cols-2 gap-1.5" data-testid="toolkit-presets">
            {VIEWPORT_PRESETS.map((p) => {
              const on =
                viewport !== null &&
                presetName(viewport) === p.name &&
                (viewport.width === p.width || viewport.width === p.height);
              return (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    void invoke('toolkit:viewport', {
                      viewport: { width: p.width, height: p.height, mobile: p.mobile },
                    })
                  }
                  className={`press flex flex-col items-start rounded-[11px] border px-2.5 py-2 text-left ${
                    on
                      ? 'border-[var(--work-accent)] bg-[var(--work-accent-soft)]'
                      : 'border-[var(--work-border)] bg-[var(--work-card)] hover:bg-[var(--note-hover)]'
                  }`}
                  data-testid="toolkit-preset"
                  data-name={p.name}
                >
                  <span className="text-[12.5px] font-medium">{p.name}</span>
                  <span className="font-mono text-[11px] text-[var(--note-muted)]">
                    {p.width} × {p.height}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Hint icon={<MonitorSmartphone size={16} />}>
            Open a web page to see it at a device’s size.
          </Hint>
        )}
        {viewport && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--note-muted)]">
            <span className="flex-1">
              Showing at {viewport.width} × {viewport.height}
            </span>
            <button
              type="button"
              className="flex items-center gap-1 hover:text-[var(--note-fg)]"
              onClick={() =>
                void invoke('toolkit:viewport', {
                  viewport: { ...viewport, width: viewport.height, height: viewport.width },
                })
              }
              data-testid="toolkit-rotate"
            >
              <RotateCcw size={12} /> Rotate
            </button>
          </div>
        )}
      </Group>

      <Group
        title="Local servers"
        action={
          <button
            type="button"
            className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--work-accent-text)]"
            onClick={scan}
            data-testid="toolkit-scan-servers"
          >
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
            {state.servers ? 'Scan Again' : 'Scan'}
          </button>
        }
      >
        {state.servers === null ? (
          <Hint icon={<Server size={16} />}>
            Find development servers running on this Mac (Vite, Next, Storybook…). Type “localhost”
            in ⌘T to jump to one.
          </Hint>
        ) : state.servers.length === 0 ? (
          <Hint icon={<Server size={16} />}>No local servers on the usual ports.</Hint>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="toolkit-servers">
            {state.servers.map((server) => (
              <li
                key={server.port}
                className="flex items-center gap-2 rounded-[11px] border border-[var(--work-border)] bg-[var(--work-card)] py-1.5 pr-1 pl-3"
                data-testid="toolkit-server"
              >
                <span className="size-2 shrink-0 rounded-full bg-[#34c759]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{server.title}</span>
                  <span className="font-mono text-[11px] text-[var(--note-muted)]">
                    localhost:{server.port}
                  </span>
                </span>
                <IconAction
                  label="Open in Split View"
                  onClick={() => void invoke('toolkit:split', { url: server.url })}
                >
                  <Columns2 size={14} />
                </IconAction>
                <IconAction
                  label="Open"
                  onClick={() => void invoke('notes:openUrl', { url: server.url })}
                >
                  <ExternalLink size={14} />
                </IconAction>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  );
}

function IconAction(props: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="press grid size-7 place-items-center rounded-[8px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
      aria-label={props.label}
      title={props.label}
    >
      {props.children}
    </button>
  );
}

function Hint(props: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-[12px] bg-[var(--work-card)] p-3 text-[12.5px] text-[var(--note-muted)]">
      <span className="shrink-0 text-[var(--work-accent-text)]">{props.icon}</span>
      <span>{props.children}</span>
    </p>
  );
}
