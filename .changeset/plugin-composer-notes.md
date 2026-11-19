---
'@conciv/plugin': patch
'@conciv/embed': patch
---

A plugin's `Composer.attach` attaches a note to the next prompt, keyed by its `origin` and `commentId`: a second attach of the same note keeps the first. `Composer.update` changes an attached note's comment and `Composer.detach` removes it; both are now always defined. Each waits for the session's draft, as `insert` does, and the note is saved with the draft. Attaching a file or a quote still logs and attaches nothing.

A plugin's `NoteCard` now also draws its notes in the sent message, falling back to the host chip as in the composer. Public surface: `NoteCardProps.note` has `commentId` optional, because a sent note has none.
