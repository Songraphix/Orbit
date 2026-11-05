import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Heart, ImagePlus, RotateCcw, Search } from 'lucide-react';
import { backgroundKey, DEFAULT_LOOK } from '@shared/backgrounds';
import type { BackgroundLook, Rotation, UnsplashPhoto } from '@shared/backgrounds';
import { BUILTIN_WALLPAPERS } from '@shared/types/newtab';
import type { NewTabState, WallpaperChoice } from '@shared/types/newtab';
import { backgroundCss, isPhotoChoice, wallpaperThumb } from '@shared/wallpapers';

const invoke = window.orbit.invoke;

const isImage = isPhotoChoice;

export { Wallpaper } from '../../ui/Wallpaper';

/** "Photo by … on Unsplash", as Unsplash's guidelines ask (bottom left of the Homepage). */
export function UnsplashCredit({ photo }: { photo: UnsplashPhoto }) {
  const open = (url: string) => void invoke('newtab:navigate', { input: url });
  return (
    <p
      className="fixed bottom-3 left-4 z-10 text-[12px] text-white/75 [text-shadow:0_1px_4px_rgb(0_0_0/0.5)]"
      data-testid="unsplash-credit"
    >
      Photo by{' '}
      <button
        type="button"
        className="underline-offset-2 hover:underline"
        onClick={() => open(photo.authorUrl)}
      >
        {photo.author}
      </button>{' '}
      on{' '}
      <button
        type="button"
        className="underline-offset-2 hover:underline"
        onClick={() => open(photo.pageUrl)}
      >
        Unsplash
      </button>
    </p>
  );
}

const COLORS = [
  '#0b1026', '#111418', '#1f2937', '#2b1b4a', '#3b0764', '#0c4a6e',
  '#064e3b', '#7c2d12', '#831843', '#e9e4dc', '#dbeafe', '#fde68a',
]; // prettier-ignore

const GRADIENTS: { from: string; to: string; angle: number }[] = [
  { from: '#4f46e5', to: '#ec4899', angle: 135 },
  { from: '#0ea5e9', to: '#22c55e', angle: 135 },
  { from: '#f97316', to: '#db2777', angle: 160 },
  { from: '#0f172a', to: '#334155', angle: 180 },
  { from: '#14b8a6', to: '#1e3a8a', angle: 120 },
  { from: '#fde68a', to: '#f472b6', angle: 135 },
];

type Tab = 'gallery' | 'colour' | 'gradient' | 'unsplash';

/**
 * Customize → Background (brief M4): choose from the built-ins, your image, a colour, a gradient
 * or Unsplash; it previews on the page first — Apply keeps it, Cancel goes back. Adjust it for
 * readability, mark favourites, and let it rotate daily or with every new tab.
 */
