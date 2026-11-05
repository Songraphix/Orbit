import { useEffect, useState } from 'react';
import type { DriveStatus } from '@shared/drive';
import { buttonClass } from '../../ui/controls';
import { Group, Row } from './parts';

/**
 * Settings → Integrations → Google Drive (roadmap R2 M3): connect a Google account, read-only;
 * says exactly what Orbit may do with it, and disconnects (revoking access at Google).
 */
export function DriveGroup() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  useEffect(() => {
    void window.orbit.invoke('drive:status', {}).then(setStatus);
    return window.orbit.on('drive:update', setStatus);
  }, []);
  if (!status) return null;
  return (
    <Group title="Google Drive">
      <Row
        label={
          status.connected
            ? `Connected${status.email ? ` as ${status.email}` : ''}`
            : 'Find and read your Drive files'
        }
        hint={
          status.connected
            ? 'Your Drive files show in the command bar as you type, and Orbit AI can search and read them when you ask (Settings → AI). Read-only: Orbit can’t change, share or delete anything.'
            : status.available
              ? 'Read-only. Opens Google in your browser to choose an account. Nothing is copied or indexed ahead of time — Drive is asked when you search, or when Orbit AI reads a file for you (its text then goes to Anthropic with your question).'
              : 'Google sign-in isn’t set up in this build of Orbit.'
        }
      >
        {status.connected ? (
          <button
            type="button"
            className={buttonClass()}
            onClick={() => void window.orbit.invoke('drive:disconnect', {}).then(setStatus)}
            data-testid="drive-disconnect"
          >
            Disconnect
          </button>
        ) : status.busy ? (
          <div className="flex items-center gap-2">
            <span className="text-meta text-neutral-500">Waiting for your browser…</span>
            <button
              type="button"
              className={buttonClass()}
              onClick={() => void window.orbit.invoke('drive:cancel', {})}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={!status.available}
            onClick={() => void window.orbit.invoke('drive:connect', {}).then(setStatus)}
            data-testid="drive-connect"
          >
            Connect Google Drive
          </button>
        )}
      </Row>
      {status.error && (
        <p className="px-4 py-3 text-meta text-red-600" role="alert" data-testid="drive-error">
          {status.error}
        </p>
      )}
    </Group>
  );
}
