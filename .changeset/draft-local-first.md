---
'@conciv/ui-kit-chat': patch
---

The composer takes an optional `draftWriter` (type `ComposerDraftWriter`, synchronous, returns nothing). When it is set, every draft change, attachments included as `File`s, is handed to it at once, and the composer's own debounced storage write is not used.
