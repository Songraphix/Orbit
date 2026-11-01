import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_ID } from '@shared/types/space';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { SidebarRepository } from '../../src/main/persistence/repositories/sidebar';
import { TemplateRepository } from '../../src/main/persistence/repositories/templates';
import { SidebarStore } from '../../src/main/sidebar/store';
import { templateTabs } from '../../src/main/sidebar/template-model';
import { saveSpaceAsTemplate, spaceFromTemplate } from '../../src/main/sidebar/templates';

const row = (
  kind: string,
  title: string,
  url: string | null,
  titleOverride: string | null = null,
) => ({
  item: { kind, title, url, titleOverride },
});

describe('templateTabs', () => {
  it('keeps web pages, pinned then Today, in order, once each', () => {
    expect(
      templateTabs(
        [
          row('folder', 'Refs', null),
          row('tab', 'Figma', 'https://figma.com/'),
          row('tab', 'Docs', 'https://docs.example/', 'My Docs'),
        ],
        [
          row('tab', 'New Tab', 'orbit://newtab'),
          row('tab', 'Figma again', 'https://figma.com/'),
          row('tab', 'Colours', 'https://coolors.co/'),
        ],
      ),
    ).toEqual([
      { section: 'pinned', title: 'Figma', url: 'https://figma.com/' },
      { section: 'pinned', title: 'My Docs', url: 'https://docs.example/' },
      { section: 'today', title: 'Colours', url: 'https://coolors.co/' },
    ]);
  });

  it('stops at 40 tabs', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      row('tab', `T${i}`, `https://e.example/${i}`),
    );
    expect(templateTabs(many, [])).toHaveLength(40);
  });
});

describe('workspace templates', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const setup = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return {
      store: new SidebarStore(new SidebarRepository(db)),
      templates: new TemplateRepository(db),
    };
  };

  it('saves a Space and makes new Spaces from it, tabs in order', () => {
    const { store, templates } = setup();
    const design = store.createSpace({
      name: 'Design',
      icon: 'star',
      profileId: DEFAULT_PROFILE_ID,
    });
    const at = (section: 'pinned' | 'today') => ({
      section,
      profileId: DEFAULT_PROFILE_ID,
      spaceId: design.id,
      parentId: null,
      beforeId: null,
    });
    store.insert({ kind: 'tab', title: 'Figma', url: 'https://figma.com/' }, at('pinned'));
    store.insert({ kind: 'tab', title: 'Canva', url: 'https://canva.com/' }, at('pinned'));
    store.insert({ kind: 'tab', title: 'Brief', url: 'https://docs.example/brief' }, at('today'));

    const saved = saveSpaceAsTemplate(store, templates, design.id);
    expect(saved).toMatchObject({ name: 'Design', tabs: 3 });
    expect(templates.list()[0]).toMatchObject({ name: 'Design', icon: 'star' });

    const fresh = spaceFromTemplate(store, templates, saved!.id, {
      profileId: DEFAULT_PROFILE_ID,
      name: 'Client B',
    })!;
    expect(fresh).toMatchObject({ name: 'Client B', icon: 'star' });
    expect(store.rows('pinned', fresh).map((r) => r.item.title)).toEqual(['Figma', 'Canva']);
    expect(store.rows('today', fresh).map((r) => r.item.url)).toEqual([
      'https://docs.example/brief',
    ]);

    templates.rename(saved!.id, '  Design kit ');
    expect(templates.get(saved!.id)?.name).toBe('Design kit');
    templates.delete(saved!.id);
    expect(templates.list()).toEqual([]);
    expect(
      spaceFromTemplate(store, templates, saved!.id, { profileId: DEFAULT_PROFILE_ID }),
    ).toBeNull();
  });

  it('won’t save a Space with nothing to keep', () => {
    const { store, templates } = setup();
    const empty = store.createSpace({ name: 'Empty', icon: 'star', profileId: DEFAULT_PROFILE_ID });
    expect(saveSpaceAsTemplate(store, templates, empty.id)).toBeNull();
  });
});
