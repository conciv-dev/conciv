---
'@conciv/embed': patch
'@conciv/extension-page': patch
'@conciv/ui-kit-chat': patch
---

The chat draws the page tools' cards, the page session card and the grabbed element card from the built-in page plugin instead of the old page extension; they look the same as before. The widget no longer mounts the old page extension and `@conciv/embed` no longer depends on `@conciv/extension-page`.

`@conciv/extension-page` no longer exports `pageSessionEntry`, `pageSessionSteps`, `PageSessionStep`, `A11yNodeList`, `PageHtmlBlock`, `PageValueChip`, `A11yNode` or `formatHtml`, and its client entry no longer carries the page tools or the grab attachment.

`nowTitle` in `@conciv/ui-kit-chat` no longer takes a third argument.
