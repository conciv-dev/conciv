---
'@conciv/ai': patch
---

A turn whose tools conciv runs keeps calling the model until it answers, with no step limit, as opencode, instead of stopping silently after 5 model calls.
