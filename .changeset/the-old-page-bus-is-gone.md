---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/db': patch
'@conciv/plugin-page': patch
'@conciv/embed': patch
'@conciv/protocol': patch
'@conciv/plugin': patch
---

The old engine-to-page bus is gone. Page tools run only through the page plugin. The `page.queries`, `page.reply` and `captures.list` procedures, the `.client()` tool binding, the page plane in the widget, and the `tool_captures`, `css_bundles` and `page_changes` tables are removed. A migration drops the tables.
