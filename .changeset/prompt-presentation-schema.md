---
'@conciv/types': patch
'@conciv/backend-defaults': patch
'@conciv/ui-kit-chat': patch
---

A sent message's notes are read in one way everywhere. `@conciv/types/chat-message-types` exports `NoteCommentSchema` (type `NoteComment`) and `PromptPresentationSchema` (type `PromptPresentation`): the user-message metadata `{displayText, comments, attachments}`, where `comments` must be a list (as opencode reads it), a comment or attachment that does not decode is dropped, and a missing `attachments` list reads as empty. The thread's "You: N notes" label now counts only the notes it can show, and the session title reads the first note that decodes.
