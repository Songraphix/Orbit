import { RefreshCw, ScanSearch } from 'lucide-react';
import { useState } from 'react';
import {
  CODECS,
  SCALE_RATIOS,
  decode,
  decodeJwt,
  encode,
  readTime,
  testRegex,
  timeViews,
  typeScale,
} from '@shared/toolkit/text';
import type { Codec } from '@shared/toolkit/text';
import type { ToolkitState } from '@shared/toolkit/state';
import { CopyButton, Group, SmallButton } from './parts';
import { JsonSection } from './sections';

const invoke = window.orbit.invoke;
const AREA =
  'w-full resize-y rounded-[12px] border border-[var(--work-border)] bg-[var(--work-card)] p-2.5 font-mono text-[12px] outline-none focus:border-[var(--work-accent)]';
const FIELD =
  'h-8 min-w-0 rounded-[9px] border border-[var(--work-border)] bg-transparent px-2 text-[12.5px] outline-none focus:border-[var(--work-accent)]';

/** Type (roadmap P4.6): the fonts a page uses, and a type scale to start from. */
export function TypeSection({ state }: { state: ToolkitState }) {
  const [base, setBase] = useState(16);
  const [ratio, setRatio] = useState(1.25);
  const scale = typeScale(base > 0 ? base : 16, ratio);
  const css = scale
    .map((s) => `--step-${s.step < 0 ? `n${-s.step}` : s.step}: ${s.rem};`)
    .join('\n');
  return (
    <>
      <Group
        title="Fonts on this page"
        action={
          <button
            type="button"
            className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--work-accent-text)] disabled:opacity-40"
            onClick={() => void invoke('toolkit:fonts', {})}
            data-testid="toolkit-scan-fonts"
          >
            <ScanSearch size={12} /> {state.fonts ? 'Scan Again' : 'Scan Page'}
          </button>
        }
      >
        {state.fonts ? (
          state.fonts.families.length ? (
            <ul className="flex flex-col gap-1.5" data-testid="toolkit-fonts">
              {state.fonts.families.map((f) => (
                <li
                  key={f.family}
                  className="rounded-[12px] border border-[var(--work-border)] bg-[var(--work-card)] px-3 py-2"
                  data-testid="toolkit-font"
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className="min-w-0 flex-1 truncate text-[15px]"
                      style={{ fontFamily: `"${f.family}", system-ui` }}
                    >
                      {f.family}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--note-muted)]">
                      {f.count} element{f.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--note-muted)]">
                    {f.sizes.map((s) => `${s}px`).join(' · ')}
                    {f.weights.length > 0 && ` — weights ${f.weights.join(', ')}`}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-[var(--note-muted)]">No text found.</p>
          )
        ) : (
          <p className="text-[12.5px] text-[var(--note-muted)]">
            {state.page
              ? 'See which fonts, sizes and weights this page uses.'
              : 'Open a page first.'}
          </p>
        )}
      </Group>

      <Group title="Type scale">
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium text-[var(--note-muted)]">
            Base size
            <input
              type="number"
              min={8}
              max={32}
              value={base}
              onChange={(e) => setBase(Number(e.target.value))}
              className={FIELD}
              data-testid="scale-base"
            />
          </label>
          <label className="flex flex-[2] flex-col gap-1 text-[11px] font-medium text-[var(--note-muted)]">
            Ratio
            <select
              value={ratio}
              onChange={(e) => setRatio(Number(e.target.value))}
              className={FIELD}
              data-testid="scale-ratio"
            >
              {SCALE_RATIOS.map((r) => (
                <option key={r.ratio} value={r.ratio}>
                  {r.name} · {r.ratio}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ol className="mt-3 flex flex-col gap-1 overflow-hidden" data-testid="scale-steps">
          {scale.map((s) => (
            <li key={s.step} className="flex items-baseline gap-3">
              <span className="w-14 shrink-0 font-mono text-[11px] text-[var(--note-muted)]">
                {s.px}px
              </span>
              <span className="truncate leading-tight" style={{ fontSize: Math.min(s.px, 44) }}>
                Orbit
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex items-start gap-1 rounded-[10px] bg-[var(--work-card)] py-1 pr-1 pl-2.5">
          <pre className="min-w-0 flex-1 py-1 text-[11.5px] leading-[1.5]">{css}</pre>
          <CopyButton text={css} />
        </div>
      </Group>
    </>
  );
}

/** Code (roadmap P3.6, P4.6): JSON, encode/decode, timestamps, UUIDs and regular expressions. */
export function CodeSection() {
  return (
    <>
      <Group title="JSON">
        <JsonSection />
      </Group>
      <EncodeTool />
      <TimeTool />
      <UuidTool />
      <RegexTool />
    </>
  );
}

function EncodeTool() {
  const [codec, setCodec] = useState<Codec>('base64');
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const result =
    mode === 'encode' ? { ok: true as const, text: encode(input, codec) } : decode(input, codec);
  const jwt = codec === 'base64' && mode === 'decode' ? decodeJwt(input) : null;
  return (
    <Group title="Encode / decode">
      <div className="mb-2 flex flex-wrap gap-1">
        {CODECS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCodec(c.id)}
            className={`rounded-full px-2.5 py-0.5 text-[12px] ${codec === c.id ? 'bg-[var(--work-accent-soft)] text-[var(--work-accent-text)]' : 'text-[var(--note-muted)] hover:bg-[var(--note-hover)]'}`}
            data-testid="codec"
            data-codec={c.id}
          >
            {c.name}
          </button>
        ))}
        <span className="flex-1" />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'encode' | 'decode')}
          className={FIELD}
          aria-label="Direction"
          data-testid="codec-mode"
        >
          <option value="encode">Encode</option>
          <option value="decode">Decode</option>
        </select>
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder={mode === 'encode' ? 'Text to encode' : 'Text to decode (a JWT works too)'}
        className={`${AREA} h-20`}
        data-testid="codec-input"
      />
      {input &&
        (result.ok ? (
          <div className="mt-2 flex items-start gap-1 rounded-[10px] bg-[var(--work-card)] py-1 pr-1 pl-2.5">
            <code className="min-w-0 flex-1 py-1 text-[12px] break-all" data-testid="codec-output">
              {jwt ? JSON.stringify(jwt, null, 2) : result.text}
            </code>
            <CopyButton text={jwt ? JSON.stringify(jwt, null, 2) : result.text} />
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-[#d70015]" role="alert" data-testid="codec-error">
            {result.error}
          </p>
        ))}
    </Group>
  );
}

