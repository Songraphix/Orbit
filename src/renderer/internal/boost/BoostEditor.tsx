import { Globe, RotateCw, Trash2, Wand2, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Boost, BoostColor, BoostPatch } from '@shared/types/boosts';
import { CodeEditor } from './CodeEditor';

const DEFAULT_COLOR: BoostColor = { hue: 0, saturation: 100, brightness: 100, dark: false };

/** Swatches set the hue; the page's own colours rotate towards them. */
const SWATCHES: { label: string; hue: number; color: string }[] = [
  { label: 'Original', hue: 0, color: 'conic-gradient(#f66, #fd5, #6d6, #5cf, #a7f, #f66)' },
  { label: 'Warm', hue: -40, color: '#f08a5d' },
  { label: 'Gold', hue: 40, color: '#e9c46a' },
  { label: 'Green', hue: 100, color: '#52b788' },
  { label: 'Teal', hue: 150, color: '#2a9d8f' },
  { label: 'Blue', hue: -150, color: '#4d7cfe' },
  { label: 'Purple', hue: -100, color: '#9b5de5' },
  { label: 'Pink', hue: -60, color: '#f15bb5' },
];

const FONTS = [
  'Avenir Next',
  'Helvetica Neue',
  'SF Pro Rounded',
  'Futura',
  'Gill Sans',
  'Optima',
  'Georgia',
  'Iowan Old Style',
  'Charter',
  'Palatino',
  'Baskerville',
  'American Typewriter',
  'Menlo',
];
const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/;

/**
 * orbit://boost/<id> (F-18): a Boost's colours, font, zapped elements, CSS and JS. Every change
 * is saved and applied to matching pages straight away (the page sits beside it in split view).
 */
