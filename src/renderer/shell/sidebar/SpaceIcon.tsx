import {
  BookOpen,
  Briefcase,
  Camera,
  Cloud,
  Code,
  Heart,
  Home,
  Leaf,
  Music,
  Orbit,
  Star,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Arc's icon names (from the importer) and Orbit's own map onto these. */
const ICONS: Record<string, LucideIcon> = {
  planet: Orbit,
  cloud: Cloud,
  cloudoutline: Cloud,
  video: Video,
  briefcase: Briefcase,
  home: Home,
  heart: Heart,
  star: Star,
  music: Music,
  book: BookOpen,
  code: Code,
  camera: Camera,
  leaf: Leaf,
};

/** A space's icon: a named built-in icon, or an emoji. */
export function SpaceIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const Icon = ICONS[icon.toLowerCase().replace(/fill$/, '')];
  if (Icon) return <Icon size={size} strokeWidth={1.9} aria-hidden />;
  // Anything that isn't a known name is shown as-is (emoji).
  if (!/^[a-z]+$/i.test(icon)) {
    return (
      <span style={{ fontSize: size - 1, lineHeight: 1 }} aria-hidden>
        {icon}
      </span>
    );
  }
  return <Orbit size={size} strokeWidth={1.9} aria-hidden />;
}