function TimeTool() {
  const [input, setInput] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const at = input.trim() ? readTime(input) : now;
  return (
    <Group
      title="Timestamp"
      action={
        <button
          type="button"
          className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--work-accent-text)]"
          onClick={() => {
            setInput('');
            setNow(Date.now());
          }}
        >
          <RefreshCw size={11} /> Now
        </button>
      }
    >
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="1700000000, 1700000000000 or a date"
        spellCheck={false}
        className={`${FIELD} w-full font-mono`}
        data-testid="time-input"
      />
      {at === null ? (
        <p className="mt-2 text-[12px] text-[#d70015]" data-testid="time-error">
          That isn’t a time Orbit can read.
        </p>
      ) : (
        <dl className="mt-2 divide-y divide-[var(--work-border)] rounded-[12px] border border-[var(--work-border)] text-[12px]">
          {timeViews(at).map((v) => (
            <div key={v.label} className="flex items-center gap-2 py-0.5 pr-1 pl-3">
              <dt className="w-24 shrink-0 text-[var(--note-muted)]">{v.label}</dt>
              <dd className="min-w-0 flex-1 truncate font-mono" data-testid="time-view">
                {v.value}
              </dd>
              <CopyButton text={v.value} />
            </div>
          ))}
        </dl>
      )}
    </Group>
  );
}

function UuidTool() {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <Group title="UUID">
      <div className="flex items-center gap-2">
        <SmallButton
          onClick={() => setIds(Array.from({ length: 5 }, () => crypto.randomUUID()))}
          testId="uuid-make"
        >
          Make 5 UUIDs
        </SmallButton>
        {ids.length > 0 && <CopyButton text={ids.join('\n')} label="Copy All" />}
      </div>
      {ids.length > 0 && (
        <ul className="mt-2 flex flex-col font-mono text-[12px]" data-testid="uuid-list">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate">{id}</span>
              <CopyButton text={id} />
            </li>
          ))}
        </ul>
      )}
    </Group>
  );
}

function RegexTool() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('');
  const result = pattern ? testRegex(pattern, flags, text.slice(0, 20_000)) : null;
  return (
    <Group title="Regular expression">
      <div className="flex items-center gap-1 font-mono text-[12.5px]">
        <span className="text-[var(--note-muted)]">/</span>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
          placeholder="(\d+)-(\d+)"
          className={`${FIELD} flex-1 font-mono`}
          data-testid="regex-pattern"
        />
        <span className="text-[var(--note-muted)]">/</span>
        <input
          value={flags}
          onChange={(e) => setFlags(e.target.value.replace(/[^dgimsuvy]/g, ''))}
          spellCheck={false}
          aria-label="Flags"
          className={`${FIELD} w-12 font-mono`}
          data-testid="regex-flags"
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder="Text to test"
        className={`${AREA} mt-2 h-20`}
        data-testid="regex-text"
      />
      {result &&
        (result.ok ? (
          <div className="mt-2 text-[12px]" data-testid="regex-result">
            <p className="text-[var(--note-muted)]">
              {result.matches.length} match{result.matches.length === 1 ? '' : 'es'}
            </p>
            <ol className="mt-1 flex flex-col gap-0.5 font-mono">
              {result.matches.slice(0, 20).map((m, i) => (
                <li key={i} className="truncate" data-testid="regex-match">
                  <span className="text-[var(--note-muted)]">{m.index}:</span>{' '}
                  <mark className="rounded bg-[var(--work-accent-soft)] px-0.5 text-[var(--note-fg)]">
                    {m.text || '∅'}
                  </mark>
                  {m.groups.length > 0 && (
                    <span className="text-[var(--note-muted)]">
                      {' '}
                      → {m.groups.map((g) => `“${g}”`).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-[#d70015]" role="alert" data-testid="regex-error">
            {result.error}
          </p>
        ))}
    </Group>
  );
}
