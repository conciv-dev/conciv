---
'@conciv/ui-kit-chat': patch
---

Keep one narration line mounted for the whole run. It used to be handed off between a row inside the running chain group and a copy below the transcript, so every time streaming moved between a thinking, tool-call, and text part the line unmounted and remounted — the spinner reset and the line appeared to blink. The chain group no longer hosts a narration row at all (`Trace` loses its `now` slot); the single line lives in the transcript flow after the last message, aligned to the trace gutter, and is gated only on whether the run is live.