export function BackgroundSection(props: {
  state: NewTabState;
  preview: WallpaperChoice | null;
  onPreview: (choice: WallpaperChoice | null) => void;
  look: BackgroundLook;
  onLook: (look: BackgroundLook) => void;
  onChange: (state: NewTabState) => void;
  onError: (message: string | null) => void;
}) {
  const { state, preview } = props;
  const [tab, setTab] = useState<Tab>('gallery');
  const current = preview ?? state.wallpaper;
  const favorites = new Set(state.favorites.map(backgroundKey));
  const isFavorite = favorites.has(backgroundKey(current));
  const selected = (c: WallpaperChoice) => backgroundKey(c) === backgroundKey(current);

  const apply = () => {
    if (!preview) return;
    void invoke('newtab:setWallpaper', { wallpaper: preview }).then((next) => {
      props.onChange(next);
      props.onPreview(null);
    });
  };
  const chooseImage = () => {
    props.onError(null);
    invoke('newtab:chooseImage', {}).then(
      (next) => next && props.onChange(next),
      (e: unknown) =>
        props.onError(
          (e instanceof Error ? e.message : String(e))
            .replace(/^.*\] /, '')
            .replace(/^Error invoking remote method '[^']+': /, ''),
        ),
    );
  };

  return (
    <div data-testid="background-section">
      <div className="mb-2 flex gap-1 rounded-full bg-white/10 p-0.5 text-[12.5px]" role="tablist">
        {(['gallery', 'colour', 'gradient', 'unsplash'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-7 flex-1 rounded-full capitalize ${tab === t ? 'bg-white/20 font-semibold' : 'opacity-70 hover:opacity-100'}`}
            data-testid="background-tab"
            data-tab={t}
          >
            {t === 'colour' ? 'Colour' : t}
          </button>
        ))}
      </div>

      {tab === 'gallery' && (
        <>
          {state.favorites.length > 0 && (
            <>
              <SubLabel>Favourites</SubLabel>
              <Grid>
                {state.favorites.map((f) => (
                  <Tile
                    key={backgroundKey(f)}
                    background={
                      f.kind === 'builtin'
                        ? wallpaperThumb(f.id)
                        : f.kind === 'custom' || f.kind === 'unsplash'
                          ? `${backgroundCss(f, state.customImage)} center / cover no-repeat`
                          : backgroundCss(f, state.customImage)
                    }
                    selected={selected(f)}
                    onClick={() => props.onPreview(f)}
                    testId="background-favorite"
                  />
                ))}
              </Grid>
            </>
          )}
          {/* The owner's wallpapers first, as big tiles (UI spec §4). */}
          <SubLabel>Wallpapers</SubLabel>
          <Grid cols={2}>
            {BUILTIN_WALLPAPERS.filter((w) => 'photo' in w).map(({ id, name }) => {
              const c: WallpaperChoice = { kind: 'builtin', id };
              return (
                <Tile
                  key={id}
                  label={name}
                  background={wallpaperThumb(id)}
                  selected={selected(c)}
                  onClick={() => props.onPreview(c)}
                  testId={`wallpaper-${id}`}
                />
              );
            })}
          </Grid>
          <SubLabel>Atmospheres and colour fields</SubLabel>
          <Grid>
            {BUILTIN_WALLPAPERS.filter((w) => !('photo' in w)).map(({ id, name }) => {
              const c: WallpaperChoice = { kind: 'builtin', id };
              return (
                <Tile
                  key={id}
                  label={name}
                  background={wallpaperThumb(id)}
                  selected={selected(c)}
                  onClick={() => props.onPreview(c)}
                  testId={`wallpaper-${id}`}
                />
              );
            })}
            {state.customImage && (
              <Tile
                label="Your image"
                background={`url("${state.customImage}") center / cover`}
                selected={selected({ kind: 'custom' })}
                onClick={() => props.onPreview({ kind: 'custom' })}
                testId="wallpaper-custom"
              />
            )}
          </Grid>
          <button
            type="button"
            onClick={chooseImage}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-2 text-[13px] font-medium hover:bg-white/15"
            data-testid="choose-image"
          >
            <ImagePlus size={15} />
            {state.customImage ? 'Choose another image…' : 'Choose your own image…'}
          </button>
        </>
      )}

      {tab === 'colour' && (
        <>
          <Grid cols={6}>
            {COLORS.map((color) => (
              <Tile
                key={color}
                background={color}
                selected={selected({ kind: 'color', color })}
                onClick={() => props.onPreview({ kind: 'color', color })}
                testId="background-color"
                round
              />
            ))}
          </Grid>
          <label className="mt-2 flex items-center justify-between text-[13px]">
            Any colour
            <input
              type="color"
              value={current.kind === 'color' ? current.color : '#2b1b4a'}
              onChange={(e) => props.onPreview({ kind: 'color', color: e.target.value })}
              className="h-7 w-12 cursor-pointer rounded border-0 bg-transparent"
              data-testid="background-color-input"
            />
          </label>
        </>
      )}

      {tab === 'gradient' && (
        <GradientEditor current={current} onPreview={props.onPreview} selected={selected} />
      )}

      {tab === 'unsplash' && (
        <UnsplashSearch
          available={state.unsplash}
          selected={selected}
          onPreview={props.onPreview}
        />
      )}

      {preview && (
        <div
          className="sticky bottom-0 mt-3 flex gap-2 rounded-[12px] bg-neutral-900/90 p-2"
          data-testid="background-preview-bar"
        >
          <span className="flex-1 self-center pl-1 text-[12.5px] opacity-75">Previewing</span>
          <button
            type="button"
            onClick={() => props.onPreview(null)}
            className="h-8 rounded-full px-3 text-[13px] hover:bg-white/10"
            data-testid="background-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="h-8 rounded-full bg-[#0a84ff] px-3.5 text-[13px] font-semibold text-on-accent"
            data-testid="background-apply"
          >
            Apply
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isFavorite}
          onClick={() =>
            void invoke('newtab:favorite', { wallpaper: current, on: !isFavorite }).then(
              props.onChange,
            )
          }
          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] ${isFavorite ? 'bg-[#ff375f]/25 text-[#ff8fa3]' : 'bg-white/10 hover:bg-white/15'}`}
          data-testid="background-favorite-toggle"
        >
          <Heart size={13} className={isFavorite ? 'fill-current' : ''} />
          {isFavorite ? 'Favourite' : 'Add to Favourites'}
        </button>
        <select
          value={state.rotation}
          onChange={(e) =>
            void invoke('newtab:setRotation', { rotation: e.target.value as Rotation }).then(
              props.onChange,
            )
          }
          className="h-8 min-w-0 flex-1 rounded-full bg-white/10 px-2.5 text-[12.5px] outline-none"
          title={
            state.favorites.length
              ? 'From your favourites'
              : 'From Orbit’s backgrounds (add favourites to choose)'
          }
          data-testid="background-rotation"
        >
          <option value="off">Keep this one</option>
          <option value="daily">A new one each day</option>
          <option value="every-tab">A new one each tab</option>
        </select>
      </div>

      <Adjustments look={props.look} onLook={props.onLook} image={isImage(current)} />
    </div>
  );
}

function GradientEditor(props: {
  current: WallpaperChoice;
  onPreview: (c: WallpaperChoice) => void;
  selected: (c: WallpaperChoice) => boolean;
}) {
  const g =
    props.current.kind === 'gradient'
      ? props.current
      : { kind: 'gradient' as const, ...GRADIENTS[0]! };
  return (
    <>
      <Grid>
        {GRADIENTS.map((preset, i) => {
          const c: WallpaperChoice = { kind: 'gradient', ...preset };
          return (
            <Tile
              key={i}
              background={backgroundCss(c, null)}
              selected={props.selected(c)}
              onClick={() => props.onPreview(c)}
              testId="background-gradient"
            />
          );
        })}
      </Grid>
      <div className="mt-2 flex items-center gap-2 text-[13px]">
        <input
          type="color"
          value={g.from}
          aria-label="From"
          onChange={(e) => props.onPreview({ ...g, from: e.target.value })}
          className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
          data-testid="gradient-from"
        />
        <input
          type="range"
          min={0}
          max={360}
          value={g.angle}
          aria-label="Angle"
          onChange={(e) => props.onPreview({ ...g, angle: Number(e.target.value) })}
          className="flex-1 accent-white"
        />
        <input
          type="color"
          value={g.to}
          aria-label="To"
          onChange={(e) => props.onPreview({ ...g, to: e.target.value })}
          className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
          data-testid="gradient-to"
        />
      </div>
    </>
  );
}

function UnsplashSearch(props: {
  available: boolean;
  selected: (c: WallpaperChoice) => boolean;
  onPreview: (c: WallpaperChoice) => void;
}) {
  const [query, setQuery] = useState('mountains');
  const [photos, setPhotos] = useState<UnsplashPhoto[] | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const search = (nextPage = 1) => {
    if (!query.trim()) return;
    setBusy(true);
    void invoke('newtab:unsplashSearch', { query: query.trim(), page: nextPage }).then((r) => {
      setBusy(false);
      setError(r.error);
      setPage(nextPage);
      setPhotos((old) => (nextPage === 1 ? r.photos : [...(old ?? []), ...r.photos]));
    });
  };
  if (!props.available) {
    return (
      <p
        className="rounded-[12px] bg-white/10 p-3 text-[12.5px] leading-relaxed opacity-85"
        data-testid="unsplash-needs-key"
      >
        Add your Unsplash access key in Settings → Integrations to search millions of free photos.
        Only your search words go to Unsplash.
      </p>
    );
  }
  return (
    <div data-testid="unsplash">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          search(1);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Unsplash"
          className="h-8 min-w-0 flex-1 rounded-[10px] bg-white/10 px-2.5 text-[13px] outline-none ring-1 ring-white/10 focus:ring-white/30"
          data-testid="unsplash-query"
        />
        <button
          type="submit"
          className="grid size-8 place-items-center rounded-[10px] bg-white/15"
          aria-label="Search"
          data-testid="unsplash-search"
        >
          <Search size={14} />
        </button>
      </form>
      {error && <p className="mt-2 text-[12.5px] text-red-300">{error}</p>}
      {photos && photos.length === 0 && !error && (
        <p className="mt-2 text-[12.5px] opacity-70">No photos found.</p>
      )}
      {photos && photos.length > 0 && (
        <>
          <Grid>
            {photos.map((photo) => {
              const c: WallpaperChoice = { kind: 'unsplash', photo };
              return (
                <Tile
                  key={photo.id}
                  background={`${photo.color ?? '#333'} url("${photo.thumb}") center / cover`}
                  label={photo.author}
                  selected={props.selected(c)}
                  onClick={() => props.onPreview(c)}
                  testId="unsplash-photo"
                />
              );
            })}
          </Grid>
          <button
            type="button"
            disabled={busy}
            onClick={() => search(page + 1)}
            className="mt-2 h-8 w-full rounded-full bg-white/10 text-[12.5px] hover:bg-white/15 disabled:opacity-50"
          >
            More photos
          </button>
        </>
      )}
      <p className="mt-2 text-[11.5px] opacity-55">Photos from Unsplash, credited on the page.</p>
    </div>
  );
}

const SLIDERS: {
  key: 'brightness' | 'saturation' | 'contrast' | 'blur' | 'overlay';
  label: string;
  min: number;
  max: number;
  imageOnly?: boolean;
}[] = [
  { key: 'brightness', label: 'Brightness', min: 40, max: 140 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200 },
  { key: 'contrast', label: 'Contrast', min: 50, max: 150 },
  { key: 'blur', label: 'Blur', min: 0, max: 24 },
  { key: 'overlay', label: 'Darken photos', min: 0, max: 80, imageOnly: true },
];

/** Brightness, saturation, contrast, blur, a veil for photos, and how a photo sits. Changes
 *  show as you drag and are kept a moment after you stop. */
function Adjustments(props: {
  look: BackgroundLook;
  onLook: (look: BackgroundLook) => void;
  image: boolean;
}) {
  const { look } = props;
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const set = (patch: Partial<BackgroundLook>) => {
    const next = { ...look, ...patch };
    props.onLook(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void invoke('newtab:setLook', { look: next }), 350);
  };
  return (
    <>
      {/* Owner request: blur is a plain choice, not hidden in the sliders. */}
      <label className="mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-white/[0.06] px-3 py-2 text-[13px] font-medium">
        Blur background
        <input
          type="checkbox"
          role="switch"
          checked={look.blur > 0}
          onChange={(e) => set({ blur: e.target.checked ? 8 : 0 })}
          className="orbit-switch"
          data-testid="look-blur-toggle"
        />
      </label>
      {/* Atmospheres drift very slowly; this stills them (Reduce Motion always does). */}
      <label className="mt-2 flex items-center justify-between gap-3 rounded-[12px] bg-white/[0.06] px-3 py-2 text-[13px] font-medium">
        Gentle motion in atmospheres
        <input
          type="checkbox"
          role="switch"
          checked={look.ambient}
          onChange={(e) => set({ ambient: e.target.checked })}
          className="orbit-switch"
          data-testid="look-ambient-toggle"
        />
      </label>
      <details
        className="mt-2 rounded-[12px] bg-white/[0.06] px-3 py-2"
        data-testid="background-adjust"
      >
        <summary className="cursor-pointer text-[13px] font-medium">Adjust</summary>
        <div className="mt-2 flex flex-col gap-2">
          {SLIDERS.filter(
            (s) => (!s.imageOnly || props.image) && (s.key !== 'blur' || look.blur > 0),
          ).map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-24 shrink-0 opacity-80">{s.label}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                value={look[s.key]}
                onChange={(e) => set({ [s.key]: Number(e.target.value) })}
                className="flex-1 accent-white"
                data-testid={`look-${s.key}`}
              />
            </label>
          ))}
          {props.image && (
            <div className="flex gap-2 text-[12.5px]">
              <select
                value={look.fit}
                onChange={(e) => set({ fit: e.target.value as BackgroundLook['fit'] })}
                className="h-7 flex-1 rounded-full bg-white/10 px-2 outline-none"
                aria-label="Fit"
              >
                <option value="cover">Fill the page</option>
                <option value="contain">Show it all</option>
              </select>
              <select
                value={look.position}
                onChange={(e) => set({ position: e.target.value as BackgroundLook['position'] })}
                className="h-7 flex-1 rounded-full bg-white/10 px-2 outline-none"
                aria-label="Position"
              >
                <option value="center">Centre</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => set(DEFAULT_LOOK)}
            className="flex items-center gap-1.5 self-start text-[12.5px] opacity-75 hover:opacity-100"
            data-testid="look-reset"
          >
            <RotateCcw size={12} /> Reset adjustments
          </button>
        </div>
      </details>
    </>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <h4 className="mt-2 mb-1 text-[11px] font-semibold tracking-wide uppercase opacity-50">
      {children}
    </h4>
  );
}

function Grid({ children, cols = 3 }: { children: ReactNode; cols?: number }) {
  return (
    <div className={`grid gap-2 ${cols === 6 ? 'grid-cols-6' : 'grid-cols-3'}`}>{children}</div>
  );
}

function Tile(props: {
  background: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
  label?: string;
  round?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.selected}
      aria-label={props.label}
      className={`group relative overflow-hidden ring-2 transition ${
        props.round ? 'aspect-square rounded-full' : 'aspect-[16/10] rounded-lg'
      } ${props.selected ? 'ring-white' : 'ring-transparent hover:ring-white/40'}`}
      style={{ background: props.background }}
      data-testid={props.testId}
    >
      {props.label && !props.round && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pt-3 pb-1 text-left text-[11px] font-medium">
          {props.label}
        </span>
      )}
      {props.selected && (
        <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-white text-neutral-900">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
