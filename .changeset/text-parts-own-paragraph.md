---
'@conciv/ui-kit-chat': patch
'@conciv/backend-defaults': patch
---

An attached text file and the plugin instructions update now start their own paragraph in what the model reads. The chat library joins text parts with nothing between them, so each of these parts now carries its own blank line in front, and the sent message bubble shows the typed text, a blank line, then the attachment.
