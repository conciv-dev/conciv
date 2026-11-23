---
'@conciv/plugin-page': patch
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

Page tool calls fold through the chat kit's default grouping like any other tool's: the page plugin's own session grouper and its session card are gone (`createPageSessionGrouper` and `pageSessionEntry` leave `@conciv/plugin-page/client`, and `stickyGrouper`, which only that grouper used, leaves `@conciv/ui-kit-chat`). Every page tool now has its own card, `page_fill_form` and `page_queue_async` included.
