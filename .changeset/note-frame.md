---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

The host always draws a note's frame: a plugin's `NoteCard` draws only the inside, now shown framed like the host chip, a taller inside grows the frame, and a staged note's remove button sits inside the frame at its top right corner. Public surface: `@conciv/ui-kit-chat` exports `CornerRemoveButton` (`label`, `onRemove`), the round remove button drawn in a card's top right corner.
