import { MonitorSmartphone, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { fitViewport, RESPONSIVE_BAR } from '@shared/toolkit/viewport';
import { VIEWPORT_PRESETS, presetName } from '@shared/toolkit/state';
import type { Viewport } from '@shared/toolkit/state';
import type { Rect } from '@shared/types/layout';

const set = (viewport: Viewport | null) =>
  void window.orbit.invoke('toolkit:viewport', { viewport });

/**
 * Responsive mode (roadmap P3.6): over the page area, a device bar — size, rotate, done — and a
 * soft backdrop around the device-sized page, which main places with the same numbers.
 */
export function ResponsiveFrame(props: {
  /** The web view's area, in window coordinates. */
  area: Rect;
  /** The card's top-left, in window coordinates (this frame is drawn inside the card). */
  origin: { x: number; y: number };
  viewport: Viewport;
}) {
  const { area, origin, viewport } = props;
  const fit = fitViewport(area, viewport);
  const name = presetName(viewport);
  const radius = viewport.mobile ? 22 : 10;
  return (
    <div
      className="responsive-backdrop absolute"
      style={{
        left: area.x - origin.x,
        top: area.y - origin.y,
        width: area.width,
        height: area.height,
      }}
      data-testid="responsive-frame"
    >
      <div
        className="flex items-center justify-center gap-2 px-3 text-[12px] text-neutral-600"
        style={{ height: RESPONSIVE_BAR }}
        data-testid="responsive-bar"
      >
        <MonitorSmartphone size={14} className="text-neutral-500" aria-hidden />
        <select
          value={name ?? 'custom'}
          onChange={(e) => {
            const preset = VIEWPORT_PRESETS.find((p) => p.name === e.target.value);
            if (preset) set({ width: preset.width, height: preset.height, mobile: preset.mobile });
          }}
          className="h-7 rounded-[8px] border border-black/10 bg-white/80 px-1.5 text-[12px] font-medium"
          aria-label="Device"
          data-testid="responsive-device"
        >
          {name === null && <option value="custom">Custom</option>}
          {VIEWPORT_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <SizeInput
          value={viewport.width}
          label="Width"
          onCommit={(width) => set({ ...viewport, width })}
          testId="responsive-width"
        />
        <span className="text-neutral-400">×</span>
        <SizeInput
          value={viewport.height}
          label="Height"
          onCommit={(height) => set({ ...viewport, height })}
          testId="responsive-height"
        />
        <button
          type="button"
          className="press grid size-7 place-items-center rounded-[8px] hover:bg-black/5"
          onClick={() => set({ ...viewport, width: viewport.height, height: viewport.width })}
          aria-label="Rotate"
          title="Rotate"
          data-testid="responsive-rotate"
        >
          <RotateCcw size={14} />
        </button>
        <span className="w-10 text-right font-mono text-[11px] text-neutral-400 tabular-nums">
          {Math.round(fit.scale * 100)}%
        </span>
        <button
          type="button"
          className="press ml-1 h-7 rounded-[8px] bg-neutral-900 px-2.5 text-[12px] font-semibold text-white hover:bg-neutral-700"
          onClick={() => set(null)}
          data-testid="responsive-done"
        >
          Done
        </button>
      </div>
      {/* The device's edge and shadow, just around the page (a native view drawn on top). */}
      <div
        className="pointer-events-none absolute shadow-[0_18px_50px_-12px_rgb(0_0_0/0.35),0_0_0_1px_rgb(0_0_0/0.08)]"
        style={{
          left: fit.bounds.x - area.x,
          top: fit.bounds.y - area.y,
          width: fit.bounds.width,
          height: fit.bounds.height,
          borderRadius: radius,
        }}
      />
    </div>
  );
}

/** A number field that applies on Enter or when it loses focus (within 200–4000). */
function SizeInput(props: {
  value: number;
  label: string;
  onCommit: (n: number) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.round(Number(draft));
    setDraft(null);
    if (Number.isFinite(n) && n >= 200 && n <= 4000 && n !== props.value) props.onCommit(n);
  };
  return (
    <input
      value={draft ?? String(props.value)}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      inputMode="numeric"
      aria-label={props.label}
      className="h-7 w-14 rounded-[8px] border border-black/10 bg-white/80 text-center font-mono text-[12px] tabular-nums"
      data-testid={props.testId}
    />
  );
}
