---
'@conciv/backend': patch
'@conciv/ui-kit-chat': patch
---

A turn the agent started that fails before any reply keeps your message in the conversation and shows its error with Retry, instead of a passing "Couldn't load this conversation" and the text back in the composer.

"Couldn't load this conversation" shows only when the conversation's history failed to load: a first message the engine refuses shows its error row with the text back in the composer and a notice that says why, like a later refused message.
