---
'@conciv/extension-page': patch
---

Add `@conciv/extension-page`, the home for the page capability as a built-in extension. It joins the
fixed `@conciv/*` set with its declaration split into a server half and a browser half; the page
verbs and their browser bodies move in over the following phases. `@conciv/page` is unchanged and
stays the browser-primitives library those bodies will call into.
