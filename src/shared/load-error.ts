/**
 * Why a page couldn't load, in plain words (the panel's and the tab's error card). Codes are
 * Chromium's net errors (net/base/net_error_list.h), as Electron's `did-fail-load` reports
 * them. Pure.
 */
export type LoadErrorText = { title: string; detail: string };

/** A navigation that was stopped or replaced (not a failure to show). */
export const ERR_ABORTED = -3;

export function loadErrorText(code: number, host: string): LoadErrorText {
  const site = host || 'This site';
  switch (code) {
    case -106: // INTERNET_DISCONNECTED
      return { title: 'You’re offline', detail: 'Check your connection, then try again.' };
    case -21: // NETWORK_CHANGED
      return { title: 'The network changed', detail: 'Try again once you’re connected.' };
    case -105: // NAME_NOT_RESOLVED
    case -137: // NAME_RESOLUTION_FAILED
      return {
        title: 'Can’t find this site',
        detail: `${site}’s address couldn’t be found. Check the spelling, or your connection.`,
      };
    case -102: // CONNECTION_REFUSED
      return { title: 'Can’t connect', detail: `${site} refused the connection.` };
    case -7: // TIMED_OUT
    case -118: // CONNECTION_TIMED_OUT
      return { title: 'This site is taking too long', detail: `${site} didn’t respond in time.` };
    case -100: // CONNECTION_CLOSED
    case -101: // CONNECTION_RESET
    case -324: // EMPTY_RESPONSE
      return { title: 'The connection dropped', detail: `${site} closed the connection.` };
    case -312: // UNSAFE_PORT
      return {
        title: 'Orbit won’t open this address',
        detail: `${site} uses a port browsers keep closed for safety.`,
      };
    case -27: // BLOCKED_BY_RESPONSE (e.g. it refuses to be shown inside another page)
    case -20: // BLOCKED_BY_CLIENT
      return { title: 'This page was blocked', detail: 'Open it as a tab instead.' };
    default:
      if (code <= -200 && code > -300) {
        return {
          title: 'This connection isn’t private',
          detail: `${site}’s security certificate isn’t valid, so Orbit didn’t open it.`,
        };
      }
      return { title: 'This page couldn’t load', detail: `${site} didn’t load (error ${code}).` };
  }
}
