---
'@conciv/plugin-recorder': patch
---

New package `@conciv/plugin-recorder`: the recorder as a conciv plugin. Its browser part records the page it runs in while a recording is live (a Recorder tab is open, or the agent started one) and the page plugin is active, leaving the widget out through the page plugin's `capture.exclude`; the Recorder tab replays the recording live, starts a New recording and exports it as a video (Export video). The agent drives it from code mode as `external_recording_start()`, `external_recording_stop({captureId, keyframes?})` and `external_recording_pull({secondsBack?, keyframes?})`, guided by the plugin's `recorder` skill. Enable it with `plugins: ['@conciv/plugin-recorder']` (or `['@conciv/plugin-recorder', {masking, windowMinutes, console}]`).