export function BoostEditor({ id }: { id: string }) {
  const [boost, setBoost] = useState<Boost | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<'css' | 'js'>('css');
  const pending = useRef<BoostPatch>({});
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    if (Object.keys(pending.current).length > 0) return; // don't clobber unsaved edits
    void window.orbit.invoke('boosts:get', { id }).then(setBoost);
  }, [id]);

  useEffect(() => {
    load();
    // Toggles from site controls (and zaps) change the Boost elsewhere.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  useEffect(() => {
    if (boost) document.title = boost.name;
  }, [boost]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    const result = await window.orbit.invoke('boosts:update', { id, patch });
    setError(result.error);
    if (result.boost && patch.domain !== undefined) {
      const domain = result.boost.domain;
      setBoost((b) => b && { ...b, domain });
    }
  }, [id]);

  /** Shows the change now and saves it shortly after (typing in the editors is debounced). */
  const save = useCallback(
    (patch: BoostPatch, delay = 200) => {
      setBoost((b) => b && { ...b, ...patch });
      pending.current = { ...pending.current, ...patch };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  useEffect(() => () => void flush(), [flush]);

  if (boost === undefined) return null;
  if (boost === null) {
    return (
      <main className="p-8 text-sm text-neutral-500" data-testid="boost-missing">
        This Boost was deleted.
      </main>
    );
  }

  const color = boost.settings.color;
  const setColor = (next: BoostColor | null) =>
    save({ settings: { ...boost.settings, color: next } });
  const setFont = (font: string | null) => save({ settings: { ...boost.settings, font } });
  const unzap = (selector: string) =>
    save({
      settings: { ...boost.settings, zapped: boost.settings.zapped.filter((s) => s !== selector) },
    });

  return (
    <main className="mx-auto max-w-2xl px-6 py-6 text-neutral-800" data-testid="boost-editor">
      <header className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-fill)] text-on-accent">
          <Wand2 size={18} />
        </span>
        <input
          defaultValue={boost.name}
          key={`name-${boost.name}`}
          aria-label="Boost name"
          onBlur={(e) => {
            const name = e.currentTarget.value.trim().slice(0, 80);
            if (name && name !== boost.name) save({ name }, 0);
            else e.currentTarget.value = boost.name;
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 text-xl font-semibold outline-none hover:bg-neutral-100 focus:bg-neutral-100"
          data-testid="boost-name"
        />
        <Switch
          checked={boost.enabled}
          label={boost.enabled ? 'Turn Boost off' : 'Turn Boost on'}
          onChange={(enabled) => save({ enabled }, 0)}
          testId="boost-enabled"
        />
        <button
          type="button"
          aria-label="Delete Boost"
          title="Delete Boost"
          onClick={() => void flush().then(() => window.orbit.invoke('boosts:delete', { id }))}
          className="grid size-8 place-items-center rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600"
          data-testid="boost-delete"
        >
          <Trash2 size={16} />
        </button>
      </header>

      <label className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus-within:border-[var(--accent-fill)]">
        <Globe size={14} className="text-neutral-400" />
        <span className="text-neutral-400">Applies to</span>
        <input
          defaultValue={boost.domain}
          key={`domain-${boost.domain}`}
          placeholder="example.com"
          aria-label="Website"
          onBlur={(e) => {
            if (e.currentTarget.value.trim() !== boost.domain)
              save({ domain: e.currentTarget.value }, 0);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="min-w-0 flex-1 bg-transparent font-medium outline-none"
          data-testid="boost-domain"
        />
        <span className="text-xs text-neutral-400">and its subdomains</span>
      </label>
      {error && (
        <p className="mt-1.5 px-1 text-xs text-red-600" data-testid="boost-error">
          {error}
        </p>
      )}

      <Section
        title="Colors"
        action={
          color && (
            <TextButton onClick={() => setColor(null)} testId="boost-color-reset">
              Reset
            </TextButton>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((swatch) => {
            const selected =
              swatch.hue === 0 ? !color || color.hue === 0 : color?.hue === swatch.hue;
            return (
              <button
                key={swatch.label}
                type="button"
                aria-label={swatch.label}
                title={swatch.label}
                onClick={() => setColor({ ...(color ?? DEFAULT_COLOR), hue: swatch.hue })}
                className={`size-7 rounded-full ring-offset-2 ${selected ? 'ring-2 ring-[var(--accent-fill)]' : 'hover:ring-2 hover:ring-neutral-300'}`}
                style={{ background: swatch.color }}
                data-testid="boost-swatch"
              />
            );
          })}
          <span className="flex-1" />
          <label className="flex items-center gap-2 text-sm">
            Dark
            <Switch
              checked={color?.dark ?? false}
              label="Dark page"
              onChange={(dark) => setColor({ ...(color ?? DEFAULT_COLOR), dark })}
              testId="boost-dark"
            />
          </label>
        </div>
        <Slider
          label="Hue"
          min={-180}
          max={180}
          value={color?.hue ?? 0}
          format={(v) => `${v}°`}
          onChange={(hue) => setColor({ ...(color ?? DEFAULT_COLOR), hue })}
          testId="boost-hue"
        />
        <Slider
          label="Saturation"
          min={0}
          max={300}
          value={color?.saturation ?? 100}
          format={(v) => `${v}%`}
          onChange={(saturation) => setColor({ ...(color ?? DEFAULT_COLOR), saturation })}
          testId="boost-saturation"
        />
        <Slider
          label="Brightness"
          min={50}
          max={150}
          value={color?.brightness ?? 100}
          format={(v) => `${v}%`}
          onChange={(brightness) => setColor({ ...(color ?? DEFAULT_COLOR), brightness })}
          testId="boost-brightness"
        />
      </Section>

      <Section title="Font">
        <div className="flex items-center gap-2">
          <select
            value={
              boost.settings.font && FONTS.includes(boost.settings.font)
                ? boost.settings.font
                : boost.settings.font
                  ? 'custom'
                  : ''
            }
            onChange={(e) => {
              if (e.target.value !== 'custom') setFont(e.target.value || null);
            }}
            className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
            style={{ fontFamily: boost.settings.font ?? undefined }}
            data-testid="boost-font"
          >
            <option value="">Site’s own font</option>
            {FONTS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
            <option value="custom">Other…</option>
          </select>
          <input
            key={`font-${boost.settings.font ?? ''}`}
            defaultValue={
              boost.settings.font && !FONTS.includes(boost.settings.font) ? boost.settings.font : ''
            }
            placeholder="Or type a font name"
            aria-label="Font name"
            onBlur={(e) => {
              const name = e.currentTarget.value.trim();
              if (name && FONT_NAME.test(name)) setFont(name);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
            data-testid="boost-font-custom"
          />
        </div>
      </Section>

      <Section
        title="Zapped"
        action={
          <TextButton
            onClick={() =>
              void flush().then(() => window.orbit.invoke('boosts:zap', { id }).then(load))
            }
            testId="boost-zap"
          >
            <Zap size={13} /> Zap Elements
          </TextButton>
        }
      >
        {boost.settings.zapped.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Click “Zap Elements”, then click anything on the page to hide it.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {boost.settings.zapped.map((selector) => (
              <li
                key={selector}
                className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1"
                data-testid="boost-zapped"
              >
                <code className="min-w-0 flex-1 truncate text-xs text-neutral-600" title={selector}>
                  {selector}
                </code>
                <button
                  type="button"
                  aria-label="Show this element again"
                  title="Show this element again"
                  onClick={() => unzap(selector)}
                  className="grid size-6 place-items-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                  data-testid="boost-unzap"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Code"
        action={
          code === 'js' && (
            <TextButton
              onClick={() =>
                void flush().then(() => window.orbit.invoke('boosts:reloadPages', { id }))
              }
              testId="boost-reload"
            >
              <RotateCw size={13} /> Reload Pages
            </TextButton>
          )
        }
      >
        <div className="mb-2 flex gap-1 rounded-lg bg-neutral-100 p-0.5 text-sm" role="tablist">
          {(['css', 'js'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={code === tab}
              onClick={() => setCode(tab)}
              className={`flex-1 rounded-md py-1 font-medium ${code === tab ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
              data-testid={`boost-tab-${tab}`}
            >
              {tab === 'css' ? 'CSS' : 'JavaScript'}
            </button>
          ))}
        </div>
        <CodeEditor
          key={code}
          initial={code === 'css' ? boost.css : boost.js}
          language={code}
          onChange={(text) => save(code === 'css' ? { css: text } : { js: text }, 300)}
          testId={`boost-code-${code}`}
        />
        <p className="mt-1.5 text-xs text-neutral-400">
          {code === 'css'
            ? 'Applied to matching pages as you type.'
            : 'Runs on matching pages each time they load, separate from the page’s own scripts.'}
        </p>
      </Section>
    </main>
  );
}

function Section(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
          {props.title}
        </h2>
        {props.action}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
        {props.children}
      </div>
    </section>
  );
}

function TextButton(props: { onClick: () => void; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-[var(--accent-fill)] hover:bg-[var(--accent-fill)]/10"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

function Switch(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${props.checked ? 'bg-[var(--accent-fill)]' : 'bg-neutral-300'}`}
      data-testid={props.testId}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-on-accent shadow transition-[left] ${props.checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-20 text-neutral-500">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--accent-fill)]"
        data-testid={props.testId}
      />
      <span className="w-12 text-right text-xs text-neutral-500 tabular-nums">
        {props.format(props.value)}
      </span>
    </label>
  );
}
