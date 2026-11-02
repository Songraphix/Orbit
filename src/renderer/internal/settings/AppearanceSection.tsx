import { useState } from 'react';
import type { ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ACCENTS, FEATURES, FEATURE_LABEL } from '@shared/ui-prefs';
import type { UiPrefs } from '@shared/ui-prefs';
import type { UserSettings } from '@shared/settings';
import { useUiPrefs } from '../../ui/prefs-store';
import { Segmented } from '../../ui/Segmented';
import { Toggle } from '../../ui/Toggle';
import { Group, Row, Section } from './parts';

/**
 * Settings → Appearance (brief M2, the customization engine): light or dark, accent, text
 * size, density, glass or solid surfaces, motion, and which features show. One place for all
 * of it; every part of Orbit follows at once.
 */
export function AppearanceSection(props: {
  appearance: UserSettings['appearance'];
  onAppearance: (value: UserSettings['appearance']) => void;
}) {
  const stored = useUiPrefs();
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
      <Group title="Theme">
        <Row label="Appearance" hint="Light, dark, or the same as your Mac.">
          <AppearancePicker value={props.appearance} onChange={props.onAppearance} />
        </Row>
        <Row
          label="Accent colour"
          hint="Buttons, switches and highlights. Space uses each Space’s colour."
        >
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="radiogroup"
            aria-label="Accent colour"
            data-testid="ui-accent"
          >
            <Swatch
              on={prefs.accent === null}
              label="Space"
              color="conic-gradient(#5b5bd6, #0f9488, #e8590c, #d6336c, #5b5bd6)"
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
