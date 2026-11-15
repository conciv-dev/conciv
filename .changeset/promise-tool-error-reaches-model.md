---
'@conciv/plugin': patch
'@conciv/chat': patch
---

A plugin tool that throws `toolError({message, metadata})` now fails with its message, where the model used to read `[object Object]`, and the host keeps its metadata: `toolError` returns an `Error` carrying those fields. When the user denies a plugin tool's permission ask and the tool rethrows the rejection, the model is told the user denied the tool instead of getting an empty message.
