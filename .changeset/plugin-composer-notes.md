---
'@conciv/plugin': patch
'@conciv/embed': patch
---

A plugin's `Composer.attach` attaches a note to the next prompt, keyed by its `origin` and `commentId`: a second attach of the same note keeps the first. `Composer.update` changes an attached note's comment and `Composer.detach` removes it; both are now always defined. Each waits for the session's draft, as `insert` does, and the note is saved with the draft. Attaching a file or a quote still logs and attaches nothing.
