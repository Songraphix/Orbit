import { useState } from 'react';
import type { ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  ACCENTS,
  FEATURES,
  FEATURE_LABEL,
  FONT_INFO,
  FONTS,
  matchingTemplate,
  THEME_TEMPLATES,
} from '@shared/ui-prefs';
import type { UiPrefs } from '@shared/ui-prefs';
import type { UserSettings } from '@shared/settings';
import { useUiPrefs } from '../../ui/prefs-store';
import { useCanvas } from '../../ui/canvas-store';
import { BUILTIN_WALLPAPERS } from '@shared/types/newtab';
import { wallpaperThumb } from '@shared/wallpapers';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';
import { Group, Row, Section } from './parts';

/**
 * Settings → Appearance (brief M2, the customization engine): theme templates, light or dark,
 * accent, font, text size, density, glass or solid surfaces, motion, and which features show.
 * One place for all of it; every part of Orbit follows at once.
 */
export function AppearanceSection(props: {
  appearance: UserSettings['appearance'];
  onAppearance: (value: UserSettings['appearance']) => void;
  tabLayout: UserSettings['tabLayout'];
  onTabLayout: (value: UserSettings['tabLayout']) => void;
}) {
  const stored = useUiPrefs();
  const canvas = useCanvas();
  // Changes show at once; main's answer (and its update to every page) follows.
  const [local, setLocal] = useState<UiPrefs | null>(null);
  const prefs = local ?? stored;
  if (!prefs) return null;
  const set = (patch: Partial<UiPrefs>) => {
    setLocal({ ...prefs, ...patch });
    void window.orbit.invoke('ui:set', patch).then(setLocal);
  };
  const shown = (f: (typeof FEATURES)[number]) => !prefs.hidden.includes(f);
  return (
    <Section
      id="appearance"
      title="Appearance"
      description="How Orbit looks and what it shows. Changes apply everywhere at once."
    >
      <Group title="Templates">
        <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-4" data-testid="theme-templates">
          {THEME_TEMPLATES.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              on={matchingTemplate(prefs, props.appearance) === t.id}
              onPick={() => {
                set(t.look);
                if (t.appearance !== props.appearance) props.onAppearance(t.appearance);
              }}
            />
          ))}
        </div>
      </Group>

      <Group title="Wallpaper and glass">
        <div className="p-3" data-testid="ui-wallpapers">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {BUILTIN_WALLPAPERS.map((w) => {
              const on = canvas?.wallpaper.kind === 'builtin' && canvas.wallpaper.id === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  aria-label={w.name}
                  aria-pressed={on}
                  title={w.name}
                  onClick={() =>
                    void window.orbit.invoke('canvas:setWallpaper', {
                      wallpaper: { kind: 'builtin', id: w.id },
                    })
                  }
                  className={`press aspect-[16/10] rounded-[10px] bg-cover bg-center ${
                    on
                      ? 'shadow-[0_0_0_2px_var(--accent-fill,#2f7d75),0_0_0_4px_white]'
                      : 'hover:brightness-110'
                  }`}
                  style={{ background: wallpaperThumb(w.id) }}
                  data-testid="ui-wallpaper"
                  data-value={w.id}
                />
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-neutral-500">
            Your own image, colours, gradients and Unsplash photos are in the Homepage’s Customize
            panel.
          </p>
        </div>
        <Row
          label="Match the wallpaper"
          hint="Orbit’s accent and glass take their colour from the wallpaper. Off: each Space’s colour."
        >
          <Toggle
            checked={prefs.palette === 'auto'}
            onChange={(on) => set({ palette: on ? 'auto' : 'off' })}
            label="Match the wallpaper"
            testId="ui-palette"
          />
        </Row>
        <Row
          label="Glass"
          hint="Subtle is the most solid and easiest to read; Strong lets the most wallpaper through."
        >
          <Segmented
            label="Glass"
            value={prefs.glass}
            onChange={(glass) => set({ glass })}
            options={[
              { value: 'subtle', label: 'Subtle' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'strong', label: 'Strong' },
            ]}
            testId="ui-glass"
          />
        </Row>
        <Row label="Dim photos" hint="A darker veil over photo wallpapers, for readable text.">
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={canvas?.look.overlay ?? 15}
            onChange={(e) =>
              void window.orbit.invoke('canvas:setDim', { overlay: Number(e.target.value) })
            }
            aria-label="Dim photos"
            className="w-40 accent-[var(--accent-fill)]"
            data-testid="ui-dim"
          />
        </Row>
      </Group>

      <Group title="Browser layout">
        <Row label="Tab layout" hint="Tabs in the sidebar, or as pills across the top.">
          <Segmented
            label="Tab layout"
            value={props.tabLayout}
            onChange={props.onTabLayout}
            options={[
              { value: 'sidebar', label: 'Sidebar' },
              { value: 'top', label: 'Horizontal' },
            ]}
            testId="ui-tab-layout"
          />
        </Row>
        <Row
          label="Pinned apps"
          hint="In their own rail beside the sidebar, or as a grid inside it. With horizontal tabs they’re always in the rail."
        >
          <Segmented
            label="Pinned apps"
            value={prefs.apps}
            onChange={(apps) => set({ apps })}
            options={[
              { value: 'rail', label: 'App rail' },
              { value: 'grid', label: 'Sidebar grid' },
            ]}
            testId="ui-apps"
          />
        </Row>
        <Row
          label="Auto-hide the app rail"
          hint="The rail tucks away; rest the pointer on the window’s left edge to bring it out."
        >
          <Toggle
            checked={prefs.railAutoHide}
            onChange={(railAutoHide) => set({ railAutoHide })}
            label="Auto-hide the app rail"
            testId="ui-rail-autohide"
          />
        </Row>
        <Row
          label="New apps open"
          hint="Where an app you add opens. Each app can be changed in Apps."
        >
          <Segmented
            label="New apps open"
            value={prefs.appOpen}
            onChange={(appOpen) => set({ appOpen })}
            options={[
              { value: 'panel', label: 'Beside the page' },
              { value: 'tab', label: 'As a tab' },
              { value: 'window', label: 'In a window' },
            ]}
            testId="ui-app-open"
          />
        </Row>
      </Group>

      <Group title="Theme">
        <Row label="Font" hint="Orbit’s own text: the sidebar, menus, Settings and its pages.">
          <div
            className="flex max-w-[360px] flex-wrap justify-end gap-1.5"
            role="radiogroup"
            aria-label="Font"
            data-testid="ui-font"
          >
            {FONTS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={prefs.font === f}
                onClick={() => set({ font: f })}
                className={`press rounded-[9px] px-2.5 py-1 text-[13px] ${
                  prefs.font === f
                    ? 'bg-[var(--accent-fill,#2f7d75)] text-on-accent'
                    : 'bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.08]'
                }`}
                style={{ fontFamily: FONT_INFO[f].stack }}
                data-value={f}
              >
                {FONT_INFO[f].label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Appearance" hint="Light, dark, or the same as your Mac.">
          <AppearancePicker value={props.appearance} onChange={props.onAppearance} />
        </Row>
        <Row
          label="Accent colour"
          hint={
            prefs.palette === 'auto'
              ? 'Buttons, switches and highlights. Auto takes it from the wallpaper.'
              : 'Buttons, switches and highlights. Space uses each Space’s colour.'
          }
        >
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="radiogroup"
            aria-label="Accent colour"
            data-testid="ui-accent"
          >
            <Swatch
              on={prefs.accent === null}
              label={prefs.palette === 'auto' ? 'Auto (wallpaper)' : 'Space'}
              color={
                prefs.palette === 'auto' && canvas
                  ? `conic-gradient(${canvas.accent}, ${canvas.accent2}, ${canvas.accent})`
                  : 'conic-gradient(#5b5bd6, #0f9488, #e8590c, #d6336c, #5b5bd6)'
              }
              onClick={() => set({ accent: null })}
              value="space"
            />
            {ACCENTS.map((a) => (
              <Swatch
                key={a.hex}
                on={prefs.accent?.toLowerCase() === a.hex}
                label={a.name}
                color={a.hex}
                onClick={() => set({ accent: a.hex })}
                value={a.hex}
              />
            ))}
          </div>
        </Row>
      </Group>

      <Group title="Layout">
        <Row
          label="Text size"
          hint="Orbit’s own pages: the Homepage, Settings, the side panel, the Library."
        >
          <div
            className="flex items-end gap-1"
            role="radiogroup"
            aria-label="Text size"
            data-testid="ui-text-size"
          >
            {(['small', 'default', 'large', 'larger'] as const).map((size, i) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={prefs.textSize === size}
                aria-label={size}
                title={size[0]!.toUpperCase() + size.slice(1)}
                onClick={() => set({ textSize: size })}
                className={`grid h-9 w-10 place-items-center rounded-[var(--radius-control)] font-semibold ${
                  prefs.textSize === size
                    ? 'bg-neutral-100 text-neutral-900 shadow-[inset_0_0_0_1.5px_var(--accent-fill)]'
                    : 'text-neutral-500 hover:bg-neutral-50'
                }`}
                style={{ fontSize: 12 + i * 2.5 }}
                data-value={size}
              >
                Aa
              </button>
            ))}
          </div>
        </Row>
        <Row label="Density" hint="How much room rows get in the sidebar.">
          <Segmented
            label="Density"
            value={prefs.density}
            onChange={(density) => set({ density })}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'spacious', label: 'Spacious' },
            ]}
            testId="ui-density"
          />
        </Row>
        <Row
          label="Surfaces"
          hint="Glass lets the desktop and page show through the sidebar and menus. Solid is clearer and lighter on the Mac."
        >
          <Segmented
            label="Surfaces"
            value={prefs.surfaces}
            onChange={(surfaces) => set({ surfaces })}
            options={[
              { value: 'glass', label: 'Glass' },
              { value: 'solid', label: 'Solid' },
            ]}
            testId="ui-surfaces"
          />
        </Row>
        <Row
          label="Reduce motion"
          hint="No sliding or bouncing — only quick fades. Also on when your Mac’s Reduce Motion is."
        >
          <Toggle
            checked={prefs.motion === 'reduced'}
            onChange={(on) => set({ motion: on ? 'reduced' : 'full' })}
            label="Reduce motion"
            testId="ui-reduce-motion"
          />
        </Row>
      </Group>

      <Group title="Show in Orbit">
        {FEATURES.map((f) => (
          <Row
            key={f}
            label={FEATURE_LABEL[f].label}
            hint={`${FEATURE_LABEL[f].hint}. Hiding never deletes anything.`}
          >
            <Toggle
              checked={shown(f)}
              onChange={(on) =>
                set({ hidden: on ? prefs.hidden.filter((h) => h !== f) : [...prefs.hidden, f] })
              }
              label={`Show ${FEATURE_LABEL[f].label}`}
              testId={`ui-show-${f}`}
            />
          </Row>
        ))}
      </Group>
    </Section>
  );
}

