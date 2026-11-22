---
'@conciv/plugin-page': patch
---

Remove the before/after element previews from the page action and edit cards. Every mutating page call folds into the page session card, which never drew them, so no user could see them.
