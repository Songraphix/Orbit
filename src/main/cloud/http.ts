/** How Orbit talks to Firebase over HTTPS: a fetch (Electron's, in the app), with a timeout. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The network isn't there (offline, DNS, a timeout): safe to retry later. */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super('Orbit couldn’t reach the internet', { cause });
    this.name = 'OfflineError';
  }
}

/** Firebase said no. `code` is its reason (EMAIL_EXISTS, PERMISSION_DENIED, …). */
export class CloudError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

export const TIMEOUT_MS = 20_000;

/** POST/GET JSON; network trouble becomes OfflineError, an error answer CloudError. */
export async function requestJson(
  fetchImpl: Fetch,
  url: string,
  init: { method?: string; body?: unknown; form?: Record<string, string>; token?: string } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (init.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  if (init.token) headers['authorization'] = `Bearer ${init.token}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: init.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new OfflineError(error);
  }
  const text = await response.text().catch(() => '');
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (a proxy's page, a 502): treated as a server error below.
  }
  if (!response.ok) {
    const error = (json as { error?: { message?: string; status?: string } } | null)?.error;
    // Identity Toolkit puts its reason in `message` ("EMAIL_EXISTS", "WEAK_PASSWORD : …");
    // Firestore in `status` ("PERMISSION_DENIED").
    const fromMessage = error?.message?.split(' ')[0] ?? '';
    const code = /^[A-Z_]+$/.test(fromMessage)
      ? fromMessage
      : error?.status || `HTTP_${response.status}`;
    throw new CloudError(code, error?.message ?? `HTTP ${response.status}`, response.status);
  }
  return json;
}

/** Worth trying again later (network, overload, quota): not a rejection of the request. */
export function isTransient(error: unknown): boolean {
  if (error instanceof OfflineError) return true;
  if (!(error instanceof CloudError)) return false;
  return (
    error.status >= 500 ||
    error.status === 429 ||
    ['UNAVAILABLE', 'ABORTED', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'INTERNAL'].includes(
      error.code,
    )
  );
}
