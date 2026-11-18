---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

The host always draws a note's frame: a plugin's `NoteCard` draws only the inside, now shown framed like the host chip, and a taller inside grows the frame. Every staged card that can be removed (a note, a grab card, an image or file chip, a chip that failed to attach) has the same remove button, as opencode draws it: a small round grey badge with a thin white outline and a white X, sitting on the card's top end corner, outside the card's flow, so it takes no room in the card. It shows when the pointer is over the card or focus is inside it, fades in, stays shown on a device without hover, has no tooltip (its accessible name is "Remove" and the card's name), and shows the focus ring around it when reached by keyboard. Public surface: `@conciv/ui-kit-chat` exports `CornerRemoveButton` (`label`, `onRemove`), that remove button; its parent must be a positioned `group`.
