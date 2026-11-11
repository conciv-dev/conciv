---
'@conciv/ui-kit-chat': patch
---

Code highlight and diagram caches free the entries they drop, so a long chat with many code blocks no longer keeps one tracking signal per block it ever rendered.
