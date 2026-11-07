---
'@conciv/ai': patch
'@conciv/protocol': patch
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

The server retries a model call when the provider asks to wait before any output. A context overflow now says the conversation is too long for the model and offers to compact it, and a denied or cancelled tool reads as denied or cancelled instead of failed.
