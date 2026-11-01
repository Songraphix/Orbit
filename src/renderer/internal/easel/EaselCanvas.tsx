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
import { Camera } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EaselCapture, EaselData } from '@shared/types/easels';

type OnChange = NonNullable<ExcalidrawProps['onChange']>;
type Scene = Parameters<OnChange>;

const SAVE_DELAY_MS = 600;
/** Captures land at most this wide (CSS pixels), centred in view. */
const CAPTURE_MAX_WIDTH = 640;

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
export default function EaselCanvas({ easel }: { easel: EaselData }) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const [title, setTitle] = useState(easel.title);
  const [capturing, setCapturing] = useState(false);
  const pending = useRef<Scene | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const lastSaved = useRef(easel.scene);
  const initialData = useMemo(() => initialDataFor(easel.scene), [easel.scene]);

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
    <Excalidraw
      excalidrawAPI={(instance) => (api.current = instance)}
      initialData={initialData}
      onChange={onChange}
      UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
      renderTopRightUI={() => (
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => saveTitle(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Easel title"
            className="w-44 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm font-semibold text-neutral-800 outline-none focus:border-[#5b5bd6]"
            data-testid="easel-title"
          />
          <button
            type="button"
            disabled={capturing}
            onClick={() => void capture()}
            title="Capture part of a web page onto this Easel"
            className="flex items-center gap-1.5 rounded-lg bg-[#5b5bd6] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            data-testid="easel-capture"
          >
            <Camera size={14} /> Capture
          </button>
        </div>
      )}
    />
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
