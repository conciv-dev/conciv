---
'@conciv/simulation': patch
---

A kit turn's `send` reads the finish reason where @tanstack/ai puts it on a model call's RUN_FINISHED (`metadata.tanstack.finishReason`), so a turn with tool steps resolves at the end of the run instead of after its first model call.
