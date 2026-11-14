---
'@conciv/plugin-recorder': patch
---

New package `@conciv/plugin-recorder`: the engine part of the recorder as a conciv plugin. Enable it with `plugins: ['@conciv/plugin-recorder']` (or `['@conciv/plugin-recorder', {masking, windowMinutes, console}]`). The agent drives it from code mode as `external_recording_start()`, `external_recording_stop({captureId, keyframes?})` and `external_recording_pull({secondsBack?, keyframes?})`, guided by the plugin's `recorder` skill. The `recorder` plugin RPC takes the page's rrweb events (`flush`) and answers `config`, `clients`, `window`, `since`, `log`, `state`, `presence`, `reset`, `recordings.save` and `recordings.get`; its `control` and `appended` events carry ids and a cursor only.
