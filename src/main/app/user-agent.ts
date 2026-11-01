/**
 * A clean Chrome user agent (PLAN.md section 4.9 #1). Electron's default UA includes
 * "Electron/x.y" and the app name, which some sites (notably Google sign-in) treat as an
 * "embedded browser" and refuse. Chrome itself reports a reduced UA: frozen macOS version and
 * only the major Chrome version.
 */
export function chromeUserAgent(chromeVersion: string): string {
  const major = chromeVersion.split('.')[0] || '0';
  return (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  );
}
