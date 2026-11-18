---
'@conciv/core': patch
---

An engine restart no longer forgets a deleted session that never ran, so its id stays deleted. It also keeps a new session that holds a typed draft, with the draft.
