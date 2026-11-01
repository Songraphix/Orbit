import { Pause, PictureInPicture2, Play, Volume2, VolumeX, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MediaState } from '@shared/types/media';

const control = (action: 'toggle' | 'mute' | 'pip' | 'focus' | 'close') =>
  void window.orbit.invoke('media:control', { action });

/**
 * The sidebar mini player (F-09, Img 1): what's playing in a tab you're not looking at. Title
 * jumps to the tab; play/pause, mute and Picture-in-Picture act on the page; × stops it.
 */
export function MediaCard({ media }: { media: NonNullable<MediaState> }) {
  return (
    <div
      className="no-drag mx-2 mb-1 rounded-xl bg-[var(--tile-bg)] p-2 shadow-sm"
      data-testid="media-card"
      data-playing={media.playing}
    >
      <div className="flex items-center gap-2">
        {media.favicon && <img src={media.favicon} alt="" className="size-4 shrink-0 rounded-sm" />}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline"
          title="Go to tab"
          onClick={() => control('focus')}
          data-testid="media-title"
        >
          {media.title}
        </button>
        {media.hasVideo && (
          <MediaButton label="Picture in Picture" onClick={() => control('pip')}>
            <PictureInPicture2 size={14} />
          </MediaButton>
        )}
        <MediaButton label="Stop" onClick={() => control('close')} testId="media-close">
          <X size={14} />
        </MediaButton>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-3">
        <MediaButton
          label={media.playing ? 'Pause' : 'Play'}
          onClick={() => control('toggle')}
          testId="media-toggle"
          big
        >
          {media.playing ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </MediaButton>
        <MediaButton
          label={media.muted ? 'Unmute' : 'Mute'}
          onClick={() => control('mute')}
          testId="media-mute"
        >
          {media.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </MediaButton>
      </div>
    </div>
  );
}

function MediaButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`grid place-items-center rounded-lg opacity-80 hover:bg-[var(--hover)] hover:opacity-100 ${
        props.big ? 'size-8' : 'size-6'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
