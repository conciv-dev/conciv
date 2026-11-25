---
'@conciv/app': patch
'@conciv/ui-kit-chat': patch
---

The chat draws the page tools' cards, the page session card and the grabbed element card from the built-in page plugin instead of the old page extension; they look the same as before. The widget no longer mounts the old page extension. When a user plugin and a built-in plugin both draw a card for the same tool, the user plugin's card is shown.

`nowTitle` in `@conciv/ui-kit-chat` no longer takes a third argument.
