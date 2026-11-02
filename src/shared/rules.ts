import { z } from 'zod';

/**
 * User-defined rules (roadmap P4.4): small "when … then …" automations you set up in Settings.
 *
 * - Link routing: a link from another app whose address matches goes to a Space you choose (or
 *   Little Orbit, or wherever you are) instead of the usual Little Orbit.
 * - Auto-archive: a Space's own "archive Today tabs after…" instead of the global one.
 *
 * Pure.
 */

export const LINK_TARGETS = ['space', 'little', 'current'] as const;

export const linkRuleSchema = z.object({
  id: z.string(),
  kind: z.literal('link'),
  enabled: z.boolean(),
  /** "figma.com", "*.atlassian.net", "github.com/my-org" — see `matchesPattern`. */
  pattern: z.string().min(1).max(200),
  target: z.enum(LINK_TARGETS),
  /** For target 'space'. */
  spaceId: z.string().max(64).nullable(),
});
export type LinkRule = z.output<typeof linkRuleSchema>;

export const ARCHIVE_AFTER = ['12h', '24h', '7d', '30d', 'never'] as const;

export const archiveRuleSchema = z.object({
  id: z.string(),
  kind: z.literal('archive'),
  enabled: z.boolean(),
  spaceId: z.string().max(64),
  after: z.enum(ARCHIVE_AFTER),
});
export type ArchiveRule = z.output<typeof archiveRuleSchema>;

export const ruleSchema = z.discriminatedUnion('kind', [linkRuleSchema, archiveRuleSchema]);
export type Rule = z.output<typeof ruleSchema>;
export const rulesSchema = z.array(ruleSchema).max(100);

/** A rule as typed in Settings (no id yet). */
export const ruleInputSchema = z.discriminatedUnion('kind', [
  linkRuleSchema.omit({ id: true }),
  archiveRuleSchema.omit({ id: true }),
]);
export type RuleInput = z.output<typeof ruleInputSchema>;

/** A pattern as typed, tidied: no scheme, no "www.", lower case, no trailing slash. */
export function cleanPattern(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/** Why a pattern can't be used, or null. */
export function patternProblem(input: string): string | null {
  const pattern = cleanPattern(input);
  if (!pattern) return 'Type a site, like figma.com';
  const [host = ''] = pattern.split('/');
  if (!/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && host !== 'localhost') {
    return 'Type a site, like figma.com or *.atlassian.net';
  }
  return null;
}

/**
 * Whether `url` matches `pattern`: "figma.com" matches figma.com and its subdomains;
 * "*.atlassian.net" only subdomains; "github.com/my-org" that site under that path.
 */
export function matchesPattern(pattern: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const clean = cleanPattern(pattern);
  const slash = clean.indexOf('/');
  const hostPart = slash === -1 ? clean : clean.slice(0, slash);
  const pathPart = slash === -1 ? '' : clean.slice(slash);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const hostOk = hostPart.startsWith('*.')
    ? host.endsWith(hostPart.slice(1)) && host !== hostPart.slice(2)
    : host === hostPart || host.endsWith(`.${hostPart}`);
  if (!hostOk) return false;
  if (!pathPart) return true;
  const path = parsed.pathname.toLowerCase();
  return path === pathPart || path.startsWith(`${pathPart}/`);
}

/** The first enabled link rule that matches `url` (rules are tried in order). */
export function routeLink(rules: readonly Rule[], url: string): LinkRule | null {
  for (const rule of rules) {
    if (rule.kind === 'link' && rule.enabled && matchesPattern(rule.pattern, url)) return rule;
  }
  return null;
}

/** A Space's own archive setting, if a rule gives it one. */
export function archiveAfterFor(
  rules: readonly Rule[],
  spaceId: string,
): (typeof ARCHIVE_AFTER)[number] | null {
  const rule = rules.find((r) => r.kind === 'archive' && r.enabled && r.spaceId === spaceId);
  return rule?.kind === 'archive' ? rule.after : null;
}

/** "Links to figma.com open in Design" — a rule in words. */
export function describeRule(rule: Rule, spaceName: (id: string | null) => string): string {
  if (rule.kind === 'archive') {
    const when =
      rule.after === 'never'
        ? 'are never archived'
        : `are archived after ${rule.after.replace('h', ' hours').replace('d', ' days')}`;
    return `Today tabs in ${spaceName(rule.spaceId)} ${when}`;
  }
  const where =
    rule.target === 'space'
      ? `open in ${spaceName(rule.spaceId)}`
      : rule.target === 'little'
        ? 'open in Little Orbit'
        : 'open where you are';
  return `Links to ${cleanPattern(rule.pattern)} ${where}`;
}
