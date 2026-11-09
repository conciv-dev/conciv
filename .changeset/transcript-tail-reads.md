---
'@conciv/harness': patch
'@conciv/protocol': patch
'@conciv/core': patch
---

Session previews read a native transcript from its end: `HarnessHistory.tail(cwd, id, {limit, before, signal})` returns one page and an opaque cursor for the page above, so a preview of a 124 MB Claude transcript reads a few hundred KB instead of the whole file. Claude and Codex message ids without a native id are now the byte offset of their opening line (`o<offset>`), so full reads and tails agree; a Codex session imported under the old positional ids re-imports once.
