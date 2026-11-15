---
'@conciv/ui-kit-chat': patch
'@conciv/chat': patch
'@conciv/embed': patch
---

A note a plugin attaches now shows as a card in the composer, before the attachments: the plugin's own `NoteCard` for its origin when it draws one, and the host's card (the comment, and the note's icon with its subtitle or label) when it draws nothing or fails. Each card has a remove button. When the message is sent, the model reads one sentence per note after the typed text, and the message's metadata carries `displayText`, `comments` and `attachments` at its top level, as opencode does, so a plugin's `prompt` hook reads the notes from it. The conversation and the session title show what the user typed, with the notes as cards under it (five, then Show more), also after a reload. A refused send keeps the notes in the composer. The chat kit's `onSend` handler now receives the draft beside the content, and a draft of items alone can be sent.
