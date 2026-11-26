---
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

A plugin's `ctx.layout.settings('<page>')` now opens that plugin's own settings page, or a host page (`general`, `views`, `shortcuts`, `plugins`, `advanced`); before, every page but `general` did nothing. A page the plugin does not have lands on General.
