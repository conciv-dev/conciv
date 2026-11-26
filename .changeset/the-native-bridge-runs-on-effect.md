---
'@conciv/plugin-ios': patch
'@conciv/app': patch
---

The iOS plugin's native bridge now runs as a pure state machine driven by Effect: the 300 ms ready loop, the 10 s grab pick deadline and the stale-result checks are Effect schedules and attempt ids instead of timers and closure flags. The messages sent to the app are unchanged, so the Swift SDK needs no update. A timed out, failed or unreadable pick now fails with a named error (`Ios.PickTimedOut`, `Ios.PickFailed`, `Ios.PickUnparseable`).
