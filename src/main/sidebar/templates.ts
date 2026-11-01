import type { TemplateRepository } from '../persistence/repositories/templates';
import type { Space } from '../persistence/repositories/sidebar';
import type { SidebarStore } from './store';
import { templateTabs } from './template-model';

/** Saves a Space's tabs, icon and colours as a template (roadmap P2.5). Null if it has no
 *  web pages to keep. */
export function saveSpaceAsTemplate(
  store: SidebarStore,
  templates: TemplateRepository,
  spaceId: string,
): { id: string; name: string; tabs: number } | null {
  const space = store.space(spaceId);
  if (!space) return null;
  const tabs = templateTabs(store.rows('pinned', space), store.rows('today', space));
  if (tabs.length === 0) return null;
  const id = templates.add({ name: space.name, icon: space.icon, theme: space.theme, tabs });
  return { id, name: space.name, tabs: tabs.length };
}

/** A new Space from a template: its icon, colours and tabs (pinned and Today, in order). */
export function spaceFromTemplate(
  store: SidebarStore,
  templates: TemplateRepository,
  templateId: string,
  options: { profileId: string; name?: string },
): Space | null {
  const template = templates.get(templateId);
  if (!template) return null;
  const space = store.createSpace({
    name: (options.name ?? template.name).slice(0, 40),
    icon: template.icon,
    profileId: options.profileId,
    theme: template.theme,
  });
  for (const tab of template.tabs) {
    store.insert(
      { kind: 'tab', title: tab.title, url: tab.url, favicon: null },
      {
        section: tab.section,
        profileId: options.profileId,
        spaceId: space.id,
        parentId: null,
        beforeId: null,
      },
    );
  }
  return space;
}
