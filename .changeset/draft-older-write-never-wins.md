---
'@conciv/ui-kit-chat': patch
---

A composer draft write that started earlier no longer stores after a later one: a draft with a file, flushed just before the message was sent, used to land after the cleared draft and bring the sent text back on the next load.
