---
'@conciv/extension': patch
'@conciv/extension-page': patch
'@conciv/extension-design': patch
'@conciv/extension-recorder': patch
'@conciv/page': patch
---

Page screenshots and design captures leave out every piece of conciv UI on the page (the widget, the effects layer and its style tags), not only the widget. The list lives in one place, `CONCIV_UI_SELECTOR` in `@conciv/extension`, and the recorder, element grabs and both capture paths share it.
