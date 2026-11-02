import { useState } from 'react';
import type { ClipboardEvent, CSSProperties } from 'react';
import { ImageUp, Shuffle } from 'lucide-react';
import { toHex } from '@shared/toolkit/color';
import type { Rgb } from '@shared/toolkit/color';
import { gradientCss } from '@shared/toolkit/css';
import {
  HARMONIES,
  HARMONY_LABEL,
  extractPalette,
  harmony,
  paletteCss,
  randomBase,
} from '@shared/toolkit/palette';
import type { Harmony } from '@shared/toolkit/palette';
import { CopyButton, Group } from './parts';

/**
 * Colors → Palette, Gradient and From an Image (owner request): a palette in harmony with the
 * colour you're on (or a random one), a gradient made from it, and an image's main colours.
 * Everything runs here, in the panel; images never leave the Mac.
 */
export function PaletteGroups({ base, onPick }: { base: Rgb; onPick: (hex: string) => void }) {
  const [mode, setMode] = useState<Harmony>('analogous');
  const colors = harmony(base, mode);
  return (
    <>
      <Group
        title="Palette"
        action={
          <button
            type="button"
            className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--work-accent-text)]"
            onClick={() => onPick(toHex(randomBase()))}
            title="A new random colour to build from"
            data-testid="palette-shuffle"
          >
            <Shuffle size={12} /> Shuffle
          </button>
        }
      >
        <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Harmony">
          {HARMONIES.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={mode === h}
              onClick={() => setMode(h)}
              className={`press rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
                mode === h
                  ? 'bg-[var(--work-accent-soft)] text-[var(--work-accent-text)]'
                  : 'text-[var(--note-muted)] hover:bg-[var(--note-hover)]'
              }`}
              data-testid="palette-mode"
              data-value={h}
            >
              {HARMONY_LABEL[h]}
            </button>
          ))}
        </div>
        <Strip colors={colors} onPick={onPick} testId="palette-colors" />
        <div className="mt-1.5 flex justify-end gap-1">
          <CopyButton text={colors.join(', ')} label="Hex" />
          <CopyButton text={paletteCss(colors)} label="CSS" testId="palette-copy-css" />
        </div>
      </Group>
      <GradientGroup colors={colors} />
      <ImagePalette onPick={onPick} />
    </>
  );
}

function GradientGroup({ colors }: { colors: string[] }) {
  const [kind, setKind] = useState<'linear' | 'radial'>('linear');
  const [angle, setAngle] = useState(135);
  const [count, setCount] = useState(3);
  // Evenly spread stops from the palette (first, last, and between).
  const picks = Array.from(
    { length: count },
    (_, i) => colors[Math.round((i / Math.max(1, count - 1)) * (colors.length - 1))]!,
  );
  const css = gradientCss({
    kind,
    angle,
    stops: picks.map((color, i) => ({ color, at: (i / Math.max(1, count - 1)) * 100 })),
  });
  return (
    <Group title="Gradient">
      <div
        className="h-20 rounded-[12px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]"
        style={{ backgroundImage: css } as CSSProperties}
        data-testid="gradient-preview"
      />
      <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--note-muted)]">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as 'linear' | 'radial')}
          className="rounded-[8px] border border-[var(--work-border)] bg-[var(--work-card)] px-1.5 py-0.5 text-[var(--note-fg)]"
          aria-label="Gradient kind"
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="rounded-[8px] border border-[var(--work-border)] bg-[var(--work-card)] px-1.5 py-0.5 text-[var(--note-fg)]"
          aria-label="Colours"
        >
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} colours
            </option>
          ))}
        </select>
        {kind === 'linear' && (
          <input
            type="range"
            min={0}
            max={360}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            aria-label="Angle"
            className="min-w-0 flex-1 accent-[var(--work-accent)]"
          />
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-[11.5px]" data-testid="gradient-css">
          background: {css};
        </code>
        <CopyButton text={`background: ${css};`} label="CSS" />
      </div>
    </Group>
  );
}

/** Reads an image file (or a pasted one) small, and finds its main colours. */
async function colorsOf(file: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return extractPalette(ctx.getImageData(0, 0, w, h).data, 6);
}

function ImagePalette({ onPick }: { onPick: (hex: string) => void }) {
  const [result, setResult] = useState<{ name: string; colors: string[]; preview: string } | null>(
    null,
  );
  const [error, setError] = useState('');
  const read = async (file: Blob, name: string) => {
    setError('');
    try {
      const colors = await colorsOf(file);
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.preview);
        return { name, colors, preview: URL.createObjectURL(file) };
      });
    } catch {
      setError('That image couldn’t be read.');
    }
  };
  const onPaste = (e: ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (file) void read(file, 'Pasted image');
  };
  return (
    <Group title="From an Image">
      <label
        tabIndex={0}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
          if (file) void read(file, file.name);
        }}
        className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-dashed border-[var(--work-border)] px-3 py-3 text-[12.5px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] focus:outline-2 focus:outline-[var(--work-accent)]"
        data-testid="image-palette-drop"
      >
        {result ? (
          <img src={result.preview} alt="" className="size-10 rounded-[8px] object-cover" />
        ) : (
          <ImageUp size={18} className="shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          {result ? (
            <span className="block truncate text-[var(--note-fg)]">{result.name}</span>
          ) : null}
          Choose, drop or paste an image to get its colours
        </span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file, file.name);
            e.target.value = '';
          }}
          data-testid="image-palette-file"
        />
      </label>
      {error && <p className="mt-1.5 text-[12px] text-red-500">{error}</p>}
      {result && result.colors.length > 0 && (
        <div className="mt-2">
          <Strip colors={result.colors} onPick={onPick} testId="image-palette-colors" />
          <div className="mt-1.5 flex justify-end gap-1">
            <CopyButton text={result.colors.join(', ')} label="Hex" />
            <CopyButton text={paletteCss(result.colors)} label="CSS" />
          </div>
        </div>
      )}
    </Group>
  );
}

/** Colours side by side; clicking one makes it the colour you're working with. */
function Strip(props: { colors: string[]; onPick: (hex: string) => void; testId: string }) {
  return (
    <div className="flex h-14 overflow-hidden rounded-[12px]" data-testid={props.testId}>
      {props.colors.map((c, i) => (
        <button
          key={`${c}-${i}`}
          type="button"
          onClick={() => props.onPick(c)}
          title={`${c} — use this colour`}
          aria-label={c}
          className="group relative flex-1 transition-[flex] hover:flex-[1.6]"
          style={{ background: c }}
          data-testid="strip-color"
          data-hex={c}
        >
          <span className="absolute inset-x-0 bottom-1 font-mono text-[10px] opacity-0 mix-blend-difference text-white group-hover:opacity-100">
            {c}
          </span>
        </button>
      ))}
    </div>
  );
}
