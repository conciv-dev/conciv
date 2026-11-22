---
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
---

A failed run shows its error in one place, the inline row under the conversation. The styled thread no longer repeats the error inside the last reply, and the app no longer raises a toast for a failure that row already shows; a send refused before any run still gets its toast.
