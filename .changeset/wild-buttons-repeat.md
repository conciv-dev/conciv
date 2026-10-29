---
'@conciv/core': patch
---

A reload during a live turn no longer replays it. A subscriber joining a session now receives a
catch-up snapshot consolidated from the run's own durable log and resumes at that exact log offset,
so text already in the snapshot is never streamed a second time. The CLI-transcript merge also
anchors on a contiguous prompt boundary instead of the last matching prompt, so repeating an earlier
prompt no longer duplicates every turn between the two.
