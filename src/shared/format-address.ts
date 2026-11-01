/**
 * How the compact toolbar shows a page (F-14): "youtube.com / Video title".
 * Pure, shared by the shell and tests.
 */
export type AddressParts = { domain: string; title: string; secure: boolean };

export function formatAddress(url: string, title: string): AddressParts {
  if (url.startsWith('orbit://')) {
    return { domain: '', title: title || 'New Tab', secure: true };
  }
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, '') + (parsed.port ? `:${parsed.port}` : '');
    const cleanTitle =
      title && title !== url ? title : parsed.pathname === '/' ? '' : parsed.pathname;
    return { domain, title: cleanTitle, secure: parsed.protocol === 'https:' };
  } catch {
    return { domain: url, title, secure: false };
  }
}
