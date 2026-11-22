---
'@conciv/plugin-page': patch
---

A host page with an element named after a built-in object property, such as `<constructor>`, no longer breaks the page snapshot: the role lookup reads only its own tag table.
