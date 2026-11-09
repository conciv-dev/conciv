---
'@conciv/ui-kit-chat': patch
'@conciv/protocol': patch
'@conciv/ai': patch
'@conciv/app': patch
---

A streamed chunk wakes only the turn and part it changed: turns and each turn's parts are keyed lists, result lookups wake only the row whose result arrives, pane-level readers (dividers, stopped line, harness label, narration, permission asks, older-messages, load failure) stop scanning every message, and tool durations live in one pane-level record that folds only the live turn per chunk, so a row reads its call's duration (`ToolViewCtx.durationFor(toolCallId)`) and wakes only when that entry changes.
