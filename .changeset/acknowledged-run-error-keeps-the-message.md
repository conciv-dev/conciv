---
'@conciv/ai': patch
'@conciv/ui-kit-chat': patch
---

A turn the agent started that fails before any reply keeps your message in the conversation and shows its error with Retry, instead of a passing "Couldn't load this conversation" and the text back in the composer.

A first message the engine refuses leaves the conversation on its welcome, with the text back in the composer and a notice that says why, instead of "Couldn't load this conversation".
