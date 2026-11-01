import { defaultProfileColor } from '@shared/profile';
import type { ProfileView } from '@shared/profile';
import { DEFAULT_PROFILE_ID } from '@shared/types/space';
import type { Profile } from '../persistence/repositories/sidebar';

/** What renderers see of a profile (never its storage partition). Pure. */
export function profileView(profile: Profile): ProfileView {
  return {
    id: profile.id,
    name: profile.name,
    displayName: profile.displayName,
    avatar: profile.avatar,
    color: profile.color || defaultProfileColor(profile.id),
    isDefault: profile.id === DEFAULT_PROFILE_ID,
  };
}
