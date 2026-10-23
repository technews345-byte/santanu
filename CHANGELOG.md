# Prabhat changes

## Prepared update — 23 October 2026

This update is saved locally. It has not been uploaded to GitHub or published as a GitHub Release. The local APK is version **1.0.26**, build **26**; the existing public download remains build **25**.

### Playback

- Count repeats after a recording finishes, then restart the same mantra until the requested count is reached.
- Handle end-of-recording notifications together so the final audio boundary is not processed twice.
- Resolve included audio using the current app's resource IDs, avoiding reliance on numeric IDs saved by an older installation.
- Keep single-play, resumed-session, continuous, and changed-repeat-setting behavior covered by regression tests.

The Mahalakshmi recording itself remains approximately 15 seconds long. The change does not add or replace audio. The exact cause of the stopping reported on the user's phone has not been reproduced on that phone.

### Visitor documentation

- Add a Prabhat introduction and published APK link to the repository README.
- Expand the app README with all three mantras, recording lengths, available written words, initial schedules, and repeat counts.
- Explain installation, playback controls, imported audio, scheduling, fade-in, sleep timers, reminders, appearance, permissions, privacy, and troubleshooting.
- Keep the existing published download separate from the locally prepared update.

### Validation

- **19 automated tests passed**, including five new repeat-playback tests.
- Debug and release source compilation completed.
- The signed release APK built successfully as version 1.0.26, build 26.
- The bundled Mahalakshmi audio decoded without errors during a full-file decoding check.
- Playback on a physical phone has not been verified.
