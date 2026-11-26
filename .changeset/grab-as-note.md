---
'@conciv/plugin-page': patch
'@conciv/backend-plugin-api': patch
'@conciv/grab': patch
'@conciv/app': patch
---

A grabbed element is now a composer note, as every other note: the composer's grab button runs the first registered `GrabPicker`, and the page plugin's picker picks the element, saves the grab on the engine and attaches a note (origin `page`, `href: page-grab:<id>`) that its own note card draws with the element's picture, in the composer and in the sent message, also after a reload. The grab's picture is now drawn with snapdom, as `page_screenshot` draws, so it is a real image. The model reads the note's sentence (`The user referenced the grabbed <Component> element <snippet> at <file>:<line>:<column>.`) and, as an image part of the same message, the picture. The terminal keeps its own picked grabs: each shows in the terminal toolbar as a chip with a remove button, and Enter pastes them into the CLI and empties the list; the panel view no longer draws a strip of staged grabs.

Public surface: the `GrabApi` contract (`@conciv/frontend-plugin-api/grab`) is deleted. A plugin that wants the user to pick an element calls the `Page` contract's `pick()`, which now resolves the whole `Grab` (text, snippet, source, rect, preview, frames) and attaches nothing; the terminal, the whiteboard's Comment pill and plugins use it. `NoteCard` in `@conciv/frontend-plugin-api` is now an opaque token: its public type shows nothing usable, and only conciv's own plugins draw note cards; a third-party note shows the host chip. `@conciv/grab` drops its `./grab-attachment` entry (`GRAB_MIME`, `grabToFile`, `grabToPayload`, `parseGrabPayload`, `imagePreviewBudget`, `MAX_PAYLOAD_BYTES`) and its `GrabApi` type (`GrabActions` is the picker shape); the engine no longer expands grab attachments, and the chat turn has no attachment expanders. `@conciv/plugin-page/client` no longer exports `pageAttachmentCards` or `fitImagePreview`.
