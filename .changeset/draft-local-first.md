---
'@conciv/ui-kit-chat': patch
---

The composer takes an optional `draftWriter` (type `ComposerDraftWriter`, synchronous, returns nothing). When it is set, every draft change, attachments included as `File`s, is handed to it at once, and the composer's own debounced storage write is not used.

Attachments carry an optional `blob: {id, url}`, a host's reference to where it stored the attachment's bytes, as opencode's image attachment part does. The kit never reads it; it travels with the attachment through upsert, a refused send's put-back and restore.

A new entry, `@conciv/ui-kit-chat/draft-storage`, exports `encodeAttachments`, the encoder the composer uses to store draft attachments, and it loads under node.

An attachment whose bytes cannot be read is still left out of the stored draft, and the encoder now logs it with `console.error`, naming the file, instead of dropping it silently.
