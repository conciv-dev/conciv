---
'@conciv/extension-page': patch
'@conciv/core': patch
---

Steer the agent off `page.eval` and onto the typed page verbs. `page.eval` now declares `approval: 'ask'`, so running arbitrary script in the live page costs a user decision on every surface (chat, `/api/mcp`, `registry.call`) instead of being free. `page.snapshot` is described by what it answers — every control with its current value, checked state and ref — so form work finds it. A new `page.reload` verb reloads the live page and resolves the moment the reload is initiated, since the navigation destroys the context it ran in. The page extension now contributes a standing prompt naming the dedicated read/act/edit-live verbs and calling eval the last resort. The capability catalog's search now matches on each declaration's hand-curated keywords and its full description (hints included), not just name, summary and category.
