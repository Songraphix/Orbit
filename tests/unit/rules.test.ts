import { describe, expect, it } from 'vitest';
import {
  archiveAfterFor,
  cleanPattern,
  describeRule,
  matchesPattern,
  patternProblem,
  routeLink,
} from '@shared/rules';
import type { Rule } from '@shared/rules';

const link = (pattern: string, extra: Partial<Rule> = {}): Rule =>
  ({
    id: pattern,
    kind: 'link',
    enabled: true,
    pattern,
    target: 'space',
    spaceId: 'design',
    ...extra,
  }) as Rule;

describe('link rules', () => {
  it('matches a site and its subdomains, or only subdomains with *.', () => {
    expect(matchesPattern('figma.com', 'https://www.figma.com/file/1')).toBe(true);
    expect(matchesPattern('figma.com', 'https://help.figma.com/')).toBe(true);
    expect(matchesPattern('figma.com', 'https://notfigma.com/')).toBe(false);
    expect(matchesPattern('*.atlassian.net', 'https://acme.atlassian.net/browse/X-1')).toBe(true);
    expect(matchesPattern('*.atlassian.net', 'https://atlassian.net/')).toBe(false);
    expect(matchesPattern('figma.com', 'mailto:a@figma.com')).toBe(false);
  });

  it('matches a path prefix', () => {
    expect(matchesPattern('github.com/acme', 'https://github.com/acme/site/pull/3')).toBe(true);
    expect(matchesPattern('github.com/acme', 'https://github.com/acme')).toBe(true);
    expect(matchesPattern('github.com/acme', 'https://github.com/acme-other/x')).toBe(false);
    expect(matchesPattern('https://www.GitHub.com/Acme/', 'https://github.com/acme/x')).toBe(true);
  });

  it('routes to the first enabled rule that matches', () => {
    const rules = [
      link('github.com/acme', { enabled: false }),
      link('github.com', { spaceId: 'dev' }),
      link('github.com/acme', { spaceId: 'acme' }),
    ];
    expect(routeLink(rules, 'https://github.com/acme/x')?.spaceId).toBe('dev');
    expect(routeLink(rules, 'https://example.com/')).toBeNull();
  });

  it('tidies and checks patterns', () => {
    expect(cleanPattern(' https://www.Figma.com/ ')).toBe('figma.com');
    expect(patternProblem('figma')).toContain('Type a site');
    expect(patternProblem('*.atlassian.net')).toBeNull();
    expect(patternProblem('github.com/acme')).toBeNull();
    expect(patternProblem('')).toBe('Type a site, like figma.com');
  });
});

describe('archive rules', () => {
  it('gives a Space its own archive time, and says it in words', () => {
    const rules: Rule[] = [
      { id: 'a', kind: 'archive', enabled: true, spaceId: 'focus', after: '7d' },
      { id: 'b', kind: 'archive', enabled: false, spaceId: 'off', after: 'never' },
    ];
    expect(archiveAfterFor(rules, 'focus')).toBe('7d');
    expect(archiveAfterFor(rules, 'off')).toBeNull();
    const name = (id: string | null) => (id === 'focus' ? 'Focus' : 'Design');
    expect(describeRule(rules[0]!, name)).toBe('Today tabs in Focus are archived after 7 days');
    expect(describeRule(link('figma.com'), name)).toBe('Links to figma.com open in Design');
    expect(describeRule(link('figma.com', { target: 'little' }), name)).toBe(
      'Links to figma.com open in Little Orbit',
    );
  });
});
