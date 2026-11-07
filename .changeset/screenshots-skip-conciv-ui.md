---
'@conciv/extension': patch
'@conciv/extension-page': patch
'@conciv/extension-design': patch
'@conciv/extension-recorder': patch
'@conciv/page': patch
---

Page screenshots and design captures leave out every piece of conciv UI on the page (the widget, the effects layer and its style tags), not only the widget. The list lives in one place, `CONCIV_UI_SELECTOR` in `@conciv/extension`, and the recorder, element grabs and both capture paths share it.

Captures also keep text that sits on one line on one line. In Firefox, snapdom drew a link like "Home" on a page with `overflow-wrap: anywhere` as "Hom / e": its one-line guard was undone by its own tag reset. A capture plugin now carries that guard down to every element inside the pinned box.
