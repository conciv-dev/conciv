---
'@conciv/embed': patch
---

The notifications region no longer reserves a padded strip above the widget header while empty — zag inlines `display: flex` on the toast group, so the `empty:hidden` class never applied and its padding rendered as a permanent 20px gap.
