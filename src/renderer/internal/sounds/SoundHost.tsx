import { useEffect } from 'react';
import { SoundEngine } from './engine';

/**
 * orbit://sounds: the hidden page that plays focus sounds. Main opens it (in a window that's
 * never shown) while something plays, and tells it what to play and how loud.
 */
export function SoundHost() {
  useEffect(() => {
    const engine = new SoundEngine();
    const off = window.orbit.on('sounds:update', (state) => engine.apply(state));
    void window.orbit.invoke('sounds:get', {}).then((state) => engine.apply(state));
    return off;
  }, []);
  return null;
}
