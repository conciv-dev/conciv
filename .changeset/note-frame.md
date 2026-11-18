---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

The host always draws a note's frame: a plugin's `NoteCard` draws only the inside, now shown framed like the host chip, a taller inside grows the frame, and a staged note's remove button sits inside the frame at its top right corner, in space the frame keeps for it. The remove button of a staged note or attachment shows when the pointer is over the card or focus is inside it, and stays shown on a device without hover. It is a small, quiet glyph with no fill or shadow at rest, a subtle fill and the danger colour on its own hover, and its focus ring drawn inside its box, so neither the button nor its ring covers the card's text. Public surface: `@conciv/ui-kit-chat` exports `CornerRemoveButton` (`label`, `onRemove`), the small remove button drawn in a card's top right corner.
