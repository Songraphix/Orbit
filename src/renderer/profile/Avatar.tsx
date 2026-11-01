import { profileInitials } from '@shared/profile';
import type { ProfileView } from '@shared/profile';

/** A profile's avatar: its emoji, or its initials, on its colour. */
export function Avatar({
  profile,
  size,
  ring = false,
}: {
  profile: Pick<ProfileView, 'name' | 'avatar' | 'color'>;
  size: number;
  /** A light ring round it (the big avatar in the menu). */
  ring?: boolean;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white select-none"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, color-mix(in srgb, ${profile.color} 78%, white), ${profile.color})`,
        fontSize: profile.avatar ? size * 0.56 : size * 0.4,
        boxShadow: ring
          ? `0 0 0 2.5px rgb(255 255 255 / 0.9), 0 6px 18px -6px ${profile.color}`
          : 'inset 0 0 0 0.5px rgb(255 255 255 / 0.25)',
      }}
      aria-hidden
    >
      {profile.avatar || profileInitials(profile.name)}
    </span>
  );
}
