---
'@conciv/ui-kit-chat': patch
'@conciv/client': patch
---

Retire the `Activity.Now` narration surface: the pin above the composer is rendered from `NowLine`
fed by the thread grouping store, so the parallel activity-store copy is gone. `useChatSession` now
exposes a non-suspending `sessionRunning` signal derived from run lifecycle events, so a pane that
joins a turn another client started narrates it too.