function Swatch(props: {
  on: boolean;
  label: string;
  color: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.on}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`size-6 rounded-full transition-shadow ${
        props.on
          ? 'shadow-[0_0_0_2px_var(--color-white),0_0_0_4px_var(--accent-fill)]'
          : 'shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] hover:scale-110'
      }`}
      style={{ background: props.color }}
      data-value={props.value}
    />
  );
}

const APPEARANCES: { value: UserSettings['appearance']; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System', icon: <Monitor size={11} /> },
  { value: 'light', label: 'Light', icon: <Sun size={11} /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={11} /> },
];

/** A tiny Orbit window in a mode: sidebar, page card (Settings → Appearance's picture cards). */
function WindowPreview({ mode }: { mode: 'light' | 'dark' }) {
  const dark = mode === 'dark';
  return (
    <span
      className="flex h-full w-full gap-[3px] p-[4px]"
      style={{ background: dark ? '#221b33' : '#e6e1f3' }}
    >
      <span className="flex w-[30%] flex-col gap-[3px] pt-[6px]">
        {[0.9, 0.6, 0.6].map((o, i) => (
          <span
            key={i}
            className="h-[3px] rounded-full"
            style={{
              background: dark ? `rgb(255 255 255 / ${o * 0.5})` : `rgb(0 0 0 / ${o * 0.3})`,
            }}
          />
        ))}
      </span>
      <span
        className="flex-1 rounded-[3px] shadow-[0_1px_2px_rgb(0_0_0/0.2)]"
        style={{ background: dark ? '#2a2a31' : '#ffffff' }}
      />
    </span>
  );
}

