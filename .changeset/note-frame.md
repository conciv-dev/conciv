---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

The host always draws a note's frame: a plugin's `NoteCard` draws only the inside, now shown framed like the host chip, and a taller inside grows the frame. Public surface: `@conciv/ui-kit-chat` exports `NoteFrame` (`NoteFrameProps`: `children`, `wide`), the note card frame in its staged and wide forms.
