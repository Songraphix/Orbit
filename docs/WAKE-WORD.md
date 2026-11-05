# "Hey Orbit" — wake-word investigation

Roadmap: `orbit_voice_ai_workspace_roadmap.md`, milestone 5 (stage C of voice). The roadmap asks
to **investigate before deciding**; this is that investigation. Nothing here is built.

## What "Hey Orbit" would need

Always-on listening means the microphone is open whenever Orbit runs, and a small model decides,
many times a second, whether the last ~1.5 s of audio was "Hey Orbit". Only then does Orbit's
existing push-to-talk start (Whisper on the Mac, as today).

## Options

| Approach                                | Where it runs                                                           | Quality                                                        | Cost to us                                                                              | Notes                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **openWakeWord** (Apache-2.0)           | On the Mac, ONNX (we already ship ONNX Runtime WebAssembly for Whisper) | Good for a custom phrase after training; false accepts tunable | Train a "Hey Orbit" model (synthetic speech, a few hours of compute), ~1–3 MB of models | Best fit: local, open, reuses our runtime. Needs a feature-extraction model + the wake model                                 |
| Picovoice Porcupine                     | On the Mac (WebAssembly/native)                                         | Very good, low CPU                                             | Proprietary; needs an AccessKey and a commercial licence beyond personal use            | Custom words via their console; key and terms are a dependency                                                               |
| Whisper running continuously            | On the Mac                                                              | Excellent words, but it's a transcriber, not a detector        | High CPU/battery (base model every second)                                              | Not suitable for always-on                                                                                                   |
| Chromium/Web Speech recognition         | Google's servers                                                        | —                                                              | —                                                                                       | Doesn't work in Electron (no Google API key), and would stream audio off the Mac: ruled out                                  |
| macOS: Siri / Voice Control / Shortcuts | The system                                                              | Good                                                           | Small: a URL scheme or Shortcut that triggers Orbit's push-to-talk                      | "Hey Siri, Orbit voice" via a Shortcut that opens `orbit://voice` (would need a handler); no always-open mic in Orbit at all |

## Privacy, battery, permissions

- **Privacy:** the microphone would be open all the time Orbit runs. Audio must stay in memory,
  in a ring buffer of ~2 s, processed locally and never stored or sent; only after the wake
  word does push-to-talk start (as today, still on the Mac). macOS shows its orange microphone
  dot for as long as listening is on — users will notice, and should.
- **Battery/CPU:** openWakeWord's models run every 80 ms of audio; in WebAssembly on one thread
  expect a few percent of one core on Apple Silicon — measurable on battery. Pausing when the
  Mac is on battery, the screen is locked, or Orbit is in the background would help.
- **Permissions:** the same microphone permission as push-to-talk; no new entitlements.
- **Consent:** off by default; a clear switch in Settings → Voice explaining the above; a
  visible "listening" indicator in the toolbar; a one-click off; and it stops while another app
  uses the microphone (calls).

## Recommendation

1. **Don't build always-on listening yet.** Push-to-talk (⇧⌘Space) already covers the use
   cases with no open microphone.
2. If the owner wants hands-free: start with the **macOS route** — an `orbit://voice` link (or
   an App Intent later) that a Siri Shortcut can open, starting push-to-talk. No always-open
   microphone in Orbit; Siri's own wake word is already trusted and optimised.
3. Only if that's not enough: **openWakeWord**, trained for "Hey Orbit", opt-in, with the
   safeguards above, measured for false accepts (target < 1 per 10 hours of normal room audio)
   and CPU before shipping.

**Decision needed from the owner** before any of this is built.