/** Settings → Appearance: System, Light or Dark, as small pictures of Orbit. */
function AppearancePicker(props: {
  value: UserSettings['appearance'];
  onChange: (value: UserSettings['appearance']) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-3"
      data-testid="setting-appearance"
    >
      {APPEARANCES.map((a) => {
        const on = props.value === a.value;
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => props.onChange(a.value)}
            className="group flex flex-col items-center gap-1.5"
            data-value={a.value}
          >
            <span
              className={`relative block h-[46px] w-[68px] overflow-hidden rounded-[9px] transition-shadow ${
                on
                  ? 'shadow-[0_0_0_2px_var(--accent-fill)]'
                  : 'shadow-[0_0_0_1px_rgb(0_0_0/0.1)] group-hover:shadow-[0_0_0_1px_rgb(0_0_0/0.25)]'
              }`}
            >
              {a.value === 'system' ? (
                <>
                  <span className="absolute inset-0">
                    <WindowPreview mode="light" />
                  </span>
                  <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
                    <WindowPreview mode="dark" />
                  </span>
                </>
              ) : (
                <WindowPreview mode={a.value} />
              )}
            </span>
            <span
              className={`flex items-center gap-1 text-meta ${on ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}
            >
              {a.icon}
              {a.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A theme template as a little window: its light or dark, its accent, its font. */
function TemplateCard(props: {
  template: (typeof THEME_TEMPLATES)[number];
  on: boolean;
  onPick: () => void;
}) {
  const { template: t, on } = props;
  const dark = t.appearance === 'dark';
  const accent = t.look.accent ?? '#2f7d75';
  const surface =
    t.appearance === 'system'
      ? 'linear-gradient(135deg, #f4f4f6 0 50%, #26262c 50% 100%)'
      : dark
        ? '#26262c'
        : '#f4f4f6';
  return (
    <button
      type="button"
      onClick={props.onPick}
      aria-pressed={on}
      className={`press flex flex-col gap-1.5 rounded-[12px] p-1.5 text-left ${
        on ? 'ring-2 ring-[var(--accent-fill,#2f7d75)]' : 'hover:bg-black/[0.04]'
      }`}
      data-testid="theme-template"
      data-id={t.id}
    >
      <span
        className="relative flex h-16 overflow-hidden rounded-[9px] shadow-[0_0_0_0.5px_rgb(0_0_0/0.15)]"
        style={{ background: surface }}
      >
        <span
          className={`flex w-[34%] flex-col gap-1 p-1.5 ${
            t.look.surfaces === 'glass'
              ? 'bg-white/25 backdrop-blur'
              : dark
                ? 'bg-black/30'
                : 'bg-black/[0.06]'
          }`}
        >
          <span className="h-1.5 rounded-full" style={{ background: accent }} />
          <span className="h-1 w-3/4 rounded-full bg-current opacity-25" />
          <span className="h-1 w-2/3 rounded-full bg-current opacity-25" />
        </span>
        <span
          className="grid flex-1 place-items-center text-[20px] font-semibold"
          style={{
            fontFamily: FONT_INFO[t.look.font].stack,
            // Half light, half dark ("same as your Mac"): the letters invert to read on both.
            ...(t.appearance === 'system'
              ? { color: '#fff', mixBlendMode: 'difference' as const }
              : { color: dark ? '#fff' : '#1c1c1f' }),
          }}
        >
          Aa
        </span>
      </span>
      <span className="px-0.5">
        <span className="block text-[12.5px] font-semibold">{t.name}</span>
        <span className="block text-[11px] leading-snug opacity-60">{t.hint}</span>
      </span>
    </button>
  );
}
