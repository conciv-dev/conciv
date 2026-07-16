---
'@conciv/solid-streamdown': patch
---

Import rehype-raw and rehype-sanitize statically, matching upstream streamdown. Raw HTML support no longer loads a separate async chunk when `allowRawHtml` is enabled.
