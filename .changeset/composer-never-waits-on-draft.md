---
'@conciv/app': patch
'@conciv/ui-kit-tap': patch
---

The chat composer renders at once instead of waiting for the saved draft; a draft that arrives later fills an untouched composer and merges its attachments into one the user already typed in. The session list no longer refetches on every window focus or cancels an in-flight load when it is invalidated.
