---
'@conciv/backend-plugin-api': patch
---

An untrusted page's event stream no longer resubscribes every second: a refusal with UNAUTHORIZED waits for the browser to be trusted and subscribes then, with no retry log.
