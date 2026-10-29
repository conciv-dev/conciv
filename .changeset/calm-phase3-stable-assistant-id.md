---
'@conciv/core': patch
---

The assistant message id core persists into the run log now matches the id the wire chunks
carry. When a harness adapter forwards a text chunk with no `messageId`, core mints one id per
message and stamps it into every chunk of that message before it is folded into the run log and
before it is forwarded to the client, instead of letting core's internal `StreamProcessor` and the
client's independent one each mint their own random id from the same id-less chunk.
