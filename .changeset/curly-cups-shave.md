---
'@conciv/db': patch
---

Anchor the transcript merge on native harness record ids and make run records durable.

The CLI transcript is now sliced at the native record id of the last folded message instead of by matching prompt text, so a turn whose stored copy carries no matching text (an image-only prompt) no longer replays the CLI copy alongside it. Claude, pi, and opencode transcripts mint message ids from their own record identity; codex envelopes carry none, so those keep positional ids and the prompt-boundary fallback.

Run status, timestamps, and terminal error now persist in a runId-keyed `runs` table, so a subscriber attaching after a server restart still gets the finished run's timing and failure reason. Runs left mid-flight by a dead server are marked aborted when the database reopens.
