import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  exportToCanvas,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import { Camera, Grid3x3, Grip, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { EaselBackground, EaselCapture, EaselData } from '@shared/types/easels';

type OnChange = NonNullable<ExcalidrawProps['onChange']>;
type Scene = Parameters<OnChange>;

const SAVE_DELAY_MS = 600;
/** Captures land at most this wide (CSS pixels), centred in view. */
const CAPTURE_MAX_WIDTH = 640;

/** The pattern's spacing, in scene units (it scales with zoom). */
const STEP = 24;
const BACKGROUNDS: { id: EaselBackground; label: string; icon: ReactNode }[] = [
  { id: 'plain', label: 'Plain', icon: <Square size={13} /> },
  { id: 'grid', label: 'Grid', icon: <Grid3x3 size={13} /> },
  { id: 'dots', label: 'Dots', icon: <Grip size={13} /> },
];

/**
 * A grid or dots behind the drawing, moving and scaling with it. Excalidraw has no dot pattern
 * (and its own grid snaps shapes), so the pattern is the page's background under a transparent
 * canvas, kept in step with Excalidraw's scroll and zoom.
 */
function paintPattern(
  el: HTMLElement | null,
  background: EaselBackground,
  theme: 'light' | 'dark',
  view: { scrollX: number; scrollY: number; zoom: number },
): void {
  if (!el) return;
  const paper = theme === 'dark' ? '#121212' : '#ffffff';
  const ink = theme === 'dark' ? 'rgb(255 255 255 / 0.14)' : 'rgb(0 0 0 / 0.13)';
  el.style.backgroundColor = paper;
  if (background === 'plain') {
    el.style.backgroundImage = 'none';
    return;
  }
  const size = STEP * view.zoom;
  const x = view.scrollX * view.zoom;
  const y = view.scrollY * view.zoom;
  if (background === 'grid') {
    el.style.backgroundImage = `linear-gradient(to right, ${ink} 1px, transparent 1px), linear-gradient(to bottom, ${ink} 1px, transparent 1px)`;
    el.style.backgroundPosition = `${x}px ${y}px`;
  } else {
    const dot = Math.max(1, Math.min(2, 1.4 * view.zoom));
    el.style.backgroundImage = `radial-gradient(circle, ${ink.replace('0.13', '0.32').replace('0.14', '0.3')} ${dot}px, transparent ${dot + 0.5}px)`;
    el.style.backgroundPosition = `${x - size / 2}px ${y - size / 2}px`;
  }
  el.style.backgroundSize = `${size}px ${size}px`;
}

/** The saved scene as Excalidraw's initial data ('' is a new, empty Easel). */
function initialDataFor(scene: string): ExcalidrawInitialDataState {
  if (!scene) return { appState: { viewBackgroundColor: '#ffffff' } };
  try {
    const parsed = JSON.parse(scene) as ExcalidrawInitialDataState;
    return {
      elements: parsed.elements ?? [],
      appState: parsed.appState ?? {},
      files: parsed.files ?? {},
      scrollToContent: true,
    };
  } catch {
    return { appState: { viewBackgroundColor: '#ffffff' } };
  }
}

/** The Easel's canvas: Excalidraw, saved as you draw, with a title and "Capture" in the corner. */
export default function EaselCanvas({
  easel,
  theme,
}: {
  easel: EaselData;
  theme: 'light' | 'dark';
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const pendingChecked = useRef(false);
  const [title, setTitle] = useState(easel.title);
  const [capturing, setCapturing] = useState(false);
  const pending = useRef<Scene | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const lastSaved = useRef(easel.scene);
  const initialData = useMemo(() => initialDataFor(easel.scene), [easel.scene]);
  const [background, setBackground] = useState<EaselBackground>(easel.background);
  const backdrop = useRef<HTMLDivElement>(null);
  const view = useRef({ scrollX: 0, scrollY: 0, zoom: 1 });
  // A pattern needs the canvas see-through; plain gets its white (or dark) paper back.
  useEffect(() => {
    paintPattern(backdrop.current, background, theme, view.current);
    api.current?.updateScene({
      appState: { viewBackgroundColor: background === 'plain' ? '#ffffff' : 'transparent' },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [background, theme]);
  const chooseBackground = (next: EaselBackground) => {
    setBackground(next);
    void window.orbit.invoke('easels:background', { id: easel.id, background: next });
  };

  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    const scene = pending.current;
    pending.current = null;
    if (!scene) return;
    const [elements, appState, files] = scene;
    const json = serializeAsJSON(elements, appState, files, 'local');
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    let preview: string | null = null;
    const visible = elements.filter((e) => !e.isDeleted);
    if (visible.length > 0) {
      try {
        const canvas = await exportToCanvas({
          elements: visible,
          appState: { ...appState, exportBackground: true, viewBackgroundColor: '#ffffff' },
          files,
          maxWidthOrHeight: 480,
        });
        preview = canvas.toDataURL('image/jpeg', 0.75);
      } catch {
        // No preview this time; the Library shows a plain tile.
      }
    }
    await window.orbit.invoke('easels:save', { id: easel.id, scene: json, preview });
  }, [easel.id]);

  const onChange = useCallback<OnChange>(
    (...scene) => {
      pending.current = scene;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
    },
    [save],
  );

  // Save what's pending when the page goes away.
  useEffect(() => {
    const flush = () => void save();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [save]);

  const saveTitle = (next: string) => {
    const clean = next.trim().slice(0, 120);
    if (!clean) {
      setTitle(easel.title);
      return;
    }
    document.title = clean;
    void window.orbit.invoke('easels:save', { id: easel.id, title: clean });
  };

  const capture = async () => {
    setCapturing(true);
    const result = await window.orbit.invoke('easels:capture', { id: easel.id });
    setCapturing(false);
    if (result && api.current) placeCapture(api.current, result);
  };

  return (
    <div
      ref={backdrop}
      className="h-full w-full"
      data-testid="easel-backdrop"
      data-background={background}
    >
      <Excalidraw
        excalidrawAPI={(instance) => {
          api.current = instance;
          // The pattern (or plain paper) as saved for this Easel.
          instance.updateScene({
            appState: { viewBackgroundColor: background === 'plain' ? '#ffffff' : 'transparent' },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          // Started from Annotate Screenshot: the picture is waiting in main (once).
          if (pendingChecked.current) return;
          pendingChecked.current = true;
          void window.orbit.invoke('easels:pending', { id: easel.id }).then((waiting) => {
            if (waiting && api.current) placeCapture(api.current, waiting);
          });
        }}
        initialData={initialData}
        theme={theme}
        onChange={onChange}
        onScrollChange={(scrollX, scrollY, zoom) => {
          view.current = { scrollX, scrollY, zoom: zoom.value };
          paintPattern(backdrop.current, background, theme, view.current);
        }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
        renderTopRightUI={() => (
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Background"
              className={`flex rounded-lg border p-0.5 ${
                theme === 'dark' ? 'border-white/15 bg-[#232329]' : 'border-neutral-200 bg-white'
              }`}
              data-testid="easel-background"
            >
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={background === b.id}
                  aria-label={`${b.label} background`}
                  title={`${b.label} background`}
                  onClick={() => chooseBackground(b.id)}
                  className={`grid size-7 place-items-center rounded-md ${
                    background === b.id
                      ? 'bg-[var(--accent-fill)] text-white'
                      : theme === 'dark'
                        ? 'text-white/60 hover:bg-white/10'
                        : 'text-neutral-500 hover:bg-neutral-100'
                  }`}
                  data-value={b.id}
                >
                  {b.icon}
                </button>
              ))}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => saveTitle(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label="Easel title"
              className={`w-44 rounded-lg border px-2 py-1.5 text-sm font-semibold outline-none focus:border-[var(--accent-fill)] ${
                theme === 'dark'
                  ? 'border-white/15 bg-[#232329] text-white'
                  : 'border-neutral-200 bg-white text-neutral-800'
              }`}
              data-testid="easel-title"
            />
            <button
              type="button"
              disabled={capturing}
              onClick={() => void capture()}
              title="Capture part of a web page onto this Easel"
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-fill)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              data-testid="easel-capture"
            >
              <Camera size={14} /> Capture
            </button>
          </div>
        )}
      />
    </div>
  );
}

/** Adds a captured image in the middle of the view, linked to the page it came from. */
function placeCapture(api: ExcalidrawImperativeAPI, capture: EaselCapture): void {
  const fileId = crypto.randomUUID() as BinaryFileData['id'];
  api.addFiles([
    {
      id: fileId,
      dataURL: capture.dataUrl as BinaryFileData['dataURL'],
      mimeType: 'image/png',
      created: Date.now(),
    },
  ]);
  const scale = Math.min(1, CAPTURE_MAX_WIDTH / Math.max(1, capture.width));
  const width = Math.round(capture.width * scale);
  const height = Math.round(capture.height * scale);
  const state = api.getAppState();
  const zoom = state.zoom.value;
  const [image] = convertToExcalidrawElements([
    {
      type: 'image',
      fileId,
      status: 'saved',
      x: -state.scrollX + state.width / 2 / zoom - width / 2,
      y: -state.scrollY + state.height / 2 / zoom - height / 2,
      width,
      height,
      link: capture.sourceUrl,
    },
  ]);
  if (!image) return;
  api.updateScene({
    elements: [...api.getSceneElements(), image],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
