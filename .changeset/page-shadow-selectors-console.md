---
'@conciv/page': patch
'@conciv/extension-page': patch
---

Page tools reach into the page's open shadow roots: a selector that matches nothing in the document finds its element inside a web component, and the page snapshot lists shadow content (the widget's own shadow root stays out). `page_press` takes a hotkey binding such as `Mod+Shift+X` and sends its modifiers and key code, so a host hotkey listener fires. The page console records uncaught errors as `uncaught` and unhandled rejections as `unhandled`, with their stacks, and the console card marks either as an error.
